import { useEffect, useRef, useState } from "react";
import { CircleStop, ListChecks } from "lucide-react";
import { api, isTauri, type PythonDemo } from "../lib/api";
import { tr, trn } from "../lib/i18n";
import { errorMessage } from "../lib/errors";
import { logged, reportError } from "../lib/report";
import { useFailure, useToast, useConfirm } from "../components/ui";
import { useActiveKind } from "../stores/tabs";
import { editors } from "../stores/editors";
import PythonEditor from "../features/python/PythonEditor";
import { OutputPanel, type OutputTab } from "../features/python/OutputPanel";
import { useRun } from "../features/python/useRun";
import { useSetting } from "../api/hooks";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { q } from "../api/queries";
import { Icon } from "../ui/Icon";
import { Toolbar, ToolGroup, ToolSep } from "../components/layout";
import { keysOf, useShortcut } from "../lib/keymap";
import { tip } from "../ui/Tooltip";
import { CodeXml, Play, Plus, Trash2 } from "lucide-react";
import { NewScriptDialog, TemplateLevels } from "../features/python/TemplateGallery";
import type { LevelId, ScriptTemplate } from "../features/python/templates";
import { scriptIcon } from "../features/python/scriptIcon";

const TIME_LIMITS = [10, 30, 60, 300, 0];
const NO_SCRIPTS: PythonDemo[] = [];
const OUTPUT_MIN = 96;

/** The file name the runner shows in tracebacks and checks look up. */
function fileName(script: { name: string; path?: string }): string {
  const fromPath = script.path?.split(/[\\/]/).pop();
  if (fromPath) return fromPath;
  const slug = script.name
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/g, "");
  return `${slug || "script"}.py`;
}

export default function Python({ request }: { request?: { script: string; at: number } }) {
  const toast = useToast();
  const failed = useFailure();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const scriptsQ = useQuery(q.scripts());
  const demos = scriptsQ.data ?? NO_SCRIPTS;
  const setDemos = (update: (prev: PythonDemo[]) => PythonDemo[]) =>
    queryClient.setQueryData(q.scripts().queryKey, (prev) => update(prev ?? []));
  const [openScript, setOpenScript] = useState<{
    name: string;
    code: string;
    path?: string;
    isDirty: boolean;
  } | null>(null);
  const runner = useRun();
  // The editor's text as of the last keystroke: Ctrl+↵ right after typing
  // must run what is on screen, not the last render's copy.
  const latestCode = useRef<{ key: string; code: string } | null>(null);
  const docKey = (script: { name: string; path?: string }) => script.path ?? `temp:${script.name}`;
  const running = runner.status.state === "running" || runner.status.state === "input";
  const [tab, setTab] = useState<OutputTab>("console");
  const [savedLimit, setLimit] = useSetting("python_timeout");
  const limit = savedLimit != null && TIME_LIMITS.includes(Number(savedLimit)) ? Number(savedLimit) : 30;
  const [savedHeight, setSavedHeight] = useSetting("python_output_height");
  const [outputHeight, setOutputHeight] = useState<number | null>(null);
  const height = outputHeight ?? (Number(savedHeight) || 220);
  const splitRef = useRef<HTMLDivElement>(null);

  // A drawing arrives: show it, as Python opens its window (the console's
  // text waits under its tab, marked). A question brings the console back.
  const hasDrawing = runner.turtle.length > 0 || runner.plots.length > 0;
  const [drawingSeen, setDrawingSeen] = useState(hasDrawing);
  if (hasDrawing !== drawingSeen) {
    setDrawingSeen(hasDrawing);
    if (hasDrawing && tab === "console") setTab("drawing");
  }
  const asking = runner.status.state === "input";
  const [askingSeen, setAskingSeen] = useState(asking);
  if (asking !== askingSeen) {
    setAskingSeen(asking);
    if (asking && tab !== "console") setTab("console");
  }

  // Have Python started before the first run (it takes a moment on a slow PC).
  useEffect(() => {
    if (isTauri()) api.pythonPrewarm().catch(logged("python.prewarm"));
  }, []);

  const [isEditingName, setIsEditingName] = useState(false);
  const [editingName, setEditingName] = useState("");

  // Another script (or a rename, a save-as): the inline rename closes.
  const identity = `${openScript?.path ?? ""}|${openScript?.name ?? ""}`;
  const [renameFor, setRenameFor] = useState(identity);
  if (renameFor !== identity) {
    setRenameFor(identity);
    setIsEditingName(false);
    setEditingName("");
  }

  useEffect(() => {
    editors.setDirty("python", !!openScript?.isDirty);
    return () => editors.setDirty("python", false);
  }, [openScript?.isDirty]);

  const refresh = async (selectPath?: string): Promise<PythonDemo[]> => {
    const list = await queryClient.fetchQuery({ ...q.scripts(), staleTime: 0 }).catch(() => NO_SCRIPTS);

    if (selectPath) {
      const found = list.find((d) => d.path === selectPath);
      if (found) {
        setOpenScript({
          name: found.name,
          code: found.code,
          path: found.path,
          isDirty: false,
        });
      }
    }
    return list;
  };

  // Nothing open: the first script. The open one deleted elsewhere: the
  // first one left. An unsaved new buffer (no path) stays as it is.
  const missing = !!openScript?.path && scriptsQ.isSuccess && !demos.some((d) => d.path === openScript.path);
  if ((!openScript && demos.length > 0) || missing) {
    const first = demos[0];
    setOpenScript(first ? { name: first.name, code: first.code, path: first.path, isDirty: false } : null);
  }

  const select = async (d: PythonDemo) => {
    if (openScript?.isDirty) {
      const ok = await confirm.ask({
        title: tr("tools.unsavedTitle"),
        message: tr("tools.unsavedSwitch"),
        confirmLabel: tr("common.open"),
        danger: true,
      });
      if (!ok) return;
    }
    setOpenScript({
      name: d.name,
      code: d.code,
      path: d.path,
      isDirty: false,
    });
  };

  // A lesson opens one of the scripts (lesson.ts): select it once the list is in.
  const requestAt = request?.at;
  const requested = request?.script;
  const [handledRequest, setHandledRequest] = useState<number | undefined>(undefined);
  useEffect(() => {
    if (requestAt == null || requestAt === handledRequest || !scriptsQ.isSuccess) return;
    const d = demos.find((x) => x.path.split(/[\\/]/).pop() === requested);
    void Promise.resolve().then(() => {
      setHandledRequest(requestAt);
      if (d && d.path !== openScript?.path) void select(d);
      else if (!d) toast(tr("python.scriptMissing", { name: requested ?? "" }), "error");
    });
    // select and openScript are read at the time of the request only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestAt, requested, handledRequest, scriptsQ.isSuccess, demos]);

  /** The template gallery, open on a level (or the last one seen). */
  const [gallery, setGallery] = useState<{ level?: LevelId } | null>(null);
  const [lastLevel, setLastLevel] = useState<LevelId>("bases");
  /** A new script from a template: an unsaved buffer, saved under the template's name. */
  const create = async (t: ScriptTemplate) => {
    if (openScript?.isDirty) {
      const ok = await confirm.ask({
        title: tr("tools.unsavedTitle"),
        message: tr("tools.unsavedSwitch"),
        confirmLabel: tr("common.open"),
        danger: true,
      });
      if (!ok) return;
    }
    // Create a temporary / unsaved script buffer that immediately appears in the file tree.
    // Clicking Enregistrer on it will persist it (using the name shown in the tree).
    setOpenScript({
      name: t.scriptName ?? t.name,
      code: t.code,
      isDirty: true,
    });
  };

  const importScript = async () => {
    if (openScript?.isDirty) {
      const ok = await confirm.ask({
        title: tr("tools.unsavedTitle"),
        message: tr("tools.unsavedSwitch"),
        confirmLabel: tr("common.open"),
        danger: true,
      });
      if (!ok) return;
    }
    let d: PythonDemo | null;
    try {
      d = await api.importScript();
    } catch (err) {
      failed("python.import", err);
      return;
    }
    if (d) {
      setOpenScript({
        name: d.name,
        code: d.code,
        path: d.path,
        isDirty: false,
      });
      await refresh();
      toast(tr("tools.toastImported", { name: d.name }), "success");
    }
  };

  /** Saves the open script; `quiet` when Ctrl+S or quitting asks (they say so themselves). */
  const save = async (quiet = false) => {
    if (!openScript) return;

    try {
      if (!openScript.path) {
        // New/unsaved buffer visible in the file tree: create it now using its current tree name.
        // (Backend will unique the filename if needed; we adopt the returned display name.)
        // This makes "Enregistrer" on a new entry actually persist it, just like the other saved scripts.
        const created = await api.createScript(openScript.name, openScript.code);
        if (!created?.path) {
          toast(tr("tools.toastScriptSaveError"), "error");
          return;
        }

        // Immediately promote the open buffer to a real persisted script (no more temp row / "*").
        // Optimistically update the list so the new file appears among the other ones right away.
        setDemos((prev) => {
          const without = prev.filter((d) => d.path !== created.path);
          return [...without, created].sort((a, b) => a.name.localeCompare(b.name));
        });

        setOpenScript({
          name: created.name,
          code: created.code,
          path: created.path,
          isDirty: false,
        });

        // Still refresh in background to fully reconcile list + ensure selection (in case of races or external changes).
        refresh(created.path).catch(logged("python.refresh"));

        if (!quiet) toast(tr("tools.toastScriptSaved"), "success");
        return; // we already promoted the openScript + list; don't fall through to the old common set
      } else {
        const pathToUse = openScript.path!;
        const nameToUse = openScript.name;
        await api.saveScript(pathToUse, openScript.code);
        setDemos((prev) =>
          prev.map((d) => (d.path === pathToUse ? { ...d, code: openScript.code, name: nameToUse } : d)),
        );

        setOpenScript({
          name: nameToUse,
          code: openScript.code,
          path: pathToUse,
          isDirty: false,
        });
        if (!quiet) toast(tr("tools.toastScriptSaved"), "success");
      }
    } catch (err) {
      reportError("python.save", err);
      toast(errorMessage(err, tr("tools.toastScriptSaveError")), "error");
    }
  };

  // Quitting with « Enregistrer » saves what is on screen now.
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });
  useEffect(() => editors.registerFlush("python", () => saveRef.current(true)), []);

  const run = async (withChecks: boolean) => {
    if (!openScript) return;
    api.logEvent("demo_run", openScript.name ?? "scratch", null).catch(logged("python.logRun"));
    setTab(withChecks ? "checks" : "console");
    await runner.start({
      name: fileName(openScript),
      code: latestCode.current?.key === docKey(openScript) ? latestCode.current.code : openScript.code,
      checks: withChecks,
      timeoutS: limit || 3600,
    });
  };

  // Ctrl+↵ runs the open script, Ctrl+Maj+↵ checks it, while the Python tab
  // is the one shown (every pane stays mounted).
  const shown = useActiveKind() === "python";
  useShortcut("runPython", () => void run(false), shown);
  useShortcut("checkPython", () => void run(true), shown);

  // Drag the bar between editor and console; the height is remembered.
  const [dragging, setDragging] = useState(false);
  /** The output's height, kept between the minimum and room for the editor. */
  const clampHeight = (h: number) => {
    const box = splitRef.current?.getBoundingClientRect();
    return Math.round(Math.min((box?.height ?? h + 80) - 80, Math.max(OUTPUT_MIN, h)));
  };
  const resizeTo = (h: number) => {
    const next = clampHeight(h);
    setOutputHeight(next);
    setSavedHeight(String(next));
  };
  const startResize = (e: React.PointerEvent<HTMLDivElement>) => {
    const box = splitRef.current?.getBoundingClientRect();
    if (!box) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    let last: number | null = null;
    const move = (ev: PointerEvent) => {
      last = clampHeight(box.bottom - ev.clientY);
      setOutputHeight(last);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setDragging(false);
      if (last != null) setSavedHeight(String(last));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const deleteCurrent = async () => {
    if (!openScript) return;
    if (openScript.path) {
      const ok = await confirm.ask({
        title: tr("tools.confirmDeleteScript", { name: openScript.name }),
        message: tr("python.deleteScriptBody"),
        confirmLabel: tr("common.delete"),
        danger: true,
      });
      if (!ok) return;
      try {
        await api.deleteScript(openScript.path);
      } catch (err) {
        failed("python.delete", err);
        return;
      }
    }
    setOpenScript(null);
    const list = await refresh();
    if (list.length > 0) {
      const first = list[0];
      setOpenScript({
        name: first.name,
        code: first.code,
        path: first.path,
        isDirty: false,
      });
    }
  };

  const startRename = () => {
    if (!openScript) return;
    setEditingName(openScript.name);
    setIsEditingName(true);
  };

  const cancelRename = () => {
    setIsEditingName(false);
    setEditingName("");
  };

  const commitRename = async () => {
    if (!openScript || !editingName.trim()) {
      cancelRename();
      return;
    }
    const newName = editingName.trim();
    if (newName === openScript.name) {
      cancelRename();
      return;
    }
    try {
      if (openScript.path) {
        // Persisted script: rename the file on disk (path may change due to slugify)
        const updated = await api.renameScript(openScript.path, newName);
        if (!updated?.path) {
          toast("Impossible de renommer le script", "error");
          return;
        }
        // Optimistically update demos list (path may be new)
        setDemos((prev) => {
          const filtered = prev.filter((d) => d.path !== openScript.path);
          return [...filtered, updated].sort((a, b) => a.name.localeCompare(b.name));
        });
        // Promote open to new identity, but preserve any unsaved edits (code + isDirty)
        setOpenScript((prev) =>
          prev
            ? {
                name: updated.name,
                code: prev.code,
                path: updated.path,
                isDirty: prev.isDirty,
              }
            : null,
        );
      } else {
        // Temporary buffer: just update the name in memory (will be used on first save)
        setOpenScript((prev) => (prev ? { ...prev, name: newName } : null));
      }
      toast(tr("tools.toastScriptRenamed", { name: newName }), "success");
    } catch (err) {
      reportError("python.rename", err);
      toast(errorMessage(err, "Impossible de renommer le script"), "error");
    } finally {
      setIsEditingName(false);
      setEditingName("");
    }
  };

  return (
    <div className="h-full min-h-0 flex eu-no-drag">
      <NewScriptDialog
        open={gallery !== null}
        level={gallery?.level ?? lastLevel}
        onLevel={setLastLevel}
        onClose={() => setGallery(null)}
        onPick={(t) => void create(t)}
        current={openScript ? { name: openScript.name, code: openScript.code } : null}
      />
      {/* Script explorer */}
      <aside className="w-[210px] @max-3xl:w-40 shrink-0 h-full flex flex-col border-r border-line bg-canvas">
        <div className="flex items-center justify-between gap-1 px-2.5 h-9 shrink-0 border-b border-line">
          <span className="eu-t-label">{tr("tools.scripts")}</span>
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => setGallery({})}
              className="eu-btn-quiet eu-btn-icon eu-btn-sm"
              aria-label={tr("python.newScript")}
              aria-haspopup="dialog"
              data-tip={tr("python.newScriptTitle")}
            >
              <Icon icon={Plus} size={14} />
            </button>
            <button
              onClick={importScript}
              className="eu-btn-quiet eu-btn-sm"
              data-tip={tr("python.importTitle")}
            >
              {tr("tools.importerBtn")}
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-1">
          {/* The unsaved buffer shows in the tree until it is saved. */}
          {openScript && !openScript.path && (
            <div
              className="flex items-center gap-2 px-2 h-7 rounded bg-panel-alt text-ink eu-no-drag"
              data-tip={tr("python.tempScript")}
              aria-label={tr("python.tempScript")}
            >
              <Icon icon={scriptIcon(openScript.code)} size={14} className="shrink-0 text-ink-faint" />
              <span className="eu-t-meta text-ink truncate flex-1">{openScript.name}</span>
              <span className="w-1.5 h-1.5 rounded-full bg-warn-solid shrink-0" />
            </div>
          )}

          {demos.length === 0 && !(openScript && !openScript.path) ? (
            <p className="eu-t-meta p-2.5">{tr("tools.noScripts")}</p>
          ) : (
            demos.map((d) => {
              const isSel = !!openScript?.path && openScript.path === d.path;
              return (
                <button
                  key={d.path}
                  onClick={() => select(d)}
                  aria-current={isSel ? "page" : undefined}
                  className="eu-nav-item w-full h-7 px-2 gap-2 eu-no-drag"
                >
                  <Icon icon={scriptIcon(d.code)} size={14} className="eu-nav-icon" />
                  <span className="eu-t-small truncate">{d.name}</span>
                </button>
              );
            })
          )}
          <button
            type="button"
            onClick={() => setGallery({})}
            aria-haspopup="dialog"
            className="eu-nav-item w-full h-7 px-2 gap-2 mt-1 text-ink-faint eu-no-drag"
          >
            <Icon icon={Plus} size={14} className="eu-nav-icon" />
            <span className="eu-t-small truncate">{tr("python.newScript")}</span>
          </button>
        </div>

        <div className="px-2.5 py-2 border-t border-line">
          <p className="eu-t-caption">{trn("tools.scriptsCount", demos.length)}</p>
        </div>
      </aside>

      {/* Editor + output */}
      <div className="flex-1 min-w-0 h-full flex flex-col min-h-0 bg-canvas">
        {openScript ? (
          <Toolbar className="h-9 py-0">
            <ToolGroup className="min-w-0 flex-1">
              <Icon icon={CodeXml} size={14} className="text-ink-faint shrink-0" />
              {isEditingName ? (
                <input
                  type="text"
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename();
                    else if (e.key === "Escape") cancelRename();
                  }}
                  autoFocus
                  onFocus={(e) => e.currentTarget.select()}
                  className="eu-input h-7 font-mono w-[24ch]"
                  placeholder={tr("python.namePlaceholder")}
                  aria-label={tr("python.namePlaceholder")}
                />
              ) : (
                <button
                  onClick={startRename}
                  data-tip={tr("python.renameTitle")}
                  className="font-mono text-small text-ink truncate px-1 -mx-1 rounded hover:bg-panel-alt"
                >
                  {openScript.name}
                </button>
              )}
              {openScript.isDirty && (
                <span
                  className="w-1.5 h-1.5 rounded-full bg-warn-solid shrink-0"
                  data-tip={tr("app.unsaved")}
                />
              )}
              {!openScript.path && <span className="eu-chip shrink-0">{tr("python.temp")}</span>}
            </ToolGroup>
            <ToolSep />
            <ToolGroup>
              <button
                onClick={() => void save()}
                disabled={!openScript.isDirty}
                className="eu-btn-ghost eu-btn-sm"
                {...tip(tr("tools.saveBtn"), keysOf("save"))}
              >
                {tr("tools.saveBtn")}
              </button>
              {running ? (
                <button onClick={runner.stop} className="eu-btn-danger eu-btn-sm" {...tip(tr("python.stop"))}>
                  <Icon icon={CircleStop} size={14} />
                  {tr("python.stop")}
                </button>
              ) : (
                <button
                  onClick={() => void run(false)}
                  className="eu-btn-primary eu-btn-sm"
                  {...tip(tr("tools.execute"), keysOf("runPython"))}
                >
                  <Icon icon={Play} size={14} />
                  {tr("tools.execute")}
                </button>
              )}
              <button
                onClick={() => void run(true)}
                disabled={running}
                className="eu-btn-ghost eu-btn-sm"
                {...tip(tr("python.checkTitle"), keysOf("checkPython"))}
              >
                <Icon icon={ListChecks} size={14} />
                {tr("python.check")}
              </button>
            </ToolGroup>
            <ToolGroup collapse label={tr("python.timeLimit")}>
              <select
                value={String(limit)}
                onChange={(e) => setLimit(e.target.value)}
                className="eu-select eu-field-sm w-auto"
                aria-label={tr("python.timeLimit")}
                data-tip={tr("python.timeLimit")}
              >
                {TIME_LIMITS.map((s) => (
                  <option key={s} value={String(s)}>
                    {s === 0
                      ? tr("python.noTimeLimit")
                      : s < 60
                        ? tr("python.timeLimitOption", { s })
                        : tr("python.timeLimitMinutes", { m: s / 60 })}
                  </option>
                ))}
              </select>
            </ToolGroup>
            <ToolGroup collapse>
              <button
                onClick={deleteCurrent}
                className="eu-btn-quiet eu-btn-icon eu-btn-sm hover:text-danger"
                aria-label={tr("common.delete")}
                data-tip={tr("common.delete")}
              >
                <Icon icon={Trash2} size={14} />
              </button>
            </ToolGroup>
          </Toolbar>
        ) : (
          <Toolbar className="h-9 py-0">
            <span className="eu-t-meta">{tr("tools.noScriptSelected")}</span>
          </Toolbar>
        )}

        <div ref={splitRef} className="flex-1 min-h-0 flex flex-col">
          <div className="flex-1 min-h-0">
            {openScript ? (
              <PythonEditor
                docKey={docKey(openScript)}
                value={openScript.code}
                filename={openScript.path}
                label={tr("python.editorLabel", { name: openScript.name })}
                onChange={(v) => {
                  latestCode.current = { key: docKey(openScript), code: v };
                  setOpenScript((prev) => (prev ? { ...prev, code: v, isDirty: true } : null));
                }}
              />
            ) : (
              <div className="h-full overflow-y-auto @container">
                <div className="max-w-3xl mx-auto px-6 py-8">
                  <p className="eu-t-section text-ink">{tr("python.emptyTitle")}</p>
                  <p className="eu-t-body text-ink-muted mt-1 mb-5">{tr("tools.emptyEditorHint")}</p>
                  <TemplateLevels onPick={(t) => void create(t)} onOpen={(level) => setGallery({ level })} />
                </div>
              </div>
            )}
          </div>

          {/* The bar between editor and console: drag it, or use the arrows, to share the height. */}
          <div
            role="separator"
            aria-orientation="horizontal"
            aria-label={tr("python.resize")}
            aria-valuenow={height}
            aria-valuemin={OUTPUT_MIN}
            tabIndex={0}
            onPointerDown={startResize}
            onKeyDown={(e) => {
              const step = e.key === "ArrowUp" ? 24 : e.key === "ArrowDown" ? -24 : 0;
              if (!step) return;
              e.preventDefault();
              resizeTo(height + step);
            }}
            data-dragging={dragging || undefined}
            className="eu-split"
          />
          <div className="shrink-0 min-h-0" style={{ height }}>
            <OutputPanel
              tab={tab}
              onTab={setTab}
              lines={runner.lines}
              status={runner.status}
              turtle={runner.turtle}
              plots={runner.plots}
              checks={runner.checks}
              scriptName={openScript ? fileName(openScript) : "script.py"}
              onAnswer={runner.answer}
              onClear={runner.clear}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
