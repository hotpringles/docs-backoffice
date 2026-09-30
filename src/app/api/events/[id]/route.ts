import { eventHandlers } from "@/lib/events/instance";

/** 일정 수정. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  return eventHandlers.update(request, (await params).id);
}
