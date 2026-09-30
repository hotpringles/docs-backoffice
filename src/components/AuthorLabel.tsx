import type { FileCreator } from "@/lib/github/client";

/** 문서를 처음 올린 사람 라벨. 계정 이름은 바뀌지 않아서 그것을 보여 주고, 커밋에 적힌 이름은 마우스를 올리면 보인다. */
export function AuthorLabel({ author }: { author: FileCreator }) {
  const who = author.login ? `@${author.login}` : author.name;
  const title = `처음 올린 사람: ${author.name}${author.login ? ` (@${author.login})` : ""}`;
  return (
    <span className="author-label" title={title}>
      <span className="author-role">작성자</span> {who}
    </span>
  );
}
