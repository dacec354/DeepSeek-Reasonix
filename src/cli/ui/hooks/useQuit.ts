import type { WriteStream } from "node:fs";
import { type MutableRefObject, useCallback, useEffect } from "react";
import { getStdinReader } from "../stdin-reader.js";

/** Ctrl+C / SIGINT → restore terminal, flush transcript, then exit.
 *
 * We call `process.exit` directly rather than Ink's `exit()` because the
 * singleton stdin reader keeps a `data` listener attached — `exit()` would
 * unmount the React tree but leave the event loop alive and the terminal
 * would hang.
 *
 * Before exiting we stop the stdin reader (removes raw mode + data listener,
 * pauses the stream) and drain the OS terminal input buffer of any residual
 * DSR/DA responses that the terminal queued but we never consumed. */
export function useQuit(transcriptRef: MutableRefObject<WriteStream | null>): () => void {
  const quitProcess = useCallback(() => {
    // Write terminal restore sequences BEFORE stopping stdin — the
    // alternate screen and cursor restore must reach the terminal before
    // we sever the connection.
    process.stdout.write("\x1b[?25h\x1b[?1049l\x1b[0m\x1b[2J");

    // Stop the stdin reader — removes `data` listener, disables raw mode,
    // pauses the Node stream.
    getStdinReader().stop();

    transcriptRef.current?.end();
    process.exit(0);
  }, [transcriptRef]);

  useEffect(() => {
    process.on("SIGINT", quitProcess);
    return () => {
      process.off("SIGINT", quitProcess);
    };
  }, [quitProcess]);

  return quitProcess;
}
