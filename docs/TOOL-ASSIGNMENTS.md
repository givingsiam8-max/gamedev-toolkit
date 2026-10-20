# Tool Assignments

Each agent owns the category folders listed in their section **only**.
`src/core/**`, `src/components/**`, `src/shell/**`, `src/App.tsx`,
`src/categories/index.ts` and every other category folder are off limits.

Register every tool you build in that category's `index.ts` (replace the
placeholder `tools: []`). The `id` must match the file name in `tools/`.

Tool components are **default exports** and take **no props**.

Icons must come from the verified list in section 9 — do not invent names.

---

## Agent A — Image Tools + Texture Tools (14 tools)

`src/categories/images/**` — category id `images`, accent `sky`, icon `Image`
subcategories: `convert`, `resize`, `compress`, `crop`, `batch`, `metadata`

| id | name | sub | icon | formats | keywords (lowercase) |
| --- | --- | --- | --- | --- | --- |
| `image-format-converter` | Image Format Converter | convert | `RefreshCw` | PNG, JPG, WebP, BMP, GIF, SVG | png to jpg, jpg to png, png to webp, webp, bmp, svg, gif, convert, format, batch, transparency, alpha |
| `image-resizer` | Image Resizer | resize | `Maximize2` | PNG, JPG, WebP, BMP | resize, scale, dimensions, resolution, percentage, exact pixel, presets, power of two, batch |
| `image-compressor` | Image Compressor | compress | `Archive` | PNG, JPG, WebP | compress, optimize, reduce file size, quality, lossless, lossy, batch, shrink, size |
| `image-cropper` | Image Cropper | crop | `Crop` | PNG, JPG, WebP | crop, trim, aspect ratio, 1:1, 16:9, region, cut, framing |
| `batch-image-processor` | Batch Image Processor | batch | `Layers` | PNG, JPG, WebP | batch, bulk, pipeline, resize convert compress, multiple images, automation |
| `image-metadata` | Image Inspector | metadata | `Info` | PNG, JPG, WebP, BMP, GIF | metadata, exif, dimensions, dpi, channels, bit depth, alpha, file size, inspector, info |

`src/categories/textures/**` — category id `textures`, accent `emerald`, icon `Layers`
subcategories: `resize`, `convert`, `compress`, `maps`, `atlas`, `analysis`

| id | name | sub | icon | formats | keywords |
| --- | --- | --- | --- | --- | --- |
| `texture-resizer` | Texture Resizer | resize | `Frame` | PNG, JPG, WebP, TGA-less | texture, power of two, pot, npot, mipmap, resize, batch, nearest neighbour, pixel art |
| `texture-converter` | Texture Converter | convert | `Repeat` | PNG, JPG, WebP, BMP | texture, format, convert, srgb, normal map, alpha, batch |
| `texture-compressor` | Texture Compressor | compress | `Archive` | PNG, JPG, WebP | texture, compress, webp, quality, size budget, vram, batch |
| `channel-viewer` | Texture Channel Viewer | maps | `Blend` | PNG, JPG, WebP | rgba, alpha, channel, isolate, red, green, blue, invert, normal map, roughness, metallic, height, ambient occlusion, emission |
| `map-preview` | PBR Map Preview | maps | `Eye` | PNG, JPG, WebP | normal map, roughness, metallic, height, displacement, ambient occlusion, emission, preview, material map, channel packing |
| `seamless-texture` | Seamless Texture Maker | maps | `Shuffle` | PNG, JPG, WebP | seamless, tileable, offset, wrap, pattern, repeat |
| `tiling-preview` | Tiling Preview | maps | `Grid3x3` | PNG, JPG, WebP | tile, repeat, 2x2, 3x3, 4x4, seam check, texture preview |
| `texture-atlas` | Texture Atlas Builder | atlas | `LayoutGrid` | PNG, JPG, WebP | atlas, packer, sprite sheet, padding, margin, json, trim, sprites |

**Implementation notes for Agent A**

- Format conversion must detect what the browser can encode via
  `supportedEncodeTypes()` and disable unsupported targets with a hint instead of
  failing at the end. PNG/JPG always work; WebP works in Chromium/Firefox.
- When converting to JPG, alpha is dropped — offer a background colour option and
  tell the user in the UI.
- Resizing: offer presets 128/256/512/1024/2048/4096 (square + 1920×1080), exact
  pixels, percentage, and "fit / fill / stretch" modes. Nearest-neighbour option
  must exist for pixel art (`scaleImageDataNearest` or `smoothing: false`).
- Compression: two explicit modes — Lossless (PNG re-encode, WebP lossless) and
  Quality-controlled (JPEG/WebP quality slider). Show original → new size and
  percentage reduction per file. Never promise zero quality loss in quality mode.
- `map-preview` should preview a normal map with a real lighting toggle (fake
  light direction shading using the normal vectors) plus a plain view, and for
  scalar maps (roughness/metallic/height/AO/emission) show a grayscale view with
  contrast/gamma controls.
- `channel-viewer` may remap channels (e.g. put R into alpha, pack roughness into
  G) — that is genuinely useful for channel packing. Output a PNG.
- `seamless-texture` uses the offset-and-blend technique: shift by 50%, then blend
  the seams with a mirrored/feathered overlap; expose blend width and show a 3×3
  tiling preview of the result.
- `texture-atlas` packs multiple textures; keep power-of-two output optional and
  export a JSON map of regions.

---

## Agent B — Photo Editing + Color + Materials + Sprites (14 tools)

`src/categories/photo/**` — id `photo`, accent `rose`, icon `Wand2`
subcategories: `basic`, `enhance`, `lighting`, `color`, `background`, `effects`

| id | name | sub | icon | formats | keywords |
| --- | --- | --- | --- | --- | --- |
| `photo-editor` | Photo Editor | enhance | `Wand2` | PNG, JPG, WebP | editor, crop, rotate, flip, brightness, contrast, saturation, exposure, highlights, shadows, sharpen, clarity, blur, vignette, undo, redo, before after, resize, canvas |
| `background-remover` | Background Remover | background | `Scissors` | PNG, JPG, WebP | remove background, transparent, chroma key, green screen, magic wand, colour key, alpha, cutout, tolerance |
| `background-replacer` | Background Replacer | background | `Image` | PNG, JPG, WebP | replace background, blur, colour fill, gradient, transparent, backdrop |
| `photo-filters` | Photo Filters | effects | `Sparkles` | PNG, JPG, WebP | filter, preset, vintage, sepia, monochrome, cinematic, grade, warmth, strength |

`src/categories/color/**` — id `color`, accent `fuchsia`, icon `Pipette`
subcategories: `pick`, `palette`, `accessibility`

| id | name | sub | icon | formats | keywords |
| --- | --- | --- | --- | --- | --- |
| `color-converter` | Color Converter | pick | `Pipette` | — | hex, rgb, rgba, hsl, hsv, cmyk, picker, eyedropper, convert, colour, swatch |
| `palette-generator` | Palette Generator | palette | `SwatchBook` | — | palette, harmony, complementary, analogous, triadic, tetradic, scheme, css variables, export |
| `palette-from-image` | Palette From Image | palette | `Image` | PNG, JPG, WebP | extract colours, palette, dominant colours, image, quantize, gradient |
| `gradient-generator` | Gradient Generator | palette | `Blend` | PNG | gradient, linear, radial, conic, css, ramp, export, stops |
| `contrast-checker` | Contrast Checker | accessibility | `Contrast` | — | contrast, wcag, aa, aaa, accessibility, readability, ratio, ui text |

`src/categories/materials/**` — id `materials`, accent `amber`, icon `Palette`
subcategories: `pbr`, `export`

| id | name | sub | icon | formats | keywords |
| --- | --- | --- | --- | --- | --- |
| `pbr-preview` | PBR Material Preview | pbr | `Cylinder` | PNG, JPG, WebP | pbr, material, base colour, metallic, roughness, normal, ambient occlusion, emission, lighting, environment, 3d preview, sphere |
| `material-exporter` | Material Exporter | export | `FileOutput` | JSON | material, export, json, unity, urp, hdrp, standard shader, gltf, pbr values |

`src/categories/sprites/**` — id `sprites`, accent `pink`, icon `Grid2x2`
subcategories: `generate`, `split`, `resize`, `atlas`

| id | name | sub | icon | formats | keywords |
| --- | --- | --- | --- | --- | --- |
| `sprite-sheet-generator` | Sprite Sheet Generator | generate | `Grid2x2` | PNG, JPG, WebP | sprite sheet, spritesheet, animation frames, rows, columns, padding, margin, json, export |
| `sprite-sheet-splitter` | Sprite Sheet Splitter | split | `Scissors` | PNG, JPG, WebP | split, slice, grid, rows, columns, extract frames, zip, tile |
| `sprite-auto-slicer` | Sprite Auto Slicer | split | `SquareDashed` | PNG, JPG, WebP | auto slice, detect sprites, alpha, regions, trim, pack, atlas |

**Implementation notes for Agent B**

- `photo-editor`: a real editor with tabs for Crop / Resize / Adjust / Color /
  Effects. Keep an operation history for undo/redo (store the list of applied
  operations as plain objects, not ImageData, to save memory). Live preview must
  render at a capped preview size (e.g. max 1400 px) for speed, and export at full
  resolution by replaying the same operations on the full-size canvas. Include
  `CompareSlider` before/after and a reset. Use `ctx.filter` for
  brightness/contrast/saturate/hue-rotate/blur/sepia/grayscale, and manual pixel
  passes only where CSS filters cannot do the job (sharpen via convolution,
  vignette via radial gradient overlay, clarity via unsharp mask).
- `background-remover`: colour-key (chroma key) with tolerance, feather and
  edge-cleanup controls, plus a click-to-pick key colour from the image and a
  "remove white/near-white" preset. Be explicit in the UI that this is
  colour-based keying, not AI segmentation, and that it works best on flat
  backgrounds.
- `background-replacer`: transparent / solid colour / gradient / blurred copy of
  the original as the new background.
- `palette-from-image`: use `extractPalette` on a downscaled copy (max 400 px) and
  export CSS variables, JSON, hex list.
- `contrast-checker`: foreground/background pickers, live preview text at normal
  and large sizes, WCAG AA/AAA pass-fail with the ratio, suggestions to fix
  failing pairs (auto-pick black/white, darken/lighten).
- `pbr-preview`: three.js is available (`three` is installed). Load up to 6 maps
  (base colour, normal, roughness, metalness, AO, emission, height) and preview on
  a sphere/box/plane/torus with OrbitControls-free manual rotation, lighting
  presets (Studio, Outdoor, Dark, Neutral, Game lighting) implemented as
  different light setups + environment tint. Import three lazily **inside the
  component module** (top-level import in this file is fine — the whole file is
  lazily loaded by the registry). Keep the renderer small and dispose it on unmount.
- `material-exporter`: takes the same map slots (or manual PBR values) and writes a
  JSON material description, plus a Unity-style YAML snippet and a glTF material
  fragment. Copyable and downloadable.
- Sprite tools must share the same geometry rules: rows/columns/cell size,
  padding, margin, optional trim. `buildSheet` in `core/image.ts` already
  implements the layout and returns the region map — use it.
- `sprite-auto-slicer`: find connected non-transparent regions (flood fill or
  row/column projection), let the user review the detected rectangles, then export
  each region as a PNG (ZIP) or pack them into a tight atlas.

---

## Agent C — Developer Tools + Data Tools (15 tools)

`src/categories/developer/**` — id `developer`, accent `blue`, icon `Braces`
subcategories: `json`, `text`, `encoding`, `generate`

| id | name | sub | icon | formats | keywords |
| --- | --- | --- | --- | --- | --- |
| `json-formatter` | JSON Formatter | json | `FileJson` | JSON | json, format, beautify, pretty print, minify, sort keys, indent, escape |
| `json-validator` | JSON Validator | json | `ShieldCheck` | JSON | json, validate, lint, syntax error, position, line, column, repair |
| `xml-formatter` | XML Formatter | text | `Code` | XML | xml, format, beautify, minify, indent, tags, attributes |
| `yaml-viewer` | YAML Viewer | text | `FileCode` | YAML, YML | yaml, yml, viewer, tree, convert to json, validate |
| `regex-tester` | Regex Tester | text | `Search` | — | regex, regexp, test, match, groups, named groups, replace, pattern, flags |
| `text-diff` | Text Diff | text | `ArrowLeftRight` | TXT | diff, compare, changes, lines, added, removed, side by side |
| `text-minifier` | Text Minifier | text | `Minimize` | CSS, JS, JSON, XML | minify, whitespace, comments, css, javascript, json, shrink, compress |
| `text-case-converter` | Text Case Converter | text | `CaseSensitive` | TXT | case, camel case, snake case, pascal case, kebab, constant case, upper, lower, title |
| `base64-encoder` | Base64 Encoder | encoding | `Binary` | TXT | base64, encode, decode, data uri, text, utf-8 |
| `url-encoder` | URL Encoder | encoding | `Link` | TXT | url, uri, percent encoding, encode, decode, query string, component |
| `uuid-generator` | UUID Generator | generate | `Fingerprint` | — | uuid, guid, v4, unique id, bulk, nil, namespace |
| `hash-generator` | Hash Generator | generate | `Hash` | — | hash, sha256, sha1, sha384, sha512, crc32, checksum, file hash, verify, text hash |

`src/categories/data/**` — id `data`, accent `green`, icon `Database`
subcategories: `tables`, `convert`, `inspect`

| id | name | sub | icon | formats | keywords |
| --- | --- | --- | --- | --- | --- |
| `csv-viewer` | CSV Viewer | tables | `Table` | CSV, TSV | csv, tsv, table, viewer, sort, filter, delimiter, headers, rows |
| `csv-json-converter` | CSV ⇄ JSON | convert | `ArrowRightLeft` | CSV, JSON | csv, json, convert, table, rows, headers, nested, array |
| `json-tree-viewer` | JSON Tree Viewer | inspect | `FolderTree` | JSON | json, tree, explorer, collapse, path, inspect, keys, array length |

**Implementation notes for Agent C**

- Text tools use the two-column pattern: input `TextArea` on the left, output on
  the right, `CopyButton` + Download in the action bar, live formatting via
  `useDebounced` where it is cheap (< ~2 MB), otherwise a Process button.
- `json-formatter`: indent width, sort keys, minify, single-line vs pretty, escape
  /unescape strings, and a "JSON Lines" mode. Show byte size before/after.
- `json-validator`: report the first error with line/column and a caret line, plus
  all `Unexpected token` positions when recoverable. Include a small set of common
  fixes (trailing commas, single quotes, unquoted keys) offered as explicit
  buttons that rewrite the input, clearly labelled as transformations.
- `xml-formatter`: formatting, minifying, and a collapsible-free indented view.
- `yaml-viewer`: use `js-yaml` (`import { load, dump } from 'js-yaml'`) — already
  installed. Show a tree + JSON output + validation errors with line numbers.
- `regex-tester`: flags (g, i, m, s, u), highlighted matches in the input, groups
  table (including named groups), replace preview, and a pattern cheat sheet.
  Guard against catastrophic backtracking by refusing patterns longer than 500
  chars and always wrapping `new RegExp` in try/catch.
- `text-diff`: line-based LCS diff with word-level highlighting inside changed
  lines, side-by-side and unified views, stats (+added / -removed).
- `text-minifier`: conservative minifiers only — strip comments/extra whitespace
  for CSS, strip `//` and `/* */` comments plus indentation for JS (never rename
  identifiers), compact JSON, compact XML. State that it does not do variable
  renaming.
- `base64-encoder`: UTF-8 safe via `TextEncoder`/`TextDecoder`; support data URI
  prefixes; a file drop variant would be nice but `files/base64-file-converter`
  covers it, so keep this one text-only.
- `hash-generator`: use `crypto.subtle.digest` for SHA-1/256/384/512 on text and
  files (chunk file reading is unnecessary; `arrayBuffer()` is fine), plus a small
  CRC32 implementation for integrity checks.
- `uuid-generator`: v4 via `crypto.randomUUID()`/`getRandomValues`, bulk count,
  uppercase/hyphen options, nil UUID, and copy-all. Never claim to generate
  "guaranteed unique" IDs across machines — say "randomly generated".
- `csv-viewer`: delimiter auto-detection (`,` `;` `\t` `|`), quoted-field parsing
  (write a small RFC4180 parser — handle `""` escapes and embedded newlines),
  sticky header, row/column counts, sorting, filtering, and export to CSV/JSON.
- `csv-json-converter`: header-driven objects, type inference toggle
  (numbers/booleans), nested keys via `a.b` headers, and both directions.
- `json-tree-viewer`: expandable tree with type badges, node counts, search/filter
  of keys, and click-to-copy JSON path.

---

## Agent D — File Conversion + Unity Tools (14 tools)

`src/categories/files/**` — id `files`, accent `teal`, icon `RefreshCw`
subcategories: `convert`, `archive`, `encode`

| id | name | sub | icon | formats | keywords |
| --- | --- | --- | --- | --- | --- |
| `zip-tool` | Archive Tool | archive | `Archive` | ZIP | zip, unzip, archive, extract, compress, multiple files, download, package |
| `svg-to-png` | SVG to PNG | convert | `FileImage` | SVG | svg, png, rasterize, scale, dpi, icon, vector, transparent |
| `ico-generator` | Icon Generator | convert | `Square` | PNG, ICO | ico, favicon, windows icon, multi size, png to ico, app icon, 16 32 48 256 |
| `base64-file-converter` | Base64 File Converter | encode | `Binary` | any | base64, file, data uri, encode, decode, embed, css, inline |
| `text-encoding-converter` | Text Encoding Converter | encode | `FileType` | TXT, CSV, JSON | utf-8, utf-16, latin1, bom, encoding, charset, mojibake, windows-1252 |

`src/categories/unity/**` — id `unity`, accent `indigo`, icon `Gamepad2`
subcategories: `asset`, `csharp`, `scene`, `build`, `optimization`

| id | name | sub | icon | formats | keywords |
| --- | --- | --- | --- | --- | --- |
| `guid-generator` | Unity GUID Generator | asset | `Fingerprint` | — | guid, unity, meta, asset id, 32 hex, bulk, unique |
| `guid-inspector` | GUID Inspector | asset | `FileSearch` | META, YAML | guid, meta file, inspect, fileid, reference, find, validate |
| `meta-file-generator` | .meta Generator | asset | `FileOutput` | META | meta, unity, importer, texture importer, sprite, settings, yaml, generate |
| `layer-calculator` | Layer & Bitmask Calculator | scene | `Layers` | — | layer, bitmask, mask, layermask, physics, raycast, bit shift, collision matrix |
| `quaternion-converter` | Quaternion Converter | csharp | `Rotate3d` | — | quaternion, euler, rotation, look rotation, slerp, degrees, radians |
| `vector-calculator` | Vector Calculator | csharp | `Move3d` | — | vector2, vector3, magnitude, dot, cross, distance, normalize, lerp, angle, projection |
| `unity-color-utility` | Unity Color Utility | csharp | `Palette` | — | unity color, color32, hdr, linear, gamma, hex, rgba, 0-1 floats, srgb |
| `transform-converter` | Transform Converter | scene | `Move` | — | transform, position, rotation, scale, unity, three.js, unreal, coordinate system, left handed, right handed |
| `fps-calculator` | Frame Budget Calculator | build | `Gauge` | — | fps, frame time, budget, milliseconds, target, refresh rate, vsync, performance |

**Implementation notes for Agent D**

- `zip-tool`: create ZIPs from dropped files (with a folder-name option), and
  extract dropped ZIPs (list contents with sizes, download individual entries or
  all). Use `zipFiles` and `unzipFile` from `core/files.ts`.
- `svg-to-png`: render the SVG through an `Image` at a chosen scale/width, with a
  transparent or solid background, and offer 1×/2×/4×, exact width, and common
  icon sizes (16…1024). Warn that SVG filters and external references may not
  rasterise consistently.
- `ico-generator`: build a real multi-size `.ico` container. Structure: ICONDIR
  (reserved 0, type 1, count), then one ICONDIRENTRY per size (width, height —
  0 means 256 — colour count 0, reserved 0, planes 1, bit count 32, bytesInRes,
  imageOffset), followed by PNG payloads. Encode each size with the canvas and
  assemble with a `DataView`. Sizes: 16, 24, 32, 48, 64, 128, 256 (256 must be
  PNG-compressed inside the ICO — that is what modern Windows expects).
- `text-encoding-converter`: read the file as `ArrayBuffer`, let the user pick the
  source encoding (`utf-8`, `utf-16le`, `utf-16be`, `windows-1252`, `iso-8859-1`)
  and the target, show a BOM/byte inspection of the first bytes, and re-encode
  with `TextDecoder`/`TextEncoder` (the legacy single-byte encodings are supported
  by `TextDecoder` in browsers). Show a "likely mojibake" warning when the decoded
  text contains typical sequences (Ã©, Â, â€™).
- Unity tools must be visually obvious and copy-friendly (`CopyField`, `CopyButton`),
  because that is how they are actually used.
- `guid-generator`: 32 lowercase hex characters (Unity GUID format, no hyphens),
  bulk count, plus a "N GUIDs" copy/download. Explain the difference from a
  hyphenated .NET GUID.
- `guid-inspector`: paste `.meta`/YAML text or drop `.meta` files, extract `guid:`
  and `fileID:` values, validate the 32-hex format, list every GUID found, and
  flag duplicates inside the pasted text.
- `meta-file-generator`: generate valid Unity `.meta` YAML for textures (with
  TextureImporter settings: textureType Default/Sprite/NormalMap, sRGB, alpha
  source, wrap mode, filter mode, max size, compression, pixels per unit, sprite
  mode single/multiple) and for folders/scripts. Provide copy + download, and a
  clear note that the generated GUID must remain unique.
- `layer-calculator`: 32 layer slots with names (editable), checkboxes, live
  bitmask value (decimal/hex/binary), `LayerMask.NameToLayer`-style helpers, and
  the inverse: given a mask, list which layers are included. Explain that Unity
  reserves layers 0-7 for built-ins (Default, TransparentFX, Ignore Raycast,
  Water, UI) and that user layers start at 8.
- `quaternion-converter`: Euler (degrees) ↔ quaternion in **both Unity (left-handed,
  ZXY) and three.js/glTF (right-handed, XYZ)** conventions, with the conversion
  between the two, live preview of the resulting direction vector, and slerp
  between two rotations. Label the axis order explicitly — this is where people
  get it wrong.
- `vector-calculator`: Vector2/Vector3 switcher, arithmetic, magnitude, squared
  magnitude, normalized, dot, cross (3D), distance, angle between, lerp,
  projection, reflection; results with 4+ decimals and copy buttons.
- `unity-color-utility`: 0-1 float RGBA ↔ 0-255 Color32 ↔ HEX ↔ HSV; HDR intensity
  (values > 1) with a note that HDR colours are not representable in hex; sRGB ↔
  linear conversion for both the colour and a ping-pong check; plus a small palette
  of Unity default UI colours.
- `transform-converter`: convert position/rotation/scale between Unity
  (left-handed, Y-up, 1 unit = 1 m) and three.js/glTF/Unreal-ish (right-handed) —
  mirror the Z axis for position and negate the appropriate rotation components;
  state the exact rule you apply in the UI so the user can verify.
- `fps-calculator`: given a target FPS or frame budget, compute ms per frame, ms
  per system at percentages, headroom, and how many 60 Hz frames a budget allows;
  include common targets (30/60/90/120/144) and a "what fits in the budget"
  breakdown table.

---

## Agent E — Audio + Animation + Optimization + Utilities (14 tools)

`src/categories/audio/**` — id `audio`, accent `cyan`, icon `Music`
subcategories: `easy`, `advanced`

| id | name | sub | icon | formats | keywords |
| --- | --- | --- | --- | --- | --- |
| `easy-audio-editor` | Easy Audio Editor | easy | `Music` | MP3, WAV, OGG, M4A, AAC, FLAC | audio editor, trim, cut, split, waveform, volume, fade, speed, pitch, mute, undo, redo, mp3, wav |
| `advanced-audio-editor` | Advanced Audio Editor | advanced | `AudioLines` | MP3, WAV, OGG, M4A, AAC, FLAC | bpm, tempo, gain, decibel, semitone, sample rate, bit depth, 24-bit, mono, stereo, normalize, compression, eq, bitrate |

`src/categories/animation/**` — id `animation`, accent `orange`, icon `Film`
subcategories: `gif`, `frames`, `preview`

| id | name | sub | icon | formats | keywords |
| --- | --- | --- | --- | --- | --- |
| `gif-viewer` | GIF Viewer | gif | `Film` | GIF | gif, viewer, frames, play, pause, step, speed, delay, loop |
| `gif-to-frames` | GIF to Frames | gif | `GalleryHorizontal` | GIF | gif, frames, png, sequence, extract, zip, sprite |
| `gif-to-sprite-sheet` | GIF to Sprite Sheet | gif | `Grid3x3` | GIF | gif, sprite sheet, spritesheet, animation, rows, columns, export |
| `frames-to-gif` | Frames to GIF | frames | `Clapperboard` | PNG, JPG, WebP | gif, animation, frames, png sequence, encode, loop, delay, palette |
| `sprite-animation-preview` | Sprite Animation Preview | preview | `Play` | PNG, JPG, WebP | sprite, animation, preview, fps, playback, frames, scrub, loop |
| `image-sequence-organizer` | Image Sequence Organizer | frames | `ListOrdered` | PNG, JPG, WebP | sequence, rename, sort, numbering, frames, batch, zip, natural sort |

`src/categories/optimization/**` — id `optimization`, accent `lime`, icon `Gauge`
subcategories: `image`, `mesh`, `project`

| id | name | sub | icon | formats | keywords |
| --- | --- | --- | --- | --- | --- |
| `texture-audit` | Texture Audit | image | `ScanSearch` | PNG, JPG, WebP | texture, audit, size, power of two, alpha, savings, report, batch, vram, atlas candidate |
| `duplicate-image-finder` | Duplicate Image Finder | image | `Copy` | PNG, JPG, WebP | duplicate, similar, hash, perceptual, dhash, sha256, find, cleanup, near duplicate |
| `asset-naming-validator` | Asset Naming Validator | project | `FileWarning` | any | naming, convention, validate, pascal case, prefix, unity, assets, rename, lint, folder |

`src/categories/utilities/**` — id `utilities`, accent `slate`, icon `Wrench`
subcategories: `convert`, `layout`, `text`

| id | name | sub | icon | formats | keywords |
| --- | --- | --- | --- | --- | --- |
| `unit-converter` | Unit Converter | convert | `Ruler` | — | unit, convert, px, inch, cm, mm, dpi, bytes, time, angle, degrees, radians, speed |
| `aspect-ratio-calculator` | Aspect Ratio Calculator | layout | `Frame` | — | aspect ratio, resolution, 16:9, 4:3, scale, letterbox, safe area, fov, camera, calculator |
| `lorem-ipsum-generator` | Placeholder Text Generator | text | `Type` | TXT | lorem ipsum, placeholder, dummy text, game text, dialogue, mock, strings |

**Implementation notes for Agent E**

- Both editors share one implementation: `src/categories/audio/AudioEditor.tsx`
  (UI, playback, undo history) and `src/categories/audio/editor.ts` (DSP).
  `tools/easy-audio-editor.tsx` and `tools/advanced-audio-editor.tsx` are thin
  wrappers that pass `variant="easy"` / `variant="advanced"`. Keep the workflow
  identical: Upload → Edit → Preview → Adjust → Export.
- Audio decoding uses `AudioContext.decodeAudioData` (available for MP3, WAV,
  OGG, M4A/AAC, FLAC depending on the browser). Create the context lazily,
  `close()` it when done, and offer a clear error when a codec is unsupported.
- The render pipeline in `renderEditedBuffer` is: trim → EQ/compression
  (`OfflineAudioContext`) → pitch → speed (OLA time stretch) → gain/fades/
  normalization → channel conversion → sample-rate conversion. The preview and
  the export both use this pipeline so they always match.
- History stores `{ buffer, settings }` snapshots. Push one on slider
  pointer-down / number-field focus and on destructive actions (cut, mute,
  normalize, compression); undo/redo restores both the buffer and the settings.
- WAV writing supports 16-bit and 24-bit PCM (`encodeWav` in `audio.ts`). MP3
  uses the installed `@breezystack/lamejs` encoder; expose bitrate choices and
  never claim MP3 is lossless.
- Cut is destructive on the working buffer (with undo). Split cuts the rendered
  preview at the playhead and exports both halves; it does not alter the working
  clip. Always leave the user's original file untouched and keep everything
  local.
- GIF decoding: use `gifuct-js` (`parseGIF`, `decompressFrames(buffer, true)`).
  Compose each frame onto an accumulating canvas honouring `disposalType`
  (0/1 = leave, 2 = clear to background, 3 = restore previous). GIF encoding uses
  `gifenc` (`GIFEncoder`, `quantize`, `applyPalette`) — both packages are
  installed and typed (gifenc typings live in `src/types/gifenc.d.ts`).
- `frames-to-gif`: accept a PNG/JPG sequence, natural-sort by filename, let the
  user set delay (ms/frame), loop count, max colours (2–256), and dithering
  (applyPalette with/without a prequantize step), then encode. Show an animated
  preview of the result before download.
- `gif-to-sprite-sheet`: reuse `buildSheet` from `core/image.ts` for layout and
  export the region JSON as well.
- `texture-audit`: report per file — dimensions, aspect, power-of-two status,
  estimated uncompressed VRAM (RGBA8 and DXT-ish 4 bpp), alpha usage
  (`analyseAlpha`), file size, and flags (non-POT, very large, alpha in a JPG,
  duplicate candidate). Aggregate totals and a "largest offenders" table with
  estimated savings. Sorting and CSV/text export.
- `duplicate-image-finder`: exact duplicates via SHA-256 of the file bytes
  (`crypto.subtle.digest`), near duplicates via a 64-bit dHash on a 9×8 grayscale
  downscale with Hamming distance threshold. Group results with thumbnails and
  let the user drop the extras.
- `asset-naming-validator`: validate dropped file/folder names against rules the
  user can toggle: allowed style (PascalCase / snake_case / kebab-case /
  any), required prefixes per type (e.g. `T_` textures, `M_` materials, `SM_`
  static meshes), max length, forbidden characters (spaces, non-ASCII, `#%&{}`),
  forbidden Unity special names (`Assets`, `Editor`, `Resources` misuse is fine —
  focus on characters and case), duplicate base names, and non-ASCII. Output a
  table of violations with a suggested fixed name and a downloadable report.
- `unit-converter`: categories for length, pixels↔physical (with DPI), data size,
  time, angle, speed, temperature, and game-specific ones (units per second ↔
  km/h, tiles, world units). Live conversion as you type.
- `aspect-ratio-calculator`: given any two of width/height/ratio, compute the
  third; common game ratios; scale tables (1080p → 4K) with exact pixel rounding;
  safe-area and letterbox/pillarbox bars; camera FOV (horizontal ↔ vertical) given
  an aspect ratio.
- `lorem-ipsum-generator`: sentence/paragraph/word counts, an option for
  game-flavoured placeholder strings (character names, item names, dialogue
  lines), copy and download as TXT/JSON.

---

## 9. Verified icon names

Use only these (they are confirmed to exist in the installed `lucide-react`):

`AlertTriangle Activity Archive ArrowDownUp ArrowLeft ArrowLeftRight ArrowRightLeft AudioLines Award Ban Beaker Binary Blend Blocks Bookmark Bot Box Boxes Braces Brain Bug Calculator Calendar Camera CaseSensitive CircleAlert CircleCheck CircleDot Clapperboard Cloud Code Columns2 Columns3 Combine Compass Component Contrast Copy CornerDownRight Crop Crosshair Cuboid Cylinder Database Diamond Dices Download Droplet Eraser Expand ExternalLink Eye EyeOff FileArchive FileCode FileImage FileInput FileJson FileOutput FileSearch FileSpreadsheet FileText FileType FileWarning FileX Fingerprint Flag Flame FlaskConical FlipHorizontal2 Focus Folder FolderOpen FolderPlus FolderTree Frame Gauge Gamepad2 Gem Globe Grid Grid2x2 Grid3x3 Grip Group HardDrive Hash Heading Heart History Home Hourglass House Image Images Info Joystick Keyboard KeyRound Layers Layers2 Layers3 LayoutDashboard LayoutGrid Lightbulb Link List ListOrdered Locate Lock Magnet Map MapPin Maximize Maximize2 Medal Merge Mic Minimize Minus Monitor Moon Move Move3d Music Navigation Package PaintBucket Palette Pause Pen Pencil Percent Pickaxe Pilcrow Pipette Play Plug Plus Power Printer Puzzle QrCode Quote Radio Redo RefreshCcw RefreshCw Replace Repeat Rotate3d RotateCcw RotateCw Rocket Rows2 Rows3 Ruler Save Scan ScanSearch ScanLine Scissors Search Server Settings Share2 Shield ShieldCheck Shrink Shuffle Sigma Slice Sliders SlidersHorizontal Smartphone Snowflake Sparkle Sparkles Speaker Square SquareDashed SquareStack Star Stars Sun Sunrise Sunset SwatchBook Swords Tablet Tag Tags Target Telescope Terminal Thermometer Timer TimerReset ToyBrick Trash2 TrendingUp TriangleRight Trophy Type Undo Undo2 Ungroup Unlock Upload Variable Video Volume Volume2 Wand Wand2 WandSparkles Warehouse Waves Weight Wind Wrench X Zap ZoomIn ZoomOut`
