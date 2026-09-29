import { describe, expect, it } from "vitest";
import { splitFrontmatter } from "./frontmatter";

describe("splitFrontmatter", () => {
  it("제목, 태그, 날짜를 읽고 본문을 분리한다", () => {
    const { frontmatter, body, error } = splitFrontmatter(
      "---\ntitle: 계획서\ntags: [plan, '#m3']\ndate: 2026-09-28\n---\n# 본문\n",
    );
    expect(error).toBeUndefined();
    expect(frontmatter.title).toBe("계획서");
    expect(frontmatter.tags).toEqual(["plan", "m3"]);
    expect(frontmatter.date).toBe("2026-09-28");
    expect(body).toBe("# 본문\n");
  });

  it("frontmatter가 없으면 본문 전체를 돌려준다", () => {
    const { frontmatter, body } = splitFrontmatter("# 제목\n내용");
    expect(frontmatter).toEqual({ tags: [], data: {} });
    expect(body).toBe("# 제목\n내용");
  });

  it("태그가 문자열이면 쉼표나 공백으로 나눈다", () => {
    expect(splitFrontmatter("---\ntags: a, b c\n---\n").frontmatter.tags).toEqual(["a", "b", "c"]);
  });

  it("BOM이 있어도 frontmatter를 읽는다", () => {
    const { frontmatter } = splitFrontmatter("﻿---\ntitle: BOM\n---\nx");
    expect(frontmatter.title).toBe("BOM");
  });

  it("CRLF 줄바꿈도 읽는다", () => {
    const { frontmatter, body } = splitFrontmatter("---\r\ntitle: 윈도우\r\n---\r\n본문\r\n");
    expect(frontmatter.title).toBe("윈도우");
    expect(body.trim()).toBe("본문");
  });

  it("YAML이 깨져 있으면 오류를 알리고 본문은 원문 그대로 둔다", () => {
    const raw = "---\ntitle: [깨짐\n---\n본문";
    const { frontmatter, body, error } = splitFrontmatter(raw);
    expect(error).toBeTruthy();
    expect(frontmatter).toEqual({ tags: [], data: {} });
    expect(body).toBe(raw);
  });

  it("빈 문서도 문제없다", () => {
    const { frontmatter, body, error } = splitFrontmatter("");
    expect(error).toBeUndefined();
    expect(frontmatter.tags).toEqual([]);
    expect(body).toBe("");
  });

  it("같은 입력을 두 번 처리해도 결과를 공유하지 않는다", () => {
    const raw = "---\ntitle: A\n---\nx";
    const first = splitFrontmatter(raw);
    first.frontmatter.tags.push("mutated");
    expect(splitFrontmatter(raw).frontmatter.tags).toEqual([]);
  });
});
