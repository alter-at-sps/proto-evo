import { useEffect, useRef } from "react";
import { drawCreature } from "../render/render";
import {
  ARCHETYPES,
  COLORS,
  deriveStats,
  DIET_LABELS,
  DIETS,
  POINT_BUDGET,
  pointsUsed,
  randomPlayerTraits,
  TRAIT_MAX,
} from "../engine/species";
import { makeRng } from "../engine/rng";
import type { Diet, Traits } from "../engine/types";

const TRAIT_INFO: { key: keyof Omit<Traits, "diet">; label: string; hint: string }[] = [
  { key: "size", label: "Velikost", hint: "síla, odolnost, vyšší spotřeba" },
  { key: "teeth", label: "Zuby", hint: "útok a efektivita lovu" },
  { key: "limbs", label: "Končetiny", hint: "rychlost a pohyb" },
  { key: "wings", label: "Křídla", hint: "migrace a únik" },
  { key: "hide", label: "Kůže", hint: "odolnost a izolace" },
];

export function CreaturePreview({
  traits,
  color,
  size = 160,
  animate = true,
}: {
  traits: Traits;
  color: string;
  size?: number;
  animate?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const traitsRef = useRef(traits);
  const colorRef = useRef(color);
  traitsRef.current = traits;
  colorRef.current = color;

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = size * dpr;
    c.height = size * dpr;
    const ctx = c.getContext("2d")!;
    let raf = 0;
    const start = performance.now();
    const render = (now: number) => {
      const t = animate ? (now - start) / 1000 : 0;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);
      drawCreature(
        ctx,
        traitsRef.current,
        colorRef.current,
        size / 2,
        size / 2 - size * 0.03,
        size * 0.92,
        t
      );
      if (animate) raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, [size, animate]);

  return <canvas ref={ref} style={{ width: size, height: size }} />;
}

function TraitDots({
  value,
  onChange,
}: {
  value: number;
  onChange?: (v: number) => void;
}) {
  return (
    <div className="dots">
      {Array.from({ length: TRAIT_MAX + 1 }, (_, i) => (
        <div
          key={i}
          className={"dot" + (i <= value && (i > 0 || value > 0) ? " on" : "")}
          style={{ opacity: i === 0 ? 0.4 : 1 }}
          onClick={() => onChange?.(i)}
          title={String(i)}
        />
      ))}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="d">
      <span>{label}</span>
      <div className="row" style={{ gap: 6 }}>
        <div className="bar">
          <div style={{ width: `${Math.min(100, (value / 5) * 100)}%` }} />
        </div>
        <span className="muted" style={{ width: 26, textAlign: "right" }}>
          {value.toFixed(1)}
        </span>
      </div>
    </div>
  );
}

export function SpeciesEditor({
  traits,
  color,
  onChange,
  onColorChange,
}: {
  traits: Traits;
  color: string;
  onChange?: (t: Traits) => void;
  onColorChange?: (c: string) => void;
}) {
  const used = pointsUsed(traits);
  const stats = deriveStats(traits);
  const editable = !!onChange;

  const setTrait = (key: keyof Omit<Traits, "diet">, v: number) => {
    if (!onChange) return;
    const next = { ...traits, [key]: v };
    if (pointsUsed(next) <= POINT_BUDGET) onChange(next);
  };

  return (
    <div>
      <div className="card" style={{ textAlign: "center" }}>
        <CreaturePreview traits={traits} color={color} size={150} />
        <div className="muted">{DIET_LABELS[traits.diet]}</div>
        {editable && (
          <div style={{ marginTop: 10 }}>
            <div className="diet-row" style={{ justifyContent: "center", marginBottom: 8 }}>
              {ARCHETYPES.map((a) => (
                <button key={a.name} title={a.name} onClick={() => onChange?.({ ...a.traits })}>
                  {a.emoji} {a.name}
                </button>
              ))}
              <button
                onClick={() => onChange?.(randomPlayerTraits(makeRng((Math.random() * 1e9) | 0)))}
              >
                🎲 Náhodný
              </button>
            </div>
            {onColorChange && (
              <div className="row" style={{ justifyContent: "center", gap: 6 }}>
                {COLORS.map((c) => (
                  <span
                    key={c}
                    onClick={() => onColorChange(c)}
                    className="swatch"
                    style={{
                      background: c,
                      cursor: "pointer",
                      width: 20,
                      height: 20,
                      outline: c === color ? "2px solid #fff" : "none",
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="card">
        <h3>Tělo</h3>
        {TRAIT_INFO.map((ti) => (
          <div className="trait" key={ti.key}>
            <div className="label">
              <span>
                {ti.label} <strong style={{ color: "var(--green-bright)" }}>{traits[ti.key]}</strong>
              </span>
              <span className="muted">{ti.hint}</span>
            </div>
            <TraitDots
              value={traits[ti.key]}
              onChange={editable ? (v) => setTrait(ti.key, v) : undefined}
            />
          </div>
        ))}

        <div className="trait">
          <div className="label">
            <span>Strava</span>
          </div>
          <div className="diet-row">
            {DIETS.map((d: Diet) => (
              <button
                key={d}
                className={traits.diet === d ? "active" : ""}
                disabled={!editable}
                onClick={() => onChange?.({ ...traits, diet: d })}
              >
                {DIET_LABELS[d]}
              </button>
            ))}
          </div>
        </div>

        <div className="label">
          <span>Body</span>
          <span className={used > POINT_BUDGET ? "" : "muted"}>
            {used} / {POINT_BUDGET}
          </span>
        </div>
        <div className={"budget" + (used > POINT_BUDGET ? " over" : "")}>
          <div style={{ width: `${Math.min(100, (used / POINT_BUDGET) * 100)}%` }} />
        </div>
        {editable && (
          <div className="muted" style={{ marginTop: 6 }}>
            Nelze mít vše najednou — rozpočet tě nutí specializovat se.
          </div>
        )}
      </div>

      <div className="card">
        <h3>Odvozené statistiky</h3>
        <div className="derived">
          <Stat label="Rychlost" value={stats.speed} />
          <Stat label="Síla" value={stats.strength} />
          <Stat label="Odolnost" value={stats.resilience} />
          <Stat label="Odolnost chladu" value={stats.coldResist} />
          <Stat label="Odolnost horku" value={stats.heatResist} />
          <Stat label="Metabolismus" value={stats.metabolism} />
        </div>
      </div>
    </div>
  );
}
