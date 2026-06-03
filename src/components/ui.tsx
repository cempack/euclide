import { AnimatePresence, motion } from "framer-motion";
import * as React from "react";
import {
  Component,
  createContext,
  useCallback,
  useContext,
  useEffect,
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
            <div style={{ maxWidth: 720, width: "100%" }}>
              <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, color: "#fa520f" }}>
                Euclide — UI error (black screen prevented)
              </div>
              <div style={{ opacity: 0.85, marginBottom: 12 }}>
                An error occurred while rendering. The transparent window would have been black; this boundary forced a visible report.
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
                {"\n\n"}
                {err?.stack || ""}
              </pre>
              <div style={{ marginTop: 12, fontSize: 11, opacity: 0.6 }}>
                Check console (or window.__EUCLIDE_LAST_ERROR__) for full details. Fix the key/path in src/locales/fr.json or the access site.
              </div>
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
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
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

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] flex flex-col gap-2 items-center">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 10, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.97 }}
              transition={{ type: "spring", stiffness: 420, damping: 28 }}
              className={`new-card px-4 py-2.5 text-sm ${
                toast.tone === "error"
                  ? "text-tui-danger border-l-2 border-tui-danger"
                  : toast.tone === "success"
                  ? "text-tui-success border-l-2 border-tui-success"
                  : "text-on-surface"
              }`}
            >
              {toast.message}
            </motion.div>
          ))}
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

// Legacy (kept for compat)
export const COURSE_EMOJIS: string[] = [];

// ---------------------------------------------------------------------------
/** Nice reusable loading indicator with smooth animation.
 *  Use everywhere we wait for data (courses, cours detail, contenu, recap, etc).
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
