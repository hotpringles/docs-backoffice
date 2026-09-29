import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig, parseDocsPaths } from "./config";

describe("parseDocsPaths", () => {
  it("쉼표로 나누고 공백과 앞뒤 슬래시를 정리한다", () => {
    expect(parseDocsPaths(" frontend/docs/plan/ , /ai/docs ")).toEqual([
      "frontend/docs/plan",
      "ai/docs",
    ]);
  });

  it("비었거나 undefined면 빈 목록(저장소 전체)이다", () => {
    expect(parseDocsPaths(undefined)).toEqual([]);
    expect(parseDocsPaths("")).toEqual([]);
    expect(parseDocsPaths(" , ,")).toEqual([]);
  });

  it("중복을 제거하고 역슬래시를 슬래시로 바꾼다", () => {
    expect(parseDocsPaths("a\\b,a/b")).toEqual(["a/b"]);
  });

  it('".." 또는 "."가 든 항목은 거부한다', () => {
    expect(() => parseDocsPaths("a/../b")).toThrow(ConfigError);
    expect(() => parseDocsPaths("./a")).toThrow(ConfigError);
  });
});

describe("loadConfig", () => {
  it("환경변수에서 설정을 읽고 브랜치 기본값은 develop이다", () => {
    const config = loadConfig({
      GITHUB_REPO: "kakaotechcampus-4/ktc4-kyungpook-3",
      DOCS_PATHS: "frontend/docs/plan",
      GITHUB_TOKEN: " tok ",
    });
    expect(config).toEqual({
      repo: { owner: "kakaotechcampus-4", name: "ktc4-kyungpook-3" },
      branch: "develop",
      docsPaths: ["frontend/docs/plan"],
      githubToken: "tok",
      webhookSecret: undefined,
    });
  });

  it("GITHUB_REPO가 없거나 형식이 틀리면 ConfigError", () => {
    expect(() => loadConfig({})).toThrow(ConfigError);
    expect(() => loadConfig({ GITHUB_REPO: "just-a-name" })).toThrow(ConfigError);
    expect(() => loadConfig({ GITHUB_REPO: "a/b/c" })).toThrow(ConfigError);
  });
});
