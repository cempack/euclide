import { useEffect, useState } from "react";
import { api, invalidateCache, type PythonDemo, type PythonResult } from "../lib/api";
import { t, fmt, get } from "../lib/i18n";
import { useToast, useConfirm } from "../components/ui";
import { useTabs } from "../lib/tabs";
import CodeEditor from "../components/CodeEditor";
import { Toolbar, ToolGroup, ToolSep } from "../components/layout";
import { MOD, isMac } from "../lib/shortcuts";
import { CodeIcon, PlayIcon, PlusIcon, TrashIcon } from "../components/icons";

const STARTER_CODE = (t.tools?.starterCode as string) || `# Nouveau script Python\n# Tout ce qui est affiché avec print() apparaîtra ci-dessous.\n\nprint(\"Bonjour la classe !\")\n\nfor i in range(1, 6):\n    print(i, \"x 7 =\", i * 7)\n`;

export default function Python() {
  const toast = useToast();
  const confirm = useConfirm();
  const tabs = useTabs();
  const [demos, setDemos] = useState<PythonDemo[]>([]);
  const [openScript, setOpenScript] = useState<{
    name: string;
    code: string;
    path?: string;
    isDirty: boolean;
  } | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<PythonResult | null>(null);

  const [isEditingName, setIsEditingName] = useState(false);
  const [editingName, setEditingName] = useState("");

  // Reset inline rename UI whenever the open script identity changes (selecting another, delete, save-as, etc.)
  useEffect(() => {
    setIsEditingName(false);
    setEditingName("");
  }, [openScript?.path, openScript?.name]);

  useEffect(() => {
    tabs.setTabDirty("python", !!openScript?.isDirty);
    return () => tabs.setTabDirty("python", false);
  }, [openScript?.isDirty, tabs]);

  // ⌘↵ / Ctrl+↵ runs the open script. Only while the Python tab is the active
  // one, so it never fires from another pane (all panes stay mounted).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (!mod || e.key !== "Enter") return;
      if (tabs.active?.kind !== "python") return;
      e.preventDefault();
      void run();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  const refresh = async (selectPath?: string): Promise<PythonDemo[]> => {
    const list = await api.listDemos().catch(() => [] as PythonDemo[]);
    setDemos(Array.isArray(list) ? list : []);

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

  useEffect(() => {
    refresh();
  }, []);

  // Auto-select first real script on initial load (when nothing open) or when the
  // currently-open persisted script disappears from disk (e.g. deleted elsewhere).
  // We deliberately do *not* auto-pick when a temporary unsaved buffer is open
  // (no path) — the temp stays in control of the editor until explicitly saved or closed.
  useEffect(() => {
    if (!openScript && demos.length > 0) {
      const first = demos[0];
      setOpenScript({
        name: first.name,
        code: first.code,
        path: first.path,
        isDirty: false,
      });
      return;
    }
    if (openScript?.path) {
      const stillThere = demos.some((d) => d.path === openScript.path);
      if (!stillThere) {
        if (demos.length > 0) {
          const first = demos[0];
          setOpenScript({
            name: first.name,
            code: first.code,
            path: first.path,
            isDirty: false,
          });
        } else {
          setOpenScript(null);
        }
      }
    }
  }, [demos, openScript?.path]);

  const select = async (d: PythonDemo) => {
    if (openScript?.isDirty) {
      const ok = await confirm.ask({
        title: get("tools.unsavedTitle", "Script non enregistré"),
        message: get("tools.unsavedSwitch", "Les modifications en cours seront perdues. Continuer ?"),
        confirmLabel: get("common.open", "Ouvrir"),
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
    setResult(null);
  };

  const create = async () => {
    if (openScript?.isDirty) {
      const ok = await confirm.ask({
        title: get("tools.unsavedTitle", "Script non enregistré"),
        message: get("tools.unsavedSwitch", "Les modifications en cours seront perdues. Continuer ?"),
        confirmLabel: get("common.open", "Ouvrir"),
        danger: true,
      });
      if (!ok) return;
    }
    // Create a temporary / unsaved script buffer that immediately appears in the file tree.
    // Clicking Enregistrer on it will persist it (using the name shown in the tree).
    setOpenScript({
      name: "nouveau script",
      code: STARTER_CODE,
      isDirty: true,
    });
    setResult(null);
  };

  const importScript = async () => {
    if (openScript?.isDirty) {
      const ok = await confirm.ask({
        title: get("tools.unsavedTitle", "Script non enregistré"),
        message: get("tools.unsavedSwitch", "Les modifications en cours seront perdues. Continuer ?"),
        confirmLabel: get("common.open", "Ouvrir"),
        danger: true,
      });
      if (!ok) return;
    }
    const d = await api.importScript();
    if (d) {
      invalidateCache("listDemos");
      setOpenScript({
        name: d.name,
        code: d.code,
        path: d.path,
        isDirty: false,
      });
      await refresh();
      toast(fmt(t.tools?.toastImported || "Importé : {name}", { name: d.name }), "success");
    }
  };

  const save = async () => {
    if (!openScript) return;

    try {
      if (!openScript.path) {
        // New/unsaved buffer visible in the file tree: create it now using its current tree name.
        // (Backend will unique the filename if needed; we adopt the returned display name.)
        // This makes "Enregistrer" on a new entry actually persist it, just like the other saved scripts.
        const created = await api.createScript(openScript.name, openScript.code);
        if (!created?.path) {
          toast(get("tools.toastScriptSaveError", "Impossible d'enregistrer le script"), "error");
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

        invalidateCache("listDemos");
        // Still refresh in background to fully reconcile list + ensure selection (in case of races or external changes).
        refresh(created.path).catch(() => {});

        toast(t.tools?.toastScriptSaved || "Script enregistré", "success");
        return; // we already promoted the openScript + list; don't fall through to the old common set
      } else {
        const pathToUse = openScript.path!;
        const nameToUse = openScript.name;
        await api.saveScript(pathToUse, openScript.code);
        setDemos((prev) =>
          prev.map((d) =>
            d.path === pathToUse ? { ...d, code: openScript.code, name: nameToUse } : d
          )
        );

        setOpenScript({
          name: nameToUse,
          code: openScript.code,
          path: pathToUse,
          isDirty: false,
        });
        toast(t.tools?.toastScriptSaved || "Script enregistré", "success");
      }
    } catch {
      toast(get("tools.toastScriptSaveError", "Impossible d'enregistrer le script"), "error");
    }
  };

  useEffect(() => {
    return tabs.registerFlush("python", save);
  }, [tabs, openScript]);

  const run = async () => {
    if (!openScript) return;
    setRunning(true);
    api.logEvent("demo_run", openScript.name ?? "scratch", null);
    try {
      const res =
        openScript.path && !openScript.isDirty
          ? await api.runDemo(openScript.path)
          : await api.runCode(openScript.code);
      setResult(res);
      if (!res?.ok) toast(t.tools?.toastScriptError || "Le script a renvoyé une erreur", "error");
    } catch {
      toast(t.tools?.toastScriptRunError || "Impossible de lancer le script", "error");
    } finally {
      setRunning(false);
    }
  };

  const deleteCurrent = async () => {
    if (!openScript) return;
    if (openScript.path) {
      const ok = await confirm.ask({
        title: fmt(t.tools?.confirmDeleteScript || 'Supprimer le script "{name}" ?', { name: openScript.name }),
        message: fmt(t.tools?.confirmDeleteScript || 'Supprimer le script "{name}" ?', { name: openScript.name }),
        confirmLabel: get("common.delete", "Supprimer"),
        danger: true,
      });
      if (!ok) return;
      await api.deleteScript(openScript.path);
      invalidateCache("listDemos");
    }
    setOpenScript(null);
    setResult(null);
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
        invalidateCache("listDemos");
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
            : null
        );
      } else {
        // Temporary buffer: just update the name in memory (will be used on first save)
        setOpenScript((prev) => (prev ? { ...prev, name: newName } : null));
      }
      toast(fmt(t.tools?.toastScriptRenamed || 'Script renommé en "{name}"', { name: newName }), "success");
    } catch {
      toast("Impossible de renommer le script", "error");
    } finally {
      setIsEditingName(false);
      setEditingName("");
    }
  };

  return (
    <div className="h-full min-h-0 flex eu-no-drag">
      {/* Script explorer */}
      <aside className="w-[210px] shrink-0 h-full flex flex-col border-r border-line bg-canvas">
        <div className="flex items-center justify-between gap-1 px-2.5 h-9 shrink-0 border-b border-line">
          <span className="eu-t-label">{t.tools?.scripts || "Scripts"}</span>
          <div className="flex items-center gap-0.5">
            <button
              onClick={create}
              className="eu-btn-quiet eu-btn-icon eu-btn-sm"
              aria-label={get("python.newScript", "Nouveau script")}
              title={get("python.newScriptTitle", "Nouveau script temporaire (non enregistré)")}
            >
              <PlusIcon className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={importScript}
              className="eu-btn-quiet eu-btn-sm"
              title={get("python.importTitle", "Importer un fichier .py")}
            >
              {t.tools?.importerBtn || "Importer"}
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-1">
          {/* The unsaved buffer shows in the tree until it is saved. */}
          {openScript && !openScript.path && (
            <div
              className="flex items-center gap-2 px-2 h-7 rounded bg-panel-alt text-ink eu-no-drag"
              title={get("python.tempScript", "Script temporaire (non enregistré)")}
            >
              <CodeIcon className="w-3.5 h-3.5 shrink-0 text-ink-faint" />
              <span className="eu-t-meta text-ink truncate flex-1">{openScript.name}</span>
              <span className="w-1.5 h-1.5 rounded-full bg-warn-solid shrink-0" />
            </div>
          )}

          {demos.length === 0 && !(openScript && !openScript.path) ? (
            <p className="eu-t-meta p-2.5">
              {t.tools?.noScripts || "Aucun script. Créez-en un ou importez un fichier .py."}
            </p>
          ) : (
            demos.map((d) => {
              const isSel = !!openScript?.path && openScript.path === d.path;
              return (
                <button
                  key={d.path}
                  onClick={() => select(d)}
                  aria-current={isSel ? "true" : undefined}
                  className={`w-full flex items-center gap-2 px-2 h-7 rounded text-left eu-no-drag transition-colors duration-fast ${
                    isSel ? "bg-ink text-panel" : "text-ink-muted hover:bg-panel-alt hover:text-ink"
                  }`}
                >
                  <CodeIcon className="w-3.5 h-3.5 shrink-0 opacity-80" />
                  <span className="eu-t-meta truncate" style={isSel ? { color: "inherit" } : undefined}>
                    {d.name}
                  </span>
                </button>
              );
            })
          )}
        </div>

        <div className="px-2.5 py-2 border-t border-line">
          <p className="eu-t-label normal-case tracking-normal">
            {fmt(t.tools?.scriptsCount || "{count} script{plural} · dossier de données", {
              count: demos.length,
              plural: demos.length === 1 ? "" : "s",
            })}
          </p>
        </div>
      </aside>

      {/* Editor + output */}
      <div className="flex-1 min-w-0 h-full flex flex-col min-h-0 bg-canvas">
        {openScript ? (
          <Toolbar className="h-9 py-0">
            <ToolGroup className="min-w-0 flex-1">
              <CodeIcon className="w-3.5 h-3.5 text-ink-faint shrink-0" />
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
                  placeholder={get("python.namePlaceholder", "Nom du script")}
                  aria-label={get("python.namePlaceholder", "Nom du script")}
                />
              ) : (
                <button
                  onClick={startRename}
                  title={get("python.renameTitle", "Cliquer pour renommer")}
                  className="font-mono text-[12.5px] text-ink truncate px-1 -mx-1 rounded hover:bg-panel-alt"
                >
                  {openScript.name}
                </button>
              )}
              {openScript.isDirty && (
                <span
                  className="w-1.5 h-1.5 rounded-full bg-warn-solid shrink-0"
                  title={get("app.unsaved", "Non enregistré")}
                />
              )}
              {!openScript.path && (
                <span className="eu-chip shrink-0">{get("python.temp", "temporaire")}</span>
              )}
            </ToolGroup>
            <ToolSep />
            <ToolGroup>
              <button
                onClick={save}
                disabled={!openScript.isDirty}
                className="eu-btn-ghost eu-btn-sm"
                title={`${t.tools?.saveBtn || "Enregistrer"} (${MOD}S)`}
              >
                {t.tools?.saveBtn || "Enregistrer"}
              </button>
              <button
                onClick={run}
                disabled={running}
                className="eu-btn-primary eu-btn-sm"
                title={`${t.tools?.execute || "Exécuter"} (${MOD}↵)`}
              >
                {running ? (
                  <span className="w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
                ) : (
                  <PlayIcon className="w-3.5 h-3.5" />
                )}
                {t.tools?.execute || "Exécuter"}
              </button>
              <button
                onClick={deleteCurrent}
                className="eu-btn-quiet eu-btn-icon eu-btn-sm hover:text-danger"
                aria-label={get("common.delete", "Supprimer")}
                title={get("common.delete", "Supprimer")}
              >
                <TrashIcon className="w-3.5 h-3.5" />
              </button>
            </ToolGroup>
          </Toolbar>
        ) : (
          <Toolbar className="h-9 py-0">
            <span className="eu-t-meta">
              {t.tools?.noScriptSelected || "Aucun script ouvert"}
            </span>
          </Toolbar>
        )}

        <div className="flex-1 min-h-0 p-2">
          {openScript ? (
            <CodeEditor
              value={openScript.code}
              filename={openScript.path}
              onChange={(v) => {
                setOpenScript((prev) => (prev ? { ...prev, code: v, isDirty: true } : null));
              }}
            />
          ) : (
            <div className="h-full grid place-items-center">
              <div className="max-w-[46ch] text-center">
                <p className="font-mono text-2xl text-ink-faint opacity-50 mb-3">{"</>"}</p>
                <p className="eu-t-section text-ink">
                  {get("python.emptyTitle", "Aucun script ouvert")}
                </p>
                <p className="eu-t-body text-ink-muted mt-1.5">
                  {t.tools?.emptyEditorHint ||
                    "Créez un script temporaire, ou sélectionnez-en un à gauche. « Enregistrer » le rend permanent."}
                </p>
                <button onClick={create} className="eu-btn-primary eu-btn-sm mt-3.5">
                  <PlusIcon className="w-3.5 h-3.5" />
                  {get("python.newScript", "Nouveau script")}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Output: a real terminal surface, dark in both themes. */}
        <div className="shrink-0 border-t border-line bg-stage text-stage-ink">
          <div className="flex items-center justify-between gap-2 px-3 h-7 border-b border-white/10">
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-white/45">
              {t.tools?.output || "Sortie"}
            </span>
            <div className="flex items-center gap-2">
              {result && (
                <span
                  className={`font-mono text-[10px] ${result.ok ? "text-ok-solid" : "text-danger-solid"}`}
                >
                  {result.ok ? get("python.ok", "terminé") : get("python.failed", "erreur")}
                </span>
              )}
              {result && (
                <button
                  onClick={() => setResult(null)}
                  className="font-mono text-[10px] text-white/45 hover:text-white/80"
                >
                  {t.tools?.clearOutput || "effacer"}
                </button>
              )}
            </div>
          </div>
          <pre className="selectable h-[152px] overflow-auto px-3 py-2 font-mono text-[12px] leading-[1.45] whitespace-pre-wrap">
            {result ? (
              <>
                {result.stdout || (
                  <span className="text-white/40">{t.tools?.noOutput || "(aucune sortie)"}</span>
                )}
                {result.stderr && <span className="text-danger-solid">{`\n${result.stderr}`}</span>}
              </>
            ) : (
              <span className="text-white/40">
                {t.tools?.runHint ||
                  "Exécutez pour voir la sortie ici. Les scripts temporaires s'exécutent sans être enregistrés."}
              </span>
            )}
          </pre>
        </div>
      </div>
    </div>
  );
}
