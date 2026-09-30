/** JSON 응답. */
export function json(body: unknown, status = 200, headers?: HeadersInit): Response {
  return Response.json(body, { status, headers });
}

const MAX_BODY_LENGTH = 20_000;

/**
 * 쓰기 요청의 본문을 읽는다. Content-Type이 정확히 application/json이어야 한다
 * (다른 사이트의 폼이 몰래 보내는 요청은 이 헤더를 붙일 수 없어서 여기서 걸러진다). 본문은 20KB까지.
 */
export async function readJsonBody(
  request: Request,
): Promise<{ ok: true; body: unknown } | { ok: false; response: Response }> {
  const type = request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (type !== "application/json") {
    return { ok: false, response: json({ error: "Content-Type은 application/json이어야 해요." }, 415) };
  }
  const text = await request.text();
  if (text.length > MAX_BODY_LENGTH) {
    return { ok: false, response: json({ error: "요청이 너무 커요." }, 413) };
  }
  try {
    return { ok: true, body: JSON.parse(text) };
  } catch {
    return { ok: false, response: json({ error: "본문이 올바른 JSON이 아니에요." }, 400) };
  }
}
