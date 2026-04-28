/**
 * Embedded SPA assets. The dashboard ships as three text files —
 * index.html, app.js, app.css — bundled into the npm package via
 * `dist/dashboard/`. We import them as strings at build time so the
 * server can serve them with no filesystem lookup at runtime, even
 * when reasonix runs through `npx` from a cached tarball.
 *
 * The files themselves live at the repo root in `dashboard/` (not
 * `dist/dashboard/`) — `dist/` is generated. Actual bundling is
 * handled by tsup's loader hook in v0.13; for v0.12 the strings are
 * inlined here. Keeps the iteration loop tight while we figure out
 * what the SPA needs.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Resolve a sibling `dashboard/` directory regardless of whether we
 * run from src/ (tsx dev) or dist/cli/ (production tsup bundle).
 * Mirror of `tokenizer.ts`'s `resolveDataPath` — same problem, same
 * shape: dev resolves one level up, prod resolves two levels up.
 */
function resolveAssetDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // Try a few candidates; the first existing one wins.
  // - src/server/   → ../../dashboard
  // - dist/         → ./dashboard      (post-bundle, dashboard/ flat at dist root)
  // - dist/cli/     → ../dashboard
  const candidates = [
    join(here, "..", "..", "dashboard"),
    join(here, "..", "dashboard"),
    join(here, "dashboard"),
  ];
  for (const c of candidates) {
    try {
      readFileSync(join(c, "index.html"), "utf8");
      return c;
    } catch {
      /* try next */
    }
  }
  // Fall through to the most-likely-correct dev path; the read on first
  // request will throw with a useful path in the error message.
  return candidates[0]!;
}

const ASSET_DIR = resolveAssetDir();

let cachedIndex: string | null = null;
let cachedApp: string | null = null;
let cachedCss: string | null = null;
let cachedCm: string | null = null;

function loadIndexTemplate(): string {
  if (cachedIndex) return cachedIndex;
  cachedIndex = readFileSync(join(ASSET_DIR, "index.html"), "utf8");
  return cachedIndex;
}

function loadApp(): string {
  if (cachedApp) return cachedApp;
  cachedApp = readFileSync(join(ASSET_DIR, "app.js"), "utf8");
  return cachedApp;
}

function loadCss(): string {
  if (cachedCss) return cachedCss;
  cachedCss = readFileSync(join(ASSET_DIR, "app.css"), "utf8");
  return cachedCss;
}

function loadCm(): string {
  if (cachedCm) return cachedCm;
  cachedCm = readFileSync(join(ASSET_DIR, "codemirror.js"), "utf8");
  return cachedCm;
}

/**
 * Inject the per-boot token + bound mode into the HTML shell so the
 * SPA can read them on first paint without a separate /api round
 * trip. Token is HTML-attribute-escaped to be safe even if a future
 * mint ever produces non-hex bytes.
 */
export function renderIndexHtml(token: string, mode: "standalone" | "attached"): string {
  const tpl = loadIndexTemplate();
  const safeToken = token.replace(/[^a-zA-Z0-9]/g, "");
  // String.replace(string, replacement) only swaps the FIRST match. The
  // template has __REASONIX_TOKEN__ in three places (meta + css href +
  // script src) — without `replaceAll` only the meta tag gets the real
  // token, the asset URLs keep the placeholder and the browser hits a
  // 401 on every asset fetch. Same trap for __REASONIX_MODE__ if it
  // ever appears more than once.
  return tpl.replaceAll("__REASONIX_TOKEN__", safeToken).replaceAll("__REASONIX_MODE__", mode);
}

export function serveAsset(name: string): { body: string; contentType: string } | null {
  if (name === "app.js") {
    return { body: loadApp(), contentType: "application/javascript; charset=utf-8" };
  }
  if (name === "app.css") {
    return { body: loadCss(), contentType: "text/css; charset=utf-8" };
  }
  if (name === "codemirror.js") {
    return { body: loadCm(), contentType: "application/javascript; charset=utf-8" };
  }
  return null;
}
