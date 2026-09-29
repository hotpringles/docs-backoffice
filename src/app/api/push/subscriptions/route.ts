import { getDbOrNull } from "@/lib/db";
import { createSubscriptionHandlers } from "@/lib/push/handlers";

const handlers = createSubscriptionHandlers({ getDb: () => getDbOrNull() });

export const POST = handlers.POST;
export const DELETE = handlers.DELETE;
