import { describe, expect, it } from "vitest";
import nextConfig from "../../../next.config";

describe("next.config — 로컬 미리보기용 메모리 DB", () => {
  it("PGlite는 번들하지 않고 Node가 직접 불러오게 한다(번들하면 wasm 파일 경로를 URL로 넘겨서 읽지 못한다)", () => {
    expect(nextConfig.serverExternalPackages).toContain("@electric-sql/pglite");
  });

  it("배포되는 서버 함수에 PGlite 파일(약 25MB)이 딸려 가지 않게 파일 추적에서 뺀다(프로덕션에서는 쓰지 않는다)", () => {
    const excluded = Object.values(nextConfig.outputFileTracingExcludes ?? {}).flat();
    expect(excluded).toContain("./node_modules/@electric-sql/pglite/**/*");
  });
});
