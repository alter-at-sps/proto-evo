// Headless smoke test agentního ekosystému.
import { EcoGame } from "./engine/ecoGame";
import { defaultTraits } from "./engine/species";
import type { Traits } from "./engine/types";

const seed = process.argv[2] ?? "eco-42";
const game = new EcoGame(seed);

const herb: Traits = { ...defaultTraits(), diet: "herbivore" };
const carn: Traits = { size: 2, teeth: 4, limbs: 3, wings: 0, hide: 1, diet: "carnivore" };

game.introduce("Glemur", "#4caf7d", herb, 40);

let nan = false;
const samples: string[] = [];
for (let i = 0; i < 4000; i++) {
  game.tick(1);
  if (i === 600) game.introduce("Skarn", "#e74c3c", carn, 20); // přidej dravce později
  if (!Number.isFinite(game.eco.aliveCount())) nan = true;
  if (i % 400 === 0) {
    const c = game.eco.countBySpecies();
    samples.push(`h${c[0] ?? 0}/d${c[1] ?? 0}`);
  }
}

const counts = game.eco.countBySpecies();
console.log("=== Ekosystém smoke ===");
console.log("čas:", Math.floor(game.eco.time));
console.log("živých tvorů:", game.eco.aliveCount());
console.log("druhy:", game.eco.species.map((s) => `${s.name}=${counts[s.id]}`).join(", "));
console.log("narození / úmrtí:", game.eco.births, "/", game.eco.deaths);
console.log("vzorky populace (á 400 tiků):", samples.join(", "));
console.log("NaN:", nan);
if (nan) {
  console.error("CHYBA: NaN v ekosystému");
  process.exit(1);
}
console.log("OK");
