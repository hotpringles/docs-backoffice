import { eventHandlers } from "@/lib/events/instance";

/** 일정 삭제. 삭제도 GET이 아니라 POST로만 받는다. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  return eventHandlers.remove(request, (await params).id);
}
