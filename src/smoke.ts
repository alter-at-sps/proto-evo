// Headless smoke test enginu — neslouží produkci, jen ověření simulace.
import { Game } from "./engine/game";
import { defaultTraits } from "./engine/species";

const seed = process.argv[2] ?? "smoke-seed-42";
const game = new Game(seed, defaultTraits(), "Testus");

let mutations = 0;
let seasons = 0;
let lastSeason = game.sim.season;
let maxPlayerPop = 0;
let nanSeen = false;

for (let i = 0; i < 1200; i++) {
  if (game.pendingMutations) {
    // auto-vyber náhodnou mutaci
    const opt = game.pendingMutations[Math.floor(Math.random() * game.pendingMutations.length)];
    game.chooseMutation(opt.id);
    mutations++;
    continue;
  }
  if (game.gameOver) break;
  game.tick();

  if (game.sim.season !== lastSeason) {
    seasons++;
    lastSeason = game.sim.season;
  }
  const pop = game.sim.totalPopulation(game.player);
  if (!Number.isFinite(pop)) nanSeen = true;
  maxPlayerPop = Math.max(maxPlayerPop, pop);
}

const alive = game.aliveSpecies();
console.log("=== EvoWorld smoke test ===");
console.log("tiků odběhnuto:", game.sim.tick);
console.log("rok / sezóna:", game.sim.year, game.sim.season);
console.log("přechodů sezón:", seasons);
console.log("mutací hráče:", mutations);
console.log("vrchol populace hráče:", maxPlayerPop);
console.log("hráč žije:", game.player.diedTick === null);
console.log("živých druhů:", alive.length, "/", game.sim.species.length);
console.log("uzlů ve stromě hráče:", game.playerTree().size());
console.log("klima posun:", game.sim.climateShift.toFixed(3));
console.log("NaN viděn:", nanSeen);
console.log(
  "druhy:",
  game.sim.species
    .map((s) => `${s.name}[${s.traits.diet}] pop=${game.sim.totalPopulation(s)}${s.diedTick ? "✝" : ""}`)
    .join(", ")
);
if (nanSeen) {
  console.error("CHYBA: simulace vyprodukovala NaN!");
  process.exit(1);
}
console.log("OK");
