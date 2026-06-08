// Agentní živý ekosystém (à la Rain World). Jednotliví tvorové žijí, shánějí
// potravu, loví, prchají, množí se a evolučně driftují — svět běží sám.

import { chance, makeRng, randRange, type RNG } from "./rng";
import { deriveStats } from "./species";
import type { Diet, Traits, WorldMap } from "./types";

export const MAX_CREATURES = 700;
const GRID = 6; // velikost buňky prostorové mřížky (v dlaždicích)

export type CreatureState = "wander" | "forage" | "hunt" | "flee" | "mate";

export interface Creature {
  id: number;
  sp: number; // index druhu (linie)
  x: number;
  y: number;
  dir: number;
  energy: number;
  maxEnergy: number;
  age: number;
  maxAge: number;
  reproCd: number;
  state: CreatureState;
  alive: boolean;
  traits: Traits;
  // odvozené (spočtené při narození)
  speed: number;
  sense: number;
  attack: number;
  defense: number;
  metabolism: number;
}

export interface EcoSpecies {
  id: number;
  name: string;
  color: string;
  diet: Diet;
  baseTraits: Traits;
  born: number;
  extinctAt: number | null;
}

let CID = 1;

function makeCreature(sp: number, traits: Traits, x: number, y: number, rng: RNG): Creature {
  const d = deriveStats(traits);
  const maxEnergy = 50 + traits.size * 16;
  return {
    id: CID++,
    sp,
    x,
    y,
    dir: rng() * Math.PI * 2,
    energy: maxEnergy * randRange(rng, 0.5, 0.8),
    maxEnergy,
    age: 0,
    maxAge: randRange(rng, 1400, 2200) + traits.size * 250,
    reproCd: randRange(rng, 40, 120),
    state: "wander",
    alive: true,
    traits,
    speed: 0.05 + d.speed * 0.022,
    sense: 5 + traits.limbs * 0.6 + traits.wings * 0.8 + traits.teeth * 0.4,
    attack: 2 + d.strength * 2.2 + traits.teeth * 1.4,
    defense: 1 + d.resilience * 1.8 + traits.hide * 1.2,
    metabolism: 0.2 + d.metabolism * 0.04 + traits.size * 0.025,
  };
}

function mutate(t: Traits, rng: RNG): Traits {
  const n: Traits = { ...t };
  const keys: (keyof Omit<Traits, "diet">)[] = ["size", "teeth", "limbs", "wings", "hide"];
  for (const k of keys) {
    if (chance(rng, 0.16)) {
      n[k] = Math.max(0, Math.min(5, n[k] + (chance(rng, 0.5) ? 1 : -1)));
    }
  }
  return n;
}

export class Ecosystem {
  map: WorldMap;
  creatures: Creature[] = [];
  species: EcoSpecies[] = [];
  food: Float32Array;
  foodCap: Float32Array;
  time = 0;
  rain = 0; // 0..1 cyklus hojnosti (déšť)
  births = 0;
  deaths = 0;
  private rng: RNG;
  private grid: number[][] = [];
  private gw: number;
  private gh: number;

  constructor(map: WorldMap, seed: number) {
    this.map = map;
    this.rng = makeRng(seed ^ 0x5eed1234);
    const n = map.width * map.height;
    this.food = new Float32Array(n);
    this.foodCap = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      this.foodCap[i] = map.tiles[i].fertility * 45;
      this.food[i] = this.foodCap[i] * 0.7;
    }
    this.gw = Math.ceil(map.width / GRID);
    this.gh = Math.ceil(map.height / GRID);
  }

  // --- Maker: vypuštění druhu do světa -------------------------------------

  introduceSpecies(
    name: string,
    color: string,
    traits: Traits,
    count: number
  ): EcoSpecies {
    const sp: EcoSpecies = {
      id: this.species.length,
      name,
      color,
      diet: traits.diet,
      baseTraits: { ...traits },
      born: this.time,
      extinctAt: null,
    };
    this.species.push(sp);
    const [cx, cy] = this.spawnLocation(traits);
    for (let k = 0; k < count; k++) {
      if (this.creatures.length >= MAX_CREATURES) break;
      const x = cx + randRange(this.rng, -3, 3);
      const y = cy + randRange(this.rng, -3, 3);
      this.creatures.push(makeCreature(sp.id, mutate(traits, this.rng), x, y, this.rng));
    }
    return sp;
  }

  /** Přidá další jedince existujícího druhu. */
  reinforce(spId: number, count: number): void {
    const sp = this.species[spId];
    if (!sp) return;
    const [cx, cy] = this.spawnLocation(sp.baseTraits);
    for (let k = 0; k < count; k++) {
      if (this.creatures.length >= MAX_CREATURES) break;
      this.creatures.push(
        makeCreature(spId, mutate(sp.baseTraits, this.rng), cx + randRange(this.rng, -3, 3), cy + randRange(this.rng, -3, 3), this.rng)
      );
    }
  }

  /** Kde vypustit druh: dravci/parazité poblíž existující kořisti, býložravci na úrodné půdě. */
  private spawnLocation(traits: Traits): [number, number] {
    if (traits.diet !== "herbivore") {
      const alive = this.creatures.filter((c) => c.alive);
      if (alive.length) {
        const o = alive[(this.rng() * alive.length) | 0];
        return [o.x, o.y];
      }
    }
    return this.spawnSpot(traits);
  }

  private spawnSpot(traits: Traits): [number, number] {
    const { width, height, tiles } = this.map;
    for (let tries = 0; tries < 200; tries++) {
      const x = Math.floor(this.rng() * width);
      const y = Math.floor(this.rng() * height);
      const t = tiles[y * width + x];
      if (!t.isWater && t.fertility > (traits.diet === "carnivore" ? 0.2 : 0.4)) {
        return [x, y];
      }
    }
    return [width / 2, height / 2];
  }

  // --- Hlavní krok ---------------------------------------------------------

  step(dt: number): void {
    const sub = dt > 1.5 ? Math.ceil(dt / 1.5) : 1;
    const sd = dt / sub;
    for (let s = 0; s < sub; s++) this.substep(sd);
    this.updateExtinctions();
  }

  private substep(dt: number): void {
    this.time += dt;
    this.updateRain(dt);
    this.regenFood(dt);
    this.buildGrid();

    const newborns: Creature[] = [];
    const { width, height, tiles } = this.map;

    // spočti aktuální populaci (pro rezervaci míst dle diety)
    let totalAlive = 0;
    let herbAlive = 0;
    for (const c of this.creatures) {
      if (!c.alive) continue;
      totalAlive++;
      if (c.traits.diet === "herbivore" || c.traits.diet === "omnivore") herbAlive++;
    }
    const HERB_LIMIT = MAX_CREATURES * 0.68; // býložravci nesmí zabrat celý strop
    let newbornHerb = 0;

    for (const c of this.creatures) {
      if (!c.alive) continue;

      c.age += dt;
      c.reproCd -= dt;

      // smysly
      let threat: Creature | null = null;
      let threatD = Infinity;
      let prey: Creature | null = null;
      let preyD = Infinity;
      const senseR2 = c.sense * c.sense;
      const fleeR2 = (c.sense * 0.6) * (c.sense * 0.6); // kořist prchá až zblízka
      const isPredator = c.traits.diet === "carnivore" || c.traits.diet === "omnivore";
      const isParasite = c.traits.diet === "parasite";

      this.forEachNeighbor(c.x, c.y, (o) => {
        if (o === c || !o.alive) return;
        const dx = o.x - c.x;
        const dy = o.y - c.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > senseR2) return;
        // hrozba: cizí dravec, který mě uloví (reaguji až zblízka)
        if (
          o.sp !== c.sp &&
          d2 < fleeR2 &&
          (o.traits.diet === "carnivore" || o.traits.diet === "omnivore") &&
          o.attack > c.defense * 0.7 &&
          d2 < threatD
        ) {
          threat = o;
          threatD = d2;
        }
        // kořist: cizí druh, kterého dokážu ulovit
        if ((isPredator || isParasite) && o.sp !== c.sp && d2 < preyD) {
          if (isParasite || c.attack > o.defense * 0.5) {
            prey = o;
            preyD = d2;
          }
        }
      });

      // rozhodnutí o stavu
      const hungry = c.energy < c.maxEnergy * 0.5;
      const fed = c.energy > c.maxEnergy * 0.72;
      const canGraze = c.traits.diet === "herbivore" || c.traits.diet === "omnivore";
      if (threat) {
        c.state = "flee";
      } else if (hungry) {
        if ((isPredator || isParasite) && prey) c.state = "hunt";
        else if (canGraze) c.state = "forage";
        else c.state = "hunt"; // dravec/parazit bez kořisti -> aktivně hledá
      } else if (fed && c.reproCd <= 0) {
        c.state = "mate";
      } else {
        c.state = "wander";
      }

      // pohyb dle stavu
      let mv = c.speed * dt;
      if (c.state === "flee" && threat) {
        const th = threat as Creature;
        c.dir = Math.atan2(c.y - th.y, c.x - th.x);
        mv *= 1.1;
        c.energy -= c.metabolism * dt * 0.6; // útěk stojí extra
      } else if (c.state === "hunt" && prey) {
        const py = prey as Creature;
        c.dir = Math.atan2(py.y - c.y, py.x - c.x);
        mv *= 1.7;
      } else if (c.state === "hunt") {
        // bez kořisti v dohledu — cílevědomě prohledává (drží směr)
        c.dir += randRange(this.rng, -0.12, 0.12) * dt;
        mv *= 1.3;
      } else if (c.state === "forage") {
        // zamiř k nejvýživnější dlaždici v okolí
        const target = this.bestFoodNear(c.x, c.y);
        if (target) c.dir = Math.atan2(target.y - c.y, target.x - c.x);
      } else if (c.state === "wander") {
        c.dir += randRange(this.rng, -0.5, 0.5) * dt;
      }

      let nx = c.x + Math.cos(c.dir) * mv;
      let ny = c.y + Math.sin(c.dir) * mv;
      // vyhni se hluboké vodě a okrajům
      if (nx < 1) nx = 1;
      if (ny < 1) ny = 1;
      if (nx > width - 2) nx = width - 2;
      if (ny > height - 2) ny = height - 2;
      const ti = (ny | 0) * width + (nx | 0);
      if (tiles[ti].isWater && tiles[ti].biome === "ocean") {
        c.dir += Math.PI * randRange(this.rng, 0.6, 1.4); // odraz od oceánu
      } else {
        c.x = nx;
        c.y = ny;
      }

      // metabolismus
      c.energy -= c.metabolism * dt;

      // interakce: krmení / lov / parazitismus
      const idx = (c.y | 0) * width + (c.x | 0);
      if (c.traits.diet === "herbivore" || c.traits.diet === "omnivore") {
        const eat = Math.min(this.food[idx], (3.5 + c.traits.size * 0.8) * dt);
        if (eat > 0) {
          this.food[idx] -= eat;
          c.energy = Math.min(c.maxEnergy, c.energy + eat * 0.9);
        }
      }
      if ((isPredator || isParasite) && prey) {
        const py = prey as Creature;
        const dx = py.x - c.x;
        const dy = py.y - c.y;
        if (dx * dx + dy * dy < 1.4) {
          if (isParasite) {
            const drain = Math.min(py.energy, 3 * dt);
            py.energy -= drain;
            c.energy = Math.min(c.maxEnergy, c.energy + drain * 0.8);
          } else {
            const dmg = Math.max(1, c.attack - py.defense * 0.5) * dt * 2.2;
            py.energy -= dmg;
            if (py.energy <= 0) {
              py.alive = false;
              this.deaths++;
              c.energy = Math.min(c.maxEnergy, c.energy + Math.min(py.maxEnergy * 0.9, 65));
            }
          }
        }
      }

      // smrt
      if (c.energy <= 0 || c.age > c.maxAge) {
        c.alive = false;
        this.deaths++;
        this.food[idx] = Math.min(this.foodCap[idx] + 20, this.food[idx] + 8); // mršina hnojí
        continue;
      }

      // množení (asexuální dělení s mutací -> evoluce)
      const herbType = c.traits.diet === "herbivore" || c.traits.diet === "omnivore";
      const roomTotal = totalAlive + newborns.length < MAX_CREATURES;
      const roomDiet = herbType ? herbAlive + newbornHerb < HERB_LIMIT : true;
      if (
        c.energy > c.maxEnergy * 0.78 &&
        c.reproCd <= 0 &&
        roomTotal &&
        roomDiet &&
        chance(this.rng, 0.06 * dt)
      ) {
        c.energy *= 0.5;
        c.reproCd = randRange(this.rng, 150, 260);
        const child = makeCreature(
          c.sp,
          mutate(c.traits, this.rng),
          c.x + randRange(this.rng, -1, 1),
          c.y + randRange(this.rng, -1, 1),
          this.rng
        );
        child.energy = c.energy;
        newborns.push(child);
        if (herbType) newbornHerb++;
        this.births++;
      }
    }

    for (const b of newborns) this.creatures.push(b);

    // občas vyčisti mrtvé
    if (this.creatures.length > 0 && (this.deaths & 31) === 0) {
      this.creatures = this.creatures.filter((c) => c.alive);
    }
  }

  private updateRain(dt: number): void {
    // pomalý cyklus hojnosti + občasné deště
    this.rain = (Math.sin(this.time * 0.01) + 1) * 0.5;
    void dt;
  }

  private regenFood(dt: number): void {
    const mult = 0.6 + this.rain * 0.6;
    const tiles = this.map.tiles;
    for (let i = 0; i < tiles.length; i++) {
      const cap = this.foodCap[i];
      if (cap <= 0) continue;
      const regen = tiles[i].fertility * 0.11 * mult * dt;
      if (this.food[i] < cap) {
        this.food[i] = Math.min(cap, this.food[i] + regen * (1 - this.food[i] / cap));
      }
    }
  }

  private bestFoodNear(x: number, y: number): { x: number; y: number } | null {
    const { width, height } = this.map;
    let best = -1;
    let bx = x;
    let by = y;
    const r = 3;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const tx = (x + dx) | 0;
        const ty = (y + dy) | 0;
        if (tx < 0 || ty < 0 || tx >= width || ty >= height) continue;
        const f = this.food[ty * width + tx];
        if (f > best) {
          best = f;
          bx = tx;
          by = ty;
        }
      }
    }
    return best > 1 ? { x: bx + 0.5, y: by + 0.5 } : null;
  }

  // --- prostorová mřížka ---------------------------------------------------

  private buildGrid(): void {
    const cells = this.gw * this.gh;
    if (this.grid.length !== cells) {
      this.grid = new Array(cells);
      for (let i = 0; i < cells; i++) this.grid[i] = [];
    } else {
      for (let i = 0; i < cells; i++) this.grid[i].length = 0;
    }
    const cs = this.creatures;
    for (let i = 0; i < cs.length; i++) {
      const c = cs[i];
      if (!c.alive) continue;
      const gx = Math.min(this.gw - 1, Math.max(0, (c.x / GRID) | 0));
      const gy = Math.min(this.gh - 1, Math.max(0, (c.y / GRID) | 0));
      this.grid[gy * this.gw + gx].push(i);
    }
  }

  private forEachNeighbor(x: number, y: number, fn: (c: Creature) => void): void {
    const gx = Math.min(this.gw - 1, Math.max(0, (x / GRID) | 0));
    const gy = Math.min(this.gh - 1, Math.max(0, (y / GRID) | 0));
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = gx + dx;
        const ny = gy + dy;
        if (nx < 0 || ny < 0 || nx >= this.gw || ny >= this.gh) continue;
        const bucket = this.grid[ny * this.gw + nx];
        for (let k = 0; k < bucket.length; k++) fn(this.creatures[bucket[k]]);
      }
    }
  }

  // --- statistiky ----------------------------------------------------------

  countBySpecies(): number[] {
    const counts = new Array(this.species.length).fill(0);
    for (const c of this.creatures) if (c.alive) counts[c.sp]++;
    return counts;
  }

  aliveCount(): number {
    let n = 0;
    for (const c of this.creatures) if (c.alive) n++;
    return n;
  }

  private updateExtinctions(): void {
    const counts = this.countBySpecies();
    for (const sp of this.species) {
      if (sp.extinctAt === null && counts[sp.id] === 0) sp.extinctAt = this.time;
      else if (sp.extinctAt !== null && counts[sp.id] > 0) sp.extinctAt = null; // reintrodukce
    }
  }
}
