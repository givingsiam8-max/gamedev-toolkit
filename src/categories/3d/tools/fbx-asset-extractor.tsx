import { useEffect, useRef, useState } from 'react';
import type { Group } from 'three';
import { Download, FileText, Package, RefreshCw } from 'lucide-react';
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
import { disposeObject } from '../model';

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
  const queue = useFileQueue({ accept: '.fbx', maxFiles: 30 });
  const [extractMeshesOn, setExtractMeshesOn] = useState(true);
  const [extractTexturesOn, setExtractTexturesOn] = useState(true);
  const [meshFormat, setMeshFormat] = useState<MeshFormat>('obj');
  const [results, setResults] = useState<FileResult[]>([]);
  const [zipBusy, setZipBusy] = useState(false);
  const [scans, setScans] = useState<Record<string, FbxScanSummary>>({});
  const task = useTask<FileResult[]>();
  const previewUrls = useRef<string[]>([]);

  useEffect(
    () => () => {
      for (const url of previewUrls.current) URL.revokeObjectURL(url);
      previewUrls.current = [];
    },
    [],
  );

  useEffect(() => {
    const previous = document.title;
    document.title = 'FBX Asset Extractor — Extract Meshes and Textures Online';
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

  const addFiles = (files: File[]) => {
    const oversized = files.filter((file) => file.size > MAX_SIZE);
    const usable = files.filter((file) => file.size <= MAX_SIZE);
    if (oversized.length) {
      toast.error(
        `${oversized.length} file(s) exceed the ${formatBytes(MAX_SIZE)} limit and were skipped.`,
      );
    }
    const added = queue.add(usable);
    if (added.added) clearResults();
    if (added.rejected.length) {
      toast.warning(`${added.rejected.length} file(s) are not .fbx and were skipped.`);
    }
  };

  const removeFile = (id: string) => {
    queue.remove(id);
    if (results.length) clearResults();
  };

  const run = () =>
    task.run(async (report) => {
      if (!queue.items.length) throw new UserError('Add at least one FBX file.');
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
          if (!/\.fbx$/i.test(label)) throw new UserError('Only .fbx files are supported.');
          if (item.file.size === 0) throw new UserError('The file is empty.');
          if (item.file.size > MAX_SIZE) {
            throw new UserError(`File is too large. Limit is ${formatBytes(MAX_SIZE)}.`);
          }

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

          let root: Group | null = null;
          const { loader, externalRefs: loaderRefs } = createFbxLoader();
          report(base + 0.16 / total, `Reading geometry from ${label}`);
          await new Promise((resolve) => setTimeout(resolve, 0));

          try {
            root = loader.parse(buffer.slice(0), '');
          } catch (error) {
            failures.push(
              `Geometry parsing failed: ${error instanceof Error ? error.message : 'invalid FBX data'}`,
            );
          }

          if (root) {
            materials = collectMaterials(root);
            externalRefs.push(...loaderRefs);

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
              if (scan.images.length) {
                for (const image of scan.images) {
                  const blob = new Blob([image.bytes as BlobPart], { type: image.mime });
                  const name = safeFileName(image.name, 'texture');
                  textures.push({
                    name,
                    blob,
                    previewUrl: makePreview(blob, extensionOf(name)),
                  });
                }
              } else {
                const fallback = await extractLoadedMaterialTextures(root);
                for (const asset of fallback.assets) {
                  textures.push({
                    ...asset,
                    previewUrl: makePreview(asset.blob, extensionOf(asset.name)),
                  });
                }
                failures.push(...fallback.failures);
                if (!fallback.assets.length && !scan.images.length && !scan.ascii) {
                  warnings.push(
                    'No embedded textures were found. This FBX may reference textures as external files.',
                  );
                }
              }
            }

            revokeLoadedTextureUrls(root);
            disposeObject(root);
          } else if (extractTexturesOn && scan.images.length) {
            // A corrupt scene can still contain usable embedded images.
            for (const image of scan.images) {
              const blob = new Blob([image.bytes as BlobPart], { type: image.mime });
              const name = safeFileName(image.name, 'texture');
              textures.push({ name, blob, previewUrl: makePreview(blob, extensionOf(name)) });
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
            folder: safeFileName(stripExt(label), 'fbx'),
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
            folder: safeFileName(stripExt(label), 'fbx'),
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
        const base = safeFileName(folder, 'fbx') || 'fbx';
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
                  meshes: file.meshes.map((mesh) => ({ name: mesh.name, bytes: mesh.blob.size })),
                  textures: file.textures.map((texture) => ({
                    name: texture.name,
                    bytes: texture.blob.size,
                  })),
                  materials: file.materials,
                  externalTextureReferences: file.externalRefs,
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
      downloadBlob(archive, multi ? 'fbx-assets.zip' : `${results[0].folder}-assets.zip`);
      toast.success(`ZIP created (${formatBytes(archive.size)}).`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create the ZIP.');
    } finally {
      setZipBusy(false);
    }
  };

  const resetAll = () => {
    clearResults();
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
            Geometry is read with three.js FBXLoader. Embedded textures are decoded from the FBX
            container itself. External texture paths are listed but never fetched.
          </Notice>
          <Notice tone="warning" title="Limits">
            Maximum {formatBytes(MAX_SIZE)} per file, up to 30 files per batch. Very large or unusual
            FBX files may take a moment to parse.
          </Notice>
        </>
      }
      actions={
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
      }
      info={
        task.running
          ? task.message
          : results.length
            ? `${formatNumber(totalMeshes)} meshes · ${formatNumber(totalTextures)} textures`
            : queue.items.length
              ? `${formatNumber(queue.items.length)} FBX file(s) ready`
              : undefined
      }
    >
      {queue.items.length === 0 ? (
        <DropZone
          onFiles={addFiles}
          accept=".fbx"
          multiple
          formats={['FBX']}
          size="lg"
          title="Drop FBX files or choose them"
          hint="Drag & drop works too. Add several files to extract them in one batch."
          icon={<Package />}
        />
      ) : (
        <Panel
          title="FBX files"
          actions={
            <QueueHeader
              count={queue.items.length}
              onClear={() => {
                resetAll();
              }}
            />
          }
        >
          <FileGrid items={queue.items} onRemove={removeFile} disabled={task.running} />
        </Panel>
      )}

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
                <Notice tone="info" title="External texture references">
                  These paths are referenced by the FBX but not embedded, so they cannot be extracted
                  from the file:
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
    </ToolShell>
  );
}
