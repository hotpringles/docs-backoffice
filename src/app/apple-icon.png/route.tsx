import { iconResponse } from "@/lib/pwa/icon";

// iOS 홈 화면 아이콘은 180x180이다.
export function GET() {
  return iconResponse(180);
}
