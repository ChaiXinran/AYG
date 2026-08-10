#!/usr/bin/env python3
"""Convert the Event Earth collection workbook into validated JSON.

No third-party packages are required. The reader intentionally supports the
simple .xlsx features used by the project template (values, shared strings,
dates and booleans), making it suitable for contributors' machines.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import re
import sys
import unicodedata
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
      "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships"}
REL_NS = {"p": "http://schemas.openxmlformats.org/package/2006/relationships"}

SHEET_NAME = "演出场次"
CATEGORIES = {"音乐剧", "戏剧", "音乐会", "演唱会", "综艺录制", "晚会", "颁奖典礼", "节庆活动", "其他"}
REQUIRED = ["节点ID", "活动名称", "活动类别", "演出日期", "国家代码", "国家或地区", "城市", "场馆", "经度", "纬度"]


def col_index(cell_ref: str) -> int:
    letters = re.match(r"[A-Z]+", cell_ref).group(0)
    value = 0
    for char in letters:
        value = value * 26 + ord(char) - 64
    return value - 1


def excel_date(value: str) -> str:
    moment = dt.datetime(1899, 12, 30) + dt.timedelta(days=float(value))
    return moment.date().isoformat()


def read_xlsx(path: Path, sheet_name: str) -> list[list[object]]:
    with zipfile.ZipFile(path) as archive:
        shared: list[str] = []
        if "xl/sharedStrings.xml" in archive.namelist():
            root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
            for item in root.findall("m:si", NS):
                shared.append("".join(t.text or "" for t in item.iterfind(".//m:t", NS)))

        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        rels = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        targets = {rel.attrib["Id"]: rel.attrib["Target"] for rel in rels.findall("p:Relationship", REL_NS)}
        sheet_path = None
        for sheet in workbook.find("m:sheets", NS):
            if sheet.attrib.get("name") == sheet_name:
                target = targets[sheet.attrib[f"{{{NS['r']}}}id"]].lstrip("/")
                sheet_path = target if target.startswith("xl/") else f"xl/{target}"
                break
        if not sheet_path:
            raise ValueError(f"找不到工作表：{sheet_name}")

        root = ET.fromstring(archive.read(sheet_path))
        rows: list[list[object]] = []
        for row in root.findall(".//m:sheetData/m:row", NS):
            values: list[object] = []
            for cell in row.findall("m:c", NS):
                index = col_index(cell.attrib["r"])
                while len(values) <= index:
                    values.append("")
                cell_type = cell.attrib.get("t")
                raw = cell.findtext("m:v", default="", namespaces=NS)
                if cell_type == "s" and raw:
                    # Standard Excel stores a shared-string index here. Some
                    # generators write the string value directly with t="s".
                    value: object = shared[int(raw)] if raw.isdigit() and int(raw) < len(shared) else raw
                elif cell_type == "str":
                    value = raw
                elif cell_type == "inlineStr":
                    value = "".join(t.text or "" for t in cell.iterfind(".//m:t", NS))
                elif cell_type == "b":
                    value = raw == "1"
                elif raw == "":
                    value = ""
                else:
                    value = float(raw) if "." in raw else int(raw)
                    style = int(cell.attrib.get("s", 0))
                    if style > 0 and isinstance(value, (int, float)) and 1 <= float(value) <= 100000:
                        # Template dates are exported as Excel serials; only date columns
                        # are converted later by header name to avoid guessing other numbers.
                        pass
                values[index] = value
            rows.append(values)
        return rows


def text(value: object) -> str:
    return str(value).strip() if value not in (None, "") else ""


def slug(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value).lower().strip()
    cleaned = re.sub(r"[^\w\u4e00-\u9fff]+", "-", normalized, flags=re.UNICODE).strip("-")
    return cleaned or hashlib.sha1(value.encode("utf-8")).hexdigest()[:10]


def entity_id(prefix: str, *parts: str) -> str:
    return prefix + "_" + "_".join(slug(part) for part in parts if part)


def split_list(value: object) -> list[str]:
    return [part.strip() for part in re.split(r"[|｜]", text(value)) if part.strip()]


def parse_json_object(value: object, row_no: int, errors: list[str]) -> dict:
    raw = text(value)
    if not raw:
        return {}
    try:
        result = json.loads(raw)
        if not isinstance(result, dict):
            raise ValueError("必须是 JSON 对象")
        return result
    except (json.JSONDecodeError, ValueError) as exc:
        errors.append(f"第 {row_no} 行：扩展信息JSON 无效（{exc}）")
        return {}


def iso_date(value: object) -> str:
    if isinstance(value, (int, float)):
        return excel_date(str(value))
    raw = text(value)
    if not raw:
        return ""
    return dt.date.fromisoformat(raw[:10]).isoformat()


def convert(rows: list[list[object]]) -> tuple[dict, list[str], list[str]]:
    if len(rows) < 3:
        raise ValueError("工作表没有表头或数据")
    headers = [text(v) for v in rows[2]]
    missing_headers = [name for name in REQUIRED if name not in headers]
    if missing_headers:
        raise ValueError("缺少必要列：" + "、".join(missing_headers))

    records, errors, warnings = [], [], []
    for row_no, values in enumerate(rows[3:], start=4):
        padded = values + [""] * (len(headers) - len(values))
        row = dict(zip(headers, padded))
        if not any(text(v) for v in padded):
            continue
        missing = [name for name in REQUIRED if not text(row.get(name))]
        if missing:
            errors.append(f"第 {row_no} 行：必填项为空：{'、'.join(missing)}")
            continue
        try:
            date = iso_date(row["演出日期"])
            lon, lat = float(row["经度"]), float(row["纬度"])
        except (TypeError, ValueError) as exc:
            errors.append(f"第 {row_no} 行：日期或经纬度格式错误（{exc}）")
            continue
        if not (-180 <= lon <= 180 and -90 <= lat <= 90):
            errors.append(f"第 {row_no} 行：经纬度超出范围")
            continue
        category = text(row["活动类别"])
        if category not in CATEGORIES:
            errors.append(f"第 {row_no} 行：未知活动类别“{category}”")
            continue
        event_id = text(row["节点ID"])
        records.append({
            "row": row_no, "id": event_id, "title": text(row["活动名称"]), "category": category,
            "date": date, "startTime": text(row.get("开始时间")), "endTime": text(row.get("结束时间")),
            "countryCode": text(row["国家代码"]).upper(), "country": text(row["国家或地区"]),
            "province": text(row.get("省州")), "city": text(row["城市"]), "venue": text(row["场馆"]),
            "address": text(row.get("场馆地址")), "lon": lon, "lat": lat,
            "workTitle": text(row.get("作品名称")), "productionTitle": text(row.get("制作版本")),
            "role": text(row.get("角色或身份")), "people": split_list(row.get("演员嘉宾")),
            "tags": split_list(row.get("标签")), "description": text(row.get("简介")),
            "officialUrl": text(row.get("官方链接")), "posterUrl": text(row.get("海报链接")),
            "sourceUrl": text(row.get("信息来源链接")), "sourceNote": text(row.get("来源说明")),
            "status": text(row.get("数据状态")) or "draft", "extras": parse_json_object(row.get("扩展信息JSON"), row_no, errors),
        })

    grouped: dict[str, list[dict]] = {}
    for item in records:
        grouped.setdefault(item["id"], []).append(item)
        if not item["sourceUrl"]:
            warnings.append(f"第 {item['row']} 行：建议填写信息来源链接")

    identity_fields = ["title", "category", "countryCode", "country", "province", "city", "venue", "workTitle", "productionTitle"]
    for event_id, group in grouped.items():
        first = group[0]
        for item in group[1:]:
            different = [field for field in identity_fields if item[field] != first[field]]
            if different:
                errors.append(f"第 {item['row']} 行：同一节点ID“{event_id}”的节点字段不一致：{'、'.join(different)}")
        session_keys: set[tuple[str, str]] = set()
        for item in group:
            key = (item["date"], item["startTime"])
            if key in session_keys:
                errors.append(f"第 {item['row']} 行：节点“{event_id}”存在重复场次 {item['date']} {item['startTime']}")
            session_keys.add(key)

    works, productions, venues, events, nodes = {}, {}, {}, [], []
    for event_id, group in grouped.items():
        item = group[0]
        venue_id = entity_id("venue", item["countryCode"], item["city"], item["venue"])
        venues.setdefault(venue_id, {"id": venue_id, "name": item["venue"], "countryCode": item["countryCode"],
                                       "country": item["country"], "province": item["province"], "city": item["city"],
                                       "address": item["address"], "longitude": item["lon"], "latitude": item["lat"]})
        work_id = production_id = None
        if item["workTitle"]:
            work_id = entity_id("work", item["workTitle"])
            works.setdefault(work_id, {"id": work_id, "title": item["workTitle"]})
        if item["productionTitle"]:
            production_id = entity_id("production", item["productionTitle"])
            productions.setdefault(production_id, {"id": production_id, "workId": work_id, "title": item["productionTitle"]})
        sessions = sorted([
            {"date": row["date"], "startTime": row["startTime"] or None, "endTime": row["endTime"] or None,
             "sourceUrl": row["sourceUrl"] or None}
            for row in group
        ], key=lambda session: (session["date"], session["startTime"] or ""))
        event = {"id": item["id"], "title": item["title"], "category": item["category"], "workId": work_id,
                 "productionId": production_id, "venueId": venue_id, "sessions": sessions,
                 "startDate": sessions[0]["date"], "endDate": sessions[-1]["date"],
                 "role": item["role"] or None, "people": item["people"],
                 "tags": item["tags"], "description": item["description"], "officialUrl": item["officialUrl"] or None,
                 "posterUrl": item["posterUrl"] or None, "source": {"url": item["sourceUrl"] or None, "note": item["sourceNote"] or None},
                 "status": item["status"], "extras": item["extras"]}
        events.append(event)
        nodes.append({"id": item["id"], "title": item["title"], "category": item["category"],
                      "year": int(sessions[0]["date"][:4]), "startDate": sessions[0]["date"], "endDate": sessions[-1]["date"],
                      "sessions": sessions, "sessionCount": len(sessions),
                      "country": item["country"], "countryCode": item["countryCode"], "city": item["city"],
                      "venue": item["venue"], "lon": item["lon"], "lat": item["lat"],
                      "description": item["description"], "tags": item["tags"], "extras": item["extras"]})

    output = {"schemaVersion": 1, "generatedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
              "entities": {"works": list(works.values()), "productions": list(productions.values()),
                           "venues": list(venues.values()), "events": events}, "nodes": nodes}
    return output, errors, warnings


def main() -> int:
    parser = argparse.ArgumentParser(description="将演出采集 Excel 转为 Event Earth JSON")
    parser.add_argument("input", type=Path, help="输入 .xlsx 文件")
    parser.add_argument("-o", "--output", type=Path, default=Path("src/data/generated/events.json"), help="输出 JSON")
    parser.add_argument("--allow-errors", action="store_true", help="即使存在校验错误也写出可用记录")
    args = parser.parse_args()
    try:
        payload, errors, warnings = convert(read_xlsx(args.input, SHEET_NAME))
    except (OSError, ValueError, zipfile.BadZipFile) as exc:
        print(f"转换失败：{exc}", file=sys.stderr)
        return 2
    for warning in warnings:
        print("警告：" + warning)
    for error in errors:
        print("错误：" + error, file=sys.stderr)
    if errors and not args.allow_errors:
        print(f"发现 {len(errors)} 个错误，未写出 JSON。", file=sys.stderr)
        return 1
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"已写出 {len(payload['entities']['events'])} 个 Event、{len(payload['nodes'])} 个地图节点：{args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
