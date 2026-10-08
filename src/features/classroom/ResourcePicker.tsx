import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Code2, Link2, NotebookPen, Plus, Search } from "lucide-react";
import { q } from "../../api/queries";
import { Segmented } from "../../components/layout";
import { FileKindIcon } from "../../ui/FileKindIcon";
import { Modal, useToast } from "../../components/ui";
import { api, type ResourceKind, type SequenceItem, type StepResource } from "../../lib/api";
import { errorMessage } from "../../lib/errors";
import { relativeTime } from "../../lib/format";
import { tr } from "../../lib/i18n";
import { reportError } from "../../lib/report";
import { Icon } from "../../ui/Icon";
import { fold } from "./lesson";

/** A resource's glyph: the document's kind, or note, script, link. */
export function ResourceIcon({
  r,
  className = "w-3.5 h-3.5",
}: {
  r: Pick<StepResource, "kind" | "file_kind">;
  className?: string;
}) {
  if (r.kind === "file") return <FileKindIcon kind={r.file_kind || "file"} className={className} />;
  const glyph = r.kind === "note" ? NotebookPen : r.kind === "script" ? Code2 : Link2;
  return <Icon icon={glyph} size={14} className={className} />;
}

type Filter = "all" | ResourceKind;

interface Candidate {
  kind: ResourceKind;
  refId?: number;
  refName?: string;
  name: string;
  meta: string;
  fileKind?: string;
  group: string;
}

const scriptName = (path: string) => path.split(/[\\/]/).pop() ?? path;

/**
 * Chooses what a step opens in class: the course's documents, the rest of
 * the library, notes, Python scripts, links. A click adds or removes; the
 * step updates as you go.
 */
export function ResourcePicker({
  courseId,
  step,
  onClose,
}: {
  courseId: number;
  step: SequenceItem | undefined;
  onClose: () => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [busy, setBusy] = useState<string | null>(null);
  const open = !!step;

  const courseFiles = useQuery({ ...q.files(courseId), enabled: open }).data;
  const library = useQuery({ ...q.files(null), enabled: open }).data;
  const notes = useQuery({ ...q.notes(), enabled: open }).data;
  const scripts = useQuery({ ...q.scripts(), enabled: open }).data;
  const links = useQuery({ ...q.links(), enabled: open }).data;

  const candidates = useMemo<Candidate[]>(() => {
    const list: Candidate[] = [];
    for (const f of courseFiles ?? [])
      list.push({
        kind: "file",
        refId: f.id,
        name: f.name,
        meta: relativeTime(f.added_at),
        fileKind: f.kind,
        group: tr("sequences.groupCourseFiles"),
      });
    for (const f of library ?? [])
      list.push({
        kind: "file",
        refId: f.id,
        name: f.name,
        meta: relativeTime(f.added_at),
        fileKind: f.kind,
        group: tr("sequences.groupLibrary"),
      });
    const ownNotes = (notes ?? [])
      .slice()
      .sort((a, b) => Number(b.course_id === courseId) - Number(a.course_id === courseId));
    for (const n of ownNotes)
      list.push({
        kind: "note",
        refId: n.id,
        name: n.title || tr("courseDetail.noTitle"),
        meta: relativeTime(n.updated_at),
        group: tr("sequences.groupNotes"),
      });
    for (const s of scripts ?? [])
      list.push({
        kind: "script",
        refName: scriptName(s.path),
        name: s.name,
        meta: scriptName(s.path),
        group: tr("sequences.groupScripts"),
      });
    for (const l of links ?? [])
      list.push({ kind: "link", refId: l.id, name: l.label, meta: l.url, group: tr("sequences.groupLinks") });
    return list;
  }, [courseFiles, library, notes, scripts, links, courseId]);

  const words = fold(query).split(/\s+/).filter(Boolean);
  const shown = candidates.filter(
    (c) =>
      (filter === "all" || c.kind === filter) && words.every((w) => fold(`${c.name} ${c.meta}`).includes(w)),
  );
  const groups = new Map<string, Candidate[]>();
  for (const c of shown) groups.set(c.group, [...(groups.get(c.group) ?? []), c]);

  const attached = (c: Candidate) =>
    step?.resources.find(
      (r) => r.kind === c.kind && (c.kind === "script" ? r.ref_name === c.refName : r.ref_id === c.refId),
    );

  const toggle = async (c: Candidate) => {
    if (!step) return;
    const key = `${c.kind}:${c.refId ?? c.refName}`;
    setBusy(key);
    try {
      const existing = attached(c);
      if (existing) await api.removeStepResource(existing.id);
      else await api.addStepResource(step.id, c.kind, { id: c.refId, name: c.refName });
      await queryClient.invalidateQueries({ queryKey: q.progression(courseId).queryKey });
    } catch (err) {
      reportError("lesson.toggleResource", err);
      toast(errorMessage(err, tr("messages.genericError")), "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={tr("sequences.pickerTitle", { name: step?.title ?? "" })}
      width="max-w-xl"
    >
      <div className="flex flex-col gap-3">
        <label className="eu-search">
          <Icon icon={Search} size={14} className="text-ink-faint" />
          <input
            data-autofocus
            className="flex-1 min-w-0 bg-transparent outline-hidden"
            placeholder={tr("sequences.pickerSearch")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={tr("sequences.pickerSearch")}
          />
        </label>
        <Segmented<Filter>
          value={filter}
          onChange={setFilter}
          label={tr("sequences.resources")}
          options={[
            { value: "all", label: tr("sequences.pickerAll") },
            { value: "file", label: tr("sequences.pickerFiles") },
            { value: "note", label: tr("sequences.pickerNotes") },
            { value: "script", label: tr("sequences.pickerScripts") },
            { value: "link", label: tr("sequences.pickerLinks") },
          ]}
        />
        <div className="eu-picker" role="listbox" aria-multiselectable aria-label={tr("sequences.resources")}>
          {shown.length === 0 ? (
            <p className="eu-t-body text-ink-muted p-4 text-center">{tr("sequences.pickerEmpty")}</p>
          ) : (
            [...groups].map(([group, items]) => (
              <div key={group} role="group" aria-label={group}>
                <p className="eu-t-label eu-picker-group">{group}</p>
                {items.map((c) => {
                  const key = `${c.kind}:${c.refId ?? c.refName}`;
                  const on = !!attached(c);
                  return (
                    <button
                      key={`${group}-${key}`}
                      type="button"
                      role="option"
                      aria-selected={on}
                      disabled={busy === key}
                      className="eu-picker-row"
                      onClick={() => void toggle(c)}
                    >
                      <ResourceIcon
                        r={{ kind: c.kind, file_kind: c.fileKind ?? null }}
                        className="w-4 h-4 text-ink-muted shrink-0"
                      />
                      <span className="flex-1 min-w-0">
                        <span className="block truncate text-ink">{c.name}</span>
                        <span className="block eu-t-caption truncate">{c.meta}</span>
                      </span>
                      <span className={on ? "eu-chip-accent shrink-0" : "eu-picker-add shrink-0"}>
                        <Icon icon={on ? Check : Plus} size={14} />
                        {on ? tr("sequences.added") : tr("common.add")}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
        <div className="flex justify-end">
          <button className="eu-btn-primary" onClick={onClose}>
            {tr("sequences.done")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
