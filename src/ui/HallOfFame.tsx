import { uniquenessScore } from "../engine/game";
import { DIET_LABELS } from "../engine/species";
import type { HallEntry } from "../engine/types";

const MEDALS = ["🥇", "🥈", "🥉"];

export function HallOfFame({
  hall,
  onClear,
}: {
  hall: HallEntry[];
  onClear: () => void;
}) {
  const bySurvival = [...hall].sort((a, b) => b.survivedSeasons - a.survivedSeasons).slice(0, 3);
  const byTerritory = [...hall].sort((a, b) => b.peakTerritory - a.peakTerritory).slice(0, 3);
  const byUnique = [...hall]
    .sort((a, b) => uniquenessScore(b.finalTraits) - uniquenessScore(a.finalTraits))
    .slice(0, 3);

  return (
    <div>
      <div className="card">
        <h3>🏆 Žebříček</h3>
        {hall.length === 0 && (
          <div className="muted">
            Zatím žádné vyhynulé druhy. Až nějaký vymře, objeví se zde se svým
            příběhem.
          </div>
        )}
        {hall.length > 0 && (
          <>
            <Board title="Nejdelší přežití" items={bySurvival} render={(e) => `${e.survivedSeasons} sezón`} />
            <Board title="Největší území" items={byTerritory} render={(e) => `${e.peakTerritory} dlaždic`} />
            <Board
              title="Nejunikátnější druh"
              items={byUnique}
              render={(e) => `skóre ${uniquenessScore(e.finalTraits)}`}
            />
          </>
        )}
      </div>

      <div className="card hall">
        <div className="row">
          <h3 style={{ flex: 1 }}>💀 Hall of Fame</h3>
          {hall.length > 0 && (
            <button onClick={onClear} style={{ fontSize: 11, padding: "4px 8px" }}>
              Vymazat
            </button>
          )}
        </div>
        {hall.map((e) => (
          <div className="entry" key={e.id}>
            <span className="swatch" style={{ background: e.color }} />
            <div style={{ flex: 1 }}>
              <strong>{e.name}</strong>
              <div className="muted">
                {DIET_LABELS[e.finalTraits.diet]} · přežil {e.survivedSeasons} sezón ·
                vrchol {e.peakPopulation} jedinců · {e.nodeCount} mutací · {e.cause}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Board({
  title,
  items,
  render,
}: {
  title: string;
  items: HallEntry[];
  render: (e: HallEntry) => string;
}) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div className="muted" style={{ marginBottom: 4 }}>
        {title}
      </div>
      {items.map((e, i) => (
        <div className="row" key={e.id} style={{ fontSize: 12, padding: "2px 0" }}>
          <span className="medal">{MEDALS[i] ?? ""}</span>
          <span className="swatch" style={{ background: e.color }} />
          <span style={{ flex: 1 }}>{e.name}</span>
          <span className="muted">{render(e)}</span>
        </div>
      ))}
    </div>
  );
}
