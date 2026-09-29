import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decideWebhook } from "./decide";
import { verifySignature } from "./verify";

const sign = (body: string, secret: string) =>
  `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

describe("verifySignature", () => {
  const body = '{"ref":"refs/heads/develop","메모":"한글"}';

  it("올바른 서명은 통과한다(한글 본문 포함)", () => {
    expect(verifySignature(body, sign(body, "s3cret"), "s3cret")).toBe(true);
  });

  it("본문이나 비밀키가 다르면 실패한다", () => {
    expect(verifySignature(`${body} `, sign(body, "s3cret"), "s3cret")).toBe(false);
    expect(verifySignature(body, sign(body, "other"), "s3cret")).toBe(false);
  });

  it("헤더가 없거나 형식이 틀리거나 길이가 다르면 실패한다", () => {
    expect(verifySignature(body, null, "s3cret")).toBe(false);
    expect(verifySignature(body, "", "s3cret")).toBe(false);
    expect(verifySignature(body, "sha1=abcdef", "s3cret")).toBe(false);
    expect(verifySignature(body, "sha256=zzzz", "s3cret")).toBe(false);
    expect(verifySignature(body, "sha256=abcd", "s3cret")).toBe(false);
  });

  it("비밀키가 비어 있으면 어떤 서명도 통과시키지 않는다", () => {
    expect(verifySignature(body, sign(body, ""), "")).toBe(false);
  });
});

describe("decideWebhook", () => {
  const cfg = { branch: "develop", docsPaths: ["frontend/docs/plan"] };
  const push = (extra: Record<string, unknown> = {}) => ({
    ref: "refs/heads/develop",
    after: "abc123",
    commits: [
      { added: ["frontend/docs/plan/a.md"], modified: ["frontend/src/x.ts"], removed: [] },
      { added: [], modified: ["frontend/docs/plan/a.md", "frontend/docs/plan/b.md"], removed: ["frontend/docs/plan/old.md"] },
    ],
    ...extra,
  });

  it("ping은 pong이다", () => {
    expect(decideWebhook("ping", {}, cfg)).toEqual({ kind: "pong" });
  });

  it("push 이외의 이벤트는 무시한다", () => {
    expect(decideWebhook("issues", push(), cfg).kind).toBe("ignore");
    expect(decideWebhook(null, push(), cfg).kind).toBe("ignore");
  });

  it("표시 브랜치의 push는 바뀐 문서(중복 없이, 폴더 안의 .md만)를 모아 돌려준다", () => {
    expect(decideWebhook("push", push(), cfg)).toEqual({
      kind: "push",
      commitSha: "abc123",
      changedDocs: ["frontend/docs/plan/a.md", "frontend/docs/plan/b.md", "frontend/docs/plan/old.md"],
    });
  });

  it("다른 브랜치의 push와 브랜치 삭제는 무시한다", () => {
    expect(decideWebhook("push", push({ ref: "refs/heads/feature/x" }), cfg).kind).toBe("ignore");
    expect(decideWebhook("push", push({ deleted: true }), cfg).kind).toBe("ignore");
    expect(decideWebhook("push", push({ ref: "refs/tags/v1" }), cfg).kind).toBe("ignore");
  });

  it("문서가 안 바뀐 push도 push로 판단하고 changedDocs만 비운다", () => {
    const decision = decideWebhook("push", push({ commits: [{ added: [], modified: ["frontend/src/x.ts"], removed: [] }] }), cfg);
    expect(decision).toEqual({ kind: "push", commitSha: "abc123", changedDocs: [] });
  });

  it("모양이 이상한 본문에도 죽지 않는다", () => {
    for (const payload of [null, undefined, "text", 42, [], {}]) {
      expect(decideWebhook("push", payload, cfg).kind).toBe("ignore");
    }
    const odd = decideWebhook(
      "push",
      { ref: "refs/heads/develop", after: 5, commits: [null, "x", { added: "nope", modified: [1, null, "frontend/docs/plan/z.md"] }] },
      cfg,
    );
    expect(odd).toEqual({ kind: "push", commitSha: null, changedDocs: ["frontend/docs/plan/z.md"] });
    expect(decideWebhook("push", { ref: "refs/heads/develop", commits: "nope" }, cfg)).toEqual({
      kind: "push",
      commitSha: null,
      changedDocs: [],
    });
  });

  it("문서 폴더 목록이 비어 있으면 모든 .md 변경을 문서로 본다", () => {
    const decision = decideWebhook(
      "push",
      { ref: "refs/heads/develop", commits: [{ modified: ["README.md", "a.ts"] }] },
      { branch: "develop", docsPaths: [] },
    );
    expect(decision).toMatchObject({ changedDocs: ["README.md"] });
  });
});
