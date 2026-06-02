import { useEffect, useState } from "react";
import { api, type PythonDemo, type PythonResult, type QuickLink } from "../lib/api";
import { useTabs } from "../lib/tabs";
import { t } from "../lib/i18n";
import { EmptyState, Modal, SectionHeader, useToast } from "../components/ui";
import CodeEditor from "../components/CodeEditor";
import {
  CodeIcon,
  CoffeeIcon,
  LinkIcon,
  PenIcon,
  PlayIcon,
  PlusIcon,
  TrashIcon,
} from "../components/icons";

export default function Tools() {
  const tabs = useTabs();

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-2xl font-display tracking-tight text-eu-text">{t.nav.tools}</h1>
        <p className="eu-sub mt-1">Tout ce qui rend la classe plus fluide.</p>
      </header>

      <KeepAwakeCard />

      <section>
        <SectionHeader title={t.whiteboard} />
        <button
          onClick={() => tabs.open({ kind: "whiteboard", title: "Nouveau tableau", params: { isNew: true } })}
          className="eu-card w-full p-6 flex items-center gap-4 hover:shadow-glow transition-all text-left"
        >
          <span className="grid place-items-center w-14 h-14 rounded-[12px] bg-[#fff8e0] text-[#fa520f]">
            <PenIcon className="w-7 h-7" />
          </span>
          <div>
            <p className="font-semibold text-eu-text">Ouvrir le tableau blanc</p>
            <p className="eu-sub">Simple et rapide, et vos tableaux restent modifiables.</p>
          </div>
        </button>
      </section>

      <PythonCard />
      <LinksCard />
    </div>
  );
}

function KeepAwakeCard() {
  const toast = useToast();
  const [on, setOn] = useState(false);

  useEffect(() => {
    api.keepAwakeStatus().then(setOn).catch(() => {});
  }, []);

  const toggle = async () => {
    const next = await api.setKeepAwake(!on);
    setOn(next);
    toast(next ? t.keepAwakeOn : t.keepAwakeOff, next ? "success" : "info");
  };

  return (
    <section>
      <SectionHeader title={t.keepAwake} />
      <button
        onClick={toggle}
        className={`eu-card w-full p-5 flex items-center gap-4 text-left transition-all ${
          on ? "shadow-glow" : "hover:shadow-glow"
        }`}
      >
        <span
          className={`grid place-items-center w-12 h-12 rounded-[12px] transition-colors ${
            on ? "bg-[#fa520f] text-white" : "bg-[#fff8e0] text-[#fa520f]"
          }`}
        >
          <CoffeeIcon className="w-6 h-6" />
        </span>
        <div className="flex-1">
          <p className="font-semibold text-eu-text">{on ? t.keepAwakeOn : t.keepAwakeOff}</p>
          <p className="eu-sub">L'ecran ne se verrouille pas pendant le cours.</p>
        </div>
        <span
          className={`relative w-12 h-7 rounded-full transition-colors ${
            on ? "bg-[#fa520f]" : "bg-[#ededed]"
          }`}
        >
          <span
            className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-all ${
              on ? "left-6" : "left-1"
            }`}
          />
        </span>
      </button>
    </section>
  );
}

const STARTER_CODE = `# Nouveau script Python
# Tout ce qui est affiche avec print() apparaitra ci-dessous.

print("Bonjour la classe !")

for i in range(1, 6):
    print(i, "x 7 =", i * 7)
`;

function PythonCard() {
  const toast = useToast();
  const [demos, setDemos] = useState<PythonDemo[]>([]);
  const [selected, setSelected] = useState<PythonDemo | null>(null);
  const [code, setCode] = useState("");
  const [dirty, setDirty] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<PythonResult | null>(null);

  const refresh = async (selectPath?: string) => {
    const list = await api.listDemos().catch(() => [] as PythonDemo[]);
    setDemos(list);
    if (selectPath) {
      const found = list.find((d) => d.path === selectPath);
      if (found) {
        setSelected(found);
        setCode(found.code);
        setDirty(false);
      }
    }
  };
  useEffect(() => {
    refresh();
  }, []);

  const select = (d: PythonDemo) => {
    setSelected(d);
    setCode(d.code);
    setDirty(false);
    setResult(null);
  };

  const create = async () => {
    const name = window.prompt("Nom du script :", "Mon script");
    if (!name) return;
    const d = await api.createScript(name, STARTER_CODE);
    await refresh(d.path);
    setResult(null);
    toast("Script cree", "success");
  };

  const importScript = async () => {
    const d = await api.importScript();
    if (d) {
      await refresh(d.path);
      toast(`Importe : ${d.name}`, "success");
    }
  };

  const save = async () => {
    if (!selected) return;
    await api.saveScript(selected.path, code);
    setDirty(false);
    setDemos((prev) => prev.map((d) => (d.path === selected.path ? { ...d, code } : d)));
    toast("Script enregistre", "success");
  };

  const run = async () => {
    setRunning(true);
    api.logEvent("demo_run", selected?.name ?? "scratch", null);
    try {
      const res = selected && !dirty ? await api.runDemo(selected.path) : await api.runCode(code);
      setResult(res);
      if (!res.ok) toast("Le script a renvoye une erreur", "error");
    } catch {
      toast("Impossible de lancer le script", "error");
    } finally {
      setRunning(false);
    }
  };

  const remove = async () => {
    if (!selected) return;
    if (!confirm(`Supprimer le script "${selected.name}" ?`)) return;
    await api.deleteScript(selected.path);
    setSelected(null);
    setCode("");
    setResult(null);
    refresh();
  };

  return (
    <section>
      <SectionHeader
        title={t.pythonDemos}
        action={
          <div className="flex gap-2">
            <button onClick={importScript} className="eu-btn-ghost py-1.5 px-2.5 text-xs text-eu-muted">
              Importer
            </button>
            <button onClick={create} className="eu-btn-soft py-1.5 px-2.5 text-xs">
              <PlusIcon className="w-4 h-4" /> Nouveau script
            </button>
          </div>
        }
      />
      <div className="eu-card p-0 overflow-hidden grid grid-cols-1 md:grid-cols-[200px_1fr]">
        {/* script list */}
        <div className="border-b md:border-b-0 md:border-r border-[#ededed] p-2 max-h-[420px] overflow-y-auto">
          {demos.length === 0 ? (
            <p className="eu-sub p-3 text-[13px]">Aucun script pour l'instant. Creez-en un !</p>
          ) : (
            demos.map((d) => (
              <button
                key={d.path}
                onClick={() => select(d)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm transition-colors ${
                  selected?.path === d.path
                    ? "bg-[#fff8e0] text-[#fa520f]"
                    : "text-eu-text hover:bg-eu-cream-light"
                }`}
              >
                <CodeIcon className="w-4 h-4 shrink-0" />
                <span className="truncate">{d.name}</span>
              </button>
            ))
          )}
        </div>

        {/* editor */}
        <div className="p-4 flex flex-col gap-3 min-w-0">
          {selected ? (
            <>
              <div className="flex items-center gap-2">
                <p className="font-semibold text-eu-text flex-1 truncate">{selected.name}</p>
                <button onClick={remove} className="eu-btn-ghost text-eu-muted py-1.5 px-2">
                  <TrashIcon className="w-4 h-4" />
                </button>
                <button onClick={save} disabled={!dirty} className="eu-btn-ghost text-eu-muted py-1.5">
                  {dirty ? "Enregistrer *" : "Enregistre"}
                </button>
                <button onClick={run} disabled={running} className="eu-btn-primary py-1.5">
                  {running ? (
                    <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  ) : (
                    <PlayIcon className="w-4 h-4" />
                  )}
                  Executer
                </button>
              </div>
              <CodeEditor
                value={code}
                onChange={(v) => {
                  setCode(v);
                  setDirty(true);
                }}
              />
              {result && (
                <pre
                  className={`selectable max-h-52 overflow-auto rounded-lg border p-3 text-[12.5px] leading-relaxed font-mono whitespace-pre-wrap ${
                    result.ok ? "bg-[#fafafa] border-[#ededed]" : "bg-red-500/5 border-red-500/30"
                  }`}
                >
                  {result.stdout || <span className="text-eu-muted">(aucune sortie)</span>}
                  {result.stderr && <span className="text-red-500">{"\n" + result.stderr}</span>}
                </pre>
              )}
            </>
          ) : (
            <div className="py-10">
              <EmptyState
                icon={<CodeIcon className="w-8 h-8" />}
                title="Vos scripts Python"
                hint="Creez ou importez un script, modifiez-le et lancez-le en un clic."
              />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function LinksCard() {
  const toast = useToast();
  const [links, setLinks] = useState<QuickLink[]>([]);
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");

  const refresh = () => api.listLinks().then(setLinks).catch(() => {});
  useEffect(() => {
    refresh();
  }, []);

  const add = async () => {
    if (!label.trim() || !url.trim()) return;
    const normalized = url.startsWith("http") ? url : `https://${url}`;
    await api.createLink(label.trim(), normalized, "🔗");
    setLabel("");
    setUrl("");
    setOpen(false);
    toast("Lien ajoute", "success");
    refresh();
  };

  return (
    <section>
      <SectionHeader
        title={t.quickLinks}
        action={
          <button onClick={() => setOpen(true)} className="eu-btn-soft py-1.5 px-2.5 text-xs">
            <PlusIcon className="w-4 h-4" /> {t.add}
          </button>
        }
      />
      {links.length === 0 ? (
        <div className="eu-card p-5">
          <EmptyState icon={<LinkIcon className="w-8 h-8" />} title="Aucun lien rapide" />
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {links.map((l) => (
            <div key={l.id} className="eu-card p-4 flex items-center gap-3 group">
              <button onClick={() => api.openUrl(l.url)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                <span className="text-xl">{l.icon}</span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-eu-text truncate">{l.label}</p>
                  <p className="text-[11px] text-eu-muted truncate">{l.url}</p>
                </div>
              </button>
              <button
                onClick={async () => {
                  await api.deleteLink(l.id);
                  refresh();
                }}
                className="opacity-0 group-hover:opacity-100 text-eu-muted hover:text-red-500 transition-all"
              >
                <TrashIcon className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={t.newLink}>
        <div className="flex flex-col gap-3">
          <input
            autoFocus
            className="eu-input"
            placeholder="Nom (ex : Manuel en ligne)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <input
            className="eu-input"
            placeholder="Adresse (ex : eduscol.education.fr)"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
          <div className="flex justify-end gap-2 mt-1">
            <button className="eu-btn-ghost" onClick={() => setOpen(false)}>
              {t.cancel}
            </button>
            <button className="eu-btn-primary" onClick={add}>
              {t.add}
            </button>
          </div>
        </div>
      </Modal>
    </section>
  );
}
