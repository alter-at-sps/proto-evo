// Features 3 + 4 + 6 — Simulační engine.
//  3) Dynamický svět: sezóny, počasí, katastrofy, klimatická změna.
//  4) Interakce druhů: predace, kompetice, symbióza, parazitismus, vymírání.
//  6) Chování & pohyb: migrace, hibernace, teritorium, reakce na katastrofy.

import { chance, makeRng, pick, randInt, randRange, type RNG } from "./rng";
import { deriveStats } from "./species";
import type {
  Disaster,
  DisasterType,
  Season,
  Species,
  Weather,
  WorldMap,
} from "./types";

export const SEASON_LENGTH = 12; // ticků na sezónu
export const SEASONS: Season[] = ["spring", "summer", "autumn", "winter"];
export const POP_CAP = 100;

export const SEASON_LABELS: Record<Season, string> = {
  spring: "Jaro",
  summer: "Léto",
  autumn: "Podzim",
  winter: "Zima",
};

export const WEATHER_LABELS: Record<Weather, string> = {
  clear: "Jasno",
  rain: "Déšť",
  drought: "Sucho",
  storm: "Bouře",
  snow: "Sníh",
};

export const DISASTER_LABELS: Record<DisasterType, string> = {
  volcano: "Sopka",
  meteor: "Meteor",
  wildfire: "Lesní požár",
  epidemic: "Epidemie",
};

export interface SimEvent {
  tick: number;
  text: string;
  kind: "season" | "weather" | "disaster" | "extinction" | "info";
}

const SEASON_TEMP: Record<Season, number> = {
  spring: 0.02,
  summer: 0.2,
  autumn: -0.05,
  winter: -0.26,
};

const SEASON_FOOD: Record<Season, number> = {
  spring: 1.3,
  summer: 1.0,
  autumn: 0.75,
  winter: 0.32,
};

export class Simulation {
  map: WorldMap;
  species: Species[] = [];
  food: Float32Array;
  foodCap: Float32Array;
  temp: Float32Array;
  tick = 0;
  weather: Weather = "clear";
  disasters: Disaster[] = [];
  climateShift = 0;
  private rng: RNG;
  /** kumulativní teritorium navštívené hráčem (pro skóre). */

  constructor(map: WorldMap, seed: number) {
    this.map = map;
    this.rng = makeRng(seed ^ 0x51ed270b);
    const n = map.width * map.height;
    this.food = new Float32Array(n);
    this.foodCap = new Float32Array(n);
    this.temp = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      this.foodCap[i] = map.tiles[i].fertility * 100;
      this.food[i] = this.foodCap[i] * 0.6;
    }
  }

  get season(): Season {
    return SEASONS[Math.floor(this.tick / SEASON_LENGTH) % 4];
  }

  get year(): number {
    return Math.floor(this.tick / (SEASON_LENGTH * 4)) + 1;
  }

  get dayInSeason(): number {
    return this.tick % SEASON_LENGTH;
  }

  addSpecies(s: Species): void {
    this.species.push(s);
  }

  /** Rozmístí počáteční populaci do vhodného regionu (teritorium). */
  seedPopulation(s: Species, count = 6): void {
    const stats = deriveStats(s.traits);
    const { width, height, tiles } = this.map;
    // vyber dobře hodnotící dlaždice
    const candidates: number[] = [];
    for (let i = 0; i < tiles.length; i++) {
      const t = tiles[i];
      if (t.isWater && t.biome !== "river" && t.biome !== "coast") continue;
      if (t.fertility < 0.3) continue;
      const tempOk = this.suitabilityTemp(stats, t.baseTemp + SEASON_TEMP[this.season]);
      if (tempOk > 0.5) candidates.push(i);
    }
    if (candidates.length === 0) {
      for (let i = 0; i < tiles.length; i++)
        if (!tiles[i].isWater) candidates.push(i);
    }
    for (let k = 0; k < count; k++) {
      const idx = pick(this.rng, candidates);
      const cx = idx % width;
      const cy = Math.floor(idx / width);
      // malá kolonie kolem středu
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const x = cx + dx;
          const y = cy + dy;
          if (x < 0 || y < 0 || x >= width || y >= height) continue;
          const ti = y * width + x;
          if (tiles[ti].isWater && tiles[ti].biome === "ocean") continue;
          s.pop[ti] = Math.min(POP_CAP, s.pop[ti] + randRange(this.rng, 20, 45));
        }
      }
    }
  }

  private suitabilityTemp(
    stats: ReturnType<typeof deriveStats>,
    temp: number
  ): number {
    const cold = temp < 0.35 ? 0.35 - temp : 0;
    const heat = temp > 0.7 ? temp - 0.7 : 0;
    const coldPenalty = cold * (1 - stats.coldResist / 5) * 2.6;
    const heatPenalty = heat * (1 - stats.heatResist / 5) * 2.6;
    return clamp01(1 - coldPenalty - heatPenalty);
  }

  /** Jeden tik simulace. Vrací události, které se staly. */
  step(): SimEvent[] {
    const events: SimEvent[] = [];
    const prevSeason = this.season;
    const prevYear = this.year;
    this.tick += 1;

    if (this.season !== prevSeason) {
      events.push({
        tick: this.tick,
        kind: "season",
        text: `Nastalo období: ${SEASON_LABELS[this.season]}`,
      });
      this.rollWeather();
    }
    if (this.year !== prevYear) {
      this.climateShift = Math.min(0.16, this.climateShift + 0.012);
      events.push({
        tick: this.tick,
        kind: "info",
        text: `Začíná rok ${this.year}. Klima se otepluje (+${this.climateShift.toFixed(
          2
        )}).`,
      });
    }
    if (this.tick % 4 === 0) this.rollWeather();

    this.updateTemperature();
    this.regenFood();
    this.updateDisasters(events);
    this.ecologyStep();
    this.checkExtinctions(events);

    return events;
  }

  private rollWeather(): void {
    const s = this.season;
    const table: Record<Season, Weather[]> = {
      spring: ["clear", "rain", "rain", "storm", "clear"],
      summer: ["clear", "clear", "drought", "drought", "storm"],
      autumn: ["clear", "rain", "storm", "rain", "clear"],
      winter: ["snow", "snow", "clear", "storm", "snow"],
    };
    this.weather = pick(this.rng, table[s]);
  }

  private weatherFoodMult(): number {
    switch (this.weather) {
      case "rain":
        return 1.3;
      case "drought":
        return 0.55;
      case "snow":
        return 0.7;
      case "storm":
        return 0.85;
      default:
        return 1;
    }
  }

  private updateTemperature(): void {
    const delta = SEASON_TEMP[this.season] + this.climateShift;
    const snow = this.weather === "snow" ? -0.06 : 0;
    const tiles = this.map.tiles;
    for (let i = 0; i < tiles.length; i++) {
      this.temp[i] = clamp(tiles[i].baseTemp + delta + snow, 0, 1.2);
    }
  }

  private regenFood(): void {
    const mult = SEASON_FOOD[this.season] * this.weatherFoodMult();
    const tiles = this.map.tiles;
    const { width } = this.map;
    for (let i = 0; i < tiles.length; i++) {
      const cap = this.foodCap[i];
      if (cap <= 0) continue;
      let regen = tiles[i].fertility * 6 * mult;
      // Symbióza: pasoucí se herbivoři roznáší semena -> mírně zvyšují obnovu.
      let grazers = 0;
      for (const s of this.species) {
        if (s.diedTick === null && (s.traits.diet === "herbivore" || s.traits.diet === "omnivore"))
          grazers += s.pop[i];
      }
      regen *= 1 + Math.min(0.25, grazers / 400);
      this.food[i] = Math.min(cap, this.food[i] + regen * (1 - this.food[i] / cap));
      // pouště v létě vysychají rychleji
      if (tiles[i].biome === "desert" && this.season === "summer") {
        this.food[i] *= 0.9;
      }
      void width;
    }
  }

  // --- Katastrofy (Feature 3) ---------------------------------------------

  private updateDisasters(events: SimEvent[]): void {
    // šance na novou katastrofu
    if (chance(this.rng, 0.02)) {
      this.spawnDisaster(events);
    }
    for (const d of this.disasters) {
      this.applyDisaster(d);
      d.ticksLeft -= 1;
    }
    this.disasters = this.disasters.filter((d) => d.ticksLeft > 0);
  }

  private spawnDisaster(events: SimEvent[]): void {
    const type = pick<DisasterType>(this.rng, [
      "volcano",
      "meteor",
      "wildfire",
      "epidemic",
    ]);
    const { width, height } = this.map;
    const cx = randInt(this.rng, 0, width - 1);
    const cy = randInt(this.rng, 0, height - 1);
    const radius =
      type === "meteor"
        ? randRange(this.rng, 6, 11)
        : type === "epidemic"
          ? randRange(this.rng, 8, 14)
          : randRange(this.rng, 4, 8);
    const ticksLeft =
      type === "epidemic" ? randInt(this.rng, 6, 12) : randInt(this.rng, 2, 5);
    this.disasters.push({ type, cx, cy, radius, ticksLeft, startedTick: this.tick });
    events.push({
      tick: this.tick,
      kind: "disaster",
      text: `${DISASTER_LABELS[type]}! Zasažena oblast poblíž [${cx}, ${cy}].`,
    });
  }

  private applyDisaster(d: Disaster): void {
    const { width, height, tiles } = this.map;
    const r2 = d.radius * d.radius;
    const x0 = Math.max(0, Math.floor(d.cx - d.radius));
    const x1 = Math.min(width - 1, Math.ceil(d.cx + d.radius));
    const y0 = Math.max(0, Math.floor(d.cy - d.radius));
    const y1 = Math.min(height - 1, Math.ceil(d.cy + d.radius));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x - d.cx;
        const dy = y - d.cy;
        const dd = dx * dx + dy * dy;
        if (dd > r2) continue;
        const i = y * width + x;
        const falloff = 1 - dd / r2;
        switch (d.type) {
          case "volcano":
          case "wildfire":
            this.food[i] *= 1 - 0.6 * falloff;
            tiles[i].fertility = Math.max(0.05, tiles[i].fertility - 0.02 * falloff);
            this.foodCap[i] = tiles[i].fertility * 100;
            this.killPop(i, 0.4 * falloff);
            break;
          case "meteor":
            this.food[i] *= 1 - 0.8 * falloff;
            this.killPop(i, 0.7 * falloff);
            break;
          case "epidemic":
            // postihuje hlavně populaci, ne potravu
            this.killPop(i, 0.25 * falloff);
            break;
        }
      }
    }
  }

  private killPop(i: number, frac: number): void {
    for (const s of this.species) {
      if (s.diedTick !== null) continue;
      s.pop[i] *= 1 - frac;
    }
  }

  // --- Ekologie: predace, kompetice, parazitismus, růst, migrace ----------

  private ecologyStep(): void {
    const n = this.map.tiles.length;
    const active = this.species.filter((s) => s.diedTick === null);
    if (active.length === 0) return;

    const stats = new Map(active.map((s) => [s.id, deriveStats(s.traits)]));
    const hibernating = this.season === "winter";

    // Predace: spočítej úbytek kořisti na každé dlaždici.
    const preyLoss = new Map<string, Float32Array>();
    for (const s of active) preyLoss.set(s.id, new Float32Array(n));

    const predators = active.filter(
      (s) => s.traits.diet === "carnivore" || s.traits.diet === "omnivore"
    );
    const prey = active.filter(
      (s) => s.traits.diet === "herbivore" || s.traits.diet === "omnivore"
    );
    const parasites = active.filter((s) => s.traits.diet === "parasite");

    const predEnergy = new Map<string, Float32Array>();
    for (const s of predators) predEnergy.set(s.id, new Float32Array(n));
    const paraEnergy = new Map<string, Float32Array>();
    for (const s of parasites) paraEnergy.set(s.id, new Float32Array(n));
    const paraDrain = new Map<string, Float32Array>(); // úbytek růstu hostitele
    for (const s of active) paraDrain.set(s.id, new Float32Array(n));

    for (let i = 0; i < n; i++) {
      // dostupná kořist na dlaždici
      let preyBiomass = 0;
      for (const s of prey) preyBiomass += s.pop[i];

      // --- predace ---
      for (const pr of predators) {
        const pp = pr.pop[i];
        if (pp <= 0 || preyBiomass <= 0) continue;
        const st = stats.get(pr.id)!;
        const captureFrac = clamp01(0.02 + st.strength * 0.03 + st.speed * 0.012);
        const want = pp * (0.5 + st.foodEfficiency * 0.3);
        const caught = Math.min(preyBiomass * captureFrac, want, preyBiomass);
        if (caught <= 0) continue;
        predEnergy.get(pr.id)![i] += caught * 1.4;
        // rozděl úbytek mezi kořistní druhy poměrně
        for (const py of prey) {
          if (py.pop[i] <= 0) continue;
          preyLoss.get(py.id)![i] += caught * (py.pop[i] / preyBiomass);
        }
      }

      // --- parazitismus ---
      if (parasites.length) {
        let hostBiomass = 0;
        for (const s of active)
          if (s.traits.diet !== "parasite") hostBiomass += s.pop[i];
        for (const pa of parasites) {
          const pp = pa.pop[i];
          if (pp <= 0 || hostBiomass <= 0) continue;
          const drain = Math.min(hostBiomass * 0.06, pp * 0.7);
          paraEnergy.get(pa.id)![i] += drain * 1.0;
          for (const s of active) {
            if (s.traits.diet === "parasite") continue;
            if (s.pop[i] <= 0) continue;
            paraDrain.get(s.id)![i] += drain * (s.pop[i] / hostBiomass);
          }
        }
      }
    }

    // Aplikuj lokální dynamiku do nového bufferu.
    const newPop = new Map<string, Float32Array>();
    for (const s of active) newPop.set(s.id, new Float32Array(n));

    for (const s of active) {
      const st = stats.get(s.id)!;
      const src = s.pop;
      const dst = newPop.get(s.id)!;
      const isHerbivore = s.traits.diet === "herbivore" || s.traits.diet === "omnivore";
      const pe = predEnergy.get(s.id);
      const pae = paraEnergy.get(s.id);
      const loss = preyLoss.get(s.id)!;
      const drain = paraDrain.get(s.id)!;

      for (let i = 0; i < n; i++) {
        let p = src[i];
        if (p <= 0.001) {
          dst[i] = 0;
          continue;
        }
        const tile = this.map.tiles[i];
        if (tile.isWater && tile.biome === "ocean") {
          dst[i] = 0;
          continue;
        }

        // energie z potravy
        let energy = 0;
        if (isHerbivore) {
          const intake = Math.min(this.food[i], p * (0.5 + st.foodEfficiency * 0.5));
          this.food[i] -= intake;
          energy += intake * st.foodEfficiency * (s.traits.diet === "omnivore" ? 0.7 : 1);
        }
        if (pe) energy += pe[i]; // masitá strava
        if (pae) energy += pae[i]; // parazit

        const tempF = this.suitabilityTemp(st, this.temp[i]);
        const energyPerCap = energy / p;
        const satisfaction = clamp(energyPerCap / Math.max(0.3, st.metabolism), 0, 1.5);

        // hibernace: v zimě odolné druhy šetří energii (méně úmrtí, ale i růstu)
        const hibern = hibernating && s.traits.hide >= 1;
        const reproRate = hibern ? 0.05 : 0.24;
        const baseDeath = hibern ? 0.03 : 0.05;

        const room = Math.max(0, 1 - p / POP_CAP);
        let births = p * reproRate * satisfaction * tempF * room;
        // úbytek růstu kvůli parazitům
        births *= 1 - clamp01(drain[i] / Math.max(1, p));

        const starvation = Math.max(0, 1 - satisfaction) * (hibern ? 0.06 : 0.2);
        const tempStress = (1 - tempF) * (hibern ? 0.12 : 0.3);
        let deaths = p * (baseDeath + starvation + tempStress);
        deaths += loss[i]; // predace

        let np = p + births - deaths;
        np = clamp(np, 0, POP_CAP);
        dst[i] = np;
      }
    }

    // Migrace / teritorium (Feature 6): difuze směrem k atraktivnějším dlaždicím.
    for (const s of active) {
      const st = stats.get(s.id)!;
      this.migrate(s, newPop.get(s.id)!, st);
    }

    // zapiš zpět + aktualizuj peaky
    for (const s of active) {
      s.pop.set(newPop.get(s.id)!);
      this.updatePeaks(s);
    }
  }

  private migrate(
    s: Species,
    pop: Float32Array,
    st: ReturnType<typeof deriveStats>
  ): void {
    const { width, height } = this.map;
    const mobility = clamp01(0.06 + st.speed * 0.03 + s.traits.wings * 0.05);
    const out = new Float32Array(pop.length);
    out.set(pop);

    // atraktivita dlaždice = potrava + teplota - nebezpečí katastrof
    const attract = (i: number): number => {
      const tile = this.map.tiles[i];
      if (tile.isWater && tile.biome === "ocean") return -5;
      let a = this.food[i] / 100 + this.suitabilityTemp(st, this.temp[i]);
      for (const d of this.disasters) {
        const dx = (i % width) - d.cx;
        const dy = Math.floor(i / width) - d.cy;
        if (dx * dx + dy * dy < d.radius * d.radius) a -= 2; // útěk před katastrofou
      }
      return a;
    };

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        const p = pop[i];
        if (p < 0.5) continue;
        const here = attract(i);
        let totalPull = 0;
        const pulls: { idx: number; w: number }[] = [];
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            const ni = ny * width + nx;
            const w = attract(ni) - here;
            if (w > 0) {
              pulls.push({ idx: ni, w });
              totalPull += w;
            }
          }
        }
        if (totalPull <= 0) continue;
        const moving = p * mobility;
        out[i] -= moving;
        for (const pl of pulls) {
          out[pl.idx] += moving * (pl.w / totalPull);
        }
      }
    }
    for (let i = 0; i < out.length; i++) pop[i] = Math.min(POP_CAP, out[i]);
  }

  private updatePeaks(s: Species): void {
    let total = 0;
    let territory = 0;
    for (let i = 0; i < s.pop.length; i++) {
      if (s.pop[i] > 0.5) {
        total += s.pop[i];
        territory++;
      }
    }
    s.peakPopulation = Math.max(s.peakPopulation, Math.round(total));
    s.peakTerritory = Math.max(s.peakTerritory, territory);
  }

  totalPopulation(s: Species): number {
    let total = 0;
    for (let i = 0; i < s.pop.length; i++) total += s.pop[i];
    return Math.round(total);
  }

  territory(s: Species): number {
    let t = 0;
    for (let i = 0; i < s.pop.length; i++) if (s.pop[i] > 0.5) t++;
    return t;
  }

  private checkExtinctions(events: SimEvent[]): void {
    for (const s of this.species) {
      if (s.diedTick !== null) continue;
      if (this.totalPopulation(s) < 1) {
        s.diedTick = this.tick;
        events.push({
          tick: this.tick,
          kind: "extinction",
          text: `Druh ${s.name} vymřel.`,
        });
      }
    }
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
