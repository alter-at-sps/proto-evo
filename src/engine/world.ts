// Feature 1 — Procedurální generace světa.
// Perlin noise -> elevation + moisture; latituda -> teplota/klima; biomy; řeky.

import { Perlin } from "./noise";
import { makeRng, hashSeed, randInt } from "./rng";
import type { Biome, ClimateZone, Tile, WorldMap } from "./types";

export const SEA_LEVEL = 0.4;
export const MOUNTAIN_LEVEL = 0.72;

function climateForLatitude(y: number, height: number): ClimateZone {
  const lat = Math.abs(y / (height - 1) - 0.5) * 2; // 0 rovník .. 1 póly
  if (lat > 0.66) return "arctic";
  if (lat > 0.33) return "temperate";
  return "tropical";
}

/** Základní teplota dle latitudy a nadmořské výšky (0..1). */
function baseTempFor(y: number, height: number, elevation: number): number {
  const lat = Math.abs(y / (height - 1) - 0.5) * 2;
  let t = 1 - lat; // teplo na rovníku
  t -= Math.max(0, elevation - SEA_LEVEL) * 0.6; // hory chladnější
  return Math.max(0, Math.min(1, t));
}

function pickBiome(
  elevation: number,
  moisture: number,
  temp: number,
  isWater: boolean,
  isRiver: boolean
): Biome {
  if (isRiver) return "river";
  if (isWater) {
    if (elevation > SEA_LEVEL - 0.06) return "coast";
    return "ocean";
  }
  if (elevation < SEA_LEVEL + 0.03) return "beach";
  if (elevation > MOUNTAIN_LEVEL) return "mountain";
  if (temp < 0.22) return moisture > 0.5 ? "ice" : "tundra";
  if (temp < 0.45) return moisture > 0.45 ? "forest" : "grassland";
  // teplé pásmo
  if (moisture < 0.3) return "desert";
  if (moisture > 0.66) return "tropical";
  return moisture > 0.45 ? "forest" : "grassland";
}

const FERTILITY: Record<Biome, number> = {
  ocean: 0.35,
  coast: 0.55,
  beach: 0.2,
  desert: 0.12,
  grassland: 0.7,
  forest: 0.85,
  tropical: 1.0,
  tundra: 0.25,
  ice: 0.05,
  mountain: 0.15,
  river: 0.9,
  lake: 0.8,
};

/** Vytvoří svět z číselného nebo textového seedu. */
export function generateWorld(
  seedInput: number | string,
  width = 140,
  height = 90
): WorldMap {
  const seed =
    typeof seedInput === "number" ? seedInput >>> 0 : hashSeed(seedInput);
  const seedLabel = String(seedInput);

  const elevNoise = new Perlin(seed);
  const moistNoise = new Perlin(seed ^ 0x9e3779b9);
  const detailNoise = new Perlin(seed ^ 0x85ebca6b);

  const scale = 4.5;
  const tiles: Tile[] = new Array(width * height);

  // 1) elevation + moisture + radiální maska (ostrovy / kontinenty)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const nx = (x / width) * scale;
      const ny = (y / height) * scale;
      let elevation = elevNoise.fbm(nx, ny, 6);
      // jemný detail
      elevation = elevation * 0.85 + detailNoise.fbm(nx * 3, ny * 3, 3) * 0.15;
      // okrajová maska -> oceán u krajů, pevnina ve středu
      const dx = (x / (width - 1) - 0.5) * 2;
      const dy = (y / (height - 1) - 0.5) * 2;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const mask = 1 - Math.pow(Math.min(1, dist / 1.05), 2.2);
      elevation = Math.max(0, Math.min(1, elevation * 0.7 + mask * 0.45 - 0.1));

      const moisture = moistNoise.fbm(nx * 1.3 + 11, ny * 1.3 - 7, 5);
      const isWater = elevation < SEA_LEVEL;
      const baseTemp = baseTempFor(y, height, elevation);

      tiles[y * width + x] = {
        x,
        y,
        elevation,
        moisture,
        baseTemp,
        biome: "ocean",
        climate: climateForLatitude(y, height),
        isWater,
        river: false,
        fertility: 0,
      };
    }
  }

  // 2) řeky — z náhodných vysokých bodů stékají z kopce k moři
  carveRivers(tiles, width, height, seed);

  // 3) jezera — vnitrozemské vodní plochy v prohlubních (low elevation, ne u kraje)
  for (const t of tiles) {
    if (!t.isWater && t.elevation < SEA_LEVEL + 0.02 && t.moisture > 0.75) {
      // ojedinělé vnitrozemské jezero
    }
  }

  // 4) biomy + úrodnost
  for (const t of tiles) {
    t.biome = pickBiome(
      t.elevation,
      t.moisture,
      t.baseTemp,
      t.isWater,
      t.river
    );
    if (t.biome === "lake") t.isWater = true;
    t.fertility = FERTILITY[t.biome];
  }

  return { seed, seedLabel, width, height, tiles };
}

function carveRivers(
  tiles: Tile[],
  width: number,
  height: number,
  seed: number
): void {
  const rng = makeRng(seed ^ 0xc2b2ae35);
  const at = (x: number, y: number) => tiles[y * width + x];
  const riverCount = randInt(rng, 8, 14);

  for (let r = 0; r < riverCount; r++) {
    // start na náhodném dost vysokém bodě
    let sx = randInt(rng, 2, width - 3);
    let sy = randInt(rng, 2, height - 3);
    let best = at(sx, sy);
    for (let tries = 0; tries < 30; tries++) {
      const cx = randInt(rng, 2, width - 3);
      const cy = randInt(rng, 2, height - 3);
      if (at(cx, cy).elevation > best.elevation) {
        best = at(cx, cy);
        sx = cx;
        sy = cy;
      }
    }
    if (best.elevation < MOUNTAIN_LEVEL - 0.08) continue;

    let x = sx;
    let y = sy;
    for (let step = 0; step < width + height; step++) {
      const t = at(x, y);
      if (t.isWater) break; // doteklo k moři
      t.river = true;
      t.isWater = true;
      t.moisture = Math.min(1, t.moisture + 0.3);
      // navlhči okolí
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < width && ny < height) {
            const n = at(nx, ny);
            if (!n.river) n.moisture = Math.min(1, n.moisture + 0.12);
          }
        }
      }
      // najdi nejnižšího souseda (gradient descent)
      let nextX = x;
      let nextY = y;
      let lowest = t.elevation;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const e = at(nx, ny).elevation;
          if (e < lowest) {
            lowest = e;
            nextX = nx;
            nextY = ny;
          }
        }
      }
      if (nextX === x && nextY === y) break; // lokální minimum -> jezero
      x = nextX;
      y = nextY;
    }
  }
}

export function tileIndex(map: WorldMap, x: number, y: number): number {
  return y * map.width + x;
}
