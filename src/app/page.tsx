import { DocTree } from "@/components/DocTree";
import { RelativeTime } from "@/components/RelativeTime";
import { StaleBanner } from "@/components/StaleBanner";
import { loadConfig } from "@/lib/config";
import { getLatestCommitOrNull, getTree } from "@/lib/github";
import { buildTreeGroups } from "@/lib/github/tree";

export default async function HomePage() {
  const config = loadConfig();
  const [{ value: entries, stale }, commit] = await Promise.all([getTree(), getLatestCommitOrNull()]);
  const groups = buildTreeGroups(entries, config.docsPaths);

  return (
    <main className="page">
      <h1>문서</h1>
      {stale && <StaleBanner />}
      {commit && (
        <p className="meta">
          마지막 반영: <RelativeTime iso={commit.committedAt} /> · {config.branch}
        </p>
      )}
      {groups.length === 0 ? (
        <p className="empty">표시할 문서가 없어요.</p>
      ) : (
        groups.map((group) => (
          <section key={group.root} className="group">
            <h2>{group.label}</h2>
            <DocTree nodes={group.nodes} />
          </section>
        ))
      )}
    </main>
  );
}
