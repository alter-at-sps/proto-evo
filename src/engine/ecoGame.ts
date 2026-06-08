// Orchestrátor agentního ekosystému. Hráč je „maker" — navrhuje a vypouští
// druhy; svět pak běží sám. Bez serverové vrstvy (vše client-side).

import { Ecosystem, MAX_CREATURES } from "./ecosystem";
import { makeRng, type RNG } from "./rng";
import { randomColor, randomSpeciesName } from "./species";
import { generateWorld } from "./world";
import type { Diet, Traits, WorldMap } from "./types";

export interface EcoEvent {
  time: number;
  kind: "intro" | "extinct" | "info";
  text: string;
}

export interface RosterEntry {
  id: number;
  name: string;
  color: string;
  diet: Diet;
  count: number;
  alive: boolean;
}

export interface EcoSnapshot {
  time: number;
  totalCreatures: number;
  aliveSpecies: number;
  totalSpecies: number;
  rain: number;
  births: number;
  deaths: number;
  capPct: number;
  roster: RosterEntry[];
  events: EcoEvent[];
}

export class EcoGame {
  map: WorldMap;
  eco: Ecosystem;
  events: EcoEvent[] = [];
  history: number[] = [];
  private rng: RNG;
  private colorIdx = 0;
  private extinctSeen = new Set<number>();

  constructor(seedInput: number | string) {
    this.map = generateWorld(seedInput, 140, 90);
    this.rng = makeRng(this.map.seed ^ 0xabcdef);
    this.eco = new Ecosystem(this.map, this.map.seed);
  }

  suggestName(): string {
    return randomSpeciesName(this.rng);
  }
  suggestColor(): string {
    return randomColor(this.rng, this.colorIdx++);
  }

  introduce(name: string, color: string, traits: Traits, count: number): void {
    const sp = this.eco.introduceSpecies(name, color, traits, count);
    this.events.push({
      time: this.eco.time,
      kind: "intro",
      text: `Vypuštěn druh ${sp.name} — ${count} jedinců.`,
    });
  }

  reinforce(spId: number, count: number): void {
    this.eco.reinforce(spId, count);
    const sp = this.eco.species[spId];
    if (sp) {
      this.events.push({
        time: this.eco.time,
        kind: "info",
        text: `Posila pro druh ${sp.name} — +${count} jedinců.`,
      });
    }
  }

  tick(dt: number): void {
    this.eco.step(dt);

    for (const sp of this.eco.species) {
      if (sp.extinctAt !== null && !this.extinctSeen.has(sp.id)) {
        this.extinctSeen.add(sp.id);
        this.events.push({
          time: this.eco.time,
          kind: "extinct",
          text: `Druh ${sp.name} vyhynul.`,
        });
      } else if (sp.extinctAt === null) {
        this.extinctSeen.delete(sp.id);
      }
    }

    this.history.push(this.eco.aliveCount());
    if (this.history.length > 200) this.history.shift();
    if (this.events.length > 60) this.events.splice(0, this.events.length - 60);
  }

  snapshot(): EcoSnapshot {
    const counts = this.eco.countBySpecies();
    const roster: RosterEntry[] = this.eco.species.map((sp) => ({
      id: sp.id,
      name: sp.name,
      color: sp.color,
      diet: sp.diet,
      count: counts[sp.id] ?? 0,
      alive: (counts[sp.id] ?? 0) > 0,
    }));
    roster.sort((a, b) => Number(b.alive) - Number(a.alive) || b.count - a.count);
    const total = this.eco.aliveCount();
    return {
      time: Math.floor(this.eco.time),
      totalCreatures: total,
      aliveSpecies: roster.filter((r) => r.alive).length,
      totalSpecies: this.eco.species.length,
      rain: this.eco.rain,
      births: this.eco.births,
      deaths: this.eco.deaths,
      capPct: total / MAX_CREATURES,
      roster,
      events: this.events.slice(-12).reverse(),
    };
  }
}
