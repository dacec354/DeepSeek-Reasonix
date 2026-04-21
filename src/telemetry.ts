import type { Usage } from "./client.js";

/** USD per 1M tokens. Update as DeepSeek pricing changes. */
export const DEEPSEEK_PRICING: Record<
  string,
  { inputCacheHit: number; inputCacheMiss: number; output: number }
> = {
  "deepseek-chat": { inputCacheHit: 0.07, inputCacheMiss: 0.27, output: 1.1 },
  "deepseek-reasoner": { inputCacheHit: 0.14, inputCacheMiss: 0.55, output: 2.19 },
};

/** Reference Claude Sonnet 4.6 pricing (USD per 1M tokens). */
export const CLAUDE_SONNET_PRICING = { input: 3.0, output: 15.0 };

export function costUsd(model: string, usage: Usage): number {
  const p = DEEPSEEK_PRICING[model];
  if (!p) return 0;
  return (
    (usage.promptCacheHitTokens * p.inputCacheHit +
      usage.promptCacheMissTokens * p.inputCacheMiss +
      usage.completionTokens * p.output) /
    1_000_000
  );
}

export function claudeEquivalentCost(usage: Usage): number {
  return (
    (usage.promptTokens * CLAUDE_SONNET_PRICING.input +
      usage.completionTokens * CLAUDE_SONNET_PRICING.output) /
    1_000_000
  );
}

export interface TurnStats {
  turn: number;
  model: string;
  usage: Usage;
  cost: number;
  cacheHitRatio: number;
}

export interface SessionSummary {
  turns: number;
  totalCostUsd: number;
  claudeEquivalentUsd: number;
  savingsVsClaudePct: number;
  cacheHitRatio: number;
}

export class SessionStats {
  readonly turns: TurnStats[] = [];

  record(turn: number, model: string, usage: Usage): TurnStats {
    const cost = costUsd(model, usage);
    const stats: TurnStats = {
      turn,
      model,
      usage,
      cost,
      cacheHitRatio: usage.cacheHitRatio,
    };
    this.turns.push(stats);
    return stats;
  }

  get totalCost(): number {
    return this.turns.reduce((sum, t) => sum + t.cost, 0);
  }

  get totalClaudeEquivalent(): number {
    return this.turns.reduce((sum, t) => sum + claudeEquivalentCost(t.usage), 0);
  }

  get savingsVsClaude(): number {
    const c = this.totalClaudeEquivalent;
    return c > 0 ? 1 - this.totalCost / c : 0;
  }

  get aggregateCacheHitRatio(): number {
    let hit = 0;
    let miss = 0;
    for (const t of this.turns) {
      hit += t.usage.promptCacheHitTokens;
      miss += t.usage.promptCacheMissTokens;
    }
    const denom = hit + miss;
    return denom > 0 ? hit / denom : 0;
  }

  summary(): SessionSummary {
    return {
      turns: this.turns.length,
      totalCostUsd: round(this.totalCost, 6),
      claudeEquivalentUsd: round(this.totalClaudeEquivalent, 6),
      savingsVsClaudePct: round(this.savingsVsClaude * 100, 2),
      cacheHitRatio: round(this.aggregateCacheHitRatio, 4),
    };
  }
}

function round(n: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}
