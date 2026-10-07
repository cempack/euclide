import { useEffect, useLayoutEffect, useState, useRef, useCallback, lazy, Suspense, memo } from "react";
import { api, type AppInfo, isTauri } from "./lib/api";
import { tr } from "./lib/i18n";
import { minutesRemaining } from "./lib/format";
import { useAppearance } from "./lib/theme";
import { checkForAppUpdate, wasUpdateDismissed, type AppUpdateInfo } from "./lib/updater";
import { takeBootUpdate } from "./lib/boot";
import { errorMessage } from "./lib/errors";
import { logged, reportError } from "./lib/report";
import { chime } from "./lib/sound";
import { onTimerDone } from "./stores/timer";
import { appReady, tabSwitchEnd } from "./lib/perf";

import { tabs, useActiveTab, useTabsStore, useTabList, type Tab, type TabKind } from "./stores/tabs";
import { editors } from "./stores/editors";
import { ToastProvider, ConfirmProvider, useToast, useConfirm, Loading } from "./components/ui";
import { Segmented } from "./components/layout";
import { UpdateAvailablePopup } from "./components/UpdateAvailablePopup";
import { Sidebar, ProjectionRail } from "./shell/Sidebar";
import { TopBar } from "./shell/TopBar";
import { StatusBar } from "./shell/StatusBar";
import { TimerStage } from "./shell/Timer";
import { useExitGuard } from "./shell/exitGuard";
import { useImportFiles } from "./shell/useImportFiles";
import { useShortcut } from "./lib/keymap";
import { TooltipLayer } from "./ui/Tooltip";
import { useQueryClient } from "@tanstack/react-query";
import { q } from "./api/queries";
import { Dialog } from "./ui/Dialog";
import { DocIcon, PlusIcon } from "./components/icons";
import Dashboard from "./screens/Dashboard";

// Only the dashboard ships in the startup bundle. Every other screen loads on
// first use, and `prefetchScreens` warms them once the app is idle.
const screenModules = {
  courses: () => import("./screens/Courses"),
  course: () => import("./screens/CourseDetail"),
  documents: () => import("./screens/Documents"),
  tools: () => import("./screens/Tools"),
  python: () => import("./screens/Python"),
  settings: () => import("./screens/Settings"),
  reminders: () => import("./screens/Reminders"),
  recap: () => import("./screens/Recap"),
  classContent: () => import("./screens/ClassContent"),
  whiteboard: () => import("./components/Whiteboard"),
  pdf: () => import("./features/pdf/DocumentPane"),
  note: () => import("./components/NoteEditor"),
  palette: () => import("./components/CommandPalette"),
  shortcuts: () => import("./components/ShortcutsHelp"),
};
const Courses = lazy(screenModules.courses);
const CourseDetail = lazy(screenModules.course);
const Documents = lazy(screenModules.documents);
const Tools = lazy(screenModules.tools);
const Python = lazy(screenModules.python);
const Settings = lazy(screenModules.settings);
const Reminders = lazy(screenModules.reminders);
const Recap = lazy(screenModules.recap);
const ClassContent = lazy(screenModules.classContent);
const Whiteboard = lazy(screenModules.whiteboard);
const PdfViewer = lazy(screenModules.pdf);
const NoteEditor = lazy(screenModules.note);
const CommandPalette = lazy(screenModules.palette);
const ShortcutsHelp = lazy(screenModules.shortcuts);

/** Load every screen in the background, one at a time, once the app is idle. */
function prefetchScreens() {
  const queue = Object.values(screenModules);
  // Older WebKit has no requestIdleCallback.
  const ric = (window as { requestIdleCallback?: Window["requestIdleCallback"] }).requestIdleCallback;
  const idle = (cb: () => void) => (ric ? ric(cb, { timeout: 3000 }) : window.setTimeout(cb, 200));
  const next = () => {
    const load = queue.shift();
    if (load) load().finally(() => idle(next));
  };
  idle(next);
}

/** True from the first time `flag` is true: overlays mount on first use, then stay. */
function useLatch(flag: boolean): boolean {
  const [latched, setLatched] = useState(flag);
  if (flag && !latched) setLatched(true);
  return latched || flag;
}

/** Screens that manage their own full-bleed chrome instead of the text column. */
const FULL_BLEED: TabKind[] = ["python", "whiteboard", "pdf", "note"];

const MainContent = memo(function MainContent({ info }: { info: AppInfo | null }) {
  const list = useTabList();
  const active = useActiveTab();
  const activeId = active?.id;
  useLayoutEffect(tabSwitchEnd, [activeId]);
  // A pane mounts the first time its tab is shown, then stays mounted.
  // Restoring a session used to start every screen at launch (and a PDF.js
  // per PDF tab) before the teacher had looked at any of them.
  const [shown, setShown] = useState<ReadonlySet<string>>(() => new Set());
  const activeMount = active?.mountId;
  if (activeMount && !shown.has(activeMount)) setShown(new Set(shown).add(activeMount));
  return (
    <div className="flex-1 min-h-0 relative bg-canvas">
      {list.map((tab) => {
        const visible = tab.id === activeId;
        if (!visible && !shown.has(tab.mountId)) return null;
        return (
          <div
            key={tab.mountId}
            className="absolute inset-0 flex flex-col min-h-0"
            style={{ display: visible ? "flex" : "none" }}
            aria-hidden={!visible}
            inert={!visible}
          >
            {FULL_BLEED.includes(tab.kind) ? (
              // Tool screens own their whole surface; wrapping them in the
              // reading column is what pushed the Python pane off-screen.
              <div className="flex-1 min-h-0 flex flex-col">
                <TabPane info={info} tab={tab} visible={visible} />
              </div>
            ) : (
              <Scroll>
                <TabPane info={info} tab={tab} visible={visible} />
              </Scroll>
            )}
          </div>
        );
      })}
    </div>
  );
});

const TabPane = memo(function TabPane({
  info,
  tab,
  visible,
}: {
  info: AppInfo | null;
  tab: Tab;
  visible: boolean;
}) {
  return (
    <Suspense fallback={<Loading label={tr("common.loading")} />}>
      <TabScreen info={info} tab={tab} visible={visible} />
      {visible && tab.kind !== "dashboard" && <ReadyMark screen={tab.kind} />}
    </Suspense>
  );
});

/** perf.log's app.ready when Euclide opens on another screen than the dashboard. */
function ReadyMark({ screen }: { screen: string }) {
  useEffect(() => appReady(screen), [screen]);
  return null;
}

function TabScreen({ info, tab, visible }: { info: AppInfo | null; tab: Tab; visible: boolean }) {
  switch (tab.kind) {
    case "dashboard":
      return <Dashboard visible={visible} />;
    case "courses":
      return <Courses />;
    case "course":
      return <CourseDetail courseId={tab.params.courseId!} visible={visible} />;
    case "class-content":
      return (
        <ClassContent
          courseId={tab.params.courseId!}
          className={tab.params.className || ""}
          matiere={tab.params.matiere || ""}
        />
      );
    case "documents":
      return <Documents filterHint={tab.params.filter} visible={visible} />;
    case "tools":
      return <Tools />;
    case "python":
      return <Python />;
    case "settings":
      return <Settings info={info} />;
    case "reminders":
      return <Reminders />;
    case "recap":
      return <Recap />;
    case "whiteboard":
      return <Whiteboard tabId={tab.id} fileId={tab.params.fileId} visible={visible} />;
    case "pdf":
      return (
        <PdfViewer tabId={tab.id} fileId={tab.params.fileId!} fileName={tab.params.fileName ?? tab.title} />
      );
    case "note":
      return (
        <NoteEditor
          tabId={tab.id}
          noteId={tab.params.noteId}
          isNew={!!tab.params.isNew}
          initialCourseId={tab.params.courseId}
        />
      );
    default:
      return null;
  }
}

/**
 * The reading column for content screens: one place that owns the max width,
 * the gutters and the vertical rhythm. Screens no longer re-wrap themselves
 * (Dashboard and Rappels used to add a second `max-w` + padding, which is why
 * their headers sat at a different height from every other screen).
 */
function Scroll({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-col eu-page">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Quick capture — one line, saved as a reminder or a note.
// ---------------------------------------------------------------------------

function QuickCapture({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"reminder" | "note">("reminder");
  // A fresh line each time it opens.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setText("");
      setMode("reminder");
    }
  }

  // Prefix shortcuts: `!` forces a reminder, `#` forces a note.
  const effectiveMode = text.startsWith("!") ? "reminder" : text.startsWith("#") ? "note" : mode;
  const payload = text.replace(/^[!#]\s*/, "").trim();

  const submit = async () => {
    if (!payload) return;
    try {
      if (effectiveMode === "note") {
        const saved = await api.saveNote({ title: payload, body: "", course_id: null });
        api.logEvent("note_write", payload, null);
        window.dispatchEvent(new CustomEvent("eu:library-changed"));
        toast(tr("capture.noteSaved"), "success");
        onClose();
        if (saved?.id) tabs.open({ kind: "note", title: payload, params: { noteId: saved.id } });
      } else {
        const created = await api.createReminder(payload, null);
        if (!created?.id) throw new Error("Le rappel n'a pas été enregistré.");
        window.dispatchEvent(new CustomEvent("eu:reminders-changed"));
        toast(tr("capture.reminderSaved"), "success");
        onClose();
      }
    } catch (err) {
      reportError("capture.save", err);
      toast(errorMessage(err, tr("messages.genericError")), "error");
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      label={tr("capture.title")}
      className="max-w-lg eu-dialog-top overflow-hidden"
    >
      <div className="flex items-center gap-2.5 px-3.5 py-3 border-b border-line">
        <PlusIcon className="w-4 h-4 text-ink-faint shrink-0" />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void submit();
            }
          }}
          placeholder={tr("capture.placeholder")}
          className="flex-1 bg-transparent outline-hidden eu-t-body text-ink placeholder:text-ink-faint"
        />
      </div>
      <div className="flex items-center gap-2 px-3.5 py-2.5">
        <Segmented
          value={effectiveMode}
          onChange={(v) => {
            setMode(v);
            setText((t) => t.replace(/^[!#]\s*/, ""));
          }}
          label={tr("capture.target")}
          options={[
            { value: "reminder", label: tr("capture.asReminder") },
            { value: "note", label: tr("capture.asNote") },
          ]}
        />
        <span className="flex-1" />
        <span className="eu-t-meta hidden sm:flex items-center gap-1.5">
          <span className="eu-kbd">↵</span>
          {tr("capture.save")}
        </span>
        <button type="button" onClick={onClose} className="eu-btn-quiet eu-btn-sm">
          {tr("common.cancel")}
        </button>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!payload}
          className="eu-btn-primary eu-btn-sm"
        >
          {tr("common.add")}
        </button>
      </div>
    </Dialog>
  );
}

function Shell() {
  const queryClient = useQueryClient();
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [palette, setPalette] = useState(false);
  const [help, setHelp] = useState(false);
  const paletteUsed = useLatch(palette);
  const helpUsed = useLatch(help);

  useEffect(prefetchScreens, []);
  const [dragging, setDragging] = useState(false);
  const [availableUpdate, setAvailableUpdate] = useState<AppUpdateInfo | null>(null);
  const toast = useToast();
  const confirm = useConfirm();

  useExitGuard(confirm, toast);
  const { drop: importDropped } = useImportFiles();

  const [captureOpen, setCaptureOpen] = useState(false);
  const { projection, toggleProjection } = useAppearance();

  const activityContextRef = useRef<{ area: string; courseId: number | null }>({
    area: "dashboard",
    courseId: null,
  });
  const [appFocused, setAppFocused] = useState(true);
  const appFocusedRef = useRef(appFocused);
  useEffect(() => {
    appFocusedRef.current = appFocused;
  }, [appFocused]);

  // What the teacher is looking at, for the activity log (Bilan). Read from
  // the store directly: the shell itself never re-renders for a tab change.
  useEffect(() => {
    const track = () => {
      const tab = tabs.active();
      activityContextRef.current = {
        area: tab?.kind ?? "dashboard",
        courseId: typeof tab?.params?.courseId === "number" ? tab.params.courseId : null,
      };
    };
    track();
    return useTabsStore.subscribe(track);
  }, []);

  const handleHelp = useCallback(() => setHelp(true), []);
  const handleSearch = useCallback(() => setPalette(true), []);
  const closePalette = useCallback(() => setPalette(false), []);
  const closeCapture = useCallback(() => setCaptureOpen(false), []);
  const closeHelp = useCallback(() => setHelp(false), []);
  const dismissUpdate = useCallback(() => setAvailableUpdate(null), []);

  const requestClose = useCallback(
    async (id: string) => {
      if (editors.isDirty(id)) {
        const choice = await confirm.dirty({
          title: tr("confirm.unsavedTitle"),
          message: tr("confirm.unsavedMessage"),
        });
        if (choice === "cancel") return;
        if (choice === "discard") {
          tabs.close(id, { discard: true });
          return;
        }
        try {
          await editors.flush(id);
        } catch (err) {
          reportError("tabs.closeSave", err);
          toast(errorMessage(err, tr("messages.genericError")), "error");
          return;
        }
      }
      tabs.close(id);
    },
    [confirm, toast],
  );

  useEffect(() => {
    api.appInfo().then(setInfo).catch(logged("app.info"));
  }, []);

  useEffect(() => {
    const onCapture = () => setCaptureOpen(true);
    window.addEventListener("eu:capture-open", onCapture);
    return () => window.removeEventListener("eu:capture-open", onCapture);
  }, []);

  // « Fin de cours annoncée »: one discreet notice a few minutes before the bell,
  // driven by the schedule. Off / silent / with a chime, from Réglages.
  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    let mode: "off" | "toast" | "sound" = "toast";
    let lead = 5;
    const notified = new Set<string>();

    const readPrefs = async () => {
      const [m, l] = await Promise.all([
        queryClient.fetchQuery(q.setting("class_end_notice")).catch(() => null),
        queryClient.fetchQuery(q.setting("class_end_lead")).catch(() => null),
      ]);
      if (cancelled) return;
      if (m === "off" || m === "toast" || m === "sound") mode = m;
      const n = l ? parseInt(l, 10) : NaN;
      if (!Number.isNaN(n) && n >= 1 && n <= 15) lead = n;
    };
    void readPrefs();
    const onPrefs = () => void readPrefs();
    window.addEventListener("eu:settings-changed", onPrefs);

    const tick = async () => {
      if (mode === "off") return;
      try {
        // From the shared cache: the dashboard and status bar keep it current.
        const classes = await queryClient.fetchQuery(q.todayClasses());
        const now = new Date();
        for (const c of classes) {
          const left = minutesRemaining(c, now);
          if (left == null || left > lead || left < 1) continue;
          const key = `${c.id}:${c.end_time}`;
          if (notified.has(key)) continue;
          notified.add(key);
          toast(
            tr("classEnd.notice", {
              subject: c.subject,
              minutes: left,
            }),
            "info",
          );
          if (mode === "sound") chime(0.05);
        }
      } catch {
        // offline / no schedule: nothing to announce
      }
    };
    const interval = window.setInterval(tick, 60_000);
    const seed = window.setTimeout(tick, 8_000);
    return () => {
      cancelled = true;
      window.removeEventListener("eu:settings-changed", onPrefs);
      window.clearInterval(interval);
      window.clearTimeout(seed);
    };
  }, [toast, queryClient]);

  useEffect(
    () =>
      onTimerDone(() => {
        chime();
        toast(tr("timer.done"), "success");
      }),
    [toast],
  );

  // First launch after an update: say so, once.
  useEffect(() => {
    const updated = takeBootUpdate();
    if (updated) toast(`Euclide a été mis à jour vers la version ${updated.to}.`, "success");
  }, [toast]);

  useEffect(() => {
    const onAvailable = (e: Event) => {
      const detail = (e as CustomEvent<AppUpdateInfo>).detail;
      if (!detail?.version) return;
      if (wasUpdateDismissed(detail.version)) return;
      setAvailableUpdate(detail);
    };
    window.addEventListener("eu:update-available", onAvailable);
    return () => window.removeEventListener("eu:update-available", onAvailable);
  }, []);

  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const update = await checkForAppUpdate();
        if (cancelled || !update) return;
        if (wasUpdateDismissed(update.version)) return;
        window.dispatchEvent(new CustomEvent("eu:update-available", { detail: update }));
      } catch {
        // Draft-only GitHub releases, offline, etc. Stay quiet.
      }
    }, 4000);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let active = true;
    import("@tauri-apps/api/webview")
      .then(({ getCurrentWebview }) =>
        getCurrentWebview().onDragDropEvent(async (event) => {
          const p = event.payload as { type: string; paths?: string[] };
          if (p.type === "enter" || p.type === "over") {
            setDragging(true);
          } else if (p.type === "drop") {
            setDragging(false);
            const paths = p.paths ?? [];
            if (!paths.length) return;
            await importDropped(paths);
          } else {
            setDragging(false);
          }
        }),
      )
      .then((u) => {
        if (active) unlisten = u;
        else u();
      })
      .catch(logged("app.dragDrop"));
    return () => {
      active = false;
      unlisten?.();
    };
  }, [importDropped]);

  useEffect(() => {
    if (!isTauri()) return;
    const tick = () => {
      if (!appFocusedRef.current) return;
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      const ctx = activityContextRef.current;
      // Every minute: a lost tick is not worth a log line.
      api.logEvent("active_tick", ctx.area, ctx.courseId).catch(() => {});
    };
    const seed = window.setTimeout(tick, 2500);
    const interval = window.setInterval(tick, 60_000);
    return () => {
      window.clearTimeout(seed);
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!isTauri()) return;
    let unlistenFocus: (() => void) | undefined;
    let unlistenBlur: (() => void) | undefined;
    (async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const win = getCurrentWindow();
        unlistenFocus = await win.listen("tauri://focus", () => {
          setAppFocused(true);
          setTimeout(() => {
            if (document.visibilityState === "visible") {
              const ctx = activityContextRef.current;
              // Like the minute tick: losing one is harmless.
              api.logEvent("active_tick", ctx.area, ctx.courseId).catch(() => {});
            }
          }, 1500);
        });
        unlistenBlur = await win.listen("tauri://blur", () => setAppFocused(false));
      } catch (err) {
        reportError("app.focusListen", err);
      }
    })();
    return () => {
      unlistenFocus?.();
      unlistenBlur?.();
    };
  }, []);

  // The app's shortcuts (lib/keymap.ts says which keys, and when they apply).
  const openDashboard = () => {
    if (tabs.active()?.kind !== "dashboard") tabs.open({ kind: "dashboard" });
  };
  useShortcut("palette", () => setPalette((p) => !p));
  useShortcut("capture", () => setCaptureOpen((c) => !c));
  useShortcut("help", () => setHelp((h) => !h));
  // F5 presents a note (NoteEditor binds it); anywhere else it does nothing,
  // rather than reload the window and lose what is not saved.
  useShortcut("present", () => {});
  useShortcut("projection", toggleProjection);
  useShortcut("newTab", openDashboard);
  useShortcut("dashboard", openDashboard);
  useShortcut("closeTab", () => void requestClose(tabs.activeId()));
  useShortcut("gotoTab", (digit) => tabs.focusIndex((digit ?? 1) - 1));
  useShortcut("nextTab", tabs.next);
  useShortcut("prevTab", tabs.prev);
  useShortcut("documents", () => void tabs.open({ kind: "documents" }));
  useShortcut("settings", () => void tabs.open({ kind: "settings" }));
  useShortcut("newNote", () => {
    tabs.open({ kind: "note", title: tr("common.newNote"), params: { isNew: true } });
  });
  useShortcut("whiteboard", () => {
    tabs.open({ kind: "whiteboard", title: tr("app.tabWhiteboard"), params: { isNew: true } });
  });
  // Save the active editor: notes, the whiteboard and the Python editor each
  // register how (stores/editors.ts), as the unsaved-changes prompt uses.
  useShortcut("save", () => {
    const id = tabs.activeId();
    if (!editors.isDirty(id)) return;
    editors
      .flush(id)
      .then(() => toast(tr("messages.saved"), "success"))
      .catch((err) => {
        reportError("editor.save", err);
        toast(errorMessage(err, tr("messages.genericError")), "error");
      });
  });
  // Escape is the way out of projection mode; open dialogs close first.
  useShortcut(
    "leaveProjection",
    () => {
      if (palette || help || captureOpen || document.querySelector("dialog[open]")) return false;
      toggleProjection();
    },
    projection,
  );

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-canvas eu-root">
      <div className="flex flex-1 min-h-0">
        {/* Projection keeps a slim quit rail; the tab strip and status bar hide. */}
        {projection ? <ProjectionRail /> : <Sidebar info={info} />}
        <main className="@container flex-1 h-full flex flex-col min-w-0 bg-canvas eu-main">
          {!projection && <TopBar onHelp={handleHelp} onSearch={handleSearch} onCloseTab={requestClose} />}
          <MainContent info={info} />
        </main>
      </div>
      {!projection && <StatusBar info={info} />}
      <TooltipLayer />

      {projection && <TimerStage />}

      {paletteUsed && (
        <Suspense fallback={null}>
          <CommandPalette open={palette} onClose={closePalette} onHelp={handleHelp} />
        </Suspense>
      )}
      <QuickCapture open={captureOpen} onClose={closeCapture} />
      {helpUsed && (
        <Suspense fallback={null}>
          <ShortcutsHelp open={help} onClose={closeHelp} />
        </Suspense>
      )}
      <UpdateAvailablePopup update={availableUpdate} onDismiss={dismissUpdate} />
      {dragging && (
        <div className="fixed inset-0 z-80 grid place-items-center bg-accent/10 pointer-events-none">
          <div className="eu-panel shadow-pop px-7 py-5 border-dashed border-accent flex items-center gap-3.5">
            <DocIcon className="w-7 h-7 text-accent shrink-0" />
            <div>
              <p className="eu-t-section text-ink">{tr("dragDrop.drop")}</p>
              <p className="eu-t-meta mt-0.5">{tr("dragDrop.hint")}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <Shell />
      </ConfirmProvider>
    </ToastProvider>
  );
}
