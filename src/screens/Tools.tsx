import { useState } from "react";
import { changed } from "../api/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { q } from "../api/queries";
import { api, type QuickLink, type StudentList } from "../lib/api";
import { tr, trn } from "../lib/i18n";
import { errorMessage } from "../lib/errors";
import { reportError } from "../lib/report";
import { EmptyState, Modal, useFailure, useToast, useConfirm } from "../components/ui";
import { Field, Panel, Section, PageHeader, MetaDot, Segmented } from "../components/layout";
import { useSetting } from "../api/hooks";
import { useAppearance } from "../lib/theme";
import { tabs } from "../stores/tabs";
import { stopwatch, timer, useStopwatchElapsed } from "../stores/timer";
import { coin, randomInt, rollDie } from "../features/classroom/picker";
import { scene } from "../stores/scene";
import { keysOf } from "../lib/keymap";
import { tip } from "../ui/Tooltip";
import { Maximize2 as MaximizeIcon } from "lucide-react";
import {
  Coffee,
  Dices,
  Download,
  Link,
  Plus,
  Projector,
  QrCode as QrIcon,
  Shuffle,
  Timer as TimerIcon,
  Trash2,
  Users,
} from "lucide-react";
import { Icon } from "../ui/Icon";
import { Favicon, remoteFaviconsEnabled } from "../components/Favicon";

const NO_LINKS: QuickLink[] = [];
const NO_LISTS: StudentList[] = [];

export default function Tools() {
  return (
    <>
      <PageHeader
        title={tr("nav.tools")}
        meta={
          <>
            <span>{tr("tools.metaClassroom")}</span>
            <MetaDot />
            <span>{tr("tools.metaLinks")}</span>
          </>
        }
      />
      <ClassroomSection />
      <TimerSection />
      <DrawSection />
      <LinksSection />
    </>
  );
}

/** Screen lock, projection and the shortcuts that used to sit on the dashboard. */
function ClassroomSection() {
  const toast = useToast();
  const { projection, toggleProjection } = useAppearance();
  const queryClient = useQueryClient();
  const on = useQuery(q.keepAwake()).data ?? false;
  const [savedMode] = useSetting("keep_awake_mode");
  const mode = savedMode === "on" || savedMode === "off" ? savedMode : "auto";

  const choose = async (next: "auto" | "on" | "off") => {
    try {
      const nowOn = await api.setKeepAwakeMode(next);
      queryClient.setQueryData(q.setting("keep_awake_mode").queryKey, next);
      queryClient.setQueryData(q.keepAwake().queryKey, nowOn);
    } catch (err) {
      reportError("tools.keepAwake", err);
      toast(errorMessage(err, tr("messages.genericError")), "error");
    }
  };

  return (
    <Section title={tr("tools.classroomTitle")}>
      <Panel>
        <div className="eu-row justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-8 h-8 shrink-0 grid place-items-center rounded border border-line text-ink-muted">
              <Icon icon={Coffee} size={16} />
            </span>
            <div className="min-w-0">
              <p className="eu-t-body font-medium text-ink">{tr("tools.keepAwake")}</p>
              <p className="eu-t-meta">{on ? tr("tools.keepAwakeNowOn") : tr("tools.keepAwakeNowOff")}</p>
            </div>
          </div>
          <Segmented
            value={mode}
            onChange={(v) => void choose(v)}
            label={tr("tools.keepAwake")}
            options={[
              { value: "auto", label: tr("tools.keepAwakeAuto"), title: tr("tools.keepAwakeAutoHint") },
              { value: "on", label: tr("tools.keepAwakeAlways") },
              { value: "off", label: tr("tools.keepAwakeNever") },
            ]}
          />
        </div>

        <div className="eu-row justify-between border-t border-line">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-8 h-8 shrink-0 grid place-items-center rounded border border-line text-ink-muted">
              <Icon icon={Projector} size={16} />
            </span>
            <div className="min-w-0">
              <p className="eu-t-body font-medium text-ink">{tr("appearance.projection")}</p>
              <p className="eu-t-meta">{tr("tools.projectionHint")}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={toggleProjection}
            aria-pressed={projection}
            className={projection ? "eu-btn-primary eu-btn-sm" : "eu-btn-ghost eu-btn-sm"}
          >
            {projection ? tr("common.active") : tr("common.enable")}
          </button>
        </div>
      </Panel>
    </Section>
  );
}

/** Class timer: presets plus a free duration. */
function TimerSection() {
  const [custom, setCustom] = useState("20");
  const watching = useStopwatchElapsed() != null;
  const start = (minutes: number) => {
    timer.start(minutes);
  };
  const customMinutes = Math.max(1, Math.min(180, parseInt(custom, 10) || 0));

  return (
    <Section
      title={tr("tools.timerTitle")}
      action={
        <button
          type="button"
          onClick={scene.open}
          className="eu-btn-ghost eu-btn-sm"
          {...tip(tr("scene.open"), keysOf("scene"))}
        >
          <MaximizeIcon className="w-3.5 h-3.5" />
          {tr("scene.fullscreen")}
        </button>
      }
    >
      <Panel pad>
        <p className="eu-t-body text-ink-muted mb-3.5 max-w-[62ch]">{tr("tools.timerHint")}</p>
        <div className="flex items-end gap-4 flex-wrap">
          <div className="flex items-center gap-1.5">
            {[5, 10, 15, 30].map((m) => (
              <button key={m} type="button" className="eu-btn-ghost eu-btn-sm" onClick={() => start(m)}>
                {tr("tools.timerMinutes", { count: m })}
              </button>
            ))}
          </div>
          <span className="w-px h-7 bg-line hidden @lg:block" />
          <Field label={tr("tools.timerCustom")} className="w-auto">
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min={1}
                max={180}
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") start(customMinutes);
                }}
                className="eu-input w-20 text-center tabular-nums"
                aria-label={tr("tools.timerCustom")}
              />
              <span className="eu-t-meta">min</span>
              <button type="button" className="eu-btn-primary eu-btn-sm" onClick={() => start(customMinutes)}>
                {tr("tools.timerStart")}
              </button>
            </div>
          </Field>
          <span className="w-px h-7 bg-line hidden @lg:block" />
          <button
            type="button"
            className="eu-btn-ghost eu-btn-sm"
            aria-pressed={watching}
            onClick={() => (watching ? stopwatch.stop() : stopwatch.start())}
          >
            <Icon icon={TimerIcon} size={14} />
            {watching ? `${tr("timer.stopwatch")} — ${tr("timer.stop")}` : tr("timer.stopwatch")}
          </button>
        </div>
      </Panel>
    </Section>
  );
}

/** Drawing lots: a student, the class in groups (full screen), or chance right here. */
function DrawSection() {
  const toast = useToast();
  const failed = useFailure();
  const lists = useQuery(q.studentLists()).data ?? NO_LISTS;
  const pronote = useQuery(q.pronoteStatus()).data?.connected ?? false;
  const [chosen, setChosen] = useState<string | null>(null);
  const className = chosen ?? lists[0]?.class_name ?? null;
  const [loading, setLoading] = useState(false);

  /** Every class's students from Pronote, in one go: each becomes its class's list. */
  const fromPronote = async () => {
    setLoading(true);
    try {
      const { loaded, failed: refused } = await api.pronoteStudentsAll();
      changed("students");
      if (loaded.length)
        toast(
          tr("tools.drawLoaded", { classes: loaded.map((l) => `${l.class} (${l.count})`).join(", ") }),
          "success",
        );
      else if (!refused.length) toast(tr("tools.drawLoadedNone"), "error");
      if (refused.length)
        toast(tr("tools.drawRefused", { classes: refused.map((r) => r.class).join(", ") }), "error");
    } catch (err) {
      failed("students.pronoteAll", err);
    } finally {
      setLoading(false);
    }
  };
  const [faces, setFaces] = useState(6);
  const [min, setMin] = useState(1);
  const [max, setMax] = useState(100);
  const [result, setResult] = useState<string | null>(null);

  return (
    <Section
      title={tr("tools.drawTitle")}
      action={
        <button
          type="button"
          onClick={() => scene.openOn("chance")}
          className="eu-btn-ghost eu-btn-sm"
          {...tip(tr("scene.open"))}
        >
          <MaximizeIcon className="w-3.5 h-3.5" />
          {tr("scene.fullscreen")}
        </button>
      }
    >
      <Panel>
        <div className="eu-row justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-8 h-8 shrink-0 grid place-items-center rounded border border-line text-ink-muted">
              <Icon icon={Users} size={16} />
            </span>
            <div className="min-w-0">
              <p className="eu-t-body font-medium text-ink">{tr("tools.drawStudents")}</p>
              <p className="eu-t-meta">
                {lists.length
                  ? tr("tools.drawStudentsHint")
                  : tr(pronote ? "tools.drawNoList" : "tools.drawNoListPaste")}
              </p>
            </div>
          </div>
          {lists.length > 0 && className && (
            <div className="flex items-center gap-2 flex-wrap">
              <select
                className="eu-select eu-field-sm w-auto"
                value={className}
                onChange={(e) => setChosen(e.target.value)}
                aria-label={tr("tools.drawClass")}
              >
                {lists.map((l) => (
                  <option key={l.class_name} value={l.class_name}>
                    {l.class_name} · {trn("students.count", l.count)}
                  </option>
                ))}
              </select>
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
              {pronote && (
                <button
                  type="button"
                  className="eu-btn-quiet eu-btn-icon eu-btn-sm"
                  onClick={() => void fromPronote()}
                  disabled={loading}
                  aria-label={tr("tools.drawUpdateFromPronote")}
                  {...tip(tr("tools.drawUpdateFromPronote"))}
                >
                  <Icon icon={Download} size={14} />
                </button>
              )}
            </div>
          )}
          {!lists.length && (
            <div className="flex items-center gap-2 flex-wrap">
              {pronote && (
                <button
                  type="button"
                  className="eu-btn-primary eu-btn-sm"
                  onClick={() => void fromPronote()}
                  disabled={loading}
                >
                  <Icon icon={Download} size={14} />
                  {loading ? tr("tools.drawLoading") : tr("tools.drawFromPronote")}
                </button>
              )}
              <button
                type="button"
                className="eu-btn-ghost eu-btn-sm"
                onClick={() => tabs.open({ kind: "courses" })}
              >
                {tr("tools.drawOpenCourses")}
              </button>
            </div>
          )}
        </div>

        <div className="eu-row justify-between flex-wrap gap-3 border-t border-line">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-8 h-8 shrink-0 grid place-items-center rounded border border-line text-ink-muted">
              <Icon icon={Dices} size={16} />
            </span>
            <div className="min-w-0">
              <p className="eu-t-body font-medium text-ink">{tr("tools.chance")}</p>
              <p className="eu-t-meta">{tr("tools.chanceHint")}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <select
              className="eu-select eu-field-sm w-auto"
              value={faces}
              onChange={(e) => setFaces(Number(e.target.value))}
              aria-label={tr("scene.faces")}
            >
              {[4, 6, 8, 10, 12, 20].map((f) => (
                <option key={f} value={f}>
                  {tr("scene.dieOf", { faces: f })}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="eu-btn-ghost eu-btn-sm"
              onClick={() => setResult(String(rollDie(faces)))}
            >
              {tr("scene.chanceDie")}
            </button>
            <span className="flex items-center gap-1.5">
              <input
                type="number"
                value={min}
                onChange={(e) => setMin(Number(e.target.value) || 0)}
                className="eu-input eu-field-sm w-16 text-center tabular-nums"
                aria-label={tr("scene.from")}
              />
              <span className="eu-t-meta">{tr("scene.to")}</span>
              <input
                type="number"
                value={max}
                onChange={(e) => setMax(Number(e.target.value) || 0)}
                className="eu-input eu-field-sm w-16 text-center tabular-nums"
                aria-label={tr("scene.to")}
              />
              <button
                type="button"
                className="eu-btn-ghost eu-btn-sm"
                onClick={() => setResult(String(randomInt(min, max)))}
              >
                {tr("scene.chanceNumber")}
              </button>
            </span>
            <button
              type="button"
              className="eu-btn-ghost eu-btn-sm"
              onClick={() => setResult(tr(coin() === "pile" ? "scene.pile" : "scene.face"))}
            >
              {tr("scene.chanceCoin")}
            </button>
            <output
              className="min-w-12 text-center eu-t-title font-mono tabular-nums text-ink"
              aria-label={tr("tools.chanceResult")}
              aria-live="polite"
            >
              {result ?? "—"}
            </output>
          </div>
        </div>
      </Panel>
    </Section>
  );
}

function LinksSection() {
  const toast = useToast();
  const failed = useFailure();
  const confirmDlg = useConfirm();
  const queryClient = useQueryClient();
  const links = useQuery(q.links()).data ?? NO_LINKS;
  const remoteIcons = remoteFaviconsEnabled(useQuery(q.setting("remote_favicons")).data ?? null);
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");

  const refresh = () => void queryClient.invalidateQueries({ queryKey: q.links().queryKey });

  const add = async () => {
    if (!label.trim() || !url.trim()) return;
    const normalized = url.startsWith("http") ? url : `https://${url}`;
    try {
      const created = await api.createLink(label.trim(), normalized, "");
      if (!created?.id) {
        toast(tr("common.error"), "error");
        return;
      }
      setLabel("");
      setUrl("");
      setOpen(false);
      toast(tr("tools.toastLinkAdded"), "success");
      changed("links");
      refresh();
    } catch (err) {
      failed("tools.addLink", err);
    }
  };

  return (
    <Section
      title={tr("tools.quickLinks")}
      action={
        <button onClick={() => setOpen(true)} className="eu-btn-ghost eu-btn-sm">
          <Icon icon={Plus} size={14} /> {tr("common.add")}
        </button>
      }
    >
      <Panel>
        {links.length === 0 ? (
          <EmptyState
            icon={<Icon icon={Link} size={16} />}
            title={tr("tools.noQuickLinks")}
            hint={tr("tools.noQuickLinksHint")}
            action={
              <button onClick={() => setOpen(true)} className="eu-btn-primary eu-btn-sm">
                <Icon icon={Plus} size={14} /> {tr("common.newLink")}
              </button>
            }
          />
        ) : (
          <div className="eu-divide">
            {links.map((l) => (
              <div key={l.id} className="eu-row-hover group">
                <button
                  type="button"
                  onClick={() => {
                    void api.openUrl(l.url).catch((err) => {
                      reportError("tools.openUrl", err);
                      toast(errorMessage(err, tr("messages.openUrlError")), "error");
                    });
                  }}
                  className="flex items-center gap-2.5 flex-1 min-w-0 text-left"
                  data-tip={l.url}
                >
                  <Favicon url={l.url} className="w-5 h-5 text-[0.625rem]" remote={remoteIcons} />
                  <span className="eu-t-body text-ink truncate">{l.label}</span>
                  <span className="eu-t-meta truncate hidden @xl:inline">{l.url}</span>
                </button>
                <button
                  type="button"
                  onClick={() => scene.showQr(l.url)}
                  aria-label={`${tr("tools.showQr")} — ${l.label}`}
                  data-tip={tr("tools.showQr")}
                  className="eu-row-actions eu-btn-quiet eu-btn-icon eu-btn-sm"
                >
                  <Icon icon={QrIcon} size={14} />
                </button>
                <button
                  onClick={async () => {
                    const ok = await confirmDlg.ask({
                      title: tr("common.delete"),
                      message: tr("tools.confirmDeleteLink", {
                        name: l.label,
                      }),
                      confirmLabel: tr("common.delete"),
                      danger: true,
                    });
                    if (!ok) return;
                    try {
                      await api.deleteLink(l.id);
                    } catch (err) {
                      failed("tools.deleteLink", err);
                      return;
                    }
                    changed("links");
                    refresh();
                  }}
                  aria-label={`${tr("common.delete")} — ${l.label}`}
                  data-tip={tr("common.delete")}
                  className="eu-row-actions eu-btn-quiet eu-btn-icon eu-btn-sm hover:text-danger"
                >
                  <Icon icon={Trash2} size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Modal open={open} onClose={() => setOpen(false)} title={tr("common.newLink")}>
        <div className="flex flex-col gap-3.5">
          <Field label={tr("tools.linkName")} htmlFor="link-label">
            <input
              id="link-label"
              autoFocus
              className="eu-input"
              placeholder={tr("tools.linkNamePlaceholder")}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </Field>
          <Field label={tr("tools.linkUrl")} htmlFor="link-url">
            <input
              id="link-url"
              className="eu-input"
              placeholder={tr("tools.linkUrlPlaceholder")}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
            />
          </Field>
          <div className="flex justify-end gap-2 mt-1">
            <button className="eu-btn-ghost" onClick={() => setOpen(false)}>
              {tr("common.cancel")}
            </button>
            <button className="eu-btn-primary" onClick={add} disabled={!label.trim() || !url.trim()}>
              {tr("common.add")}
            </button>
          </div>
        </div>
      </Modal>
    </Section>
  );
}
