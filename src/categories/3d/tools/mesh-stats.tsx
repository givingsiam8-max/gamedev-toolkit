import { useState } from 'react';
import type * as THREE from 'three';
import { Download, Hash, RefreshCw } from 'lucide-react';
import { ToolShell } from '../../../components/ToolShell';
import {
  Button,
  Notice,
  Panel,
  ProgressBar,
  Stat,
  useToast,
} from '../../../components/ui';
import { DropZone } from '../../../components/files';
import { useTask } from '../../../core/hooks';
import { downloadText } from '../../../core/files';
import { formatBytes, formatNumber, stripExt } from '../../../core/format';
import { UserError } from '../../../core/errors';
import {
  collectStats,
  loadModelFile,
  MODEL_ACCEPT,
  type ModelStats,
} from '../model';

interface MeshRow {
  name: string;
  vertices: number;
  triangles: number;
  hasNormals: boolean;
  hasUv: boolean;
  hasColor: boolean;
  hasSkin: boolean;
  material: string;
  drawCalls: number;
  vram: number;
}

interface Report {
  rows: MeshRow[];
  stats: ModelStats;
  totalVram: number;
  totalDrawCalls: number;
}

export default function MeshStatistics() {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const task = useTask<Report>();

  const onFiles = async (files: File[]) => {
    const picked = files[0];
    if (!picked) return;
    setFile(picked);
    setReport(null);
    await task.run(async () => {
      const model = await loadModelFile(picked);
      try {
        const rows: MeshRow[] = [];
        model.root.traverse((object: THREE.Object3D) => {
          const mesh = object as THREE.Mesh;
          if (!mesh.isMesh || !mesh.geometry) return;
          const geometry = mesh.geometry;
          const position = geometry.getAttribute('position');
          const vertices = position?.count ?? 0;
          const index = geometry.getIndex();
          const triangles = index ? index.count / 3 : vertices / 3;
          const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          const materialNames = materials
            .filter((material): material is THREE.Material => Boolean(material))
            .map((material) => material.name || 'unnamed');

          const bytesPerVertex =
            (position ? 12 : 0) +
            (geometry.getAttribute('normal') ? 12 : 0) +
            (geometry.getAttribute('uv') ? 8 : 0) +
            (geometry.getAttribute('color') ? 16 : 0);
          const vram = vertices * bytesPerVertex + (index?.count ?? 0) * 4;

          rows.push({
            name: mesh.name || `mesh_${rows.length}`,
            vertices,
            triangles: Math.round(triangles),
            hasNormals: Boolean(geometry.getAttribute('normal')),
            hasUv: Boolean(geometry.getAttribute('uv')),
            hasColor: Boolean(geometry.getAttribute('color')),
            hasSkin: Boolean(geometry.getAttribute('skinIndex')),
            material: materialNames.join(', ') || '—',
            drawCalls: Math.max(1, materialNames.length),
            vram,
          });
        });

        if (!rows.length) throw new UserError('No renderable meshes were found in this file.');
        const stats = collectStats(model.root, model.animations);
        const value: Report = {
          rows,
          stats,
          totalVram: rows.reduce((sum, row) => sum + row.vram, 0),
          totalDrawCalls: rows.reduce((sum, row) => sum + row.drawCalls, 0),
        };
        setReport(value);
        return value;
      } finally {
        model.dispose();
      }
    });
  };

  const exportCsv = () => {
    if (!report) return;
    const header = 'mesh,vertices,triangles,normals,uv,color,skinned,material,draw_calls,vram_bytes';
    const lines = report.rows.map((row) =>
      [
        `"${row.name.replace(/"/g, '""')}"`,
        row.vertices,
        row.triangles,
        row.hasNormals ? 'yes' : 'no',
        row.hasUv ? 'yes' : 'no',
        row.hasColor ? 'yes' : 'no',
        row.hasSkin ? 'yes' : 'no',
        `"${row.material.replace(/"/g, '""')}"`,
        row.drawCalls,
        row.vram,
      ].join(','),
    );
    downloadText([header, ...lines].join('\n'), `${stripExt(file?.name ?? 'model')}-mesh-stats.csv`, 'text/csv');
    toast.success('Mesh report exported.');
  };

  const exportJson = () => {
    if (!report) return;
    downloadText(
      JSON.stringify(
        { source: file?.name ?? 'model', totals: report.stats, estimatedVertexMemory: report.totalVram, drawCalls: report.totalDrawCalls, meshes: report.rows },
        null,
        2,
      ),
      `${stripExt(file?.name ?? 'model')}-mesh-stats.json`,
      'application/json',
    );
  };

  const reset = () => {
    setFile(null);
    setReport(null);
    task.reset();
  };

  return (
    <ToolShell
      actions={
        <>
          <Button variant="ghost" icon={<RefreshCw />} onClick={reset}>
            Reset
          </Button>
          <Button variant="outline" icon={<Download />} disabled={!report} onClick={exportJson}>
            JSON
          </Button>
          <Button variant="success" icon={<Download />} disabled={!report} onClick={exportCsv}>
            CSV
          </Button>
        </>
      }
      info={report ? `${formatNumber(report.rows.length)} mesh(es)` : undefined}
    >
      {!file ? (
        <DropZone
          onFiles={(files) => void onFiles(files)}
          accept={MODEL_ACCEPT}
          formats={['GLB', 'GLTF', 'FBX', 'OBJ', 'STL', 'PLY', 'DAE', '3DS']}
          size="lg"
          multiple={false}
          icon={<Hash />}
          title="Drop a 3D model to analyse its meshes"
        />
      ) : (
        <Panel title={file.name}>
          {task.running && (
            <div className="stack-sm">
              <span className="dim tiny">Reading mesh data…</span>
              <ProgressBar value={task.progress} label={task.message} />
            </div>
          )}
          {task.error && (
            <Notice tone="error" title="Could not analyse">
              {task.error}
            </Notice>
          )}
          {report && (
            <div className="grid-4">
              <Stat label="Vertices" value={formatNumber(report.stats.vertices)} />
              <Stat label="Triangles" value={formatNumber(report.stats.triangles)} />
              <Stat label="Meshes" value={formatNumber(report.stats.meshes)} />
              <Stat label="Materials" value={formatNumber(report.stats.materials)} />
            </div>
          )}
        </Panel>
      )}

      {report && (
        <>
          <div className="grid-4">
            <Stat label="Textures" value={formatNumber(report.stats.textures)} />
            <Stat label="Bones" value={formatNumber(report.stats.bones)} />
            <Stat label="Draw calls" value={formatNumber(report.totalDrawCalls)} sub="mesh × material" />
            <Stat label="Vertex memory" value={formatBytes(report.totalVram)} sub="positions + normals + UVs + indices" />
          </div>

          <Panel title="Per mesh" flush>
            <div style={{ maxHeight: 460, overflow: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Mesh</th>
                    <th>Verts</th>
                    <th>Tris</th>
                    <th>N</th>
                    <th>UV</th>
                    <th>Col</th>
                    <th>Skin</th>
                    <th>Material</th>
                    <th>Memory</th>
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((row, index) => (
                    <tr key={`${row.name}-${index}`}>
                      <td className="mono tiny">{row.name}</td>
                      <td className="mono tiny">{formatNumber(row.vertices)}</td>
                      <td className="mono tiny">{formatNumber(row.triangles)}</td>
                      <td className="tiny">{row.hasNormals ? '✓' : '—'}</td>
                      <td className="tiny">{row.hasUv ? '✓' : '—'}</td>
                      <td className="tiny">{row.hasColor ? '✓' : '—'}</td>
                      <td className="tiny">{row.hasSkin ? '✓' : '—'}</td>
                      <td className="mono tiny">{row.material}</td>
                      <td className="mono tiny">{formatBytes(row.vram)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Notice tone="warning" title="Estimates, not profiler numbers">
            Vertex memory assumes tightly packed float attributes and a 32-bit index buffer. Draw
            calls are estimated as one per material per mesh; instancing and batching can reduce
            them, while submeshes and shadow passes can increase them.
          </Notice>
        </>
      )}
    </ToolShell>
  );
}
