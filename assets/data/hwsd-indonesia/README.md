# HWSD Indonesia web layer

Derived from the FAO HWSD v2.0 revision 2.01 (September 2023), clipped to the province geometries in `assets/data/bps/geojson/provinsi.geojson`.

- Source raster: [HWSD Raster v2.0](https://s3.eu-west-1.amazonaws.com/data.gaezdev.aws.fao.org/HWSD/HWSD2_RASTER.zip)
- Source attribute database: [HWSD database](https://s3.eu-west-1.amazonaws.com/data.gaezdev.aws.fao.org/HWSD/HWSD2_DB.zip)
- Source information and citation: [FAO HWSD](https://www.fao.org/land-water/resources/tools/databases/hwsd/en)
- Attribute CSV export used to build the display table: [HWSD2_SMU.csv](https://github.com/bioepic-data/fao-soils/blob/main/data/hwsd2/HWSD2_csv/HWSD2_SMU.csv) and WRB lookup [D_WRB2.csv](https://github.com/bioepic-data/fao-soils/blob/main/data/hwsd2/HWSD2_csv/D_WRB2.csv)
- Resolution: 30 arc-seconds (approximately 1 km)
- Data license: CC BY 4.0; cite FAO/IIASA, *Harmonized World Soil Database version 2.0* (2023).

`tiles/{z}/{x}/{y}.png` are clipped, color-coded XYZ tiles. `units.json` contains the HWSD mapping units present in the clipped grid for click identification and the attribute table. `legend.json` and `metadata.json` describe the displayed classes and bounds. Rebuild with `scripts/build-hwsd-indonesia.py` using the input archives and CSV files listed above.
