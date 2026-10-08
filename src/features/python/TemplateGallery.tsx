import { useRef, useState, type KeyboardEvent } from "react";
import { FilePlus2, LayoutTemplate, Search, X } from "lucide-react";
import { useSetting } from "../../api/hooks";
import { Field } from "../../components/layout";
import { Modal, useToast } from "../../components/ui";
import { tr, trn } from "../../lib/i18n";
import { Dialog } from "../../ui/Dialog";
import { Icon } from "../../ui/Icon";
import { tip } from "../../ui/Tooltip";
import { scriptIcon } from "./scriptIcon";
import {
  BUILT_IN,
  LEVELS,
  parseTemplates,
  searchTemplates,
  type LevelId,
  type ScriptTemplate,
} from "./templates";

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

const levelLabel = (id: LevelId) => LEVELS.find((l) => l.id === id)?.label ?? "";

/**
 * The catalogue: the levels down the side, the chosen one's themes as
 * sections of cards; typing searches every level (cards first, then code).
 * The teacher's own can be deleted from here, with an undo.
 */
function TemplateGallery({
  level,
  onLevel,
  onPick,
}: {
  level: LevelId;
  onLevel: (level: LevelId) => void;
  onPick: (t: ScriptTemplate) => void;
}) {
  const toast = useToast();
  const { all, mine, remove, restore } = useScriptTemplates();
  const [current, setCurrent] = useState<LevelId>(level);
  const [query, setQuery] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const levels = LEVELS.map((l) => ({ ...l, count: all.filter((t) => t.level === l.id).length }));
  const results = query.trim() ? searchTemplates(all, query) : null;

  const choose = (id: LevelId) => {
    onLevel(id);
    setCurrent(id);
    setQuery("");
    listRef.current?.scrollTo({ top: 0 });
  };
  const onTabKey = (e: KeyboardEvent, i: number) => {
    const to =
      e.key === "ArrowDown"
        ? (i + 1) % levels.length
        : e.key === "ArrowUp"
          ? (i - 1 + levels.length) % levels.length
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? levels.length - 1
              : -1;
    if (to < 0) return;
    e.preventDefault();
    choose(levels[to].id);
    tabs.current[to]?.focus();
  };

  const card = (t: ScriptTemplate, where?: string) => (
    <div key={t.id} className="eu-template-card">
      <button type="button" className="eu-template-card-main" onClick={() => onPick(t)}>
        <span className="eu-template-card-icon" aria-hidden>
          <Icon icon={t.level === "mine" ? LayoutTemplate : scriptIcon(t.code)} size={16} />
        </span>
        <span className="min-w-0">
          <span className="block eu-t-body font-medium text-ink truncate">{t.name}</span>
          {t.hint && <span className="block eu-t-small text-ink-muted line-clamp-2">{t.hint}</span>}
          {where && <span className="block eu-t-caption text-ink-faint mt-0.5 truncate">{where}</span>}
        </span>
      </button>
      {t.level === "mine" && (
        <button
          type="button"
          className="eu-btn-quiet eu-btn-icon eu-btn-sm eu-template-card-remove hover:text-danger"
          aria-label={tr("python.templateDelete", { name: t.name })}
          {...tip(tr("python.templateDelete", { name: t.name }))}
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
  );

  const shown = levels.find((l) => l.id === current) ?? levels[0];
  return (
    <div className="eu-gallery-body">
      <div className="eu-gallery-side">
        <div className="relative">
          <input
            data-autofocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              // Escape empties the search before it closes the dialog.
              if (e.key === "Escape" && query) {
                e.preventDefault();
                e.stopPropagation();
                setQuery("");
              }
            }}
            placeholder={tr("python.searchTemplates")}
            aria-label={tr("python.searchTemplates")}
            className="eu-input pl-8"
          />
          <Icon
            icon={Search}
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none"
          />
        </div>
        <div
          role="tablist"
          aria-orientation="vertical"
          aria-label={tr("python.levels")}
          className="eu-gallery-levels"
        >
          {levels.map((l, i) => (
            <button
              key={l.id}
              ref={(el) => {
                tabs.current[i] = el;
              }}
              id={`template-level-${l.id}`}
              type="button"
              role="tab"
              aria-selected={!results && l.id === shown.id}
              tabIndex={l.id === shown.id ? 0 : -1}
              onClick={() => choose(l.id)}
              onKeyDown={(e) => onTabKey(e, i)}
              className="eu-gallery-level"
            >
              <span className="truncate">{l.label}</span>
              <span className="eu-gallery-count">{l.count}</span>
            </button>
          ))}
        </div>
      </div>
      <div
        ref={listRef}
        role="tabpanel"
        aria-labelledby={results ? undefined : `template-level-${shown.id}`}
        aria-label={results ? tr("python.searchResults") : undefined}
        className="eu-gallery-list @container"
      >
        {results ? (
          results.length ? (
            <section aria-label={tr("python.searchResults")}>
              <h3 className="eu-t-label mb-1.5">{trn("python.templateCount", results.length)}</h3>
              <div className="grid grid-cols-1 @lg:grid-cols-2 gap-1">
                {results.map((t) =>
                  card(t, t.level === "mine" ? levelLabel(t.level) : `${levelLabel(t.level)} · ${t.theme}`),
                )}
              </div>
            </section>
          ) : (
            <p className="eu-t-small text-ink-muted px-2.5 py-2">{tr("python.noTemplateMatch", { query })}</p>
          )
        ) : shown.id === "mine" ? (
          mine.length ? (
            <div className="grid grid-cols-1 @lg:grid-cols-2 gap-1">{mine.map((t) => card(t))}</div>
          ) : (
            <p className="eu-t-small text-ink-muted px-2.5 py-2 max-w-md">{tr("python.mineEmpty")}</p>
          )
        ) : (
          <div className="flex flex-col gap-5">
            {shown.themes.map((theme) => {
              const list = all.filter((t) => t.level === shown.id && t.theme === theme.label);
              if (!list.length) return null;
              return (
                <section key={theme.label} aria-label={theme.label}>
                  <h3 className="eu-t-label mb-1.5 px-2.5">{theme.label}</h3>
                  <div className="grid grid-cols-1 @lg:grid-cols-2 gap-1">{list.map((t) => card(t))}</div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The empty editor's way in: a blank script, or a level of the catalogue,
 * its themes named.
 */
export function TemplateLevels({
  onPick,
  onOpen,
}: {
  onPick: (t: ScriptTemplate) => void;
  onOpen: (level: LevelId) => void;
}) {
  const blank = BUILT_IN[0];
  return (
    <div className="flex flex-col gap-3">
      <button type="button" className="eu-btn-ghost self-start" onClick={() => onPick(blank)}>
        <Icon icon={FilePlus2} size={16} />
        {tr("python.blankScript")}
      </button>
      <div className="grid grid-cols-1 @md:grid-cols-2 @3xl:grid-cols-4 gap-2">
        {LEVELS.filter((l) => l.id !== "mine").map((l) => {
          const list = BUILT_IN.filter((t) => t.level === l.id);
          return (
            <button key={l.id} type="button" className="eu-level-tile" onClick={() => onOpen(l.id)}>
              <span className="flex items-baseline justify-between gap-2">
                <span className="eu-t-body font-medium text-ink">{l.label}</span>
                <span className="eu-gallery-count">{list.length}</span>
              </span>
              <span className="eu-t-small text-ink-muted line-clamp-2">
                {l.themes.map((t) => t.label).join(" · ")}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * « Nouveau script »: the catalogue in a dialog and, when a script is open,
 * a way to keep it as a template of one's own.
 */
export function NewScriptDialog({
  open,
  level,
  onLevel,
  onClose,
  onPick,
  current,
}: {
  open: boolean;
  /** The level it opens on. */
  level: LevelId;
  /** The level the teacher moved to, to open there next time. */
  onLevel: (level: LevelId) => void;
  onClose: () => void;
  onPick: (t: ScriptTemplate) => void;
  /** The open script, which can become a template. */
  current: { name: string; code: string } | null;
}) {
  const [saving, setSaving] = useState(false);
  const title = tr("python.galleryTitle");
  return (
    <>
      <Dialog open={open} onClose={onClose} label={title} className="max-w-5xl">
        <div className="eu-gallery">
          <div className="eu-gallery-head">
            <h2 className="eu-t-title text-ink">
              {title}
              <span className="eu-t-small font-normal text-ink-muted ml-2">
                {trn("python.templateCount", BUILT_IN.length)}
              </span>
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="eu-btn-quiet eu-btn-icon eu-btn-sm"
              aria-label={tr("common.close")}
            >
              <Icon icon={X} size={16} />
            </button>
          </div>
          <TemplateGallery
            level={level}
            onLevel={onLevel}
            onPick={(t) => {
              onClose();
              onPick(t);
            }}
          />
          <div className="eu-gallery-foot">
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
        </div>
      </Dialog>
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
    save({
      id: `mine/${trimmed}`,
      name: trimmed,
      hint: hint.trim(),
      level: "mine",
      theme: "",
      code: script.code,
    });
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
