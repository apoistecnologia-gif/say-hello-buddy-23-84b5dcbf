import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/health")({
  server: {
    handlers: {
      GET: async () => {
        let supabaseAdminOk = false;
        let supabaseAdminError: string | null = null;

        try {
          const { supabaseAdmin } = await import(
            "@/integrations/supabase/client.server"
          );

          const result = await supabaseAdmin.auth.admin.listUsers({
            page: 1,
            perPage: 1,
          });

          if (result.error) {
            supabaseAdminError = result.error.message;
          } else {
            supabaseAdminOk = true;
          }
        } catch (error) {
          supabaseAdminError =
            error instanceof Error ? error.message : String(error);
        }

        return Response.json({
          ok: true,
          service: "movvi-backend",
          ts: new Date().toISOString(),
          env: {
            supabaseUrl: !!process.env.SUPABASE_URL,
            serviceRole: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
            publishable: !!process.env.SUPABASE_PUBLISHABLE_KEY,
          },
          supabaseAdmin: {
            ok: supabaseAdminOk,
            error: supabaseAdminError,
          },
        });
      },
    },
  },
});