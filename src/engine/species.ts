// Feature 2 — Editor druhu (Spore styl): traits -> odvozené statistiky + bodový systém.

import { makeRng, pick, randInt, type RNG } from "./rng";
import type { DerivedStats, Diet, Species, Traits, WorldMap } from "./types";

export const TRAIT_MAX = 5;
/** Bodový rozpočet: nelze mít vše najednou. */
export const POINT_BUDGET = 14;

export const DIETS: Diet[] = ["herbivore", "carnivore", "omnivore", "parasite"];

export const DIET_LABELS: Record<Diet, string> = {
  herbivore: "Herbivor",
  carnivore: "Karnivor",
  omnivore: "Omnivor",
  parasite: "Parazit",
};

/** Body za dietu — některé strategie jsou „dražší“. */
const DIET_COST: Record<Diet, number> = {
  herbivore: 0,
  carnivore: 2,
  omnivore: 3,
  parasite: 1,
};

export function pointsUsed(t: Traits): number {
  return t.size + t.teeth + t.limbs + t.wings + t.hide + DIET_COST[t.diet];
}

/** Spočítá odvozené statistiky z tělesných vlastností. */
export function deriveStats(t: Traits): DerivedStats {
  const speed = 0.5 + t.limbs * 0.45 + t.wings * 0.25 - t.size * 0.15;
  const strength = 0.4 + t.teeth * 0.5 + t.size * 0.4;
  const resilience = 0.4 + t.hide * 0.5 + t.size * 0.25;
  const coldResist = 0.2 + t.hide * 0.55 + t.size * 0.1;
  const heatResist = 0.3 + (TRAIT_MAX - t.size) * 0.12 + t.hide * 0.15;
  const dietEff =
    t.diet === "herbivore"
      ? 1.0
      : t.diet === "omnivore"
        ? 0.85
        : t.diet === "parasite"
          ? 0.7
          : 0.75;
  const foodEfficiency = (0.7 + t.teeth * 0.08) * dietEff;
  // Velká, ozubená a okřídlená těla spotřebují víc energie.
  const metabolism =
    0.35 + t.size * 0.16 + t.wings * 0.1 + t.teeth * 0.06 + t.limbs * 0.04;

  return {
    speed: clamp(speed),
    strength: clamp(strength),
    resilience: clamp(resilience),
    coldResist: clamp(coldResist),
    heatResist: clamp(heatResist),
    foodEfficiency,
    metabolism,
    pointsUsed: pointsUsed(t),
  };
}

function clamp(v: number, lo = 0, hi = 5): number {
  return Math.max(lo, Math.min(hi, v));
}

export function defaultTraits(): Traits {
  return { size: 1, teeth: 1, limbs: 2, wings: 0, hide: 1, diet: "herbivore" };
}

let idCounter = 0;
export function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter.toString(36)}-${Math.floor(
    Math.random() * 1e6
  ).toString(36)}`;
}

const SPECIES_NAMES = [
  "Glemur",
  "Korvex",
  "Driapod",
  "Sylphid",
  "Brontak",
  "Nimbra",
  "Vesperид",
  "Thornak",
  "Quillox",
  "Miretha",
  "Skarn",
  "Velmis",
];

export const COLORS = [
  "#e74c3c",
  "#3498db",
  "#2ecc71",
  "#f1c40f",
  "#9b59b6",
  "#1abc9c",
  "#e67e22",
  "#ff6b9d",
  "#16a085",
  "#c0392b",
];

/** Předpřipravené archetypy pro rychlý start v monster makeru. */
export interface Archetype {
  name: string;
  emoji: string;
  traits: Traits;
}

export const ARCHETYPES: Archetype[] = [
  { name: "Vyvážený", emoji: "⚖️", traits: { size: 1, teeth: 1, limbs: 2, wings: 0, hide: 1, diet: "herbivore" } },
  { name: "Rychlý běžec", emoji: "🦌", traits: { size: 0, teeth: 0, limbs: 4, wings: 1, hide: 1, diet: "herbivore" } },
  { name: "Tank", emoji: "🦏", traits: { size: 3, teeth: 1, limbs: 1, wings: 0, hide: 4, diet: "herbivore" } },
  { name: "Predátor", emoji: "🐺", traits: { size: 2, teeth: 4, limbs: 2, wings: 0, hide: 1, diet: "carnivore" } },
  { name: "Letec", emoji: "🦅", traits: { size: 0, teeth: 1, limbs: 1, wings: 3, hide: 1, diet: "omnivore" } },
];

/** Náhodný životaschopný druh pro hráče (v rámci rozpočtu, ne parazit). */
export function randomPlayerTraits(rng: RNG): Traits {
  for (let attempt = 0; attempt < 60; attempt++) {
    const diet = pick(rng, ["herbivore", "carnivore", "omnivore"] as Diet[]);
    const t: Traits = {
      size: randInt(rng, 0, 4),
      teeth: randInt(rng, 0, 4),
      limbs: randInt(rng, 1, 4),
      wings: randInt(rng, 0, 2),
      hide: randInt(rng, 0, 4),
      diet,
    };
    if (pointsUsed(t) >= 6 && pointsUsed(t) <= POINT_BUDGET) return t;
  }
  return defaultTraits();
}

export function createSpecies(
  map: WorldMap,
  traits: Traits,
  opts: {
    name?: string;
    color?: string;
    isPlayer?: boolean;
    bornTick: number;
    currentNodeId: string;
    colorIndex?: number;
  }
): Species {
  const pop = new Float32Array(map.width * map.height);
  return {
    id: nextId("sp"),
    name: opts.name ?? "Tvůj druh",
    color: opts.color ?? COLORS[(opts.colorIndex ?? 0) % COLORS.length],
    traits: { ...traits },
    pop,
    bornTick: opts.bornTick,
    diedTick: null,
    isPlayer: opts.isPlayer ?? false,
    peakPopulation: 0,
    peakTerritory: 0,
    currentNodeId: opts.currentNodeId,
  };
}

/** Náhodný životaschopný divoký druh (rival / kořist) v rámci rozpočtu. */
export function randomWildTraits(rng: RNG): Traits {
  for (let attempt = 0; attempt < 50; attempt++) {
    const diet = pick(rng, DIETS);
    const t: Traits = {
      size: randInt(rng, 0, 4),
      teeth: randInt(rng, 0, 4),
      limbs: randInt(rng, 0, 4),
      wings: randInt(rng, 0, 2),
      hide: randInt(rng, 0, 4),
      diet,
    };
    if (pointsUsed(t) <= POINT_BUDGET) return t;
  }
  return defaultTraits();
}

export function randomSpeciesName(rng: RNG): string {
  return pick(rng, SPECIES_NAMES) + "-" + randInt(rng, 1, 99);
}

export function randomColor(rng: RNG, index: number): string {
  return COLORS[index % COLORS.length] ?? pick(rng, COLORS);
}

export function spawnWildSpecies(
  map: WorldMap,
  bornTick: number,
  index: number,
  rootNodeId: string,
  seed: number
): Species {
  const rng = makeRng(seed + index * 7919);
  const traits = randomWildTraits(rng);
  return createSpecies(map, traits, {
    name: randomSpeciesName(rng),
    color: randomColor(rng, index + 3),
    isPlayer: false,
    bornTick,
    currentNodeId: rootNodeId,
    colorIndex: index + 3,
  });
}
