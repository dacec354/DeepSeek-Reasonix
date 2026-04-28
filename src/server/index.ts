/**
 * Reasonix dashboard HTTP server.
 *
 * Native `node:http`, zero new dependencies — staying consistent with
 * the rest of the codebase ("Reasonix value: minimize transitive deps").
 *
 * Security model:
 *   - Bind 127.0.0.1 only. Never 0.0.0.0; `--host` flag and remote auth
 *     are explicitly out of scope until v0.15+ (see design doc).
 *   - Ephemeral 32-byte URL token, regenerated every server boot. Every
 *     request must carry it via either `?token=…` query or the
 *     `X-Reasonix-Token` header.
 *   - Mutations (POST / DELETE) additionally require the token to come
 *     in via the header (NOT the query string), preventing CSRF via a
 *     malicious page that auto-loads a `<img src="?token=…">` URL it
 *     scraped from the user's terminal screenshot. Reading via query is
 *     fine — it's required so the user can paste the dashboard URL into
 *     a browser without separate auth steps.
 *   - All mutations call `ctx.audit(...)` so a forgotten endpoint can't
 *     silently rewrite state without leaving a trail.
 *
 * Lifecycle:
 *   - `startDashboardServer(ctx, opts)` → returns `{ url, token, port,
 *     close }`. `close()` is idempotent + drains in-flight requests
 *     within 1s before force-killing the listener.
 *   - The caller (CLI command or `/dashboard` slash) is responsible for
 *     opening the browser, persisting the URL into the TUI scrollback,
 *     and tearing the server down on session exit.
 *
 * Routing:
 *   - `GET /`            → embedded `index.html` (token injected as
 *                          `<meta name="reasonix-token" content="…">`)
 *   - `GET /assets/*`    → embedded SPA assets (app.js, app.css)
 *   - `GET|POST|DELETE /api/*` → JSON endpoints, dispatched in `api/`
 *
 * Testing surface:
 *   - `dispatch(req, ctx)` is exported for unit tests so we can drive
 *     it without spinning a real listener. The listener wrapper is just
 *     a thin glue layer over it.
 */

import { randomBytes } from "node:crypto";
import { type IncomingMessage, type ServerResponse, createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { handleEvents } from "./api/events.js";
import { renderIndexHtml, serveAsset } from "./assets.js";
import type { DashboardContext } from "./context.js";
import { handleApi } from "./router.js";

export interface StartDashboardOptions {
  /** Force a specific port. 0 = ephemeral. Default: 0. */
  port?: number;
  /** Host to bind. Hard-pinned to 127.0.0.1 in v0.12 — argument exists for tests / future remote support. */
  host?: string;
  /**
   * Pre-generated token, mostly for tests. Production callers omit
   * this and let the server mint a fresh 32-byte random token on
   * every boot.
   */
  token?: string;
}

export interface DashboardServerHandle {
  url: string;
  token: string;
  port: number;
  /** Stop accepting new connections, drain, close. Idempotent. */
  close: () => Promise<void>;
}

/**
 * Mint a 32-byte random token, hex-encoded. 64 chars of entropy is
 * overkill for a localhost-only server, but the bandwidth cost is nil
 * and it lines up with the audit-log header reader's assumptions.
 */
function mintToken(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Constant-time string compare. `===` would short-circuit on the
 * first mismatched byte, leaking length / position info via timing
 * to an attacker holding a stopwatch on a localhost connection. Belt
 * and braces — even on 127.0.0.1.
 */
export function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

/**
 * Validate the bearer token on a request. Mutations require the
 * header form (CSRF defence); reads accept either header or query.
 *
 * Returns `null` on success, an error envelope on failure (caller
 * writes the response).
 */
export function checkAuth(
  req: IncomingMessage,
  expectedToken: string,
  isMutation: boolean,
): { status: number; body: string } | null {
  const url = new URL(req.url ?? "/", "http://localhost");
  const queryToken = url.searchParams.get("token") ?? "";
  const headerToken =
    typeof req.headers["x-reasonix-token"] === "string"
      ? (req.headers["x-reasonix-token"] as string)
      : "";

  if (isMutation) {
    // Header-only for mutations. Query-only requests would still
    // reject here even if the token matched.
    if (!headerToken || !constantTimeEquals(headerToken, expectedToken)) {
      return {
        status: 403,
        body: JSON.stringify({
          error:
            "mutation requires X-Reasonix-Token header (CSRF defence — query token alone is rejected for POST/DELETE).",
        }),
      };
    }
    return null;
  }

  // Reads accept either form. We compare both candidates against the
  // expected token in constant time and treat the OR as "any match
  // lets through."
  if (
    (queryToken && constantTimeEquals(queryToken, expectedToken)) ||
    (headerToken && constantTimeEquals(headerToken, expectedToken))
  ) {
    return null;
  }
  return {
    status: 401,
    body: JSON.stringify({ error: "missing or invalid token" }),
  };
}

/**
 * Read the request body as a UTF-8 string with a hard cap. Bigger
 * bodies abort with 413 — dashboard mutations are tiny JSON, no
 * legit reason to send 1 MB.
 */
const MAX_BODY_BYTES = 256 * 1024; // 256 KB; lets large skill bodies through but stops abuse

export async function readBody(req: IncomingMessage): Promise<string> {
  let total = 0;
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    req.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        reject(new Error(`body exceeds ${MAX_BODY_BYTES} bytes`));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

/**
 * Top-level request dispatch. Pure function over `(req, ctx, token)`,
 * exported so unit tests can drive without TCP.
 */
export async function dispatch(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: DashboardContext,
  expectedToken: string,
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const path = url.pathname;
  const method = (req.method ?? "GET").toUpperCase();
  const isMutation = method === "POST" || method === "DELETE" || method === "PUT";

  // SPA routes — token-gate the HTML so a stranger can't even see the
  // shell without the token. This also means the user MUST come in
  // through the token-bearing URL we print to the TUI.
  if (path === "/" || path === "/index.html") {
    const fail = checkAuth(req, expectedToken, false);
    if (fail) {
      res.writeHead(fail.status, { "content-type": "text/plain" });
      res.end("unauthorized — open the URL printed by /dashboard, including ?token=…");
      return;
    }
    const html = renderIndexHtml(expectedToken, ctx.mode);
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(html);
    return;
  }

  if (path.startsWith("/assets/")) {
    const fail = checkAuth(req, expectedToken, false);
    if (fail) {
      res.writeHead(fail.status);
      res.end();
      return;
    }
    const asset = serveAsset(path.slice("/assets/".length));
    if (!asset) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    res.writeHead(200, { "content-type": asset.contentType });
    res.end(asset.body);
    return;
  }

  // SSE event stream — special-cased BEFORE the normal `/api/*` branch
  // because it keeps the response open and writes its own frames; the
  // normal path would try to JSON-encode and end the response.
  if (path === "/api/events") {
    const fail = checkAuth(req, expectedToken, false);
    if (fail) {
      res.writeHead(fail.status, { "content-type": "application/json" });
      res.end(fail.body);
      return;
    }
    handleEvents(req, res, ctx);
    return;
  }

  if (path.startsWith("/api/")) {
    const fail = checkAuth(req, expectedToken, isMutation);
    if (fail) {
      res.writeHead(fail.status, { "content-type": "application/json" });
      res.end(fail.body);
      return;
    }
    let body = "";
    if (isMutation) {
      try {
        body = await readBody(req);
      } catch (err) {
        res.writeHead(413, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: (err as Error).message }));
        return;
      }
    }
    const result = await handleApi(path.slice("/api/".length), method, body, ctx);
    res.writeHead(result.status, { "content-type": "application/json" });
    res.end(JSON.stringify(result.body));
    return;
  }

  res.writeHead(404, { "content-type": "text/plain" });
  res.end("not found");
}

/**
 * Boot a server bound to 127.0.0.1, return an awaitable handle.
 */
export function startDashboardServer(
  ctx: DashboardContext,
  opts: StartDashboardOptions = {},
): Promise<DashboardServerHandle> {
  const token = opts.token ?? mintToken();
  const host = opts.host ?? "127.0.0.1";
  const port = opts.port ?? 0;

  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      dispatch(req, res, ctx, token).catch((err) => {
        if (!res.headersSent) {
          res.writeHead(500, { "content-type": "application/json" });
        }
        res.end(JSON.stringify({ error: (err as Error).message }));
      });
    });
    server.on("error", reject);
    server.listen(port, host, () => {
      const addr = server.address() as AddressInfo;
      const finalPort = addr.port;
      const url = `http://${host}:${finalPort}/?token=${token}`;

      let closed = false;
      const close = (): Promise<void> =>
        new Promise<void>((doneResolve) => {
          if (closed) return doneResolve();
          closed = true;
          server.close(() => doneResolve());
          // Force any keep-alive sockets to drop after a short grace.
          setTimeout(() => server.closeAllConnections?.(), 1000).unref();
        });

      resolve({ url, token, port: finalPort, close });
    });
  });
}
