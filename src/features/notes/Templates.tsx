import { useState } from "react";
import {
  BookOpen,
  ClipboardCheck,
  FileText,
  FlaskConical,
  LayoutTemplate,
  ListChecks,
  PencilLine,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { useSetting } from "../../api/hooks";
import { Field } from "../../components/layout";
import { Modal, useToast } from "../../components/ui";
import { tr } from "../../lib/i18n";
import { Icon } from "../../ui/Icon";
import { MenuButton, type MenuEntry } from "../../ui/Menu";
import { BUILT_IN, parseTemplates, type NoteTemplate } from "./templates";

const ICONS: Record<string, LucideIcon> = {
  Cours: BookOpen,
  Exercices: PencilLine,
  Évaluation: ClipboardCheck,
  "Fiche méthode": ListChecks,
  Activité: FlaskConical,
};
const iconOf = (t: NoteTemplate) => ICONS[t.name] ?? FileText;

/** The built-in templates, then the teacher's, and how to change theirs. */
function useTemplates() {
  const [raw, setRaw] = useSetting("note_templates");
  const mine = parseTemplates(raw);
  const write = (list: NoteTemplate[]) => setRaw(JSON.stringify(list));
  return {
    all: [...BUILT_IN, ...mine],
    mine,
    /** Adds `t`, or replaces the template of the same name. */
    save: (t: NoteTemplate) => write([...mine.filter((m) => m.name !== t.name), t]),
    remove: (name: string) => write(mine.filter((m) => m.name !== name)),
    restore: (list: NoteTemplate[]) => write(list),
  };
}

/** Shown on an empty note: one click starts it from a template. */
export function TemplateStrip({ onPick }: { onPick: (t: NoteTemplate) => void }) {
  const { all } = useTemplates();
  return (
    <div className="eu-template-strip" role="group" aria-label={tr("templates.start")}>
      <span className="eu-t-label">{tr("templates.start")}</span>
      {all.map((t) => (
        <button key={t.name} type="button" className="eu-btn-ghost eu-btn-sm" onClick={() => onPick(t)}>
          <Icon icon={iconOf(t)} size={14} />
          {t.name}
        </button>
      ))}
    </div>
  );
}

/**
 * The toolbar's « Modèles » menu: start over from a template, save this
 * note as one, delete the teacher's own.
 */
export function TemplateMenu({
  note,
  onPick,
}: {
  note: { title: string; body: string };
  onPick: (t: NoteTemplate) => void;
}) {
  const toast = useToast();
  const { all, mine, save, remove, restore } = useTemplates();
  const [naming, setNaming] = useState<string | null>(null);

  const items: MenuEntry[] = [
    ...all.map((t) => ({ label: t.name, icon: iconOf(t), onSelect: () => onPick(t) })),
    "separator",
    {
      label: tr("templates.saveAs"),
      icon: LayoutTemplate,
      disabled: !note.body.trim(),
      onSelect: () => setNaming(note.title.trim()),
    },
    ...(mine.length ? (["separator"] as const) : []),
    ...mine.map((t) => ({
      label: tr("templates.delete", { name: t.name }),
      icon: Trash2,
      danger: true,
      onSelect: () => {
        const before = mine;
        remove(t.name);
        toast(tr("templates.deleted", { name: t.name }), "info", {
          action: { label: tr("common.undo"), run: () => restore(before) },
        });
      },
    })),
  ];

  const name = naming?.trim() ?? "";
  const taken = BUILT_IN.some((t) => t.name.toLowerCase() === name.toLowerCase());
  const submit = () => {
    if (!name || taken) return;
    // An untitled note gives its template the template's name as title.
    const title = note.title.trim();
    save({ name, title: title && title !== tr("notes.newTitle") ? title : name, body: note.body });
    toast(tr("templates.saved", { name }), "success");
    setNaming(null);
  };

  return (
    <>
      <MenuButton label={tr("templates.menu")} items={items} className="eu-btn-quiet eu-btn-sm">
        <Icon icon={LayoutTemplate} size={14} />
        <span className="hidden @4xl:inline">{tr("templates.menu")}</span>
      </MenuButton>
      <Modal open={naming != null} onClose={() => setNaming(null)} title={tr("templates.saveTitle")}>
        <div className="flex flex-col gap-3.5">
          <Field label={tr("templates.name")} htmlFor="template-name">
            <input
              id="template-name"
              data-autofocus
              className="eu-input"
              value={naming ?? ""}
              onChange={(e) => setNaming(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
          </Field>
          <p className="eu-t-small text-ink-muted">
            {taken
              ? tr("templates.nameTaken")
              : tr("templates.hint", { placeholders: "{{cours}}, {{classe}}, {{date}}" })}
          </p>
          <div className="flex justify-end gap-2 mt-1">
            <button className="eu-btn-ghost" onClick={() => setNaming(null)}>
              {tr("common.cancel")}
            </button>
            <button className="eu-btn-primary" onClick={submit} disabled={!name || taken}>
              {tr("common.save")}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
