import { useRef, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js';
import { PLYExporter } from 'three/examples/jsm/exporters/PLYExporter.js';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { ToolShell } from '../../../components/ToolShell';
import {
  Button,
  CheckBox,
  Field,
  Notice,
  Panel,
  Select,
  Stat,
  useToast,
} from '../../../components/ui';
import { DropZone } from '../../../components/files';
import { useTask } from '../../../core/hooks';
import { downloadBlob } from '../../../core/files';
import { formatBytes, formatNumber, stripExt } from '../../../core/format';
import { UserError } from '../../../core/errors';
import {
  collectStats,
  loadModelFile,
  MODEL_ACCEPT,
  type LoadedModel,
  type ModelStats,
} from '../model';
import { exportAsciiFbx } from '../fbx-export';

type Target = 'glb' | 'gltf' | 'obj' | 'stl' | 'ply' | 'fbx';

const TARGETS: Array<{ value: Target; label: string }> = [
  { value: 'glb', label: 'GLB (binary glTF)' },
  { value: 'gltf', label: 'glTF (JSON)' },
  { value: 'obj', label: 'OBJ' },
  { value: 'fbx', label: 'FBX (ASCII 7.4, static meshes)' },
  { value: 'stl', label: 'STL' },
  { value: 'ply', label: 'PLY' },
];

export default function ModelConverter() {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [target, setTarget] = useState<Target>('glb');
  const [binary, setBinary] = useState(true);
  const [stats, setStats] = useState<ModelStats | null>(null);
  const modelRef = useRef<LoadedModel | null>(null);
  const loadTask = useTask<ModelStats>();
  const convertTask = useTask<{ blob: Blob; name: string }>();

  const onFiles = async (files: File[]) => {
    const picked = files[0];
    if (!picked) return;
    setFile(picked);
    setStats(null);
    convertTask.reset();
    await loadTask.run(async () => {
      modelRef.current?.dispose();
      const model = await loadModelFile(picked);
      modelRef.current = model;
      const value = collectStats(model.root, model.animations);
      setStats(value);
      return value;
    });
  };

  const run = () =>
    convertTask.run(async (report) => {
      const model = modelRef.current;
      if (!model || !file) throw new UserError('Load a model first.');
      const base = stripExt(file.name);

      if (target === 'glb' || target === 'gltf') {
        const result = await new GLTFExporter().parseAsync(model.root, { binary: target === 'glb' });
        if (target === 'glb') {
          return {
            blob: new Blob([result as ArrayBuffer], { type: 'model/gltf-binary' }),
            name: `${base}.glb`,
          };
        }
        return {
          blob: new Blob([JSON.stringify(result, null, 2)], { type: 'model/gltf+json' }),
          name: `${base}.gltf`,
        };
      }

      if (target === 'obj') {
        const text = new OBJExporter().parse(model.root);
        return { blob: new Blob([text], { type: 'text/plain' }), name: `${base}.obj` };
      }

      if (target === 'fbx') {
        const text = await exportAsciiFbx(model.root, {
          onProgress: (done, total, name) => {
            report(total > 0 ? done / total : 1, `Writing FBX mesh ${done}/${total}: ${name}`);
          },
        });
        return {
          blob: new Blob([text], { type: 'model/fbx' }),
          name: `${base}.fbx`,
        };
      }

      if (target === 'stl') {
        const exporter = new STLExporter();
        if (binary) {
          const data = exporter.parse(model.root, { binary: true });
          return { blob: new Blob([data as unknown as BlobPart], { type: 'model/stl' }), name: `${base}.stl` };
        }
        const text = exporter.parse(model.root, { binary: false });
        return { blob: new Blob([text], { type: 'model/stl' }), name: `${base}.stl` };
      }

      const ply = await new Promise<string | ArrayBuffer>((resolve, reject) => {
        try {
          new PLYExporter().parse(model.root, (result) => resolve(result), { binary });
        } catch (error) {
          reject(error instanceof Error ? error : new Error('PLY export failed'));
        }
      });
      return { blob: new Blob([ply as BlobPart]), name: `${base}.ply` };
    });

  const reset = () => {
    modelRef.current?.dispose();
    modelRef.current = null;
    setFile(null);
    setStats(null);
    setTarget('glb');
    setBinary(true);
    loadTask.reset();
    convertTask.reset();
  };

  const isBinaryCapable = target === 'stl' || target === 'ply';

  return (
    <ToolShell
      sidebar={
        <>
          <Field label="Output format">
            <Select
              value={target}
              onChange={(e) => {
                setTarget(e.target.value as Target);
                convertTask.reset();
              }}
              options={TARGETS}
            />
          </Field>
          {isBinaryCapable && (
            <CheckBox
              checked={binary}
              onChange={setBinary}
              label="Binary output"
              hint={target === 'stl' ? 'Binary STL is much smaller than ASCII.' : 'Binary PLY keeps precision compactly.'}
            />
          )}
          <Notice tone="warning" title="FBX export is static">
            FBX output is ASCII 7.4 with meshes (baked world transforms) and basic Phong materials.
            Skinning, morph targets, animations and embedded textures are not written, and DAE export
            is not available. GLB is the better choice when you need materials and animations
            preserved. STL and PLY drop UVs and materials by design.
          </Notice>
          <Notice tone="info">
            glTF export embeds textures when the exporter can read them; unsupported texture encodings
            may be skipped. FBX export never embeds textures.
          </Notice>
        </>
      }
      actions={
        <>
          <Button variant="ghost" icon={<RefreshCw />} onClick={reset}>
            Reset
          </Button>
          <Button variant="primary" loading={convertTask.running} disabled={!modelRef.current || loadTask.running} onClick={run}>
            Convert
          </Button>
          <Button
            variant="success"
            icon={<Download />}
            disabled={!convertTask.result}
            onClick={() => {
              if (!convertTask.result) return;
              downloadBlob(convertTask.result.blob, convertTask.result.name);
              toast.success('Downloaded.');
            }}
          >
            Download
          </Button>
        </>
      }
      info={stats ? `${formatNumber(stats.triangles)} triangles` : undefined}
    >
      {!file ? (
        <DropZone
          onFiles={(files) => void onFiles(files)}
          accept={MODEL_ACCEPT}
          formats={['GLB', 'GLTF', 'FBX', 'OBJ', 'STL', 'PLY', 'DAE']}
          size="lg"
          multiple={false}
          title="Drop a 3D model to convert"
        />
      ) : (
        <Panel title={file.name}>
          {loadTask.running && <div className="dim tiny">Loading model…</div>}
          {loadTask.error && (
            <Notice tone="error" title="Could not load">
              {loadTask.error}
            </Notice>
          )}
          {stats && (
            <div className="grid-4">
              <Stat label="Vertices" value={formatNumber(stats.vertices)} />
              <Stat label="Triangles" value={formatNumber(stats.triangles)} />
              <Stat label="Meshes" value={formatNumber(stats.meshes)} />
              <Stat label="Animations" value={formatNumber(stats.animations)} />
            </div>
          )}
        </Panel>
      )}

      {convertTask.error && (
        <Notice tone="error" title="Conversion failed">
          {convertTask.error}
        </Notice>
      )}
      {convertTask.result && (
        <div className="grid-3">
          <Stat label="Format" value={target.toUpperCase()} />
          <Stat label="Output size" value={formatBytes(convertTask.result.blob.size)} />
          <Stat label="File" value={convertTask.result.name} />
        </div>
      )}
    </ToolShell>
  );
}
