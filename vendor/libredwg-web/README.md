# DWG engine (libredwg-web wasm, patched)

Built by `.github/workflows/build-libredwg-wasm.yml` on branch `build-libredwg` of this repository:

- @mlightcad/libredwg-web v0.8.2 (the JS bindings in node_modules, same version)
- merged with LibreDWG 0.14.8625 (R2004 sections larger than num_sections × max_decomp_size, 665b8dde)
- one fix of ours in src/bits.c, `bit_read_H`: the handle size was checked against `sizeof (BITCODE_RC *)`,
  which is 4 on wasm32, so 5–8 byte handles were rejected and every later object misread
  (世舜 10180 門窗圖.dwg, HANDSEED 0x10527E5B4: layer names empty, 0 objects). The limit is 8.
- one fix of ours in src/decode_r2007.c, the R2007 section map: a section may decompress to 100 × the file size
  instead of 10 × (an upstream "debugging sanity" check). DGN linestyle junk compresses far better than 10 ×:
  11F 建築底圖.dwg (AC1021, 1.3 MB) has a 21.7 MB section and was rejected outright; with the fix it and 08-11F-給水.dwg
  read with the same model-space objects as ZWCAD (2,123 and 1,227). Built on branch `build-libredwg`, run 40525925079.
- one fix of ours in src/bits.c, `bit_read_UMC`: at most 10 bytes (64 bits) instead of 8 (56 bits). The handle map stores
  handle offsets this way; 敦南 drawings carry handles like 0xFFF7D40F52A0262A, so the map went out of step and no object
  was read (error 1; ZWCAD keeps the handles on save, WBLOCK renumbers them). 1051121 敦南-北向室外地坪修正.dwg now reads
  1,164 objects, as ZWCAD. Run 40535135096.
- one fix of ours in src/dwg.spec, VERTEX_2D DXF output: widths (40/41) and bulge (42) were written only when the
  vertex flag is non-zero, and a plain vertex has flag 0, so old-style polylines lost their arcs and widths (世舜 門窗圖
  donut 10527C224 drew as nothing; A07 工作陽台排水吊管 lost 10 of 20 bulges). They are now written for every vertex
  (BD0 still skips zeros). 186-drawing regression: error codes and entity counts unchanged. Run 40670822492.

Same build commands and flags as libredwg-web's package.json (emscripten latest, `--enable-release --enable-debug`,
linked with em++). `scripts/copy-runtime.mjs` copies these files into public/runtime/libredwg instead of the ones
in node_modules. Licence: GPL-3.0-or-later, as LibreDWG (node_modules/@mlightcad/libredwg-web/LICENSE).
