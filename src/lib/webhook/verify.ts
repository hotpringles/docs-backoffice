import { createHmac, timingSafeEqual } from "node:crypto";

/** GitHub의 `X-Hub-Signature-256`("sha256=<hex>") 값이 원본 본문과 비밀키로 계산한 값과 같은지 확인한다. */
export function verifySignature(rawBody: string, header: string | null, secret: string): boolean {
  if (!secret || !header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest();
  const received = Buffer.from(header.slice("sha256=".length), "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}
