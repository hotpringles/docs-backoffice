import { meetupHandlers } from "@/lib/meetups/instance";

/** 열린 모임 수정. 바꾸는 요청도 GET이 아니라 POST로만 받는다. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  return meetupHandlers.update(request, (await params).id);
}
