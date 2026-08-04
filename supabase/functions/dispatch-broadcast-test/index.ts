// Placeholder handler. The real content of this function is the Deno test
// file co-located in this folder (dispatch_broadcast_test.ts), executed via
// the Supabase edge-function test runner.
Deno.serve(
  () =>
    new Response(
      JSON.stringify({
        ok: true,
        hint: "Run via supabase--test_edge_functions",
      }),
      { headers: { "content-type": "application/json" } },
    ),
);
