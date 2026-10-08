import { useRef, useState } from "react";
import { api, isTauri, type AppInfo, type Course, type PronoteStatus, type ScheduleEntry } from "../lib/api";
import { tr } from "../lib/i18n";
import { errorCode, errorMessage } from "../lib/errors";
import { reportError } from "../lib/report";
import {
  checkForAppUpdate,
  isIncompleteUpdateManifest,
  isNoPublishedUpdate,
  updaterSupported,
} from "../lib/updater";
import { DAY_LABELS, isoDayOfWeek } from "../lib/format";

import { EmptyState, Modal, useToast, useConfirm } from "../components/ui";
import { PageHeader, Panel, Section, Segmented } from "../components/layout";
import { BackupsSection } from "../features/settings/BackupsSection";
import { SettingRow, SettingsNav, type NavSection } from "../features/settings/SettingRow";
import { Check, Moon, Plus, QrCode, Sun, Trash2 } from "lucide-react";
import { Icon } from "../ui/Icon";
import { tabs, useTabLimit } from "../stores/tabs";
import { useAppearance } from "../lib/theme";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { q } from "../api/queries";
import { useSetting } from "../api/hooks";
import { setAvailableUpdate, useInstallUpdate } from "../stores/update";
import { remoteFaviconsEnabled } from "../components/Favicon";

const NO_ENTRIES: ScheduleEntry[] = [];
const NO_COURSES: Course[] = [];

const SECTIONS: NavSection[] = [
  { id: "profil", label: tr("settings.profileTitle") },
  { id: "apparence", label: tr("settings.metaAppearance") },
  { id: "pronote", label: tr("settings.pronoteTitle") },
  { id: "emploi-du-temps", label: tr("settings.scheduleTitle") },
  { id: "onglets", label: tr("settings.tabsTitle") },
  { id: "sauvegardes", label: tr("backups.title") },
  { id: "donnees", label: tr("settings.dataDirTitle") },
  { id: "a-propos", label: tr("about.title") },
];

export default function Settings({ info }: { info: AppInfo | null }) {
  return (
    <>
      <PageHeader title={tr("nav.settings")} />
      <SettingsNav sections={SECTIONS} />

      <ProfileSection />
      <AppearanceSection />
      <PronoteSection />
      <ScheduleSection />
      <TabsSection />
      <BackupsSection id="sauvegardes" />
      <DataStorageSection info={info} />
      <AboutSection info={info} />
    </>
  );
}

/** The teacher's name, as the dashboard greets them and the sidebar shows it. */
function ProfileSection() {
  const [saved, setSaved] = useSetting("teacher_display_name");
  const pronoteName = useQuery(q.pronoteStatus()).data?.account_name ?? "";
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? saved ?? "";
  const commit = () => {
    if (draft == null) return;
    const next = draft.trim();
    if (next !== (saved ?? "")) setSaved(next);
    setDraft(null);
  };
  return (
    <Section title={tr("settings.profileTitle")} id="profil">
      <Panel pad>
        <SettingRow title={tr("settings.displayName")} hint={tr("settings.displayNameHint")}>
          <input
            className="eu-input w-64"
            value={value}
            placeholder={pronoteName || tr("settings.displayNamePlaceholder")}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
            aria-label={tr("settings.displayName")}
          />
        </SettingRow>
      </Panel>
    </Section>
  );
}

// Appearance: theme, density, site icons and the end-of-class notice.
// Projection lives on the sidebar (next to Réglages), not here.

function AppearanceSection() {
  const { pref, setPref, density, setDensity } = useAppearance();
  const [favicons, setFavicons] = useSetting("remote_favicons");
  const [noticeRaw, setNotice] = useSetting("class_end_notice");
  const [leadRaw, setLead] = useSetting("class_end_lead");
  const remoteIcons = remoteFaviconsEnabled(favicons);
  const endNotice: "off" | "toast" | "sound" =
    noticeRaw === "off" || noticeRaw === "toast" || noticeRaw === "sound" ? noticeRaw : "toast";
  const leadN = leadRaw ? parseInt(leadRaw, 10) : NaN;
  const endLead = leadN >= 1 && leadN <= 15 ? leadN : 5;

  return (
    <Section title={tr("settings.metaAppearance")} id="apparence">
      <Panel pad>
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <p className="eu-t-body font-medium text-ink">{tr("appearance.theme")}</p>
              <p className="eu-t-meta">{tr("appearance.themeHint")}</p>
            </div>
            <Segmented
              value={pref}
              onChange={setPref}
              label={tr("appearance.theme")}
              options={[
                { value: "auto", label: tr("appearance.auto") },
                {
                  value: "light",
                  label: (
                    <span className="flex items-center gap-1.5">
                      <Icon icon={Sun} size={14} />
                      {tr("appearance.light")}
                    </span>
                  ),
                },
                {
                  value: "dark",
                  label: (
                    <span className="flex items-center gap-1.5">
                      <Icon icon={Moon} size={14} />
                      {tr("appearance.dark")}
                    </span>
                  ),
                },
              ]}
            />
          </div>

          <div className="flex items-center justify-between gap-4 flex-wrap border-t border-line pt-4">
            <div className="min-w-0">
              <p className="eu-t-body font-medium text-ink">{tr("appearance.density")}</p>
              <p className="eu-t-meta">{tr("appearance.densityHint")}</p>
            </div>
            <Segmented
              value={density}
              onChange={setDensity}
              label={tr("appearance.density")}
              options={[
                { value: "comfortable", label: tr("appearance.comfortable") },
                { value: "compact", label: tr("appearance.compact") },
              ]}
            />
          </div>

          <div className="flex items-center justify-between gap-4 flex-wrap border-t border-line pt-4">
            <div className="min-w-0">
              <p className="eu-t-body font-medium text-ink">{tr("classEnd.title")}</p>
              <p className="eu-t-meta max-w-[62ch]">{tr("classEnd.hint")}</p>
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
                      setLead(String(n));
                    }}
                    aria-label={tr("classEnd.lead")}
                    className="eu-input w-16 text-center tabular-nums"
                  />
                  <span className="eu-t-meta">min</span>
                </div>
              )}
              <Segmented
                value={endNotice}
                onChange={(v) => {
                  setNotice(v);
                }}
                label={tr("classEnd.title")}
                options={[
                  { value: "off", label: tr("classEnd.off") },
                  { value: "toast", label: tr("classEnd.silent") },
                  { value: "sound", label: tr("classEnd.sound") },
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
                setFavicons(e.target.checked ? "1" : "0");
                window.dispatchEvent(new CustomEvent("eu:quicklinks-changed"));
              }}
            />
            <span className="min-w-0">
              <span className="eu-t-body font-medium text-ink block">{tr("appearance.remoteIcons")}</span>
              <span className="eu-t-meta block">{tr("appearance.remoteIconsHint")}</span>
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
        toast(tr("settings.dataDirChosen"), "success");
      }
    } catch (err) {
      reportError("settings.pickFolder", err);
      toast(errorMessage(err, tr("settings.pickFolderError")), "error");
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    const ok = await confirmDlg.ask({
      title: tr("settings.resetTitle"),
      message: tr("settings.resetMessage"),
      confirmLabel: tr("settings.resetConfirm"),
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api.resetDataDir();
      toast(tr("settings.resetSuccess"), "success");
    } catch (err) {
      reportError("settings.resetDataDir", err);
      toast(errorMessage(err, tr("settings.resetError")), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title={tr("settings.dataDirTitle")} id="donnees">
      <Panel pad>
        <SettingRow
          title={tr("settings.dataDirLabel")}
          hint={
            <>
              {tr("settings.dataDirHint")}
              <span className="block mt-1.5 font-mono text-small text-ink-muted break-all selectable">
                {current || tr("settings.dataDirUnknown")}
              </span>
            </>
          }
        >
          <button
            className="eu-btn-quiet eu-btn-sm"
            disabled={!isTauri()}
            onClick={() => void api.openFolder("data").catch((err) => toast(errorMessage(err), "error"))}
          >
            {tr("backups.openFolder")}
          </button>
          <button onClick={choose} disabled={busy} className="eu-btn-ghost eu-btn-sm">
            {tr("settings.pickFolder")}
          </button>
          <button onClick={reset} disabled={busy} className="eu-btn-quiet eu-btn-sm">
            {tr("settings.resetFolder")}
          </button>
        </SettingRow>
      </Panel>
    </Section>
  );
}

// Pronote

type LoginMethod = "qr" | "direct";

function PronoteSection() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const status = useQuery(q.pronoteStatus()).data ?? null;
  const setStatus = (s: PronoteStatus) => queryClient.setQueryData(q.pronoteStatus().queryKey, s);
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

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["pronote"] });

  const decodeImage = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = async () => {
        const { default: jsQR } = await import("jsqr");
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(data.data, data.width, data.height);
        if (code) {
          setQrJson(code.data);
          toast(tr("settings.toastQrRead"), "success");
        } else {
          toast(tr("settings.toastQrFail"), "error");
        }
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  const connectQr = async () => {
    if (!qrJson.trim() || pin.length < 4) {
      toast(tr("settings.toastMissingQrPin"), "error");
      return;
    }
    setBusy(true);
    try {
      const s = await api.pronoteQrLogin(qrJson.trim(), pin.trim());
      await finishConnect(s);
    } catch (err) {
      toast(errorMessage(err, "") || tr("settings.toastConnectFail"), "error");
    } finally {
      setBusy(false);
    }
  };

  const connectDirect = async () => {
    if (!url.trim() || !username.trim() || !password) {
      toast(tr("settings.toastMissingDirect"), "error");
      return;
    }
    setBusy(true);
    try {
      const s = await api.pronotePasswordLogin(
        url.trim(),
        username.trim(),
        password,
        pinCode.trim() || undefined,
      );
      await finishConnect(s);
    } catch (err) {
      const msg = errorMessage(err, "");
      if (errorCode(err) === "pronote_needs_pin") {
        setNeedsPin(true);
        toast(msg || "Code PIN requis pour cet appareil. Saisissez-le ci-dessous.", "error");
      } else {
        toast(msg || tr("settings.toastConnectFail"), "error");
      }
    } finally {
      setBusy(false);
    }
  };

  const finishConnect = async (s: PronoteStatus | null) => {
    if (!s) {
      toast(tr("settings.toastConnectFailed"), "error");
      return;
    }
    setStatus(s);
    if (s.connected) {
      toast(tr("settings.toastConnected"), "success");
      setOpen(false);
      setQrJson("");
      setPin("");
      setPassword("");
      setPinCode("");
      setNeedsPin(false);
      // Small delay to let the QR token settle before sync (token rotation race)
      await new Promise((r) => setTimeout(r, 800));
      try {
        toast(tr("settings.toastSyncing"), "info");
        const n = await api.pronoteSync();
        window.dispatchEvent(new CustomEvent("eu:schedule-changed"));
        toast(tr("settings.toastSyncCount", { count: n }), "success");
      } catch {
        // Token may have rotated — retry once after a short wait
        try {
          await new Promise((r) => setTimeout(r, 1500));
          const n2 = await api.pronoteSync();
          window.dispatchEvent(new CustomEvent("eu:schedule-changed"));
          toast(tr("settings.toastSyncCount", { count: n2 }), "success");
        } catch (err) {
          // Sync failed but login itself worked — user can manually sync later
          reportError("settings.pronoteFirstSync", err);
          toast(errorMessage(err, tr("settings.toastSyncFail")), "error");
        }
      }
      refresh();
    } else {
      toast(tr("settings.toastConnectFailed"), "error");
    }
  };

  const sync = async () => {
    setBusy(true);
    try {
      toast(tr("settings.toastSyncing"), "info");
      const n = await api.pronoteSync();
      window.dispatchEvent(new CustomEvent("eu:schedule-changed"));
      toast(tr("settings.toastSyncCount", { count: n }), "success");
    } catch (err) {
      toast(errorMessage(err, tr("settings.toastSyncFail")), "error");
    } finally {
      setBusy(false);
      refresh();
    }
  };

  return (
    <Section title={tr("settings.pronoteTitle")} id="pronote">
      <Panel pad>
        <div className="flex items-center gap-3.5 flex-wrap">
          <span
            className={`grid place-items-center w-9 h-9 shrink-0 rounded border ${
              status?.connected
                ? "bg-ok-soft border-ok/25 text-ok"
                : "bg-panel-alt border-line text-ink-muted"
            }`}
          >
            {status?.connected ? <Icon icon={Check} size={16} /> : <Icon icon={QrCode} size={16} />}
          </span>
          <div className="flex-1 min-w-[24ch]">
            <p className="eu-t-body font-medium text-ink">
              {status?.connected
                ? tr("settings.connectedAs", { name: status.account_name ?? "" })
                : tr("settings.notConnected")}
            </p>
            <p className="eu-t-meta">
              {status?.connected
                ? status.last_sync
                  ? tr("settings.lastSync", { date: status.last_sync })
                  : tr("settings.readyToSync")
                : tr("settings.pronoteHelp")}
            </p>
          </div>
          {status?.connected ? (
            <div className="flex gap-2 shrink-0">
              <button onClick={sync} disabled={busy} className="eu-btn-ghost eu-btn-sm">
                {busy ? "…" : tr("settings.sync")}
              </button>
              <button
                onClick={async () => {
                  await api.pronoteLogout();
                  window.dispatchEvent(new CustomEvent("eu:pronote-changed"));
                  refresh();
                }}
                className="eu-btn-quiet eu-btn-sm"
              >
                {tr("settings.disconnect")}
              </button>
            </div>
          ) : (
            <button onClick={() => setOpen(true)} className="eu-btn-primary eu-btn-sm shrink-0">
              {tr("common.connect")}
            </button>
          )}
        </div>
      </Panel>

      <Modal open={open} onClose={() => setOpen(false)} title={tr("settings.pronoteTitle")} width="max-w-xl">
        <div className="flex flex-col gap-4">
          <Segmented
            grow
            value={method}
            onChange={setMethod}
            label={tr("settings.pronoteTitle")}
            options={[
              { value: "qr", label: tr("settings.qrMethod") },
              { value: "direct", label: tr("settings.idMethod") },
            ]}
          />

          {method === "qr" ? (
            <>
              <ol className="eu-t-body text-ink-muted flex flex-col gap-1.5 list-decimal list-inside">
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
                <Icon icon={QrCode} size={20} /> Importer l'image du QR code
              </button>
              {qrJson && (
                <p className="eu-chip w-fit">
                  <Icon icon={Check} size={14} /> QR code charge
                </p>
              )}
              <div>
                <p className="eu-t-body text-ink-muted mb-1.5">Code PIN (4 chiffres)</p>
                <input
                  className="eu-input tracking-[0.5em] text-center text-title font-mono"
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="----"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                />
              </div>
              <div className="flex justify-end gap-2">
                <button className="eu-btn-ghost" onClick={() => setOpen(false)}>
                  {tr("common.cancel")}
                </button>
                <button className="eu-btn-primary" onClick={connectQr} disabled={busy}>
                  {busy ? "Connexion..." : tr("common.connect")}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="eu-t-body text-ink-muted">
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
                  <p className="eu-t-body font-medium text-ink mb-1.5">Code PIN du compte</p>
                  <p className="eu-t-small text-ink-muted mb-2">
                    Votre compte Pronote exige un code PIN pour les nouveaux appareils.
                  </p>
                  <input
                    className="eu-input tracking-[0.5em] text-center text-title font-mono"
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
                  className="eu-t-small text-ink-muted hover:text-ink transition-colors text-left"
                >
                  + Code PIN du compte (optionnel)
                </button>
              )}
              <div className="flex justify-end gap-2">
                <button className="eu-btn-ghost" onClick={() => setOpen(false)}>
                  {tr("common.cancel")}
                </button>
                <button className="eu-btn-primary" onClick={connectDirect} disabled={busy}>
                  {busy ? "Connexion..." : tr("common.connect")}
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
  const queryClient = useQueryClient();
  const entries = useQuery(q.schedule()).data ?? NO_ENTRIES;
  const courses = useQuery(q.courses()).data ?? NO_COURSES;
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Partial<ScheduleEntry>>({
    day_of_week: 1,
    start_time: "08:00",
    end_time: "09:00",
    subject: "",
    room: "",
  });

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["schedule"] });

  const save = async () => {
    if (!form.subject?.trim()) return;
    try {
      const saved = await api.saveScheduleEntry({ ...form, source: "manual" });
      if (!saved?.id) {
        toast(tr("messages.genericError"), "error");
        return;
      }
      toast(tr("settings.toastScheduleAdded"), "success");
      setOpen(false);
      setForm({ day_of_week: 1, start_time: "08:00", end_time: "09:00", subject: "", room: "" });
      window.dispatchEvent(new CustomEvent("eu:schedule-changed"));
      refresh();
    } catch (err) {
      reportError("settings.addSchedule", err);
      toast(errorMessage(err, tr("messages.genericError")), "error");
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
      id="emploi-du-temps"
      title={tr("settings.scheduleTitle")}
      description={tr("settings.scheduleWeek")}
      action={
        <button onClick={() => setOpen(true)} className="eu-btn-ghost eu-btn-sm">
          <Icon icon={Plus} size={14} /> {tr("common.add")}
        </button>
      }
    >
      {entries.length === 0 ? (
        <Panel>
          <EmptyState
            title={tr("settings.emptyScheduleTitle")}
            hint={tr("settings.emptyScheduleHint")}
            action={
              <button onClick={() => setOpen(true)} className="eu-btn-primary eu-btn-sm">
                <Icon icon={Plus} size={14} /> {tr("common.add")}
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
                          data-tip={`${e.subject}${e.room ? ` · ${e.room}` : ""}`}
                        >
                          <p className="eu-t-caption">
                            {e.start_time}–{e.end_time}
                          </p>
                          <p className="eu-t-meta text-ink font-medium truncate mt-0.5">{e.subject}</p>
                          {e.room && <p className="eu-t-label mt-1 normal-case">{e.room}</p>}
                          {e.source === "pronote" ? (
                            <span
                              className="absolute top-1 right-1 eu-t-label"
                              data-tip={tr("settings.fromPronote")}
                            >
                              P
                            </span>
                          ) : (
                            <button
                              onClick={() => void remove(e.id)}
                              aria-label={`${tr("common.delete")} — ${e.subject}`}
                              data-tip={tr("common.delete")}
                              className="absolute top-0.5 right-0.5 w-6 h-6 grid place-items-center rounded-sm text-ink-faint opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-danger hover:bg-danger-soft transition-opacity duration-fast"
                            >
                              <Icon icon={Trash2} size={20} className="w-3 h-3" />
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

      <Modal open={open} onClose={() => setOpen(false)} title={tr("settings.addCourseModalTitle")}>
        <div className="flex flex-col gap-3">
          <input
            autoFocus
            className="eu-input"
            placeholder={tr("settings.subjectPlaceholder")}
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
              placeholder={tr("settings.roomOptional")}
              value={form.room ?? ""}
              onChange={(e) => setForm({ ...form, room: e.target.value })}
            />
            <select
              className="eu-input"
              value={form.course_id ?? ""}
              onChange={(e) =>
                setForm({ ...form, course_id: e.target.value ? Number(e.target.value) : null })
              }
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
              {tr("common.cancel")}
            </button>
            <button className="eu-btn-primary" onClick={save} disabled={!form.subject?.trim()}>
              {tr("common.add")}
            </button>
          </div>
        </div>
      </Modal>
    </Section>
  );
}

// Tabs (max tabs limit)

function TabsSection() {
  const limit = useTabLimit();
  const MIN = 3;
  const MAX = 25;
  const mode = limit.mode;
  const sliderVal = Math.max(MIN, Math.min(MAX, limit.fixed));
  const chip =
    mode === "unlimited"
      ? tr("settings.maxTabsUnlimited").toUpperCase()
      : mode === "auto"
        ? `${tr("settings.maxTabsAutoChip")} · ${limit.fit || "…"}`
        : `${limit.max} MAX`;

  return (
    <Section title={tr("settings.tabsTitle")} id="onglets" action={<span className="eu-chip">{chip}</span>}>
      <Panel pad>
        <div className="flex flex-col gap-3">
          <Segmented
            grow
            value={mode}
            onChange={(next) => tabs.setMaxTabsMode(next, sliderVal)}
            label={tr("settings.tabsTitle")}
            options={[
              { value: "auto", label: tr("settings.maxTabsAuto") },
              { value: "fixed", label: tr("settings.maxTabsFixed") },
              { value: "unlimited", label: tr("settings.maxTabsUnlimited") },
            ]}
          />

          {mode === "auto" && (
            <p className="eu-t-meta leading-snug">
              {tr("settings.maxTabsAutoHint", { count: limit.fit || "…" })}
            </p>
          )}

          {mode === "fixed" && (
            <div>
              <div className="flex items-baseline justify-between eu-t-body mb-1.5">
                <span className="font-medium text-ink">{tr("settings.maxTabsLabel")}</span>
                <span className="font-mono text-ink text-title leading-none">{sliderVal}</span>
              </div>
              <input
                type="range"
                min={MIN}
                max={MAX}
                step={1}
                value={sliderVal}
                onChange={(e) => tabs.setMaxTabsMode("fixed", parseInt(e.target.value, 10))}
                className="w-full accent-accent cursor-pointer"
              />
              <div className="flex justify-between eu-t-caption text-ink-muted mt-0.5">
                <span>{MIN}</span>
                <span>{MAX}</span>
              </div>
              <p className="eu-t-meta mt-2 leading-snug">{tr("settings.maxTabsHint")}</p>
            </div>
          )}

          {mode === "unlimited" && (
            <p className="eu-t-meta leading-snug">{tr("settings.maxTabsDisabledHint")}</p>
          )}
        </div>
        <p className="eu-t-meta mt-3 pt-3 border-t border-line leading-snug">{tr("settings.pinHint")}</p>
      </Panel>
    </Section>
  );
}

// About

/** The engine that draws Euclide: WebView2 on Windows, WebKitGTK on Linux. */
function webviewName(): string {
  const ua = navigator.userAgent;
  const edge = /Edg\/([\d.]+)/.exec(ua);
  if (edge) return `WebView2 ${edge[1]}`;
  const chrome = /Chrome\/([\d.]+)/.exec(ua);
  if (chrome) return `Chromium ${chrome[1]}`;
  const webkit = /AppleWebKit\/([\d.]+)/.exec(ua);
  return webkit ? `WebKit ${webkit[1]}` : ua;
}

function AboutSection({ info }: { info: AppInfo | null }) {
  const toast = useToast();
  // The installation is shared with the status bar (stores/update.ts).
  const { update, phase, percent, error: installError, install } = useInstallUpdate();
  const queryClient = useQueryClient();
  /** Asks the update server; a found version goes to the shared store. */
  const ask = (force: boolean) => async () => {
    const next = await checkForAppUpdate(force);
    if (next) setAvailableUpdate(next);
    return next;
  };
  const updateQ = useQuery({
    queryKey: ["updates"],
    queryFn: ask(false),
    enabled: isTauri() && updaterSupported(),
    staleTime: 5 * 60_000,
  });
  const runCheck = () =>
    void queryClient
      .fetchQuery({ queryKey: ["updates"], queryFn: ask(true), staleTime: 0 })
      .catch(() => toast(tr("updater.error"), "error"));
  const checkError = updateQ.error;
  const check: "idle" | "checking" | "upToDate" | "publishing" | "error" = !isTauri()
    ? "idle"
    : updateQ.isFetching
      ? "checking"
      : checkError
        ? isIncompleteUpdateManifest(checkError)
          ? "publishing"
          : isNoPublishedUpdate(checkError)
            ? "upToDate"
            : "error"
        : updateQ.data === null
          ? "upToDate"
          : "idle";
  const status = check === "checking" ? "checking" : update ? phase : check;
  const error =
    phase === "error" && update ? installError : checkError instanceof Error ? checkError.message : "";

  const statusLine =
    status === "checking"
      ? tr("updater.checking")
      : status === "upToDate"
        ? tr("updater.upToDate")
        : status === "publishing"
          ? tr("updater.publishing")
          : status === "available" && update
            ? tr("updater.available", {
                version: update.version,
                current: update.currentVersion,
              })
            : status === "installing"
              ? tr("updater.installing", { percent })
              : status === "installed"
                ? tr("updater.installed")
                : status === "error"
                  ? error || tr("updater.error")
                  : "";

  return (
    <Section title={tr("about.title")} id="a-propos">
      <Panel pad>
        <div className="flex items-center gap-3.5">
          <img
            src="/logo-128.png"
            alt=""
            width={44}
            height={44}
            className="w-11 h-11 rounded object-contain"
          />
          <div className="min-w-0">
            <p className="eu-t-body font-medium text-ink">
              {tr("appName")} {info && <span className="text-ink-muted font-normal">v{info.version}</span>}
            </p>
            <p className="eu-t-meta">{tr("madeBy")}</p>
          </div>
        </div>

        {isTauri() && (
          <div className="border-t border-line mt-4 pt-4 flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={runCheck}
                disabled={status === "checking" || status === "installing"}
                className="eu-btn-ghost eu-btn-sm"
              >
                {tr("updater.check")}
              </button>
              {(status === "available" || status === "installing") && (
                <button
                  type="button"
                  onClick={() => void install()}
                  disabled={status === "installing"}
                  className="eu-btn-primary eu-btn-sm"
                >
                  {tr("updater.install")}
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
                <i style={{ width: `${percent}%` }} />
              </div>
            )}
            <p className="eu-t-meta leading-snug">
              {info?.windows_portable ? tr("updater.hintPortable") : tr("updater.hint")}
            </p>
          </div>
        )}
      </Panel>

      {/* What to tell when something goes wrong. */}
      <Panel pad>
        <SettingRow title={tr("about.diagnostics")} hint={tr("about.diagnosticsHint")}>
          <button
            className="eu-btn-quiet eu-btn-sm"
            disabled={!isTauri()}
            onClick={() => void api.openFolder("logs").catch((err) => toast(errorMessage(err), "error"))}
          >
            {tr("about.openLogs")}
          </button>
        </SettingRow>
        <dl className="eu-facts selectable">
          <dt>{tr("about.version")}</dt>
          <dd>
            {info ? info.version : "—"}
            {info?.windows_portable ? ` · ${tr("about.portable")}` : ""}
          </dd>
          <dt>{tr("about.dataFormat")}</dt>
          <dd>{info?.data_format ?? "—"}</dd>
          <dt>{tr("about.engine")}</dt>
          <dd>{webviewName()}</dd>
          <dt>{tr("about.dataFolder")}</dt>
          <dd className="break-all">{info?.data_dir ?? "—"}</dd>
        </dl>
      </Panel>
    </Section>
  );
}
