import type { ToolCall } from "../types.js";

/**
 * Predicate the breaker consults to decide whether a call mutates state.
 * Mutating calls clear the recent-args buffer: re-reading a file after
 * `edit_file` shouldn't count as "saw the same args before" — the file
 * legitimately changed. Wire this from the caller using whatever source
 * of truth is appropriate (e.g. the ToolRegistry's `readOnly` /
 * `readOnlyCheck` flags). When undefined, every call is tracked the
 * old way — preserves the original behavior for callers that don't
 * thread a registry through.
 */
export type IsMutating = (call: ToolCall) => boolean;

interface RecentEntry {
  name: string;
  args: string;
  readOnly: boolean;
}

/**
 * Call-storm breaker.
 *
 * Detects (tool, args) tuples repeating within a sliding window and suppresses
 * the offending call. Surfaces a synthetic tool_result advising the model to
 * change strategy on its next turn.
 *
 * Buffer entries are tagged read-only vs mutating. When a mutating call
 * runs, the breaker drops prior read-only entries — a re-read of the
 * same path after `edit_file` is fresh, not a repeat. Mutating calls
 * still count among themselves, so a model looping on identical
 * `edit_file` invocations still trips on the threshold.
 *
 * Without an `isMutating` predicate everything is tracked the same way
 * (back-compat for callers that don't thread a registry through).
 */
export class StormBreaker {
  private readonly windowSize: number;
  private readonly threshold: number;
  private readonly isMutating: IsMutating | undefined;
  private readonly recent: RecentEntry[] = [];

  constructor(windowSize = 6, threshold = 3, isMutating?: IsMutating) {
    this.windowSize = windowSize;
    this.threshold = threshold;
    this.isMutating = isMutating;
  }

  inspect(call: ToolCall): { suppress: boolean; reason?: string } {
    const name = call.function?.name;
    if (!name) return { suppress: false };
    const args = call.function?.arguments ?? "";
    const mutating = this.isMutating ? this.isMutating(call) : false;
    const readOnly = !mutating;

    if (mutating) {
      // Drop prior read-only entries — the file/shell state just
      // changed, so a verify-read after this should start with a
      // clean slate. Keep mutator entries: 3 identical edits in a row
      // is still a storm (model in a loop).
      for (let i = this.recent.length - 1; i >= 0; i--) {
        if (this.recent[i]!.readOnly) this.recent.splice(i, 1);
      }
    }

    const count = this.recent.reduce((n, e) => (e.name === name && e.args === args ? n + 1 : n), 0);
    if (count >= this.threshold - 1) {
      return {
        suppress: true,
        reason: `call-storm suppressed: ${name} called with identical args ${count + 1} times within window=${this.windowSize}`,
      };
    }
    this.recent.push({ name, args, readOnly });
    while (this.recent.length > this.windowSize) this.recent.shift();
    return { suppress: false };
  }

  reset(): void {
    this.recent.length = 0;
  }
}
