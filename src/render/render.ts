// Canvas vykreslování: mapa, jednotliví agenti a vizuální rendering druhu.

import type { Creature, EcoSpecies } from "../engine/ecosystem";
import type { Biome, Traits, WorldMap } from "../engine/types";

export const BIOME_LABELS: Record<Biome, string> = {
  ocean: "Oceán",
  coast: "Pobřežní moře",
  beach: "Pláž",
  desert: "Poušť",
  grassland: "Step",
  forest: "Les",
  tropical: "Tropy",
  tundra: "Tundra",
  ice: "Led",
  mountain: "Hory",
  river: "Řeka",
  lake: "Jezero",
};

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

/** Barva dlaždice — terén s vyznačením úrodnosti (potravy). */
function biomeColor(biome: Biome, food: number, cap: number): string {
  let c = BIOME_COLORS[biome].slice() as [number, number, number];
  const isLand = biome !== "ocean" && biome !== "coast" && biome !== "river" && biome !== "lake";
  if (isLand) {
    const lush = cap > 0 ? food / cap : 0;
    c = mix(c, [74, 62, 42], (1 - lush) * 0.4); // málo potravy -> hnědne
    c = mix(c, [150, 210, 110], lush * 0.18); // hodně potravy -> svěží zeleň
  }
  return `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
}

export interface ViewConfig {
  cell: number;
}

/** Vykreslí celou mapu (biomy + úrodnost). */
export function drawWorld(
  ctx: CanvasRenderingContext2D,
  map: WorldMap,
  food: Float32Array,
  foodCap: Float32Array,
  view: ViewConfig
): void {
  const { cell } = view;
  const { width, height, tiles } = map;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      ctx.fillStyle = biomeColor(tiles[i].biome, food[i], foodCap[i]);
      ctx.fillRect(x * cell, y * cell, cell, cell);
    }
  }
}

/** Vykreslí jednotlivé agenty (živé tvory) na mapě. */
export function drawAgents(
  ctx: CanvasRenderingContext2D,
  creatures: Creature[],
  species: EcoSpecies[],
  view: ViewConfig
): void {
  const cell = view.cell;
  for (let i = 0; i < creatures.length; i++) {
    const c = creatures[i];
    if (!c.alive) continue;
    const sp = species[c.sp];
    if (!sp) continue;
    const x = c.x * cell;
    const y = c.y * cell;
    const r = 2.2 + c.traits.size * 0.95;

    // tělo
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = sp.color;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle =
      c.state === "flee" ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.4)";
    ctx.stroke();

    // směrový hrot (pocit pohybu) — výrazný u dravců
    const dieted = sp.diet === "carnivore" || sp.diet === "omnivore";
    if (dieted) {
      ctx.beginPath();
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.arc(x + Math.cos(c.dir) * r * 0.6, y + Math.sin(c.dir) * r * 0.6, Math.max(0.8, r * 0.3), 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** Rozparsuje barvu z #hex i z rgb()/rgba() na trojici 0..255. */
function parseColor(c: string): [number, number, number] {
  if (c[0] === "#") {
    const h = c.slice(1);
    return [
      parseInt(h.substring(0, 2), 16),
      parseInt(h.substring(2, 4), 16),
      parseInt(h.substring(4, 6), 16),
    ];
  }
  const m = c.match(/-?\d+(\.\d+)?/g);
  if (m) return [Number(m[0]) || 0, Number(m[1]) || 0, Number(m[2]) || 0];
  return [128, 128, 128];
}

function withAlpha(color: string, alpha: number): string {
  const [r, g, b] = parseColor(color);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Zesvětlí (amt>0) nebo ztmaví (amt<0) barvu. */
function shade(color: string, amt: number): string {
  let [r, g, b] = parseColor(color);
  if (amt >= 0) {
    r += (255 - r) * amt;
    g += (255 - g) * amt;
    b += (255 - b) * amt;
  } else {
    r *= 1 + amt;
    g *= 1 + amt;
    b *= 1 + amt;
  }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

/**
 * Vizuální rendering druhu (Spore styl) z jeho vlastností.
 * `time` (sekundy) přidává jemnou idle animaci (dýchání, mrkání, mávání křídel).
 */
export function drawCreature(
  ctx: CanvasRenderingContext2D,
  traits: Traits,
  color: string,
  cx: number,
  cy: number,
  scale: number,
  time = 0
): void {
  const u = scale / 150;
  const t = time;
  const breathe = 1 + Math.sin(t * 2.2) * 0.025;
  const bob = Math.sin(t * 2.2) * 2 * u;
  const bodyR = (22 + traits.size * 5) * u * breathe;
  const bodyH = bodyR * (0.9 + traits.size * 0.02); // vyšší tělo u velkých

  const dark = shade(color, -0.45);
  const mid = shade(color, -0.12);
  const light = shade(color, 0.4);

  ctx.save();
  ctx.translate(cx, cy + bob);
  ctx.lineJoin = "round";

  // --- stín na zemi ---
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.beginPath();
  ctx.ellipse(0, bodyH * 1.55 - bob, bodyR * 1.05, bodyR * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();

  // --- křídla (za tělem) ---
  if (traits.wings > 0) {
    const flap = Math.sin(t * 7) * 0.35 * Math.min(1, traits.wings / 2);
    const wspan = bodyR * (0.9 + traits.wings * 0.45);
    const whgt = bodyR * (0.75 + traits.wings * 0.1);
    for (const side of [-1, 1] as const) {
      ctx.save();
      ctx.translate(side * bodyR * 0.55, -bodyR * 0.35);
      ctx.rotate(side * (0.5 + flap));
      const grad = ctx.createLinearGradient(0, 0, side * wspan, 0);
      grad.addColorStop(0, withAlpha(light, 0.85));
      grad.addColorStop(1, withAlpha(color, 0.45));
      ctx.fillStyle = grad;
      ctx.strokeStyle = withAlpha(dark, 0.6);
      ctx.lineWidth = 1.4 * u;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(side * wspan * 0.7, -whgt, side * wspan, -whgt * 0.2);
      ctx.quadraticCurveTo(side * wspan * 0.9, whgt * 0.45, side * wspan * 0.4, whgt * 0.5);
      ctx.quadraticCurveTo(side * wspan * 0.3, whgt * 0.2, 0, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // žilky
      ctx.strokeStyle = withAlpha(dark, 0.35);
      ctx.lineWidth = 1 * u;
      for (const f of [0.3, 0.55, 0.8]) {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(side * wspan * f, -whgt * (0.5 - f * 0.3));
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  // --- nohy (páry pod tělem) ---
  if (traits.limbs > 0) {
    const pairs = Math.min(4, Math.ceil((traits.limbs + 1) / 1.5));
    const legLen = bodyR * (0.5 + traits.limbs * 0.12);
    const legW = Math.max(2.5 * u, bodyR * (0.1 + traits.size * 0.012));
    ctx.strokeStyle = mid;
    ctx.lineCap = "round";
    ctx.lineWidth = legW;
    for (let p = 0; p < pairs; p++) {
      const px = (p / Math.max(1, pairs - 1) - 0.5) * bodyR * 1.1;
      const wig = Math.sin(t * 3 + p) * legLen * 0.12;
      for (const side of [-1, 1] as const) {
        const hipX = px * 0.5 + side * bodyR * 0.5;
        const hipY = bodyH * 0.55;
        const footX = hipX + side * legLen * 0.5 + wig * 0.5;
        const footY = hipY + legLen;
        ctx.beginPath();
        ctx.moveTo(hipX, hipY);
        ctx.quadraticCurveTo(hipX + side * legLen * 0.4, hipY + legLen * 0.55, footX, footY);
        ctx.stroke();
        // chodidlo
        ctx.fillStyle = dark;
        ctx.beginPath();
        ctx.ellipse(footX, footY, legW * 0.9, legW * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // --- ocas (u rychlých / malých) ---
  if (traits.limbs >= 3 && traits.size <= 3) {
    const sway = Math.sin(t * 3) * bodyR * 0.25;
    ctx.strokeStyle = mid;
    ctx.lineWidth = bodyR * 0.16;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(0, bodyH * 0.5);
    ctx.quadraticCurveTo(bodyR * 0.9, bodyH * 0.9, bodyR * 1.3 + sway, bodyH * 0.4);
    ctx.stroke();
  }

  // --- tělo (radiální gradient) ---
  const bg = ctx.createRadialGradient(
    -bodyR * 0.3,
    -bodyH * 0.4,
    bodyR * 0.2,
    0,
    0,
    bodyR * 1.2
  );
  bg.addColorStop(0, light);
  bg.addColorStop(0.55, color);
  bg.addColorStop(1, mid);
  ctx.fillStyle = bg;
  ctx.strokeStyle = dark;
  ctx.lineWidth = (1 + traits.hide * 0.7) * u; // kůže -> tlustší obrys
  ctx.beginPath();
  ctx.ellipse(0, 0, bodyR, bodyH, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // --- hřbetní pancíř / ostny dle kůže ---
  if (traits.hide >= 1) {
    ctx.fillStyle = dark;
    ctx.strokeStyle = shade(color, -0.55);
    ctx.lineWidth = 1 * u;
    const spikes = traits.hide + 1;
    for (let i = 0; i < spikes; i++) {
      const a = -Math.PI / 2 + (i / (spikes - 1) - 0.5) * 1.7;
      const sx = Math.cos(a) * bodyR * 0.92;
      const sy = Math.sin(a) * bodyH * 0.92;
      const nx = Math.cos(a);
      const ny = Math.sin(a);
      const h = bodyR * (0.12 + traits.hide * 0.04);
      const tang = bodyR * 0.1;
      ctx.beginPath();
      ctx.moveTo(sx - ny * tang, sy + nx * tang);
      ctx.lineTo(sx + nx * h, sy + ny * h);
      ctx.lineTo(sx + ny * tang, sy - nx * tang);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }

  // --- břišní světlejší ploška ---
  ctx.fillStyle = withAlpha(light, 0.55);
  ctx.beginPath();
  ctx.ellipse(0, bodyH * 0.28, bodyR * 0.55, bodyH * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // --- rohy (velké / dravé druhy) ---
  if (traits.teeth >= 3 || traits.size >= 4) {
    ctx.fillStyle = shade("#efe6d0", -0.05);
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = 1 * u;
    for (const side of [-1, 1] as const) {
      const hx = side * bodyR * 0.45;
      const hy = -bodyH * 0.78;
      ctx.beginPath();
      ctx.moveTo(hx - side * bodyR * 0.1, hy + bodyR * 0.1);
      ctx.quadraticCurveTo(hx + side * bodyR * 0.05, hy - bodyR * 0.45, hx + side * bodyR * 0.28, hy - bodyR * 0.55);
      ctx.quadraticCurveTo(hx + side * bodyR * 0.12, hy - bodyR * 0.2, hx + side * bodyR * 0.12, hy + bodyR * 0.08);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }

  // --- pusa + zuby ---
  const mouthY = bodyH * 0.34;
  const carnivore = traits.diet === "carnivore";
  const mouthW = bodyR * (0.4 + (carnivore ? 0.2 : 0));
  ctx.strokeStyle = shade(color, -0.6);
  ctx.lineWidth = 2 * u;
  ctx.beginPath();
  ctx.moveTo(-mouthW, mouthY);
  ctx.quadraticCurveTo(0, mouthY + bodyR * (carnivore ? 0.22 : 0.14), mouthW, mouthY);
  ctx.stroke();
  if (traits.teeth > 0) {
    ctx.fillStyle = "#fdfdf5";
    const fangs = Math.min(6, traits.teeth + 1);
    const sharp = carnivore ? 1.5 : 1;
    for (let i = 0; i < fangs; i++) {
      const fx = (i / (fangs - 1) - 0.5) * mouthW * 1.7;
      const fy = mouthY + Math.abs(fx) * 0.05;
      const fw = bodyR * 0.055;
      const fh = bodyR * (0.1 + traits.teeth * 0.03) * sharp;
      ctx.beginPath();
      ctx.moveTo(fx - fw, fy);
      ctx.lineTo(fx + fw, fy);
      ctx.lineTo(fx, fy + fh);
      ctx.closePath();
      ctx.fill();
    }
  }

  // --- oči ---
  const blink = Math.sin(t * 0.9 + 1.3) > 0.96 ? 0.12 : 1; // občasné mrknutí
  const parasite = traits.diet === "parasite";
  const eyeCount = parasite ? 3 : 2;
  const eyeR = bodyR * (parasite ? 0.13 : 0.2);
  const eyeY = -bodyH * 0.22;
  const lookX = Math.sin(t * 0.6) * eyeR * 0.25;
  for (let i = 0; i < eyeCount; i++) {
    const ex =
      eyeCount === 2
        ? (i === 0 ? -1 : 1) * bodyR * 0.38
        : (i - 1) * bodyR * 0.34;
    // bělmo
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.ellipse(ex, eyeY, eyeR, eyeR * blink, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.2)";
    ctx.lineWidth = 1 * u;
    ctx.stroke();
    if (blink > 0.5) {
      // zornice
      ctx.fillStyle = carnivore ? "#7a0e0e" : "#15121a";
      ctx.beginPath();
      ctx.arc(ex + lookX, eyeY, eyeR * 0.5, 0, Math.PI * 2);
      ctx.fill();
      // odlesk
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.beginPath();
      ctx.arc(ex + lookX - eyeR * 0.2, eyeY - eyeR * 0.25, eyeR * 0.18, 0, Math.PI * 2);
      ctx.fill();
    }
    // dravčí obočí
    if (carnivore && blink > 0.5) {
      ctx.strokeStyle = dark;
      ctx.lineWidth = 2.4 * u;
      ctx.lineCap = "round";
      const dir = ex < 0 ? 1 : -1;
      ctx.beginPath();
      ctx.moveTo(ex - eyeR, eyeY - eyeR * 1.2);
      ctx.lineTo(ex + dir * eyeR, eyeY - eyeR * 1.7);
      ctx.stroke();
    }
  }

  // --- tykadla u parazitů ---
  if (parasite) {
    ctx.strokeStyle = dark;
    ctx.lineWidth = 1.6 * u;
    ctx.lineCap = "round";
    for (const side of [-1, 1] as const) {
      const wig = Math.sin(t * 4 + side) * bodyR * 0.08;
      ctx.beginPath();
      ctx.moveTo(side * bodyR * 0.2, -bodyH * 0.7);
      ctx.quadraticCurveTo(
        side * bodyR * 0.5,
        -bodyH * 1.1,
        side * bodyR * 0.4 + wig,
        -bodyH * 1.35
      );
      ctx.stroke();
      ctx.fillStyle = light;
      ctx.beginPath();
      ctx.arc(side * bodyR * 0.4 + wig, -bodyH * 1.35, bodyR * 0.07, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
}
