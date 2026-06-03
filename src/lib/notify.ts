import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { api, isTauri } from "./api";

/**
 * On launch, gently surface a single OS notification if reminders are pending.
 * Calm by design: one notification, never nagging during class.
 */
export async function notifyPendingReminders() {
  if (!isTauri()) return;
  try {
    let granted = await isPermissionGranted();
    if (!granted) granted = (await requestPermission()) === "granted";
    if (!granted) return;

    const reminders = await api.listReminders();
    const pending = reminders.filter((r) => !r.done);
    if (pending.length === 0) return;

    // Only gently notify for due today/over or all if none dated? Keep simple + calm.
    const dueSoon = pending.filter((r) => {
      if (!r.due_at) return false;
      const d = new Date(r.due_at.replace(" ", "T"));
      if (Number.isNaN(d.getTime())) return false;
      const dayDiff = Math.floor((d.getTime() - Date.now()) / (1000 * 3600 * 24));
      return dayDiff <= 1;
    });
    const toNotify = dueSoon.length > 0 ? dueSoon : pending.slice(0, 3);

    const fun = [
      "Rappel du jour",
      "À ne pas oublier",
      "Petit pense-bête",
      "Mission classe",
    ];
    const titlePick = fun[Math.floor(Math.random() * fun.length)];
    const body =
      toNotify.length === 1
        ? toNotify[0].title
        : `${toNotify.length} rappels en attente (${pending.length} au total).`;
    sendNotification({ title: titlePick, body });
  } catch {
    // notifications are a nicety, never block the app
  }
}
