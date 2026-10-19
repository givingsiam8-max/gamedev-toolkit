# GameDev Toolkit — Tool Module Specification

Read this whole file before writing code. It is the contract every tool follows.
Following it exactly is what keeps 80+ independently built tools looking and
behaving like one product.

---

## 1. Project shape

```
src/
  core/            # frozen — do not edit
    types.ts       # ToolDefinition, CategoryDefinition, CategoryModule
    registry.ts    # registration + search
    store.tsx      # favorites / recents / settings (localStorage)
    hooks.ts       # useTask, useObjectUrl, useDebounced, useStoredState, useHotkey, useElementSize, useAnimationFrame
    files.ts       # read/download/zip helpers
    image.ts       # canvas + image primitives
    color.ts       # colour maths
    format.ts      # number/size/name formatting
    errors.ts      # UserError + message mapping
    router.ts      # hash router
  components/      # frozen — do not edit
    ui.tsx         # buttons, inputs, panels, feedback, modal, toasts
    files.tsx      # DropZone, FileGrid, FileRow, QueueHeader, CompareSlider, useFileQueue
    ToolShell.tsx  # the workspace shell every tool renders inside
    ToolCard.tsx   # dashboard cards
    accent.ts      # accent colour helper
    ErrorBoundary.tsx
  categories/<category-id>/
    index.ts       # category metadata + tool registrations (you own this)
    tools/<tool-id>.tsx   # one component per tool, default export
    tools/<tool-id>.css   # optional, imported by the component
```

**Never edit anything outside the folders assigned to you.** In particular
`src/core/**`, `src/components/**` and `src/categories/index.ts` are owned by the
integrator. Other agents own the other category folders.

---

## 2. A complete tool module

This is the shape every tool follows. Copy it, then fill in the logic.

```tsx
// src/categories/images/tools/image-resizer.tsx
import { useState } from 'react';
import { Download, RefreshCw, Play } from 'lucide-react';
import { ToolShell } from '../../../components/ToolShell';
import {
  Button, Field, Notice, NumberInput, Panel, ProgressBar, Segmented, Stat, useToast,
} from '../../../components/ui';
import { DropZone, FileGrid, QueueHeader, useFileQueue } from '../../../components/files';
import { useTask } from '../../../core/hooks';
import { downloadBlob, zipFiles } from '../../../core/files';
import { canvasToBlob, loadImage, resizeToCanvas } from '../../../core/image';
import { formatBytes, formatNumber, replaceExt } from '../../../core/format';

export default function ImageResizer() {
  const toast = useToast();
  const queue = useFileQueue({ accept: 'image/*' });
  const task = useTask<{ blobs: Array<{ name: string; blob: Blob }>; saved: number }>();

  const [width, setWidth] = useState(1024);

  const run = () =>
    task.run(async (report) => {
      if (!queue.items.length) throw new Error('Add at least one image first.');
      const out: Array<{ name: string; blob: Blob }> = [];
      let before = 0;
      let after = 0;

      for (let i = 0; i < queue.items.length; i += 1) {
        const item = queue.items[i];
        report(i / queue.items.length, `Processing ${item.file.name}`);
        const image = await loadImage(item.file);
        const canvas = resizeToCanvas(image, width, Math.round((width / image.width) * image.height), {
          smoothing: true,
        });
        const blob = await canvasToBlob(canvas, 'image/png');
        out.push({ name: replaceExt(item.file.name, 'png'), blob });
        before += item.file.size;
        after += blob.size;
        image.dispose();
      }

      report(1, 'Finished');
      return { blobs: out, saved: before > 0 ? ((before - after) / before) * 100 : 0 };
    });

  const downloadAll = async () => {
    if (!task.result) return;
    if (task.result.blobs.length === 1) {
      downloadBlob(task.result.blobs[0].blob, task.result.blobs[0].name);
    } else {
      downloadBlob(await zipFiles(task.result.blobs.map((b) => ({ name: b.name, data: b.blob }))), 'resized.zip');
    }
    toast.success(`Exported ${task.result.blobs.length} file(s).`);
  };

  return (
    <ToolShell
      sidebar={
        <>
          <Field label="Width (px)" hint="Height follows the aspect ratio.">
            <NumberInput value={width} min={1} max={16384} onChange={setWidth} />
          </Field>
        </>
      }
      actions={
        <>
          <Button variant="ghost" icon={<RefreshCw />} onClick={() => { task.reset(); queue.clear(); }}>
            Reset
          </Button>
          <Button variant="primary" icon={<Play />} loading={task.running} disabled={!queue.items.length} onClick={run}>
            Resize {queue.items.length || ''}
          </Button>
          <Button variant="success" icon={<Download />} disabled={!task.result} onClick={downloadAll}>
            Download
          </Button>
        </>
      }
      info={task.result ? `${task.result.blobs.length} file(s) ready` : undefined}
    >
      {queue.items.length === 0 ? (
        <DropZone onFiles={(files) => queue.add(files)} accept="image/*" formats={['PNG', 'JPG', 'WebP', 'BMP']} size="lg" />
      ) : (
        <Panel title="Images" actions={<QueueHeader count={queue.items.length} onClear={queue.clear} />}>
          <FileGrid items={queue.items} onRemove={queue.remove} />
        </Panel>
      )}

      {task.running && <Panel title="Progress"><ProgressBar value={task.progress} label={task.message} /></Panel>}

      {task.error && <Notice tone="error" title="Could not finish">{task.error}</Notice>}

      {task.result && (
        <div className="grid-3">
          <Stat label="Files" value={formatNumber(task.result.blobs.length)} />
          <Stat label="Total size" value={formatBytes(task.result.blobs.reduce((s, b) => s + b.blob.size, 0))} />
          <Stat label="Saved" value={`${task.result.saved.toFixed(1)}%`} tone={task.result.saved > 0 ? 'ok' : 'neutral'} />
        </div>
      )}
    </ToolShell>
  );
}
```

Key points illustrated above:

- `ToolShell` gets the tool metadata from context — you never pass `tool`.
- Sidebar holds controls, main column holds files/preview/results, `actions` is the fixed bottom bar.
- Long work goes through `task.run(report)` so progress, errors and the busy state are handled for you.
- Errors are thrown, never `alert()`-ed. `UserError` carries a friendly message.
- Memory: call `image.dispose()` / `URL.revokeObjectURL` when you are done.

---

## 3. Registration

Each category has exactly one `index.ts`. Add one entry per tool:

```ts
{
  id: 'image-resizer',
  name: 'Image Resizer',
  category: 'images',
  subcategory: 'resize',
  description: 'Resize images to exact pixel sizes, percentages or game-ready presets with batch export.',
  keywords: ['resize', 'scale', 'dimensions', 'resolution', 'png', 'jpg', 'webp', 'batch', 'power of two'],
  formats: ['PNG', 'JPG', 'WebP', 'BMP'],
  icon: Scaling,
  load: () => import('./tools/image-resizer'),
},
```

Rules:

- `id` is globally unique, kebab-case, and **must equal the file name** in `tools/`.
- `subcategory` must be one of the ids defined for that category (see your tables).
- `category` must equal the category id in the same file.
- `keywords` are lowercase and include: the task verbs users type, the file
  formats, and common synonyms (e.g. `alpha` for transparency, `fbx`).
- The `load` arrow function is what keeps heavy libraries out of the main bundle.
  Tool components must be **default exports**.

---

## 4. Frozen API reference

### `components/ui.tsx`

| Export | Signature / notes |
| --- | --- |
| `Button` | `{ variant?: 'primary'\|'secondary'\|'ghost'\|'outline'\|'success'\|'warning'\|'danger', size?: 'sm'\|'md'\|'lg', icon?, iconRight?, loading?, block?, ...buttonProps }` |
| `IconButton` | same as Button + required `label` (accessible name + CSS tooltip) |
| `Panel` | `{ title?, icon?, actions?, flush?, className?, children }` |
| `SectionTitle` | `{ icon?, children }` |
| `Field` | `{ label?, hint?, right?, htmlFor?, children }` |
| `FieldRow` | `{ label, hint?, children }` — inline label + control on one row |
| `TextInput` / `TextArea` | native props, styled |
| `Select` | `{ options: {value,label,disabled?}[], ...selectProps }` |
| `NumberInput` | `{ value, onChange:(n)=>void, min?, max?, step?, suffix?, ... }` |
| `SliderField` | `{ label, value, onChange, min?, max?, step?, format?, disabled?, hint?, resetValue? }` |
| `CheckBox` | `{ checked, onChange, label, disabled?, hint? }` |
| `SwitchRow` | `{ label, hint?, checked, onChange, disabled? }` |
| `Segmented` | `{ options: {value,label,icon?,title?}[], value, onChange, size? }` |
| `Badge` | `{ tone?: 'neutral'\|'success'\|'warning'\|'danger'\|'info'\|'accent', icon?, children }` |
| `Notice` | `{ tone?: 'info'\|'success'\|'warning'\|'error', title?, actions?, children }` |
| `ProgressBar` | `{ value, max?, label?, indeterminate?, small? }` |
| `BusyOverlay` | `{ message?, progress? }` — absolutely positioned, parent needs `position: relative` |
| `EmptyState` | `{ icon?, title?, text?, action? }` |
| `Stat` | `{ label, value, sub?, tone?: 'neutral'\|'ok'\|'warn'\|'bad' }` |
| `Spinner` | `{ large? }` |
| `Tabs` | `{ tabs: {value,label,icon?}[], value, onChange }` |
| `Modal` | `{ open, onClose, title, children, footer?, size?: 'md'\|'lg' }` |
| `useToast()` | `{ success(msg), error(msg), warning(msg), info(msg) }` |
| `CopyButton` | `{ value, label?, size?, variant?, onCopied? }` |
| `CopyField` | `{ label, value, mono?, hint? }` |
| `CodeBlock` | `{ text, maxHeight? }` |
| `copyText` | `(text: string) => Promise<boolean>` |

### `components/files.tsx`

| Export | Notes |
| --- | --- |
| `useFileQueue({ accept?, maxFiles? })` | `{ items, add(files), remove(id), clear(), setStatus(id,status,msg?), setAllStatus(status,msg?), isImageQueue }` |
| `DropZone` | `{ onFiles:(File[])=>void, accept?, multiple?, title?, hint?, formats?: string[], size?: 'sm'\|'md'\|'lg', icon?, disabled? }` |
| `FileGrid` | `{ items, onRemove?, renderExtra?, disabled? }` |
| `FileRow` | `{ item, onRemove?, right? }` |
| `QueueHeader` | `{ count, label?, onAdd?, onClear?, busy?, children? }` |
| `CompareSlider` | `{ beforeUrl, afterUrl, beforeLabel?, afterLabel?, aspect? }` |

`QueuedFile` = `{ id, file, previewUrl, kind, status, message? }`.

### `components/ToolShell.tsx`

`ToolShell({ sidebar?, sidebarTitle?, sidebarFooter?, actions?, info?, full?, children })`
plus `useCurrentTool()`, `useToolChrome()`, `MetaGrid({ rows })`,
`ResultSummary({ title?, children })`, `CountBadge({ value, label })`.

### `core/hooks.ts`

| Hook | Notes |
| --- | --- |
| `useTask<T>()` | `{ status, progress, message, result, error, errorDetail, running, run(fn), reset(), setResult(v), setError(msg,detail?) }`. `fn` receives `report(progress0to1, message?)`. |
| `useObjectUrl(blob)` | object URL with automatic revoke |
| `useDebounced(value, ms?)` | debounce any value |
| `useStoredState(key, initial)` | per-tool option memory in localStorage |
| `useHotkey({key,ctrl?,shift?,alt?}, fn, enabled?)` | keyboard shortcut |
| `useElementSize<T>()` | `[ref, {width,height}]` via ResizeObserver |
| `useAnimationFrame(fn, active)` | rAF loop, `fn(deltaSeconds)` |

### `core/files.ts`

`readAsText`, `readAsArrayBuffer`, `readAsDataURL`, `downloadBlob(blob,name)`,
`downloadText(text,name,mime?)`, `downloadDataUrl`, `zipFiles(entries,onProgress?)`
(entries: `{name, data: Blob|Uint8Array|string}[]`), `unzipFile(blob)`,
`filterByAccept(files, accept)`, `filesFromDataTransfer(dt)`.

### `core/image.ts`

`loadImage(blobOrUrl) => Promise<LoadedImage {source,width,height,dispose()}>`,
`createCanvas(w,h)`, `context2d(canvas)`, `imageToImageData(img)`,
`renderToCanvas(img,w,h,{background?,filter?,smoothing?,rotate?,flipX?,flipY?})`,
`resizeToCanvas(img,w,h,{background?,filter?,smoothing?,cover?})`,
`canvasToBlob(canvas,type,quality?)`, `supportedEncodeTypes()`,
`canvasToImageData`, `imageDataToCanvas`, `scaleImageDataNearest(data,w,h)`,
`analyseAlpha(data,threshold?)`, `findContentBounds(data,alphaThreshold?)`,
`buildSheet(tiles, options)`, `computeFit`, `pickPixel(canvas,x,y)`, `averageColor`.

### `core/color.ts`

`hexToRgb`, `rgbToHex`, `hexToRgba`, `rgbaToHex`, `rgbToHsl`, `hslToRgb`,
`rgbToHsv`, `hsvToRgb`, `rgbToCmyk`, `cmykToRgb`, `parseCssColor`,
`formatRgb`, `formatRgba`, `formatHsl`, `formatHsv`, `formatCmyk`,
`relativeLuminance`, `contrastRatio`, `wcagLevel`, `luminanceToReadableText`,
`rotateHue`, `lighten`, `darken`, `saturate`, `harmonies`, `extractPalette`,
`averageOf`, `nearestColorName`, `clamp255`.

### `core/format.ts`

`formatBytes`, `formatBytesBinary`, `formatNumber`, `formatCompact`,
`formatPercent`, `formatDeltaPercent`, `formatDuration`, `clamp`, `round`,
`basename`, `extname`, `stripExt`, `replaceExt`, `uniqueName`, `fileKindLabel`,
`naturalCompare`, `sortByName`, `truncateMiddle`, `safeFileName`, `padIndex`,
`isPowerOfTwo`, `nextPowerOfTwo`, `gcd`, `aspectRatio`, `formatDateTime`,
`formatRelativeTime`.

### `core/errors.ts`

`UserError(message, detail?)` — throw this for user-facing problems.
`UnsupportedFileError(name, expected)`. `assert(condition, message)`.

---

## 5. Rules (non-negotiable)

1. **Everything runs locally.** No network requests, no external APIs, no new npm
   dependencies. Use the frozen helpers above and browser APIs.
2. **Be honest.** Never claim "lossless", "AI powered" or "zero quality loss"
   unless that is literally what the code does. If a browser limitation blocks
   something (e.g. `.prefab` editing, MP3 encoding, DRACO compression), say so
   in a `Notice` and offer the closest real alternative.
3. **Never use `alert`, `confirm` or `prompt`.** Use toasts, `Notice`, or a
   confirmation `Modal`.
4. **TypeScript strict.** No `any`, no unused variables/parameters (the build
   fails on both), no `@ts-ignore`. `import type` for type-only imports is not
   required but plain `import` of types is fine.
5. **Handle errors.** Wrap file processing in `task.run(...)` or try/catch and
   surface a friendly message. Partial batch results should be reported
   (`queue.setStatus(id, 'error', 'message')`), not silently dropped.
6. **Release resources.** `image.dispose()`, revoke object URLs you create,
   cap batch work (e.g. stop after 300 files with a notice).
7. **Progress for anything slow.** Report per-file progress in batch tools.
8. **Accessibility.** Every icon-only button needs a `label`. Inputs need
   labels. Keep keyboard operability (Enter/Space on custom clickable divs).
9. **No layout jumps.** Give previews a fixed min-height (`.stage` already does),
   and never render a spinner where a preview used to be.
10. **Performance.** Heavy work in a loop must yield progress; avoid per-pixel
    `getImageData` calls in a loop — read once, write once.
11. **Numbers in the UI** go through `formatBytes` / `formatNumber` etc.
12. **Copy tone**: plain, factual, short. No marketing language.

---

## 6. Visual conventions

- Tool-specific CSS goes in `tools/<tool-id>.css` and is imported by the
  component (`import './<tool-id>.css';`). Prefix every class with the tool id:
  `.texture-tiler-preview { }` — never restyle global classes.
- Prefer existing classes: `stack`, `stack-sm`, `row`, `row-wrap`, `spread`,
  `grow`, `grid-2`, `grid-3`, `grid-4`, `grid-auto`, `panel`, `card`, `stage`,
  `checker`, `code`, `table`, `muted`, `dim`, `tiny`, `mono`, `truncate`,
  `section-title`, `empty`.
- Preview surfaces use `.stage` (dark stage) or `.stage.checker` (transparency
  checkerboard).
- Colour pickers / swatches: `.swatch`, `.swatch-sm`.
- Maximum content width is already handled by the shell; do not set page widths.

---

## 7. UX patterns to reuse

- **Batch tool**: `DropZone` (empty) → `QueueHeader` + `FileGrid` (has files) →
  settings in the sidebar → `Process` / `Download ZIP` in the action bar →
  `Stat`s showing totals.
- **Single-file tool**: `DropZone` → `.stage` preview → controls sidebar →
  Compare/Download actions.
- **Text tool**: two-column `grid-2` of `TextArea`s (input / output), controls
  above, `CopyButton` + `Download` in the action bar.
- **Calculator tool**: inputs sidebar, results as `Stat` grid or `CopyField`s.
  Calculators should update live — no Process button.
- **Every tool needs a Reset** that restores defaults and clears the queue.
- Empty states explain what to drop and which formats are accepted.
