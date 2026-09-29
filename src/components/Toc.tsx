import type { Heading } from "@/lib/transform/markdown";

export function Toc({ headings }: { headings: Heading[] }) {
  if (headings.length === 0) return null;
  return (
    <nav className="toc" aria-label="목차">
      <strong>목차</strong>
      <ul>
        {headings.map((heading) => (
          <li key={heading.id} style={{ paddingLeft: `${(heading.depth - 2) * 0.9}rem` }}>
            <a href={`#${heading.id}`}>{heading.text}</a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
