/**
 * Task and result types for the tool-use eval harness.
 *
 * Scope note: this is NOT a full port of Sierra's τ-bench (airline+retail).
 * We mirror its *shape* — multi-turn tool-use with an LLM user simulator and
 * DB-end-state success predicates — so a later port can drop real tasks in
 * without changing the harness. Until then, see `tasks.ts` for our seed set.
 */

import type { ToolDefinition } from "../../src/index.js";

/**
 * The mutable world state a task's tools operate on. Tasks deep-clone this
 * into a per-run snapshot so runs don't leak state across each other.
 */
export interface WorldState {
  [table: string]: Record<string, Record<string, unknown>>;
}

export interface UserPersona {
  /** Who the user is roleplaying (e.g. "frustrated customer"). */
  style: string;
  /** The concrete goal. The user pursues this until it's met or clearly refused. */
  goal: string;
  /**
   * Facts the simulator may reveal when the agent asks. Keep tight — the
   * user shouldn't volunteer everything up front.
   */
  knowns: Record<string, string>;
}

/**
 * A tool factory. We take a factory (not a ToolDefinition directly) because
 * each run needs a fresh closure over its per-run WorldState — otherwise all
 * runs would share (and mutate) the same DB.
 */
export type ToolFactory = (db: WorldState) => ToolDefinition;

export interface TaskDefinition {
  id: string;
  /** One-line human description. Not shown to the model. */
  description: string;
  /** System prompt given to the agent. Kept small so cache-hit ratio is comparable. */
  systemPrompt: string;
  /** Tools built fresh per run against the run's DB snapshot. */
  tools: ToolFactory[];
  /** Initial DB snapshot. Deep-cloned per run. */
  initialDb: WorldState;
  /** Persona + goal for the LLM user simulator. */
  user: UserPersona;
  /** Max turns of (user → agent) before we give up and mark fail. */
  maxTurns?: number;
  /**
   * Success predicate. Given the end-state DB (and optionally the final
   * agent utterance), return true iff the task is considered solved.
   */
  check: (ctx: { db: WorldState; finalAgentMessage: string; transcript: Turn[] }) => boolean;
}

export interface Turn {
  role: "user" | "agent" | "tool";
  content: string;
  toolName?: string;
}

export type RunMode = "baseline" | "reasonix";

export interface RunResult {
  taskId: string;
  mode: RunMode;
  pass: boolean;
  turns: number;
  toolCalls: number;
  cacheHitRatio: number;
  costUsd: number;
  claudeEquivalentUsd: number;
  promptTokens: number;
  completionTokens: number;
  /** True if the run aborted before the user sim decided to stop. */
  truncated: boolean;
  finalAgentMessage: string;
  errorMessage?: string;
}

export interface BenchMeta {
  date: string;
  model: string;
  userSimModel: string;
  taskCount: number;
  repeatsPerTask: number;
  /** Reasonix version written into the report for reproducibility. */
  reasonixVersion: string;
}

export interface BenchReport {
  meta: BenchMeta;
  results: RunResult[];
}
