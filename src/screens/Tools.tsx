import { useEffect, useState } from "react";
import { api, type QuickLink } from "../lib/api";
import { t } from "../lib/i18n";
import { EmptyState, Modal, SectionHeader, useToast } from "../components/ui";
import {
  CoffeeIcon,
  LinkIcon,
  PlusIcon,
  TrashIcon,
} from "../components/icons";
import { Favicon } from "../components/Favicon";

export default function Tools() {
  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="font-display-sm text-display-sm tracking-tight text-primary">{t.nav.tools}</h1>
        <p className="text-body-mute text-sm mt-1">Tout ce qui rend la classe plus fluide.</p>
      </header>

      <KeepAwakeCard />

      <LinksCard />
    </div>
  );
}

function KeepAwakeCard() {
  const toast = useToast();
  const [on, setOn] = useState(true); // default on (matches backend startup default)

  useEffect(() => {
    api.keepAwakeStatus().then(setOn).catch(() => {});
  }, []);

  const toggle = async () => {
    const next = await api.setKeepAwake(!on);
    setOn(next);
    toast(next ? t.tools?.keepAwakeOn || "L'écran reste allumé" : t.tools?.keepAwakeOff || "Verrouillage écran normal", next ? "success" : "info");
  };

  return (
    <section>
      <SectionHeader title={t.tools?.keepAwake || "Ne pas verrouiller l'écran"} />
      <button
        onClick={toggle}
        className={`new-card w-full p-5 flex items-center gap-4 text-left transition-all duration-150 hover:border-tui-accent/40`}
      >
        <span
          className={`grid place-items-center w-12 h-12 rounded-[12px] transition-colors ${
            on ? "bg-tui-accent text-primary" : "bg-surface-container text-tui-accent"
          }`}
        >
          <CoffeeIcon className="w-6 h-6" />
        </span>
        <div className="flex-1">
          <p className="font-semibold text-primary">{on ? (t.tools?.keepAwakeOn || "L'écran reste allumé") : (t.tools?.keepAwakeOff || "Verrouillage écran normal")}</p>
          <p className="text-body-mute text-sm">L'écran ne se verrouille pas pendant le cours.</p>
        </div>
        <span
          className={`relative w-12 h-7 rounded-full transition-colors ${
            on ? "bg-tui-accent" : "bg-surface-container"
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
    <section>
      <SectionHeader
        title={t.tools?.quickLinks || "Liens rapides"}
        action={
          <button onClick={() => setOpen(true)} className="new-btn-ghost py-1.5 px-2.5 text-xs">
            <PlusIcon className="w-4 h-4" /> {t.common?.add || "Ajouter"}
          </button>
        }
      />
      {links.length === 0 ? (
        <div className="new-card p-5">
          <EmptyState icon={<LinkIcon className="w-8 h-8" />} title={t.tools?.noQuickLinks || "Aucun lien rapide"} />
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {links.map((l) => (
            <div key={l.id} className="new-card p-4 flex items-center gap-3 group">
              <button onClick={() => api.openUrl(l.url)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                <Favicon url={l.url} className="w-5 h-5" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-primary truncate">{l.label}</p>
                  <p className="text-[11px] text-body-mute truncate">{l.url}</p>
                </div>
              </button>
              <button
                onClick={async () => {
                  await api.deleteLink(l.id);
                  window.dispatchEvent(new CustomEvent("eu:quicklinks-changed"));
                  refresh();
                }}
                className="opacity-0 group-hover:opacity-100 text-body-mute hover:text-red-500 transition-all duration-150"
              >
                <TrashIcon className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={t.common?.newLink || "Nouveau lien"}>
        <div className="flex flex-col gap-3">
          <input
            autoFocus
            className="new-input"
            placeholder={t.tools?.linkNamePlaceholder || "Nom (ex : Manuel en ligne)"}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <input
            className="new-input"
            placeholder={t.tools?.linkUrlPlaceholder || "Adresse (ex : eduscol.education.fr)"}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
          <div className="flex justify-end gap-2 mt-1">
            <button className="new-btn-ghost" onClick={() => setOpen(false)}>
              {t.common?.cancel || "Annuler"}
            </button>
            <button className="new-btn-primary" onClick={add}>
              {t.common?.add || "Ajouter"}
            </button>
          </div>
        </div>
      </Modal>
    </section>
  );
}
