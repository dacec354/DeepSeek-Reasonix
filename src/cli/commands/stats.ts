import { existsSync, readFileSync } from "node:fs";

export interface StatsOptions {
  transcript: string;
}

export function statsCommand(opts: StatsOptions): void {
  if (!existsSync(opts.transcript)) {
    console.error(`no such transcript: ${opts.transcript}`);
    process.exit(1);
  }
  const lines = readFileSync(opts.transcript, "utf8").split(/\r?\n/).filter(Boolean);
  let assistantTurns = 0;
  let toolCalls = 0;
  let lastTurn = 0;
  for (const line of lines) {
    try {
      const rec = JSON.parse(line);
      if (rec.role === "assistant_final") assistantTurns++;
      if (rec.role === "tool") toolCalls++;
      if (typeof rec.turn === "number") lastTurn = Math.max(lastTurn, rec.turn);
    } catch {
      /* skip */
    }
  }
  console.log(`transcript:       ${opts.transcript}`);
  console.log(`assistant turns:  ${assistantTurns}`);
  console.log(`tool invocations: ${toolCalls}`);
  console.log(`last turn index:  ${lastTurn}`);
}
