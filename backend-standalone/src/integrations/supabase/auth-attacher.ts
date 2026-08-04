// Standalone backend: no browser session to attach; no-op middleware kept for parity.
import { createMiddleware } from "@tanstack/react-start";
export const attachSupabaseAuth = createMiddleware({ type: "function" }).client(async ({ next }) =>
  next({ headers: {} }),
);
