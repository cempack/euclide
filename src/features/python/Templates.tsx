import { useState } from "react";
import {
  ArrowDownUp,
  Braces,
  ChartSpline,
  ClipboardCheck,
  CodeXml,
  Dices,
  Divide,
  Flower2,
  Hexagon,
  Keyboard,
  Layers,
  LayoutTemplate,
  Repeat,
  Table2,
  TrendingDown,
  X,
  type LucideIcon,
} from "lucide-react";
import { useSetting } from "../../api/hooks";
import { Field } from "../../components/layout";
import { Modal, useToast } from "../../components/ui";
import { tr } from "../../lib/i18n";
import { Icon } from "../../ui/Icon";
import { BUILT_IN, GROUPS, parseTemplates, type ScriptTemplate } from "./templates";

const ICONS: Record<string, LucideIcon> = {
  "Script vide": CodeXml,
  "Saisie et calcul": Keyboard,
  "Tableau de valeurs": Table2,
  "Courbe d'une fonction": ChartSpline,
  "Suite et seuil": TrendingDown,
  Dichotomie: Divide,
  "Lancers de dé": Dices,
  "Polygones à la tortue": Hexagon,
  Rosace: Flower2,
  "Fonction à compléter": ClipboardCheck,
  "Tri par insertion": ArrowDownUp,
  Récursivité: Repeat,
  "Pile (classe)": Layers,
  Dictionnaire: Braces,
};

/** The built-in templates, then the teacher's, and how to change theirs. */
function useScriptTemplates() {
  const [raw, setRaw] = useSetting("python_templates");
  const mine = parseTemplates(raw);
  const write = (list: ScriptTemplate[]) =>
    setRaw(JSON.stringify(list.map(({ name, hint, code }) => ({ name, hint, code }))));
  return {
    all: [...BUILT_IN, ...mine],
    mine,
    /** Adds `t`, or replaces the template of the same name. */
    save: (t: ScriptTemplate) => write([...mine.filter((m) => m.name !== t.name), t]),
    remove: (name: string) => write(mine.filter((m) => m.name !== name)),
    restore: (list: ScriptTemplate[]) => write(list),
  };
}

/**
 * Every template by group: a card each, its name and what it shows. The
 * teacher's own can be deleted from here (with an undo).
 */
export function TemplateGallery({ onPick }: { onPick: (t: ScriptTemplate) => void }) {
  const toast = useToast();
  const { all, mine, remove, restore } = useScriptTemplates();
  return (
    <div className="flex flex-col gap-4">
      {GROUPS.map((g) => {
        const list = all.filter((t) => t.group === g.id);
        if (!list.length) return null;
        return (
          <section key={g.id} aria-label={g.label}>
            <h3 className="eu-t-label mb-1.5">{g.label}</h3>
            <div className="grid grid-cols-1 @lg:grid-cols-2 gap-1">
              {list.map((t) => (
                <div key={t.name} className="eu-template-card">
                  <button type="button" className="eu-template-card-main" onClick={() => onPick(t)}>
                    <span className="eu-template-card-icon" aria-hidden>
                      <Icon
                        icon={ICONS[t.name] ?? (t.group === "mine" ? LayoutTemplate : CodeXml)}
                        size={16}
                      />
                    </span>
                    <span className="min-w-0">
                      <span className="block eu-t-body font-medium text-ink truncate">{t.name}</span>
                      {t.hint && (
                        <span className="block eu-t-small text-ink-muted line-clamp-2">{t.hint}</span>
                      )}
                    </span>
                  </button>
                  {t.group === "mine" && (
                    <button
                      type="button"
                      className="eu-btn-quiet eu-btn-icon eu-btn-sm eu-template-card-remove hover:text-danger"
                      aria-label={tr("python.templateDelete", { name: t.name })}
                      data-tip={tr("python.templateDelete", { name: t.name })}
                      onClick={() => {
                        const before = mine;
                        remove(t.name);
                        toast(tr("python.templateDeleted", { name: t.name }), "info", {
                          action: { label: tr("common.undo"), run: () => restore(before) },
                        });
                      }}
                    >
                      <Icon icon={X} size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/**
 * « Nouveau script »: the gallery in a dialog, and, when a script is open,
 * a way to keep it as a template of one's own.
 */
export function NewScriptDialog({
  open,
  onClose,
  onPick,
  current,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (t: ScriptTemplate) => void;
  /** The open script, which can become a template. */
  current: { name: string; code: string } | null;
}) {
  const [saving, setSaving] = useState(false);
  return (
    <>
      <Modal open={open} onClose={onClose} title={tr("python.galleryTitle")} width="max-w-3xl">
        <div className="@container max-h-[min(36rem,70vh)] overflow-y-auto -mx-1 px-1">
          <TemplateGallery
            onPick={(t) => {
              onClose();
              onPick(t);
            }}
          />
        </div>
        <div className="flex items-center justify-between gap-2 mt-4 pt-4 border-t border-line">
          {current && current.code.trim() ? (
            <button
              type="button"
              className="eu-btn-quiet eu-btn-sm"
              onClick={() => {
                onClose();
                setSaving(true);
              }}
            >
              <Icon icon={LayoutTemplate} size={14} />
              {tr("python.saveAsTemplate", { name: current.name })}
            </button>
          ) : (
            <span />
          )}
          <button type="button" className="eu-btn-ghost" onClick={onClose}>
            {tr("common.cancel")}
          </button>
        </div>
      </Modal>
      {saving && current && <SaveTemplateDialog script={current} onClose={() => setSaving(false)} />}
    </>
  );
}

function SaveTemplateDialog({
  script,
  onClose,
}: {
  script: { name: string; code: string };
  onClose: () => void;
}) {
  const toast = useToast();
  const { save } = useScriptTemplates();
  const [name, setName] = useState(script.name);
  const [hint, setHint] = useState("");
  const trimmed = name.trim();
  const taken = BUILT_IN.some((t) => t.name.toLowerCase() === trimmed.toLowerCase());
  const submit = () => {
    if (!trimmed || taken) return;
    save({ name: trimmed, hint: hint.trim(), group: "mine", code: script.code });
    toast(tr("python.templateSaved", { name: trimmed }), "success");
    onClose();
  };
  return (
    <Modal open onClose={onClose} title={tr("python.saveTemplateTitle")}>
      <div className="flex flex-col gap-3.5">
        <Field label={tr("python.templateName")} htmlFor="script-template-name">
          <input
            id="script-template-name"
            data-autofocus
            className="eu-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
        </Field>
        <Field label={tr("python.templateHint")} htmlFor="script-template-hint">
          <input
            id="script-template-hint"
            className="eu-input"
            value={hint}
            placeholder={tr("python.templateHintPlaceholder")}
            onChange={(e) => setHint(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
        </Field>
        {taken && <p className="eu-t-small text-danger">{tr("python.templateNameTaken")}</p>}
        <div className="flex justify-end gap-2 mt-1">
          <button className="eu-btn-ghost" onClick={onClose}>
            {tr("common.cancel")}
          </button>
          <button className="eu-btn-primary" onClick={submit} disabled={!trimmed || taken}>
            {tr("common.save")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
