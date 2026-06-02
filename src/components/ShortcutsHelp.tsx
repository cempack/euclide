import { Modal } from "./ui";
import { SHORTCUTS } from "../lib/shortcuts";

export default function ShortcutsHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Raccourcis clavier" width="max-w-lg">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {SHORTCUTS.map((group) => (
          <div key={group.group}>
            <p className="eu-sub font-medium mb-2">{group.group}</p>
            <ul className="flex flex-col gap-2">
              {group.items.map((s) => (
                <li key={s.label} className="flex items-center justify-between gap-3">
                  <span className="text-sm text-[#1f1f1f]">{s.label}</span>
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
      <p className="eu-sub mt-5 text-center text-[12px]">
        Astuce : ouvrez la palette avec la touche de commande puis tapez ce que vous cherchez.
      </p>
    </Modal>
  );
}
