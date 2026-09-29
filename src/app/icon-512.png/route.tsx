import { iconResponse } from "@/lib/pwa/icon";

export function GET() {
  return iconResponse(512);
}
