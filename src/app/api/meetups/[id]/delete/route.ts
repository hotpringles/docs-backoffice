import { meetupHandlers } from "@/lib/meetups/instance";

/** 모임 지우기. 삭제도 GET이 아니라 POST로만 받는다. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  return meetupHandlers.remove(request, (await params).id);
}
