import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import {
  api,
  type AppInfo,
  type Course,
  type PronoteStatus,
  type ScheduleEntry,
} from "../lib/api";
import { t, fmt, get } from "../lib/i18n";
import { DAY_LABELS } from "../lib/format";

import { EmptyState, Modal, SectionHeader, useToast } from "../components/ui";
import { CheckIcon, PlusIcon, QrIcon, TrashIcon } from "../components/icons";
import { useTabs } from "../lib/tabs";

export default function Settings({ info }: { info: AppInfo | null }) {
  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="font-display-sm text-display-sm tracking-tight text-primary">{t.nav.settings}</h1>
        <p className="text-mute text-sm mt-1">{t.settings?.subtitle || "Pronote, emploi du temps et onglets."}</p>
      </header>

      <TabsSection />
      <PronoteSection />
      <ScheduleSection />
      <DataStorageSection info={info} />
      <AboutSection info={info} />
    </div>
  );
}

// Data storage root (the folder containing EVERYTHING: db, documents, courses files, whiteboards, python scripts).
// The choice is stored in a small euclide-data.json next to the exe so the USB setup remains self-contained.
// Changing the folder requires a restart (DB and caches are bound at launch).

function DataStorageSection({ info }: { info: AppInfo | null }) {
  const toast = useToast();
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
    if (!confirm("Revenir au dossier par défaut (Euclide-Data à côté de l'exécutable) ?")) return;
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

  return (
    <section>
      <SectionHeader title={t.settings?.dataDirTitle || "Dossier de stockage"} />
      <div className="new-card p-4">
        <p className="text-sm mb-1 text-primary">Emplacement de toutes les données (base, documents, cours, tableaux, scripts Python) :</p>
        <p className="text-[11px] font-mono text-mute break-all selectable mb-3">{current || "(chemin inconnu)"}</p>

        <div className="flex flex-wrap gap-2">
          <button onClick={choose} disabled={busy} className="new-btn-ghost">
            Choisir un dossier…
          </button>
          <button onClick={reset} disabled={busy} className="new-btn-ghost text-mute">
            Réinitialiser (par défaut)
          </button>
        </div>

        <p className="text-[11px] text-mute mt-3 leading-snug">
          {t.settings?.dataDirHint ||
            "Parfait pour une clé USB : choisissez un dossier sur la clé. Le pointeur (euclide-data.json) reste à côté de l'exécutable. Un redémarrage est nécessaire après tout changement. Aucune migration automatique : copiez les anciens fichiers si besoin."}
        </p>
      </div>
    </section>
  );
}

// Pronote

type LoginMethod = "qr" | "direct";

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
    } catch {
      toast(t.settings?.toastConnectFail || "Connexion Pronote impossible", "error");
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
      const msg = typeof err === "string" ? err : "";
      // Detect PIN-required error from the backend
      if (msg.startsWith("NEEDS_PIN:")) {
        setNeedsPin(true);
        toast("Code PIN requis pour cet appareil. Saisissez-le ci-dessous.", "error");
      } else {
        toast(msg || (t.settings?.toastConnectFail || "Connexion impossible"), "error");
      }
    } finally {
      setBusy(false);
    }
  };

  const finishConnect = async (s: PronoteStatus) => {
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
    <section>
      <SectionHeader title={t.pronoteTitle} />
      <div className="new-card p-5 flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <span
            className={`grid place-items-center w-12 h-12 rounded-[12px] ${
              status?.connected ? "bg-emerald-500/15 text-emerald-400" : "bg-surface-container text-tui-accent"
            }`}
          >
            {status?.connected ? <CheckIcon className="w-6 h-6" /> : <QrIcon className="w-6 h-6" />}
          </span>
          <div className="flex-1">
            <p className="font-semibold text-primary">
              {status?.connected ? fmt(t.settings?.connectedAs || "Connecté - {name}", { name: status.account_name ?? "" }) : (t.settings?.notConnected || "Non connecté")}
            </p>
            <p className="text-on-surface-variant text-sm">
              {status?.connected
                ? status.last_sync
                  ? fmt(t.settings?.lastSync || "Dernière synchro : {date}", { date: status.last_sync })
                  : (t.settings?.readyToSync || "Prêt à synchroniser")
                : (t.settings?.pronoteHelp || "Comme votre établissement utilise un ENT, la connexion se fait par QR code, sans saisir de mot de passe.")}
            </p>
          </div>
          {status?.connected ? (
            <div className="flex gap-2">
              <button onClick={sync} disabled={busy} className="new-btn-ghost">
                {busy ? "..." : "Synchroniser"}
              </button>
              <button
                onClick={async () => {
                  await api.pronoteLogout();
                  refresh();
                }}
                className="new-btn-ghost text-mute"
              >
                Deconnecter
              </button>
            </div>
          ) : (
            <button onClick={() => setOpen(true)} className="new-btn-primary bg-primary text-white bg-primary text-white">
              {t.common?.connect || "Connecter"}
            </button>
          )}
        </div>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={get("settings.pronoteTitle", "Pronote")} width="max-w-xl">
        <div className="flex flex-col gap-4">
          <div className="new-segment w-full">
            <button
              onClick={() => setMethod("qr")}
              className={`flex-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                method === "qr" ? "active bg-primary text-white" : ""
              }`}
            >
              QR code (ENT)
            </button>
            <button
              onClick={() => setMethod("direct")}
              className={`flex-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                method === "direct" ? "active bg-primary text-white" : ""
              }`}
            >
              Identifiants
            </button>
          </div>

          {method === "qr" ? (
            <>
              <ol className="text-sm text-mute flex flex-col gap-1.5 list-decimal list-inside">
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
              <button onClick={() => fileRef.current?.click()} className="new-btn-ghost justify-center py-3">
                <QrIcon className="w-5 h-5" /> Importer l'image du QR code
              </button>
              {qrJson && (
                <p className="new-chip w-fit">
                  <CheckIcon className="w-3.5 h-3.5" /> QR code charge
                </p>
              )}
              <div>
                <p className="text-mute text-sm mb-1.5">Code PIN (4 chiffres)</p>
                <input
                  className="new-input tracking-[0.5em] text-center text-lg"
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="----"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                />
              </div>
              <div className="flex justify-end gap-2">
                <button className="new-btn-ghost" onClick={() => setOpen(false)}>
                  {t.common?.cancel || "Annuler"}
                </button>
                <button className="new-btn-primary bg-primary text-white" onClick={connectQr} disabled={busy}>
                  {busy ? "Connexion..." : (t.common?.connect || "Connecter")}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-mute text-sm">
                Connexion directe par identifiant et mot de passe (comptes hors ENT, ou demonstration).
              </p>
              <input
                className="new-input"
                placeholder="Adresse Pronote (https://...)"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
              <input
                className="new-input"
                placeholder="Identifiant"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
              <input
                className="new-input"
                type="password"
                placeholder="Mot de passe"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {/* PIN field: shown when the account requires it (auto-detected) or expandable */}
              {needsPin ? (
                <div className="border border-tui-accent/30 rounded p-3 bg-surface-soft/50">
                  <p className="text-sm font-medium text-primary mb-1.5">Code PIN du compte</p>
                  <p className="text-mute text-xs mb-2">Votre compte Pronote exige un code PIN pour les nouveaux appareils.</p>
                  <input
                    className="new-input tracking-[0.5em] text-center text-lg"
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
                  className="text-xs text-mute hover:text-primary transition-colors text-left"
                >
                  + Code PIN du compte (optionnel)
                </button>
              )}
              <div className="flex justify-end gap-2">
                <button className="new-btn-ghost" onClick={() => setOpen(false)}>
                  {t.common?.cancel || "Annuler"}
                </button>
                <button className="new-btn-primary bg-primary text-white" onClick={connectDirect} disabled={busy}>
                  {busy ? "Connexion..." : (t.common?.connect || "Connecter")}
                </button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </section>
  );
}

// Schedule (manual)

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

  const refresh = () => api.listSchedule().then(setEntries).catch(() => {});
  useEffect(() => {
    refresh();
    api.listCourses().then(setCourses).catch(() => {});
  }, []);

  const save = async () => {
    if (!form.subject?.trim()) return;
    await api.saveScheduleEntry({ ...form, source: "manual" });
    toast(t.settings?.toastScheduleAdded || "Cours ajouté à l'emploi du temps", "success");
    setOpen(false);
    setForm({ day_of_week: 1, start_time: "08:00", end_time: "09:00", subject: "", room: "" });
    window.dispatchEvent(new CustomEvent("eu:schedule-changed"));
    refresh();
  };

  const byDay = (d: number) =>
    entries.filter((e) => e.day_of_week === d).sort((a, b) => a.start_time.localeCompare(b.start_time));

  return (
    <section>
      <SectionHeader
        title={get("settings.scheduleTitle", "Emploi du temps")}
        action={
          <button onClick={() => setOpen(true)} className="new-btn-ghost py-1.5 px-2.5 text-xs">
            <PlusIcon className="w-4 h-4" /> {t.common?.add || "Ajouter"}
          </button>
        }
      />
      {entries.length === 0 ? (
        <div className="new-card p-5">
          <EmptyState
            title={t.settings?.emptyScheduleTitle || "Emploi du temps vide"}
            hint={t.settings?.emptyScheduleHint || "Ajoutez vos cours à la main, ou synchronisez Pronote ci-dessus."}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[1, 2, 3, 4, 5, 6].map((d) => {
            const items = byDay(d);
            if (items.length === 0) return null;
            return (
              <div key={d} className="new-card p-4">
                <p className="font-semibold text-primary mb-2">{DAY_LABELS[d - 1]}</p>
                <div className="flex flex-col gap-1.5">
                  {items.map((e) => (
                    <div key={e.id} className="flex items-center gap-2 group text-sm">
                      <span className="text-tui-accent font-medium tabular-nums w-24 shrink-0">
                        {e.start_time}-{e.end_time}
                      </span>
                      <span className="flex-1 text-primary truncate">{e.subject}</span>
                      {e.room && <span className="text-mute text-xs shrink-0">{e.room}</span>}
                      {e.source === "pronote" ? (
                        <span className="new-chip shrink-0 text-[10px] py-0.5">P</span>
                      ) : (
                        <button
                          onClick={async () => {
                            await api.deleteScheduleEntry(e.id);
                            window.dispatchEvent(new CustomEvent("eu:schedule-changed"));
                            refresh();
                          }}
                          className="opacity-0 group-hover:opacity-100 text-mute hover:text-red-500 transition-all shrink-0"
                        >
                          <TrashIcon className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={t.settings?.addCourseModalTitle || "Ajouter un cours"}>
        <div className="flex flex-col gap-3">
          <input
            autoFocus
            className="new-input"
            placeholder={t.settings?.subjectPlaceholder || "Matière (ex : Mathématiques 4e B)"}
            value={form.subject ?? ""}
            onChange={(e) => setForm({ ...form, subject: e.target.value })}
          />
          <div className="grid grid-cols-3 gap-2">
            <select
              className="new-input"
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
              className="new-input"
              value={form.start_time}
              onChange={(e) => setForm({ ...form, start_time: e.target.value })}
            />
            <input
              type="time"
              className="new-input"
              value={form.end_time}
              onChange={(e) => setForm({ ...form, end_time: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              className="new-input"
              placeholder={t.settings?.roomOptional || "Salle (optionnel)"}
              value={form.room ?? ""}
              onChange={(e) => setForm({ ...form, room: e.target.value })}
            />
            <select
              className="new-input"
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
            <button className="new-btn-ghost" onClick={() => setOpen(false)}>
              {t.common?.cancel || "Annuler"}
            </button>
            <button className="new-btn-primary bg-primary text-white" onClick={save}>
              {t.common?.add || "Ajouter"}
            </button>
          </div>
        </div>
      </Modal>
    </section>
  );
}

// Tabs (max tabs limit)

function TabsSection() {
  const tabsCtx = useTabs();

  const [unlimited, setUnlimited] = useState(tabsCtx.maxTabs === 0);
  const [sliderVal, setSliderVal] = useState(tabsCtx.maxTabs > 0 ? tabsCtx.maxTabs : 10);

  // keep local state in sync if maxTabs changes from elsewhere (rare)
  useEffect(() => {
    setUnlimited(tabsCtx.maxTabs === 0);
    if (tabsCtx.maxTabs > 0) setSliderVal(tabsCtx.maxTabs);
  }, [tabsCtx.maxTabs]);

  const MIN = 3;
  const MAX = 25;

  const apply = (nextUnlimited: boolean, nextSlider: number) => {
    const effective = nextUnlimited ? 0 : Math.max(MIN, Math.min(MAX, Math.floor(nextSlider)));
    setUnlimited(nextUnlimited);
    if (!nextUnlimited) setSliderVal(effective);
    tabsCtx.updateMaxTabs(effective);
    // subtle feedback (no spam on every slider tick)
    // toast is optional; we keep it quiet for live slider
  };

  return (
    <section>
      <SectionHeader
        title={t.settings?.tabsTitle || "Onglets"}
        action={
          <span className="text-[10px] px-2 py-0.5 rounded border border-hairline text-mute font-mono">
            {tabsCtx.maxTabs === 0 ? "ILLIMITÉ" : `${tabsCtx.maxTabs} MAX`}
          </span>
        }
      />
      <div className="new-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <input
            id="tabs-unlimited"
            type="checkbox"
            className="accent-tui-accent"
            checked={unlimited}
            onChange={(e) => apply(e.target.checked, sliderVal)}
          />
          <label htmlFor="tabs-unlimited" className="text-sm cursor-pointer select-none">
            {t.settings?.maxTabsUnlimited || "Aucune limite (illimité)"}
          </label>
        </div>

        {!unlimited && (
          <div className="pl-1">
            <div className="flex items-baseline justify-between text-sm mb-1.5">
              <div>
                <span className="font-medium text-primary">{t.settings?.maxTabsLabel || "Nombre maximum d'onglets"}</span>
              </div>
              <div className="font-mono tabular-nums text-primary text-lg leading-none">{sliderVal}</div>
            </div>

            <input
              type="range"
              min={MIN}
              max={MAX}
              step={1}
              value={sliderVal}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                setSliderVal(v);
                apply(false, v);
              }}
              className="w-full accent-tui-accent cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-mute mt-0.5 font-mono tabular-nums">
              <span>{MIN}</span>
              <span>{MAX}</span>
            </div>

            <p className="text-[11px] text-mute mt-2 leading-snug">
              {t.settings?.maxTabsHint ||
                "Lorsque la limite est atteinte, l’onglet le plus ancien (non actif) est automatiquement fermé à l’ouverture d’un nouveau. La limite s’applique aux nouveaux onglets seulement."}
            </p>
          </div>
        )}

        {unlimited && (
          <p className="text-[11px] text-mute pl-1">
            {t.settings?.maxTabsDisabledHint || "Vous pouvez ouvrir autant d’onglets que vous voulez (le + dans la barre d’onglets reste toujours actif)."}
          </p>
        )}
      </div>
    </section>
  );
}

// About

function AboutSection({ info }: { info: AppInfo | null }) {
  return (
    <section>
      <SectionHeader title={get("about.title", "À propos")} />
      <div className="new-card p-6 flex items-center gap-4">
        <img src="/euclide-logo.png" alt="Euclide" className="w-16 h-16 rounded-2xl object-contain" />
        <div>
          <p className="font-semibold text-primary">
            {t.appName} {info && <span className="text-mute font-normal">v{info.version}</span>}
          </p>
          <p className="text-mute text-sm mt-1">{t.madeBy}</p>
          {info && <p className="text-[11px] text-mute opacity-60 mt-2 selectable">{info.data_dir}</p>}
        </div>
      </div>
    </section>
  );
}
