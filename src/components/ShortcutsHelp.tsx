import { Modal } from "./ui";
import { get } from "../lib/i18n";
import { keymapGroups } from "../lib/keymap";
import { Kbd } from "../ui/Kbd";

type Row = { label: string } & ({ keys: string } | { gesture: string[] });

/** What the keymap cannot say: the mouse on tabs, and the palette's prefixes. */
const EXTRA: { group: string; items: Row[] }[] = [
  {
    group: get("shortcuts.groupTabs", "Barre d'onglets"),
    items: [
      {
        gesture: [get("shortcuts.doubleClick", "Double-clic")],
        label: get("shortcuts.pinTab", "Épingler l'onglet"),
      },
      {
        gesture: [get("shortcuts.drag", "Glisser")],
        label: get("shortcuts.reorderTab", "Réordonner les onglets"),
      },
      {
        gesture: [get("shortcuts.middleClick", "Clic milieu")],
        label: get("shortcuts.closeTab", "Fermer l'onglet"),
      },
    ],
  },
  {
    group: get("shortcuts.groupPalette", "Dans la palette"),
    items: [
      { gesture: [">"], label: get("palette.prefixCommands", "Commandes") },
      { gesture: ["@"], label: get("palette.prefixCourses", "Cours") },
      { gesture: ["#"], label: get("palette.prefixDocs", "Documents") },
      { gesture: ["↑", "↓"], label: get("shortcuts.navigateList", "Parcourir les résultats") },
    ],
  },
];

export default function ShortcutsHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  const groups: { group: string; items: Row[] }[] = [...keymapGroups(), ...EXTRA];
  return (
    <Modal open={open} onClose={onClose} title={get("app.shortcutsTitle", "Raccourcis")} width="max-w-2xl">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-6">
        {groups.map((group) => (
          <div key={group.group}>
            <p className="eu-t-label mb-2.5">{group.group}</p>
            <ul className="flex flex-col">
              {group.items.map((s) => (
                <li
                  key={s.label}
                  className="flex items-center justify-between gap-4 py-1.5 border-b border-line last:border-b-0"
                >
                  <span className="eu-t-body text-ink">{s.label}</span>
                  {"keys" in s ? (
                    <Kbd keys={s.keys} className="shrink-0" />
                  ) : (
                    <span className="flex items-center gap-1 shrink-0">
                      {s.gesture.map((k) => (
                        <kbd key={k} className="eu-kbd">
                          {k}
                        </kbd>
                      ))}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Modal>
  );
}
