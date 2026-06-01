// Feature 2/5 — Mutace mezi sezónami. Hráč vybírá, kterou mutaci přijme.

import { pick, type RNG } from "./rng";
import { DIET_LABELS, DIETS, POINT_BUDGET, pointsUsed, TRAIT_MAX } from "./species";
import type { Diet, MutationOption, Traits } from "./types";

function clampTrait(v: number): number {
  return Math.max(0, Math.min(TRAIT_MAX, v));
}

interface MutTemplate {
  key: keyof Omit<Traits, "diet">;
  label: string;
  delta: number;
  desc: string;
}

const POSITIVE: MutTemplate[] = [
  { key: "size", label: "Mohutnější tělo", delta: 1, desc: "+síla, +odolnost, ale vyšší metabolismus" },
  { key: "teeth", label: "Ostřejší zuby", delta: 1, desc: "+útok a efektivita lovu" },
  { key: "limbs", label: "Silnější končetiny", delta: 1, desc: "+rychlost a pohyblivost" },
  { key: "wings", label: "Vyvinout křídla", delta: 1, desc: "+migrace a únik před predátory" },
  { key: "hide", label: "Tlustší kůže", delta: 1, desc: "+odolnost a izolace proti chladu" },
];

const NEGATIVE: MutTemplate[] = [
  { key: "size", label: "Zakrnění", delta: -1, desc: "-velikost, ušetří energii" },
  { key: "teeth", label: "Ztráta zubů", delta: -1, desc: "-útok, nižší metabolismus" },
  { key: "wings", label: "Zakrnělá křídla", delta: -1, desc: "-migrace, ušetří energii" },
  { key: "hide", label: "Tenčí kůže", delta: -1, desc: "-odolnost, lepší v horku" },
];

/** Vygeneruje 3 mutační volby, které respektují bodový rozpočet. */
export function generateMutations(rng: RNG, traits: Traits): MutationOption[] {
  const options: MutationOption[] = [];
  const used = new Set<string>();

  // Vždy nabídni možnost „beze změny“ jako stabilizaci.
  options.push({
    id: "stay",
    label: "Žádná mutace",
    description: "Genom zůstává stabilní pro tuto sezónu.",
    apply: (t) => ({ ...t }),
  });

  let guard = 0;
  while (options.length < 4 && guard++ < 40) {
    const useDietMut = rng() < 0.18;
    if (useDietMut) {
      const newDiet = pick(rng, DIETS.filter((d) => d !== traits.diet) as Diet[]);
      const key = `diet-${newDiet}`;
      if (used.has(key)) continue;
      const candidate: Traits = { ...traits, diet: newDiet };
      if (pointsUsed(candidate) > POINT_BUDGET) continue;
      used.add(key);
      options.push({
        id: key,
        label: `Změna stravy → ${DIET_LABELS[newDiet]}`,
        description: "Adaptace na jiný zdroj potravy.",
        apply: (t) => ({ ...t, diet: newDiet }),
      });
      continue;
    }

    const positive = rng() < 0.72;
    const tmpl = pick(rng, positive ? POSITIVE : NEGATIVE);
    const newVal = clampTrait(traits[tmpl.key] + tmpl.delta);
    if (newVal === traits[tmpl.key]) continue; // už na hranici
    const candidate: Traits = { ...traits, [tmpl.key]: newVal };
    if (pointsUsed(candidate) > POINT_BUDGET) continue;
    const key = `${tmpl.key}-${tmpl.delta}`;
    if (used.has(key)) continue;
    used.add(key);
    options.push({
      id: key,
      label: tmpl.label,
      description: tmpl.desc,
      apply: (t) => ({ ...t, [tmpl.key]: clampTrait(t[tmpl.key] + tmpl.delta) }),
    });
  }

  return options;
}

export function describeTraitChange(before: Traits, after: Traits): string {
  const parts: string[] = [];
  const keys: (keyof Omit<Traits, "diet">)[] = ["size", "teeth", "limbs", "wings", "hide"];
  const labels: Record<string, string> = {
    size: "velikost",
    teeth: "zuby",
    limbs: "končetiny",
    wings: "křídla",
    hide: "kůže",
  };
  for (const k of keys) {
    if (after[k] !== before[k]) {
      const sign = after[k] > before[k] ? "+" : "";
      parts.push(`${labels[k]} ${sign}${after[k] - before[k]}`);
    }
  }
  if (after.diet !== before.diet) parts.push(`strava → ${DIET_LABELS[after.diet]}`);
  return parts.length ? parts.join(", ") : "beze změny";
}
