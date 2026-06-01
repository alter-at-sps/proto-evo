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

---

## Pohled autora: jak se mi na tom pracovalo a sedí 28 lidí?

> Tahle sekce je upřímná poznámka ode mě (Claude) — jak vnímám projekt a jestli
> dává smysl rozdělení práce z prezentace.

### Jak se cítím o tomhle projektu

Baví mě. EvoWorld je nápad, který je radost stavět: má **jasné téma**, okamžitě
srozumitelný cíl („přizpůsob se, nebo vymři") a hlavně **emergentní chování** —
napíšeš pár jednoduchých ekologických pravidel a ono z toho vznikne živý svět,
kde se populace honí za teplem, predátoři kolabují s kořistí a v zimě se druhy
stahují do tropů. To je ten typ projektu, který odměňuje, protože ho vidíš
*ožít* na obrazovce, ne jen projít testy.

Co je ale potřeba říct na rovinu: **to, co je v tomhle repu, je hratelné jádro
pro jednoho hráče** — řádově den soustředěné práce. Produkční cíl z prezentace
(reálný multiplayer, Postgres+Redis, WebGL, perzistentní svět běžící 24/7) je
**úplně jiná váhová kategorie** — měsíce práce a spousta nudné, ale nutné
infrastruktury, kterou na slajdech nikdo nevidí.

### Jde to prakticky udělat ve 28 lidech, aby každý měl práci?

**Krátká odpověď: ano, ale ne tím způsobem, jak to navrhuje slajd „Rozdělení
týmu" (6 featur × ~5 lidí).** To rozdělení přeceňuje, jak jsou ty featury
„nezávislé".

**Proč naivní dělení nefunguje:** všech 6 featur čte a zapisuje **stejný sdílený
stav** — mřížku světa, model genomu, simulační tik, render pipeline, schéma
perzistence, síťový protokol. Když do toho 28 lidí sahá najednou bez pevně
domluvených rozhraní, dopadne to dvěma způsoby: buď **merge peklo**, nebo lidi
**čekají na sebe** a nudí se. Tvrdá pravda je, že **jádro simulace je jeden
koncepční celek, který dobře uvládnou ~2–4 lidi** — nedá se na něj „posadit"
28 lidí. (Brooksův zákon: přidávání lidí na sdílené jádro ho zpomaluje.)

**Jak ale 28 lidí smysluplně zaměstnat:** musíš (1) **rozšířit záběr** z „6
herních featur" na skutečný produkt a (2) **nejdřív domluvit rozhraní**, teprve
pak paralelizovat. Pak to vychází zhruba takhle:

| Tým (pod) | Lidí | Co dělá |
|-----------|------|---------|
| **Core engine & platforma** | 3 | simulační tik, datový model, sdílená rozhraní, výkon, determinismus — vlastní kontrakty, na které ostatní stavějí |
| **Generace světa** | 3 | noise, biomy, řeky, klima + nástroj na prohlížení seedů |
| **Editor druhu & art** | 3 | genom, UX editoru, vizuální pipeline tvorů |
| **Ekologie & balanc** | 3 | pravidla predace/kompetice/parazitismu, ladění obtížnosti, designérské nástroje |
| **Dynamický svět** | 2 | sezóny, počasí, katastrofy, klimatická změna, plánovač událostí |
| **Evoluční strom & meta** | 3 | strom, Hall of Fame, žebříčky, replay |
| **Rendering / WebGL** | 3 | přechod Canvas→WebGL, shadery, sezónní vizuály, výkon |
| **Backend & realtime** | 4 | Node + WebSockets synchronizace, auth, schéma Postgresu, live stav v Redisu, DevOps/CI |
| **Frontend shell & UX** | 2 | app shell, HUD, navigace, přístupnost, i18n |
| **QA, nástroje, release** | 2 | testy, CI/CD, telemetrie, triáž chyb |
| **Tech lead + produkt/design** | 2 | architektura, kontrakty, design doc, drží to pohromadě |
| **Celkem** | **~30** | → 28 míst se reálně naplní |

**Co je u toho potřeba pohlídat (rizika):**

- **Sekvence, ne všechno najednou.** Sprint 0 = core tým postaví datový model
  a rozhraní; teprve pak ostatní pody paralelizují. Jinak má někdo „hotovou
  featuru", ale není ji kam zapojit.
- **Koordinace roste kvadraticky.** 28 lidí = nutný design doc, jasné API
  kontrakty a pravidelná integrační kadence, jinak se utopíš ve schůzkách.
- **Některé týdny budou některé pody blokované.** Počítej s rotací/párováním,
  ať nikdo nezahálí.
- **Malé jádro, široký okraj.** Sdílený engine drží malý tým; 28 lidí
  zaměstnáš na *okrajích* produktu (netcode, art, nástroje, QA, infra, design),
  ne na jednom simulačním souboru.

**Verdikt:** 28 lidí *může* mít smysluplnou práci — ale jen když se na to
přestaneš dívat jako na „6 nezávislých featur" a začneš to brát jako **produkt
s platformou uprostřed a pody okolo**. Jako čistý plán „6 × 5 lidí" je tým
předimenzovaný a několik lidí by skončilo buď bez práce, nebo by si lezli do
zelí. S tím správným rozdělením (malé vlastnické jádro + rozšířený záběr +
kontrakty předem) to ale reálně udělatelné je.
