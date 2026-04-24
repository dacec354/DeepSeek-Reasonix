/**
 * Durable checkpoint for the pending-edits queue.
 *
 * Code mode holds parsed SEARCH/REPLACE blocks in an in-memory
 * `useRef<EditBlock[]>` until the user runs `/apply` or `/discard`.
 * Pre-0.5.14 that was ephemeral: a crash or accidental Ctrl+C after
 * the model proposed seven edits discarded all seven — the session
 * log had the assistant text, but the "please review this batch"
 * state was gone.
 *
 * This module checkpoints the queue to
 *   `~/.reasonix/sessions/<name>.pending.json`
 * after every mutation (parse → set / apply → clear / discard →
 * clear). On session resume the App reads the file and re-populates
 * the queue. If the file doesn't exist the session resumes as before.
 *
 * Format choices:
 *   - JSON (not JSONL) — the queue is a single array written at once,
 *     not a stream of records.
 *   - Overwrite-on-write — the queue is small (kilobytes) and atomicity
 *     is "last write wins"; partial-write on crash is fine since we'd
 *     rather lose the checkpoint than have a torn file block resume.
 *   - Best-effort I/O — disk full or permission denied must not break
 *     the session. Silent skip matches the rest of the durable logs
 *     (session.ts, usage.ts).
 *
 * Ephemeral sessions (sessionName === null) skip persistence entirely:
 * there's no stable name to key the checkpoint to.
 */

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { sanitizeName, sessionsDir } from "../session.js";
import type { EditBlock } from "./edit-blocks.js";

/** Absolute path for the checkpoint file that belongs to this session. */
export function pendingEditsPath(sessionName: string): string {
  return join(sessionsDir(), `${sanitizeName(sessionName)}.pending.json`);
}

/**
 * Write the queue to disk, or delete the checkpoint file when `blocks`
 * is empty. Callers pass the full current queue every time; we don't
 * attempt append-style deltas because the queue is tiny.
 *
 * No-op when `sessionName` is null (ephemeral session has nowhere to
 * write), so call sites can pass the session name directly without a
 * null guard.
 */
export function savePendingEdits(sessionName: string | null, blocks: EditBlock[]): void {
  if (!sessionName) return;
  const path = pendingEditsPath(sessionName);
  try {
    if (blocks.length === 0) {
      if (existsSync(path)) unlinkSync(path);
      return;
    }
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(blocks, null, 2), "utf8");
  } catch {
    /* best-effort — disk full / perms should not break the session */
  }
}

/**
 * Load the queue from disk, returns `null` when there's no checkpoint.
 * A malformed file (power-loss torn write, user hand-edit) also returns
 * null — silent recovery beats failing to open the session.
 */
export function loadPendingEdits(sessionName: string | null): EditBlock[] | null {
  if (!sessionName) return null;
  const path = pendingEditsPath(sessionName);
  if (!existsSync(path)) return null;
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const out: EditBlock[] = [];
    for (const item of parsed) {
      if (
        item &&
        typeof item === "object" &&
        typeof item.path === "string" &&
        typeof item.search === "string" &&
        typeof item.replace === "string" &&
        typeof item.offset === "number"
      ) {
        out.push(item as EditBlock);
      }
    }
    return out;
  } catch {
    return null;
  }
}

/** Delete the checkpoint file unconditionally — called by /apply and /discard. */
export function clearPendingEdits(sessionName: string | null): void {
  if (!sessionName) return;
  const path = pendingEditsPath(sessionName);
  try {
    if (existsSync(path)) unlinkSync(path);
  } catch {
    /* best-effort */
  }
}
