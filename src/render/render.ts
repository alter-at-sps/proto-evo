// Canvas vykreslování: mapa (s proměnou dle sezóny), populace, katastrofy
// a vizuální rendering druhu (Feature 1 + 2 + 4).

import type { Simulation } from "../engine/simulation";
import type { Biome, Season, Species, Traits } from "../engine/types";

const BIOME_COLORS: Record<Biome, [number, number, number]> = {
  ocean: [24, 58, 110],
  coast: [40, 96, 150],
  beach: [222, 206, 150],
  desert: [222, 198, 120],
  grassland: [126, 174, 88],
  forest: [54, 122, 66],
  tropical: [34, 130, 78],
  tundra: [150, 162, 150],
  ice: [226, 236, 244],
  mountain: [120, 116, 110],
  river: [60, 120, 180],
  lake: [48, 110, 170],
};

function mix(
  c: [number, number, number],
  target: [number, number, number],
  t: number
): [number, number, number] {
  return [
    c[0] + (target[0] - c[0]) * t,
    c[1] + (target[1] - c[1]) * t,
    c[2] + (target[2] - c[2]) * t,
  ];
}

/** Barva dlaždice s proměnou dle sezóny (vizuální proměna mapy). */
function biomeColor(
  biome: Biome,
  temp: number,
  season: Season,
  food: number,
  cap: number
): string {
  let c = BIOME_COLORS[biome].slice() as [number, number, number];
  const isLand = biome !== "ocean" && biome !== "coast" && biome !== "river" && biome !== "lake";

  if (isLand) {
    // úrodnost -> sytost zeleně/hnědi
    const lush = cap > 0 ? food / cap : 0;
    c = mix(c, [70, 60, 40], (1 - lush) * 0.35);

    if (season === "autumn" && (biome === "forest" || biome === "tropical")) {
      c = mix(c, [196, 120, 48], 0.45);
    }
    if (season === "winter" && temp < 0.34) {
      c = mix(c, [232, 238, 246], Math.min(0.85, (0.34 - temp) * 3));
    }
    if (season === "summer" && biome === "desert") {
      c = mix(c, [236, 214, 150], 0.4);
    }
    if (season === "spring" && (biome === "grassland" || biome === "forest")) {
      c = mix(c, [150, 200, 90], 0.25);
    }
  }
  return `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
}

export interface ViewConfig {
  cell: number;
}

/** Vykreslí celou mapu (biomy + sezónní proměna + řeky). */
export function drawWorld(
  ctx: CanvasRenderingContext2D,
  sim: Simulation,
  view: ViewConfig
): void {
  const { map } = sim;
  const { cell } = view;
  const { width, height, tiles } = map;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const t = tiles[i];
      ctx.fillStyle = biomeColor(
        t.biome,
        sim.temp[i],
        sim.season,
        sim.food[i],
        sim.foodCap[i]
      );
      ctx.fillRect(x * cell, y * cell, cell, cell);
    }
  }
}

/** Vykreslí populace druhů (teritoria) jako barevné vrstvy s průhledností. */
export function drawPopulations(
  ctx: CanvasRenderingContext2D,
  species: Species[],
  view: ViewConfig,
  width: number,
  height: number
): void {
  const cell = view.cell;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      // najdi dominantní druh na dlaždici
      let best: Species | null = null;
      let bestPop = 0.6;
      for (const s of species) {
        if (s.diedTick !== null) continue;
        const p = s.pop[i];
        if (p > bestPop) {
          bestPop = p;
          best = s;
        }
      }
      if (!best) continue;
      const alpha = Math.min(0.95, 0.4 + bestPop / 75);
      ctx.fillStyle = withAlpha(best.color, alpha);
      ctx.fillRect(x * cell, y * cell, cell, cell);
      if (best.isPlayer && bestPop > 25) {
        ctx.fillStyle = "rgba(255,255,255,0.55)";
        ctx.fillRect(x * cell + cell * 0.35, y * cell + cell * 0.35, cell * 0.3, cell * 0.3);
      }
    }
  }
}

/** Vykreslí probíhající katastrofy. */
export function drawDisasters(
  ctx: CanvasRenderingContext2D,
  sim: Simulation,
  view: ViewConfig
): void {
  const cell = view.cell;
  const colors: Record<string, string> = {
    volcano: "rgba(255,90,30,0.35)",
    meteor: "rgba(180,180,255,0.35)",
    wildfire: "rgba(255,140,0,0.32)",
    epidemic: "rgba(150,40,160,0.3)",
  };
  const icons: Record<string, string> = {
    volcano: "🌋",
    meteor: "☄️",
    wildfire: "🔥",
    epidemic: "🦠",
  };
  for (const d of sim.disasters) {
    ctx.beginPath();
    ctx.fillStyle = colors[d.type] ?? "rgba(255,0,0,0.3)";
    ctx.arc(d.cx * cell, d.cy * cell, d.radius * cell, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.4)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.font = `${cell * 3}px serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(icons[d.type] ?? "?", d.cx * cell, d.cy * cell);
  }
}

function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Vizuální rendering druhu (Spore styl) z jeho vlastností. */
export function drawCreature(
  ctx: CanvasRenderingContext2D,
  traits: Traits,
  color: string,
  cx: number,
  cy: number,
  scale: number
): void {
  const bodyR = (8 + traits.size * 4) * (scale / 28);
  ctx.save();
  ctx.translate(cx, cy);

  // křídla
  if (traits.wings > 0) {
    ctx.fillStyle = withAlpha(color, 0.4);
    const wspan = bodyR * (1.4 + traits.wings * 0.4);
    ctx.beginPath();
    ctx.ellipse(-bodyR, -bodyR * 0.2, wspan, bodyR * 0.7, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(bodyR, -bodyR * 0.2, wspan, bodyR * 0.7, 0.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // končetiny (nohy)
  if (traits.limbs > 0) {
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1.5, bodyR * 0.12);
    const legs = Math.min(6, traits.limbs + 1);
    for (let i = 0; i < legs; i++) {
      const a = (i / (legs - 1) - 0.5) * 1.6;
      ctx.beginPath();
      ctx.moveTo(Math.sin(a) * bodyR * 0.6, bodyR * 0.4);
      ctx.lineTo(Math.sin(a) * bodyR * 1.5, bodyR * 1.4);
      ctx.stroke();
    }
  }

  // tělo
  ctx.fillStyle = color;
  ctx.strokeStyle = "rgba(0,0,0,0.4)";
  ctx.lineWidth = 1 + traits.hide * 0.6; // kůže -> tlustší obrys
  ctx.beginPath();
  ctx.ellipse(0, 0, bodyR, bodyR * 0.85, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // zuby (špičky)
  if (traits.teeth > 0) {
    ctx.fillStyle = "#fff";
    const fangs = Math.min(5, traits.teeth);
    for (let i = 0; i < fangs; i++) {
      const a = (i / Math.max(1, fangs - 1) - 0.5) * 1.2;
      const fx = Math.sin(a) * bodyR * 0.6;
      const fy = bodyR * 0.55;
      ctx.beginPath();
      ctx.moveTo(fx - bodyR * 0.08, fy);
      ctx.lineTo(fx + bodyR * 0.08, fy);
      ctx.lineTo(fx, fy + bodyR * 0.4);
      ctx.closePath();
      ctx.fill();
    }
  }

  // oči
  ctx.fillStyle = "#fff";
  const eyeOff = bodyR * 0.35;
  ctx.beginPath();
  ctx.arc(-eyeOff, -bodyR * 0.2, bodyR * 0.18, 0, Math.PI * 2);
  ctx.arc(eyeOff, -bodyR * 0.2, bodyR * 0.18, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#111";
  ctx.beginPath();
  ctx.arc(-eyeOff, -bodyR * 0.2, bodyR * 0.08, 0, Math.PI * 2);
  ctx.arc(eyeOff, -bodyR * 0.2, bodyR * 0.08, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}
