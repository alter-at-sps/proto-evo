// Perlin noise (2D) + fraktální (fBm) varianta pro procedurální terén.
// Gradient permutace je odvozena ze seedu, takže každý seed = unikátní terén.

import { makeRng } from "./rng";

export class Perlin {
  private perm: Uint8Array;

  constructor(seed: number) {
    const rng = makeRng(seed);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    // Fisher–Yates shuffle se seedovaným RNG
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = p[i];
      p[i] = p[j];
      p[j] = tmp;
    }
    this.perm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }

  private static fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  private static lerp(a: number, b: number, t: number): number {
    return a + t * (b - a);
  }

  private static grad(hash: number, x: number, y: number): number {
    const h = hash & 7;
    const u = h < 4 ? x : y;
    const v = h < 4 ? y : x;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }

  /** Vrací hodnotu zhruba v rozsahu -1..1. */
  noise2(x: number, y: number): number {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const u = Perlin.fade(xf);
    const v = Perlin.fade(yf);
    const p = this.perm;
    const aa = p[p[X] + Y];
    const ab = p[p[X] + Y + 1];
    const ba = p[p[X + 1] + Y];
    const bb = p[p[X + 1] + Y + 1];
    const x1 = Perlin.lerp(
      Perlin.grad(aa, xf, yf),
      Perlin.grad(ba, xf - 1, yf),
      u
    );
    const x2 = Perlin.lerp(
      Perlin.grad(ab, xf, yf - 1),
      Perlin.grad(bb, xf - 1, yf - 1),
      u
    );
    return Perlin.lerp(x1, x2, v);
  }

  /** Fraktální Brownův pohyb — skládá více oktáv noise pro bohatší terén. Vrací 0..1. */
  fbm(x: number, y: number, octaves = 5, lacunarity = 2, gain = 0.5): number {
    let amp = 1;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amp * this.noise2(x * freq, y * freq);
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return (sum / norm) * 0.5 + 0.5;
  }
}
