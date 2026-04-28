/**
 * `/api/abort` — POST that fires `loop.abort()`, web equivalent of
 * pressing Esc in the TUI during a busy turn. No-op on idle. Returns
 * 202 always (the actual abort is fire-and-forget; SSE will broadcast
 * the resulting events).
 */

import type { DashboardContext } from "../context.js";
import type { ApiResult } from "../router.js";

export async function handleAbort(
  method: string,
  _rest: string[],
  _body: string,
  ctx: DashboardContext,
): Promise<ApiResult> {
  if (method !== "POST") {
    return { status: 405, body: { error: "POST only" } };
  }
  if (!ctx.abortTurn) {
    return {
      status: 503,
      body: { error: "abort requires an attached dashboard session." },
    };
  }
  ctx.abortTurn();
  ctx.audit?.({ ts: Date.now(), action: "abort-turn" });
  return { status: 202, body: { aborted: true } };
}
