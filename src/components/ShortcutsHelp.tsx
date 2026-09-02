import { Modal } from "./ui";
import { SHORTCUTS } from "../lib/shortcuts";
import { get } from "../lib/i18n";

export default function ShortcutsHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={get("app.shortcutsTitle", "Raccourcis")}
      width="max-w-2xl"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-6">
        {SHORTCUTS.map((group) => (
          <div key={group.group}>
            <p className="eu-t-label mb-2.5">{group.group}</p>
            <ul className="flex flex-col">
              {group.items.map((s) => (
                <li
                  key={s.label}
                  className="flex items-center justify-between gap-4 py-1.5 border-b border-line last:border-b-0"
                >
                  <span className="eu-t-body text-ink">{s.label}</span>
                  <span className="flex items-center gap-1 shrink-0">
                    {s.keys.map((k) => (
                      <kbd key={k} className="eu-kbd px-1.5 h-5 text-[10px]">
                        {k}
                      </kbd>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Modal>
  );
}
