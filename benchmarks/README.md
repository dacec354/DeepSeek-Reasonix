# Benchmarks

This is where validation lives. The v0.1 milestone gates on a τ-bench run
comparing:

1. **Baseline** — ReAct loop with DeepSeek V3, no Reasonix tricks.
2. **Reasonix Pillar 1** — same task, Cache-First Loop.
3. **Claude Sonnet 4.6 baseline** — same task, for cost/quality reference.

## Current state

`tau-bench/runner.ts` ships as a scaffold with placeholder tasks, so the
output format is stable from day one. Replace `SAMPLE_TASKS` with the real
τ-bench dataset in v0.1.

```bash
npx tsx benchmarks/tau-bench/runner.ts --n 20 --model deepseek-chat
```

Deliverables for v0.1:

- `tau-bench/tasks.ts` — real τ-bench task loader.
- `tau-bench/results-<date>.json` — per-task outcomes with stats.
- `tau-bench/report.md` — cache-hit ratio, cost, pass rate, Pareto plot.

See [../docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) for the validation sprint plan.
