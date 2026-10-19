/**
 * Shared hooks: long-running task state (progress + error) and object URL
 * lifetime management. Tools use these instead of hand-rolling spinners.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toUserMessage, toErrorDetail } from './errors';

export type TaskStatus = 'idle' | 'running' | 'done' | 'error';

export interface TaskController<T> {
  status: TaskStatus;
  /** 0..1 */
  progress: number;
  message: string;
  result: T | null;
  error: string | null;
  errorDetail: string | null;
  running: boolean;
  /** Runs the task, tracking progress and converting errors to messages. */
  run: (task: (report: (progress: number, message?: string) => void) => Promise<T>) => Promise<T | null>;
  reset: () => void;
  setResult: (result: T | null) => void;
  setError: (message: string, detail?: string) => void;
}

export function useTask<T>(): TaskController<T> {
  const [status, setStatus] = useState<TaskStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('');
  const [result, setResultState] = useState<T | null>(null);
  const [error, setErrorState] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(
    async (task: (report: (progress: number, message?: string) => void) => Promise<T>) => {
      setStatus('running');
      setProgress(0);
      setMessage('');
      setErrorState(null);
      setErrorDetail(null);
      try {
        const value = await task((value, msg) => {
          if (!mounted.current) return;
          setProgress(Math.min(1, Math.max(0, value)));
          if (msg !== undefined) setMessage(msg);
        });
        if (!mounted.current) return null;
        setResultState(value);
        setProgress(1);
        setStatus('done');
        return value;
      } catch (err) {
        if (!mounted.current) return null;
        setErrorState(toUserMessage(err));
        setErrorDetail(toErrorDetail(err) ?? null);
        setStatus('error');
        return null;
      }
    },
    [],
  );

  const reset = useCallback(() => {
    setStatus('idle');
    setProgress(0);
    setMessage('');
    setResultState(null);
    setErrorState(null);
    setErrorDetail(null);
  }, []);

  const setResult = useCallback((value: T | null) => {
    setResultState(value);
    setStatus(value ? 'done' : 'idle');
  }, []);

  const setError = useCallback((msg: string, detail?: string) => {
    setErrorState(msg);
    setErrorDetail(detail ?? null);
    setStatus('error');
  }, []);

  return {
    status,
    progress,
    message,
    result,
    error,
    errorDetail,
    running: status === 'running',
    run,
    reset,
    setResult,
    setError,
  };
}

/** Object URL that is revoked automatically when the blob changes or unmounts. */
export function useObjectUrl(blob: Blob | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob]);

  return url;
}

/** Debounced value — used by the global search box. */
export function useDebounced<T>(value: T, delay = 140): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

/** Persisted component state (used for per-tool option memory). */
export function useStoredState<T>(key: string, initial: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(`gdt.tool.${key}`);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });

  const update = useCallback(
    (next: T) => {
      setValue(next);
      try {
        localStorage.setItem(`gdt.tool.${key}`, JSON.stringify(next));
      } catch {
        /* ignore */
      }
    },
    [key],
  );

  return [value, update];
}

/** Ctrl/Cmd+Enter style shortcut binding. */
export function useHotkey(
  combo: { key: string; ctrl?: boolean; shift?: boolean; alt?: boolean },
  handler: () => void,
  enabled = true,
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled) return;
    const listener = (event: KeyboardEvent) => {
      const ctrl = event.ctrlKey || event.metaKey;
      if (combo.ctrl !== undefined && combo.ctrl !== ctrl) return;
      if (combo.shift !== undefined && combo.shift !== event.shiftKey) return;
      if (combo.alt !== undefined && combo.alt !== event.altKey) return;
      if (event.key.toLowerCase() !== combo.key.toLowerCase()) return;
      event.preventDefault();
      handlerRef.current();
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [combo.key, combo.ctrl, combo.shift, combo.alt, enabled]);
}

/** Reports the pixel dimensions of an element (used by crop/compare tools). */
export function useElementSize<T extends HTMLElement>(): [
  React.RefObject<T | null>,
  { width: number; height: number },
] {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });
    observer.observe(element);
    setSize({ width: element.clientWidth, height: element.clientHeight });
    return () => observer.disconnect();
  }, []);

  return [ref, size];
}

/** Requests an animation frame loop; handler receives elapsed seconds. */
export function useAnimationFrame(
  handler: (deltaSeconds: number) => void,
  active: boolean,
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!active) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const delta = (now - last) / 1000;
      last = now;
      handlerRef.current(delta);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active]);
}

/** Revokes a set of object URLs on unmount. */
export function useUrlRegistry() {
  const urls = useRef<string[]>([]);
  useEffect(
    () => () => {
      urls.current.forEach((url) => URL.revokeObjectURL(url));
      urls.current = [];
    },
    [],
  );
  return useMemo(
    () => ({
      create(blob: Blob): string {
        const url = URL.createObjectURL(blob);
        urls.current.push(url);
        return url;
      },
    }),
    [],
  );
}
