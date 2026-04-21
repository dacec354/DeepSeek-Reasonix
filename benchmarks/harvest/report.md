# Reasonix harvest eval (Pillar 2)

**Date:** 2026-04-21T16:44:21.011Z
**Tasks:** 6 · repeats × 1 · modes: baseline, reasoner, reasoner-harvest
**Reasonix version:** 0.2.2

## Summary by mode

| mode | runs | pass rate | cache hit | cost / run | harvest turns | subgoals | uncertainties |
|---|---:|---:|---:|---:|---:|---:|---:|
| baseline | 6 | 100% | 39.5% | $0.001371 | 0.0 | 0.0 | 0.0 |
| reasoner | 6 | 100% | 74.2% | $0.004170 | 0.0 | 0.0 | 0.0 |
| reasoner-harvest | 6 | 83% | 61.6% | $0.003304 | 0.8 | 2.8 | 1.3 |

## Deltas

- **baseline → reasoner**
  - pass rate: 0pp
  - cost: ×3.04 (each run costs more)
  - harvest signal / run: 0.0 subgoals, 0.0 uncertainties

- **baseline → reasoner-harvest**
  - pass rate: -17pp
  - cost: ×2.41 (each run costs more)
  - harvest signal / run: 2.8 subgoals, 1.3 uncertainties

## Per-task breakdown

| task | mode | rep | verdict | cache | cost | sg | un | note |
|---|---|---:|:---:|---:|---:|---:|---:|---|
| mod7_list | baseline | 1 | ✅ | 86.5% | $0.001361 | 0 | 0 |  |
| mod7_list | reasoner | 1 | ✅ | 86.5% | $0.004797 | 0 | 0 |  |
| mod7_list | reasoner-harvest | 1 | ✅ | 86.5% | $0.003045 | 4 | 2 |  |
| flips_until_3heads | baseline | 1 | ✅ | 92.8% | $0.001198 | 0 | 0 |  |
| flips_until_3heads | reasoner | 1 | ✅ | 92.8% | $0.002830 | 0 | 0 |  |
| flips_until_3heads | reasoner-harvest | 1 | ✅ | 92.8% | $0.001691 | 4 | 0 |  |
| three_hats | baseline | 1 | ✅ | 57.7% | $0.001514 | 0 | 0 |  |
| three_hats | reasoner | 1 | ✅ | 57.7% | $0.009340 | 0 | 0 |  |
| three_hats | reasoner-harvest | 1 | ✅ | 57.7% | $0.009651 | 3 | 2 |  |
| pseudoprime_base2 | baseline | 1 | ✅ | 0.0% | $0.001894 | 0 | 0 |  |
| pseudoprime_base2 | reasoner | 1 | ✅ | 75.3% | $0.003128 | 0 | 0 |  |
| pseudoprime_base2 | reasoner-harvest | 1 | ❌ | 0.0% | $0.000000 | 0 | 0 | This operation was aborted |
| derangements_d7 | baseline | 1 | ✅ | 0.0% | $0.001273 | 0 | 0 |  |
| derangements_d7 | reasoner | 1 | ✅ | 71.9% | $0.003492 | 0 | 0 |  |
| derangements_d7 | reasoner-harvest | 1 | ✅ | 71.9% | $0.002843 | 3 | 2 |  |
| euler_quadratic_break | baseline | 1 | ✅ | 0.0% | $0.000985 | 0 | 0 |  |
| euler_quadratic_break | reasoner | 1 | ✅ | 61.0% | $0.001431 | 0 | 0 |  |
| euler_quadratic_break | reasoner-harvest | 1 | ✅ | 61.0% | $0.002594 | 3 | 2 |  |

## Scope

Unlike τ-bench-lite, these tasks are single-turn reasoning problems (no user simulator, no DB, no tool calls). Checkers are deterministic — regex + set / value compare, never an LLM judge. The point is to isolate whether the Pillar 2 harvest step adds measurable value above plain reasoner usage.

Interpretation: `baseline` (chat / V3) is a floor. `reasoner` shows the raw R1 gain. `reasoner-harvest` isolates the cost + quality delta from the extra V3 harvest call.
## Findings (v0.3, 18-run set)

Two bands of tasks tried (easy: mod7 / flips / hats; hard: pseudoprime341 / D_7 / Euler quadratic). The hard band was chosen for *known V3 failure modes*. Result:

1. **V3 chat passed all six tasks, including the three "hard" ones.** DeepSeek V3 knew 341 is the smallest base-2 pseudoprime, computed D_7=1854, and identified n=40 as the first Euler-polynomial failure. The tasks are well-known enough to be in training; the trap-answer variants (561, 265, 41) that the checkers specifically reject didn't fire.
2. **Reasoner cost 3.04× baseline for identical pass rates (6/6 both sides).** On this task set, R1 adds cost and latency without measurable quality. The cache-hit story *does* extend to reasoner (74.2% mean), so Pillar 1 generalizes to R1 — but that's not a Pillar 2 story.
3. **Harvest produced real signal** (mean 2.8 subgoals, 1.3 uncertainties per run where it fired) but didn't improve outcomes. One run hit the 300s timeout (bumped from 120s), suggesting reasoner-harvest latency is still unpredictable on some problems.

### What this tells us about Pillar 2 positioning

We've now given harvest two shots at showing answer-quality value on pure reasoning tasks. Both times V3 ate its lunch. This isn't a framework bug — it's a positioning signal:

- **On well-known math / logic / counting problems, DeepSeek V3 is strong enough that paying for R1 is not justified by accuracy.** Pillar 2's "smart preset" cost multiplier (10×) quoted in the README is real but for most single-question Q/A it buys nothing.
- **Harvest's plausible value surfaces are not "better math answers".** More likely: (a) transparency / auditability for developers, (b) planning support when tools are in the mix, (c) driving branch-sampling on cases where uncertainty correlates with wrongness. None of those are tested here.

### Recommendation

Don't ship v0.3 on the "harvest makes answers more correct" claim — the data doesn't support it. Two honest paths forward:

- **Reframe Pillar 2 as a developer-facing introspection feature** (debug visibility into R1's planning). Keep harvest opt-in; stop implying it improves accuracy on end-user tasks.
- **Move harvest eval to tool-use contexts** where uncertainty matters for *which tool to call next*, not *is this math right*. That's a new task shape — different harness, not a bigger task set here.

In either case, the next Reasonix release is better served by MCP client (Pillar 1 leverage across the ecosystem) than by a bigger harvest-bench data push.

### Notes

- Cache hit on baseline runs surprised me (39.5% mean). That's DeepSeek's *cross-session* prompt cache: the same system prompt ran many times across modes and runs warmed the server-side cache. Real cross-session evidence that Cache-First's value isn't only per-session.
- 5-subgoals cap still hit uniformly. `HarvestOptions.maxItems` default is 5; harvest is truncating. Moot unless we find a setting where that matters.
