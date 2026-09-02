import type { ReactNode } from "react";
import { ArrowRightIcon } from "./icons";

/**
 * Layout primitives.
 *
 * These exist to remove *structural* duplication, not to wrap every element:
 * before this file, the eight content screens each had their own page header
 * (four different shapes), and the four tool screens each rebuilt a toolbar.
 * Buttons, inputs and chips stay as utility classes (`eu-btn*`, `eu-input`,
 * `eu-chip`) because that is this codebase's idiom and it keeps diffs small.
 */

// ---------------------------------------------------------------------------
// PageHeader — the single header shape for every screen.
// ---------------------------------------------------------------------------

export function PageHeader({
  title,
  meta,
  actions,
  onBack,
  backLabel,
  icon,
}: {
  title: ReactNode;
  /** Short mono facts: date, counts, connection state. */
  meta?: ReactNode;
  actions?: ReactNode;
  onBack?: () => void;
  backLabel?: string;
  icon?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-3">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="eu-btn-quiet eu-btn-sm self-start -ml-2.5"
        >
          <ArrowRightIcon className="w-3.5 h-3.5 rotate-180" />
          {backLabel}
        </button>
      )}
      <div className="flex items-end justify-between gap-5 flex-wrap">
        <div className="min-w-0">
          <h1 className="eu-t-page text-ink flex items-center gap-2.5">
            {icon && <span className="text-ink-faint shrink-0">{icon}</span>}
            {title}
          </h1>
          {meta && <MetaLine>{meta}</MetaLine>}
        </div>
        {actions && <div className="flex items-center gap-2 flex-wrap shrink-0">{actions}</div>}
      </div>
    </header>
  );
}

/** Mono context line under a page title. Children separated by `<MetaDot/>`. */
export function MetaLine({ children }: { children: ReactNode }) {
  return (
    <div className="eu-t-label mt-2 flex items-center gap-2.5 flex-wrap leading-normal">
      {children}
    </div>
  );
}

export function MetaDot() {
  return <span aria-hidden className="w-[3px] h-[3px] rounded-full bg-line-strong shrink-0" />;
}

// ---------------------------------------------------------------------------
// Panel — the single container shape.
// ---------------------------------------------------------------------------

export function Panel({
  title,
  icon,
  action,
  children,
  footer,
  pad = false,
  className = "",
  bodyClassName = "",
}: {
  title?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Add the standard inner padding. Leave false for edge-to-edge row lists. */
  pad?: boolean;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={`eu-panel overflow-hidden flex flex-col min-w-0 ${className}`}>
      {(title || action) && (
        <div className="eu-panel-head">
          <h2 className="eu-t-section text-ink flex items-center gap-2 min-w-0">
            {icon && <span className="text-ink-faint shrink-0">{icon}</span>}
            <span className="truncate">{title}</span>
          </h2>
          {action && <div className="flex items-center gap-1.5 shrink-0">{action}</div>}
        </div>
      )}
      <div className={`min-w-0 flex-1 ${pad ? "eu-panel-pad" : ""} ${bodyClassName}`}>{children}</div>
      {footer && <div className="px-[14px] py-2 border-t border-line bg-panel-alt">{footer}</div>}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Toolbar — grouped controls with hairline separators (whiteboard, PDF, notes,
// Python all used to hand-roll this).
// ---------------------------------------------------------------------------

export function Toolbar({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="toolbar"
      className={`shrink-0 flex items-center gap-1.5 flex-wrap px-3 py-1.5 border-b border-line bg-panel ${className}`}
    >
      {children}
    </div>
  );
}

export function ToolGroup({
  children,
  label,
  className = "",
}: {
  children: ReactNode;
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={`flex items-center gap-1 ${className}`}
      role={label ? "group" : undefined}
      aria-label={label}
    >
      {children}
    </div>
  );
}

export function ToolSep() {
  return <span aria-hidden className="w-px self-stretch my-1 bg-line shrink-0" />;
}

export function ToolSpacer() {
  return <span className="flex-1" />;
}

// ---------------------------------------------------------------------------
// Segmented control — matière picker, filters, Pronote method, recap period.
// ---------------------------------------------------------------------------

export function Segmented<T extends string | number>({
  value,
  onChange,
  options,
  label,
  className = "",
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: ReactNode; title?: string }>;
  label?: string;
  className?: string;
}) {
  return (
    <div className={`eu-segment ${className}`} role="tablist" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// StatTile — inventory figures. Used as a single strip, not as fat cards.
// ---------------------------------------------------------------------------

export function StatStrip({ children }: { children: ReactNode }) {
  return <div className="eu-panel flex flex-wrap">{children}</div>;
}

export function StatTile({
  icon,
  value,
  label,
  hint,
  onClick,
  title,
}: {
  icon?: ReactNode;
  value: ReactNode;
  label: string;
  hint?: ReactNode;
  onClick?: () => void;
  title?: string;
}) {
  const inner = (
    <>
      {icon && (
        <span className="w-7 h-7 shrink-0 grid place-items-center rounded border border-line text-ink-muted">
          {icon}
        </span>
      )}
      <span className="min-w-0">
        <span className="eu-t-metric text-ink block">{value}</span>
        <span className="eu-t-label block mt-1.5">{label}</span>
        {hint && <span className="eu-t-meta block mt-1 normal-case tracking-normal">{hint}</span>}
      </span>
    </>
  );
  const base =
    "flex-1 min-w-[150px] flex items-center gap-3 px-4 py-3.5 border-r border-line last:border-r-0 text-left";
  return onClick ? (
    <button type="button" onClick={onClick} title={title} className={`${base} hover:bg-panel-alt transition-colors duration-fast`}>
      {inner}
    </button>
  ) : (
    <div className={base}>{inner}</div>
  );
}

// ---------------------------------------------------------------------------
// Field — label + optional hint, wrapping any control.
// ---------------------------------------------------------------------------

export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
  className = "",
}: {
  label?: string;
  hint?: ReactNode;
  error?: string | null;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-1.5 min-w-0 ${className}`}>
      {label && (
        <label htmlFor={htmlFor} className="eu-t-label">
          {label}
        </label>
      )}
      {children}
      {error ? (
        <p className="eu-t-meta text-danger">{error}</p>
      ) : (
        hint && <p className="eu-t-meta leading-snug">{hint}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section — titled group of panels on a settings-style screen.
// ---------------------------------------------------------------------------

export function Section({
  title,
  action,
  children,
  description,
}: {
  title: string;
  action?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-3 min-h-7">
        <div className="min-w-0">
          <h2 className="eu-t-section text-ink">{title}</h2>
          {description && <p className="eu-t-meta mt-0.5">{description}</p>}
        </div>
        {action && <div className="flex items-center gap-1.5 shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  );
}
