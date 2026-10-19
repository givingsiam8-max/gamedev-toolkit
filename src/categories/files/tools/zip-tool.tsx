import { useState } from 'react';
import { Archive, Download, RefreshCw } from 'lucide-react';
import { ToolShell } from '../../../components/ToolShell';
import { Button, CheckBox, Field, Notice, Panel, Segmented, Stat, TextInput, useToast } from '../../../components/ui';
import { DropZone, FileGrid, QueueHeader, useFileQueue } from '../../../components/files';
import { downloadBlob, unzipFile, zipFiles, type UnzippedEntry } from '../../../core/files';
import { useTask } from '../../../core/hooks';
import { formatBytes, formatNumber } from '../../../core/format';

type Mode = 'create' | 'extract';

export default function ZipTool() {
  const toast = useToast();
  const [mode, setMode] = useState<Mode>('create');
  const queue = useFileQueue({ maxFiles: 500 });
  const [useFolder, setUseFolder] = useState(false);
  const [folderName, setFolderName] = useState('package');
  const [archiveName, setArchiveName] = useState('archive.zip');
  const [entries, setEntries] = useState<UnzippedEntry[]>([]);
  const [archiveFile, setArchiveFile] = useState<string>('');
  const create = useTask<{ blob: Blob; name: string; count: number }>();

  const folder = useFolder ? folderName.trim().replace(/[\\/]+/g, '') : '';

  const runCreate = () =>
    create.run(async (report) => {
      if (!queue.items.length) throw new Error('Add at least one file.');
      report(0.1, 'Packing files');
      const blob = await zipFiles(
        queue.items.map((item) => ({ name: folder ? `${folder}/${item.file.name}` : item.file.name, data: item.file })),
      );
      report(1, 'Done');
      const name = archiveName.trim().endsWith('.zip') ? archiveName.trim() : `${archiveName.trim() || 'archive'}.zip`;
      return { blob, name, count: queue.items.length };
    });

  const openArchive = async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    try {
      const list = await unzipFile(file);
      setEntries(list);
      setArchiveFile(file.name);
    } catch {
      toast.error('This file is not a readable ZIP archive.');
    }
  };

  const reset = () => {
    queue.clear();
    create.reset();
    setEntries([]);
    setArchiveFile('');
    setUseFolder(false);
    setFolderName('package');
    setArchiveName('archive.zip');
  };

  return (
    <ToolShell
      sidebar={
        <>
          <Field label="Mode">
            <Segmented<Mode>
              options={[
                { value: 'create', label: 'Create ZIP' },
                { value: 'extract', label: 'Extract ZIP' },
              ]}
              value={mode}
              onChange={setMode}
            />
          </Field>
          {mode === 'create' && (
            <>
              <Field label="Archive name">
                <TextInput value={archiveName} onChange={(e) => setArchiveName(e.target.value)} />
              </Field>
              <CheckBox checked={useFolder} onChange={setUseFolder} label="Put files in a folder" />
              {useFolder && (
                <Field label="Folder name">
                  <TextInput value={folderName} onChange={(e) => setFolderName(e.target.value)} />
                </Field>
              )}
            </>
          )}
        </>
      }
      actions={
        <>
          <Button variant="ghost" icon={<RefreshCw />} onClick={reset}>
            Reset
          </Button>
          {mode === 'create' ? (
            <>
              <Button variant="primary" icon={<Archive />} loading={create.running} disabled={!queue.items.length} onClick={runCreate}>
                Create ZIP
              </Button>
              <Button
                variant="success"
                icon={<Download />}
                disabled={!create.result}
                onClick={() => create.result && downloadBlob(create.result.blob, create.result.name)}
              >
                Download
              </Button>
            </>
          ) : null}
        </>
      }
      info={mode === 'create' && create.result ? `${formatNumber(create.result.count)} file(s) · ${formatBytes(create.result.blob.size)}` : undefined}
    >
      {mode === 'create' ? (
        <>
          {queue.items.length === 0 ? (
            <DropZone onFiles={(files) => queue.add(files)} formats={['Any file']} size="lg" title="Drop files to pack" />
          ) : (
            <Panel title="Files" actions={<QueueHeader count={queue.items.length} onAdd={undefined} onClear={queue.clear} />}>
              <FileGrid items={queue.items} onRemove={queue.remove} />
            </Panel>
          )}
          {create.error && <Notice tone="error" title="Could not create the archive">{create.error}</Notice>}
          {create.result && (
            <div className="grid-2">
              <Stat label="Files packed" value={formatNumber(create.result.count)} />
              <Stat label="Archive size" value={formatBytes(create.result.blob.size)} />
            </div>
          )}
        </>
      ) : (
        <>
          <DropZone onFiles={openArchive} accept=".zip,application/zip" multiple={false} formats={['ZIP']} title="Drop a ZIP archive" />
          {entries.length > 0 && (
            <Panel title={archiveFile} actions={<span className="badge badge-accent">{entries.length} entries</span>} flush>
              <div style={{ maxHeight: 460, overflow: 'auto' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th style={{ textAlign: 'right' }}>Size</th>
                      <th style={{ width: 90 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((entry) => (
                      <tr key={entry.name}>
                        <td className="mono tiny">{entry.name}</td>
                        <td className="mono tiny" style={{ textAlign: 'right' }}>{formatBytes(entry.data.byteLength)}</td>
                        <td>
                          <Button
                            size="sm"
                            variant="outline"
                            icon={<Download />}
                            onClick={() => downloadBlob(new Blob([entry.data as BlobPart]), entry.name.split('/').pop() ?? entry.name)}
                          >
                            Save
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}
        </>
      )}
    </ToolShell>
  );
}
