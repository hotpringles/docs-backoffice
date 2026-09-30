import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // 테스트 파일 대부분이 진짜 Postgres(PGlite, WASM)를 새로 띄운다. 파일을 여러 개 동시에 돌리면 기계가 바쁠 때
    // 기본 제한(테스트 5초, 훅 10초)에 걸려서 무작위로 실패하므로 넉넉하게 둔다. 속도를 재는 테스트가 아니다.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
