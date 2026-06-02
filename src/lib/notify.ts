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

    sendNotification({
      title: "Euclide",
      body:
        pending.length === 1
          ? `Un rappel : ${pending[0].title}`
          : `${pending.length} rappels vous attendent aujourd'hui.`,
    });
  } catch {
    // notifications are a nicety, never block the app
  }
}
