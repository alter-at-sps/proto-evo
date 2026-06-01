// Orchestrátor: propojuje simulaci, evoluční stromy (F5), mutace (F2/5),
// hall of fame a žebříček. Nahrazuje serverovou vrstvu z prezentace
// lokální perzistencí (localStorage) — architektura je oddělená.

import { EvolutionTree } from "./evolutionTree";
import { generateMutations, describeTraitChange } from "./mutations";
import { makeRng, type RNG } from "./rng";
import {
  createSpecies,
  spawnWildSpecies,
  randomWildTraits,
} from "./species";
import {
  Simulation,
  SEASON_LENGTH,
  type SimEvent,
} from "./simulation";
import { generateWorld } from "./world";
import type {
  HallEntry,
  MutationOption,
  Season,
  Species,
  Traits,
  WorldMap,
} from "./types";

const HALL_KEY = "evoworld.hall.v1";
const WILD_COUNT = 4;

export interface GameSnapshot {
  tick: number;
  year: number;
  season: Season;
  dayInSeason: number;
  seasonLength: number;
  weather: string;
  climateShift: number;
  disasters: number;
  events: SimEvent[];
  pendingMutations: MutationOption[] | null;
  gameOver: boolean;
  playerAlive: boolean;
  playerPopulation: number;
  playerTerritory: number;
  playerPeakPopulation: number;
  playerPeakTerritory: number;
  survivedSeasons: number;
  speciesCount: number;
  seedLabel: string;
}

export class Game {
  map: WorldMap;
  sim: Simulation;
  trees = new Map<string, EvolutionTree>();
  player: Species;
  hall: HallEntry[] = [];
  events: SimEvent[] = [];
  pendingMutations: MutationOption[] | null = null;
  gameOver = false;
  /** Vzorky populace hráče v čase (pro graf trendu). */
  history: number[] = [];

  private rng: RNG;
  private seed: number;
  private lastSeason: Season;
  private pendingMilestone: string | null = null;
  private recordedDead = new Set<string>();

  constructor(
    seedInput: number | string,
    playerTraits: Traits,
    playerName: string,
    playerColor?: string
  ) {
    this.map = generateWorld(seedInput, 140, 90);
    this.seed = this.map.seed;
    this.rng = makeRng(this.seed ^ 0x1234567);
    this.sim = new Simulation(this.map, this.seed);

    // hráčův druh + jeho strom
    const playerTree = new EvolutionTree(
      playerTraits,
      0,
      this.sim.season,
      this.sim.year
    );
    this.player = createSpecies(this.map, playerTraits, {
      name: playerName || "Tvůj druh",
      color: playerColor,
      isPlayer: true,
      bornTick: 0,
      currentNodeId: playerTree.rootId,
      colorIndex: 0,
    });
    this.trees.set(this.player.id, playerTree);
    this.sim.addSpecies(this.player);
    this.sim.seedPopulation(this.player, 5);

    // divoké druhy (rivalové / kořist / predátoři)
    for (let i = 0; i < WILD_COUNT; i++) {
      const w = spawnWildSpecies(this.map, 0, i, "root", this.seed);
      const tree = new EvolutionTree(w.traits, 0, this.sim.season, this.sim.year);
      w.currentNodeId = tree.rootId;
      this.trees.set(w.id, tree);
      this.sim.addSpecies(w);
      this.sim.seedPopulation(w, 4);
    }

    this.lastSeason = this.sim.season;
    this.hall = loadHall();
    this.events.push({ tick: 0, kind: "info", text: "Svět vznikl. Příroda nikdy nespí." });
  }

  /** Posune simulaci o jeden tik (pokud nečekáme na volbu mutace / není konec). */
  tick(): void {
    if (this.pendingMutations || this.gameOver) return;

    const evs = this.sim.step();
    for (const e of evs) {
      this.events.push(e);
      if (e.kind === "disaster") this.pendingMilestone = e.text;
    }
    if (this.events.length > 80) this.events.splice(0, this.events.length - 80);

    this.recordDeaths(evs);

    // vzorek populace pro graf trendu
    this.history.push(this.sim.totalPopulation(this.player));
    if (this.history.length > 200) this.history.shift();

    // přechod sezóny -> mutace
    if (this.sim.season !== this.lastSeason) {
      this.onSeasonChange();
      this.lastSeason = this.sim.season;
    }

    if (this.player.diedTick !== null && !this.gameOver) {
      this.gameOver = true;
      this.events.push({
        tick: this.sim.tick,
        kind: "extinction",
        text: "Tvůj druh vymřel. Konec evoluce — podívej se do Hall of Fame.",
      });
    }
  }

  private onSeasonChange(): void {
    // Divoké druhy zmutují automaticky a větví svůj strom.
    for (const s of this.sim.species) {
      if (s.isPlayer || s.diedTick !== null) continue;
      const opts = generateMutations(this.rng, s.traits);
      const chosen = opts[Math.floor(this.rng() * opts.length)];
      this.applyMutationTo(s, chosen);
      // občas se objeví zcela nový divoký druh (rozrůznění ekosystému)
    }
    if (this.rng() < 0.25 && this.aliveSpecies().length < 8) {
      this.spawnNewWild();
    }

    // Hráč: připrav volbu mutace (hra se pozastaví, dokud nevybere).
    if (this.player.diedTick === null) {
      this.pendingMutations = generateMutations(this.rng, this.player.traits);
    }
  }

  /** Hráč vybral mutaci -> aplikuj, zaznamenej do stromu, pokračuj. */
  chooseMutation(optionId: string): void {
    if (!this.pendingMutations) return;
    const opt = this.pendingMutations.find((o) => o.id === optionId);
    this.pendingMutations = null;
    if (!opt) return;
    this.applyMutationTo(this.player, opt);
  }

  private applyMutationTo(s: Species, opt: MutationOption): void {
    const before = s.traits;
    const after = opt.apply(before);
    s.traits = after;
    const tree = this.trees.get(s.id);
    if (!tree) return;
    const change = describeTraitChange(before, after);
    const label =
      opt.id === "stay" ? `${s.name}: stabilní` : `${s.name}: ${change}`;
    const node = tree.addNode(
      s.currentNodeId,
      after,
      label,
      this.sim.tick,
      this.sim.season,
      this.sim.year,
      this.sim.totalPopulation(s),
      s.isPlayer ? this.pendingMilestone ?? undefined : undefined
    );
    s.currentNodeId = node.id;
    if (s.isPlayer) this.pendingMilestone = null;
  }

  private spawnNewWild(): void {
    const idx = this.sim.species.length;
    const w = spawnWildSpecies(this.map, this.sim.tick, idx, "root", this.seed + idx);
    w.traits = randomWildTraits(this.rng);
    const tree = new EvolutionTree(w.traits, this.sim.tick, this.sim.season, this.sim.year);
    w.currentNodeId = tree.rootId;
    this.trees.set(w.id, tree);
    this.sim.addSpecies(w);
    this.sim.seedPopulation(w, 2);
    this.events.push({
      tick: this.sim.tick,
      kind: "info",
      text: `Objevil se nový druh: ${w.name}.`,
    });
  }

  private recordDeaths(evs: SimEvent[]): void {
    if (!evs.some((e) => e.kind === "extinction")) return;
    for (const s of this.sim.species) {
      if (s.diedTick === null || this.recordedDead.has(s.id)) continue;
      this.recordedDead.add(s.id);
      const tree = this.trees.get(s.id);
      const survivedSeasons = Math.floor((s.diedTick - s.bornTick) / SEASON_LENGTH);
      const entry: HallEntry = {
        id: s.id,
        name: s.name,
        color: s.color,
        bornTick: s.bornTick,
        diedTick: s.diedTick,
        survivedSeasons,
        peakPopulation: s.peakPopulation,
        peakTerritory: s.peakTerritory,
        finalTraits: { ...s.traits },
        nodeCount: tree ? tree.size() : 1,
        cause: this.lastSeason === "winter" ? "Krutá zima" : "Tlak prostředí",
      };
      this.hall.unshift(entry);
    }
    this.hall = this.hall.slice(0, 50);
    saveHall(this.hall);
  }

  aliveSpecies(): Species[] {
    return this.sim.species.filter((s) => s.diedTick === null);
  }

  playerTree(): EvolutionTree {
    return this.trees.get(this.player.id)!;
  }

  snapshot(): GameSnapshot {
    return {
      tick: this.sim.tick,
      year: this.sim.year,
      season: this.sim.season,
      dayInSeason: this.sim.dayInSeason,
      seasonLength: SEASON_LENGTH,
      weather: this.sim.weather,
      climateShift: this.sim.climateShift,
      disasters: this.sim.disasters.length,
      events: this.events.slice(-12).reverse(),
      pendingMutations: this.pendingMutations,
      gameOver: this.gameOver,
      playerAlive: this.player.diedTick === null,
      playerPopulation: this.sim.totalPopulation(this.player),
      playerTerritory: this.sim.territory(this.player),
      playerPeakPopulation: this.player.peakPopulation,
      playerPeakTerritory: this.player.peakTerritory,
      survivedSeasons: Math.floor(this.sim.tick / SEASON_LENGTH),
      speciesCount: this.aliveSpecies().length,
      seedLabel: this.map.seedLabel,
    };
  }
}

// --- Hall of fame perzistence (localStorage místo PostgreSQL z prezentace) ---

export function loadHall(): HallEntry[] {
  try {
    const raw = localStorage.getItem(HALL_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as HallEntry[];
  } catch {
    return [];
  }
}

function saveHall(hall: HallEntry[]): void {
  try {
    localStorage.setItem(HALL_KEY, JSON.stringify(hall));
  } catch {
    /* storage nedostupné */
  }
}

export function clearHall(): void {
  try {
    localStorage.removeItem(HALL_KEY);
  } catch {
    /* ignore */
  }
}

/** Skóre „unikátnosti“ druhu pro žebříček. */
export function uniquenessScore(t: Traits): number {
  const vals = [t.size, t.teeth, t.limbs, t.wings, t.hide];
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length;
  const dietBonus = t.diet === "parasite" ? 2 : t.diet === "carnivore" ? 1 : 0;
  return Math.round((variance * 2 + mean + dietBonus) * 10);
}
