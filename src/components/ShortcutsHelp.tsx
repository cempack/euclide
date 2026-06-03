import { Modal } from "./ui";
import { SHORTCUTS } from "../lib/shortcuts";
import { get } from "../lib/i18n";

export default function ShortcutsHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title={get("app.shortcutsTitle", "Raccourcis")} width="max-w-lg">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {SHORTCUTS.map((group) => (
          <div key={group.group}>
            <p className="text-body-mute text-sm font-medium mb-2">{group.group}</p>
            <ul className="flex flex-col gap-2">
              {group.items.map((s) => (
                <li key={s.label} className="flex items-center justify-between gap-3">
                  <span className="text-sm text-on-surface">{s.label}</span>
                  <span className="flex items-center gap-1">
                    {s.keys.map((k) => (
                      <kbd key={k} className="eu-kbd">
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
      <p className="text-body-mute mt-5 text-center text-[12px]">
        {get("shortcuts.tip", "Ouvrez la palette (⌘K) et tapez.")}
      </p>
    </Modal>
  );
}
