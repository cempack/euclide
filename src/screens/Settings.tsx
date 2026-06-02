import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import {
  api,
  type AppInfo,
  type Course,
  type PronoteStatus,
  type ScheduleEntry,
} from "../lib/api";
import { t } from "../lib/i18n";
import { DAY_LABELS } from "../lib/format";

import { EmptyState, Modal, SectionHeader, useToast } from "../components/ui";
import { CheckIcon, PlusIcon, QrIcon, TrashIcon } from "../components/icons";

export default function Settings({ info }: { info: AppInfo | null }) {
  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-2xl font-display tracking-tight text-eu-text">{t.nav.settings}</h1>
        <p className="eu-sub mt-1">Pronote, emploi du temps et personnalisation.</p>
      </header>


      <PronoteSection />
      <ScheduleSection />
      <AboutSection info={info} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// (Appearance section removed — Mistral design system uses fixed theme)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Pronote
// ---------------------------------------------------------------------------

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
          toast("QR code lu avec succes", "success");
        } else {
          toast("QR code illisible, reessayez", "error");
        }
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  const connectQr = async () => {
    if (!qrJson.trim() || pin.length < 4) {
      toast("QR code et code PIN requis", "error");
      return;
    }
    setBusy(true);
    try {
      const s = await api.pronoteQrLogin(qrJson.trim(), pin.trim());
      await finishConnect(s);
    } catch {
      toast("Connexion Pronote impossible", "error");
    } finally {
      setBusy(false);
    }
  };

  const connectDirect = async () => {
    if (!url.trim() || !username.trim() || !password) {
      toast("URL, identifiant et mot de passe requis", "error");
      return;
    }
    setBusy(true);
    try {
      const s = await api.pronotePasswordLogin(url.trim(), username.trim(), password);
      await finishConnect(s);
    } catch (err) {
      toast(typeof err === "string" ? err : "Connexion impossible", "error");
    } finally {
      setBusy(false);
    }
  };

  const finishConnect = async (s: PronoteStatus) => {
    setStatus(s);
    if (s.connected) {
      toast("Connecte a Pronote", "success");
      setOpen(false);
      setQrJson("");
      setPin("");
      setPassword("");
      const n = await api.pronoteSync();
      toast(`${n} cours synchronises`, "success");
      refresh();
    } else {
      toast("Connexion echouee, verifiez vos informations", "error");
    }
  };

  const sync = async () => {
    setBusy(true);
    try {
      const n = await api.pronoteSync();
      toast(`${n} cours synchronises`, "success");
    } catch (err) {
      toast(typeof err === "string" ? err : "Synchronisation impossible", "error");
    } finally {
      setBusy(false);
      refresh();
    }
  };

  return (
    <section>
      <SectionHeader title={t.pronoteTitle} />
      <div className="eu-card p-5 flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <span
            className={`grid place-items-center w-12 h-12 rounded-[12px] ${
              status?.connected ? "bg-emerald-500/15 text-emerald-500" : "bg-[#fff8e0] text-[#fa520f]"
            }`}
          >
            {status?.connected ? <CheckIcon className="w-6 h-6" /> : <QrIcon className="w-6 h-6" />}
          </span>
          <div className="flex-1">
            <p className="font-semibold text-eu-text">
              {status?.connected ? `Connecte - ${status.account_name ?? ""}` : "Non connecte"}
            </p>
            <p className="eu-sub">
              {status?.connected
                ? status.last_sync
                  ? `Derniere synchro : ${status.last_sync}`
                  : "Pret a synchroniser"
                : t.pronoteHelp}
            </p>
          </div>
          {status?.connected ? (
            <div className="flex gap-2">
              <button onClick={sync} disabled={busy} className="eu-btn-soft">
                {busy ? "..." : "Synchroniser"}
              </button>
              <button
                onClick={async () => {
                  await api.pronoteLogout();
                  refresh();
                }}
                className="eu-btn-ghost text-eu-muted"
              >
                Deconnecter
              </button>
            </div>
          ) : (
            <button onClick={() => setOpen(true)} className="eu-btn-primary">
              {t.connect}
            </button>
          )}
        </div>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Connexion a Pronote" width="max-w-xl">
        <div className="flex flex-col gap-4">
          <div className="flex gap-1 p-1 rounded-lg bg-[#fafafa] border border-[#ededed]">
            <button
              onClick={() => setMethod("qr")}
              className={`flex-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                method === "qr" ? "bg-[#1f1f1f] text-white" : "text-[#6a6a6a]"
              }`}
            >
              QR code (ENT)
            </button>
            <button
              onClick={() => setMethod("direct")}
              className={`flex-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                method === "direct" ? "bg-[#1f1f1f] text-white" : "text-[#6a6a6a]"
              }`}
            >
              Identifiants
            </button>
          </div>

          {method === "qr" ? (
            <>
              <ol className="text-sm text-eu-muted flex flex-col gap-1.5 list-decimal list-inside">
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
              <button onClick={() => fileRef.current?.click()} className="eu-btn-soft justify-center py-3">
                <QrIcon className="w-5 h-5" /> Importer l'image du QR code
              </button>
              {qrJson && (
                <p className="eu-chip w-fit">
                  <CheckIcon className="w-3.5 h-3.5" /> QR code charge
                </p>
              )}
              <div>
                <p className="eu-sub mb-1.5">Code PIN (4 chiffres)</p>
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
                  {t.cancel}
                </button>
                <button className="eu-btn-primary" onClick={connectQr} disabled={busy}>
                  {busy ? "Connexion..." : t.connect}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="eu-sub">
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
              <div className="flex justify-end gap-2">
                <button className="eu-btn-ghost" onClick={() => setOpen(false)}>
                  {t.cancel}
                </button>
                <button className="eu-btn-primary" onClick={connectDirect} disabled={busy}>
                  {busy ? "Connexion..." : t.connect}
                </button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Schedule (manual)
// ---------------------------------------------------------------------------

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
    toast("Cours ajoute a l'emploi du temps", "success");
    setOpen(false);
    setForm({ day_of_week: 1, start_time: "08:00", end_time: "09:00", subject: "", room: "" });
    refresh();
  };

  const byDay = (d: number) =>
    entries.filter((e) => e.day_of_week === d).sort((a, b) => a.start_time.localeCompare(b.start_time));

  return (
    <section>
      <SectionHeader
        title="Emploi du temps"
        action={
          <button onClick={() => setOpen(true)} className="eu-btn-soft py-1.5 px-2.5 text-xs">
            <PlusIcon className="w-4 h-4" /> {t.add}
          </button>
        }
      />
      {entries.length === 0 ? (
        <div className="eu-card p-5">
          <EmptyState
            title="Emploi du temps vide"
            hint="Ajoutez vos cours a la main, ou synchronisez Pronote ci-dessus."
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[1, 2, 3, 4, 5, 6].map((d) => {
            const items = byDay(d);
            if (items.length === 0) return null;
            return (
              <div key={d} className="eu-card p-4">
                <p className="font-semibold text-eu-text mb-2">{DAY_LABELS[d - 1]}</p>
                <div className="flex flex-col gap-1.5">
                  {items.map((e) => (
                    <div key={e.id} className="flex items-center gap-2 group text-sm">
                      <span className="text-[#fa520f] font-medium tabular-nums w-24 shrink-0">
                        {e.start_time}-{e.end_time}
                      </span>
                      <span className="flex-1 text-eu-text truncate">{e.subject}</span>
                      {e.room && <span className="text-eu-muted text-xs shrink-0">{e.room}</span>}
                      {e.source === "pronote" ? (
                        <span className="eu-chip shrink-0 text-[10px] py-0.5">P</span>
                      ) : (
                        <button
                          onClick={async () => {
                            await api.deleteScheduleEntry(e.id);
                            refresh();
                          }}
                          className="opacity-0 group-hover:opacity-100 text-eu-muted hover:text-red-500 transition-all shrink-0"
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

      <Modal open={open} onClose={() => setOpen(false)} title="Ajouter un cours">
        <div className="flex flex-col gap-3">
          <input
            autoFocus
            className="eu-input"
            placeholder="Matiere (ex : Mathematiques 4e B)"
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
              placeholder="Salle (optionnel)"
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
                  {c.emoji} {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2 mt-1">
            <button className="eu-btn-ghost" onClick={() => setOpen(false)}>
              {t.cancel}
            </button>
            <button className="eu-btn-primary" onClick={save}>
              {t.add}
            </button>
          </div>
        </div>
      </Modal>
    </section>
  );
}

// ---------------------------------------------------------------------------
// About
// ---------------------------------------------------------------------------

function AboutSection({ info }: { info: AppInfo | null }) {
  return (
    <section>
      <SectionHeader title="A propos" />
      <div className="eu-card p-6 flex items-center gap-4">
        <img src="/euclide-logo.png" alt="Euclide" className="w-16 h-16 rounded-2xl shadow-soft" />
        <div>
          <p className="font-semibold text-eu-text">
            {t.appName} {info && <span className="text-eu-muted font-normal">v{info.version}</span>}
          </p>
          <p className="eu-sub">{t.tagline}</p>
          <p className="eu-sub mt-1">{t.madeBy}</p>
          {info && <p className="text-[11px] text-eu-muted opacity-60 mt-2 selectable">{info.data_dir}</p>}
        </div>
      </div>
    </section>
  );
}
