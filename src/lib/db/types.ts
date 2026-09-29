/**
 * 앱이 데이터베이스에 바라는 최소한의 모양.
 * 운영에서는 Neon(HTTP)으로, 테스트에서는 메모리 Postgres(PGlite)로 채운다.
 * 파라미터는 `$1`, `$2`처럼 자리표시자로만 넘긴다(문자열을 이어 붙여 SQL을 만들지 않는다).
 */
export type Db = {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
};
