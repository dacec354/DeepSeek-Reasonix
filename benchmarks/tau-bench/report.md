# Reasonix tool-use eval (τ-bench-lite)

**Date:** 2026-04-21T12:31:25.027Z
**Agent model:** `deepseek-chat`
**User-simulator model:** `deepseek-chat`
**Tasks:** 8, repeats × 1
**Reasonix version:** 0.0.6

## Summary

| metric | baseline | reasonix | delta |
|---|---:|---:|---:|
| runs | 8 | 8 | — |
| pass rate | 100% | 88% | -13pp |
| cache hit | 43.9% | 94.3% | **+50.3pp** |
| mean cost / task | $0.002783 | $0.001621 | ×0.58 |
| mean turns | 4.6 | 4.6 | — |
| mean tool calls | 2.8 | 3.1 | — |

**Reasonix vs Claude Sonnet 4.6 (estimated, same token counts):**
Claude would cost ~$0.039776 / task, so Reasonix saves ~96.1%.
(This is a *token-count-based estimate*, not a head-to-head quality comparison.)

## Per-task breakdown

| task | mode | pass | turns | tools | cache | cost |
|---|---|:---:|---:|---:|---:|---:|
| t01_address_happy | baseline | ✅ | 3 | 2 | 44.4% | $0.001202 |
| t01_address_happy | reasonix | ✅ | 3 | 3 | 94.8% | $0.000875 |
| t02_address_not_allowed | baseline | ✅ | 8 | 5 | 43.7% | $0.006048 |
| t02_address_not_allowed | reasonix | ✅ | 8 | 3 | 95.9% | $0.002833 |
| t03_cancel_processing | baseline | ✅ | 2 | 2 | 54.1% | $0.000843 |
| t03_cancel_processing | reasonix | ✅ | 3 | 3 | 93.6% | $0.000832 |
| t04_refund_delivered | baseline | ✅ | 2 | 3 | 64.4% | $0.001114 |
| t04_refund_delivered | reasonix | ✅ | 3 | 3 | 94.2% | $0.000926 |
| t05_refund_not_delivered | baseline | ✅ | 8 | 2 | 22.2% | $0.004724 |
| t05_refund_not_delivered | reasonix | ❌ | 8 | 4 | 95.2% | $0.003329 |
| t06_multi_order_lookup | baseline | ✅ | 3 | 3 | 52.9% | $0.001692 |
| t06_multi_order_lookup | reasonix | ✅ | 4 | 3 | 92.4% | $0.001448 |
| t07_wrong_identity | baseline | ✅ | 8 | 2 | 14.9% | $0.005182 |
| t07_wrong_identity | reasonix | ✅ | 6 | 3 | 94.9% | $0.002008 |
| t08_address_then_cancel | baseline | ✅ | 3 | 3 | 54.9% | $0.001455 |
| t08_address_then_cancel | reasonix | ✅ | 2 | 3 | 93.3% | $0.000713 |

## Scope & caveats

This is **τ-bench-lite**, not a port of Sierra's upstream τ-bench. Specifically:

- Tasks are hand-authored in the retail domain; the schema mirrors τ-bench
  (stateful tools, LLM user-sim, DB-end-state success predicates), so upstream
  tasks can later be dropped in without harness changes.
- Every pass/fail judgment is a deterministic DB predicate — no LLM judge.
  Refusal tasks pass iff the DB is unchanged.
- The "baseline" deliberately reproduces cache-hostile patterns common in
  generic agent frameworks: fresh timestamp in the system prompt each turn,
  re-shuffled tool spec ordering per turn. It is **not** a benchmark of
  LangChain specifically.
- Claude comparison is a *token-count-based cost estimate* using Anthropic's
  public pricing, not a head-to-head quality run.
- User simulator is DeepSeek V3 at T=0.1. Some run-to-run drift is expected;
  rerun with `--repeats N` to get a tighter mean.

## Reproducing

1. `export DEEPSEEK_API_KEY=sk-...`
2. `npm install`
3. `npx tsx benchmarks/tau-bench/runner.ts --repeats 3`
4. `npx tsx benchmarks/tau-bench/report.ts benchmarks/tau-bench/results-*.json`
