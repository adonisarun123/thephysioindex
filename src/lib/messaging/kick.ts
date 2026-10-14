import { after } from "next/server";
import { runDispatch } from "./dispatch";

/**
 * Dispatch right after the response is sent (MSG-01: target 95 % within 60 s).
 * Call it from code that writes an outbox event the user is waiting on; it runs
 * after the request's transaction has committed. Outside a request (scripts,
 * tests) it does nothing; the scheduled tick picks the work up instead.
 * One run per instance at a time; a kick during a run triggers one more pass.
 */
let running = false;
let again = false;

export function kickDispatch(): void {
  try {
    after(drain);
  } catch {
    // Not in a request scope.
  }
}

async function drain(): Promise<void> {
  if (running) {
    again = true;
    return;
  }
  running = true;
  try {
    do {
      again = false;
      await runDispatch({ budgetMs: 25_000 });
    } while (again);
  } catch (err) {
    console.error("[notify] inline dispatch failed:", err instanceof Error ? err.message : err);
  } finally {
    running = false;
  }
}
