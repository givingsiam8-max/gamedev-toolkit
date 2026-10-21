import { useEffect, useRef, useState } from 'react';
import type { Object3D } from 'three';
import { Download, FileText, Package, RefreshCw, ScanSearch } from 'lucide-react';
import { ToolShell } from '../../../components/ToolShell';
import {
  Badge,
  Button,
  CheckBox,
  Field,
  Notice,
  Panel,
  ProgressBar,
  SectionTitle,
  Segmented,
  Select,
  Stat,
  useToast,
} from '../../../components/ui';
import { DropZone, FileGrid, QueueHeader, useFileQueue } from '../../../components/files';
import { useTask } from '../../../core/hooks';
import { downloadBlob } from '../../../core/files';
import { zip } from 'fflate';
import { formatBytes, formatNumber, safeFileName, stripExt } from '../../../core/format';
import { UserError } from '../../../core/errors';
import {
  collectMaterials,
  createFbxLoader,
  exportMeshes,
  extractLoadedMaterialTextures,
  isLikelyFbx,
  revokeLoadedTextureUrls,
  scanFbxMedia,
  type ExtractedAsset,
  type MeshFormat,
} from '../fbx';
import {
  ASSET_MODEL_ACCEPT,
  ASSET_MODEL_LABELS,
  detectAssetFormat,
  loadGenericModel,
  TEXTURE_CAPABLE,
  type AssetModelFormat,
} from '../model-assets';
import { disposeObject } from '../model';
import {
  analyzeComponents,
  prepareComponent,
  waitForComponentTextures,
  type ComponentInfo,
  type SplitFormat,
} from '../fbx-split';
import { exportComponentPackage, type ComponentExport } from '../fbx-split-export';

const MAX_SIZE = 200 * 1024 * 1024;

const MESH_FORMATS: Array<{ value: MeshFormat; label: string }> = [
  { value: 'obj', label: 'OBJ — widely compatible' },
  { value: 'glb', label: 'GLB — geometry + material' },
  { value: 'stl', label: 'STL — geometry only' },
  { value: 'ply', label: 'PLY — geometry only' },
];

const PREVIEWABLE = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp']);

interface Asset extends ExtractedAsset {
  previewUrl?: string;
}

interface FileResult {
  id: string;
  fileName: string;
  format: AssetModelFormat | 'unknown';
  folder: string;
  meshes: Asset[];
  textures: Asset[];
  materials: Array<{ name: string; maps: string[] }>;
  externalRefs: string[];
  warnings: string[];
  failures: string[];
}

interface FbxScanSummary {
  imageCount: number;
  referenceCount: number;
  ascii: boolean;
}

type Mode = 'assets' | 'split';

interface ScannedFile {
  id: string;
  fileName: string;
  folder: string;
  components: ComponentInfo[];
  externalRefs: string[];
  error?: string;
}

interface SplitOutput {
  id: string;
  fileName: string;
  folder: string;
  components: ComponentExport[];
  failures: string[];
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

/** Builds a ZIP that keeps sanitised folder segments (the shared helper flattens paths). */
async function buildZip(entries: Array<{ path: string; data: Blob }>): Promise<Blob> {
  const files: Record<string, Uint8Array> = {};
  for (const entry of entries) {
    const segments = entry.path
      .split('/')
      .map((segment) => safeFileName(segment, 'file'))
      .filter((segment) => segment && segment !== '.' && segment !== '..');
    const path = segments.join('/') || safeFileName(entry.path, 'asset');
    files[path] = new Uint8Array(await entry.data.arrayBuffer());
  }
  return new Promise((resolve, reject) => {
    zip(files, { level: 6 }, (error, data) => {
      if (error) {
        reject(new Error(error.message || 'Could not create the ZIP.'));
        return;
      }
      resolve(new Blob([data as BlobPart], { type: 'application/zip' }));
    });
  });
}

function uniqueAssetName(name: string, used: Set<string>): string {
  if (!used.has(name.toLowerCase())) {
    used.add(name.toLowerCase());
    return name;
  }
  const ext = extensionOf(name);
  const base = ext ? name.slice(0, -(ext.length + 1)) : name;
  let counter = 2;
  let candidate = `${base}-${counter}${ext ? `.${ext}` : ''}`;
  while (used.has(candidate.toLowerCase())) {
    counter += 1;
    candidate = `${base}-${counter}${ext ? `.${ext}` : ''}`;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

export default function FbxAssetExtractor() {
  const toast = useToast();
  const queue = useFileQueue({ accept: ASSET_MODEL_ACCEPT, maxFiles: 30 });
  const [extractMeshesOn, setExtractMeshesOn] = useState(true);
  const [extractTexturesOn, setExtractTexturesOn] = useState(true);
  const [meshFormat, setMeshFormat] = useState<MeshFormat>('obj');
  const [results, setResults] = useState<FileResult[]>([]);
  const [zipBusy, setZipBusy] = useState(false);
  const [scans, setScans] = useState<Record<string, FbxScanSummary>>({});
  const task = useTask<FileResult[]>();
  const previewUrls = useRef<string[]>([]);
  const [mode, setMode] = useState<Mode>('assets');
  const [splitFormat, setSplitFormat] = useState<SplitFormat>('obj');
  const [scanned, setScanned] = useState<ScannedFile[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [splitResults, setSplitResults] = useState<SplitOutput[]>([]);
  const [splitBusy, setSplitBusy] = useState(false);
  const scanTask = useTask<ScannedFile[]>();
  const splitTask = useTask<SplitOutput[]>();
  const rootsRef = useRef<Map<string, { root: Object3D; externalRefs: string[] }>>(new Map());

  useEffect(
    () => () => {
      for (const url of previewUrls.current) URL.revokeObjectURL(url);
      previewUrls.current = [];
    },
    [],
  );

  useEffect(() => {
    const previous = document.title;
    document.title = '3D Asset Extractor — Meshes and Textures from FBX, GLB, OBJ';
    return () => {
      document.title = previous;
    };
  }, []);

  const makePreview = (blob: Blob, ext: string): string | undefined => {
    if (!PREVIEWABLE.has(ext)) return undefined;
    const url = URL.createObjectURL(blob);
    previewUrls.current.push(url);
    return url;
  };

  const clearResults = () => {
    for (const url of previewUrls.current) URL.revokeObjectURL(url);
    previewUrls.current = [];
    setResults([]);
    setScans({});
    task.reset();
  };

  const clearSplit = () => {
    for (const entry of rootsRef.current.values()) disposeObject(entry.root);
    rootsRef.current.clear();
    setScanned([]);
    setSelected(new Set());
    setSplitResults([]);
    scanTask.reset();
    splitTask.reset();
  };

  const scanComponents = () =>
    scanTask.run(async (report) => {
      if (!queue.items.length) throw new UserError('Add at least one 3D model file.');
      for (const entry of rootsRef.current.values()) disposeObject(entry.root);
      rootsRef.current.clear();
      setSplitResults([]);

      const items = [...queue.items];
      const output: ScannedFile[] = [];
      const ids: string[] = [];

      for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        const label = item.file.name;
        const folder = safeFileName(stripExt(label), 'model');
        report(index / items.length, `Reading components from ${label}`);
        queue.setStatus(item.id, 'processing', 'Scanning');

        try {
          const format = detectAssetFormat(label);
          if (!format) {
            throw new UserError(
              'Unsupported 3D format. Use FBX, GLB, GLTF, OBJ, STL, PLY, DAE or 3DS.',
            );
          }
          if (item.file.size === 0) throw new UserError('The file is empty.');
          if (item.file.size > MAX_SIZE) {
            throw new UserError(`File is too large. Limit is ${formatBytes(MAX_SIZE)}.`);
          }

          let root: Object3D;
          let refs: string[] = [];

          if (format === 'fbx') {
            const buffer = await item.file.arrayBuffer();
            if (!isLikelyFbx(buffer)) {
              throw new UserError('This does not look like an FBX file (unrecognized header).');
            }
            const media = scanFbxMedia(buffer);
            const { loader, externalRefs } = createFbxLoader();
            root = loader.parse(buffer.slice(0), '');
            await waitForComponentTextures(root);
            refs = [...new Set([...externalRefs, ...media.references])];
          } else {
            const loaded = await loadGenericModel(item.file);
            root = loaded.root;
            await waitForComponentTextures(root);
            refs = loaded.externalRefs;
          }

          const components = analyzeComponents(root);
          if (!components.length) {
            disposeObject(root);
            throw new UserError(`No mesh objects were found in this ${format.toUpperCase()}.`);
          }

          rootsRef.current.set(item.id, { root, externalRefs: refs });
          output.push({ id: item.id, fileName: label, folder, components, externalRefs: refs });
          for (const component of components) ids.push(component.id);
          queue.setStatus(item.id, 'done', `${components.length} component(s)`);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Could not scan this file.';
          output.push({
            id: item.id,
            fileName: label,
            folder,
            components: [],
            externalRefs: [],
            error: message,
          });
          queue.setStatus(item.id, 'error', message.slice(0, 90));
        }

        await new Promise((resolve) => setTimeout(resolve, 0));
      }

      setScanned(output);
      setSelected(new Set(ids));
      report(1, 'Scan complete');
      if (ids.length) toast.success(`Found ${formatNumber(ids.length)} component(s).`);
      else toast.error('No mesh components were found.');
      return output;
    });

  const toggleComponent = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const setFileSelection = (file: ScannedFile, select: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const component of file.components) {
        if (select) next.add(component.id);
        else next.delete(component.id);
      }
      return next;
    });

  const splitSelected = () =>
    splitTask.run(async (report) => {
      if (!selected.size) throw new UserError('Select at least one component.');
      const total = selected.size;
      let done = 0;
      const output: SplitOutput[] = [];

      for (const file of scanned) {
        const components = file.components.filter((component) => selected.has(component.id));
        if (!components.length) continue;
        const entry = rootsRef.current.get(file.id);
        const exported: ComponentExport[] = [];
        const failures: string[] = [];

        if (!entry) {
          failures.push('The model is no longer loaded. Scan again.');
          output.push({
            id: file.id,
            fileName: file.fileName,
            folder: file.folder,
            components: [],
            failures,
          });
          continue;
        }

        for (const component of components) {
          report(done / total, `Splitting ${component.name}`);
          try {
            const prepared = await prepareComponent(
              component.mesh,
              component.name,
              entry.externalRefs,
              new Set(),
              new Set(),
            );
            try {
              exported.push(await exportComponentPackage(prepared, splitFormat));
            } finally {
              prepared.geometry.dispose();
              for (const material of prepared.materials) material.exportMaterial.dispose();
            }
          } catch (error) {
            failures.push(
              `${component.name}: ${error instanceof Error ? error.message : 'split failed'}`,
            );
          }
          done += 1;
          report(done / total, `Split ${done}/${total}`);
          await new Promise((resolve) => setTimeout(resolve, 0));
        }

        output.push({
          id: file.id,
          fileName: file.fileName,
          folder: file.folder,
          components: exported,
          failures,
        });
      }

      setSplitResults(output);
      const count = output.reduce((sum, file) => sum + file.components.length, 0);
      if (count) {
        toast.success(`Exported ${formatNumber(count)} independent component package(s).`);
      } else {
        toast.error('No components were exported. See the messages below.');
      }
      return output;
    });

  const splitTotal = splitResults.reduce((sum, file) => sum + file.components.length, 0);
  const splitMaterialTotal = splitResults.reduce(
    (sum, file) => sum + file.components.reduce((s, component) => s + component.materialNames.length, 0),
    0,
  );
  const splitTextureTotal = splitResults.reduce(
    (sum, file) => sum + file.components.reduce((s, component) => s + component.textureFiles.length, 0),
    0,
  );

  const downloadSplitZip = async () => {
    if (!splitTotal) return;
    setSplitBusy(true);
    try {
      const multi = splitResults.length > 1;
      const folderCounts = new Map<string, number>();
      const folderFor = (folder: string): string => {
        const base = safeFileName(folder, 'model') || 'model';
        const count = (folderCounts.get(base) ?? 0) + 1;
        folderCounts.set(base, count);
        return count === 1 ? base : `${base}-${count}`;
      };
      const entries: Array<{ path: string; data: Blob }> = [];
      for (const file of splitResults) {
        const filePrefix = multi ? `${folderFor(file.folder)}/` : '';
        for (const component of file.components) {
          const prefix = `${filePrefix}${component.componentName}/`;
          for (const item of component.files) {
            entries.push({ path: prefix + item.path, data: item.data });
          }
        }
      }
      const archive = await buildZip(entries);
      downloadBlob(
        archive,
        multi ? '3d-components.zip' : `${splitResults[0].folder}-components.zip`,
      );
      toast.success(`ZIP created (${formatBytes(archive.size)}).`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create the ZIP.');
    } finally {
      setSplitBusy(false);
    }
  };

  const downloadComponentZip = async (component: ComponentExport) => {
    try {
      const archive = await buildZip(
        component.files.map((file) => ({ path: file.path, data: file.data })),
      );
      downloadBlob(archive, `${component.componentName}.zip`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create the ZIP.');
    }
  };

  const addFiles = (files: File[]) => {
    const oversized = files.filter((file) => file.size > MAX_SIZE);
    const usable = files.filter((file) => file.size <= MAX_SIZE);
    if (oversized.length) {
      toast.error(
        `${oversized.length} file(s) exceed the ${formatBytes(MAX_SIZE)} limit and were skipped.`,
      );
    }
    const added = queue.add(usable);
    if (added.added) {
      clearResults();
      clearSplit();
    }
    if (added.rejected.length) {
      toast.warning(`${added.rejected.length} file(s) are not a supported 3D format and were skipped.`);
    }
  };

  const removeFile = (id: string) => {
    queue.remove(id);
    if (results.length) clearResults();
    if (scanned.length || splitResults.length) clearSplit();
  };

  const run = () =>
    task.run(async (report) => {
      if (!queue.items.length) throw new UserError('Add at least one 3D model file.');
      if (!extractMeshesOn && !extractTexturesOn) {
        throw new UserError('Select meshes, textures, or both.');
      }

      const items = [...queue.items];
      const total = items.length;
      const output: FileResult[] = [];
      const scanSummary: Record<string, FbxScanSummary> = {};
      queue.setAllStatus('ready');

      for (let index = 0; index < total; index += 1) {
        const item = items[index];
        const label = item.file.name;
        const base = index / total;
        queue.setStatus(item.id, 'processing', 'Analyzing');
        report(base + 0.02 / total, `Analyzing ${label}`);

        const warnings: string[] = [];
        const failures: string[] = [];
        const meshes: Asset[] = [];
        const textures: Asset[] = [];
        let materials: Array<{ name: string; maps: string[] }> = [];
        let externalRefs: string[] = [];

        try {
          const format = detectAssetFormat(label);
          if (!format) {
            throw new UserError(
              'Unsupported 3D format. Use FBX, GLB, GLTF, OBJ, STL, PLY, DAE or 3DS.',
            );
          }
          if (item.file.size === 0) throw new UserError('The file is empty.');
          if (item.file.size > MAX_SIZE) {
            throw new UserError(`File is too large. Limit is ${formatBytes(MAX_SIZE)}.`);
          }

          let root: Object3D | null = null;
          let embeddedImages: ExtractedAsset[] = [];
          const isFbx = format === 'fbx';

          if (isFbx) {
            const buffer = await item.file.arrayBuffer();
            if (!isLikelyFbx(buffer)) {
              throw new UserError('This does not look like an FBX file (unrecognized header).');
            }

            report(base + 0.08 / total, `Scanning embedded media in ${label}`);
            const scan = scanFbxMedia(buffer);
            scanSummary[item.id] = {
              imageCount: scan.images.length,
              referenceCount: scan.references.length,
              ascii: scan.ascii,
            };
            externalRefs.push(...scan.references);
            if (scan.ascii) {
              warnings.push(
                'ASCII FBX detected. Embedded textures are uncommon in this variant; external texture files must ship alongside the model.',
              );
            }
            if (scan.error) warnings.push(`Container scan: ${scan.error}`);
            embeddedImages = scan.images.map((image) => ({
              name: safeFileName(image.name, 'texture'),
              blob: new Blob([image.bytes as BlobPart], { type: image.mime }),
            }));

            const { loader, externalRefs: loaderRefs } = createFbxLoader();
            report(base + 0.16 / total, `Reading geometry from ${label}`);
            await new Promise((resolve) => setTimeout(resolve, 0));
            try {
              root = loader.parse(buffer.slice(0), '');
              externalRefs.push(...loaderRefs);
            } catch (error) {
              failures.push(
                `Geometry parsing failed: ${error instanceof Error ? error.message : 'invalid FBX data'}`,
              );
            }
          } else {
            report(base + 0.08 / total, `Reading geometry and media from ${label}`);
            const loaded = await loadGenericModel(item.file);
            root = loaded.root;
            externalRefs.push(...loaded.externalRefs);
            warnings.push(...loaded.warnings);
            embeddedImages = loaded.embeddedImages;
            scanSummary[item.id] = {
              imageCount: embeddedImages.length,
              referenceCount: loaded.externalRefs.length,
              ascii: false,
            };
          }

          if (root) {
            materials = collectMaterials(root);

            if (extractMeshesOn) {
              report(base + 0.22 / total, `Extracting meshes from ${label}`);
              const meshResult = await exportMeshes(root, meshFormat, (done, count, name) => {
                const ratio = done / Math.max(1, count);
                report(base + (0.22 + ratio * 0.5) / total, `Meshes ${done}/${count}: ${name}`);
              });
              meshes.push(...meshResult.assets);
              failures.push(...meshResult.failures);
            }

            if (extractTexturesOn) {
              report(base + 0.75 / total, `Extracting textures from ${label}`);
              if (embeddedImages.length) {
                for (const image of embeddedImages) {
                  const name = safeFileName(image.name, 'texture');
                  textures.push({
                    name,
                    blob: image.blob,
                    previewUrl: makePreview(image.blob, extensionOf(name)),
                  });
                }
              } else if (TEXTURE_CAPABLE.has(format)) {
                const fallback = await extractLoadedMaterialTextures(root);
                for (const asset of fallback.assets) {
                  textures.push({
                    ...asset,
                    previewUrl: makePreview(asset.blob, extensionOf(asset.name)),
                  });
                }
                failures.push(...fallback.failures);
                if (!fallback.assets.length) {
                  warnings.push(
                    isFbx
                      ? 'No embedded textures were found. This FBX may reference textures as external files.'
                      : `No embedded textures were found in this ${format.toUpperCase()}. It may reference external texture files.`,
                  );
                }
              }
            }

            revokeLoadedTextureUrls(root);
            disposeObject(root);
          } else if (extractTexturesOn && embeddedImages.length) {
            // A corrupt scene can still contain usable embedded images.
            for (const image of embeddedImages) {
              const name = safeFileName(image.name, 'texture');
              textures.push({
                name,
                blob: image.blob,
                previewUrl: makePreview(image.blob, extensionOf(name)),
              });
            }
          }

          externalRefs = [...new Set(externalRefs)];

          const usedNames = new Set<string>();
          const uniqueTextures = textures.map((texture) => ({
            ...texture,
            name: uniqueAssetName(texture.name, usedNames),
          }));

          const result: FileResult = {
            id: item.id,
            fileName: label,
            format,
            folder: safeFileName(stripExt(label), 'model'),
            meshes,
            textures: uniqueTextures,
            materials,
            externalRefs,
            warnings,
            failures,
          };
          output.push(result);

          if (meshes.length || uniqueTextures.length) {
            queue.setStatus(
              item.id,
              'done',
              failures.length ? `Partial (${failures.length} issue(s))` : 'Complete',
            );
          } else {
            const reason = failures[0] ?? 'No meshes or textures could be extracted.';
            queue.setStatus(item.id, 'error', reason.slice(0, 90));
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Extraction failed.';
          failures.push(message);
          queue.setStatus(item.id, 'error', message.slice(0, 90));
          output.push({
            id: item.id,
            fileName: label,
            format: detectAssetFormat(label) ?? 'unknown',
            folder: safeFileName(stripExt(label), 'model'),
            meshes: [],
            textures: [],
            materials: [],
            externalRefs,
            warnings,
            failures,
          });
        }

        await new Promise((resolve) => setTimeout(resolve, 0));
      }

      report(1, 'Complete');
      setResults(output);
      setScans(scanSummary);
      const assetCount = output.reduce(
        (sum, file) => sum + file.meshes.length + file.textures.length,
        0,
      );
      if (assetCount > 0) {
        toast.success(`Extracted ${formatNumber(assetCount)} asset(s) from ${total} file(s).`);
      } else {
        toast.error('No assets were extracted. See the per-file messages.');
      }
      return output;
    });

  const downloadAll = async () => {
    if (!results.length) return;
    setZipBusy(true);
    try {
      const multi = results.length > 1;
      const folderCounts = new Map<string, number>();
      const folderFor = (folder: string): string => {
        const base = safeFileName(folder, 'model') || 'model';
        const count = (folderCounts.get(base) ?? 0) + 1;
        folderCounts.set(base, count);
        return count === 1 ? base : `${base}-${count}`;
      };
      const entries: Array<{ path: string; data: Blob }> = [];
      for (const file of results) {
        const folder = multi ? folderFor(file.folder) : '';
        const prefix = folder ? `${folder}/` : '';
        for (const mesh of file.meshes) {
          entries.push({ path: `${prefix}meshes/${mesh.name}`, data: mesh.blob });
        }
        for (const texture of file.textures) {
          entries.push({ path: `${prefix}textures/${texture.name}`, data: texture.blob });
        }
        entries.push({
          path: `${prefix}report.json`,
          data: new Blob(
            [
              JSON.stringify(
                {
                  source: file.fileName,
                  format: file.format,
                  meshes: file.meshes.map((mesh) => ({ name: mesh.name, bytes: mesh.blob.size })),
                  textures: file.textures.map((texture) => ({
                    name: texture.name,
                    bytes: texture.blob.size,
                  })),
                  materials: file.materials,
                  externalReferences: file.externalRefs,
                  warnings: file.warnings,
                  failures: file.failures,
                },
                null,
                2,
              ),
            ],
            { type: 'application/json' },
          ),
        });
      }
      const archive = await buildZip(entries);
      downloadBlob(archive, multi ? '3d-assets.zip' : `${results[0].folder}-assets.zip`);
      toast.success(`ZIP created (${formatBytes(archive.size)}).`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create the ZIP.');
    } finally {
      setZipBusy(false);
    }
  };

  const resetAll = () => {
    if (task.running || scanTask.running || splitTask.running) return;
    clearResults();
    clearSplit();
    queue.clear();
  };

  const totalMeshes = results.reduce((sum, file) => sum + file.meshes.length, 0);
  const totalTextures = results.reduce((sum, file) => sum + file.textures.length, 0);
  const totalBytes = results.reduce(
    (sum, file) =>
      sum +
      file.meshes.reduce((s, mesh) => s + mesh.blob.size, 0) +
      file.textures.reduce((s, texture) => s + texture.blob.size, 0),
    0,
  );

  return (
    <ToolShell
      sidebar={
        <>
          <Field label="Mode">
            <Segmented
              options={[
                { value: 'assets', label: 'Extract assets' },
                { value: 'split', label: 'Split components' },
              ]}
              value={mode}
              onChange={(next) => {
                if (next === mode || scanTask.running || splitTask.running) return;
                setMode(next);
                clearSplit();
              }}
            />
          </Field>
          {mode === 'assets' ? (
            <>
              <Field label="What to extract">
                <div className="stack-sm">
                  <CheckBox
                    checked={extractMeshesOn}
                    onChange={setExtractMeshesOn}
                    label="Extract meshes"
                    hint="One file per mesh object, with world transforms baked in."
                  />
                  <CheckBox
                    checked={extractTexturesOn}
                    onChange={setExtractTexturesOn}
                    label="Extract textures"
                    hint="Embedded images are saved in their original format."
                  />
                </div>
              </Field>
              <Field label="Mesh output format">
                <Select
                  value={meshFormat}
                  onChange={(event) => setMeshFormat(event.target.value as MeshFormat)}
                  options={MESH_FORMATS}
                />
              </Field>
              <Notice tone="info" title="How it works">
                Geometry is read with the matching three.js loader for FBX, GLB/GLTF, DAE, OBJ, STL,
                PLY and 3DS. Embedded textures are decoded from the file itself; external texture
                paths are listed but never fetched.
              </Notice>
              <Notice tone="warning" title="Format limits">
                OBJ, STL and PLY are geometry-only. A single .gltf cannot read external .bin buffers;
                use a self-contained .glb or embedded glTF. External MTL, texture files and glTF
                images are not fetched.
              </Notice>
              <Notice tone="info" title="Limits">
                Maximum {formatBytes(MAX_SIZE)} per file, up to 30 files per batch. Very large or
                unusual models may take a moment to parse.
              </Notice>
            </>
          ) : (
            <>
              <Field label="Export format">
                <Select
                  value={splitFormat}
                  disabled={splitTask.running}
                  onChange={(event) => {
                    setSplitFormat(event.target.value as SplitFormat);
                    setSplitResults([]);
                  }}
                  options={[
                    { value: 'obj', label: 'OBJ + MTL + textures' },
                    { value: 'glb', label: 'GLB (independent materials)' },
                  ]}
                />
              </Field>
              <Notice tone="info" title="Independent components">
                Each selected mesh object is exported on its own with duplicated material definitions
                and its own texture files. Shared source materials never stay shared across
                components.
              </Notice>
              <Notice tone="warning" title="Static split">
                Skinning, morph targets and animation are not included. OBJ keeps UVs and normals; GLB
                also keeps tangents and full PBR maps. Rescan after changing files.
              </Notice>
              <Button
                variant="outline"
                icon={<ScanSearch />}
                loading={scanTask.running}
                disabled={!queue.items.length}
                onClick={() => void scanComponents()}
                block
              >
                Scan Components
              </Button>
            </>
          )}
        </>
      }
      actions={
        mode === 'assets' ? (
          <>
            <Button variant="ghost" icon={<RefreshCw />} onClick={resetAll}>
              Reset
            </Button>
            <Button
              variant="primary"
              icon={<Package />}
              loading={task.running}
              disabled={!queue.items.length || (!extractMeshesOn && !extractTexturesOn)}
              onClick={run}
            >
              Extract Assets
            </Button>
            <Button
              variant="success"
              icon={<Download />}
              disabled={!totalMeshes && !totalTextures}
              loading={zipBusy}
              onClick={() => void downloadAll()}
            >
              Download All as ZIP
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" icon={<RefreshCw />} onClick={resetAll}>
              Reset
            </Button>
            <Button
              variant="primary"
              icon={<ScanSearch />}
              loading={scanTask.running}
              disabled={!queue.items.length || splitTask.running}
              onClick={() => void scanComponents()}
            >
              Scan Components
            </Button>
            <Button
              variant="primary"
              icon={<Package />}
              loading={splitTask.running}
              disabled={!selected.size || !scanned.length || scanTask.running}
              onClick={() => void splitSelected()}
            >
              Split Selected
            </Button>
            <Button
              variant="success"
              icon={<Download />}
              loading={splitBusy}
              disabled={!splitTotal}
              onClick={() => void downloadSplitZip()}
            >
              Download ZIP
            </Button>
          </>
        )
      }
      info={
        mode === 'split'
          ? scanTask.running || splitTask.running
            ? scanTask.message || splitTask.message
            : selected.size
              ? `${formatNumber(selected.size)} component(s) selected`
              : scanned.length
                ? `${formatNumber(
                    scanned.reduce((sum, file) => sum + file.components.length, 0),
                  )} components found`
                : queue.items.length
                  ? `${formatNumber(queue.items.length)} 3D file(s) ready`
                  : undefined
          : task.running
            ? task.message
            : results.length
              ? `${formatNumber(totalMeshes)} meshes · ${formatNumber(totalTextures)} textures`
              : queue.items.length
                ? `${formatNumber(queue.items.length)} 3D file(s) ready`
                : undefined
      }
    >
      {queue.items.length === 0 ? (
        <DropZone
          onFiles={addFiles}
          accept={ASSET_MODEL_ACCEPT}
          multiple
          formats={ASSET_MODEL_LABELS}
          size="lg"
          title="Drop 3D models or choose them"
          hint="FBX, GLB, GLTF, OBJ, STL, PLY, DAE and 3DS. Add several files to extract them in one batch."
          icon={<Package />}
        />
      ) : (
        <Panel
          title="3D model files"
          actions={
            <QueueHeader
              count={queue.items.length}
              onClear={() => {
                resetAll();
              }}
            />
          }
        >
          <FileGrid
            items={queue.items}
            onRemove={removeFile}
            disabled={task.running || scanTask.running || splitTask.running}
          />
        </Panel>
      )}

      {mode === 'assets' ? (
        <>
      {task.running && (
        <Panel title="Processing">
          <div className="stack">
            <ProgressBar value={task.progress} label={task.message || 'Working…'} />
            <div className="row-wrap tiny dim">
              <span>Reading files</span>
              <span>→</span>
              <span>Analyzing</span>
              <span>→</span>
              <span>Extracting meshes</span>
              <span>→</span>
              <span>Extracting textures</span>
            </div>
          </div>
        </Panel>
      )}

      {zipBusy && (
        <Notice tone="info" title="Creating ZIP">
          <ProgressBar indeterminate value={0} label="Packaging files…" />
        </Notice>
      )}

      {task.error && (
        <Notice tone="error" title="Extraction failed">
          {task.error}
        </Notice>
      )}

      {results.length > 0 && (
        <div className="grid-4">
          <Stat label="Files" value={formatNumber(results.length)} />
          <Stat label="Meshes" value={formatNumber(totalMeshes)} />
          <Stat label="Textures" value={formatNumber(totalTextures)} />
          <Stat label="Extracted size" value={formatBytes(totalBytes)} />
        </div>
      )}

      {results.map((file) => {
        const scan = scans[file.id];
        const hasAssets = file.meshes.length + file.textures.length > 0;
        return (
          <Panel
            key={file.id}
            title={file.fileName}
            actions={
              <div className="row-wrap">
                <Badge tone={hasAssets ? (file.failures.length ? 'warning' : 'success') : 'danger'}>
                  {hasAssets
                    ? file.failures.length
                      ? 'Completed with issues'
                      : 'Extraction complete'
                    : 'Failed'}
                </Badge>
                <Badge>{formatNumber(file.meshes.length)} meshes</Badge>
                <Badge>{formatNumber(file.textures.length)} textures</Badge>
              </div>
            }
          >
            <div className="stack">
              {file.failures.length > 0 && (
                <Notice tone="warning" title="Issues for this file">
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {file.failures.map((failure, index) => (
                      <li key={index}>{failure}</li>
                    ))}
                  </ul>
                </Notice>
              )}

              {scan?.ascii && (
                <Notice tone="info" title="ASCII FBX">
                  External texture files cannot be embedded in the ZIP; ship them with the model.
                </Notice>
              )}

              <div>
                <SectionTitle icon={<FileText />}>Meshes</SectionTitle>
                {file.meshes.length === 0 ? (
                  <div className="dim tiny" style={{ marginTop: 8 }}>
                    No meshes were extracted{extractMeshesOn ? '' : ' (mesh extraction is off)'}.
                  </div>
                ) : (
                  <div className="stack-sm" style={{ marginTop: 8 }}>
                    {file.meshes.map((mesh) => (
                      <div key={mesh.name} className="row spread">
                        <span className="row" style={{ minWidth: 0 }}>
                          <FileText style={{ width: 15, height: 15, color: 'var(--text-2)' }} />
                          <span className="mono tiny truncate" title={mesh.name}>
                            {mesh.name}
                          </span>
                          <span className="dim tiny nowrap">{formatBytes(mesh.blob.size)}</span>
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          icon={<Download />}
                          onClick={() => downloadBlob(mesh.blob, mesh.name)}
                        >
                          Download
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <SectionTitle icon={<Package />}>Textures</SectionTitle>
                {file.textures.length === 0 ? (
                  <div className="dim tiny" style={{ marginTop: 8 }}>
                    No embedded textures were found
                    {extractTexturesOn ? '' : ' (texture extraction is off)'}.
                  </div>
                ) : (
                  <div className="filegrid" style={{ marginTop: 8 }}>
                    {file.textures.map((texture) => (
                      <div className="filecard" key={texture.name}>
                        <div className="filecard-thumb checker">
                          {texture.previewUrl ? (
                            <img src={texture.previewUrl} alt="" loading="lazy" />
                          ) : (
                            <FileText />
                          )}
                        </div>
                        <div className="filecard-body">
                          <span className="filecard-name" title={texture.name}>
                            {texture.name}
                          </span>
                          <span className="filecard-meta">{formatBytes(texture.blob.size)}</span>
                          <Button
                            size="sm"
                            variant="outline"
                            icon={<Download />}
                            onClick={() => downloadBlob(texture.blob, texture.name)}
                          >
                            Download
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {file.materials.length > 0 && (
                <div>
                  <SectionTitle icon={<Package />}>Materials</SectionTitle>
                  <div className="row-wrap" style={{ marginTop: 8 }}>
                    {file.materials.map((material, index) => (
                      <span key={`${material.name}-${index}`} className="chip">
                        <span className="strong">{material.name}</span>
                        {material.maps.length > 0 && (
                          <span className="dim">{material.maps.join(', ')}</span>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {file.externalRefs.length > 0 && (
                <Notice tone="info" title="External references">
                  These paths are referenced by the model but not embedded, so they cannot be
                  extracted from the file:
                  <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                    {file.externalRefs.slice(0, 20).map((ref) => (
                      <li key={ref} className="mono tiny">
                        {ref}
                      </li>
                    ))}
                  </ul>
                  {file.externalRefs.length > 20 && (
                    <div className="dim tiny" style={{ marginTop: 6 }}>
                      +{file.externalRefs.length - 20} more
                    </div>
                  )}
                </Notice>
              )}

              {file.warnings.length > 0 && (
                <Notice tone="warning" title="Notes">
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {file.warnings.map((warning, index) => (
                      <li key={index}>{warning}</li>
                    ))}
                  </ul>
                </Notice>
              )}

              <div className="row" style={{ marginTop: 4 }}>
                <Button
                  size="sm"
                  variant="outline"
                  icon={<RefreshCw />}
                  onClick={resetAll}
                >
                  Start New Extraction
                </Button>
              </div>
            </div>
          </Panel>
        );
      })}
        </>
      ) : (
        <>
          {scanTask.error && (
            <Notice tone="error" title="Could not scan components">
              {scanTask.error}
            </Notice>
          )}

          {scanTask.running && (
            <Panel title="Scanning components">
              <ProgressBar
                value={scanTask.progress}
                label={scanTask.message || 'Reading components…'}
              />
            </Panel>
          )}

          {!scanned.length && !scanTask.running && queue.items.length > 0 && (
            <Notice tone="info" title="Scan first">
              Press <strong>Scan Components</strong> to list the mesh objects inside your 3D files,
              then choose which ones to export. Each component receives independent materials and its
              own texture files.
            </Notice>
          )}

          {scanned.map((file) => (
            <Panel
              key={file.id}
              title={file.fileName}
              actions={
                <div className="row-wrap">
                  <Badge tone={file.error ? 'danger' : 'accent'}>
                    {file.error
                      ? 'Scan failed'
                      : `${formatNumber(file.components.length)} components`}
                  </Badge>
                  {!file.error && (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setFileSelection(file, true)}
                      >
                        Select all
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setFileSelection(file, false)}
                      >
                        Clear
                      </Button>
                    </>
                  )}
                </div>
              }
            >
              {file.error ? (
                <Notice tone="error" title="This file could not be scanned">
                  {file.error}
                </Notice>
              ) : (
                <div className="stack-sm">
                  {file.components.map((component) => (
                    <div
                      key={component.id}
                      className="row"
                      style={{ alignItems: 'flex-start', gap: 12 }}
                    >
                      <div className="grow" style={{ minWidth: 0 }}>
                        <CheckBox
                          checked={selected.has(component.id)}
                          onChange={() => toggleComponent(component.id)}
                          label={component.name}
                        />
                        <div className="dim tiny" style={{ marginLeft: 25 }}>
                          {formatNumber(component.vertices)} verts ·{' '}
                          {formatNumber(component.triangles)} tris ·{' '}
                          {component.materialNames.length} material slot(s) ·{' '}
                          {component.textureCount} texture(s)
                        </div>
                      </div>
                      <div
                        className="row-wrap"
                        style={{ maxWidth: '52%', justifyContent: 'flex-end' }}
                      >
                        {component.materialNames.map((name, materialIndex) => (
                          <span key={`${name}-${materialIndex}`} className="chip chip-format">
                            {name}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                  {file.externalRefs.length > 0 && (
                    <div className="dim tiny">
                      {formatNumber(file.externalRefs.length)} external resource reference(s) will be
                      listed in each component report.
                    </div>
                  )}
                </div>
              )}
            </Panel>
          ))}

          {splitTask.running && (
            <Panel title="Splitting components">
              <ProgressBar
                value={splitTask.progress}
                label={splitTask.message || 'Working…'}
              />
            </Panel>
          )}

          {splitTask.error && (
            <Notice tone="error" title="Split failed">
              {splitTask.error}
            </Notice>
          )}

          {splitResults.length > 0 && (
            <>
              <div className="grid-3">
                <Stat label="Components" value={formatNumber(splitTotal)} />
                <Stat label="Materials" value={formatNumber(splitMaterialTotal)} />
                <Stat label="Textures" value={formatNumber(splitTextureTotal)} />
              </div>

              {splitResults.map((file) => (
                <Panel
                  key={file.id}
                  title={file.fileName}
                  actions={
                    <Badge tone="success">
                      {formatNumber(file.components.length)} exported
                    </Badge>
                  }
                >
                  <div className="stack">
                    {file.failures.length > 0 && (
                      <Notice tone="warning" title="Some components failed">
                        <ul style={{ margin: 0, paddingLeft: 18 }}>
                          {file.failures.map((failure, index) => (
                            <li key={index}>{failure}</li>
                          ))}
                        </ul>
                      </Notice>
                    )}

                    {file.components.map((component) => (
                      <div key={component.componentName} className="card">
                        <div className="spread">
                          <div style={{ minWidth: 0 }}>
                            <div className="strong">{component.componentName}</div>
                            <div className="dim tiny">
                              {component.meshFile} · {component.materialNames.length} material(s) ·{' '}
                              {component.textureFiles.length} texture(s)
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            icon={<Download />}
                            onClick={() => void downloadComponentZip(component)}
                          >
                            Download .zip
                          </Button>
                        </div>
                        <div className="row-wrap" style={{ marginTop: 8 }}>
                          {component.materialNames.map((name) => (
                            <span key={name} className="chip">
                              <span className="strong">{name}</span>
                            </span>
                          ))}
                        </div>
                        {component.textureFiles.length > 0 && (
                          <div className="dim tiny" style={{ marginTop: 6 }}>
                            textures/{component.textureFiles.join(', textures/')}
                          </div>
                        )}
                        {component.externalRefs.length > 0 && (
                          <div className="dim tiny" style={{ marginTop: 6 }}>
                            {formatNumber(component.externalRefs.length)} external reference(s) — see
                            materials.json
                          </div>
                        )}
                        {component.notes.length > 0 && (
                          <div className="dim tiny" style={{ marginTop: 6 }}>
                            {component.notes.join(' ')}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </Panel>
              ))}

              <div className="row">
                <Button variant="outline" icon={<RefreshCw />} onClick={resetAll}>
                  Start New Extraction
                </Button>
              </div>
            </>
          )}
        </>
      )}
    </ToolShell>
  );
}
