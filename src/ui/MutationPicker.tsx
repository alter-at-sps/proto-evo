import { SEASON_LABELS } from "../engine/simulation";
import type { MutationOption, Season, Traits } from "../engine/types";
import { CreaturePreview } from "./SpeciesEditor";

export function MutationPicker({
  options,
  traits,
  color,
  season,
  year,
  onChoose,
}: {
  options: MutationOption[];
  traits: Traits;
  color: string;
  season: Season;
  year: number;
  onChoose: (id: string) => void;
}) {
  return (
    <div className="overlay">
      <div className="modal">
        <h2>Mutace mezi sezónami</h2>
        <div className="muted">
          {SEASON_LABELS[season]} · rok {year} — vyber, kterou mutaci tvůj druh přijme.
        </div>
        <div className="row" style={{ marginTop: 14, gap: 20 }}>
          <CreaturePreview traits={traits} color={color} size={120} />
          <div className="muted" style={{ flex: 1 }}>
            Každé rozhodnutí vytvoří novou větev v evolučním stromě. Adaptuj se na
            přicházející období — nebo zůstaň stabilní.
          </div>
        </div>
        <div className="mut-grid">
          {options.map((o) => (
            <button key={o.id} className="mut" onClick={() => onChoose(o.id)}>
              <div className="mt">{o.label}</div>
              <div className="md">{o.description}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
