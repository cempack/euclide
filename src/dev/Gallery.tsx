import { useState } from "react";
import { Copy, Download, Pencil, Plus, Search, Trash2, Upload } from "lucide-react";
import { EmptyState, Loading, useConfirm, useToast } from "../components/ui";
import {
  MetaDot,
  PageHeader,
  Panel,
  Segmented,
  ToolGroup,
  ToolSep,
  ToolSpacer,
  Toolbar,
} from "../components/layout";
import { Icon } from "../ui/Icon";
import { Kbd } from "../ui/Kbd";
import { MenuButton } from "../ui/Menu";
import { Switch } from "../ui/Switch";
import { tip } from "../ui/Tooltip";

/**
 * « Composants »: every piece of the UI kit on one page, in development only
 * (open the app with ?gallery). The visual tests capture it in both themes,
 * both densities and projection mode, so a change to a token shows here.
 */
const SWATCHES = [
  "chrome",
  "canvas",
  "panel",
  "panel-alt",
  "ink",
  "ink-muted",
  "ink-faint",
  "accent",
  "ok",
  "warn",
  "danger",
  "stage",
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="eu-t-label">{title}</h2>
      {children}
    </section>
  );
}

export default function Gallery() {
  const toast = useToast();
  const confirm = useConfirm();
  const [segment, setSegment] = useState("comfortable");
  const [on, setOn] = useState(true);
  const [filter, setFilter] = useState("all");
  const [tool, setTool] = useState("pen");

  return (
    <div className="h-full overflow-y-auto bg-canvas">
      <div className="eu-page mx-auto max-w-col">
        <PageHeader
          title="Composants"
          meta={
            <>
              <span>tokens v2</span>
              <MetaDot />
              <span>7 rôles typographiques</span>
              <MetaDot />
              <span>raised paper</span>
            </>
          }
          actions={
            <>
              <button className="eu-btn-ghost">
                <Icon icon={Upload} size={14} />
                Importer
              </button>
              <button className="eu-btn-primary">
                <Icon icon={Plus} size={14} />
                Nouveau
              </button>
            </>
          }
        />

        <Section title="Typographie">
          <div className="eu-panel eu-panel-pad flex flex-col gap-2">
            <p className="eu-t-page">Page — Mathématiques</p>
            <p className="eu-t-title">Titre — Fonctions de référence</p>
            <p className="eu-t-body">Corps — La fonction carré est définie sur ℝ par f(x) = x².</p>
            <p className="eu-t-small">Petit — 3 classes, 12 documents</p>
            <p className="eu-t-caption">légende — il y a 2 h · 471 Ko</p>
            <p className="eu-t-label">Étiquette de groupe</p>
            <p className="eu-t-metric">5 h 12</p>
          </div>
        </Section>

        <Section title="Couleurs">
          <div className="grid grid-cols-6 gap-2">
            {SWATCHES.map((name) => (
              <div key={name} className="flex flex-col gap-1">
                <span
                  className="h-10 rounded border border-line"
                  style={{ background: `var(--color-${name})` }}
                />
                <span className="eu-t-caption">{name}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Boutons">
          <div className="flex flex-wrap items-center gap-2">
            <button className="eu-btn-primary">Enregistrer</button>
            <button className="eu-btn-ghost">Annuler</button>
            <button className="eu-btn-quiet">Plus tard</button>
            <button className="eu-btn-danger">Supprimer</button>
            <button className="eu-btn-ghost" disabled>
              Indisponible
            </button>
            <button className="eu-btn-ghost eu-btn-sm">Petit</button>
            <button className="eu-btn-quiet eu-btn-icon" aria-label="Copier" {...tip("Copier", "mod+C")}>
              <Icon icon={Copy} />
            </button>
            <button className="eu-btn-quiet eu-btn-icon eu-btn-sm" aria-label="Modifier" {...tip("Modifier")}>
              <Icon icon={Pencil} />
            </button>
            <MenuButton
              label="Actions"
              items={[
                { label: "Renommer", icon: Pencil, keys: "F2", onSelect: () => toast("Renommer") },
                { label: "Dupliquer", icon: Copy, onSelect: () => toast("Dupliquer") },
                { label: "Exporter", icon: Download, disabled: true, onSelect: () => {} },
                "separator",
                {
                  label: "Supprimer",
                  icon: Trash2,
                  danger: true,
                  onSelect: () => toast("Supprimé", "error"),
                },
              ]}
              className="eu-btn-ghost eu-btn-sm"
            >
              Actions…
            </MenuButton>
          </div>
        </Section>

        <Section title="Champs">
          <div className="grid grid-cols-2 gap-3">
            <input className="eu-input" placeholder="Titre de la séquence" />
            <select className="eu-select" defaultValue="2nde">
              <option value="2nde">Seconde</option>
              <option value="1ere">Première</option>
            </select>
            <textarea className="eu-textarea col-span-2" rows={2} placeholder="Notes de la séance…" />
            <div className="flex items-center gap-2">
              <input className="eu-input eu-field-sm" placeholder="Petit champ" />
              <select className="eu-select eu-field-sm w-32" defaultValue="a">
                <option value="a">Sans cours</option>
              </select>
            </div>
            <label className="flex items-center gap-2 eu-t-body">
              <input type="checkbox" defaultChecked /> Coché
              <input type="checkbox" className="ml-3" /> Non coché
              <span className="ml-3 flex items-center gap-2">
                <Switch checked={on} onChange={setOn} label="Écran maintenu" /> Écran maintenu
              </span>
            </label>
          </div>
        </Section>

        <Section title="Sélection">
          <div className="flex flex-wrap items-center gap-3">
            <Segmented
              value={segment}
              onChange={setSegment}
              label="Densité"
              options={[
                { value: "comfortable", label: "Confortable" },
                { value: "compact", label: "Compact" },
              ]}
            />
            <div className="flex items-center gap-1">
              {["all", "pdf", "notes"].map((f) => (
                <button
                  key={f}
                  className="eu-filter"
                  aria-pressed={filter === f}
                  onClick={() => setFilter(f)}
                >
                  {f === "all" ? "Tout" : f === "pdf" ? "PDF" : "Notes"}
                </button>
              ))}
            </div>
            <span className="eu-chip">B204</span>
            <span className="eu-chip-ok">connecté</span>
            <span className="eu-chip-warn">aujourd'hui</span>
            <span className="eu-chip-danger">en retard</span>
            <span className="eu-chip-accent">2NDE7</span>
            <Kbd keys="mod+shift+K" />
          </div>
        </Section>

        <Section title="Barre d'outils">
          <div className="eu-panel overflow-hidden">
            <Toolbar>
              <ToolGroup label="Outils">
                {["pen", "eraser", "text"].map((t) => (
                  <button
                    key={t}
                    className="eu-btn-quiet eu-btn-sm eu-btn-toggle"
                    aria-pressed={tool === t}
                    onClick={() => setTool(t)}
                  >
                    {t === "pen" ? "Stylo" : t === "eraser" ? "Gomme" : "Texte"}
                  </button>
                ))}
              </ToolGroup>
              <ToolSep />
              <ToolGroup collapse label="Zoom">
                <button className="eu-btn-quiet eu-btn-sm">−</button>
                <span className="eu-t-caption">100 %</span>
                <button className="eu-btn-quiet eu-btn-sm">+</button>
              </ToolGroup>
              <ToolSpacer />
              <button className="eu-btn-primary eu-btn-sm">Enregistrer</button>
            </Toolbar>
          </div>
        </Section>

        <Section title="Panneaux">
          <div className="grid grid-cols-2 gap-4">
            <Panel
              title="Rappels"
              action={
                <button
                  className="eu-btn-quiet eu-btn-icon eu-btn-sm"
                  aria-label="Ajouter"
                  {...tip("Ajouter")}
                >
                  <Icon icon={Plus} />
                </button>
              }
            >
              <div className="eu-divide">
                <div className="eu-row eu-row-hover">
                  <input type="checkbox" /> <span className="flex-1">Rendre les copies</span>
                  <span className="eu-chip-warn">aujourd'hui</span>
                </div>
                <div className="eu-row eu-row-hover" aria-selected="true">
                  <input type="checkbox" defaultChecked /> <span className="flex-1">Photocopies</span>
                  <span className="eu-chip">dans 3j</span>
                </div>
              </div>
            </Panel>
            <Panel title="Vide" pad>
              <EmptyState
                icon={<Icon icon={Search} size={20} />}
                title="Aucun résultat"
                hint="Essayez un autre mot."
              />
            </Panel>
          </div>
        </Section>

        <Section title="Attente">
          <div className="grid grid-cols-3 gap-4 items-center">
            <Loading label="Chargement…" />
            <div className="flex flex-col gap-2">
              <span className="eu-skeleton h-4 w-3/4" />
              <span className="eu-skeleton h-4 w-1/2" />
              <span className="eu-skeleton h-4 w-2/3" />
            </div>
            <div className="eu-gauge">
              <i style={{ width: "40%" }} />
            </div>
          </div>
        </Section>

        <Section title="Dialogues et messages">
          <div className="flex flex-wrap gap-2">
            <button className="eu-btn-ghost" onClick={() => toast("Document importé", "success")}>
              Toast
            </button>
            <button
              className="eu-btn-ghost"
              onClick={() =>
                toast("Note supprimée", "info", {
                  action: { label: "Annuler", run: () => toast("Restaurée") },
                })
              }
            >
              Toast avec action
            </button>
            <button
              className="eu-btn-ghost"
              onClick={() =>
                void confirm.ask({
                  title: "Supprimer « Chapitre 3 » ?",
                  message: "Le document part à la corbeille pendant 30 jours.",
                  confirmLabel: "Supprimer",
                  danger: true,
                })
              }
            >
              Confirmation
            </button>
          </div>
        </Section>
      </div>
    </div>
  );
}
