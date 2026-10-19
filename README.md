# GameDev Toolkit

A desktop-first, browser-local workspace for game development utilities: images, textures,
sprites, photo editing, colour, materials, 3D models, audio, animation, Unity helpers, developer
data tools, optimization and small utilities.

Everything runs in the browser. Files are never uploaded.

## Run it

```bash
npm install
npm run dev        # http://127.0.0.1:5173
```

Production build:

```bash
npm run build      # type-check + bundle into dist/
npm run preview    # serves dist/ on http://127.0.0.1:4173
```

Node 20+ is required.

## What is in it

77 tools across 15 categories:

| Category | Tools |
| --- | --- |
| 3D Tools | Model viewer, model converter, texture extractor, mesh statistics |
| Image Tools | Format converter, resizer, compressor, cropper, batch processor, inspector |
| Photo Editing | Full editor (crop/resize/adjust/colour/effects, undo, compare), background remover, background replacer, filters |
| Texture Tools | Resizer, converter, compressor, channel viewer/packer, PBR map preview, seamless maker, tiling preview, atlas builder |
| Material Tools | PBR material preview (six map slots, five lighting presets), material exporter |
| Unity Tools | GUID generator/inspector, `.meta` generator, layer bitmask calculator, quaternion/vector/colour utilities, transform converter, frame budget calculator |
| Sprite Tools | Sheet generator, sheet splitter, alpha-based auto slicer |
| Audio Tools | Converter (WAV/MP3), trimmer, gain/normalize/fades, waveform viewer |
| Animation Tools | GIF viewer, GIF→frames, GIF→sprite sheet, frames→GIF, animation preview, sequence organizer |
| File Conversion | ZIP archive tool, SVG→PNG, ICO generator, Base64 file converter, text encoding converter |
| Developer Tools | JSON formatter/validator, XML formatter, YAML viewer, regex tester, text diff, minifier, case converter, Base64/URL encoders, UUID and hash generators |
| Optimization | Texture audit, duplicate image finder (SHA-256 + dHash), asset naming validator |
| Color Tools | Converter, palette generator, palette from image, gradient generator, WCAG contrast checker |
| Data Tools | CSV viewer, CSV⇄JSON, JSON tree viewer |
| Utilities | Unit converter, aspect-ratio calculator, placeholder text generator |

Dashboard features quick tools, recents, favourites, "you may also need" suggestions, global search
(`Ctrl/Cmd+K`), and persistent local preferences.

## Architecture

- `src/core/` — tool registry, local preferences, file/zip/image/colour helpers, error handling.
- `src/components/` — shared UI kit, drop zone/file queue, workspace shell.
- `src/categories/<id>/index.ts` — category metadata plus tool registrations.
- `src/categories/<id>/tools/<tool-id>.tsx` — one self-contained tool, default export.

Tools are lazy-loaded through `load: () => import(...)`, so heavy libraries (three.js, MP3 encoder,
YAML parser, GIF codecs) only load when that tool is opened. Adding a tool means adding its file
and one registration entry — navigation, search, recents and favourites update automatically.

`docs/TOOL_SPEC.md` documents the frozen API contract and UI conventions.

## Honest limitations

- Codec support depends on the browser. Canvas can encode PNG/JPG everywhere and WebP in current
  Chromium/Firefox; audio decoding depends on the platform's codecs.
- 3D: FBX and Collada are import-only — there is no client-side FBX/DAE encoder. DRACO/KTX2
  compressed glTF is not supported.
- Background removal is colour keying, not AI segmentation; it needs a flat background.
- Texture "VRAM" and draw-call numbers are estimates from geometry, not profiler measurements.
- Browser tools cannot encode GPU texture formats (BC7/ASTC/ETC2); those need an engine importer.
- MP3 export is lossy at the chosen bitrate; WAV is uncompressed 16-bit PCM.
