#!/usr/bin/env python3
"""Convert the Ministry's 2027 fertilizer workbook to compact GeoFarm JSON."""
import json
import re
import sys
import zipfile
from xml.etree.ElementTree import iterparse

SOURCE = "https://erdkk25.pertanian.go.id/uploads/ref/Dosis_2027_Semua_Komoditas_Subsidi.xlsx"
NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"


def shared_strings(archive):
    with archive.open("xl/sharedStrings.xml") as stream:
        return [
            "".join(node.text or "" for node in item.iter(NS + "t"))
            for _, item in iterparse(stream, events=("end",))
            if item.tag == NS + "si"
        ]


def column_index(cell_ref):
    letters = re.match(r"[A-Z]+", cell_ref).group(0)
    value = 0
    for char in letters:
        value = value * 26 + ord(char) - 64
    return value - 1


def main():
    source_path = sys.argv[1]
    output_path = sys.argv[2]
    subsectors, commodities = [], []
    sub_idx, commodity_idx = {}, {}
    records = []

    with zipfile.ZipFile(source_path) as archive:
        strings = shared_strings(archive)
        with archive.open("xl/worksheets/sheet1.xml") as stream:
            for _, row in iterparse(stream, events=("end",)):
                if row.tag != NS + "row" or row.attrib.get("r") == "1":
                    continue
                values = [""] * 16
                for cell in row.findall(NS + "c"):
                    value = cell.find(NS + "v")
                    if value is None:
                        continue
                    raw = value.text or ""
                    if cell.attrib.get("t") == "s":
                        raw = strings[int(raw)]
                    values[column_index(cell.attrib["r"])] = raw

                if not values[8]:
                    row.clear()
                    continue
                subsector = values[7]
                commodity = values[8]
                if subsector not in sub_idx:
                    sub_idx[subsector] = len(subsectors)
                    subsectors.append(subsector)
                if commodity not in commodity_idx:
                    commodity_idx[commodity] = len(commodities)
                    commodities.append(commodity)

                doses = [
                    float(values[i]) if values[i] and values[i] != "#N/A" else None
                    for i in range(9, 16)
                ]
                records.append([
                    values[1], values[3].zfill(4), values[5].zfill(6),
                    sub_idx[subsector], commodity_idx[commodity], *doses,
                ])
                row.clear()

    payload = {
        "source": SOURCE,
        "year": 2027,
        "fields": ["urea", "sp36", "za", "npk", "organik", "npk_formula", "poc"],
        "subsectors": subsectors,
        "commodities": commodities,
        "rows": records,
    }
    with open(output_path, "w", encoding="utf-8") as output:
        json.dump(payload, output, ensure_ascii=False, separators=(",", ":"))
    print(f"Wrote {len(records):,} records, {len(commodities)} commodities to {output_path}")


if __name__ == "__main__":
    main()
