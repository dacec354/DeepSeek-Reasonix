import type { ToolCall } from "../types.js";

/**
 * Call-storm breaker.
 *
 * Detects (tool, args) tuples repeating within a sliding window and suppresses
 * the offending call. Surfaces a synthetic tool_result advising the model to
 * change strategy on its next turn.
 */
export class StormBreaker {
  private readonly windowSize: number;
  private readonly threshold: number;
  private readonly recent: Array<readonly [string, string]> = [];

  constructor(windowSize = 6, threshold = 3) {
    this.windowSize = windowSize;
    this.threshold = threshold;
  }

  inspect(call: ToolCall): { suppress: boolean; reason?: string } {
    const sig = signature(call);
    if (!sig) return { suppress: false };
    const count = this.recent.reduce(
      (n, [name, args]) => (name === sig[0] && args === sig[1] ? n + 1 : n),
      0,
    );
    if (count >= this.threshold - 1) {
      return {
        suppress: true,
        reason: `call-storm suppressed: ${sig[0]} called with identical args ${count + 1} times within window=${this.windowSize}`,
      };
    }
    this.recent.push(sig);
    while (this.recent.length > this.windowSize) this.recent.shift();
    return { suppress: false };
  }

  reset(): void {
    this.recent.length = 0;
  }
}

function signature(call: ToolCall): readonly [string, string] | null {
  const name = call.function?.name;
  if (!name) return null;
  return [name, call.function?.arguments ?? ""] as const;
}
