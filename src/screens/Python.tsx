import { useEffect, useState } from "react";
import { api, invalidateCache, type PythonDemo, type PythonResult } from "../lib/api";
import { t, fmt, get } from "../lib/i18n";
import { useToast, useConfirm } from "../components/ui";
import { useTabs } from "../lib/tabs";
import CodeEditor from "../components/CodeEditor";
import {
  CodeIcon,
  PlusIcon,
  TrashIcon,
} from "../components/icons";

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
    <div className="h-full eu-no-drag">
      {/* Clean split that fits the app's new-card + hairline style, with IDE touches inside */}
      <div className="new-card p-0 overflow-hidden h-full grid grid-cols-1 md:grid-cols-[200px_1fr]">
        {/* Left: Explorer / script list */}
        <div className="h-full border-b md:border-b-0 md:border-r border-hairline flex flex-col bg-surface">
          <div className="flex items-center justify-between px-3 py-2 border-b border-hairline text-[10px] uppercase tracking-wider text-mute font-mono">
            <span>{t.tools?.scripts || "SCRIPTS"}</span>
            <div className="flex items-center gap-1">
              <button
                onClick={create}
                className="new-btn-ghost p-1"
                title="Nouveau script temporaire (non enregistré)"
              >
                <PlusIcon className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={importScript}
                className="new-btn-ghost p-1 text-xs"
                title="Importer un fichier .py"
              >
                {t.tools?.importerBtn || "import"}
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-1 text-sm">
            {/* Unsaved / new script buffer appears in the file tree (as a temporary entry) until saved */}
            {openScript && !openScript.path && (
              <button
                key="__temp-new-script"
                onClick={() => {
                  // already the active buffer; clicking just keeps focus
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-left text-sm transition bg-surface-container text-tui-accent eu-no-drag"
                title="Script temporaire (non enregistré)"
              >
                <CodeIcon className="w-4 h-4 shrink-0 opacity-70" />
                <span className="truncate">{openScript.name} *</span>
              </button>
            )}

            {demos.length === 0 && !(openScript && !openScript.path) ? (
              <p className="text-body-mute p-3 text-[12px]">{t.tools?.noScripts || "Aucun script. Créez un temporaire ou importez."}</p>
            ) : (
              demos.map((d) => {
                const isSel = !!openScript?.path && openScript.path === d.path;
                return (
                  <button
                    key={d.path}
                    onClick={() => select(d)}
                    className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-left text-sm transition eu-no-drag ${
                      isSel
                        ? "bg-surface-container text-tui-accent"
                        : "text-on-surface hover:bg-surface-container"
                    }`}
                  >
                    <CodeIcon className="w-4 h-4 shrink-0 opacity-70" />
                    <span className="truncate">{d.name}</span>
                  </button>
                );
              })
            )}
          </div>

          <div className="p-2 text-[10px] text-mute border-t border-hairline font-mono">
            {fmt(t.tools?.scriptsCount || "{count} script{plural} • dans le dossier de données", {
              count: demos.length,
              plural: demos.length === 1 ? "" : "s",
            })}
          </div>
        </div>

        {/* Right: current file + editor + output (the IDE part) */}
        <div className="h-full flex flex-col min-h-0 bg-surface">
          {/* File "tab" / header bar for IDE feel */}
          {openScript ? (
            <div className="flex items-center gap-2 px-3 py-1.5 border-b border-hairline bg-surface text-sm shrink-0">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <CodeIcon className="w-4 h-4 shrink-0" />
                {isEditingName ? (
                  <input
                    type="text"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        commitRename();
                      } else if (e.key === "Escape") {
                        cancelRename();
                      }
                    }}
                    autoFocus
                    onFocus={(e) => e.currentTarget.select()}
                    className="font-mono text-primary bg-transparent border border-hairline rounded px-1 py-0.5 outline-none min-w-[8ch] max-w-[40ch]"
                    placeholder="Nom du script"
                  />
                ) : (
                  <span
                    className="font-mono truncate text-primary cursor-pointer hover:bg-surface-soft/50 rounded px-1 -mx-1"
                    onClick={startRename}
                    title="Cliquer pour renommer le script"
                  >
                    {openScript.name}
                  </span>
                )}
                {!isEditingName && openScript.isDirty ? " *" : ""}
                {!isEditingName && !openScript.path ? " (temporaire)" : ""}
              </div>

              <button
                onClick={save}
                disabled={!openScript.isDirty}
                className="new-btn-ghost px-2 py-0.5 text-xs disabled:opacity-50"
              >
                {t.tools?.saveBtn || "Enregistrer"}
              </button>

              <button
                onClick={run}
                disabled={running}
                className="new-btn-primary px-2.5 py-0.5 text-xs inline-flex items-center gap-1"
              >
                {running ? (
                  <span className="w-3 h-3 rounded-full border-2 border-white border-t-transparent animate-spin" />
                ) : (
                  `▶ ${t.tools?.execute || "Exécuter"}`
                )}
              </button>

              <button
                onClick={deleteCurrent}
                className="new-btn-ghost p-1 text-mute hover:text-red-500"
                title="Supprimer"
              >
                <TrashIcon className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="px-3 py-1.5 border-b border-hairline text-xs text-mute">
              {t.tools?.noScriptSelected || "Aucun script ouvert — sélectionnez-en un ou créez un temporaire"}
            </div>
          )}

          {/* Editor area */}
          <div className="flex-1 min-h-0 p-2">
            {openScript ? (
              <CodeEditor
                value={openScript.code}
                filename={openScript.path}
                onChange={(v) => {
                  setOpenScript((prev) =>
                    prev ? { ...prev, code: v, isDirty: true } : null
                  );
                }}
              />
            ) : (
              <div className="h-full flex items-center justify-center">
                <div className="text-center text-sm text-mute max-w-[28ch]">
                  <div className="text-3xl mb-2 opacity-40">{'</>'}</div>
                  {t.tools?.emptyEditorHint || "Créez un script temporaire (bouton + en haut à gauche) ou sélectionnez un script existant. Utilisez Enregistrer pour le rendre permanent (il apparaîtra dans la liste)."}
                </div>
              </div>
            )}
          </div>

          {/* Output / console */}
          <div className="border-t border-hairline bg-surface shrink-0">
            <div className="px-3 py-1 flex items-center justify-between text-[10px] font-mono text-mute border-b border-hairline">
              <span>{t.tools?.output || "OUTPUT"}</span>
              {result && (
                <button onClick={() => setResult(null)} className="hover:text-primary text-xs">{t.tools?.clearOutput || "effacer"}</button>
              )}
            </div>
            <div className="p-2 text-xs">
              {result ? (
                <pre
                  className={`selectable max-h-40 overflow-auto font-mono whitespace-pre-wrap rounded p-2 border ${
                    result.ok
                      ? "bg-surface border-hairline"
                      : "bg-red-500/5 border-red-500/20 text-red-600"
                  }`}
                >
                  {result.stdout || (t.tools?.noOutput || "(aucune sortie)")}
                  {result.stderr && <span className="text-red-500">{`\n${result.stderr}`}</span>}
                </pre>
              ) : (
                <div className="text-mute py-1">
                  {t.tools?.runHint || "Exécutez pour voir la sortie ici. Les scripts temporaires s’exécutent sans être sauvegardés."}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
