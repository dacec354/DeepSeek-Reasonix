import React, { type ReactNode, createContext, useContext, useEffect, useState } from "react";

/**
 * Two-tier global heartbeat. Both timers are owned by one provider so
 * we still pay for a single setInterval per cadence, but components
 * subscribe to whichever tier matches what they actually need to
 * repaint:
 *
 *   - FAST_TICK_MS (120ms) — spinners, glyph pulses, anything that
 *     visibly animates frame-by-frame.
 *   - SLOW_TICK_MS (1000ms) — elapsed-seconds counters, expiry
 *     countdowns, out-of-React mutation pollers (job registries, file
 *     stat refresh). These don't NEED 8Hz re-renders — they update
 *     once per visible-state change anyway, so subscribing them to
 *     the fast tick was 7 wasted re-renders per second per consumer.
 *
 * Splitting the contexts means a slow consumer (Elapsed timer) no
 * longer reconciles when only the fast tick increments — React's
 * context-propagation only fires for subscribers of the changed
 * context. The streaming row's spinner and elapsed counter used to
 * re-render together every 120ms; now the elapsed re-renders at 1Hz
 * while the spinner keeps its 8Hz cadence.
 */
export const FAST_TICK_MS = 120;
export const SLOW_TICK_MS = 1000;
/** @deprecated kept for callers that import the old name. */
export const TICK_MS = FAST_TICK_MS;

const FastTickContext = createContext(0);
const SlowTickContext = createContext(0);

export interface TickerProviderProps {
  children: ReactNode;
  /**
   * When true, the provider skips both setIntervals — ticks stay at 0,
   * all consumers render once and never re-render from the timer. Used
   * by PLAIN_UI mode so the cursor and any surviving spinners don't drive
   * repaints on fragile Windows terminals.
   */
  disabled?: boolean;
}

export function TickerProvider({ children, disabled }: TickerProviderProps) {
  const [fast, setFast] = useState(0);
  const [slow, setSlow] = useState(0);
  useEffect(() => {
    if (disabled) return;
    const fastId = setInterval(() => setFast((t) => t + 1), FAST_TICK_MS);
    const slowId = setInterval(() => setSlow((t) => t + 1), SLOW_TICK_MS);
    return () => {
      clearInterval(fastId);
      clearInterval(slowId);
    };
  }, [disabled]);
  return (
    <FastTickContext.Provider value={fast}>
      <SlowTickContext.Provider value={slow}>{children}</SlowTickContext.Provider>
    </FastTickContext.Provider>
  );
}

/**
 * Fast tick — re-renders the calling component every {@link FAST_TICK_MS}.
 * Use for spinner frames, glyph pulses, and anything else that
 * visibly animates. If your component just shows a counter that
 * updates once per second, prefer {@link useSlowTick}.
 */
export function useTick(): number {
  return useContext(FastTickContext);
}

/**
 * Slow tick — re-renders the calling component every {@link SLOW_TICK_MS}.
 * Use for elapsed-seconds counters, expiry countdowns, or pollers
 * that just need a "what's the time NOW?" trigger once per second.
 */
export function useSlowTick(): number {
  return useContext(SlowTickContext);
}

/**
 * Seconds elapsed since the calling component mounted. Subscribes to
 * the slow tick — re-renders at 1Hz, which is exactly what a
 * second-resolution counter needs. Earlier versions used the fast
 * tick and re-rendered 8x/sec just to display the same number.
 */
export function useElapsedSeconds(): number {
  const [start] = useState(() => Date.now());
  useSlowTick();
  return Math.floor((Date.now() - start) / 1000);
}
