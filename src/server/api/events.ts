/**
 * `/api/events` — Server-Sent Events stream of live dashboard events.
 *
 * Keeps the response open. Server pushes one SSE frame per event the
 * web client cares about: streaming assistant deltas, tool calls,
 * final answers, busy-state changes. The client opens this once at
 * mount via `EventSource` and keeps it open for the session.
 *
 * Wire shape per frame:
 *   `data: <json>\n\n` — JSON is a `DashboardEvent` envelope.
 *
 * No event type / id headers — single channel keeps the client side
 * trivial (`onmessage` handler does it all).
 *
 * Lifecycle:
 *   - Subscribe via `ctx.subscribeEvents` on connect.
 *   - Write a `ping` event every 25s to keep proxies / browsers from
 *     dropping the connection on idle.
 *   - On client disconnect (`req.on("close")`) call the unsubscribe
 *     fn returned by subscribeEvents and clear the heartbeat timer.
 *   - On server close, the abort signal trips and we end the response.
 *
 * Auth is handled BEFORE this function is called (token check in the
 * main dispatcher); we just trust ctx + req here.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { DashboardContext, DashboardEvent } from "../context.js";

const PING_INTERVAL_MS = 25_000;

export function handleEvents(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: DashboardContext,
): void {
  if (!ctx.subscribeEvents) {
    res.writeHead(503, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "event stream requires an attached dashboard session." }));
    return;
  }

  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
    "x-accel-buffering": "no", // disable Nginx-style buffering if anything proxies us
  });

  const writeEvent = (event: DashboardEvent): void => {
    if (res.writableEnded) return;
    try {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    } catch {
      /* socket gone — connection close handler will tidy up */
    }
  };

  // Send a snapshot busy-change immediately so the client's button
  // state is correct on first paint (instead of inheriting whatever
  // the prior connection's last delta said).
  if (ctx.isBusy) writeEvent({ kind: "busy-change", busy: ctx.isBusy() });

  const unsubscribe = ctx.subscribeEvents(writeEvent);

  const ping = setInterval(() => writeEvent({ kind: "ping" }), PING_INTERVAL_MS);
  // Don't keep the process alive just for the heartbeat.
  ping.unref?.();

  const cleanup = (): void => {
    clearInterval(ping);
    try {
      unsubscribe();
    } catch {
      /* already torn down */
    }
    if (!res.writableEnded) {
      try {
        res.end();
      } catch {
        /* already closed */
      }
    }
  };

  req.on("close", cleanup);
  req.on("error", cleanup);
  res.on("close", cleanup);
}
