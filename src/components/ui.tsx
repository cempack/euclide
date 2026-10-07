import * as React from "react";
import {
  Component,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
  type ErrorInfo,
} from "react";
import { describeError, reportLine } from "../lib/report";
import {
  Atom,
  Book,
  Calculator,
  CircleAlert,
  CircleCheck,
  Code,
  Dumbbell,
  FlaskConical,
  Globe,
  Info,
  Leaf,
  MessageCircle,
  Music,
  Palette,
  Pencil,
  Ruler,
  X,
} from "lucide-react";
import { get } from "../lib/i18n";
import { Dialog, EXIT_MS } from "../ui/Dialog";

// ---------------------------------------------------------------------------
// ErrorBoundary — critical for Tauri transparent/vibrancy windows.
// If a render error happens (e.g. bad t. key access after JSON changes, missing data),
// we still paint a solid visible box + log full details instead of silent black screen.
// ---------------------------------------------------------------------------
interface ErrorBoundaryState {
  error: Error | null;
  info: ErrorInfo | null;
}

export class ErrorBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode },
  ErrorBoundaryState
> {
  constructor(props: any) {
    super(props);
    this.state = { error: null, info: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    // Always log so user can open devtools / console in tauri to see the root cause
    console.error("[Euclide ErrorBoundary] Render error (this was causing black screen):", error);
    console.error("Component stack:", info?.componentStack);
    const component = info?.componentStack?.trim().split("\n")[0]?.trim();
    reportLine(`render ${describeError(error)}${component ? ` in ${component}` : ""}`);
    // Also expose for easy copy in devtools
    (window as any).__EUCLIDE_LAST_ERROR__ = { error, info };
    this.setState({ info });
  }
  render() {
    if (this.state.error) {
      const err = this.state.error;
      return (
        this.props.fallback || (
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 99999,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "#111",
              color: "#fff",
              fontFamily: "ui-monospace, monospace",
              padding: 24,
            }}
          >
            <div style={{ maxWidth: 520, width: "100%" }}>
              <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, color: "#fa520f" }}>
                Euclide — erreur d’affichage
              </div>
              <div style={{ opacity: 0.85, marginBottom: 12, lineHeight: 1.45 }}>
                Une erreur a interrompu l’écran. Rechargez l’application. Le détail est dans la console.
              </div>
              <pre
                style={{
                  whiteSpace: "pre-wrap",
                  background: "#1a1a1a",
                  padding: 12,
                  borderRadius: 8,
                  fontSize: 12,
                  lineHeight: 1.4,
                  border: "1px solid #333",
                }}
              >
                {err?.message || String(err)}
              </pre>
            </div>
          </div>
        )
      );
    }
    return this.props.children;
  }
}

// ---------------------------------------------------------------------------
// Modal — a titled dialog (ui/Dialog.tsx: native <dialog>, top layer).
// ---------------------------------------------------------------------------

export function Modal({
  open,
  onClose,
  title,
  children,
  width = "max-w-lg",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  width?: string;
}) {
  return (
    <Dialog open={open} onClose={onClose} label={title} className={width}>
      <div className="p-5">
        <h2 className="eu-t-title text-ink mb-4">{title}</h2>
        {children}
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Confirm — questions wait their turn: a second one never cancels the first.
// ---------------------------------------------------------------------------

export type ConfirmAskOpts = {
  title: string;
  message: string;
  /** A verb for what happens: « Supprimer », not « OK ». */
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

export type ConfirmDirtyOpts = {
  title: string;
  message: string;
};

export type ConfirmApi = {
  ask: (opts: ConfirmAskOpts) => Promise<boolean>;
  dirty: (opts: ConfirmDirtyOpts) => Promise<"save" | "discard" | "cancel">;
};

const ConfirmCtx = createContext<ConfirmApi | null>(null);
export const useConfirm = (): ConfirmApi => {
  const c = useContext(ConfirmCtx);
  if (!c) throw new Error("useConfirm: no provider");
  return c;
};

type ConfirmRequest =
  | { mode: "ask"; opts: ConfirmAskOpts; resolve: (v: boolean) => void }
  | { mode: "dirty"; opts: ConfirmDirtyOpts; resolve: (v: "save" | "discard" | "cancel") => void };

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<ConfirmRequest[]>([]);
  const current = queue[0] ?? null;
  // What the dialog shows while it fades out after the last answer.
  const [shown, setShown] = useState<ConfirmRequest | null>(null);
  if (current && current !== shown) setShown(current);
  const view = current ?? shown;

  const enqueue = useCallback((request: ConfirmRequest) => setQueue((q) => [...q, request]), []);
  const api = useMemo<ConfirmApi>(
    () => ({
      ask: (opts) => new Promise<boolean>((resolve) => enqueue({ mode: "ask", opts, resolve })),
      dirty: (opts) =>
        new Promise<"save" | "discard" | "cancel">((resolve) => enqueue({ mode: "dirty", opts, resolve })),
    }),
    [enqueue],
  );

  const answer = (value: boolean | "save" | "discard" | "cancel") => {
    const head = current;
    if (!head) return;
    if (head.mode === "ask") head.resolve(value === true);
    else head.resolve(typeof value === "string" ? value : "cancel");
    setQueue((q) => (q[0] === head ? q.slice(1) : q));
  };
  const cancel = () => answer(current?.mode === "dirty" ? "cancel" : false);

  return (
    <ConfirmCtx.Provider value={api}>
      {children}
      <Dialog open={!!current} onClose={cancel} label={view?.opts.title ?? ""} className="max-w-md">
        {view && (
          <div className="p-5">
            <h2 className="eu-t-title text-ink mb-1.5">{view.opts.title}</h2>
            <p className="eu-t-body text-ink-muted mb-5">{view.opts.message}</p>
            {view.mode === "ask" ? (
              <div className="flex justify-end gap-2">
                <button className="eu-btn-ghost" onClick={() => answer(false)}>
                  {view.opts.cancelLabel || get("confirm.cancel", "Annuler")}
                </button>
                <button
                  className={view.opts.danger ? "eu-btn-danger" : "eu-btn-primary"}
                  // A destructive question starts on « Annuler »; the others on the action.
                  data-autofocus={view.opts.danger ? undefined : true}
                  onClick={() => answer(true)}
                >
                  {view.opts.confirmLabel || get("confirm.ok", "Confirmer")}
                </button>
              </div>
            ) : (
              <div className="flex justify-end gap-2 flex-wrap">
                <button className="eu-btn-ghost" onClick={() => answer("cancel")}>
                  {get("confirm.cancel", "Annuler")}
                </button>
                <button className="eu-btn-ghost" onClick={() => answer("discard")}>
                  {get("confirm.discard", "Ne pas enregistrer")}
                </button>
                <button className="eu-btn-primary" data-autofocus onClick={() => answer("save")}>
                  {get("confirm.save", "Enregistrer")}
                </button>
              </div>
            )}
          </div>
        )}
      </Dialog>
    </ConfirmCtx.Provider>
  );
}

// ---------------------------------------------------------------------------
// Toasts — bottom right, above any open dialog, with an icon per tone and an
// optional action (« Annuler » after a deletion).
// ---------------------------------------------------------------------------

type ToastTone = "info" | "success" | "error";
export type ToastOptions = {
  action?: { label: string; run: () => void };
  /** Milliseconds on screen; longer when there is an action to take. */
  duration?: number;
};
type ToastItem = { id: number; message: string; tone: ToastTone; options?: ToastOptions; leaving?: boolean };
type ToastFn = (message: string, tone?: ToastTone, options?: ToastOptions) => void;

const ToastCtx = createContext<ToastFn>(() => {});

export const useToast = () => useContext(ToastCtx);

const TOAST_ICONS = { info: Info, success: CircleCheck, error: CircleAlert } as const;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const layerRef = React.useRef<HTMLDivElement>(null);
  const nextId = React.useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.map((x) => (x.id === id ? { ...x, leaving: true } : x)));
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), EXIT_MS);
  }, []);

  const push = useCallback<ToastFn>(
    (message, tone = "info", options) => {
      const id = nextId.current++;
      // Cap the stack: a burst of imports used to push toasts off-screen.
      setToasts((t) => [...t, { id, message, tone, options }].slice(-4));
      window.setTimeout(() => dismiss(id), options?.duration ?? (options?.action ? 6000 : 3600));
    },
    [dismiss],
  );

  // Toasts must show above a dialog opened before them: re-enter the top layer.
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer || !("showPopover" in layer)) return;
    if (layer.matches(":popover-open")) layer.hidePopover();
    if (toasts.length) layer.showPopover();
  }, [toasts.length]);

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div ref={layerRef} popover="manual" role="status" aria-live="polite" className="eu-toasts">
        {toasts.map((toast) => {
          const ToneIcon = TOAST_ICONS[toast.tone];
          return (
            <div
              key={toast.id}
              className="eu-toast"
              data-tone={toast.tone}
              data-leaving={toast.leaving || undefined}
            >
              <ToneIcon size={16} strokeWidth={1.75} aria-hidden className="eu-toast-icon" />
              <span className="flex-1 wrap-break-word">{toast.message}</span>
              {toast.options?.action && (
                <button
                  type="button"
                  className="eu-btn-quiet eu-btn-sm"
                  onClick={() => {
                    toast.options?.action?.run();
                    dismiss(toast.id);
                  }}
                >
                  {toast.options.action.label}
                </button>
              )}
              <button
                type="button"
                className="eu-toast-close"
                aria-label={get("common.close", "Fermer")}
                onClick={() => dismiss(toast.id)}
              >
                <X size={14} strokeWidth={1.75} aria-hidden />
              </button>
            </div>
          );
        })}
      </div>
    </ToastCtx.Provider>
  );
}

// ---------------------------------------------------------------------------
// Empty state — left aligned, height-capped, and it offers the next action.
// The previous centred version produced 200 px voids on Cours / Outils /
// Réglages and never told the user what to do.
// ---------------------------------------------------------------------------

export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon?: ReactNode;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3.5 p-[14px]">
      {icon && (
        <span className="w-8 h-8 shrink-0 grid place-items-center rounded border border-line text-ink-faint">
          {icon}
        </span>
      )}
      <div className="min-w-0">
        <p className="eu-t-section text-ink">{title}</p>
        {hint && <p className="eu-t-body text-ink-muted mt-1 max-w-[58ch]">{hint}</p>}
        {action && <div className="flex items-center gap-2 flex-wrap mt-3">{action}</div>}
      </div>
    </div>
  );
}

/**
 * Palette proposed when creating or editing a course.
 *
 * Twelve mid-tones instead of the previous twenty: the pastels it contained
 * (#a5b4fc, #fbbf24, #a3e635…) fell under 2:1 on paper, so a course spine or
 * icon painted with them was invisible. These all clear 4.9:1 on the light
 * canvas and are lifted automatically in dark mode by `courseVisual()`.
 *
 * Colours already stored on existing courses keep rendering — nothing is
 * migrated, `courseVisual()` simply corrects them at display time.
 */
export const COURSE_COLORS = [
  "#1f6f65", // sarcelle
  "#2f6f3f", // vert
  "#3f6f8f", // bleu acier
  "#2c62a8", // bleu
  "#3a4fa8", // indigo
  "#7a3fa0", // violet
  "#a03c78", // magenta
  "#a4262c", // rouge
  "#8f3a3a", // brique
  "#a15c07", // orange
  "#7a6a12", // olive
  "#5a5a62", // ardoise
];

// Icons for courses using lucide-react (clean, professional, recognizable SVGs for subjects)
export const COURSE_ICONS: Array<{ key: string; label: string; Icon: React.ComponentType<any> }> = [
  { key: "book", label: "Livre / Français", Icon: Book },
  { key: "calc", label: "Maths", Icon: Calculator },
  { key: "flask", label: "Sciences", Icon: FlaskConical },
  { key: "atom", label: "Physique", Icon: Atom },
  { key: "globe", label: "Géo / Histoire", Icon: Globe },
  { key: "ruler", label: "Géométrie", Icon: Ruler },
  { key: "chat", label: "Langues", Icon: MessageCircle },
  { key: "code", label: "NSI / Info", Icon: Code },
  { key: "pencil", label: "Arts / Écriture", Icon: Pencil },
  { key: "leaf", label: "SVT / Biologie", Icon: Leaf },
  { key: "music", label: "Musique", Icon: Music },
  { key: "palette", label: "Arts plastiques", Icon: Palette },
  { key: "dumbbell", label: "EPS / Sport", Icon: Dumbbell },
];

// ---------------------------------------------------------------------------
/**
 * Waiting for data. A CSS spinner (runs on the compositor, not the main
 * thread), shown only after 200 ms so quick loads don't flash.
 */
export function Loading({
  label = "Chargement…",
  size = "default",
}: {
  label?: string;
  size?: "default" | "small";
}) {
  const small = size === "small";
  return (
    <div role="status" className={`eu-loading ${small ? "py-2 gap-1.5" : "py-10 gap-3"}`}>
      <span aria-hidden className={`eu-spinner ${small ? "w-4 h-4" : "w-6 h-6"}`} />
      {label && <p className="eu-t-caption">{label}</p>}
    </div>
  );
}
