#!/usr/bin/env python3
"""Legacy converter for archived annual Ayanga workbooks.

The live site no longer imports this converter's output. Use
tools/convert_artist_workbook.py with the full-category workbook instead.
"""

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

HEADERS = [
    "剧目名称", "巡演批次", "国家", "城市", "场馆", "经纬度", "日期",
    "场次（开始时间）", "信息来源链接", "媒体信息（图片/返场视频链接）",
    "简单描述", "该巡演批次简介",
]
GENERATED_MARKER = "// 此文件由 tools/convert_ayanga_schedule.py 自动生成，请勿手工编辑。"


def first_sheet_name(source: Path) -> str:
    with zipfile.ZipFile(source) as archive:
        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
    sheet = workbook.find("m:sheets/m:sheet", NS)
    if sheet is None:
        raise ValueError("工作簿中没有工作表")
    return sheet.attrib["name"]


def infer_artist(source: Path) -> str:
    stem = re.sub(r"(?:19|20)\d{2}.*$", "", source.stem).strip(" _-—")
    return stem or "待补充"


def stable_id(item: dict, lon: float, lat: float) -> str:
    identity = "|".join((item["title"], item["tourBatch"], item["country"], item["city"], item["venue"], str(lon), str(lat)))
    year = first_date(item["sessions"][0]["dateLabel"])[:4] or "unknown"
    digest = hashlib.sha1(identity.encode("utf-8")).hexdigest()[:10]
    return f"schedule-{year}-{digest}"


def parse_coordinates(value: object) -> tuple[float, float] | None:
    match = re.fullmatch(r"\s*(-?\d+(?:\.\d+)?)\s*[,，]\s*(-?\d+(?:\.\d+)?)\s*", text(value))
    if not match:
        return None
    lon, lat = map(float, match.groups())
    return (lon, lat) if -180 <= lon <= 180 and -90 <= lat <= 90 else None


def first_date(value: str) -> str:
    match = re.search(r"\d{4}-\d{2}-\d{2}", value)
    return match.group(0) if match else ""


def category_for(title: str, batch: str, description: str) -> str:
    haystack = f"{title} {batch} {description}"
    if "音乐剧" in haystack:
        return "音乐剧"
    if "音乐会" in haystack:
        return "音乐会"
    if any(word in haystack for word in ("综艺", "歌手", "披荆斩棘", "有歌", "天籁与少年", "节目录制")):
        return "综艺"
    if any(word in haystack for word in ("晚会", "盛典", "之夜", "庆典", "颁奖")):
        return "晚会"
    return "其他"


def unique_extend(target: list[str], raw: str) -> None:
    for item in re.split(r"[\n\r]+", raw):
        item = item.strip()
        if item and item not in target:
            target.append(item)


def convert(source: Path) -> tuple[list[dict], list[dict]]:
    rows = read_xlsx(source, first_sheet_name(source))
    if not rows:
        raise ValueError("工作表为空")
    headers = [text(value) for value in rows[0]]
    missing = [header for header in HEADERS if header not in headers]
    if missing:
        raise ValueError("缺少列：" + "、".join(missing))

    artist = infer_artist(source)
    groups: OrderedDict[tuple, dict] = OrderedDict()
    unmapped: list[dict] = []
    for row_no, values in enumerate(rows[1:], start=2):
        values += [""] * (len(headers) - len(values))
        record = {header: text(values[index]) for index, header in enumerate(headers)}
        if not any(record.values()):
            continue
        coords = parse_coordinates(record["经纬度"])
        session = {
            "date": first_date(record["日期"]),
            "dateLabel": record["日期"],
            "time": record["场次（开始时间）"],
        }
        base = {
            "title": record["剧目名称"],
            "tourBatch": record["巡演批次"],
            "country": record["国家"],
            "city": record["城市"],
            "venue": record["场馆"],
            "category": category_for(record["剧目名称"], record["巡演批次"], record["简单描述"]),
            "artist": artist,
            "role": artist,
            "description": record["简单描述"],
            "tourSummary": record["该巡演批次简介"],
            "sessions": [session],
            "sourceUrls": [],
            "mediaUrls": [],
            "sourceRows": [row_no],
        }
        unique_extend(base["sourceUrls"], record["信息来源链接"])
        unique_extend(base["mediaUrls"], record["媒体信息（图片/返场视频链接）"])
        if coords is None:
            base["locationStatus"] = "待补充经纬度"
            unmapped.append(base)
            continue

        lon, lat = coords
        key = (base["title"], base["tourBatch"], base["country"], base["city"], base["venue"], lon, lat)
        if key not in groups:
            base.update({"id": stable_id(base, lon, lat), "lon": lon, "lat": lat})
            groups[key] = base
        else:
            item = groups[key]
            if session not in item["sessions"]:
                item["sessions"].append(session)
            unique_extend(item["sourceUrls"], record["信息来源链接"])
            unique_extend(item["mediaUrls"], record["媒体信息（图片/返场视频链接）"])
            item["sourceRows"].append(row_no)

    mapped = list(groups.values())
    for item in mapped:
        item["dates"] = [{"date": s["date"], "time": s["time"]} for s in item["sessions"] if s["date"]]
        item["date"] = item["dates"][0]["date"] if item["dates"] else ""
        item["year"] = int(item["date"][:4]) if item["date"] else None
        item["dateLabel"] = " / ".join(
            f"{s['dateLabel']} {s['time']}".strip() for s in item["sessions"]
        )
    return mapped, unmapped


def update_site_registry(output: Path) -> int:
    """Register every generated schedule module under src/data with the site."""
    project_root = Path(__file__).resolve().parent.parent
    data_dir = (project_root / "src" / "data").resolve()
    resolved_output = output.resolve()
    if resolved_output.parent != data_dir:
        raise ValueError(
            f"要自动接入网站，输出文件必须直接放在 {data_dir}；当前输出为 {resolved_output}"
        )

    modules = []
    for candidate in sorted(data_dir.glob("*.js"), key=lambda path: path.name.lower()):
        if candidate.name == "scheduleRegistry.js":
            continue
        try:
            first_line = candidate.open("r", encoding="utf-8").readline().strip()
        except UnicodeDecodeError:
            continue
        if first_line == GENERATED_MARKER:
            modules.append(candidate)

    imports = []
    mapped = []
    unmapped = []
    for index, module in enumerate(modules):
        imports.append(
            f"import {{ scheduleEvents as mapped{index}, unmappedEvents as unmapped{index} }} "
            f"from './{module.name}';"
        )
        mapped.append(f"...mapped{index}")
        unmapped.append(f"...unmapped{index}")

    registry = (
        GENERATED_MARKER + "\n"
        + "\n".join(imports)
        + "\n\nexport const scheduleEvents = [" + ", ".join(mapped) + "];\n"
        + "export const unmappedEvents = [" + ", ".join(unmapped) + "];\n"
    )
    (data_dir / "scheduleRegistry.js").write_text(registry, encoding="utf-8")
    return len(modules)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    mapped, unmapped = convert(args.source)
    payload = (
        GENERATED_MARKER + "\n"
        "export const scheduleEvents = " + json.dumps(mapped, ensure_ascii=False, indent=2) + ";\n\n"
        "export const unmappedEvents = " + json.dumps(unmapped, ensure_ascii=False, indent=2) + ";\n"
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(payload, encoding="utf-8")
    registered = update_site_registry(args.output)
    print(
        f"已生成 {len(mapped)} 个地图结点；{len(unmapped)} 条记录待补充经纬度；"
        f"网站已自动接入 {registered} 个年度数据文件。"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
