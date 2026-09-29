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

export function splitFrontmatter(raw: string): SplitResult {
  const text = raw.replace(/^﻿/, "");
  try {
    // 옵션 객체를 넘기면 gray-matter의 내부 캐시를 쓰지 않는다.
    const parsed = matter(text, {});
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
