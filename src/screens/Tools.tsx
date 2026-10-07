import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { q } from "../api/queries";
import { api, type QuickLink } from "../lib/api";
import { tr } from "../lib/i18n";
import { errorMessage } from "../lib/errors";
import { logged, reportError } from "../lib/report";
import { EmptyState, Modal, useToast, useConfirm } from "../components/ui";
import { Field, Panel, Section, PageHeader, MetaDot } from "../components/layout";
import { useAppearance } from "../lib/theme";
import { tabs } from "../stores/tabs";
import { timer } from "../stores/timer";
import {
  CoffeeIcon,
  CodeIcon,
  LinkIcon,
  PenIcon,
  PlusIcon,
  ProjectorIcon,
  TrashIcon,
} from "../components/icons";
import { Favicon, remoteFaviconsEnabled } from "../components/Favicon";

const NO_LINKS: QuickLink[] = [];

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
      <LinksSection />
    </>
  );
}

/** Screen lock, projection and the shortcuts that used to sit on the dashboard. */
function ClassroomSection() {
  const toast = useToast();
  const { projection, toggleProjection } = useAppearance();
  const [on, setOn] = useState(true); // default on (matches backend startup default)

  useEffect(() => {
    api.keepAwakeStatus().then(setOn).catch(logged("tools.keepAwakeStatus"));
  }, []);

  const toggle = async () => {
    try {
      const next = await api.setKeepAwake(!on);
      setOn(next);
      window.dispatchEvent(new CustomEvent("eu:keepawake-changed"));
      toast(next ? tr("tools.keepAwakeOn") : tr("tools.keepAwakeOff"), next ? "success" : "info");
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
              <CoffeeIcon className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <p className="eu-t-body font-medium text-ink">{tr("tools.keepAwake")}</p>
              <p className="eu-t-meta">{on ? tr("tools.keepAwakeOn") : tr("tools.keepAwakeOff")}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={toggle}
            role="switch"
            aria-checked={on}
            aria-label={tr("tools.keepAwake")}
            className={`relative w-10 h-6 shrink-0 rounded-full border transition-colors duration-fast ${
              on ? "bg-ok-solid border-ok-solid" : "bg-panel-alt border-line"
            }`}
          >
            <span
              className={`absolute top-[3px] w-4 h-4 rounded-full bg-panel shadow-pop transition-all duration-fast ${
                on ? "left-[19px]" : "left-[3px]"
              }`}
            />
          </button>
        </div>

        <div className="eu-row justify-between border-t border-line">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-8 h-8 shrink-0 grid place-items-center rounded border border-line text-ink-muted">
              <ProjectorIcon className="w-4 h-4" />
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

        <div className="eu-row gap-2 flex-wrap border-t border-line">
          <span className="eu-t-meta mr-1">{tr("tools.shortcuts")}</span>
          <button
            type="button"
            className="eu-btn-ghost eu-btn-sm"
            onClick={() =>
              tabs.open({
                kind: "whiteboard",
                title: tr("app.tabWhiteboard"),
                params: { isNew: true },
              })
            }
          >
            <PenIcon className="w-3.5 h-3.5" />
            {tr("nav.whiteboard")}
          </button>
          <button
            type="button"
            className="eu-btn-ghost eu-btn-sm"
            onClick={() => tabs.open({ kind: "python" })}
          >
            <CodeIcon className="w-3.5 h-3.5" />
            Python
          </button>
        </div>
      </Panel>
    </Section>
  );
}

/** Class timer: presets plus a free duration. */
function TimerSection() {
  const [custom, setCustom] = useState("20");
  const start = (minutes: number) => {
    timer.start(minutes);
  };
  const customMinutes = Math.max(1, Math.min(180, parseInt(custom, 10) || 0));

  return (
    <Section title={tr("tools.timerTitle")}>
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
        </div>
      </Panel>
    </Section>
  );
}

function LinksSection() {
  const toast = useToast();
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
    const created = await api.createLink(label.trim(), normalized, "");
    if (!created?.id) {
      toast(tr("common.error"), "error");
      return;
    }
    setLabel("");
    setUrl("");
    setOpen(false);
    toast(tr("tools.toastLinkAdded"), "success");
    window.dispatchEvent(new CustomEvent("eu:quicklinks-changed"));
    refresh();
  };

  return (
    <Section
      title={tr("tools.quickLinks")}
      action={
        <button onClick={() => setOpen(true)} className="eu-btn-ghost eu-btn-sm">
          <PlusIcon className="w-3.5 h-3.5" /> {tr("common.add")}
        </button>
      }
    >
      <Panel>
        {links.length === 0 ? (
          <EmptyState
            icon={<LinkIcon className="w-4 h-4" />}
            title={tr("tools.noQuickLinks")}
            hint={tr("tools.noQuickLinksHint")}
            action={
              <button onClick={() => setOpen(true)} className="eu-btn-primary eu-btn-sm">
                <PlusIcon className="w-3.5 h-3.5" /> {tr("common.newLink")}
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
                    await api.deleteLink(l.id);
                    window.dispatchEvent(new CustomEvent("eu:quicklinks-changed"));
                    refresh();
                  }}
                  aria-label={`${tr("common.delete")} — ${l.label}`}
                  data-tip={tr("common.delete")}
                  className="eu-row-actions eu-btn-quiet eu-btn-icon eu-btn-sm hover:text-danger"
                >
                  <TrashIcon className="w-3.5 h-3.5" />
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
