/**
 * Self-consistency branching.
 *
 * When enabled, the loop fans out into N parallel samples per turn (varied
 * temperatures), runs Pillar 2 harvest on each, and selects the sample with
 * the fewest flagged uncertainties (ties broken by answer length — a crude
 * Occam prior).
 *
 * The unique opportunity here: because DeepSeek is ~20× cheaper than Claude,
 * running N=3–5 samples per turn is still cheaper than a single Claude call,
 * while the majority-confidence selection tends to dominate single-sample
 * answers on fuzzy multi-step reasoning tasks.
 */

import type { ChatResponse, DeepSeekClient } from "./client.js";
import { type HarvestOptions, type TypedPlanState, harvest } from "./harvest.js";
import type { ChatRequestOptions } from "./types.js";

export interface BranchSample {
  index: number;
  temperature: number;
  response: ChatResponse;
  planState: TypedPlanState;
}

export type BranchSelector = (samples: BranchSample[]) => BranchSample;

export interface BranchOptions {
  /** Number of parallel samples. 1 disables branching. Default 1. */
  budget?: number;
  /** Temperatures for each branch. Default spreads across [0, 1]. */
  temperatures?: readonly number[];
  /** Harvest options; the selector needs harvest to score samples. */
  harvestOptions?: HarvestOptions;
  /** Custom selector. Default: min uncertainties, tie-break shortest answer. */
  selector?: BranchSelector;
}

export interface BranchResult {
  chosen: BranchSample;
  samples: BranchSample[];
}

/** Default: fewest uncertainties wins, ties broken by shorter answer content. */
export const defaultSelector: BranchSelector = (samples) => {
  if (samples.length === 0) throw new Error("defaultSelector: samples is empty");
  return samples.slice().sort((a, b) => {
    const uDiff = a.planState.uncertainties.length - b.planState.uncertainties.length;
    if (uDiff !== 0) return uDiff;
    const aLen = a.response.content?.length ?? 0;
    const bLen = b.response.content?.length ?? 0;
    return aLen - bLen;
  })[0]!;
};

export async function runBranches(
  client: DeepSeekClient,
  request: ChatRequestOptions,
  opts: BranchOptions = {},
): Promise<BranchResult> {
  const budget = Math.max(1, opts.budget ?? 1);
  const temperatures = resolveTemperatures(budget, opts.temperatures);
  const selector = opts.selector ?? defaultSelector;

  const samples = await Promise.all(
    temperatures.map(async (temperature, index): Promise<BranchSample> => {
      const response = await client.chat({ ...request, temperature });
      const planState = await harvest(response.reasoningContent, client, opts.harvestOptions);
      return { index, temperature, response, planState };
    }),
  );

  return { chosen: selector(samples), samples };
}

function resolveTemperatures(budget: number, custom?: readonly number[]): number[] {
  if (custom && custom.length >= budget) return [...custom.slice(0, budget)];
  // Spread evenly across [0, 1] to encourage reasoning-path diversity.
  if (budget === 1) return [0];
  const out: number[] = [];
  for (let i = 0; i < budget; i++) {
    out.push(Number((i / (budget - 1)).toFixed(2)));
  }
  return out;
}
