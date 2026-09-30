import type { NextConfig } from "next";
import { serviceWorkerHeaders } from "./src/lib/pwa/headers";

const nextConfig: NextConfig = {
  // 로컬 미리보기용 메모리 DB(PGlite)는 자기 wasm 파일을 파일 경로로 찾는다. 번들에 넣으면 그 경로가 URL 객체로 바뀌어
  // 읽지 못하므로, 번들하지 않고 Node가 직접 불러오게 한다.
  serverExternalPackages: ["@electric-sql/pglite"],
  // 프로덕션에서는 메모리 DB를 쓰지 않는다(그 분기는 빌드에서 빠진다). 그런데 파일 추적기는 코드의 import를 그대로 따라가서
  // 배포되는 서버 함수마다 PGlite 파일(약 25MB)을 싣는다. 쓰지 않는 파일이라 추적에서 뺀다.
  outputFileTracingExcludes: {
    "/*": ["./node_modules/@electric-sql/pglite/**/*"],
    "/**": ["./node_modules/@electric-sql/pglite/**/*"],
  },
  async headers() {
    return serviceWorkerHeaders();
  },
};

export default nextConfig;
