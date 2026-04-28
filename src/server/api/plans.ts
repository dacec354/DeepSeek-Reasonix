/**
 * `/api/plans` — archived plans across every saved session.
 *
 *   GET /api/plans  → flat list with session name + completion stats
 *
 * `listPlanArchives` is per-session; we walk every session in
 * `~/.reasonix/sessions/` and concatenate. v0.13 keeps the listing
 * read-only; replay drill-down + revisit-from-step come in v0.14
 * alongside Plan-Mode mutations.
 */

import { listPlanArchives } from "../../code/plan-store.js";
import { listSessions } from "../../session.js";
import type { PlanStep } from "../../tools/plan.js";
import type { DashboardContext } from "../context.js";
import type { ApiResult } from "../router.js";

interface PlanRow {
  session: string;
  path: string;
  completedAt: string;
  totalSteps: number;
  completedSteps: number;
  /** Computed completion ratio 0..1, surfaced so the SPA doesn't redo the math. */
  completionRatio: number;
  /** Plan summary (if the archive carried one). */
  summary?: string;
  /** Steps + completion ids — consumers render the step list inline. */
  steps: PlanStep[];
  completedStepIds: string[];
}

export async function handlePlans(
  method: string,
  _rest: string[],
  _body: string,
  _ctx: DashboardContext,
): Promise<ApiResult> {
  if (method !== "GET") {
    return { status: 405, body: { error: "GET only" } };
  }
  const out: PlanRow[] = [];
  for (const session of listSessions()) {
    const archives = listPlanArchives(session.name);
    for (const a of archives) {
      const total = a.steps.length;
      const done = a.completedStepIds.length;
      const row: PlanRow = {
        session: session.name,
        path: a.path,
        completedAt: a.completedAt,
        totalSteps: total,
        completedSteps: done,
        completionRatio: total > 0 ? done / total : 0,
        steps: a.steps,
        completedStepIds: a.completedStepIds,
      };
      if (a.summary) row.summary = a.summary;
      out.push(row);
    }
  }
  // Newest archive first across the whole pool.
  out.sort((a, b) => b.completedAt.localeCompare(a.completedAt));
  return { status: 200, body: { plans: out } };
}
