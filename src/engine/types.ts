// Centrální datové typy pro EvoWorld engine.

// ---- Feature 1: Svět -------------------------------------------------------

export type Biome =
  | "ocean"
  | "coast"
  | "beach"
  | "desert"
  | "grassland"
  | "forest"
  | "tropical"
  | "tundra"
  | "ice"
  | "mountain"
  | "river"
  | "lake";

export type ClimateZone = "arctic" | "temperate" | "tropical";

export interface Tile {
  x: number;
  y: number;
  elevation: number; // 0..1
  moisture: number; // 0..1
  baseTemp: number; // 0..1 (před sezónou/klimatem)
  biome: Biome;
  climate: ClimateZone;
  isWater: boolean;
  river: boolean;
  /** Základní úrodnost dle biomu (0..1). */
  fertility: number;
}

export interface WorldMap {
  seed: number;
  seedLabel: string;
  width: number;
  height: number;
  tiles: Tile[]; // index = y*width + x
}

// ---- Feature 2: Druh -------------------------------------------------------

export type Diet = "herbivore" | "carnivore" | "omnivore" | "parasite";

/** Tělesné vlastnosti, které hráč upravuje (Spore styl). */
export interface Traits {
  size: number; // 0..5
  teeth: number; // 0..5  (útok / lov)
  limbs: number; // 0..5  (rychlost / pohyb)
  wings: number; // 0..5  (migrace, únik)
  hide: number; // 0..5  (odolnost / izolace)
  diet: Diet;
}

/** Odvozené statistiky spočítané z traits. */
export interface DerivedStats {
  speed: number;
  strength: number;
  resilience: number;
  coldResist: number;
  heatResist: number;
  foodEfficiency: number;
  metabolism: number; // spotřeba energie
  pointsUsed: number;
}

export interface Species {
  id: string;
  name: string;
  color: string;
  traits: Traits;
  /** Populační hustota na dlaždici, index = y*width+x. */
  pop: Float32Array;
  bornTick: number;
  diedTick: number | null;
  isPlayer: boolean;
  peakPopulation: number;
  peakTerritory: number;
  /** ID uzlu evolučního stromu, kterému aktuální genom odpovídá. */
  currentNodeId: string;
}

// ---- Feature 5: Evoluční strom --------------------------------------------

export interface MutationOption {
  id: string;
  label: string;
  description: string;
  apply: (t: Traits) => Traits;
}

export interface EvoNode {
  id: string;
  parentId: string | null;
  childrenIds: string[];
  tick: number;
  season: Season;
  year: number;
  label: string; // co se v tomto kroku stalo
  traits: Traits;
  population: number;
  milestone?: string; // např. katastrofa / rozkvět
}

// ---- Feature 3: Dynamický svět --------------------------------------------

export type Season = "spring" | "summer" | "autumn" | "winter";

export type Weather = "clear" | "rain" | "drought" | "storm" | "snow";

export type DisasterType = "volcano" | "meteor" | "wildfire" | "epidemic";

export interface Disaster {
  type: DisasterType;
  cx: number;
  cy: number;
  radius: number;
  ticksLeft: number;
  startedTick: number;
}

// ---- Hall of fame / žebříček ----------------------------------------------

export interface HallEntry {
  id: string;
  name: string;
  color: string;
  bornTick: number;
  diedTick: number;
  survivedSeasons: number;
  peakPopulation: number;
  peakTerritory: number;
  finalTraits: Traits;
  nodeCount: number;
  cause: string;
}
