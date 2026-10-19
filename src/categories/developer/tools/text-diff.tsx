import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { ToolShell } from '../../../components/ToolShell';
import {
  Button,
  Field,
  Notice,
  Panel,
  Segmented,
  Stat,
  TextArea,
  useToast,
} from '../../../components/ui';
import { useDebounced } from '../../../core/hooks';
import { downloadText } from '../../../core/files';
import { formatNumber } from '../../../core/format';

const MAX_LINES = 1500;

type View = 'side' | 'unified';

interface LineOp {
  kind: 'eq' | 'del' | 'add';
  a?: string;
  b?: string;
}

interface Row {
  kind: 'eq' | 'chg' | 'del' | 'add';
  left?: LineOp;
  right?: LineOp;
  ln?: number;
  rn?: number;
}

const DEL_BG = 'rgba(244,63,94,.22)';
const ADD_BG = 'rgba(16,185,129,.22)';

function diffLines(a: string[], b: string[]): LineOp[] {
  const n = a.length;
  const m = b.length;
  const W = m + 1;
  const dp = new Uint32Array((n + 1) * (m + 1));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i * W + j] = a[i] === b[j] ? dp[(i + 1) * W + j + 1] + 1 : Math.max(dp[(i + 1) * W + j], dp[i * W + j + 1]);
    }
  }
  const ops: LineOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ kind: 'eq', a: a[i], b: b[j] });
      i += 1;
      j += 1;
    } else if (dp[(i + 1) * W + j] >= dp[i * W + j + 1]) {
      ops.push({ kind: 'del', a: a[i] });
      i += 1;
    } else {
      ops.push({ kind: 'add', b: b[j] });
      j += 1;
    }
  }
  while (i < n) ops.push({ kind: 'del', a: a[i++] });
  while (j < m) ops.push({ kind: 'add', b: b[j++] });
  return ops;
}

function buildRows(ops: LineOp[]): Row[] {
  const rows: Row[] = [];
  let ln = 0;
  let rn = 0;
  let i = 0;
  while (i < ops.length) {
    const op = ops[i];
    if (op.kind === 'eq') {
      ln += 1;
      rn += 1;
      rows.push({ kind: 'eq', left: op, right: op, ln, rn });
      i += 1;
      continue;
    }
    const dels: LineOp[] = [];
    const adds: LineOp[] = [];
    while (i < ops.length && ops[i].kind === 'del') dels.push(ops[i++]);
    while (i < ops.length && ops[i].kind === 'add') adds.push(ops[i++]);
    const pairs = Math.min(dels.length, adds.length);
    for (let k = 0; k < pairs; k += 1) {
      ln += 1;
      rn += 1;
      rows.push({ kind: 'chg', left: dels[k], right: adds[k], ln, rn });
    }
    for (let k = pairs; k < dels.length; k += 1) {
      ln += 1;
      rows.push({ kind: 'del', left: dels[k], ln });
    }
    for (let k = pairs; k < adds.length; k += 1) {
      rn += 1;
      rows.push({ kind: 'add', right: adds[k], rn });
    }
  }
  return rows;
}

function wordDiff(a: string, b: string): { left: ReactNode; right: ReactNode } {
  const ta = a.split(/(\s+)/).filter((t) => t !== '');
  const tb = b.split(/(\s+)/).filter((t) => t !== '');
  const n = ta.length;
  const m = tb.length;
  const W = m + 1;
  const dp = new Uint32Array((n + 1) * (m + 1));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i * W + j] = ta[i] === tb[j] ? dp[(i + 1) * W + j + 1] + 1 : Math.max(dp[(i + 1) * W + j], dp[i * W + j + 1]);
    }
  }
  const leftParts: ReactNode[] = [];
  const rightParts: ReactNode[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (ta[i] === tb[j]) {
      leftParts.push(<span key={`l${i}`}>{ta[i]}</span>);
      rightParts.push(<span key={`r${j}`}>{tb[j]}</span>);
      i += 1;
      j += 1;
    } else if (dp[(i + 1) * W + j] >= dp[i * W + j + 1]) {
      leftParts.push(
        <span key={`l${i}`} style={{ background: DEL_BG, borderRadius: 2 }}>
          {ta[i]}
        </span>,
      );
      i += 1;
    } else {
      rightParts.push(
        <span key={`r${j}`} style={{ background: ADD_BG, borderRadius: 2 }}>
          {tb[j]}
        </span>,
      );
      j += 1;
    }
  }
  while (i < n) {
    leftParts.push(
      <span key={`l${i}`} style={{ background: DEL_BG, borderRadius: 2 }}>
        {ta[i]}
      </span>,
    );
    i += 1;
  }
  while (j < m) {
    rightParts.push(
      <span key={`r${j}`} style={{ background: ADD_BG, borderRadius: 2 }}>
        {tb[j]}
      </span>,
    );
    j += 1;
  }
  return { left: <>{leftParts}</>, right: <>{rightParts}</> };
}

export default function TextDiff() {
  const toast = useToast();
  const [left, setLeft] = useState('');
  const [right, setRight] = useState('');
  const [view, setView] = useState<View>('side');
  const a = useDebounced(left, 200);
  const b = useDebounced(right, 200);

  const diff = useMemo(() => {
    const aLines = a.split('\n');
    const bLines = b.split('\n');
    const tooBig = aLines.length > MAX_LINES || bLines.length > MAX_LINES;
    const ops = tooBig ? [] : diffLines(aLines.slice(0, MAX_LINES), bLines.slice(0, MAX_LINES));
    const rows = buildRows(ops);
    const added = ops.filter((o) => o.kind === 'add').length;
    const removed = ops.filter((o) => o.kind === 'del').length;
    const unchanged = ops.filter((o) => o.kind === 'eq').length;
    return { tooBig, ops, rows, added, removed, unchanged, hasInput: a.trim() !== '' || b.trim() !== '' };
  }, [a, b]);

  const unifiedText = useMemo(
    () => diff.ops.map((o) => (o.kind === 'eq' ? `  ${o.a ?? ''}` : o.kind === 'del' ? `- ${o.a ?? ''}` : `+ ${o.b ?? ''}`)).join('\n'),
    [diff.ops],
  );

  const reset = () => {
    setLeft('');
    setRight('');
    setView('side');
  };

  const gutter: CSSProperties = { minWidth: 40, textAlign: 'right', paddingRight: 10, color: 'var(--text-2)', userSelect: 'none' };
  const cell: CSSProperties = { flex: 1, minWidth: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' };

  return (
    <ToolShell
      sidebar={
        <Field label="View">
          <Segmented<View>
            options={[
              { value: 'side', label: 'Side by side' },
              { value: 'unified', label: 'Unified' },
            ]}
            value={view}
            onChange={setView}
          />
        </Field>
      }
      actions={
        <>
          <Button variant="ghost" icon={<RefreshCw />} onClick={reset}>
            Reset
          </Button>
          <Button
            variant="primary"
            icon={<Download />}
            disabled={!diff.hasInput || diff.tooBig}
            onClick={() => {
              downloadText(unifiedText, 'diff.txt');
              toast.success('Downloaded unified diff.');
            }}
          >
            Download .txt
          </Button>
        </>
      }
      info={diff.hasInput ? `+${formatNumber(diff.added)} / −${formatNumber(diff.removed)}` : undefined}
    >
      {diff.tooBig && (
        <Notice tone="warning" title="Input too large">
          Diffing is limited to {formatNumber(MAX_LINES)} lines per side to keep the page responsive.
        </Notice>
      )}

      <div className="grid-2">
        <Panel title="Original">
          <TextArea value={left} onChange={(event) => setLeft(event.target.value)} placeholder="Paste the original text…" style={{ minHeight: 180 }} />
        </Panel>
        <Panel title="Changed">
          <TextArea value={right} onChange={(event) => setRight(event.target.value)} placeholder="Paste the changed text…" style={{ minHeight: 180 }} />
        </Panel>
      </div>

      {diff.hasInput && !diff.tooBig && (
        <Panel title="Result">
          <div className="stage" style={{ overflow: 'auto', maxHeight: 520, padding: 12 }}>
            <div className="mono" style={{ fontSize: 12.5, lineHeight: 1.7 }}>
              {view === 'side' ? (
                diff.rows.map((row, idx) => {
                  const wd = row.kind === 'chg' ? wordDiff(row.left?.a ?? '', row.right?.b ?? '') : null;
                  const leftBg = row.kind === 'del' ? DEL_BG : row.kind === 'chg' ? 'transparent' : undefined;
                  const rightBg = row.kind === 'add' ? ADD_BG : row.kind === 'chg' ? 'transparent' : undefined;
                  return (
                    <div key={idx} style={{ display: 'flex', gap: 12 }}>
                      <div style={{ ...cell, background: leftBg, display: 'flex', gap: 8 }}>
                        <span style={gutter}>{row.ln ?? ''}</span>
                        <span style={{ minWidth: 12, color: 'var(--text-2)' }}>{row.kind === 'del' ? '−' : row.kind === 'chg' ? '~' : ''}</span>
                        <span style={{ flex: 1, minWidth: 0 }}>{wd ? wd.left : row.left?.a ?? ''}</span>
                      </div>
                      <div style={{ ...cell, background: rightBg, display: 'flex', gap: 8 }}>
                        <span style={gutter}>{row.rn ?? ''}</span>
                        <span style={{ minWidth: 12, color: 'var(--text-2)' }}>{row.kind === 'add' ? '+' : row.kind === 'chg' ? '~' : ''}</span>
                        <span style={{ flex: 1, minWidth: 0 }}>{wd ? wd.right : row.right?.b ?? ''}</span>
                      </div>
                    </div>
                  );
                })
              ) : (
                diff.ops.map((op, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      gap: 8,
                      background: op.kind === 'del' ? DEL_BG : op.kind === 'add' ? ADD_BG : undefined,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    <span style={{ minWidth: 14, color: 'var(--text-2)' }}>{op.kind === 'eq' ? ' ' : op.kind === 'del' ? '−' : '+'}</span>
                    <span>{op.kind === 'eq' ? op.a : op.kind === 'del' ? op.a : op.b}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </Panel>
      )}

      {diff.hasInput && !diff.tooBig && (
        <div className="grid-3">
          <Stat label="Added" value={formatNumber(diff.added)} tone="ok" />
          <Stat label="Removed" value={formatNumber(diff.removed)} tone="bad" />
          <Stat label="Unchanged" value={formatNumber(diff.unchanged)} />
        </div>
      )}
    </ToolShell>
  );
}