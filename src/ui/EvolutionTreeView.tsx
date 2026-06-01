import type { EvolutionTree } from "../engine/evolutionTree";
import { SEASON_LABELS } from "../engine/simulation";

export function EvolutionTreeView({ tree }: { tree: EvolutionTree }) {
  const layout = tree.layout();
  return (
    <div className="card evtree">
      <h3>Evoluční strom</h3>
      <div className="muted" style={{ marginBottom: 10 }}>
        {tree.size()} uzlů · každé rozhodnutí o mutaci tvoří větev. Zlaté uzly =
        sezónní milníky (katastrofy).
      </div>
      {layout.map(({ node, depth }) => (
        <div
          key={node.id}
          className={"evnode" + (node.milestone ? " milestone" : "")}
        >
          <span className="branch">
            {depth > 0 ? "  ".repeat(depth) + "└ " : ""}
          </span>
          <span className="dotc" />
          <span>
            <strong>{node.label}</strong>
            <span className="muted">
              {" "}
              · {SEASON_LABELS[node.season]} r{node.year} · pop {node.population}
              {node.milestone ? ` · ⚑ ${node.milestone}` : ""}
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}
