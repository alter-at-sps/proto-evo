// Feature 5 — Evoluční strom: historie mutací, větvení, milníky.

import { nextId } from "./species";
import type { EvoNode, Season, Traits } from "./types";

export class EvolutionTree {
  nodes: Map<string, EvoNode> = new Map();
  rootId: string;

  constructor(traits: Traits, tick: number, season: Season, year: number) {
    const root: EvoNode = {
      id: nextId("node"),
      parentId: null,
      childrenIds: [],
      tick,
      season,
      year,
      label: "Vznik druhu",
      traits: { ...traits },
      population: 0,
    };
    this.nodes.set(root.id, root);
    this.rootId = root.id;
  }

  /** Přidá nový uzel jako potomka — to je ono „větvení rozhodnutí o mutaci“. */
  addNode(
    parentId: string,
    traits: Traits,
    label: string,
    tick: number,
    season: Season,
    year: number,
    population: number,
    milestone?: string
  ): EvoNode {
    const node: EvoNode = {
      id: nextId("node"),
      parentId,
      childrenIds: [],
      tick,
      season,
      year,
      label,
      traits: { ...traits },
      population: Math.round(population),
      milestone,
    };
    this.nodes.set(node.id, node);
    const parent = this.nodes.get(parentId);
    if (parent) parent.childrenIds.push(node.id);
    return node;
  }

  get(id: string): EvoNode | undefined {
    return this.nodes.get(id);
  }

  size(): number {
    return this.nodes.size;
  }

  /** Vrátí cestu od kořene k danému uzlu (pro „replay“ / příběh). */
  pathTo(id: string): EvoNode[] {
    const path: EvoNode[] = [];
    let cur = this.nodes.get(id);
    while (cur) {
      path.unshift(cur);
      cur = cur.parentId ? this.nodes.get(cur.parentId) : undefined;
    }
    return path;
  }

  /** Hloubkové uspořádání pro vykreslení (preorder). */
  layout(): { node: EvoNode; depth: number; row: number }[] {
    const out: { node: EvoNode; depth: number; row: number }[] = [];
    let row = 0;
    const visit = (id: string, depth: number) => {
      const n = this.nodes.get(id);
      if (!n) return;
      out.push({ node: n, depth, row: row++ });
      for (const c of n.childrenIds) visit(c, depth + 1);
    };
    visit(this.rootId, 0);
    return out;
  }
}
