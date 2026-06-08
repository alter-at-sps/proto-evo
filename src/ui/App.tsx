import { useEffect, useRef, useState } from "react";
import { EcoGame, type EcoSnapshot } from "../engine/ecoGame";
import { generateWorld } from "../engine/world";
import { drawWorld, drawAgents, BIOME_LABELS } from "../render/render";
import {
  ARCHETYPES,
  defaultTraits,
  DIET_LABELS,
} from "../engine/species";
import { MakerForm, MakerModal, type MakerState } from "./Maker";

const CELL = 6;
const BASE_DT = 1; // časový krok při rychlosti 1×
const SPEEDS = [0, 1, 2, 4, 8];

type Phase = "maker" | "play";

function randomSeed(): string {
  return Math.floor(Math.random() * 1_000_000).toString();
}

export function App() {
  const [phase, setPhase] = useState<Phase>("maker");
  const [seedInput, setSeedInput] = useState(randomSeed());
  const [maker, setMaker] = useState<MakerState>({
    name: "Glemur",
    color: "#4caf7d",
    traits: defaultTraits(),
    count: 24,
  });

  const ecoRef = useRef<EcoGame | null>(null);
  const [snap, setSnap] = useState<EcoSnapshot | null>(null);
  const [speed, setSpeed] = useState(2);
  const speedRef = useRef(2);
  const [makerOpen, setMakerOpen] = useState(false);
  const makerOpenRef = useRef(false);
  makerOpenRef.current = makerOpen;
  const [hover, setHover] = useState<{ tx: number; ty: number; cx: number; cy: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    speedRef.current = makerOpen ? 0 : speed;
  }, [speed, makerOpen]);

  const setMakerPartial = (s: Partial<MakerState>) => setMaker((m) => ({ ...m, ...s }));

  function startWorld() {
    const game = new EcoGame(seedInput);
    game.introduce(maker.name || "Druh", maker.color, maker.traits, maker.count);
    ecoRef.current = game;
    setSnap(game.snapshot());
    setSpeed(2);
    setPhase("play");
  }

  function releaseNewSpecies() {
    const game = ecoRef.current;
    if (!game) return;
    game.introduce(maker.name || game.suggestName(), maker.color, maker.traits, maker.count);
    setMakerOpen(false);
    // připrav další návrh
    setMaker({
      name: game.suggestName(),
      color: game.suggestColor(),
      traits: defaultTraits(),
      count: 24,
    });
  }

  // herní smyčka
  useEffect(() => {
    if (phase !== "play") return;
    let raf = 0;
    let frames = 0;
    const loop = () => {
      const game = ecoRef.current;
      if (game) {
        const sp = speedRef.current;
        if (sp > 0) game.tick(sp * BASE_DT);
        const c = canvasRef.current;
        if (c) {
          const ctx = c.getContext("2d")!;
          drawWorld(ctx, game.map, game.eco.food, game.eco.foodCap, { cell: CELL });
          drawAgents(ctx, game.eco.creatures, game.eco.species, { cell: CELL });
        }
        frames++;
        if (frames % 6 === 0) setSnap(game.snapshot());
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  // klávesy: mezerník = pauza, 1–5 = rychlost
  useEffect(() => {
    if (phase !== "play") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.code === "Space") {
        e.preventDefault();
        setSpeed((s) => (s === 0 ? 2 : 0));
      } else if (e.key >= "1" && e.key <= "5") {
        const idx = Number(e.key) - 1;
        if (idx < SPEEDS.length) setSpeed(SPEEDS[idx]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase]);

  if (phase === "maker") {
    return (
      <MakerSetup
        seedInput={seedInput}
        setSeedInput={setSeedInput}
        maker={maker}
        set={setMakerPartial}
        onStart={startWorld}
      />
    );
  }

  const game = ecoRef.current!;
  return (
    <div className="app">
      <TopBar snap={snap} speed={speed} setSpeed={setSpeed} onNew={() => setPhase("maker")} />
      <div className="main">
        <div className="map-wrap">
          <canvas
            ref={canvasRef}
            className="world"
            width={game.map.width * CELL}
            height={game.map.height * CELL}
            onMouseMove={(e) => {
              const c = canvasRef.current;
              if (!c) return;
              const rect = c.getBoundingClientRect();
              const tx = Math.floor(((e.clientX - rect.left) / rect.width) * game.map.width);
              const ty = Math.floor(((e.clientY - rect.top) / rect.height) * game.map.height);
              if (tx < 0 || ty < 0 || tx >= game.map.width || ty >= game.map.height) setHover(null);
              else setHover({ tx, ty, cx: e.clientX, cy: e.clientY });
            }}
            onMouseLeave={() => setHover(null)}
          />
          {snap && (
            <div className="season-badge">
              <div>
                <strong>Ekosystém</strong> · čas {snap.time}
              </div>
              <div className="wx">{snap.rain > 0.6 ? "🌧 období dešťů" : snap.rain < 0.4 ? "☀ sucho" : "⛅ mírno"}</div>
              <div className="wx">
                {snap.totalCreatures} tvorů · {snap.aliveSpecies} druhů
              </div>
            </div>
          )}
          <button className="release-btn" onClick={() => setMakerOpen(true)}>
            🧬 Vypustit nový druh
          </button>
          {hover && <TileTooltip game={game} hover={hover} />}
        </div>

        <Sidebar game={game} snap={snap} />
      </div>

      {makerOpen && (
        <MakerModal
          state={maker}
          set={setMakerPartial}
          onSubmit={releaseNewSpecies}
          onCancel={() => setMakerOpen(false)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function TopBar({
  snap,
  speed,
  setSpeed,
  onNew,
}: {
  snap: EcoSnapshot | null;
  speed: number;
  setSpeed: (s: number) => void;
  onNew: () => void;
}) {
  return (
    <div className="topbar">
      <div className="brand">
        EvoWorld<span className="sub">živý ekosystém</span>
      </div>
      {snap && (
        <>
          <Stat k="Tvorů" v={snap.totalCreatures} />
          <Stat k="Druhů" v={`${snap.aliveSpecies}/${snap.totalSpecies}`} />
          <Stat k="Narození" v={snap.births} />
          <Stat k="Úmrtí" v={snap.deaths} />
        </>
      )}
      <div className="spacer" />
      <div className="speed-group" title="Mezerník = pauza · klávesy 1–5 = rychlost">
        {SPEEDS.map((s) => (
          <button key={s} className={speed === s ? "active" : ""} onClick={() => setSpeed(s)}>
            {s === 0 ? "⏸" : `${s}×`}
          </button>
        ))}
      </div>
      <button onClick={onNew}>Nový svět</button>
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string | number }) {
  return (
    <div className="stat">
      <span className="k">{k}</span>
      <span className="v">{v}</span>
    </div>
  );
}

function Sidebar({ game, snap }: { game: EcoGame; snap: EcoSnapshot | null }) {
  if (!snap) return null;
  return (
    <div className="sidebar">
      <div className="tab-body">
        <div className="card">
          <div className="row">
            <h3 style={{ flex: 1 }}>Druhy v ekosystému</h3>
            <span className="muted">{snap.totalCreatures} tvorů</span>
          </div>
          <Sparkline data={game.history} color="#6fdca0" />
          <div className="muted" style={{ margin: "4px 0 8px" }}>
            Celkový počet živých tvorů v čase.
          </div>
          <div className="splist">
            {snap.roster.map((r) => (
              <div className="sp" key={r.id} style={{ opacity: r.alive ? 1 : 0.4 }}>
                <span className="swatch" style={{ background: r.color }} />
                <span style={{ flex: 1 }}>{r.name}</span>
                <span className="tag">{DIET_LABELS[r.diet]}</span>
                <span className="muted" style={{ minWidth: 36, textAlign: "right" }}>
                  {r.alive ? r.count : "✝"}
                </span>
                {r.alive && (
                  <button
                    className="mini"
                    title="Přidat jedince"
                    onClick={() => game.reinforce(r.id, 10)}
                  >
                    +
                  </button>
                )}
              </div>
            ))}
            {snap.roster.length === 0 && <div className="muted">Zatím žádné druhy.</div>}
          </div>
        </div>

        <div className="card">
          <h3>Jak to funguje</h3>
          <div className="muted" style={{ fontSize: 12, lineHeight: 1.6 }}>
            Jsi <strong>maker</strong> — navrhuješ druhy a vypouštíš je. Svět pak žije
            sám: tvorové shánějí potravu, loví, prchají, množí se a{" "}
            <strong>mutují</strong> (evoluce). Sleduj, kdo přežije.
          </div>
        </div>

        <div className="card">
          <h3>Kronika</h3>
          <div className="log">
            {snap.events.map((e, i) => (
              <div className={"e " + (e.kind === "extinct" ? "extinction" : e.kind === "intro" ? "season" : "info")} key={i}>
                <span className="muted">[{Math.floor(e.time)}]</span> {e.text}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function TileTooltip({
  game,
  hover,
}: {
  game: EcoGame;
  hover: { tx: number; ty: number; cx: number; cy: number };
}) {
  const idx = hover.ty * game.map.width + hover.tx;
  const tile = game.map.tiles[idx];
  const food = game.eco.food[idx];
  const cap = game.eco.foodCap[idx];
  // tvorové v okolí kurzoru, seskupení dle druhu
  const counts = new Map<number, number>();
  for (const c of game.eco.creatures) {
    if (!c.alive) continue;
    const dx = c.x - (hover.tx + 0.5);
    const dy = c.y - (hover.ty + 0.5);
    if (dx * dx + dy * dy <= 9) counts.set(c.sp, (counts.get(c.sp) ?? 0) + 1);
  }
  const list = [...counts.entries()]
    .map(([sp, n]) => ({ sp: game.eco.species[sp], n }))
    .sort((a, b) => b.n - a.n);
  return (
    <div className="tile-tip" style={{ left: hover.cx + 16, top: hover.cy + 16 }}>
      <div className="tt-head">
        {BIOME_LABELS[tile.biome]} <span className="muted">[{hover.tx}, {hover.ty}]</span>
      </div>
      <div className="muted">potrava {Math.round(food)}/{Math.round(cap)}</div>
      {list.length === 0 ? (
        <div className="muted">žádní tvorové poblíž</div>
      ) : (
        list.map((e) => (
          <div className="tt-sp" key={e.sp.id}>
            <span className="swatch" style={{ background: e.sp.color, width: 10, height: 10 }} />
            <span style={{ flex: 1 }}>{e.sp.name}</span>
            <span className="muted">{e.n}</span>
          </div>
        ))
      )}
    </div>
  );
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const w = 320;
  const h = 50;
  if (data.length < 2) return <div className="muted">Sbírám data…</div>;
  const max = Math.max(1, ...data);
  const step = w / (data.length - 1);
  const pts = data
    .map((v, i) => `${(i * step).toFixed(1)},${(h - (v / max) * (h - 4) - 2).toFixed(1)}`)
    .join(" ");
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: "block" }}>
      <polygon points={`0,${h} ${pts} ${w},${h}`} fill={color} opacity={0.18} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.8} />
    </svg>
  );
}

// ---------------------------------------------------------------------------

function MakerSetup({
  seedInput,
  setSeedInput,
  maker,
  set,
  onStart,
}: {
  seedInput: string;
  setSeedInput: (s: string) => void;
  maker: MakerState;
  set: (s: Partial<MakerState>) => void;
  onStart: () => void;
}) {
  return (
    <div className="setup">
      <div style={{ marginBottom: 18 }}>
        <div className="tag" style={{ display: "inline-block", marginBottom: 10 }}>
          ŽIVÝ EKOSYSTÉM
        </div>
        <h1>EvoWorld</h1>
        <div className="muted" style={{ fontSize: 16 }}>
          Jsi <strong>maker</strong>. Navrhni první druh a vypusť ho do
          procedurálního světa — ekosystém pak žije sám. Tvorové loví, prchají,
          množí se a evolučně se mění. Kdykoli můžeš vypustit další druh a sledovat,
          co se stane.
        </div>
      </div>

      <div className="setup-grid">
        <div>
          <div className="card">
            <h3>Svět</h3>
            <div className="field">
              <label>Seed (každý seed = unikátní svět)</label>
              <div className="row">
                <input value={seedInput} onChange={(e) => setSeedInput(e.target.value)} />
                <button onClick={() => setSeedInput(randomSeed())}>🎲</button>
              </div>
            </div>
            <div className="preview-box">
              <ProcPreview seed={seedInput} />
            </div>
            <div className="muted" style={{ marginTop: 8 }}>
              Perlin noise · biomy · řeky · klimatické zóny.
            </div>
          </div>

          <div className="card">
            <h3>Tip pro start</h3>
            <div className="diet-row">
              {ARCHETYPES.map((a) => (
                <button key={a.name} onClick={() => set({ traits: { ...a.traits } })}>
                  {a.emoji} {a.name}
                </button>
              ))}
            </div>
            <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>
              Začni býložravcem — bez kořisti by dravci hned vyhynuli.
            </div>
          </div>
        </div>

        <div>
          <MakerForm
            state={maker}
            set={set}
            onSubmit={onStart}
            submitLabel="Vytvořit svět a vypustit druh →"
          />
        </div>
      </div>
    </div>
  );
}

/** Malý náhled procedurálního světa pro daný seed. */
function ProcPreview({ seed }: { seed: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const w = generateWorld(seed, 120, 70);
    const food = new Float32Array(w.width * w.height);
    const cap = new Float32Array(w.width * w.height);
    for (let i = 0; i < food.length; i++) {
      cap[i] = w.tiles[i].fertility * 100;
      food[i] = cap[i] * 0.6;
    }
    const ctx = c.getContext("2d")!;
    drawWorld(ctx, w, food, cap, { cell: c.width / w.width });
  }, [seed]);
  return <canvas ref={ref} width={300} height={175} style={{ borderRadius: 8 }} />;
}
