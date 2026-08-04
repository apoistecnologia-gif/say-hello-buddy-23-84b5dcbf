import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { title: "MOVVI Backend API" },
      { name: "description", content: "Backend TanStack Start privado do MOVVI." },
      { name: "robots", content: "noindex" },
    ],
  }),
  shellComponent: RootDocument,
});

function RootDocument() {
  return (
    <html lang="pt-BR">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          padding: 32,
          background: "#0b0b0b",
          color: "#eee",
        }}
      >
        <Outlet />
      </body>
    </html>
  );
}
