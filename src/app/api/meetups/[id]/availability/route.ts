import { meetupHandlers } from "@/lib/meetups/instance";

/** 가능한 시간 저장. 편집 코드는 필요 없고 이름만 고른다. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  return meetupHandlers.availability(request, (await params).id);
}
