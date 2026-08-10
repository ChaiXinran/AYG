#!/usr/bin/env python3
"""Convert an artist workbook into the shared Event Earth data module."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import zipfile
from collections import OrderedDict
from pathlib import Path
from xml.etree import ElementTree as ET

from convert_events import NS, read_xlsx, text

GENERATED_MARKER = "// 此文件由 tools/convert_artist_workbook.py 自动生成，请勿手工编辑。"

EVENT_COLUMNS = {
    "title": ("演出/活动名称", "剧目名称"),
    "batch": ("批次/活动类型", "巡演批次"),
    "country": ("国家",), "city": ("城市",), "venue": ("场馆",),
    "coordinates": ("经纬度",), "duty": ("承担任务",),
    "role": ("角色/演唱内容",), "date": ("日期",),
    "time": ("场次（开始时间）",), "sources": ("信息来源链接",),
    "media": ("媒体信息（官方图片/返场视频/采访/小剧场宣传/相关vlog链接）", "媒体信息（图片/返场视频链接）"),
    "description": ("简单描述",), "summary": ("剧目/活动简介", "该巡演批次简介"),
}

ACTIVITY_SHEETS = {
    "音乐剧": "音乐剧",
    "话剧": "话剧",
    "演唱会／gala": "音乐会",
    "演唱会/gala": "音乐会",
    "晚会": "晚会",
    "综艺": "综艺",
    "商务": "商务活动",
    "商务活动": "商务活动",
}

COLLECTION_SCHEMAS = {
    "screenWorks": {
        "sheets": ("影视作品",),
        "export": "screenWorks", "header": "作品名称",
        "fields": {"title": "作品名称", "type": "类别", "year": "首播/上映年份", "role": "__artist_role__",
                   "participation": "参演性质", "date": "首播/上映日期", "status": "__status__",
                   "platform": "播出/发行平台", "creators": "导演/主创", "notes": "单元/备注",
                   "sourceUrls": "信息来源链接", "description": "作品简介"},
    },
    "soundtracks": {
        "sheets": ("OST", "OST及原声"),
        "export": "soundtracks", "header": "歌曲名称",
        "fields": {"year": "年份", "date": "发行日期", "title": "歌曲名称", "relatedWork": "关联作品/项目",
                   "workType": "作品类型", "placement": "歌曲定位", "performance": "演唱形式",
                   "collaborators": "合作歌手", "release": "收录/发行形式", "category": "分类",
                   "sourceUrls": "信息来源链接", "notes": "备注"},
    },
    "singles": {
        "sheets": ("单曲",),
        "export": "singles", "header": "歌曲名称",
        "fields": {"year": "年份", "date": "发行日期", "title": "歌曲名称", "type": "单曲类型",
                   "performance": "演唱形式", "collaborators": "合作歌手/参与者", "purpose": "关联企划/用途",
                   "release": "收录/发行形式", "platform": "发行/平台", "sourceUrls": "信息来源链接", "notes": "备注"},
    },
}


def sheet_names(source: Path) -> list[str]:
    with zipfile.ZipFile(source) as archive:
        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
    return [sheet.attrib["name"] for sheet in workbook.findall("m:sheets/m:sheet", NS)]


def pick(record: dict[str, str], aliases: tuple[str, ...]) -> str:
    return next((record.get(name, "") for name in aliases if name in record), "")


def first_date(value: str) -> str:
    match = re.search(r"\d{4}-\d{2}-\d{2}", value)
    return match.group(0) if match else ""


def last_date(value: str) -> str:
    matches = re.findall(r"\d{4}-\d{2}-\d{2}", value)
    return matches[-1] if matches else ""


def coordinates(value: str) -> tuple[float, float] | None:
    match = re.fullmatch(r"\s*(-?\d+(?:\.\d+)?)\s*[,，]\s*(-?\d+(?:\.\d+)?)\s*", value)
    if not match:
        return None
    lon, lat = map(float, match.groups())
    return (lon, lat) if -180 <= lon <= 180 and -90 <= lat <= 90 else None


def links(value: str) -> list[str]:
    return list(dict.fromkeys(item.strip() for item in re.split(r"[\r\n]+", value) if item.strip()))


def category_for(title: str, batch: str, description: str) -> str:
    value = f"{title} {batch} {description}"
    if "音乐剧" in value: return "音乐剧"
    if "音乐会" in value or "演唱会" in value: return "音乐会"
    if any(word in value for word in ("综艺", "录制", "节目", "歌手")): return "综艺"
    if any(word in value for word in ("晚会", "盛典", "庆典", "颁奖", "之夜")): return "晚会"
    if any(word in value for word in ("话剧", "舞台剧")): return "话剧"
    if any(word in value for word in ("商务", "品牌", "发布会", "代言", "推广", "开幕", "论坛")): return "商务活动"
    return "其他"


def convert_events(source: Path, sheet: str, artist_id: str, artist_name: str, forced_category: str | None = None) -> tuple[list[dict], list[dict]]:
    rows = read_xlsx(source, sheet)
    header_index = next((index for index, row in enumerate(rows)
                         if any(alias in [text(value) for value in row] for alias in EVENT_COLUMNS["title"])), None)
    if header_index is None:
        raise ValueError(f"工作表“{sheet}”中未找到活动表头")
    headers = [text(value) for value in rows[header_index]]
    missing = [aliases[0] for aliases in EVENT_COLUMNS.values() if not any(name in headers for name in aliases)
               and aliases[0] not in ("承担任务", "角色/演唱内容")]
    if missing:
        raise ValueError("活动工作表缺少列：" + "、".join(missing))
    groups: OrderedDict[tuple, dict] = OrderedDict()
    unmapped: list[dict] = []
    for row_no, values in enumerate(rows[header_index + 1:], header_index + 2):
        values += [""] * (len(headers) - len(values))
        raw = {header: text(values[index]) for index, header in enumerate(headers)}
        record = {key: pick(raw, aliases) for key, aliases in EVENT_COLUMNS.items()}
        if not record["title"]: continue
        point = coordinates(record["coordinates"])
        session = {"date": first_date(record["date"]), "endDate": last_date(record["date"]),
                   "dateLabel": record["date"], "time": record["time"]}
        item = {"title": record["title"], "tourBatch": record["batch"], "country": record["country"],
                "city": record["city"], "venue": record["venue"],
                "category": forced_category or category_for(record["title"], record["batch"], record["description"]),
                "artistId": artist_id, "artist": artist_name, "duty": record["duty"],
                "role": record["role"] or record["duty"] or artist_name, "description": record["description"],
                "tourSummary": record["summary"], "sessions": [session], "sourceUrls": links(record["sources"]),
                "mediaUrls": links(record["media"]), "sourceRows": [row_no]}
        if point is None:
            item["locationStatus"] = "待补充经纬度"; unmapped.append(item); continue
        lon, lat = point
        key = (item["category"], item["title"], item["tourBatch"], item["country"], item["city"], item["venue"], lon, lat)
        if key not in groups:
            digest = hashlib.sha1((artist_id + "|" + "|".join(map(str, key))).encode()).hexdigest()[:10]
            item.update({"id": f"{artist_id}-{session['date'][:4] or 'unknown'}-{digest}", "lon": lon, "lat": lat})
            groups[key] = item
        else:
            current = groups[key]
            if session not in current["sessions"]: current["sessions"].append(session)
            for field in ("sourceUrls", "mediaUrls"):
                current[field] = list(dict.fromkeys(current[field] + item[field]))
            current["sourceRows"].append(row_no)
    mapped = list(groups.values())
    for item in mapped:
        item["dates"] = [{"date": s["date"], "endDate": s["endDate"], "time": s["time"]} for s in item["sessions"] if s["date"]]
        item["date"] = item["dates"][0]["date"] if item["dates"] else ""
        item["endDate"] = max((d["endDate"] for d in item["dates"]), default=item["date"])
        item["year"] = int(item["date"][:4]) if item["date"] else None
        item["dateLabel"] = " / ".join(f"{s['dateLabel']} {s['time']}".strip() for s in item["sessions"])
    return mapped, unmapped


def convert_collection(source: Path, sheet: str, schema: dict) -> list[dict]:
    rows = read_xlsx(source, sheet)
    header_index = next((i for i, row in enumerate(rows) if schema["header"] in [text(v) for v in row]), None)
    if header_index is None: return []
    headers = [text(value) for value in rows[header_index]]
    result = []
    for values in rows[header_index + 1:]:
        values += [""] * (len(headers) - len(values))
        raw = {header: text(values[index]) for index, header in enumerate(headers)}
        if not raw.get(schema["header"]): continue
        def field_value(label: str) -> str:
            if label == "__artist_role__":
                return next((value for header, value in raw.items() if header.endswith("角色")), "")
            if label == "__status__":
                return next((value for header, value in raw.items() if header.startswith("状态")), "")
            return raw.get(label, "")
        item = {key: field_value(label) for key, label in schema["fields"].items()}
        if "sourceUrls" in item: item["sourceUrls"] = links(item["sourceUrls"])
        result.append(item)
    return result


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path); parser.add_argument("output", type=Path)
    parser.add_argument("--artist-id", required=True); parser.add_argument("--artist-name", required=True)
    args = parser.parse_args()
    names = sheet_names(args.source)
    activity_sheets = [(name, ACTIVITY_SHEETS[name]) for name in names if name in ACTIVITY_SHEETS]
    if not activity_sheets:
        fallback = "公开演出活动汇总" if "公开演出活动汇总" in names else names[0]
        activity_sheets = [(fallback, None)]
    events, unmapped = [], []
    for sheet, category in activity_sheets:
        sheet_events, sheet_unmapped = convert_events(args.source, sheet, args.artist_id, args.artist_name, category)
        events.extend(sheet_events); unmapped.extend(sheet_unmapped)
    events.sort(key=lambda item: (item.get("date", ""), item.get("title", "")))
    collections = {}
    for schema in COLLECTION_SCHEMAS.values():
        sheet = next((candidate for candidate in schema["sheets"] if candidate in names), None)
        collections[schema["export"]] = convert_collection(args.source, sheet, schema) if sheet else []
    payload = GENERATED_MARKER + "\n" + f"export const artist = {json.dumps({'id': args.artist_id, 'name': args.artist_name}, ensure_ascii=False)};\n"
    payload += f"export const events = {json.dumps(events, ensure_ascii=False, indent=2)};\n\n"
    payload += f"export const unmappedEvents = {json.dumps(unmapped, ensure_ascii=False, indent=2)};\n\n"
    for key, values in collections.items(): payload += f"export const {key} = {json.dumps(values, ensure_ascii=False, indent=2)};\n\n"
    args.output.parent.mkdir(parents=True, exist_ok=True); args.output.write_text(payload, encoding="utf-8")
    print(f"{args.artist_name}: {len(events)} 个地图节点，{len(unmapped)} 条待定位，" + "，".join(f"{k} {len(v)} 条" for k, v in collections.items()))
    return 0


if __name__ == "__main__": sys.exit(main())
