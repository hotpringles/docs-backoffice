import Link from "next/link";
import { DocTree } from "@/components/DocTree";
import { RelativeTime } from "@/components/RelativeTime";
import { StaleBanner } from "@/components/StaleBanner";
import { loadConfig } from "@/lib/config";
import { getLatestCommitOrNull, getTree } from "@/lib/github";
import { docAreas, pickArea } from "@/lib/github/areas";
import { buildTreeGroups, filterDocTree } from "@/lib/github/tree";

type SearchParams = Promise<{ area?: string | string[] }>;

export default async function HomePage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const config = loadConfig();
  const [{ value: entries, stale }, commit] = await Promise.all([getTree(), getLatestCommitOrNull()]);

  // Frontend, Backend, AI처럼 문서 종류가 둘 이상이면 고른 종류의 문서만 보여 준다.
  const areas = docAreas(config.docsPaths);
  const area = pickArea(areas, params.area);
  const groups = buildTreeGroups(entries, area ? area.roots : config.docsPaths);

  return (
    <main className="page">
      <h1>문서</h1>
      {areas.length >= 2 && (
        <nav className="tabs" aria-label="문서 종류">
          {areas.map((item) => (
            <Link key={item.key} href={`/?area=${item.key}`} aria-current={item.key === area?.key ? "page" : undefined}>
              {item.label} <span className="tab-count">{filterDocTree(entries, item.roots).length}</span>
            </Link>
          ))}
        </nav>
      )}
      {stale && <StaleBanner />}
      {commit && (
        <p className="meta">
          마지막 반영: <RelativeTime iso={commit.committedAt} /> · {config.branch}
        </p>
      )}
      {groups.length === 0 ? (
        <p className="empty">{area ? `${area.roots.join(", ")} 폴더에 아직 표시할 문서가 없어요.` : "표시할 문서가 없어요."}</p>
      ) : (
        groups.map((group) => (
          <section key={group.root} className="group">
            {/* 종류 탭에 폴더가 하나뿐이면 탭 이름이 곧 그 폴더라서 제목을 또 붙이지 않는다. */}
            {!(areas.length >= 2 && area && area.roots.length === 1) && <h2>{group.label}</h2>}
            <DocTree nodes={group.nodes} />
          </section>
        ))
      )}
    </main>
  );
}
