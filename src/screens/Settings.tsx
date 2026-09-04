import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import {
  api,
  isTauri,
  type AppInfo,
  type Course,
  type PronoteStatus,
  type ScheduleEntry,
} from "../lib/api";
import { t, fmt, get } from "../lib/i18n";
import {
  checkForAppUpdate,
  dismissAvailableUpdate,
  installErrorMessage,
  installPendingUpdate,
  isIncompleteUpdateManifest,
  isNoPublishedUpdate,
  updaterSupported,
  type AppUpdateInfo,
} from "../lib/updater";
import { DAY_LABELS, isoDayOfWeek } from "../lib/format";

import { EmptyState, Modal, useToast, useConfirm } from "../components/ui";
import { Field, MetaDot, PageHeader, Panel, Section, Segmented } from "../components/layout";
import {
  ArchiveIcon,
  CheckIcon,
  MoonIcon,
  PlusIcon,
  QrIcon,
  SunIcon,
  TrashIcon,
} from "../components/icons";
import { useTabs } from "../lib/tabs";
import { useAppearance } from "../lib/theme";

export default function Settings({ info }: { info: AppInfo | null }) {
  return (
    <>
      <PageHeader
        title={t.nav.settings}
        meta={
          <>
            <span>{get("settings.metaAppearance", "Apparence")}</span>
            <MetaDot />
            <span>Pronote</span>
            <MetaDot />
            <span>{get("settings.scheduleTitle", "Emploi du temps")}</span>
            <MetaDot />
            <span>{get("settings.dataDirTitle", "Stockage")}</span>
          </>
        }
      />

      <AppearanceSection />
      <PronoteSection />
      <ScheduleSection />
      <TabsSection />
      <DataStorageSection info={info} />
      <AboutSection info={info} />
    </>
  );
}

// Appearance: theme, density, site icons and the end-of-class notice.
// Projection lives on the sidebar (next to Réglages), not here.

function AppearanceSection() {
  const { pref, setPref, density, setDensity } = useAppearance();
  const [remoteIcons, setRemoteIcons] = useState(true);
  const [endNotice, setEndNotice] = useState<"off" | "toast" | "sound">("toast");
  const [endLead, setEndLead] = useState(5);

  useEffect(() => {
    api
      .getSetting("remote_favicons")
      .then((v) => {
        if (v == null) {
          api.setSetting("remote_favicons", "1").catch(() => {});
          window.dispatchEvent(new CustomEvent("eu:settings-changed"));
          setRemoteIcons(true);
        } else {
          setRemoteIcons(v !== "0");
        }
      })
      .catch(() => {});
    api
      .getSetting("class_end_notice")
      .then((v) => {
        if (v === "off" || v === "toast" || v === "sound") setEndNotice(v);
      })
      .catch(() => {});
    api
      .getSetting("class_end_lead")
      .then((v) => {
        const n = v ? parseInt(v, 10) : NaN;
        if (!Number.isNaN(n) && n >= 1 && n <= 15) setEndLead(n);
      })
      .catch(() => {});
  }, []);

  const persist = (key: string, value: string) => {
    api.setSetting(key, value).catch(() => {});
    window.dispatchEvent(new CustomEvent("eu:settings-changed"));
  };

  return (
    <Section title={get("settings.metaAppearance", "Apparence")}>
      <Panel pad>
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <p className="eu-t-body font-medium text-ink">{get("appearance.theme", "Thème")}</p>
              <p className="eu-t-meta">
                {get("appearance.themeHint", "« Auto » suit le réglage clair/sombre du système.")}
              </p>
            </div>
            <Segmented
              value={pref}
              onChange={setPref}
              label={get("appearance.theme", "Thème")}
              options={[
                { value: "auto", label: get("appearance.auto", "Auto") },
                {
                  value: "light",
                  label: (
                    <span className="flex items-center gap-1.5">
                      <SunIcon className="w-3.5 h-3.5" />
                      {get("appearance.light", "Clair")}
                    </span>
                  ),
                },
                {
                  value: "dark",
                  label: (
                    <span className="flex items-center gap-1.5">
                      <MoonIcon className="w-3.5 h-3.5" />
                      {get("appearance.dark", "Sombre")}
                    </span>
                  ),
                },
              ]}
            />
          </div>

          <div className="flex items-center justify-between gap-4 flex-wrap border-t border-line pt-4">
            <div className="min-w-0">
              <p className="eu-t-body font-medium text-ink">{get("appearance.density", "Densité")}</p>
              <p className="eu-t-meta">
                {get(
                  "appearance.densityHint",
                  "« Compact » resserre pages, boutons et listes. « Confortable » les aère."
                )}
              </p>
            </div>
            <Segmented
              value={density}
              onChange={setDensity}
              label={get("appearance.density", "Densité")}
              options={[
                { value: "comfortable", label: get("appearance.comfortable", "Confortable") },
                { value: "compact", label: get("appearance.compact", "Compact") },
              ]}
            />
          </div>

          <div className="flex items-center justify-between gap-4 flex-wrap border-t border-line pt-4">
            <div className="min-w-0">
              <p className="eu-t-body font-medium text-ink">
                {get("classEnd.title", "Fin de cours annoncée")}
              </p>
              <p className="eu-t-meta max-w-[62ch]">
                {get(
                  "classEnd.hint",
                  "Un rappel discret avant la sonnerie, d'après l'emploi du temps, pour boucler l'activité et donner le travail à faire."
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {endNotice !== "off" && (
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min={1}
                    max={15}
                    value={endLead}
                    onChange={(e) => {
                      const n = Math.max(1, Math.min(15, parseInt(e.target.value, 10) || 1));
                      setEndLead(n);
                      persist("class_end_lead", String(n));
                    }}
                    aria-label={get("classEnd.lead", "Minutes avant la fin")}
                    className="eu-input w-16 text-center tabular-nums"
                  />
                  <span className="eu-t-meta">min</span>
                </div>
              )}
              <Segmented
                value={endNotice}
                onChange={(v) => {
                  setEndNotice(v);
                  persist("class_end_notice", v);
                }}
                label={get("classEnd.title", "Fin de cours annoncée")}
                options={[
                  { value: "off", label: get("classEnd.off", "Aucune") },
                  { value: "toast", label: get("classEnd.silent", "Silencieuse") },
                  { value: "sound", label: get("classEnd.sound", "Sonnerie") },
                ]}
              />
            </div>
          </div>

          <label className="flex items-start gap-2.5 border-t border-line pt-4 cursor-pointer">
            <input
              type="checkbox"
              className="accent-accent mt-0.5"
              checked={remoteIcons}
              onChange={(e) => {
                setRemoteIcons(e.target.checked);
                persist("remote_favicons", e.target.checked ? "1" : "0");
                window.dispatchEvent(new CustomEvent("eu:quicklinks-changed"));
              }}
            />
            <span className="min-w-0">
              <span className="eu-t-body font-medium text-ink block">
                {get("appearance.remoteIcons", "Icônes de sites distantes")}
              </span>
              <span className="eu-t-meta block">
                {get(
                  "appearance.remoteIconsHint",
                  "Décoché, Euclide dessine les icônes de liens localement et n'émet aucune requête réseau. Coché, il télécharge les favicons réels."
                )}
              </span>
            </span>
          </label>
        </div>
      </Panel>
    </Section>
  );
}

// Data storage root (the folder containing EVERYTHING: db, documents, courses files, whiteboards, python scripts).
// The choice is stored in a small euclide-data.json next to the exe so the USB setup remains self-contained.
// Changing the folder requires a restart (DB and caches are bound at launch).

function DataStorageSection({ info }: { info: AppInfo | null }) {
  const toast = useToast();
  const confirmDlg = useConfirm();
  const [busy, setBusy] = useState(false);

  const current = info?.data_dir || "";

  const choose = async () => {
    setBusy(true);
    try {
      const p = await api.chooseDataDir();
      if (p) {
        toast(
          "Dossier de stockage sélectionné. Redémarrez Euclide pour utiliser le nouveau dossier (toute la DB, fichiers, scripts…).",
          "success"
        );
      }
    } catch {
      toast(get("settings.pickFolderError", "Impossible de sélectionner le dossier"), "error");
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    const ok = await confirmDlg.ask({
      title: get("settings.resetTitle", "Dossier de stockage"),
      message: "Revenir au dossier par défaut (Euclide-Data à côté de l'exécutable) ?",
      confirmLabel: get("common.done", "Terminé"),
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api.resetDataDir();
      toast(get("settings.resetSuccess", "Configuration réinitialisée. Redémarrez Euclide pour appliquer."), "success");
    } catch {
      toast(get("settings.resetError", "Erreur lors de la réinitialisation"), "error");
    } finally {
      setBusy(false);
    }
  };

  const backup = async () => {
    setBusy(true);
    try {
      toast(get("settings.backupRunning", "Sauvegarde en cours…"), "info");
      const path = await api.backupDataDir();
      toast(fmt(get("settings.backupDone", "Sauvegarde créée : {path}"), { path }), "success");
    } catch (err) {
      toast(
        typeof err === "string" && err ? err : get("settings.backupError", "Sauvegarde impossible"),
        "error"
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title={t.settings?.dataDirTitle || "Dossier de stockage"}>
      <Panel pad>
        <Field
          label={get("settings.dataDirLabel", "Emplacement des données")}
          hint={
            t.settings?.dataDirHint ||
            "Parfait pour une clé USB : choisissez un dossier sur la clé. Le pointeur (euclide-data.json) reste à côté de l'exécutable. Un redémarrage est nécessaire après tout changement. Aucune migration automatique : copiez les anciens fichiers si besoin."
          }
        >
          <p className="eu-panel-alt rounded px-2.5 py-2 font-mono text-[12px] text-ink-muted break-all selectable">
            {current || get("settings.dataDirUnknown", "(chemin inconnu)")}
          </p>
        </Field>

        <div className="flex flex-wrap gap-2 mt-3.5">
          <button onClick={choose} disabled={busy} className="eu-btn-ghost eu-btn-sm">
            {get("settings.pickFolder", "Choisir un dossier…")}
          </button>
          <button onClick={reset} disabled={busy} className="eu-btn-quiet eu-btn-sm">
            {get("settings.resetFolder", "Réinitialiser (par défaut)")}
          </button>
        </div>

        <div className="border-t border-line mt-4 pt-4 flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <p className="eu-t-body font-medium text-ink">
              {get("settings.backupTitle", "Sauvegarde")}
            </p>
            <p className="eu-t-meta max-w-[62ch]">
              {get(
                "settings.backupHint",
                "Crée une archive .zip horodatée de tout le dossier de données, à côté de celui-ci. Sur une clé USB qui vit dans une poche, c'est une assurance élémentaire."
              )}
            </p>
          </div>
          <button onClick={backup} disabled={busy} className="eu-btn-ghost eu-btn-sm">
            <ArchiveIcon className="w-3.5 h-3.5" />
            {get("settings.backupNow", "Sauvegarder maintenant")}
          </button>
        </div>
      </Panel>
    </Section>
  );
}

// Pronote

type LoginMethod = "qr" | "direct";

function pronoteErrorMessage(err: unknown): string {
  let raw = "";
  if (typeof err === "string") raw = err;
  else if (err && typeof err === "object" && "message" in err) {
    raw = String((err as { message: unknown }).message);
  }
  return raw.replace(/^"+|"+$/g, "");
}

function PronoteSection() {
  const toast = useToast();
  const [status, setStatus] = useState<PronoteStatus | null>(null);
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<LoginMethod>("qr");
  const [busy, setBusy] = useState(false);

  // QR
  const [qrJson, setQrJson] = useState("");
  const [pin, setPin] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // direct
  const [url, setUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [pinCode, setPinCode] = useState("");
  const [needsPin, setNeedsPin] = useState(false);

  const refresh = () => api.pronoteStatus().then(setStatus).catch(() => {});
  useEffect(() => {
    refresh();
  }, []);

  const decodeImage = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(data.data, data.width, data.height);
        if (code) {
          setQrJson(code.data);
          toast(t.settings?.toastQrRead || "QR code lu avec succès", "success");
        } else {
          toast(t.settings?.toastQrFail || "QR code illisible, réessayez", "error");
        }
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  const connectQr = async () => {
    if (!qrJson.trim() || pin.length < 4) {
      toast(t.settings?.toastMissingQrPin || "QR code et code PIN requis", "error");
      return;
    }
    setBusy(true);
    try {
      const s = await api.pronoteQrLogin(qrJson.trim(), pin.trim());
      await finishConnect(s);
    } catch (err) {
      toast(pronoteErrorMessage(err) || (t.settings?.toastConnectFail || "Connexion Pronote impossible"), "error");
    } finally {
      setBusy(false);
    }
  };

  const connectDirect = async () => {
    if (!url.trim() || !username.trim() || !password) {
      toast(t.settings?.toastMissingDirect || "URL, identifiant et mot de passe requis", "error");
      return;
    }
    setBusy(true);
    try {
      const s = await api.pronotePasswordLogin(url.trim(), username.trim(), password, pinCode.trim() || undefined);
      await finishConnect(s);
    } catch (err) {
      const msg = pronoteErrorMessage(err);
      if (msg.startsWith("NEEDS_PIN:")) {
        setNeedsPin(true);
        toast(msg.slice("NEEDS_PIN:".length) || "Code PIN requis pour cet appareil. Saisissez-le ci-dessous.", "error");
      } else {
        toast(msg || (t.settings?.toastConnectFail || "Connexion impossible"), "error");
      }
    } finally {
      setBusy(false);
    }
  };

  const finishConnect = async (s: PronoteStatus | null) => {
    if (!s) {
      toast(t.settings?.toastConnectFailed || "Connexion échouée, vérifiez vos informations", "error");
      return;
    }
    setStatus(s);
    if (s.connected) {
      toast(t.settings?.toastConnected || "Connecté à Pronote", "success");
      setOpen(false);
      setQrJson("");
      setPin("");
      setPassword("");
      setPinCode("");
      setNeedsPin(false);
      // Small delay to let the QR token settle before sync (token rotation race)
      await new Promise((r) => setTimeout(r, 800));
      try {
        toast(t.settings?.toastSyncing || "Synchronisation…", "info");
        const n = await api.pronoteSync();
        window.dispatchEvent(new CustomEvent("eu:schedule-changed"));
        toast(fmt(t.settings?.toastSyncCount || "{count} cours synchronisés", { count: n }), "success");
      } catch {
        // Token may have rotated — retry once after a short wait
        try {
          await new Promise((r) => setTimeout(r, 1500));
          const n2 = await api.pronoteSync();
          window.dispatchEvent(new CustomEvent("eu:schedule-changed"));
          toast(fmt(t.settings?.toastSyncCount || "{count} cours synchronisés", { count: n2 }), "success");
        } catch {
          // Sync failed but login itself worked — user can manually sync later
          toast(t.settings?.toastSyncFail || "Synchronisation impossible (réessayez manuellement)", "error");
        }
      }
      refresh();
    } else {
      toast(t.settings?.toastConnectFailed || "Connexion échouée, vérifiez vos informations", "error");
    }
  };

  const sync = async () => {
    setBusy(true);
    try {
      toast(t.settings?.toastSyncing || "Synchronisation…", "info");
      const n = await api.pronoteSync();
      window.dispatchEvent(new CustomEvent("eu:schedule-changed"));
      toast(fmt(t.settings?.toastSyncCount || "{count} cours synchronisés", { count: n }), "success");
    } catch (err) {
      toast(typeof err === "string" ? err : (t.settings?.toastSyncFail || "Synchronisation impossible"), "error");
    } finally {
      setBusy(false);
      refresh();
    }
  };

  return (
    <Section title={get("settings.pronoteTitle", "Pronote")}>
      <Panel pad>
        <div className="flex items-center gap-3.5 flex-wrap">
          <span
            className={`grid place-items-center w-9 h-9 shrink-0 rounded border ${
              status?.connected
                ? "bg-ok-soft border-ok/25 text-ok"
                : "bg-panel-alt border-line text-ink-muted"
            }`}
          >
            {status?.connected ? <CheckIcon className="w-4 h-4" /> : <QrIcon className="w-4 h-4" />}
          </span>
          <div className="flex-1 min-w-[24ch]">
            <p className="eu-t-body font-medium text-ink">
              {status?.connected ? fmt(t.settings?.connectedAs || "Connecté - {name}", { name: status.account_name ?? "" }) : (t.settings?.notConnected || "Non connecté")}
            </p>
            <p className="eu-t-meta">
              {status?.connected
                ? status.last_sync
                  ? fmt(t.settings?.lastSync || "Dernière synchro : {date}", { date: status.last_sync })
                  : (t.settings?.readyToSync || "Prêt à synchroniser")
                : (t.settings?.pronoteHelp || "Comme votre établissement utilise un ENT, la connexion se fait par QR code, sans saisir de mot de passe.")}
            </p>
          </div>
          {status?.connected ? (
            <div className="flex gap-2 shrink-0">
              <button onClick={sync} disabled={busy} className="eu-btn-ghost eu-btn-sm">
                {busy ? "…" : get("settings.sync", "Synchroniser")}
              </button>
              <button
                onClick={async () => {
                  await api.pronoteLogout();
                  window.dispatchEvent(new CustomEvent("eu:pronote-changed"));
                  refresh();
                }}
                className="eu-btn-quiet eu-btn-sm"
              >
                {get("settings.disconnect", "Déconnecter")}
              </button>
            </div>
          ) : (
            <button onClick={() => setOpen(true)} className="eu-btn-primary eu-btn-sm shrink-0">
              {t.common?.connect || "Connecter"}
            </button>
          )}
        </div>
      </Panel>

      <Modal open={open} onClose={() => setOpen(false)} title={get("settings.pronoteTitle", "Pronote")} width="max-w-xl">
        <div className="flex flex-col gap-4">
          <Segmented
            grow
            value={method}
            onChange={setMethod}
            label={get("settings.pronoteTitle", "Pronote")}
            options={[
              { value: "qr", label: get("settings.qrMethod", "QR code (ENT)") },
              { value: "direct", label: get("settings.idMethod", "Identifiants") },
            ]}
          />

          {method === "qr" ? (
            <>
              <ol className="text-sm text-ink-muted flex flex-col gap-1.5 list-decimal list-inside">
                <li>Application mobile Pronote : Mon compte &gt; Generer un QR code.</li>
                <li>Choisissez un code PIN a 4 chiffres (a retenir).</li>
                <li>Importez la capture d'ecran du QR code ci-dessous.</li>
                <li>Le QR code n'est valable que 10 minutes.</li>
              </ol>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && decodeImage(e.target.files[0])}
              />
              <button onClick={() => fileRef.current?.click()} className="eu-btn-ghost justify-center py-3">
                <QrIcon className="w-5 h-5" /> Importer l'image du QR code
              </button>
              {qrJson && (
                <p className="eu-chip w-fit">
                  <CheckIcon className="w-3.5 h-3.5" /> QR code charge
                </p>
              )}
              <div>
                <p className="text-ink-muted text-sm mb-1.5">Code PIN (4 chiffres)</p>
                <input
                  className="eu-input tracking-[0.5em] text-center text-lg"
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="----"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                />
              </div>
              <div className="flex justify-end gap-2">
                <button className="eu-btn-ghost" onClick={() => setOpen(false)}>
                  {t.common?.cancel || "Annuler"}
                </button>
                <button className="eu-btn-primary" onClick={connectQr} disabled={busy}>
                  {busy ? "Connexion..." : (t.common?.connect || "Connecter")}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-ink-muted text-sm">
                Connexion directe par identifiant et mot de passe (comptes hors ENT, ou demonstration).
              </p>
              <input
                className="eu-input"
                placeholder="Adresse Pronote (https://...)"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
              <input
                className="eu-input"
                placeholder="Identifiant"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
              <input
                className="eu-input"
                type="password"
                placeholder="Mot de passe"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {/* PIN field: shown when the account requires it (auto-detected) or expandable */}
              {needsPin ? (
                <div className="border border-accent/30 rounded p-3 bg-panel-alt/50">
                  <p className="text-sm font-medium text-ink mb-1.5">Code PIN du compte</p>
                  <p className="text-ink-muted text-xs mb-2">Votre compte Pronote exige un code PIN pour les nouveaux appareils.</p>
                  <input
                    className="eu-input tracking-[0.5em] text-center text-lg"
                    inputMode="numeric"
                    maxLength={8}
                    placeholder="1234"
                    value={pinCode}
                    onChange={(e) => setPinCode(e.target.value.replace(/\D/g, ""))}
                    autoFocus
                  />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setNeedsPin(true)}
                  className="text-xs text-ink-muted hover:text-ink transition-colors text-left"
                >
                  + Code PIN du compte (optionnel)
                </button>
              )}
              <div className="flex justify-end gap-2">
                <button className="eu-btn-ghost" onClick={() => setOpen(false)}>
                  {t.common?.cancel || "Annuler"}
                </button>
                <button className="eu-btn-primary" onClick={connectDirect} disabled={busy}>
                  {busy ? "Connexion..." : (t.common?.connect || "Connecter")}
                </button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </Section>
  );
}

// Schedule: week grid, manual entries + read-only Pronote entries

function ScheduleSection() {
  const toast = useToast();
  const [entries, setEntries] = useState<ScheduleEntry[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Partial<ScheduleEntry>>({
    day_of_week: 1,
    start_time: "08:00",
    end_time: "09:00",
    subject: "",
    room: "",
  });

  const refresh = () => api.listSchedule().then((e) => setEntries(Array.isArray(e) ? e : [])).catch(() => {});
  useEffect(() => {
    refresh();
    api.listCourses().then((c) => setCourses(Array.isArray(c) ? c : [])).catch(() => {});
  }, []);

  const save = async () => {
    if (!form.subject?.trim()) return;
    try {
      const saved = await api.saveScheduleEntry({ ...form, source: "manual" });
      if (!saved?.id) {
        toast(get("messages.genericError", "Erreur"), "error");
        return;
      }
      toast(t.settings?.toastScheduleAdded || "Cours ajouté à l'emploi du temps", "success");
      setOpen(false);
      setForm({ day_of_week: 1, start_time: "08:00", end_time: "09:00", subject: "", room: "" });
      window.dispatchEvent(new CustomEvent("eu:schedule-changed"));
      refresh();
    } catch {
      toast(get("messages.genericError", "Erreur"), "error");
    }
  };

  const byDay = (d: number) =>
    entries.filter((e) => e.day_of_week === d).sort((a, b) => a.start_time.localeCompare(b.start_time));

  const days = [1, 2, 3, 4, 5, 6].filter((d) => d !== 6 || byDay(6).length > 0);
  const todayIso = isoDayOfWeek();

  const remove = async (id: number) => {
    await api.deleteScheduleEntry(id);
    window.dispatchEvent(new CustomEvent("eu:schedule-changed"));
    refresh();
  };

  return (
    <Section
      title={get("settings.scheduleTitle", "Emploi du temps")}
      description={get("settings.scheduleWeek", "Vue de la semaine — les cours Pronote sont en lecture seule.")}
      action={
        <button onClick={() => setOpen(true)} className="eu-btn-ghost eu-btn-sm">
          <PlusIcon className="w-3.5 h-3.5" /> {t.common?.add || "Ajouter"}
        </button>
      }
    >
      {entries.length === 0 ? (
        <Panel>
          <EmptyState
            title={t.settings?.emptyScheduleTitle || "Emploi du temps vide"}
            hint={t.settings?.emptyScheduleHint || "Ajoutez vos cours à la main, ou synchronisez Pronote ci-dessus."}
            action={
              <button onClick={() => setOpen(true)} className="eu-btn-primary eu-btn-sm">
                <PlusIcon className="w-3.5 h-3.5" /> {t.common?.add || "Ajouter un cours"}
              </button>
            }
          />
        </Panel>
      ) : (
        <div className="eu-panel overflow-x-auto">
          <div className="flex min-w-[720px]">
            {days.map((d) => {
              const items = byDay(d);
              const isToday = d === todayIso;
              return (
                <div key={d} className="flex-1 min-w-[120px] border-r border-line last:border-r-0">
                  <div
                    className={`px-2.5 py-2 border-b border-line ${
                      isToday ? "bg-accent-soft" : "bg-panel-alt"
                    }`}
                  >
                    <p className={`eu-t-label ${isToday ? "text-accent" : ""}`}>{DAY_LABELS[d - 1]}</p>
                  </div>
                  <div className="p-1.5 flex flex-col gap-1.5 min-h-[92px]">
                    {items.length === 0 ? (
                      <p className="eu-t-meta px-1 pt-1 opacity-60">—</p>
                    ) : (
                      items.map((e) => (
                        <div
                          key={e.id}
                          className="group rounded border border-line bg-panel px-2 py-1.5 relative"
                          title={`${e.subject}${e.room ? ` · ${e.room}` : ""}`}
                        >
                          <p className="font-mono text-[10.5px] tabular-nums text-ink-faint">
                            {e.start_time}–{e.end_time}
                          </p>
                          <p className="eu-t-meta text-ink font-medium truncate mt-0.5">{e.subject}</p>
                          {e.room && <p className="eu-t-label mt-1 normal-case">{e.room}</p>}
                          {e.source === "pronote" ? (
                            <span
                              className="absolute top-1 right-1 font-mono text-[9px] text-ink-faint"
                              title={get("settings.fromPronote", "Depuis Pronote")}
                            >
                              P
                            </span>
                          ) : (
                            <button
                              onClick={() => void remove(e.id)}
                              aria-label={`${get("common.delete", "Supprimer")} — ${e.subject}`}
                              title={get("common.delete", "Supprimer")}
                              className="absolute top-0.5 right-0.5 w-6 h-6 grid place-items-center rounded-sm text-ink-faint opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-danger hover:bg-danger-soft transition-opacity duration-fast"
                            >
                              <TrashIcon className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={t.settings?.addCourseModalTitle || "Ajouter un cours"}>
        <div className="flex flex-col gap-3">
          <input
            autoFocus
            className="eu-input"
            placeholder={t.settings?.subjectPlaceholder || "Matière (ex : Mathématiques 4e B)"}
            value={form.subject ?? ""}
            onChange={(e) => setForm({ ...form, subject: e.target.value })}
          />
          <div className="grid grid-cols-3 gap-2">
            <select
              className="eu-input"
              value={form.day_of_week}
              onChange={(e) => setForm({ ...form, day_of_week: Number(e.target.value) })}
            >
              {DAY_LABELS.slice(0, 6).map((label, i) => (
                <option key={label} value={i + 1}>
                  {label}
                </option>
              ))}
            </select>
            <input
              type="time"
              className="eu-input"
              value={form.start_time}
              onChange={(e) => setForm({ ...form, start_time: e.target.value })}
            />
            <input
              type="time"
              className="eu-input"
              value={form.end_time}
              onChange={(e) => setForm({ ...form, end_time: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              className="eu-input"
              placeholder={t.settings?.roomOptional || "Salle (optionnel)"}
              value={form.room ?? ""}
              onChange={(e) => setForm({ ...form, room: e.target.value })}
            />
            <select
              className="eu-input"
              value={form.course_id ?? ""}
              onChange={(e) => setForm({ ...form, course_id: e.target.value ? Number(e.target.value) : null })}
            >
              <option value="">Lier un cours...</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2 mt-1">
            <button className="eu-btn-ghost" onClick={() => setOpen(false)}>
              {t.common?.cancel || "Annuler"}
            </button>
            <button className="eu-btn-primary" onClick={save} disabled={!form.subject?.trim()}>
              {t.common?.add || "Ajouter"}
            </button>
          </div>
        </div>
      </Modal>
    </Section>
  );
}

// Tabs (max tabs limit)

function TabsSection() {
  const tabsCtx = useTabs();
  const MIN = 3;
  const MAX = 25;
  const mode = tabsCtx.maxTabsMode;
  const sliderVal = Math.max(MIN, Math.min(MAX, tabsCtx.maxTabsFixed));
  const chip =
    mode === "unlimited"
      ? get("settings.maxTabsUnlimited", "Illimité").toUpperCase()
      : mode === "auto"
        ? `${get("settings.maxTabsAutoChip", "AUTO")} · ${tabsCtx.tabFitCapacity || "…"}`
        : `${tabsCtx.maxTabs} MAX`;

  return (
    <Section title={t.settings?.tabsTitle || "Onglets"} action={<span className="eu-chip">{chip}</span>}>
      <Panel pad>
        <div className="flex flex-col gap-3">
          <Segmented
            grow
            value={mode}
            onChange={(next) => tabsCtx.setMaxTabsMode(next, sliderVal)}
            label={get("settings.tabsTitle", "Onglets")}
            options={[
              { value: "auto", label: get("settings.maxTabsAuto", "Automatique") },
              { value: "fixed", label: get("settings.maxTabsFixed", "Nombre fixe") },
              { value: "unlimited", label: get("settings.maxTabsUnlimited", "Illimité") },
            ]}
          />

          {mode === "auto" && (
            <p className="eu-t-meta leading-snug">
              {fmt(
                get(
                  "settings.maxTabsAutoHint",
                  "Autant d'onglets que la barre peut afficher sans défiler. Actuellement : {count}."
                ),
                { count: tabsCtx.tabFitCapacity || "…" }
              )}
            </p>
          )}

          {mode === "fixed" && (
            <div>
              <div className="flex items-baseline justify-between text-sm mb-1.5">
                <span className="font-medium text-ink">
                  {t.settings?.maxTabsLabel || "Nombre maximum d'onglets"}
                </span>
                <span className="font-mono tabular-nums text-ink text-lg leading-none">{sliderVal}</span>
              </div>
              <input
                type="range"
                min={MIN}
                max={MAX}
                step={1}
                value={sliderVal}
                onChange={(e) => tabsCtx.setMaxTabsMode("fixed", parseInt(e.target.value, 10))}
                className="w-full accent-accent cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-ink-muted mt-0.5 font-mono tabular-nums">
                <span>{MIN}</span>
                <span>{MAX}</span>
              </div>
              <p className="eu-t-meta mt-2 leading-snug">
                {t.settings?.maxTabsHint ||
                  "Lorsque la limite est atteinte, l’onglet le plus ancien (non actif) est automatiquement fermé à l’ouverture d’un nouveau."}
              </p>
            </div>
          )}

          {mode === "unlimited" && (
            <p className="eu-t-meta leading-snug">
              {t.settings?.maxTabsDisabledHint ||
                "Vous pouvez ouvrir autant d’onglets que vous voulez (le + dans la barre d’onglets reste toujours actif)."}
            </p>
          )}
        </div>
        <p className="eu-t-meta mt-3 pt-3 border-t border-line leading-snug">
          {get(
            "settings.pinHint",
            "Astuce : double-cliquez sur un onglet pour l’épingler — un onglet épinglé n’est jamais fermé automatiquement, et il se réordonne par glisser-déposer."
          )}
        </p>
      </Panel>
    </Section>
  );
}

// About

function AboutSection({ info }: { info: AppInfo | null }) {
  const toast = useToast();
  const confirmDlg = useConfirm();
  const [status, setStatus] = useState<
    | "idle"
    | "checking"
    | "upToDate"
    | "publishing"
    | "available"
    | "installing"
    | "installed"
    | "error"
  >("idle");
  const [update, setUpdate] = useState<AppUpdateInfo | null>(null);
  const [error, setError] = useState("");
  const [percent, setPercent] = useState<number | null>(null);

  const runCheck = async (quiet: boolean) => {
    if (!updaterSupported()) return;
    setStatus("checking");
    setError("");
    try {
      const next = await checkForAppUpdate(!quiet);
      if (next) {
        setUpdate(next);
        setStatus("available");
        window.dispatchEvent(new CustomEvent("eu:update-available", { detail: next }));
      } else {
        setUpdate(null);
        setStatus("upToDate");
      }
    } catch (err) {
      if (isIncompleteUpdateManifest(err)) {
        setUpdate(null);
        setStatus("publishing");
        return;
      }
      if (isNoPublishedUpdate(err)) {
        setUpdate(null);
        setStatus("upToDate");
        return;
      }
      setStatus("error");
      setError(err instanceof Error ? err.message : String(err));
      if (!quiet) toast(get("updater.error", "Impossible de vérifier les mises à jour."), "error");
    }
  };

  useEffect(() => {
    if (!isTauri()) return;
    void runCheck(true);
    const onAvailable = (e: Event) => {
      const detail = (e as CustomEvent<AppUpdateInfo>).detail;
      if (!detail?.version) return;
      setUpdate(detail);
      setStatus("available");
    };
    window.addEventListener("eu:update-available", onAvailable);
    return () => window.removeEventListener("eu:update-available", onAvailable);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one quiet check on mount
  }, []);

  const install = async () => {
    if (!update) return;
    // The app has its own confirmation dialog; the native window.confirm()
    // that used to be here looked foreign inside the Tauri window.
    const ok = await confirmDlg.ask({
      title: get("updater.install", "Installer"),
      message: fmt(get("updater.confirmInstall", "Installer la version {version} ? Fermez ensuite Euclide, puis rouvrez-le."), {
        version: update.version,
      }),
      confirmLabel: get("updater.install", "Installer"),
    });
    if (!ok) return;
    setStatus("installing");
    setPercent(0);
    try {
      await installPendingUpdate(({ downloaded, contentLength }) => {
        if (contentLength && contentLength > 0) {
          setPercent(Math.min(100, Math.round((downloaded / contentLength) * 100)));
        }
      });
      dismissAvailableUpdate(update.version);
      setStatus("installed");
      toast(get("updater.installed", "Mise à jour installée. Fermez Euclide, puis rouvrez-le."), "success");
    } catch (err) {
      setStatus("error");
      const msg = installErrorMessage(err) || get("updater.installFailed", "Impossible d'installer la mise à jour.");
      setError(msg);
      toast(msg, "error");
    }
  };

  const statusLine =
    status === "checking"
      ? get("updater.checking", "Recherche…")
      : status === "upToDate"
        ? get("updater.upToDate", "Euclide est à jour.")
        : status === "publishing"
          ? get(
              "updater.publishing",
              "Publication encore en cours pour cette plateforme. Réessayez dans un moment."
            )
          : status === "available" && update
            ? fmt(get("updater.available", "Version {version} disponible (actuelle : {current})."), {
                version: update.version,
                current: update.currentVersion,
              })
            : status === "installing"
              ? fmt(get("updater.installing", "Téléchargement… {percent}\u202f%"), {
                  percent: percent ?? 0,
                })
              : status === "installed"
                ? get("updater.installed", "Mise à jour installée. Fermez Euclide, puis rouvrez-le.")
              : status === "error"
                ? error || get("updater.error", "Impossible de vérifier les mises à jour.")
                : "";

  return (
    <Section title={get("about.title", "À propos")}>
      <Panel pad>
        <div className="flex items-center gap-3.5">
          <img src="/euclide-logo.png" alt="" className="w-11 h-11 rounded object-contain" />
          <div className="min-w-0">
            <p className="eu-t-body font-medium text-ink">
              {t.appName} {info && <span className="text-ink-muted font-normal">v{info.version}</span>}
            </p>
            <p className="eu-t-meta">{t.madeBy}</p>
          </div>
        </div>

        {isTauri() && (
          <div className="border-t border-line mt-4 pt-4 flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void runCheck(false)}
                disabled={status === "checking" || status === "installing"}
                className="eu-btn-ghost eu-btn-sm"
              >
                {get("updater.check", "Vérifier les mises à jour")}
              </button>
              {(status === "available" || status === "installing") && (
                <button
                  type="button"
                  onClick={() => void install()}
                  disabled={status === "installing"}
                  className="eu-btn-primary eu-btn-sm"
                >
                  {get("updater.install", "Installer")}
                </button>
              )}
            </div>
            {statusLine && (
              <p className={`eu-t-meta leading-snug ${status === "error" ? "text-danger" : ""}`}>
                {statusLine}
              </p>
            )}
            {status === "available" && update?.body && (
              <p className="eu-t-meta leading-snug whitespace-pre-wrap">{update.body}</p>
            )}
            {status === "installing" && (
              <div className="eu-gauge">
                <i style={{ width: `${percent ?? 0}%` }} />
              </div>
            )}
            <p className="eu-t-meta leading-snug">
              {info?.windows_portable ? get("updater.hintPortable") : get("updater.hint")}
            </p>
          </div>
        )}
      </Panel>
    </Section>
  );
}
