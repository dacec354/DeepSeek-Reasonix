/**
 * Pillar 2 — R1 Thought Harvesting.
 *
 * v0.0.1 stub. Real implementation lands in v0.2 as a constrained V3 call
 * against a strict JSON schema. The shape below is the public contract that
 * downstream code may already depend on.
 */

export interface TypedPlanState {
  subgoals: string[];
  hypotheses: string[];
  uncertainties: string[];
  rejectedPaths: string[];
}

export function emptyPlanState(): TypedPlanState {
  return { subgoals: [], hypotheses: [], uncertainties: [], rejectedPaths: [] };
}

export function isPlanStateEmpty(s: TypedPlanState): boolean {
  return (
    s.subgoals.length === 0 &&
    s.hypotheses.length === 0 &&
    s.uncertainties.length === 0 &&
    s.rejectedPaths.length === 0
  );
}

/** v0.0.1 stub — returns empty state. */
export async function harvest(_reasoningContent: string | null): Promise<TypedPlanState> {
  return emptyPlanState();
}
