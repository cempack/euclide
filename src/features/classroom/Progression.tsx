import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MapPin, Paperclip, X } from "lucide-react";
import { q } from "../../api/queries";
import { EmptyState, Loading, useConfirm, useToast } from "../../components/ui";
import { Panel } from "../../components/layout";
import { ChevronDownIcon, LayersIcon, PlusIcon, TrashIcon } from "../../components/icons";
import { api, type CourseClass, type Sequence, type SequenceItem, type StepResource } from "../../lib/api";
import { errorMessage } from "../../lib/errors";
import { tr } from "../../lib/i18n";
import { reportError } from "../../lib/report";
import { Icon } from "../../ui/Icon";
import { tip } from "../../ui/Tooltip";
import { openResource } from "./lesson";
import { ResourceIcon, ResourcePicker } from "./ResourcePicker";

const NO_SEQUENCES: Sequence[] = [];
const NO_ITEMS: SequenceItem[] = [];

/** One resource of a step: opens on click, leaves with its ×. */
function ResourceChip({
  r,
  courseId,
  onRemove,
}: {
  r: StepResource;
  courseId: number;
  onRemove: () => void;
}) {
  return (
    <span className="eu-resource">
      <button
        type="button"
        className="eu-resource-open"
        onClick={() => openResource(r, courseId)}
        {...tip(r.kind === "link" && r.url ? r.url : r.name)}
      >
        <ResourceIcon r={r} className="w-3.5 h-3.5 shrink-0 text-ink-faint" />
        <span className="truncate">{r.name}</span>
      </button>
      <button
        type="button"
        className="eu-resource-remove"
        onClick={onRemove}
        aria-label={tr("sequences.removeResource", { name: r.name })}
        data-tip={tr("sequences.removeResource", { name: r.name })}
      >
        <Icon icon={X} size={14} />
      </button>
    </span>
  );
}

/**
 * A course's progression: chapters (sequences) made of steps (lessons). A
 * step lists what it opens in class; each class is pinned to the step it is
 * on, which the dashboard opens as « la séance ».
 */
export function Progression({
  courseId,
  courseClasses,
  onRefresh,
}: {
  courseId: number;
  courseClasses: CourseClass[];
  onRefresh: () => void;
}) {
  const toast = useToast();
  const confirmDlg = useConfirm();
  const queryClient = useQueryClient();

  const progression = useQuery(q.progression(courseId));
  const sequences = progression.data?.sequences ?? NO_SEQUENCES;
  const items = progression.data?.items ?? NO_ITEMS;
  useEffect(() => {
    if (progression.error) reportError("course.sequences", progression.error);
  }, [progression.error]);
  const [newSequence, setNewSequence] = useState("");
  const [addingTo, setAddingTo] = useState<number | null>(null);
  const [newItem, setNewItem] = useState("");
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({});
  const [picking, setPicking] = useState<number | null>(null);
  const [renaming, setRenaming] = useState<{ id: number; title: string } | null>(null);

  const reload = async () => {
    await queryClient.invalidateQueries({ queryKey: q.progression(courseId).queryKey });
    onRefresh();
  };

  /** Runs a change, then shows it; a failure says why. */
  const attempt = async (where: string, run: () => Promise<unknown>) => {
    try {
      await run();
      await reload();
    } catch (err) {
      reportError(where, err);
      toast(errorMessage(err, tr("messages.genericError")), "error");
    }
  };

  const addSequence = () => {
    const title = newSequence.trim();
    if (!title) return;
    void attempt("course.addSequence", async () => {
      await api.createSequence(courseId, title);
      setNewSequence("");
    });
  };

  const addItem = (sequenceId: number) => {
    const title = newItem.trim();
    if (!title) return;
    void attempt("course.addItem", async () => {
      const created = await api.createSequenceItem(sequenceId, title, null);
      setNewItem("");
      setAddingTo(null);
      // A new lesson is mostly about what it opens: choose it now.
      setPicking(created.id);
    });
  };

  const rename = () => {
    if (!renaming) return;
    const { id, title } = renaming;
    setRenaming(null);
    if (!title.trim()) return;
    void attempt("course.renameItem", () => api.renameSequenceItem(id, title));
  };

  const removeResource = (r: StepResource) =>
    void attempt("course.removeResource", async () => {
      await api.removeStepResource(r.id);
      toast(tr("sequences.resourceRemoved", { name: r.name }), "info", {
        action: {
          label: tr("common.undo"),
          run: () =>
            void attempt("course.restoreResource", () =>
              api.addStepResource(r.item_id, r.kind, { id: r.ref_id ?? undefined, name: r.ref_name }),
            ),
        },
      });
    });

  const deleteItem = async (item: SequenceItem) => {
    const ok = await confirmDlg.ask({
      title: tr("sequences.deleteStepTitle", { name: item.title }),
      message: tr("sequences.deleteStepMessage"),
      confirmLabel: tr("common.delete"),
      danger: true,
    });
    if (ok) void attempt("course.deleteItem", () => api.deleteSequenceItem(item.id));
  };

  const classesAt = (itemId: number) => courseClasses.filter((cc) => cc.last_item_id === itemId);

  return (
    <Panel
      title={tr("sequences.title")}
      icon={<LayersIcon className="w-3.5 h-3.5" />}
      action={
        <div className="flex items-center gap-1.5">
          <input
            className="eu-input eu-field-sm w-[190px]"
            placeholder={tr("sequences.newPlaceholder")}
            value={newSequence}
            onChange={(e) => setNewSequence(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addSequence()}
            aria-label={tr("sequences.newPlaceholder")}
          />
          <button className="eu-btn-ghost eu-btn-sm" onClick={addSequence} disabled={!newSequence.trim()}>
            <PlusIcon className="w-3.5 h-3.5" />
            {tr("sequences.add")}
          </button>
        </div>
      }
    >
      {progression.isPending ? (
        <Loading label={tr("common.loading")} size="small" />
      ) : sequences.length === 0 ? (
        <EmptyState
          icon={<LayersIcon className="w-4 h-4" />}
          title={tr("sequences.emptyTitle")}
          hint={tr("sequences.emptyHint")}
        />
      ) : (
        <div className="eu-divide">
          {sequences.map((seq, seqIndex) => {
            const seqItems = items.filter((i) => i.sequence_id === seq.id);
            const isCollapsed = !!collapsed[seq.id];
            return (
              <div key={seq.id}>
                <div className="eu-row group bg-panel-alt/60">
                  <button
                    onClick={() => setCollapsed((c) => ({ ...c, [seq.id]: !c[seq.id] }))}
                    aria-expanded={!isCollapsed}
                    aria-label={seq.title}
                    className="eu-btn-quiet eu-btn-icon eu-btn-sm shrink-0"
                  >
                    <ChevronDownIcon
                      className={`w-3.5 h-3.5 transition-transform duration-fast ${isCollapsed ? "-rotate-90" : ""}`}
                    />
                  </button>
                  <span className="eu-t-body font-medium text-ink truncate flex-1">{seq.title}</span>
                  <span className="eu-chip shrink-0">
                    {tr("sequences.stepCount", { count: seqItems.length })}
                  </span>
                  <div className="eu-row-actions eu-row-tools flex items-center gap-0.5 shrink-0">
                    <button
                      onClick={() =>
                        void attempt("course.moveSequence", () => api.moveSequence(courseId, seq.id, -1))
                      }
                      disabled={seqIndex === 0}
                      aria-label={tr("sequences.moveUp")}
                      data-tip={tr("sequences.moveUp")}
                      className="eu-btn-quiet eu-btn-icon eu-btn-sm"
                    >
                      <ChevronDownIcon className="w-3.5 h-3.5 rotate-180" />
                    </button>
                    <button
                      onClick={() =>
                        void attempt("course.moveSequence", () => api.moveSequence(courseId, seq.id, 1))
                      }
                      disabled={seqIndex === sequences.length - 1}
                      aria-label={tr("sequences.moveDown")}
                      data-tip={tr("sequences.moveDown")}
                      className="eu-btn-quiet eu-btn-icon eu-btn-sm"
                    >
                      <ChevronDownIcon className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={async () => {
                        const ok = await confirmDlg.ask({
                          title: tr("sequences.deleteTitle"),
                          message: tr("sequences.deleteMessage", { name: seq.title }),
                          confirmLabel: tr("common.delete"),
                          danger: true,
                        });
                        if (ok) void attempt("course.deleteSequence", () => api.deleteSequence(seq.id));
                      }}
                      aria-label={`${tr("common.delete")} — ${seq.title}`}
                      data-tip={tr("common.delete")}
                      className="eu-btn-quiet eu-btn-icon eu-btn-sm hover:text-danger"
                    >
                      <TrashIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {!isCollapsed && (
                  <div className="pl-8">
                    {seqItems.map((item, itemIndex) => (
                      <div key={item.id} className="eu-step group border-t border-line">
                        <div className="eu-row">
                          <span className="eu-t-caption w-5 shrink-0">{itemIndex + 1}</span>
                          {renaming?.id === item.id ? (
                            <input
                              autoFocus
                              className="eu-input eu-field-sm flex-1 min-w-24"
                              value={renaming.title}
                              onChange={(e) => setRenaming({ id: item.id, title: e.target.value })}
                              onBlur={rename}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") rename();
                                if (e.key === "Escape") setRenaming(null);
                              }}
                              aria-label={tr("sequences.renameStep")}
                            />
                          ) : (
                            <button
                              type="button"
                              className="eu-t-body text-ink truncate flex-1 min-w-24 text-left"
                              onDoubleClick={() => setRenaming({ id: item.id, title: item.title })}
                              onKeyDown={(e) =>
                                e.key === "F2" && setRenaming({ id: item.id, title: item.title })
                              }
                              data-tip={tr("sequences.renameHint")}
                            >
                              {item.title}
                            </button>
                          )}
                          {classesAt(item.id).map((cc) => (
                            <span
                              key={cc.id}
                              className="eu-chip-accent shrink-0"
                              data-tip={tr("sequences.classHere", { name: cc.class_name })}
                            >
                              <Icon icon={MapPin} size={14} />
                              {cc.class_name}
                            </span>
                          ))}
                          <div className="eu-row-actions eu-row-tools flex items-center gap-0.5 shrink-0">
                            {courseClasses.length > 0 && (
                              <select
                                value=""
                                onChange={(e) => {
                                  const name = e.target.value;
                                  if (name)
                                    void attempt("course.markClass", () =>
                                      api.setCourseClassItem(courseId, name, item.id),
                                    );
                                }}
                                className="eu-select eu-field-sm w-[104px]"
                                aria-label={tr("sequences.markClass")}
                                data-tip={tr("sequences.markClass")}
                              >
                                <option value="">{tr("sequences.markClassShort")}</option>
                                {courseClasses.map((cc) => (
                                  <option key={cc.id} value={cc.class_name}>
                                    {cc.class_name}
                                  </option>
                                ))}
                              </select>
                            )}
                            <button
                              onClick={() =>
                                void attempt("course.moveItem", () =>
                                  api.moveSequenceItem(seq.id, item.id, -1),
                                )
                              }
                              disabled={itemIndex === 0}
                              aria-label={tr("sequences.moveUp")}
                              className="eu-btn-quiet eu-btn-icon eu-btn-sm"
                            >
                              <ChevronDownIcon className="w-3.5 h-3.5 rotate-180" />
                            </button>
                            <button
                              onClick={() =>
                                void attempt("course.moveItem", () =>
                                  api.moveSequenceItem(seq.id, item.id, 1),
                                )
                              }
                              disabled={itemIndex === seqItems.length - 1}
                              aria-label={tr("sequences.moveDown")}
                              className="eu-btn-quiet eu-btn-icon eu-btn-sm"
                            >
                              <ChevronDownIcon className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => void deleteItem(item)}
                              aria-label={`${tr("common.delete")} — ${item.title}`}
                              data-tip={tr("common.delete")}
                              className="eu-btn-quiet eu-btn-icon eu-btn-sm hover:text-danger"
                            >
                              <TrashIcon className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        <div className="eu-step-resources">
                          {item.resources.map((r) => (
                            <ResourceChip
                              key={r.id}
                              r={r}
                              courseId={courseId}
                              onRemove={() => removeResource(r)}
                            />
                          ))}
                          <button
                            type="button"
                            className="eu-resource-add"
                            onClick={() => setPicking(item.id)}
                            aria-label={`${tr("sequences.addResource")} — ${item.title}`}
                          >
                            <Icon icon={Paperclip} size={14} />
                            {item.resources.length
                              ? tr("sequences.editResources")
                              : tr("sequences.addResource")}
                          </button>
                        </div>
                      </div>
                    ))}

                    {addingTo === seq.id ? (
                      <div className="eu-row border-t border-line gap-2">
                        <input
                          autoFocus
                          className="eu-input flex-1"
                          placeholder={tr("sequences.stepPlaceholder")}
                          value={newItem}
                          onChange={(e) => setNewItem(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") addItem(seq.id);
                            if (e.key === "Escape") setAddingTo(null);
                          }}
                          aria-label={tr("sequences.stepPlaceholder")}
                        />
                        <button
                          className="eu-btn-primary eu-btn-sm"
                          onClick={() => addItem(seq.id)}
                          disabled={!newItem.trim()}
                        >
                          {tr("common.add")}
                        </button>
                        <button className="eu-btn-quiet eu-btn-sm" onClick={() => setAddingTo(null)}>
                          {tr("common.cancel")}
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setAddingTo(seq.id);
                          setNewItem("");
                        }}
                        className="eu-row-hover w-full text-left border-t border-line text-ink-muted"
                      >
                        <PlusIcon className="w-3.5 h-3.5 shrink-0" />
                        <span className="eu-t-meta">{tr("sequences.addStep")}</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <ResourcePicker
        courseId={courseId}
        step={items.find((i) => i.id === picking)}
        onClose={() => setPicking(null)}
      />
    </Panel>
  );
}
