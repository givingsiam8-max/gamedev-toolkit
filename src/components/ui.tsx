/**
 * Shared UI kit. Every tool builds its interface from these primitives so the
 * whole toolkit stays visually consistent.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';
import {
  CircleAlert,
  CircleCheck,
  Copy,
  Info,
  TriangleAlert,
  X,
} from 'lucide-react';

/* ==========================================================================
   Buttons
   ========================================================================== */

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'ghost'
  | 'outline'
  | 'success'
  | 'warning'
  | 'danger';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  icon?: ReactNode;
  iconRight?: ReactNode;
  loading?: boolean;
  block?: boolean;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  iconRight,
  loading = false,
  block = false,
  className = '',
  children,
  disabled,
  ...rest
}: ButtonProps) {
  const classes = [
    'btn',
    `btn-${variant}`,
    size !== 'md' ? `btn-${size}` : '',
    block ? 'btn-block' : '',
    !children ? 'btn-icon' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button className={classes} disabled={disabled || loading} {...rest}>
      {loading ? <span className="spinner" /> : icon}
      {children}
      {!loading && iconRight}
    </button>
  );
}

/** Icon-only button with an accessible label and CSS tooltip. */
export function IconButton({
  label,
  size = 'md',
  variant = 'ghost',
  className = '',
  ...rest
}: ButtonProps & { label: string }) {
  return (
    <button
      className={`btn btn-${variant} ${size !== 'md' ? `btn-${size}` : ''} btn-icon tip ${className}`}
      data-tip={label}
      aria-label={label}
      {...rest}
    />
  );
}

/* ==========================================================================
   Layout primitives
   ========================================================================== */

export function Panel({
  title,
  icon,
  actions,
  children,
  flush = false,
  className = '',
}: {
  title?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  flush?: boolean;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      {title !== undefined && (
        <header className="panel-header">
          <h3 className="panel-title">
            {icon}
            {title}
          </h3>
          {actions}
        </header>
      )}
      <div className={flush ? 'panel-body-flush' : 'panel-body'}>{children}</div>
    </section>
  );
}

export function SectionTitle({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="section-title">
      {icon}
      {children}
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
  htmlFor,
  right,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  htmlFor?: string;
  right?: ReactNode;
}) {
  return (
    <div className="field">
      {(label !== undefined || right) && (
        <label className="field-label" htmlFor={htmlFor}>
          <span>{label}</span>
          {right}
        </label>
      )}
      {children}
      {hint && <div className="field-hint">{hint}</div>}
    </div>
  );
}

export function FieldRow({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="field-row">
      <div style={{ minWidth: 0 }}>
        <div className="strong tiny" style={{ color: 'var(--text-0)' }}>
          {label}
        </div>
        {hint && <div className="field-hint">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

/* ==========================================================================
   Inputs
   ========================================================================== */

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className = '', ...rest } = props;
  return <input className={`input ${className}`} {...rest} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className = '', ...rest } = props;
  return <textarea className={`textarea ${className}`} spellCheck={false} {...rest} />;
}

export function Select({
  options,
  className = '',
  ...rest
}: React.SelectHTMLAttributes<HTMLSelectElement> & {
  options: Array<{ value: string; label: string; disabled?: boolean }>;
}) {
  return (
    <select className={`select ${className}`} {...rest}>
      {options.map((option) => (
        <option key={option.value} value={option.value} disabled={option.disabled}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
  ...rest
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'min' | 'max' | 'step'>) {
  return (
    <div className="input-group">
      <input
        type="number"
        className="input"
        value={Number.isFinite(value) ? value : ''}
        min={min}
        max={max}
        step={step}
        onChange={(event) => {
          const next = event.target.value === '' ? NaN : Number(event.target.value);
          onChange(next);
        }}
        {...rest}
      />
      {suffix && <span className="dim tiny nowrap" style={{ alignSelf: 'center' }}>{suffix}</span>}
    </div>
  );
}

/** Slider with an editable numeric value — the standard "adjustment" control. */
export function SliderField({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  format,
  disabled,
  hint,
  resetValue,
}: {
  label: ReactNode;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  format?: (value: number) => string;
  disabled?: boolean;
  hint?: ReactNode;
  resetValue?: number;
}) {
  const display = format ? format(value) : String(Math.round(value * 100) / 100);
  return (
    <div className="field">
      <div className="field-label">
        <span>{label}</span>
        {resetValue !== undefined && value !== resetValue && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{ height: 20, padding: '0 6px', fontSize: 11 }}
            onClick={() => onChange(resetValue)}
          >
            Reset
          </button>
        )}
      </div>
      <div className="range-row">
        <input
          type="range"
          className="range"
          value={value}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <input
          type="number"
          className="range-value"
          value={Number.isFinite(value) ? Number(value.toFixed(4)) : ''}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          onChange={(event) => onChange(Number(event.target.value))}
        />
      </div>
      {hint ? <div className="field-hint">{hint}</div> : <span className="sr-only">{display}</span>}
    </div>
  );
}

export function CheckBox({
  checked,
  onChange,
  label,
  disabled,
  hint,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  disabled?: boolean;
  hint?: ReactNode;
}) {
  return (
    <label className="check" style={{ opacity: disabled ? 0.5 : 1 }}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>
        {label}
        {hint && <div className="field-hint">{hint}</div>}
      </span>
    </label>
  );
}

export function SwitchRow({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: ReactNode;
  hint?: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="field-row">
      <div style={{ minWidth: 0 }}>
        <label htmlFor={id} className="strong tiny" style={{ color: 'var(--text-0)', cursor: 'pointer' }}>
          {label}
        </label>
        {hint && <div className="field-hint">{hint}</div>}
      </div>
      <input
        id={id}
        type="checkbox"
        role="switch"
        className="switch"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
    </div>
  );
}

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
  title?: string;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
}) {
  return (
    <div className="segmented" role="group">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className="segmented-item"
          title={option.title}
          aria-pressed={value === option.value}
          style={size === 'sm' ? { height: 24, padding: '0 9px' } : undefined}
          onClick={() => onChange(option.value)}
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  );
}

/* ==========================================================================
   Feedback
   ========================================================================== */

export function Badge({
  children,
  tone = 'neutral',
  icon,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'accent';
  icon?: ReactNode;
}) {
  return (
    <span className={`badge ${tone !== 'neutral' ? `badge-${tone}` : ''}`}>
      {icon}
      {children}
    </span>
  );
}

export function Notice({
  tone = 'info',
  title,
  children,
  actions,
}: {
  tone?: 'info' | 'success' | 'warning' | 'error';
  title?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  const icons = {
    info: <Info />,
    success: <CircleCheck />,
    warning: <TriangleAlert />,
    error: <CircleAlert />,
  } as const;
  return (
    <div className={`notice notice-${tone}`}>
      {icons[tone]}
      <div className="grow">
        {title && <div className="notice-title">{title}</div>}
        {children}
      </div>
      {actions}
    </div>
  );
}

export function ProgressBar({
  value,
  max = 1,
  label,
  indeterminate = false,
  small = false,
}: {
  value: number;
  max?: number;
  label?: ReactNode;
  indeterminate?: boolean;
  small?: boolean;
}) {
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return (
    <div className="stack-sm" style={{ width: '100%' }}>
      {(label !== undefined || !indeterminate) && (
        <div className="spread tiny dim">
          <span>{label}</span>
          {!indeterminate && <span className="mono">{Math.round(ratio * 100)}%</span>}
        </div>
      )}
      <div className={`progress ${small ? 'progress-sm' : ''} ${indeterminate ? 'progress-indeterminate' : ''}`}>
        <div className="progress-bar" style={{ width: `${ratio * 100}%` }} />
      </div>
    </div>
  );
}

export function BusyOverlay({ message, progress }: { message?: string; progress?: number }) {
  return (
    <div className="busy-overlay">
      <span className="spinner spinner-lg" />
      {message && <div className="tiny" style={{ color: 'var(--text-1)' }}>{message}</div>}
      {progress !== undefined && (
        <div style={{ width: 200 }}>
          <ProgressBar value={progress} small />
        </div>
      )}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  text,
  action,
}: {
  icon?: ReactNode;
  title?: ReactNode;
  text?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      {icon}
      {title && <div className="empty-title">{title}</div>}
      {text && <div className="empty-text">{text}</div>}
      {action}
    </div>
  );
}

export function Stat({
  label,
  value,
  sub,
  tone = 'neutral',
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  tone?: 'neutral' | 'ok' | 'warn' | 'bad';
}) {
  return (
    <div className={`stat ${tone !== 'neutral' ? `stat-${tone}` : ''}`}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {sub && <span className="stat-sub">{sub}</span>}
    </div>
  );
}

export function Spinner({ large = false }: { large?: boolean }) {
  return <span className={`spinner ${large ? 'spinner-lg' : ''}`} />;
}

/* ==========================================================================
   Tabs
   ========================================================================== */

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: Array<{ value: T; label: ReactNode; icon?: ReactNode }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          role="tab"
          className="tab"
          aria-selected={value === tab.value}
          onClick={() => onChange(tab.value)}
        >
          {tab.icon}
          {tab.label}
        </button>
      ))}
    </div>
  );
}

/* ==========================================================================
   Modal
   ========================================================================== */

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'md' | 'lg';
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={`modal ${size === 'lg' ? 'modal-lg' : ''}`} role="dialog" aria-modal="true">
        <header className="modal-header">
          <h2 style={{ fontSize: 'var(--fs-lg)', fontWeight: 650 }}>{title}</h2>
          <IconButton label="Close" onClick={onClose} icon={<X />} />
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-footer">{footer}</footer>}
      </div>
    </div>
  );
}

/* ==========================================================================
   Toasts
   ========================================================================== */

type ToastTone = 'success' | 'error' | 'warning' | 'info';
interface ToastItem {
  id: number;
  tone: ToastTone;
  message: ReactNode;
}

interface ToastApi {
  success: (message: ReactNode) => void;
  error: (message: ReactNode) => void;
  warning: (message: ReactNode) => void;
  info: (message: ReactNode) => void;
  show: (tone: ToastTone, message: ReactNode) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const counter = useRef(0);

  const remove = useCallback((id: number) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const show = useCallback(
    (tone: ToastTone, message: ReactNode) => {
      counter.current += 1;
      const id = counter.current;
      setItems((prev) => [...prev.slice(-3), { id, tone, message }]);
      window.setTimeout(() => remove(id), tone === 'error' ? 7000 : 3800);
    },
    [remove],
  );

  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (message) => show('success', message),
      error: (message) => show('error', message),
      warning: (message) => show('warning', message),
      info: (message) => show('info', message),
    }),
    [show],
  );

  const icons: Record<ToastTone, ReactNode> = {
    success: <CircleCheck />,
    error: <CircleAlert />,
    warning: <TriangleAlert />,
    info: <Info />,
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {items.map((item) => (
          <div key={item.id} className={`toast toast-${item.tone}`}>
            {icons[item.tone]}
            <div className="grow">{item.message}</div>
            <button
              type="button"
              className="btn btn-ghost btn-sm btn-icon"
              aria-label="Dismiss"
              onClick={() => remove(item.id)}
            >
              <X />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside <ToastProvider>');
  return context;
}

/* ==========================================================================
   Copy helpers
   ========================================================================== */

export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

export function CopyButton({
  value,
  label = 'Copy',
  size = 'sm',
  variant = 'ghost',
  onCopied,
}: {
  value: string;
  label?: string;
  size?: 'sm' | 'md';
  variant?: ButtonVariant;
  onCopied?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const toast = useToast();

  const handleCopy = async () => {
    const ok = await copyText(value);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
      onCopied?.();
    } else {
      toast.error('Your browser blocked clipboard access. Select the text and copy manually.');
    }
  };

  return (
    <Button
      size={size}
      variant={variant}
      icon={copied ? <CircleCheck /> : <Copy />}
      onClick={handleCopy}
      title={label}
    >
      {copied ? 'Copied' : label}
    </Button>
  );
}

/** Read-only value with a copy button, used across developer/unity tools. */
export function CopyField({
  label,
  value,
  mono = true,
  hint,
}: {
  label: ReactNode;
  value: string;
  mono?: boolean;
  hint?: ReactNode;
}) {
  return (
    <div className="field">
      <div className="field-label">
        <span>{label}</span>
        <CopyButton value={value} />
      </div>
      <div className={`input ${mono ? 'mono' : ''}`} style={{ display: 'flex', alignItems: 'center', overflow: 'auto' }}>
        <span className="truncate" style={{ width: '100%' }}>
          {value}
        </span>
      </div>
      {hint && <div className="field-hint">{hint}</div>}
    </div>
  );
}

export function CodeBlock({
  text,
  maxHeight,
}: {
  text: string;
  maxHeight?: number;
}) {
  return (
    <pre className="code" style={maxHeight ? { maxHeight } : undefined}>
      {text}
    </pre>
  );
}
