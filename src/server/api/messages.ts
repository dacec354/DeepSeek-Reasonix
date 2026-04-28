/**
 * `/api/messages` — snapshot of the conversation in render order, used
 * by the web Chat tab for first-paint. Subsequent updates arrive via
 * the SSE stream at `/api/events`. Returns `[]` in standalone mode.
 */

import type { DashboardContext } from "../context.js";
import type { ApiResult } from "../router.js";

export async function handleMessages(
  method: string,
  _rest: string[],
  _body: string,
  ctx: DashboardContext,
): Promise<ApiResult> {
  if (method !== "GET") {
    return { status: 405, body: { error: "GET only" } };
  }
  const messages = ctx.getMessages ? ctx.getMessages() : [];
  return {
    status: 200,
    body: {
      messages,
      busy: ctx.isBusy ? ctx.isBusy() : false,
    },
  };
}
