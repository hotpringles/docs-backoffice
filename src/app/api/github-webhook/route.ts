import { revalidateTag } from "next/cache";
import { loadConfig, type AppConfig } from "@/lib/config";
import { TREE_TAG } from "@/lib/github/tags";
import { decideWebhook } from "@/lib/webhook/decide";
import { verifySignature } from "@/lib/webhook/verify";

function json(body: unknown, status: number): Response {
  return Response.json(body, { status });
}

export async function POST(request: Request): Promise<Response> {
  let config: AppConfig;
  try {
    config = loadConfig();
  } catch {
    return json({ error: "서버 설정이 올바르지 않아요." }, 500);
  }
  // 비밀키가 없으면 누구의 요청도 믿을 수 없으므로 처리하지 않는다.
  if (!config.webhookSecret) return json({ error: "webhook 비밀키가 설정되지 않았어요." }, 500);

  // 서명은 원본 본문 기준으로 계산되므로 파싱하기 전에 문자열로 받아 검증한다.
  const rawBody = await request.text();
  if (!verifySignature(rawBody, request.headers.get("x-hub-signature-256"), config.webhookSecret)) {
    return json({ error: "서명이 올바르지 않아요." }, 401);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json({ error: "본문이 JSON이 아니에요. webhook의 Content type을 application/json으로 설정하세요." }, 400);
  }

  const decision = decideWebhook(request.headers.get("x-github-event"), payload, config);
  switch (decision.kind) {
    case "pong":
      return json({ pong: true }, 200);
    case "ignore":
      return json({ ignored: decision.reason }, 202);
    case "push":
      // 외부 서비스가 부르는 경로라 updateTag는 쓸 수 없다. { expire: 0 }으로 즉시 만료시킨다.
      revalidateTag(TREE_TAG, { expire: 0 });
      return json({ revalidated: true, changedDocs: decision.changedDocs.length }, 200);
  }
}
