import { meetupHandlers } from "@/lib/meetups/instance";

/** 시간 확정. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  return meetupHandlers.confirm(request, (await params).id);
}
