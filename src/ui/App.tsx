import { useEffect, useRef, useState } from "react";
import { Game, clearHall, loadHall } from "../engine/game";
import {
  SEASON_LABELS,
  WEATHER_LABELS,
} from "../engine/simulation";
import {
  COLORS,
  defaultTraits,
  DIET_LABELS,
} from "../engine/species";
import { generateWorld } from "../engine/world";
import { Simulation } from "../engine/simulation";
import {
  drawWorld,
  drawPopulations,
  drawDisasters,
} from "../render/render";
import type { GameSnapshot } from "../engine/game";
import type { Traits, Weather } from "../engine/types";
import { SpeciesEditor } from "./SpeciesEditor";
import { MutationPicker } from "./MutationPicker";
import { EvolutionTreeView } from "./EvolutionTreeView";
import { HallOfFame } from "./HallOfFame";

const CELL = 6;
const BASE_TPS = 3; // ticků za sekundu při rychlosti 1×
const SPEEDS = [0, 1, 2, 4, 8];

type Phase = "setup" | "play";
type Tab = "info" | "editor" | "tree" | "hall";

function randomSeed(): string {
  return Math.floor(Math.random() * 1_000_000).toString();
}

export function App() {
  const [phase, setPhase] = useState<Phase>("setup");
  const [seedInput, setSeedInput] = useState(randomSeed());
  const [name, setName] = useState("Tvůj druh");
  const [traits, setTraits] = useState<Traits>(defaultTraits());
  const [color, setColor] = useState(COLORS[0]);

  const gameRef = useRef<Game | null>(null);
  const [snap, setSnap] = useState<GameSnapshot | null>(null);
  const [speed, setSpeed] = useState(1);
  const speedRef = useRef(1);
  const prevSpeedRef = useRef(1);
  const [tab, setTab] = useState<Tab>("info");
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    speedRef.current = snap?.pendingMutations ? 0 : speed;
  }, [speed, snap?.pendingMutations]);

  function launch(seedV: string, traitsV: Traits, nameV: string, colorV: string) {
    const game = new Game(seedV, traitsV, nameV, colorV);
    gameRef.current = game;
    setSnap(game.snapshot());
    setSpeed(1);
    setTab("info");
    setPhase("play");
  }

  function startGame() {
    launch(seedInput, traits, name, color);
  }

  /** Restart se stejným druhem i seedem (QOL po vymření). */
  function restartSameSeed() {
    const g = gameRef.current;
    if (!g) return;
    launch(g.map.seedLabel, g.player.traits, g.player.name, g.player.color);
  }

  // Klávesové zkratky: mezerník = pauza/běh, 1–5 = rychlost
  useEffect(() => {
    if (phase !== "play") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.code === "Space") {
        e.preventDefault();
        setSpeed((s) => {
          if (s === 0) return prevSpeedRef.current || 1;
          prevSpeedRef.current = s;
          return 0;
        });
      } else if (e.key >= "1" && e.key <= "5") {
        const idx = Number(e.key) - 1;
        if (idx < SPEEDS.length) setSpeed(SPEEDS[idx]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase]);

  // Herní smyčka
  useEffect(() => {
    if (phase !== "play") return;
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let frames = 0;

    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const game = gameRef.current;
      if (game) {
        const sp = game.pendingMutations || game.gameOver ? 0 : speedRef.current;
        if (sp > 0) {
          acc += dt * sp * BASE_TPS;
          let steps = 0;
          while (acc >= 1 && steps < 8) {
            game.tick();
            acc -= 1;
            steps++;
          }
        }
        const c = canvasRef.current;
        if (c) {
          const ctx = c.getContext("2d")!;
          drawWorld(ctx, game.sim, { cell: CELL });
          drawPopulations(ctx, game.sim.species, { cell: CELL }, game.map.width, game.map.height);
          drawDisasters(ctx, game.sim, { cell: CELL });
        }
        // throttle React snapshot ~10/s, ale okamžitě při čekání na mutaci/konci
        frames++;
        if (frames % 6 === 0 || game.pendingMutations || game.gameOver) {
          setSnap(game.snapshot());
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  if (phase === "setup") {
    return (
      <SetupScreen
        seedInput={seedInput}
        setSeedInput={setSeedInput}
        name={name}
        setName={setName}
        traits={traits}
        setTraits={setTraits}
        color={color}
        setColor={setColor}
        onStart={startGame}
      />
    );
  }

  const game = gameRef.current!;
  return (
    <div className="app">
      <TopBar
        snap={snap}
        speed={speed}
        setSpeed={setSpeed}
        onNew={() => setPhase("setup")}
      />
      <div className="main">
        <div className="map-wrap">
          <canvas
            ref={canvasRef}
            className="world"
            width={game.map.width * CELL}
            height={game.map.height * CELL}
          />
          {snap && (
            <div className="season-badge">
              <div>
                <strong>{SEASON_LABELS[snap.season]}</strong> · rok {snap.year}
              </div>
              <div className="wx">
                {WEATHER_LABELS[snap.weather as Weather]}
                {snap.disasters > 0 ? ` · ${snap.disasters} katastrof` : ""}
              </div>
              <div className="wx">
                den {snap.dayInSeason + 1}/{snap.seasonLength}
              </div>
            </div>
          )}
          {snap?.gameOver && (
            <GameOver
              snap={snap}
              onNew={() => setPhase("setup")}
              onRetry={restartSameSeed}
            />
          )}
        </div>

        <Sidebar tab={tab} setTab={setTab} game={game} snap={snap} />
      </div>

      {snap?.pendingMutations && (
        <MutationPicker
          options={snap.pendingMutations}
          traits={game.player.traits}
          color={game.player.color}
          season={snap.season}
          year={snap.year}
          onChoose={(id) => {
            game.chooseMutation(id);
            setSnap(game.snapshot());
          }}
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
  snap: GameSnapshot | null;
  speed: number;
  setSpeed: (s: number) => void;
  onNew: () => void;
}) {
  return (
    <div className="topbar">
      <div className="brand">
        EvoWorld<span className="sub">příroda nikdy nespí</span>
      </div>
      {snap && (
        <>
          <div className="stat">
            <span className="k">Populace</span>
            <span className="v">{snap.playerPopulation}</span>
          </div>
          <div className="stat">
            <span className="k">Území</span>
            <span className="v">{snap.playerTerritory}</span>
          </div>
          <div className="stat">
            <span className="k">Druhů</span>
            <span className="v">{snap.speciesCount}</span>
          </div>
          <div className="stat">
            <span className="k">Tik</span>
            <span className="v">{snap.tick}</span>
          </div>
        </>
      )}
      <div className="spacer" />
      <div className="speed-group" title="Mezerník = pauza · klávesy 1–5 = rychlost">
        {SPEEDS.map((s) => (
          <button
            key={s}
            className={speed === s ? "active" : ""}
            onClick={() => setSpeed(s)}
          >
            {s === 0 ? "⏸" : `${s}×`}
          </button>
        ))}
      </div>
      <button onClick={onNew}>Nová hra</button>
    </div>
  );
}

function Sidebar({
  tab,
  setTab,
  game,
  snap,
}: {
  tab: Tab;
  setTab: (t: Tab) => void;
  game: Game;
  snap: GameSnapshot | null;
}) {
  const [hallVersion, setHallVersion] = useState(0);
  return (
    <div className="sidebar">
      <div className="tabs">
        {(
          [
            ["info", "Svět"],
            ["editor", "Druh"],
            ["tree", "Strom"],
            ["hall", "Síň slávy"],
          ] as [Tab, string][]
        ).map(([t, label]) => (
          <button key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>
            {label}
          </button>
        ))}
      </div>
      <div className="tab-body">
        {tab === "info" && <InfoTab game={game} snap={snap} />}
        {tab === "editor" && (
          <div>
            <div className="card">
              <h3>Aktuální genom</h3>
              <div className="muted">
                Tvůj druh se mění mutacemi mezi sezónami — toto je jeho současná
                podoba.
              </div>
            </div>
            <SpeciesEditor traits={game.player.traits} color={game.player.color} />
          </div>
        )}
        {tab === "tree" && <EvolutionTreeView tree={game.playerTree()} />}
        {tab === "hall" && (
          <HallOfFame
            key={hallVersion}
            hall={game.hall}
            onClear={() => {
              clearHall();
              game.hall = loadHall();
              setHallVersion((v) => v + 1);
            }}
          />
        )}
      </div>
    </div>
  );
}

function InfoTab({ game, snap }: { game: Game; snap: GameSnapshot | null }) {
  if (!snap) return null;
  const species = game.sim.species;
  return (
    <div>
      <div className="card">
        <h3>Druhy v ekosystému</h3>
        <div className="splist">
          {species.map((s) => {
            const pop = game.sim.totalPopulation(s);
            const terr = game.sim.territory(s);
            return (
              <div className="sp" key={s.id} style={{ opacity: s.diedTick ? 0.4 : 1 }}>
                <span className="swatch" style={{ background: s.color }} />
                <span style={{ flex: 1 }}>
                  {s.name} {s.isPlayer ? "★" : ""}
                </span>
                <span className="tag">{DIET_LABELS[s.traits.diet]}</span>
                <span className="muted">
                  {s.diedTick ? "✝ vyhynul" : `${pop} · ${terr}◧`}
                </span>
              </div>
            );
          })}
        </div>
        <div className="muted" style={{ marginTop: 8 }}>
          Predace · kompetice · symbióza · parazitismus — druhy spolu soupeří i
          spolupracují o zdroje.
        </div>
      </div>

      <div className="card">
        <div className="row">
          <h3 style={{ flex: 1 }}>Vývoj populace</h3>
          <span className="muted">vrchol {snap.playerPeakPopulation}</span>
        </div>
        <Sparkline data={game.history} color={game.player.color} />
      </div>

      <div className="card">
        <h3>Klima</h3>
        <div className="muted">
          Oteplení: +{snap.climateShift.toFixed(2)} · počasí:{" "}
          {WEATHER_LABELS[snap.weather as Weather]}. Svět se pomalu otepluje —
          přizpůsob se, nebo vymři.
        </div>
      </div>

      <div className="card">
        <h3>Kronika světa</h3>
        <div className="log">
          {snap.events.map((e, i) => (
            <div className={"e " + e.kind} key={i}>
              <span className="muted">[{e.tick}]</span> {e.text}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Mini graf trendu populace (SVG sparkline). */
function Sparkline({ data, color }: { data: number[]; color: string }) {
  const w = 320;
  const h = 56;
  if (data.length < 2) {
    return <div className="muted">Sbírám data…</div>;
  }
  const max = Math.max(1, ...data);
  const step = w / (data.length - 1);
  const pts = data
    .map((v, i) => `${(i * step).toFixed(1)},${(h - (v / max) * (h - 4) - 2).toFixed(1)}`)
    .join(" ");
  const area = `0,${h} ${pts} ${w},${h}`;
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: "block" }}>
      <polygon points={area} fill={color} opacity={0.18} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.8} />
    </svg>
  );
}

function GameOver({
  snap,
  onNew,
  onRetry,
}: {
  snap: GameSnapshot;
  onNew: () => void;
  onRetry: () => void;
}) {
  return (
    <div className="overlay">
      <div className="modal gameover">
        <h2>Tvůj druh vymřel</h2>
        <p className="muted">
          Přežil {snap.survivedSeasons} sezón ({Math.floor(snap.survivedSeasons / 4)} let).
          Jeho příběh teď žije v Síni slávy.
        </p>
        <div className="row" style={{ justifyContent: "center", gap: 24, margin: "16px 0" }}>
          <div className="stat" style={{ alignItems: "center" }}>
            <span className="k">Vrchol populace</span>
            <span className="v" style={{ fontSize: 22 }}>{snap.playerPeakPopulation}</span>
          </div>
          <div className="stat" style={{ alignItems: "center" }}>
            <span className="k">Největší území</span>
            <span className="v" style={{ fontSize: 22 }}>{snap.playerPeakTerritory}</span>
          </div>
        </div>
        <div className="row" style={{ justifyContent: "center", gap: 10 }}>
          <button className="primary" onClick={onRetry}>
            Zkusit znovu (stejný seed)
          </button>
          <button onClick={onNew}>Nová hra</button>
        </div>
      </div>
    </div>
  );
}

function SetupScreen({
  seedInput,
  setSeedInput,
  name,
  setName,
  traits,
  setTraits,
  color,
  setColor,
  onStart,
}: {
  seedInput: string;
  setSeedInput: (s: string) => void;
  name: string;
  setName: (s: string) => void;
  traits: Traits;
  setTraits: (t: Traits) => void;
  color: string;
  setColor: (c: string) => void;
  onStart: () => void;
}) {
  const hall = loadHall();
  return (
    <div className="setup">
      <div style={{ marginBottom: 18 }}>
        <div className="tag" style={{ display: "inline-block", marginBottom: 10 }}>
          SKUPINOVÝ PROJEKT
        </div>
        <h1>EvoWorld</h1>
        <div className="muted" style={{ fontSize: 16 }}>
          Procedurálně generovaný ekosystém, kde ovládáš živočišný druh. Navrhni
          tělo, přežij sezóny, katastrofy a konkurenci — a zapiš se do Síně slávy.
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
            <div className="field">
              <label>Jméno druhu</label>
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="preview-box">
              <ProcPreview seed={seedInput} />
            </div>
            <div className="muted" style={{ marginTop: 8 }}>
              Perlin noise · biomy · řeky · klimatické zóny.
            </div>
          </div>

          <div className="card">
            <h3>Jak se hraje</h3>
            <ul className="muted" style={{ fontSize: 13, lineHeight: 1.7, paddingLeft: 18 }}>
              <li>Navrhni tělo druhu v rámci bodového rozpočtu.</li>
              <li>Svět běží v reálném čase — sezóny, počasí, katastrofy.</li>
              <li>Mezi sezónami vybíráš mutace — strom se větví.</li>
              <li>Soupeříš s divokými druhy o zdroje a území.</li>
              <li>Když vymřeš, zapíšeš se do Síně slávy ({hall.length} záznamů).</li>
            </ul>
          </div>
        </div>

        <div>
          <SpeciesEditor
            traits={traits}
            color={color}
            onChange={setTraits}
            onColorChange={setColor}
          />
          <button
            className="primary"
            style={{ width: "100%", padding: 14, fontSize: 16 }}
            onClick={onStart}
          >
            Vytvořit svět a začít evoluci →
          </button>
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
    // generuj v malém rozlišení pro náhled
    const w = generateWorld(seed, 120, 70);
    const ctx = c.getContext("2d")!;
    const cell = c.width / w.width;
    const sim = new Simulation(w, w.seed);
    drawWorld(ctx, sim, { cell });
  }, [seed]);
  return <canvas ref={ref} width={300} height={175} style={{ borderRadius: 8 }} />;
}
