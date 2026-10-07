"""Build clipped, browseable HWSD v2.01 tiles and unit lookup for Indonesia.

Inputs are the official FAO HWSD2_RASTER.zip, the FAO HWSD2_DB.zip (or its
HWSD2_SMU.csv export), and assets/data/bps/geojson/provinsi.geojson.
"""
import argparse
import csv
import json
import math
import os
import sysconfig
import zipfile
from collections import Counter
from pathlib import Path

import numpy as np
# Prefer rasterio's bundled PROJ database over an older system PostGIS copy.
_bundled_proj = Path(sysconfig.get_paths()['purelib']) / 'rasterio' / 'proj_data'
if (_bundled_proj / 'proj.db').exists():
    os.environ['PROJ_LIB'] = str(_bundled_proj)
import rasterio
from affine import Affine
from PIL import Image
from rasterio.features import geometry_mask
from rasterio.warp import reproject
from rasterio.enums import Resampling
from rasterio.windows import from_bounds

ROOT = Path(__file__).resolve().parents[1]
NODATA = 65535
RADIUS = 20037508.342789244
PALETTE_HUES = [8, 24, 42, 58, 76, 94, 112, 130, 148, 166, 184, 202, 220,
                238, 256, 274, 292, 310, 328, 346, 16, 66, 106, 146, 186,
                226, 266, 306, 346, 36, 126, 206]
WEB_MERCATOR = '+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +units=m +no_defs +type=crs'


def coords(geometry):
    def walk(value):
        if isinstance(value, (list, tuple)) and len(value) >= 2 and all(isinstance(x, (int, float)) for x in value[:2]):
            yield value[0], value[1]
        elif isinstance(value, (list, tuple)):
            for item in value:
                yield from walk(item)
    yield from walk(geometry['coordinates'])


def tile_range(bounds, zoom):
    west, south, east, north = bounds
    count = 1 << zoom
    def tx(lon): return int(math.floor((lon + 180.0) / 360.0 * count))
    def ty(lat):
        lat = max(-85.05112878, min(85.05112878, lat))
        rad = math.radians(lat)
        return int(math.floor((1.0 - math.asinh(math.tan(rad)) / math.pi) / 2.0 * count))
    return range(max(0, tx(west)), min(count - 1, tx(east)) + 1), range(max(0, ty(north)), min(count - 1, ty(south)) + 1)


def project_geometry(geometry):
    def walk(value):
        if isinstance(value, (list, tuple)) and len(value) >= 2 and all(isinstance(x, (int, float)) for x in value[:2]):
            lon, lat = value[0], max(-85.05112878, min(85.05112878, value[1]))
            x = math.radians(lon) * 6378137.0
            y = 6378137.0 * math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))
            return [x, y] + list(value[2:])
        return [walk(item) for item in value]
    return {'type': geometry['type'], 'coordinates': walk(geometry['coordinates'])}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--raster-zip', required=True)
    parser.add_argument('--smu-csv', required=True)
    parser.add_argument('--wrb-csv', required=True)
    parser.add_argument('--output', default=str(ROOT / 'assets/data/hwsd-indonesia'))
    parser.add_argument('--min-zoom', type=int, default=4)
    parser.add_argument('--max-zoom', type=int, default=8)
    args = parser.parse_args()
    out = Path(args.output)
    tiles_dir = out / 'tiles'
    tiles_dir.mkdir(parents=True, exist_ok=True)

    boundary_path = ROOT / 'assets/data/bps/geojson/provinsi.geojson'
    boundary = json.loads(boundary_path.read_text(encoding='utf-8'))
    geometries = [f['geometry'] for f in boundary['features'] if f.get('geometry')]
    all_coords = [p for geometry in geometries for p in coords(geometry)]
    bounds = (min(p[0] for p in all_coords), min(p[1] for p in all_coords),
              max(p[0] for p in all_coords), max(p[1] for p in all_coords))
    projected = [project_geometry(g) for g in geometries]

    records = {}
    with open(args.smu_csv, encoding='utf-8-sig', newline='') as f:
        for row in csv.DictReader(f):
            key = int(row['HWSD2_SMU_ID'])
            records[key] = row
    wrb_names = {}
    with open(args.wrb_csv, encoding='utf-8-sig', newline='') as f:
        for row in csv.DictReader(f):
            wrb_names[str(row['CODE'])] = row['Value']

    archive_path = os.path.abspath(args.raster_zip).replace('\\', '/')
    source_path = f'/vsizip/{archive_path}/HWSD2.bil'
    with rasterio.open(source_path) as src:
        source_crs = src.crs
        window = from_bounds(*bounds, transform=src.transform).round_offsets().round_lengths()
        grid = src.read(1, window=window, boundless=True, fill_value=NODATA)
        transform = src.window_transform(window)
        inside = geometry_mask(geometries, grid.shape, transform=transform,
                               invert=True, all_touched=False)
        grid[~inside] = NODATA
        flat_grid = grid.ravel()
        valid_indices = np.flatnonzero(flat_grid != NODATA)
        ids, first_positions, counts = np.unique(flat_grid[valid_indices], return_index=True, return_counts=True)
        first_indices = valid_indices[first_positions]
        present = [int(v) for v in ids]
        missing = [v for v in present if v not in records]
        if missing:
            raise RuntimeError(f'{len(missing)} raster IDs have no HWSD2_SMU row (examples: {missing[:8]})')

        # Keep the record colors coherent by WRB reference group while giving
        # each mapping unit a distinct RGB value for click identification.
        wrb_codes = sorted({str(records[v].get('WRB2_CODE') or records[v].get('WRB2') or 'NA') for v in present})
        wrb_index = {code: i for i, code in enumerate(wrb_codes)}
        used_colors = set()
        for unit_id in present:
            row = records[unit_id]
            code = str(row.get('WRB2_CODE') or row.get('WRB2') or 'NA')
            hue = PALETTE_HUES[wrb_index[code] % len(PALETTE_HUES)]
            seed = (unit_id * 2654435761) & 0xffffffff
            for attempt in range(1000):
                h = (hue + ((seed >> 8) % 13 - 6) + attempt * 0.013) % 360
                s = 0.48 + (((seed >> 16) + attempt * 7) % 44) / 100
                v = 0.62 + (((seed >> 24) + attempt * 11) % 34) / 100
                import colorsys
                rgb = tuple(round(c * 255) for c in colorsys.hsv_to_rgb(h / 360, s, v))
                packed = (rgb[0] << 16) | (rgb[1] << 8) | rgb[2]
                if packed not in used_colors:
                    used_colors.add(packed)
                    break
            row['_rgb'] = list(rgb)
            row['_packed'] = packed

        feature_rows = []
        class_counts = Counter()
        sample_cell = {}
        for unit_id, first_index, count in zip(ids.tolist(), first_indices.tolist(), counts.tolist()):
            unit_id = int(unit_id)
            row = records[unit_id]
            wrb = str(row.get('WRB2') or '')
            code = str(row.get('WRB2_CODE') or 'NA')
            name = wrb_names.get(wrb, wrb or 'Kelas tidak diketahui')
            class_counts[code] += int(count)
            sample_cell[unit_id] = tuple(int(x) for x in np.unravel_index(first_index, grid.shape))
            feature_rows.append({
                'type': 'Feature', 'geometry': None,
                'properties': {
                    'HWSD2_SMU_ID': unit_id,
                    'Kelas WRB': name,
                    'Kode WRB': wrb,
                    'Kelompok WRB': code,
                    'FAO 1990': row.get('FAO90') or '',
                    'Tekstur USDA': row.get('TEXTURE_USDA') or '',
                    'Drainase': row.get('DRAINAGE') or '',
                    'Sel grid': int(count),
                    '_rgb': row['_rgb']
                },
                '_cell': sample_cell[unit_id]
            })

        units = []
        lookup = {}
        for item in feature_rows:
            row = item['properties']
            r, c = item['_cell']
            lon = transform.c + (c + 0.5) * transform.a
            lat = transform.f + (r + 0.5) * transform.e
            row['Latitude'] = round(lat, 5)
            row['Longitude'] = round(lon, 5)
            color = '#%02x%02x%02x' % tuple(row.pop('_rgb'))
            row['_color'] = color
            units.append(row)
            lookup['%06x' % records[int(row['HWSD2_SMU_ID'])]['_packed']] = row
            del item['_cell']

        (out / 'units.json').write_text(json.dumps(units, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
        legends = []
        for code in wrb_codes:
            matching = [r for r in records.values() if str(r.get('WRB2_CODE') or r.get('WRB2') or 'NA') == code]
            code_name = code
            if matching:
                wrb = matching[0].get('WRB2', '')
                # WRB2_CODE is numeric in the FAO export; WRB2 is the stable abbreviation.
                code_name = wrb or code
            unit = next((u for u in units if u.get('Kelompok WRB') == code), None)
            legends.append({'code': code_name, 'label': unit.get('Kelas WRB', code_name) if unit else code_name,
                            'color': unit.get('_color', '#777777') if unit else '#777777',
                            'cells': int(class_counts[code])})
        (out / 'legend.json').write_text(json.dumps(legends, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')

        # The source grid is categorical. Warp each web tile with nearest-neighbor
        # resampling, then clip it again to Indonesia's province polygons.
        for zoom in range(args.min_zoom, args.max_zoom + 1):
            xs, ys = tile_range(bounds, zoom)
            tile_count = 0
            for x in xs:
                for y in ys:
                    resolution = 2 * RADIUS / (256 * (1 << zoom))
                    tile_transform = Affine(resolution, 0, -RADIUS + x * 256 * resolution,
                                            0, -resolution, RADIUS - y * 256 * resolution)
                    dest = np.full((256, 256), NODATA, dtype=np.uint16)
                    reproject(grid, dest, src_transform=transform, src_crs=source_crs,
                              src_nodata=NODATA, dst_transform=tile_transform, dst_crs=WEB_MERCATOR,
                              dst_nodata=NODATA, resampling=Resampling.nearest, num_threads=2)
                    clip = geometry_mask(projected, dest.shape, transform=tile_transform,
                                         invert=True, all_touched=True)
                    dest[~clip] = NODATA
                    valid = dest != NODATA
                    if not valid.any():
                        continue
                    rgba = np.zeros((256, 256, 4), dtype=np.uint8)
                    for unit_id in np.unique(dest[valid]):
                        unit_id = int(unit_id)
                        if unit_id in records:
                            rgba[dest == unit_id, :3] = records[unit_id]['_rgb']
                    rgba[valid, 3] = 220
                    tile_path = tiles_dir / str(zoom) / str(x) / f'{y}.png'
                    tile_path.parent.mkdir(parents=True, exist_ok=True)
                    Image.fromarray(rgba, mode='RGBA').save(tile_path, optimize=True)
                    tile_count += 1
            print(f'z{zoom}: {tile_count} tiles', flush=True)

    metadata = {
        'name': 'HWSD v2.01 — Indonesia', 'source': 'FAO Harmonized World Soil Database v2.0, revision 2.01 (2023)',
        'resolution': '30 arc-second (~1 km)', 'extent': list(bounds),
        'minZoom': args.min_zoom, 'maxZoom': args.max_zoom,
        'attribution': 'FAO HWSD v2.01; batas klip: BPS Provinsi Indonesia',
        'dataLicense': 'CC BY 4.0', 'units': len(units)
    }
    (out / 'metadata.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'bounds': bounds, 'units': len(units), 'legend': len(legends), 'metadata': metadata}, ensure_ascii=False))


if __name__ == '__main__':
    main()
