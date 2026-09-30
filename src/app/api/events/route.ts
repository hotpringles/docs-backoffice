import { eventHandlers } from "@/lib/events/instance";

/** 일정 등록. 쓰기는 POST만 받는다. */
export async function POST(request: Request): Promise<Response> {
  return eventHandlers.create(request);
}
