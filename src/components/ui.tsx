import { AnimatePresence, motion } from "framer-motion";
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
import {
  Atom,
  Book,
  Calculator,
  Code,
  Dumbbell,
  FlaskConical,
  Globe,
  Leaf,
  MessageCircle,
  Music,
  Palette,
  Pencil,
  Ruler,
} from "lucide-react";
import { CheckCircleIcon, XIcon } from "./icons";
import { get } from "../lib/i18n";

// ---------------------------------------------------------------------------
// ErrorBoundary — critical for Tauri transparent/vibrancy windows.
// If a render error happens (e.g. bad t. key access after JSON changes, missing data),
// we still paint a solid visible box + log full details instead of silent black screen.
// ---------------------------------------------------------------------------
interface ErrorBoundaryState {
  error: Error | null;
  info: ErrorInfo | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode; fallback?: ReactNode }, ErrorBoundaryState> {
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
// Modal
// ---------------------------------------------------------------------------

const FOCUSABLE = "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])";

function trapFocus(container: HTMLElement, e: KeyboardEvent) {
  if (e.key !== "Tab") return;
  const items = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.hasAttribute("disabled") && el.tabIndex !== -1 && el.offsetParent !== null
  );
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

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
  const panelRef = React.useRef<HTMLDivElement>(null);
  const restoreRef = React.useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (panelRef.current) trapFocus(panelRef.current, e);
    };
    window.addEventListener("keydown", onKey);
    const t = window.setTimeout(() => {
      const first = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE);
      first?.focus();
    }, 20);
    return () => {
      window.removeEventListener("keydown", onKey);
      clearTimeout(t);
      restoreRef.current?.focus?.();
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
          <motion.div
            className="eu-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.1 }}
            onClick={onClose}
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className={`relative w-full ${width} eu-panel shadow-pop p-5`}
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 6 }}
            transition={{ type: "spring", stiffness: 480, damping: 32, mass: 0.9 }}
          >
            <h2 className="eu-t-section text-ink text-[16px] mb-4">{title}</h2>
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export type ConfirmAskOpts = {
  title: string;
  message: string;
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

type ConfirmState =
  | { mode: "ask"; opts: ConfirmAskOpts; resolve: (v: boolean) => void }
  | { mode: "dirty"; opts: ConfirmDirtyOpts; resolve: (v: "save" | "discard" | "cancel") => void }
  | null;

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConfirmState>(null);
  const stateRef = React.useRef<ConfirmState>(null);
  stateRef.current = state;
  const panelRef = React.useRef<HTMLDivElement>(null);
  const restoreRef = React.useRef<HTMLElement | null>(null);

  const ask = useCallback((opts: ConfirmAskOpts) => {
    return new Promise<boolean>((resolve) => {
      setState({ mode: "ask", opts, resolve });
    });
  }, []);

  const dirty = useCallback((opts: ConfirmDirtyOpts) => {
    return new Promise<"save" | "discard" | "cancel">((resolve) => {
      setState({ mode: "dirty", opts, resolve });
    });
  }, []);

  const api = useMemo<ConfirmApi>(() => ({ ask, dirty }), [ask, dirty]);

  const closeAsk = useCallback((value: boolean) => {
    const s = stateRef.current;
    if (s?.mode === "ask") s.resolve(value);
    setState(null);
  }, []);
  const closeDirty = useCallback((value: "save" | "discard" | "cancel") => {
    const s = stateRef.current;
    if (s?.mode === "dirty") s.resolve(value);
    setState(null);
  }, []);

  useEffect(() => {
    if (!state) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        const s = stateRef.current;
        if (s?.mode === "ask") closeAsk(false);
        else if (s?.mode === "dirty") closeDirty("cancel");
      }
      if (panelRef.current) trapFocus(panelRef.current, e);
    };
    window.addEventListener("keydown", onKey);
    const t = window.setTimeout(() => {
      const buttons = panelRef.current?.querySelectorAll<HTMLElement>("button");
      const primary = buttons?.[buttons.length - 1];
      primary?.focus();
    }, 20);
    return () => {
      window.removeEventListener("keydown", onKey);
      clearTimeout(t);
      restoreRef.current?.focus?.();
    };
  }, [state, closeAsk, closeDirty]);

  return (
    <ConfirmCtx.Provider value={api}>
      {children}
      <AnimatePresence>
        {state && (
          <div className="fixed inset-0 z-[90] flex items-center justify-center p-6">
            <motion.div
              className="eu-scrim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.1 }}
              onClick={() => (state.mode === "ask" ? closeAsk(false) : closeDirty("cancel"))}
            />
            <motion.div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-label={state.opts.title}
              className="relative w-full max-w-md eu-panel shadow-pop p-5"
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 6 }}
              transition={{ type: "spring", stiffness: 480, damping: 32, mass: 0.9 }}
            >
              <h2 className="eu-t-section text-ink text-[16px] mb-1.5">{state.opts.title}</h2>
              <p className="eu-t-body text-ink-muted mb-5">{state.opts.message}</p>
              {state.mode === "ask" ? (
                <div className="flex justify-end gap-2">
                  <button className="eu-btn-ghost" onClick={() => closeAsk(false)}>
                    {state.opts.cancelLabel || "Annuler"}
                  </button>
                  <button
                    className={state.opts.danger ? "eu-btn-danger" : "eu-btn-primary"}
                    onClick={() => closeAsk(true)}
                  >
                    {state.opts.confirmLabel || "Confirmer"}
                  </button>
                </div>
              ) : (
                <div className="flex justify-end gap-2 flex-wrap">
                  <button className="eu-btn-ghost" onClick={() => closeDirty("cancel")}>
                    {get("confirm.cancel", "Annuler")}
                  </button>
                  <button className="eu-btn-ghost" onClick={() => closeDirty("discard")}>
                    {get("confirm.discard", "Ne pas enregistrer")}
                  </button>
                  <button className="eu-btn-primary" onClick={() => closeDirty("save")}>
                    {get("confirm.save", "Enregistrer")}
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </ConfirmCtx.Provider>
  );
}

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------

type Toast = { id: number; message: string; tone: "info" | "success" | "error" };
const ToastCtx = createContext<(message: string, tone?: Toast["tone"]) => void>(() => {});

export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((message: string, tone: Toast["tone"] = "info") => {
    const id = Date.now() + Math.random();
    // Cap the stack: a burst of imports used to push toasts off-screen.
    setToasts((t) => [...t, { id, message, tone }].slice(-4));
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3600);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="fixed bottom-9 left-1/2 -translate-x-1/2 z-overlay flex flex-col gap-2 items-center pointer-events-none"
      >
        <AnimatePresence>
          {toasts.map((toast) => {
            const toneClass =
              toast.tone === "error"
                ? "border-l-2 border-l-danger"
                : toast.tone === "success"
                ? "border-l-2 border-l-ok"
                : "";
            const iconClass =
              toast.tone === "error"
                ? "text-danger"
                : toast.tone === "success"
                ? "text-ok"
                : "text-ink-faint";
            const Icon =
              toast.tone === "success" ? (
                <CheckCircleIcon className="w-4 h-4 shrink-0" />
              ) : toast.tone === "error" ? (
                <XIcon className="w-4 h-4 shrink-0" />
              ) : (
                <div className="w-1.5 h-1.5 rounded-full bg-current shrink-0" />
              );
            return (
              <motion.button
                type="button"
                key={toast.id}
                initial={{ opacity: 0, y: 10, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 6, scale: 0.97 }}
                transition={{ type: "spring", stiffness: 420, damping: 28 }}
                onClick={() => dismiss(toast.id)}
                className={`eu-panel shadow-pop pointer-events-auto pl-3 pr-3.5 py-2.5 eu-t-body text-ink flex items-center gap-2.5 text-left max-w-[min(92vw,400px)] ${toneClass}`}
                title={get("common.close", "Fermer")}
              >
                <span className={`grid place-items-center ${iconClass}`}>{Icon}</span>
                <span className="break-words">{toast.message}</span>
              </motion.button>
            );
          })}
        </AnimatePresence>
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
/** Nice reusable loading indicator with smooth animation.
 *  Use everywhere we wait for data (courses, cours detail, contenu, etc).
 *  Prevents "freeze" feel by being lightweight + lets parent keep interactive chrome (tabs, sidebar, drag).
 */
export function Loading({ label = "Chargement…", size = "default" }: { label?: string; size?: "default" | "small" }) {
  const isSmall = size === "small";
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className={`flex flex-col items-center justify-center ${isSmall ? "py-2 gap-1.5" : "py-10 gap-3"} text-center`}
    >
      <div className={`relative ${isSmall ? "w-5 h-5" : "w-9 h-9"}`}>
        {/* track */}
        <div
          className={`absolute inset-0 rounded-full border ${isSmall ? "border-2" : "border-[3px]"} border-ink/15`}
        />
        {/* spinning arc */}
        <motion.div
          className={`absolute inset-0 rounded-full border ${isSmall ? "border-2" : "border-[3px]"} border-t-primary border-transparent`}
          animate={{ rotate: 360 }}
          transition={{ duration: 0.75, repeat: Infinity, ease: "linear" }}
        />
      </div>
      {label && (
        <p className={`${isSmall ? "text-[11px]" : "text-sm"} text-ink-muted font-mono tracking-tight`}>{label}</p>
      )}
    </motion.div>
  );
}
