import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: () => (
    <main>
      <h1 style={{ color: "#e11d48" }}>MOVVI · Backend API</h1>
      <p>Este host serve apenas endpoints TanStack (createServerFn) e webhooks /api/public/*.</p>
      <p>Health check: <a style={{ color: "#f59e0b" }} href="/api/public/health">/api/public/health</a></p>
    </main>
  ),
});
