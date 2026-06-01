## Pohled autora: jak se nám na tom pracovalo.

prakticky asi nejlepší z 3 uvedených projektů, dá se rozdělit do hodně odvětví a dává největší smysl. 

hra se hraje docela dost rychle, neni to moc zabavna, chtělo by to přidat fun factor, jinak to je jen sitting simulator, kde se kliká na pár tlačítek pro evoluci, ale jinak nic moc.

hraje se to jako spore, chtělo by to update graphics, jinak mapa vypadá až moc dobře, staty jsou nepřehledné a těžce manévrovatelné.

z technické stranky je prototyp funkční, ale stalé chybý velké množství systémů, které by mohli způsobit problémy. Hlavní problém je, že prototyp je napsán jako kompletně stateless client-side applikace, žádné ukládání nebo real-time multiplayer není možný s touto archtekturou a musel by se celí přepsat pro client-server arch.

z tohoto důvodu také nejsou větší technické problémy zřejmé, nynější stav prototypu je moc jednoduchý, aby se projevily.

Šimon Volk, David Souček.


---

# EvoWorld 🌍

**Procedurálně generovaný ekosystém, kde ovládáš živočišný druh.**
Navrhni tělo, přežij sezóny, počasí, katastrofy a konkurenci — a zapiš se do Síně slávy.

Implementace hry podle prezentace *EvoWorld* (skupinový projekt). Běží celá
v prohlížeči jako jeden spustitelný balík.

## Spuštění

```bash
npm install
npm run dev
```

Otevře se na `http://localhost:5173/`.

Produkční build: `npm run build` → `npm run preview`.

## Ovládání

- **Mezerník** — pauza / běh
- **klávesy 1–5** — rychlost (pauza, 1×, 2×, 4×, 8×)
- Mezi sezónami vybíráš mutaci v dialogu (hra se pozastaví).

## Všech 6 featur z prezentace

| # | Feature | Kde v kódu |
|---|---------|-----------|
| 1 | **Procedurální mapa** — Perlin noise, biomy, řeky, klimatické zóny, unikátní seed | [`engine/world.ts`](src/engine/world.ts), [`engine/noise.ts`](src/engine/noise.ts) |
| 2 | **Editor druhu** — Spore styl, atributy, bodový systém, mutace, vizuální rendering | [`engine/species.ts`](src/engine/species.ts), [`engine/mutations.ts`](src/engine/mutations.ts), [`ui/SpeciesEditor.tsx`](src/ui/SpeciesEditor.tsx) |
| 3 | **Dynamický svět** — sezóny, počasí, katastrofy (sopka/meteor/požár/epidemie), klimatická změna | [`engine/simulation.ts`](src/engine/simulation.ts) |
| 4 | **Interakce druhů** — predace, kompetice, symbióza, parazitismus, vymírání | [`engine/simulation.ts`](src/engine/simulation.ts) (`ecologyStep`) |
| 5 | **Evoluční strom & progrese** — větvení mutací, sezónní milníky, Hall of Fame, žebříček | [`engine/evolutionTree.ts`](src/engine/evolutionTree.ts), [`ui/EvolutionTreeView.tsx`](src/ui/EvolutionTreeView.tsx), [`ui/HallOfFame.tsx`](src/ui/HallOfFame.tsx) |
| 6 | **Chování & pohyb** — migrace, hibernace, teritorium, reakce na katastrofy | [`engine/simulation.ts`](src/engine/simulation.ts) (`migrate`, hibernace) |

## Jak se hraje

1. Zvol **seed** (každý = jiný svět) a navrhni tělo druhu v rámci **bodového rozpočtu**
   — nelze mít vše najednou, musíš se specializovat. (Archetypy + náhodný druh pro rychlý start.)
2. Spusť svět. Běží v reálném čase: střídají se **sezóny**, mění se **počasí**,
   přicházejí **katastrofy** a svět se pomalu **otepluje**.
3. **Mezi sezónami** vybíráš mutaci, kterou tvůj druh přijme — každé rozhodnutí
   vytvoří novou **větev** evolučního stromu.
4. Soupeříš s **divokými druhy** o potravu a území (predace, kompetice, parazitismus,
   symbióza).
5. Když tvůj druh vymře, zapíše se i se svým stromem do **Síně slávy** a žebříčku
   (nejdelší přežití, největší území, nejunikátnější druh).

## Architektura

```
src/
  engine/      čistý simulační engine (bez Reactu, deterministický dle seedu)
    rng.ts            seedovaný RNG (mulberry32)
    noise.ts          Perlin / fBm noise
    world.ts          generace světa (F1)
    species.ts        model druhu, odvozené statistiky, bodový systém (F2)
    mutations.ts      generování mutací (F2/F5)
    evolutionTree.ts  evoluční strom (F5)
    simulation.ts     sezóny, katastrofy, ekologie, migrace (F3/F4/F6)
    game.ts           orchestrace + perzistence Hall of Fame
  render/      vykreslování na Canvas (mapa, populace, tvor)
  ui/          React vrstva (HUD, editor, mutace, strom, síň slávy)
```

### Poznámka k technologiím

Prezentace počítá s produkčním stackem **React + Node.js + WebSockets +
PostgreSQL + Redis** pro 28 vývojářů. Tato verze je **jednouživatelská a běží
kompletně v prohlížeči**:

- **Frontend** odpovídá: React + Canvas/WebGL-style rendering.
- **Engine** je oddělený od UI a deterministický (seed) — lze ho beze změny
  přesunout na **Node.js + WebSockets** server pro multiplayer.
- **Perzistence** (Hall of Fame) je v `localStorage` místo PostgreSQL/Redis;
  rozhraní v `game.ts` (`loadHall`/`saveHall`) je izolované, takže výměna za
  serverové API je přímočará.

### Dev test enginu

```bash
npx esbuild src/smoke.ts --bundle --platform=node --format=esm --outfile=smoke.mjs && node smoke.mjs <seed>
```

Odsimuluje 1200 tiků headless a vypíše statistiky (kontrola stability, NaN, vymírání).
