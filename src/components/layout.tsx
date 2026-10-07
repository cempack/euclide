import {
  Children,
  isValidElement,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { computePosition, flip, offset, shift } from "@floating-ui/dom";
import { Ellipsis } from "lucide-react";
import { ArrowRightIcon } from "./icons";
import { tr } from "../lib/i18n";

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
  /** Short facts under the title: date, counts, connection state. */
  meta?: ReactNode;
  actions?: ReactNode;
  onBack?: () => void;
  backLabel?: string;
  icon?: ReactNode;
}) {
  return (
    <header className="flex flex-col">
      {onBack && (
        <button type="button" onClick={onBack} className="eu-btn-quiet eu-btn-sm self-start -ml-2.5 mb-2">
          <ArrowRightIcon className="w-3.5 h-3.5 rotate-180" />
          {backLabel}
        </button>
      )}
      {/* Actions sit on the title's line, centred on it. */}
      <div className="flex items-center justify-between gap-x-5 gap-y-3 flex-wrap">
        <h1 className="eu-t-page text-ink flex items-center gap-2.5 min-w-0">
          {icon && <span className="text-ink-faint shrink-0">{icon}</span>}
          <span className="min-w-0">{title}</span>
        </h1>
        {actions && <div className="flex items-center gap-2 flex-wrap shrink-0">{actions}</div>}
      </div>
      {meta && <MetaLine>{meta}</MetaLine>}
    </header>
  );
}

/** The context line under a page title. Children separated by `<MetaDot/>`. */
function MetaLine({ children }: { children: ReactNode }) {
  return <div className="eu-t-caption mt-2 flex items-center gap-2 flex-wrap">{children}</div>;
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
// Toolbar — one row of grouped controls with hairline separators. A group
// marked `collapse` moves into a « … » popover when the row is too narrow
// (last ones first), instead of wrapping out of the bar.
// ---------------------------------------------------------------------------

export function Toolbar({ children, className = "" }: { children: ReactNode; className?: string }) {
  const barRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);
  const [hidden, setHidden] = useState(0);
  const widths = useRef(new Map<number, number>());

  // Collapsible groups, in order: the last ones leave first.
  const items = Children.toArray(children);
  const collapsible: number[] = [];
  items.forEach((child, i) => {
    if (isValidElement<{ collapse?: boolean }>(child) && child.props.collapse) collapsible.push(i);
  });
  const hiddenSet = new Set(collapsible.slice(collapsible.length - hidden));

  useLayoutEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const fit = () => {
      for (const el of bar.querySelectorAll<HTMLElement>(":scope > [data-collapse-index]")) {
        widths.current.set(Number(el.dataset.collapseIndex), el.offsetWidth);
      }
      if (bar.scrollWidth > bar.clientWidth + 1) {
        if (hidden < collapsible.length) setHidden(hidden + 1);
        return;
      }
      if (hidden === 0) return;
      // Room for the next group to come back? Count what the bar holds now.
      const style = getComputedStyle(bar);
      const gap = parseFloat(style.columnGap) || 0;
      let used = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
      for (const el of Array.from(bar.children) as HTMLElement[]) {
        if (el.dataset.spacer === undefined) used += el.offsetWidth + gap;
      }
      const back = collapsible[collapsible.length - hidden];
      const need = (widths.current.get(back) ?? Infinity) + gap;
      // The « … » button goes away with the last hidden group.
      const freed = hidden === 1 ? (moreRef.current?.offsetWidth ?? 0) + gap : 0;
      if (used + need - freed <= bar.clientWidth) setHidden(hidden - 1);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(bar);
    return () => ro.disconnect();
  });

  return (
    <div
      ref={barRef}
      role="toolbar"
      className={`shrink-0 flex items-center gap-1.5 flex-nowrap overflow-hidden px-3 py-1.5 border-b border-line bg-panel ${className}`}
    >
      {items.map((child, i) =>
        hiddenSet.has(i) ||
        (isValidElement(child) &&
          child.type === ToolSep &&
          hiddenSet.has(i + 1)) ? null : collapsible.includes(i) ? (
          <div key={i} data-collapse-index={i} className="eu-toolbar-slot">
            {child}
          </div>
        ) : (
          child
        ),
      )}
      {hidden > 0 && (
        <div ref={moreRef} className="shrink-0">
          <MorePopover>{items.filter((_, i) => hiddenSet.has(i))}</MorePopover>
        </div>
      )}
    </div>
  );
}

/** The groups that did not fit, in a column under a « … » button. */
function MorePopover({ children }: { children: ReactNode }) {
  const popRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const id = useId();
  const label = tr("common.more");

  // The button is the popover's invoker (popoverTarget), so the browser
  // toggles it, light dismiss included; we only place it when it opens.
  useEffect(() => {
    const pop = popRef.current;
    const button = buttonRef.current;
    if (!pop || !button) return;
    const onToggle = (e: Event) => {
      if ((e as ToggleEvent).newState !== "open") return;
      void computePosition(button, pop, {
        placement: "bottom-end",
        strategy: "fixed",
        middleware: [offset(4), flip(), shift({ padding: 6 })],
      }).then(({ x, y }) => {
        pop.style.translate = `${Math.round(x)}px ${Math.round(y)}px`;
      });
    };
    pop.addEventListener("toggle", onToggle);
    return () => pop.removeEventListener("toggle", onToggle);
  }, []);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        popoverTarget={id}
        aria-label={label}
        data-tip={label}
        className="eu-btn-quiet eu-btn-icon eu-btn-sm"
      >
        <Ellipsis size={16} strokeWidth={1.75} aria-hidden />
      </button>
      <div
        ref={popRef}
        id={id}
        popover="auto"
        className="eu-menu eu-toolbar-more"
        role="group"
        aria-label={label}
      >
        {children}
      </div>
    </>
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
  /** May move into the toolbar's « … » popover when space runs out. */
  collapse?: boolean;
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
  return <span data-spacer className="flex-1" />;
}

// ---------------------------------------------------------------------------
// Segmented control — matière picker, filters, Pronote method, recap period.
// ---------------------------------------------------------------------------

export function Segmented<T extends string | number>({
  value,
  onChange,
  options,
  label,
  grow = false,
  className = "",
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: ReactNode; title?: string }>;
  label?: string;
  /** Stretch options across the full track (login method, filters). */
  grow?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`eu-segment ${grow ? "eu-segment-fill" : ""} ${className}`}
      role="tablist"
      aria-label={label}
    >
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          data-tip={o.title}
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
      <span>
        <span className="eu-t-metric text-ink block">{value}</span>
        <span className="eu-t-label block mt-1.5">{label}</span>
        {hint && <span className="eu-t-meta block mt-1">{hint}</span>}
      </span>
    </>
  );
  const base =
    "eu-stat-tile flex-1 flex items-center gap-3 px-4 border-r border-line last:border-r-0 text-left";
  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      data-tip={title}
      className={`${base} hover:bg-panel-alt transition-colors duration-fast`}
    >
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
