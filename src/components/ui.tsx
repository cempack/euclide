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
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
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
            className={`relative w-full ${width} new-card p-6`}
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 6 }}
            transition={{ type: "spring", stiffness: 480, damping: 32, mass: 0.9 }}
          >
            <h2 className="text-on-surface font-semibold tracking-tight text-lg mb-4">{title}</h2>
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
              className="absolute inset-0 bg-black/30 backdrop-blur-sm"
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
              className="relative w-full max-w-md new-card p-6"
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 6 }}
              transition={{ type: "spring", stiffness: 480, damping: 32, mass: 0.9 }}
            >
              <h2 className="text-on-surface font-semibold tracking-tight text-lg mb-2">{state.opts.title}</h2>
              <p className="text-sm text-mute mb-5">{state.opts.message}</p>
              {state.mode === "ask" ? (
                <div className="flex justify-end gap-2">
                  <button className="new-btn-ghost" onClick={() => closeAsk(false)}>
                    {state.opts.cancelLabel || "Annuler"}
                  </button>
                  <button
                    className={state.opts.danger ? "new-btn-primary bg-tui-danger border-tui-danger" : "new-btn-primary"}
                    onClick={() => closeAsk(true)}
                  >
                    {state.opts.confirmLabel || "Confirmer"}
                  </button>
                </div>
              ) : (
                <div className="flex justify-end gap-2 flex-wrap">
                  <button className="new-btn-ghost" onClick={() => closeDirty("cancel")}>
                    {get("confirm.cancel", "Annuler")}
                  </button>
                  <button className="new-btn-ghost" onClick={() => closeDirty("discard")}>
                    {get("confirm.discard", "Ne pas enregistrer")}
                  </button>
                  <button className="new-btn-primary" onClick={() => closeDirty("save")}>
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
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] flex flex-col gap-2 items-center">
        <AnimatePresence>
          {toasts.map((toast) => {
            const toneClass =
              toast.tone === "error"
                ? "text-tui-danger border-l-2 border-tui-danger"
                : toast.tone === "success"
                ? "text-tui-success border-l-2 border-tui-success"
                : "text-on-surface";
            const Icon =
              toast.tone === "success" ? (
                <CheckCircleIcon className="w-4 h-4 mt-0.5 shrink-0" />
              ) : toast.tone === "error" ? (
                <XIcon className="w-4 h-4 mt-0.5 shrink-0" />
              ) : (
                <div className="w-2 h-2 rounded-full bg-current mt-1.5 shrink-0 opacity-60" />
              );
            return (
              <motion.div
                key={toast.id}
                initial={{ opacity: 0, y: 10, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 6, scale: 0.97 }}
                transition={{ type: "spring", stiffness: 420, damping: 28 }}
                onClick={() => dismiss(toast.id)}
                className={`new-card px-3 py-2 text-sm flex items-start gap-2 cursor-pointer max-w-[min(92vw,380px)] ${toneClass}`}
                title="Cliquer pour fermer"
              >
                {Icon}
                <span className="break-words">{toast.message}</span>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

export function EmptyState({
  icon,
  title,
  hint,
}: {
  icon?: ReactNode;
  title: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      {icon && <div className="text-mute/70 mb-1">{icon}</div>}
      <p className="text-on-surface font-medium font-mono">{title}</p>
      {hint && <p className="text-mute text-sm max-w-sm font-mono">{hint}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section header
// ---------------------------------------------------------------------------

export function SectionHeader({
  title,
  action,
}: {
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-on-surface font-semibold text-[15px] tracking-tight">{title}</h2>
      {action}
    </div>
  );
}

export const COURSE_COLORS = [
  "#6366F1",
  "#818cf8",
  "#a5b4fc",
  "#4f46e5",
  "#2a9d8f",
  "#264653",
  "#6a6a6a",
  "#4a4a4a",
  "#f87171",
  "#fb923c",
  "#fbbf24",
  "#a3e635",
  "#4ade80",
  "#34d399",
  "#22d3ee",
  "#60a5fa",
  "#c084fc",
  "#f472b6",
  "#fb7185",
  "#14b8a6",
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
          className={`absolute inset-0 rounded-full border ${isSmall ? "border-2" : "border-[3px]"} border-primary/15`}
        />
        {/* spinning arc */}
        <motion.div
          className={`absolute inset-0 rounded-full border ${isSmall ? "border-2" : "border-[3px]"} border-t-primary border-transparent`}
          animate={{ rotate: 360 }}
          transition={{ duration: 0.75, repeat: Infinity, ease: "linear" }}
        />
      </div>
      {label && (
        <p className={`${isSmall ? "text-[11px]" : "text-sm"} text-mute font-mono tracking-tight`}>{label}</p>
      )}
    </motion.div>
  );
}
