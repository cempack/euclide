import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { api, type RecapData } from "../lib/api";
import { t } from "../lib/i18n";
import { FileIcon, PenIcon, PlayIcon, CheckIcon, ClockIcon } from "../components/icons";

const PERIODS = [
  { id: "day", label: "Aujourd'hui" },
  { id: "week", label: "Cette semaine" },
  { id: "all", label: "Depuis le debut" },
];

export default function Recap() {
  const [period, setPeriod] = useState("day");
  const [data, setData] = useState<RecapData | null>(null);

  useEffect(() => {
    setData(null);
    api.getRecap(period).then(setData).catch(() => {});
  }, [period]);

  const stats = data
    ? [
        { icon: <FileIcon className="w-5 h-5" />, value: data.files_opened, label: "fichiers ouverts" },
        { icon: <PenIcon className="w-5 h-5" />, value: data.notes_written, label: "notes ecrites" },
        { icon: <PlayIcon className="w-5 h-5" />, value: data.demos_run, label: "demos lancees" },
        { icon: <CheckIcon className="w-5 h-5" />, value: data.reminders_done, label: "rappels faits" },
        { icon: <ClockIcon className="w-5 h-5" />, value: data.active_minutes, label: "minutes actives" },
      ]
    : [];

  return (
    <div className="flex flex-col gap-7">
      <header>
        <h1 className="text-2xl font-display tracking-tight text-eu-text">{t.nav.recap}</h1>
        <p className="eu-sub mt-1">Un petit bilan, facon Wrapped.</p>
      </header>

      <div className="flex gap-1 p-1 rounded-lg bg-[#fafafa] border border-[#ededed] w-fit">
        {PERIODS.map((p) => (
          <button
            key={p.id}
            onClick={() => setPeriod(p.id)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              period === p.id ? "bg-[#1f1f1f] text-white" : "text-[#6a6a6a] hover:text-[#1f1f1f]"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={period}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="flex flex-col gap-6"
        >
          {/* Hero */}
          <div className="relative overflow-hidden eu-card p-8 bg-gradient-to-br from-[#fa520f] to-[#ff8105] text-white">
            <div className="absolute -right-10 -top-10 w-48 h-48 rounded-full bg-white/10 blur-2xl" />
            <p className="text-white/80 text-sm">{data?.period_label ?? "..."}</p>
            <p className="text-3xl font-display mt-2 leading-tight">
              {data && data.active_minutes > 0
                ? "Belle session de travail, Monsieur Madrias."
                : "Pret pour une nouvelle session."}
            </p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {stats.map((s, i) => (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, scale: 0.94 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.1 + i * 0.07, type: "spring", stiffness: 240, damping: 20 }}
                className="eu-card p-4"
              >
                <span className="grid place-items-center w-9 h-9 rounded-lg bg-[#fff8e0] text-[#fa520f] mb-3">
                  {s.icon}
                </span>
                <p className="font-display text-2xl text-eu-text tabular-nums">{s.value}</p>
                <p className="text-[11px] text-eu-muted">{s.label}</p>
              </motion.div>
            ))}
          </div>

          {/* Top courses */}
          {data && data.top_courses.length > 0 && (
            <section className="eu-card p-5">
              <h2 className="eu-title text-[15px] mb-4">Cours les plus utilises</h2>
              <div className="flex flex-col gap-3">
                {data.top_courses.map((c, i) => {
                  const max = data.top_courses[0].count || 1;
                  return (
                    <div key={c.name} className="flex items-center gap-3">
                      <span className="text-xl w-7">{c.emoji}</span>
                      <div className="flex-1">
                        <div className="flex justify-between text-sm">
                          <span className="text-eu-text font-medium">{c.name}</span>
                          <span className="text-eu-muted">{c.count}</span>
                        </div>
                        <div className="mt-1 h-2 rounded-full bg-[#fafafa] overflow-hidden">
                          <motion.div
                            className="h-full rounded-full bg-[#fa520f]"
                            initial={{ width: 0 }}
                            animate={{ width: `${(c.count / max) * 100}%` }}
                            transition={{ delay: 0.2 + i * 0.08, duration: 0.6, ease: "easeOut" }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Highlights */}
          {data && data.highlights.length > 0 && (
            <section className="flex flex-col gap-2">
              {data.highlights.map((h, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 + i * 0.08 }}
                  className="eu-card p-4 flex items-center gap-3"
                >
                  <span className="text-lg">✨</span>
                  <p className="text-sm text-eu-text">{h}</p>
                </motion.div>
              ))}
            </section>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
