import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClipboardPaste, Download, Shuffle, Trash2, Users } from "lucide-react";
import { changed } from "../../api/client";
import { q } from "../../api/queries";
import { EmptyState, Modal, useConfirm, useFailure, useToast } from "../../components/ui";
import { Panel, Section } from "../../components/layout";
import { api } from "../../lib/api";
import { tr, trn } from "../../lib/i18n";
import { scene } from "../../stores/scene";
import { Icon } from "../../ui/Icon";
import { parseNames } from "./picker";

const NO_NAMES: string[] = [];

/**
 * A class's students, for the classroom screen's draw and groups: loaded
 * from Pronote or pasted, one name per line. The names stay on the key.
 */
export function StudentsPanel({ className }: { className: string }) {
  const toast = useToast();
  const failed = useFailure();
  const confirm = useConfirm();
  const names = useQuery(q.students(className)).data ?? NO_NAMES;
  const pronote = useQuery(q.pronoteStatus()).data?.connected ?? false;
  const [loading, setLoading] = useState(false);
  const [pasting, setPasting] = useState(false);
  const [text, setText] = useState("");
  const pasted = parseNames(text);

  const fromPronote = async () => {
    setLoading(true);
    try {
      const list = await api.pronoteStudents(className);
      changed("students");
      toast(trn("students.loaded", list.length), "success");
    } catch (err) {
      failed("students.pronote", err);
    } finally {
      setLoading(false);
    }
  };

  const openPaste = () => {
    setText(names.join("\n"));
    setPasting(true);
  };

  const savePasted = async () => {
    if (!pasted.length) return;
    try {
      const list = await api.setStudents(className, pasted);
      changed("students");
      setPasting(false);
      toast(trn("students.saved", list.length), "success");
    } catch (err) {
      failed("students.paste", err);
    }
  };

  const clear = async () => {
    const ok = await confirm.ask({
      title: tr("students.clearTitle"),
      message: tr("students.clearMessage", { class: className }),
      confirmLabel: tr("students.clear"),
      danger: true,
    });
    if (!ok) return;
    try {
      await api.clearStudents(className);
      changed("students");
      toast(tr("students.cleared"), "success");
    } catch (err) {
      failed("students.clear", err);
    }
  };

  const sources = (
    <>
      {pronote && (
        <button type="button" className="eu-btn-ghost eu-btn-sm" onClick={fromPronote} disabled={loading}>
          <Icon icon={Download} size={14} />
          {loading ? tr("students.loading") : tr("students.fromPronote")}
        </button>
      )}
      <button type="button" className="eu-btn-ghost eu-btn-sm" onClick={openPaste}>
        <Icon icon={ClipboardPaste} size={14} />
        {tr("students.paste")}
      </button>
    </>
  );

  return (
    <Section title={tr("students.title")}>
      <Panel>
        {names.length === 0 ? (
          <EmptyState
            icon={<Icon icon={Users} size={16} />}
            title={tr("students.empty")}
            hint={tr("students.emptyHint")}
            action={<div className="flex items-center gap-2 flex-wrap justify-center">{sources}</div>}
          />
        ) : (
          <div className="eu-row gap-3 flex-wrap">
            <div className="min-w-0 flex-1">
              <p className="eu-t-body font-medium text-ink">{trn("students.count", names.length)}</p>
              <p className="eu-t-meta truncate" title={names.join(", ")}>
                {names.join(", ")}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                className="eu-btn-primary eu-btn-sm"
                onClick={() => scene.openOn("draw", className)}
              >
                <Icon icon={Shuffle} size={14} />
                {tr("students.draw")}
              </button>
              <button
                type="button"
                className="eu-btn-ghost eu-btn-sm"
                onClick={() => scene.openOn("groups", className)}
              >
                <Icon icon={Users} size={14} />
                {tr("students.groups")}
              </button>
              {sources}
              <button
                type="button"
                className="eu-btn-quiet eu-btn-icon eu-btn-sm hover:text-danger"
                onClick={clear}
                aria-label={tr("students.clear")}
                title={tr("students.clear")}
              >
                <Icon icon={Trash2} size={14} />
              </button>
            </div>
          </div>
        )}
      </Panel>
      <p className="eu-t-meta mt-1.5">{tr("students.onTheKey")}</p>

      <Modal
        open={pasting}
        onClose={() => setPasting(false)}
        title={tr("students.pasteTitle", { class: className })}
      >
        <div className="flex flex-col gap-3">
          <p className="eu-t-body text-ink-muted">{tr("students.pasteHint")}</p>
          <textarea
            className="eu-input min-h-60 font-mono"
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-label={tr("students.pasteLabel")}
            placeholder={"Léa Dupont\nHugo Martin\n…"}
            autoFocus
          />
          <div className="flex items-center justify-between gap-2">
            <span className="eu-t-meta">{trn("students.pasteCount", pasted.length)}</span>
            <div className="flex gap-2">
              <button type="button" className="eu-btn-ghost" onClick={() => setPasting(false)}>
                {tr("common.cancel")}
              </button>
              <button type="button" className="eu-btn-primary" onClick={savePasted} disabled={!pasted.length}>
                {tr("common.save")}
              </button>
            </div>
          </div>
        </div>
      </Modal>
    </Section>
  );
}
