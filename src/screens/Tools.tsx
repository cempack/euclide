import { useEffect, useState } from "react";
import { api, type QuickLink } from "../lib/api";
import { t, get, fmt } from "../lib/i18n";
import { EmptyState, Modal, useToast, useConfirm } from "../components/ui";
import { Field, Panel, Section, PageHeader, MetaDot } from "../components/layout";
import { useAppearance } from "../lib/theme";
import { useTabs } from "../lib/tabs";
import {
 CoffeeIcon,
 CodeIcon,
 LinkIcon,
 PenIcon,
 PlusIcon,
 ProjectorIcon,
 TrashIcon,
} from "../components/icons";
import { Favicon } from "../components/Favicon";

export default function Tools() {
 return (
 <>
 <PageHeader
 title={t.nav.tools}
 meta={
 <>
 <span>{get("tools.metaClassroom", "Pour la classe")}</span>
 <MetaDot />
 <span>{get("tools.metaLinks", "Liens rapides")}</span>
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
 const tabs = useTabs();
 const { projection, toggleProjection } = useAppearance();
 const [on, setOn] = useState(true); // default on (matches backend startup default)

 useEffect(() => {
 api.keepAwakeStatus().then(setOn).catch(() => {});
 }, []);

 const toggle = async () => {
 try {
 const next = await api.setKeepAwake(!on);
 setOn(next);
 window.dispatchEvent(new CustomEvent("eu:keepawake-changed"));
 toast(
 next
 ? t.tools?.keepAwakeOn || "L'écran reste allumé"
 : t.tools?.keepAwakeOff || "Verrouillage écran normal",
 next ? "success" : "info"
 );
 } catch {
 toast(get("messages.genericError", "Erreur"), "error");
 }
 };

 return (
 <Section title={get("tools.classroomTitle", "En classe")}>
 <Panel>
 <div className="eu-row justify-between">
 <div className="flex items-center gap-3 min-w-0">
 <span className="w-8 h-8 shrink-0 grid place-items-center rounded border border-line text-ink-muted">
 <CoffeeIcon className="w-4 h-4" />
 </span>
 <div className="min-w-0">
 <p className="eu-t-body font-medium text-ink">
 {t.tools?.keepAwake || "Ne pas verrouiller l'écran"}
 </p>
 <p className="eu-t-meta">
 {on
 ? t.tools?.keepAwakeOn || "L'écran reste allumé"
 : t.tools?.keepAwakeOff || "Verrouillage écran normal"}
 </p>
 </div>
 </div>
 <button
 type="button"
 onClick={toggle}
 role="switch"
 aria-checked={on}
 aria-label={t.tools?.keepAwake || "Ne pas verrouiller l'écran"}
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
 <p className="eu-t-body font-medium text-ink">
 {get("appearance.projection", "Mode projection")}
 </p>
 <p className="eu-t-meta">
 {get(
 "tools.projectionHint",
 "Typographie agrandie, barres masquées — pour le vidéoprojecteur."
 )}
 </p>
 </div>
 </div>
 <button
 type="button"
 onClick={toggleProjection}
 aria-pressed={projection}
 className={projection ? "eu-btn-primary eu-btn-sm" : "eu-btn-ghost eu-btn-sm"}
 >
 {projection ? get("common.active", "Activé") : get("common.enable", "Activer")}
 </button>
 </div>

 <div className="eu-row gap-2 flex-wrap border-t border-line">
 <span className="eu-t-meta mr-1">{get("tools.shortcuts", "Ouvrir :")}</span>
 <button
 type="button"
 className="eu-btn-ghost eu-btn-sm"
 onClick={() =>
 tabs.open({
 kind: "whiteboard",
 title: get("app.tabWhiteboard", "Tableau"),
 params: { isNew: true },
 })
 }
 >
 <PenIcon className="w-3.5 h-3.5" />
 {get("nav.whiteboard", "Tableau blanc")}
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
 window.dispatchEvent(new CustomEvent("eu:timer-start", { detail: { minutes } }));
 };
 const customMinutes = Math.max(1, Math.min(180, parseInt(custom, 10) || 0));

 return (
 <Section title={t.tools?.timerTitle || "Minuteur de classe"}>
 <Panel pad>
 <p className="eu-t-body text-ink-muted mb-3.5 max-w-[62ch]">
 {get(
 "tools.timerHint",
 "Compte à rebours dans la barre d'onglets, et en grand au tableau si le mode projection est actif. Une sonnerie douce marque la fin."
 )}
 </p>
 <div className="flex items-end gap-4 flex-wrap">
 <div className="flex items-center gap-1.5">
 {[5, 10, 15, 30].map((m) => (
 <button key={m} type="button" className="eu-btn-ghost eu-btn-sm" onClick={() => start(m)}>
 {fmt(get("tools.timerMinutes", "{count} min"), { count: m })}
 </button>
 ))}
 </div>
 <span className="w-px h-7 bg-line hidden sm:block" />
 <Field label={get("tools.timerCustom", "Durée libre")} className="w-auto">
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
 aria-label={get("tools.timerCustom", "Durée libre")}
 />
 <span className="eu-t-meta">min</span>
 <button
 type="button"
 className="eu-btn-primary eu-btn-sm"
 onClick={() => start(customMinutes)}
 >
 {get("tools.timerStart", "Lancer")}
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
  const [links, setLinks] = useState<QuickLink[]>([]);
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [remoteIcons, setRemoteIcons] = useState(false);

  const refresh = () => api.listLinks().then(setLinks).catch(() => {});
  useEffect(() => {
    refresh();
    api
      .getSetting("remote_favicons")
      .then((v) => setRemoteIcons(v === "1"))
      .catch(() => {});
  }, []);

  const add = async () => {
    if (!label.trim() || !url.trim()) return;
    const normalized = url.startsWith("http") ? url : `https://${url}`;
    const created = await api.createLink(label.trim(), normalized, "");
    if (!created?.id) {
      toast(t.common?.error || "Erreur", "error");
      return;
    }
    setLabel("");
    setUrl("");
    setOpen(false);
    toast(t.common?.success ? (t.common.success + " — lien") : "Lien ajouté", "success");
    window.dispatchEvent(new CustomEvent("eu:quicklinks-changed"));
    refresh();
  };

  return (
    <Section
      title={t.tools?.quickLinks || "Liens rapides"}
      action={
        <button onClick={() => setOpen(true)} className="eu-btn-ghost eu-btn-sm">
          <PlusIcon className="w-3.5 h-3.5" /> {t.common?.add || "Ajouter"}
        </button>
      }
    >
      <Panel>
        {links.length === 0 ? (
          <EmptyState
            icon={<LinkIcon className="w-4 h-4" />}
            title={t.tools?.noQuickLinks || "Aucun lien rapide"}
            hint={get(
              "tools.noQuickLinksHint",
              "Ajoutez les adresses que vous ouvrez tous les jours : Pronote, l'ENT, un manuel en ligne. Elles apparaissent aussi sur le tableau de bord."
            )}
            action={
              <button onClick={() => setOpen(true)} className="eu-btn-primary eu-btn-sm">
                <PlusIcon className="w-3.5 h-3.5" /> {t.common?.newLink || "Nouveau lien"}
              </button>
            }
          />
        ) : (
          <div className="eu-divide">
            {links.map((l) => (
              <div key={l.id} className="eu-row-hover group">
                <button
                  onClick={() => api.openUrl(l.url)}
                  className="flex items-center gap-2.5 flex-1 min-w-0 text-left"
                  title={l.url}
                >
                  <Favicon url={l.url} className="w-5 h-5 text-[10px]" remote={remoteIcons} />
                  <span className="eu-t-body text-ink truncate">{l.label}</span>
                  <span className="eu-t-meta truncate hidden sm:inline">{l.url}</span>
                </button>
                <button
                  onClick={async () => {
                    const ok = await confirmDlg.ask({
                      title: get("common.delete", "Supprimer"),
                      message: fmt(get("tools.confirmDeleteLink", "Supprimer le lien « {name} » ?"), {
                        name: l.label,
                      }),
                      confirmLabel: get("common.delete", "Supprimer"),
                      danger: true,
                    });
                    if (!ok) return;
                    await api.deleteLink(l.id);
                    window.dispatchEvent(new CustomEvent("eu:quicklinks-changed"));
                    refresh();
                  }}
                  aria-label={`${get("common.delete", "Supprimer")} — ${l.label}`}
                  title={get("common.delete", "Supprimer")}
                  className="eu-row-actions eu-btn-quiet eu-btn-icon eu-btn-sm hover:text-danger"
                >
                  <TrashIcon className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Modal open={open} onClose={() => setOpen(false)} title={t.common?.newLink || "Nouveau lien"}>
        <div className="flex flex-col gap-3.5">
          <Field label={get("tools.linkName", "Nom")} htmlFor="link-label">
            <input
              id="link-label"
              autoFocus
              className="eu-input"
              placeholder={t.tools?.linkNamePlaceholder || "Nom (ex : Manuel en ligne)"}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </Field>
          <Field label={get("tools.linkUrl", "Adresse")} htmlFor="link-url">
            <input
              id="link-url"
              className="eu-input"
              placeholder={t.tools?.linkUrlPlaceholder || "Adresse (ex : eduscol.education.fr)"}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
            />
          </Field>
          <div className="flex justify-end gap-2 mt-1">
            <button className="eu-btn-ghost" onClick={() => setOpen(false)}>
              {t.common?.cancel || "Annuler"}
            </button>
            <button className="eu-btn-primary" onClick={add} disabled={!label.trim() || !url.trim()}>
              {t.common?.add || "Ajouter"}
            </button>
          </div>
        </div>
      </Modal>
    </Section>
  );
}
