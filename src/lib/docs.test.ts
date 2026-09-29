import { beforeEach, describe, expect, it, vi } from "vitest";

// server-only는 서버 번들 밖에서 import하면 일부러 오류를 내므로 테스트에서는 비운다.
vi.mock("server-only", () => ({}));

const getTree = vi.fn();
const getBlobText = vi.fn();
vi.mock("@/lib/github", () => ({ getTree, getBlobText }));

const { loadDocPage } = await import("./docs");

const entries = [
  { path: "d/doc.md", sha: "sha-doc" },
  { path: "d/fig.excalidraw.md", sha: "sha-fig" },
];

beforeEach(() => {
  vi.stubEnv("GITHUB_REPO", "org/repo");
  vi.stubEnv("GITHUB_BRANCH", "develop");
  vi.stubEnv("DOCS_PATHS", "d");
  getTree.mockReset().mockResolvedValue({ value: entries, stale: false });
  getBlobText.mockReset();
});

describe("loadDocPage", () => {
  it("임베드한 그림의 blob을 못 받아도 그 그림 자리만 실패하고 문서는 그대로 나온다", async () => {
    getBlobText.mockImplementation(async (sha: string) => {
      if (sha === "sha-doc") return "# 제목\n\n![[fig.excalidraw]]\n\n본문";
      throw new Error("GitHub 503");
    });

    const page = await loadDocPage("d/doc.md");

    expect(page?.kind).toBe("markdown");
    if (page?.kind !== "markdown") return;
    expect(page.title).toBe("제목");
    expect(page.drawings["d/fig.excalidraw.md"]).toEqual({ ok: false, reason: "fetch-failed" });
  });

  it("그림 단독 화면은 그림이 본문이므로, blob을 못 받으면 오류로 던져 다시 시도 화면이 맡는다", async () => {
    getBlobText.mockRejectedValue(new Error("GitHub 503"));
    await expect(loadDocPage("d/fig.excalidraw.md")).rejects.toThrow("GitHub 503");
  });

  it("문서 본문 자체를 못 받으면 오류로 던진다(오류 화면과 다시 시도가 맡는다)", async () => {
    getBlobText.mockRejectedValue(new Error("GitHub 503"));
    await expect(loadDocPage("d/doc.md")).rejects.toThrow("GitHub 503");
  });

  it("트리에 없는 경로는 null이고 blob을 가져오지 않는다", async () => {
    expect(await loadDocPage("d/nope.md")).toBeNull();
    expect(getBlobText).not.toHaveBeenCalled();
  });
});
