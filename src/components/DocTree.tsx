import type { TreeNode } from "@/lib/github/tree";

function Nodes({ nodes }: { nodes: TreeNode[] }) {
  return (
    <ul className="tree">
      {nodes.map((node) =>
        node.type === "folder" ? (
          <li key={node.path}>
            <details>
              <summary>{node.name}</summary>
              <Nodes nodes={node.children} />
            </details>
          </li>
        ) : (
          <li key={node.path}>
            <a href={node.url}>{node.kind === "drawing" ? `🎨 ${node.name}` : node.name}</a>
          </li>
        ),
      )}
    </ul>
  );
}

export function DocTree({ nodes }: { nodes: TreeNode[] }) {
  return <Nodes nodes={nodes} />;
}
