/**
 * KeystrokeContext — React surface in front of the raw stdin reader.
 *
 * Replaces Ink's `useInput` chain. Reasonix's components no longer
 * import `useInput` from "ink"; they call `useKeystroke(handler,
 * isActive)` from this module. The provider mounted once at App
 * level owns a `StdinReader`, subscribes a single fan-out function
 * to it, and dispatches each parsed `KeyEvent` to every active
 * consumer.
 *
 * Why a Context instead of a singleton import: the provider can be
 * disabled in tests / replay mode without touching the components,
 * and the lifecycle (start/stop on mount/unmount) is tied to the
 * React tree rather than a global side effect.
 *
 * Why not just keep Ink's useInput: Ink's parse-keypress uses a
 * 100 ms intra-CSI timeout that's too short for Windows ConPTY,
 * leaking arrow-key bytes / paste markers into the buffer. Our
 * reader uses 250 ms and recognises the ESC-stripped variants too
 * — see `stdin-reader.ts`.
 */

// biome-ignore lint/style/useImportType: tsconfig jsx=react needs React as a runtime value
import React, { createContext, useContext, useEffect, useRef } from "react";
import { type KeyEvent, type StdinReader, getStdinReader } from "./stdin-reader.js";

interface KeystrokeBus {
  /** Subscribe — returns an unsubscribe function. */
  subscribe(handler: KeystrokeHandler): () => void;
}

export type KeystrokeHandler = (ev: KeyEvent) => void;

const KeystrokeContext = createContext<KeystrokeBus | null>(null);

export interface KeystrokeProviderProps {
  children: React.ReactNode;
  /**
   * Optional reader override. Tests inject a synthetic reader so
   * they can `feed()` chunks instead of touching real stdin. Production
   * callers leave this unset and get the singleton.
   */
  reader?: StdinReader;
}

export function KeystrokeProvider({
  children,
  reader: providedReader,
}: KeystrokeProviderProps): React.ReactElement {
  const handlersRef = useRef<Set<KeystrokeHandler>>(new Set());
  // Ref so the bus value's identity is stable across re-renders —
  // consumers don't accidentally re-subscribe every render.
  const busRef = useRef<KeystrokeBus | null>(null);
  if (busRef.current === null) {
    busRef.current = {
      subscribe(handler) {
        handlersRef.current.add(handler);
        return () => {
          handlersRef.current.delete(handler);
        };
      },
    };
  }

  useEffect(() => {
    const reader = providedReader ?? getStdinReader();
    reader.start();
    const unsubscribe = reader.subscribe((ev) => {
      // Snapshot the handler set so handlers added/removed during
      // dispatch don't perturb iteration. Cheap — typical N=1-3.
      for (const fn of [...handlersRef.current]) fn(ev);
    });
    return () => {
      unsubscribe();
      // Don't `stop()` the singleton on every unmount — multiple
      // mounts (test reruns, hot-reload) must not tear down stdin.
      // The singleton's own start() is idempotent; stop() is the
      // process-exit handler's job.
    };
  }, [providedReader]);

  return <KeystrokeContext.Provider value={busRef.current}>{children}</KeystrokeContext.Provider>;
}

/**
 * Subscribe to keystroke events. Mirrors Ink's `useInput` shape —
 * `handler(ev)` runs on every event while `isActive` is truthy
 * (default true). Set `isActive=false` to suspend the handler
 * (e.g. while a modal is up and shouldn't respond to global keys).
 *
 * Handler identity changes are tolerated — we re-subscribe via
 * useEffect on every render. Wrap your handler in `useCallback` if
 * you want to avoid that.
 */
export function useKeystroke(handler: KeystrokeHandler, isActive = true): void {
  const bus = useContext(KeystrokeContext);
  // Latest-handler ref so we can subscribe ONCE per active toggle
  // and still call the freshest closure on each event.
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!bus || !isActive) return undefined;
    return bus.subscribe((ev) => handlerRef.current(ev));
  }, [bus, isActive]);
}

/**
 * Lower-level hook for components that need a stable subscription
 * across the lifetime of the consumer (typically StdinReader-aware
 * unit tests).
 */
export function useKeystrokeBus(): KeystrokeBus | null {
  return useContext(KeystrokeContext);
}

/** Test helper — assemble a KeyEvent with sensible defaults. */
export function makeKeyEvent(overrides: Partial<KeyEvent> = {}): KeyEvent {
  return { input: "", ...overrides };
}
