import matter from "gray-matter";

export type Frontmatter = {
  title?: string;
  tags: string[];
  /** YYYY-MM-DD 또는 원문 문자열 */
  date?: string;
  data: Record<string, unknown>;
};

export type SplitResult = {
  frontmatter: Frontmatter;
  body: string;
  /** frontmatter 해석에 실패하면 이유가 들어간다. 이때 본문은 원문 그대로다. */
  error?: string;
};

function asTitle(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asTags(value: unknown): string[] {
  const items = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[,\s]+/)
      : [];
  const tags = items
    .filter((item): item is string | number => typeof item === "string" || typeof item === "number")
    .map((item) => String(item).trim().replace(/^#/, ""))
    .filter(Boolean);
  return [...new Set(tags)];
}

function asDate(value: unknown): string | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * gray-matter는 첫 줄이 `---js`나 `---javascript`이면 frontmatter를 eval로 실행한다.
 * 저장소의 문서는 믿을 수 없는 입력이라(머지된 PR 하나로 서버 환경변수와 비밀키를 읽을 수 있다)
 * 코드 실행 엔진을 끄고, YAML(과 JSON)만 읽는다. 끈 엔진은 예외를 던지고 아래 catch가 오류로 다룬다.
 */
const disabledEngine = {
  parse(): never {
    throw new Error("frontmatter는 YAML만 지원해요.");
  },
};

// 옵션 객체를 넘기면 gray-matter의 내부 캐시(같은 입력의 결과 객체 공유)도 쓰지 않는다.
const MATTER_OPTIONS = { engines: { js: disabledEngine, javascript: disabledEngine } };

export function splitFrontmatter(raw: string): SplitResult {
  const text = raw.replace(/^﻿/, "");
  try {
    const parsed = matter(text, MATTER_OPTIONS);
    const data = (parsed.data ?? {}) as Record<string, unknown>;
    return {
      frontmatter: {
        title: asTitle(data.title),
        tags: asTags(data.tags),
        date: asDate(data.date),
        data,
      },
      body: parsed.content,
    };
  } catch (error) {
    return {
      frontmatter: { tags: [], data: {} },
      body: text,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
