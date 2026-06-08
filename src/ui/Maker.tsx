import { SpeciesEditor } from "./SpeciesEditor";
import type { Traits } from "../engine/types";

export interface MakerState {
  name: string;
  color: string;
  traits: Traits;
  count: number;
}

/** Formulář „makera": návrh druhu + počet jedinců k vypuštění. */
export function MakerForm({
  state,
  set,
  onSubmit,
  submitLabel,
}: {
  state: MakerState;
  set: (s: Partial<MakerState>) => void;
  onSubmit: () => void;
  submitLabel: string;
}) {
  return (
    <div>
      <div className="field">
        <label>Jméno druhu</label>
        <input value={state.name} onChange={(e) => set({ name: e.target.value })} />
      </div>

      <SpeciesEditor
        traits={state.traits}
        color={state.color}
        onChange={(t) => set({ traits: t })}
        onColorChange={(c) => set({ color: c })}
      />

      <div className="field">
        <label>
          Počet vypuštěných jedinců: <strong>{state.count}</strong>
        </label>
        <input
          type="range"
          min={5}
          max={50}
          value={state.count}
          onChange={(e) => set({ count: Number(e.target.value) })}
          style={{ width: "100%" }}
        />
      </div>

      <button
        className="primary"
        style={{ width: "100%", padding: 13, fontSize: 15 }}
        onClick={onSubmit}
      >
        {submitLabel}
      </button>
    </div>
  );
}

export function MakerModal({
  state,
  set,
  onSubmit,
  onCancel,
}: {
  state: MakerState;
  set: (s: Partial<MakerState>) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="overlay">
      <div className="modal">
        <div className="row">
          <h2 style={{ flex: 1 }}>🧬 Vypustit nový druh</h2>
          <button onClick={onCancel}>Zavřít</button>
        </div>
        <div className="muted" style={{ marginBottom: 10 }}>
          Navrhni nový druh a vypusť ho do běžícího ekosystému. Začne žít po svém.
        </div>
        <MakerForm state={state} set={set} onSubmit={onSubmit} submitLabel="Vypustit do světa →" />
      </div>
    </div>
  );
}
