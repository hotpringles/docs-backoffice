// Neon 데이터베이스에 `db/migrations/*.sql`을 적용한다. 여러 번 실행해도 안전하다.
// 사용법: npm run db:migrate   (DATABASE_URL은 환경변수 또는 .env.local에서 읽는다)
import { applyMigrations, loadMigrations } from "../src/lib/db/migrate";
import { createNeonDb } from "../src/lib/db/neon";

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    console.error("DATABASE_URL이 설정되지 않았어요. .env.local에 넣거나 환경변수로 지정해 주세요.");
    process.exit(1);
  }

  const applied = await applyMigrations(createNeonDb(url), loadMigrations("db/migrations"));
  console.log(applied.length > 0 ? `적용한 마이그레이션: ${applied.join(", ")}` : "적용할 새 마이그레이션이 없어요.");
}

main().catch((error) => {
  console.error("마이그레이션에 실패했어요:", error instanceof Error ? error.message : error);
  process.exit(1);
});
