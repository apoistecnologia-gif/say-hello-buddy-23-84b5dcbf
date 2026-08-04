import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const buckets = ["driver-selfies", "driver-cnh", "vehicle-documents"] as const;
const labels = ["selfie", "cnh", "cnh_back", "veiculo"] as const;
const imageTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const documentTypes = [...imageTypes, "application/pdf"];
const maxDocumentBytes = 8 * 1024 * 1024;

const documentSchema = z.object({
  bucket: z.enum(buckets),
  label: z.enum(labels),
  fileName: z.string().min(1).max(160),
  contentType: z.string().min(1),
  base64: z.string().min(1).max(Math.ceil((maxDocumentBytes * 4) / 3) + 16),
});

const signupSchema = z.object({
  name: z.string().trim().min(3).max(120),
  email: z.string().trim().email().max(255),
  phone: z.string().trim().min(10).max(20),
  password: z.string().min(8).max(72),
  cpf: z.string().trim().min(11).max(14),
  birth_date: z.string().optional().nullable(),
  city: z.string().trim().min(2).max(80),
  state: z.string().trim().length(2),
  category: z.enum(["carros", "motos", "fretes", "guincho", "envios"]),
  vehicle_model: z.string().trim().min(2).max(80),
  vehicle_plate: z.string().trim().min(6).max(10),
  vehicle_color: z.string().trim().min(2).max(40),
  vehicle_year: z.coerce.number().int().min(1971).max(new Date().getFullYear() + 1),
  documents: z.array(documentSchema).length(4),
});

function json(value: unknown, status = 200) {
  return Response.json(value, { status });
}

function extension(fileName: string) {
  return fileName.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
}

function decode(base64: string) {
  const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
  return bytes.buffer;
}

export const Route = createFileRoute("/api/public/driver-signup")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let input: z.infer<typeof signupSchema>;
        try {
          input = signupSchema.parse(await request.json());
        } catch (error) {
          return json({ ok: false, error: "Dados do cadastro inválidos.", detail: String(error) }, 400);
        }

        const email = input.email.toLowerCase();
        const created = await supabaseAdmin.auth.admin.createUser({
          email,
          password: input.password,
          email_confirm: true,
          user_metadata: { name: input.name, phone: input.phone, role: "driver" },
        });

        if (created.error || !created.data.user) {
          const duplicate = /already|registered|exists|duplicate/i.test(created.error?.message ?? "");
          return json(
            { ok: false, error: duplicate ? "Este e-mail já está cadastrado." : "Não foi possível criar a conta.", detail: created.error?.message },
            duplicate ? 409 : 500,
          );
        }

        const userId = created.data.user.id;
        const uploaded: Array<{ bucket: string; path: string }> = [];
        try {
          const paths: Record<string, string> = {};
          const bodies: Record<string, { body: ArrayBuffer; contentType: string; fileName: string }> = {};

          for (const document of input.documents) {
            const contentType = document.contentType.toLowerCase();
            const allowed = document.label === "selfie" ? imageTypes : documentTypes;
            if (!allowed.includes(contentType)) throw new Error(`Formato inválido em ${document.label}.`);

            const body = decode(document.base64);
            if (!body.byteLength || body.byteLength > maxDocumentBytes) {
              throw new Error(`Arquivo inválido ou muito grande em ${document.label}.`);
            }

            const path = `${userId}/${document.label}-${Date.now()}.${extension(document.fileName)}`;
            const upload = await supabaseAdmin.storage.from(document.bucket).upload(path, body, {
              upsert: true,
              contentType,
            });
            if (upload.error) throw new Error(`Falha no upload de ${document.label}: ${upload.error.message}`);
            uploaded.push({ bucket: document.bucket, path });
            paths[document.label] = path;
            bodies[document.label] = { body, contentType, fileName: document.fileName };
          }

          let photoPath: string | null = null;
          const selfie = bodies.selfie;
          if (selfie) {
            const path = `${userId}/avatar-${Date.now()}.${extension(selfie.fileName)}`;
            const upload = await supabaseAdmin.storage.from("profile-photos").upload(path, selfie.body, {
              upsert: true,
              contentType: selfie.contentType,
            });
            if (!upload.error) {
              photoPath = path;
              uploaded.push({ bucket: "profile-photos", path });
            }
          }

          const profile = await supabaseAdmin.from("users").upsert({
            auth_user_id: userId,
            name: input.name,
            email,
            phone: input.phone,
            avatar_url: photoPath,
          }, { onConflict: "auth_user_id" });
          if (profile.error) throw new Error(`Falha ao criar perfil: ${profile.error.message}`);

          const role = await supabaseAdmin.from("user_roles").upsert(
            { user_id: userId, role: "driver" },
            { onConflict: "user_id,role" },
          );
          if (role.error) throw new Error(`Falha ao definir perfil: ${role.error.message}`);

          const driver = await supabaseAdmin.from("drivers").insert({
            user_id: userId,
            name: input.name,
            email,
            phone: input.phone,
            cpf: input.cpf,
            birth_date: input.birth_date || null,
            city: input.city,
            state: input.state.toUpperCase(),
            category: input.category,
            vehicle_model: input.vehicle_model,
            vehicle_plate: input.vehicle_plate.toUpperCase(),
            vehicle_color: input.vehicle_color,
            vehicle_year: input.vehicle_year,
            selfie_url: paths.selfie,
            cnh_url: paths.cnh,
            cnh_back_url: paths.cnh_back,
            vehicle_document_url: paths.veiculo,
            photo_url: photoPath,
            approval_status: "em_analise",
            documents_status: "pending_review",
          });
          if (driver.error) throw new Error(`Falha ao criar motorista: ${driver.error.message}`);

          return json({
            ok: true,
            message: "Cadastro enviado para análise.",
            auth_user_id: userId,
            status: "em_analise",
          }, 201);
        } catch (error) {
          await Promise.allSettled([
            ...uploaded.map((file) => supabaseAdmin.storage.from(file.bucket).remove([file.path])),
            supabaseAdmin.from("drivers").delete().eq("user_id", userId),
            supabaseAdmin.from("user_roles").delete().eq("user_id", userId).eq("role", "driver"),
            supabaseAdmin.from("users").delete().eq("auth_user_id", userId),
            supabaseAdmin.auth.admin.deleteUser(userId),
          ]);
          console.error("[driver-signup] cadastro revertido", error);
          return json({ ok: false, error: error instanceof Error ? error.message : "Falha no cadastro." }, 500);
        }
      },
    },
  },
});
