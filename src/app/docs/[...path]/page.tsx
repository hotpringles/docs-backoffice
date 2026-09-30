import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DrawingBlock } from "@/components/DrawingBlock";
import { MarkdownView } from "@/components/MarkdownView";
import { StaleBanner } from "@/components/StaleBanner";
import { Toc } from "@/components/Toc";
import { loadConfig } from "@/lib/config";
import { loadDocPage } from "@/lib/docs";
import { areaOfPath, docAreas } from "@/lib/github/areas";
import { pathFromSegments } from "@/lib/github/tree";
import { blobUrl } from "@/lib/transform/repo-urls";

type Props = { params: Promise<{ path: string[] }> };

// Next.js가 params를 이미 디코딩해서 넘겨주므로 다시 디코딩하지 않는다.
async function resolve(params: Props["params"]) {
  const path = pathFromSegments((await params).path);
  return path ? loadDocPage(path) : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = await resolve(params);
  return { title: page?.title ?? "문서를 찾을 수 없어요" };
}

export default async function DocPage({ params }: Props) {
  const page = await resolve(params);
  if (!page) notFound();

  const config = loadConfig();
  const repo = { ...config.repo, branch: config.branch };
  // 문서 종류(Frontend, Backend, AI)가 나뉘어 있으면 "문서 목록"은 이 문서가 속한 종류의 목록으로 돌아간다.
  const areas = docAreas(config.docsPaths);
  const area = areas.length >= 2 ? areaOfPath(areas, page.path) : undefined;
  const listHref = area ? `/?area=${area.key}` : "/";

  if (page.kind === "drawing") {
    return (
      <main className="page page-wide">
        <p className="crumb">
          <Link href={listHref}>← 문서 목록</Link>
        </p>
        <h1>{page.title}</h1>
        {page.stale && <StaleBanner />}
        <DrawingBlock path={page.path} result={page.result} sourceUrl={page.sourceUrl} />
        <p className="meta">
          <a href={page.sourceUrl} target="_blank" rel="noopener noreferrer">
            GitHub에서 보기
          </a>
        </p>
      </main>
    );
  }

  const { doc } = page;
  return (
    <main className="page doc-page">
      <div className="doc-layout">
        {/* 넓은 화면에서는 본문이 화면 정중앙에 오고, 목차와 "GitHub에서 보기"는 왼쪽에 붙어(sticky) 스크롤해도 따라온다. 좁은 화면에서는 본문 위에 놓인다. */}
        <aside className="doc-aside">
          <Toc headings={doc.toc} />
          <p className="meta doc-source">
            <a href={page.sourceUrl} target="_blank" rel="noopener noreferrer">
              GitHub에서 보기
            </a>
          </p>
        </aside>
        <div className="doc-main">
          <p className="crumb">
            <Link href={listHref}>← 문서 목록</Link>
          </p>
          {!doc.hasH1 && <h1>{page.title}</h1>}
          {(doc.frontmatter.date || doc.frontmatter.tags.length > 0) && (
            <p className="meta">
              {doc.frontmatter.date && <time dateTime={doc.frontmatter.date}>{doc.frontmatter.date}</time>}
              {doc.frontmatter.tags.map((tag) => (
                <span key={tag} className="tag">
                  #{tag}
                </span>
              ))}
            </p>
          )}
          {page.stale && <StaleBanner />}
          {doc.frontmatterError && (
            <p className="banner" role="status">
              문서 상단 정보(frontmatter)를 읽지 못해서 본문만 보여드려요.
            </p>
          )}
          <article className="markdown">
            <MarkdownView
              tree={doc.tree}
              drawings={page.drawings}
              sourceUrlFor={(path) => blobUrl(repo, path)}
            />
          </article>
        </div>
      </div>
    </main>
  );
}
