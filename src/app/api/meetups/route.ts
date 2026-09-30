import { meetupHandlers } from "@/lib/meetups/instance";

/** 모임 만들기. 쓰기는 POST만 받는다. */
export async function POST(request: Request): Promise<Response> {
  return meetupHandlers.create(request);
}
