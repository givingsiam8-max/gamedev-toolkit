import { useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { ToolShell } from '../../../components/ToolShell';
import {
  Badge,
  Button,
  Notice,
  Panel,
  Stat,
  TextArea,
} from '../../../components/ui';
import { DropZone } from '../../../components/files';
import { readAsText } from '../../../core/files';
import { formatNumber } from '../../../core/format';

interface GuidEntry {
  guid: string;
  count: number;
  valid: boolean;
}

const HEX32 = /^[0-9a-f]{32}$/i;

function inspect(text: string) {
  const guids = new Map<string, number>();
  for (const m of text.matchAll(/guid:\s*([0-9a-zA-Z-]{8,})/g)) {
    const value = m[1];
    guids.set(value, (guids.get(value) ?? 0) + 1);
  }
  const fileIds = new Set<string>();
  for (const m of text.matchAll(/fileID:\s*(-?\d+)/g)) fileIds.add(m[1]);
  const entries: GuidEntry[] = [...guids.entries()]
    .map(([guid, count]) => ({ guid, count, valid: HEX32.test(guid) }))
    .sort((a, b) => b.count - a.count || a.guid.localeCompare(b.guid));
  const duplicates = entries.filter((e) => e.count > 1);
  const invalid = entries.filter((e) => !e.valid);
  return { entries, fileIds: [...fileIds], duplicates, invalid };
}

export default function GuidInspector() {
  const [text, setText] = useState('');

  const state = useMemo(() => (text.trim() ? inspect(text) : null), [text]);

  const onFiles = async (files: File[]) => {
    const parts: string[] = [];
    for (const file of files.slice(0, 200)) {
      try {
        parts.push(await readAsText(file));
      } catch {
        /* skip unreadable file */
      }
    }
    if (parts.length) setText(parts.join('\n'));
  };

  return (
    <ToolShell
      actions={
        <>
          <Button variant="ghost" icon={<RefreshCw />} onClick={() => setText('')}>
            Reset
          </Button>
        </>
      }
      info={state ? `${formatNumber(state.entries.length)} GUID(s) found` : undefined}
    >
      <DropZone
        onFiles={(files) => void onFiles(files)}
        accept=".meta,.yaml,.yml,.txt,.unity,.prefab,.asset"
        formats={['META', 'YAML', 'UNITY', 'PREFAB', 'ASSET']}
        title="Drop .meta / YAML / scene files"
        hint="…or paste the text below"
        size="sm"
      />

      <Panel title="Source text">
        <TextArea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'fileFormatVersion: 2\nguid: a1b2c3d4e5f60718293a4b5c6d7e8f90\nTextureImporter: ...'}
          style={{ minHeight: 160 }}
        />
      </Panel>

      {state && (
        <>
          <div className="grid-4">
            <Stat label="Unique GUIDs" value={formatNumber(state.entries.length)} />
            <Stat label="fileIDs" value={formatNumber(state.fileIds.length)} />
            <Stat label="Duplicates" value={formatNumber(state.duplicates.length)} tone={state.duplicates.length ? 'warn' : 'ok'} />
            <Stat label="Invalid format" value={formatNumber(state.invalid.length)} tone={state.invalid.length ? 'bad' : 'ok'} />
          </div>

          {state.duplicates.length > 0 && (
            <Notice tone="warning" title="Duplicate GUIDs inside this text">
              The same GUID appears more than once. In a Unity project, duplicate GUIDs make asset
              references ambiguous — keep only one .meta per GUID.
            </Notice>
          )}
          {state.invalid.length > 0 && (
            <Notice tone="warning" title="Values that are not 32-hex GUIDs">
              Unity GUIDs are exactly 32 hexadecimal characters. Hyphenated values are .NET GUIDs,
              not Unity asset GUIDs.
            </Notice>
          )}

          <Panel title="GUIDs">
            <div style={{ maxHeight: 320, overflow: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>GUID</th>
                    <th>Occurrences</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {state.entries.map((e) => (
                    <tr key={e.guid}>
                      <td className="mono">{e.guid}</td>
                      <td>{formatNumber(e.count)}</td>
                      <td>
                        {!e.valid ? (
                          <Badge tone="danger">invalid</Badge>
                        ) : e.count > 1 ? (
                          <Badge tone="warning">duplicate</Badge>
                        ) : (
                          <Badge tone="success">ok</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          {state.fileIds.length > 0 && (
            <Panel title="fileIDs found">
              <div className="row-wrap">
                {state.fileIds.slice(0, 50).map((id) => (
                  <span key={id} className="chip mono">{id}</span>
                ))}
                {state.fileIds.length > 50 && <span className="dim tiny">+{state.fileIds.length - 50} more</span>}
              </div>
            </Panel>
          )}
        </>
      )}

      {!state && <Notice tone="info">Paste .meta or YAML text, or drop files above, to inspect their GUIDs and fileIDs.</Notice>}
    </ToolShell>
  );
}