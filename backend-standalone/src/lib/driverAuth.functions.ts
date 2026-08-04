import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const DRIVER_TABLE = "drivers" as const;
const DRIVER_AUTH_LINK_FIELD = "user_id" as const;

const Categories = ["carros", "motos", "fretes", "guincho", "envios"] as const;
const Buckets = ["driver-selfies", "driver-cnh", "vehicle-documents"] as const;

const IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"] as const;
const DOC_TYPES = [...IMAGE_TYPES, "application/pdf"] as const;
const MAX_DOC_BYTES = 8 * 1024 * 1024; // 8 MB por documento (após decodificar)
const MAX_BASE64_CHARS = Math.ceil((MAX_DOC_BYTES * 4) / 3) + 16; // limite grosseiro antes de decodificar

const DriverDocumentSchema = z.object({
  bucket: z.enum(Buckets),
  label: z.enum(["selfie", "cnh", "cnh_back", "veiculo"]),
  fileName: z.string().min(1).max(160),
  contentType: z.string().min(1),
  base64: z.string().min(1).max(MAX_BASE64_CHARS, {
    message: "Arquivo muito grande. Envie até 8 MB.",
  }),
});

const DriverSignupSchema = z.object({
  name: z.string().trim().min(3).max(120),
  email: z.string().trim().email().max(255),
  phone: z.string().trim().min(10).max(20),
  password: z.string().min(8, { message: "Use uma senha com no mínimo 8 caracteres." }).max(72),
  cpf: z.string().trim().min(11).max(14),
  birth_date: z.string().optional().nullable(),
  city: z.string().trim().min(2).max(80),
  state: z.string().trim().length(2),
  category: z.enum(Categories),
  vehicle_model: z.string().trim().min(2).max(80),
  vehicle_plate: z.string().trim().min(6).max(10),
  vehicle_color: z.string().trim().min(2).max(40),
  vehicle_year: z.coerce
    .number({ invalid_type_error: "Informe um ano válido." })
    .int({ message: "Informe um ano válido." })
    .superRefine((val, ctx) => {
      if (val < 1971) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "O veículo é muito antigo." });
      }
      const maxYear = Math.max(new Date().getFullYear() + 1, 2026);
      if (val > maxYear) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "O ano informado é maior que o permitido.",
        });
      }
    }),
  documents: z.tuple([
    DriverDocumentSchema.extend({
      bucket: z.literal("driver-selfies"),
      label: z.literal("selfie"),
    }),
    DriverDocumentSchema.extend({ bucket: z.literal("driver-cnh"), label: z.literal("cnh") }),
    DriverDocumentSchema.extend({ bucket: z.literal("driver-cnh"), label: z.literal("cnh_back") }),
    DriverDocumentSchema.extend({
      bucket: z.literal("vehicle-documents"),
      label: z.literal("veiculo"),
    }),
  ]),
});

const DriverDiagnosticSchema = z.object({
  email: z.string().trim().email(),
});

type DriverDiagnosticResult = {
  auth_exists: boolean;
  driver_exists: boolean;
  auth_user_id: string | null;
  status: string | null;
  table: string;
  auth_link_field: string;
  related_profile_exists: boolean;
  related_profile_table: string;
  error: string | null;
};

function emptyDiagnostic(error: string | null = null): DriverDiagnosticResult {
  return {
    auth_exists: false,
    driver_exists: false,
    auth_user_id: null,
    status: null,
    table: DRIVER_TABLE,
    auth_link_field: DRIVER_AUTH_LINK_FIELD,
    related_profile_exists: false,
    related_profile_table: "users",
    error,
  };
}

function isDuplicateAuthError(message: string) {
  return /already|registered|exists|duplicate/i.test(message);
}

function authErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (isDuplicateAuthError(message)) return "Este e-mail já está cadastrado.";
  if (/password/i.test(message)) return "Senha inválida. Use no mínimo 8 caracteres.";
  if (/email/i.test(message)) return "E-mail inválido.";
  return "Não foi possível criar a conta de autenticação.";
}

function cleanExt(fileName: string) {
  return (
    fileName
      .split(".")
      .pop()
      ?.toLowerCase()
      .replace(/[^a-z0-9]/g, "") || "bin"
  );
}

function decodeBase64(base64: string) {
  const binary = globalThis.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

async function removeUploadedFiles(
  supabaseAdmin: any,
  uploaded: Array<{ bucket: string; path: string }>,
) {
  await Promise.allSettled(
    uploaded.map((item) => supabaseAdmin.storage.from(item.bucket).remove([item.path])),
  );
}

function isDevHost(host: string) {
  return /localhost|127\.0\.0\.1|0\.0\.0\.0|id-preview--|lovableproject\.com|lovable\.app/i.test(
    host,
  );
}

async function findAuthUserByEmail(supabaseAdmin: any, email: string) {
  const users = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (users.error) throw users.error;
  return (
    users.data.users.find((u: { email?: string | null }) => u.email?.toLowerCase() === email) ??
    null
  );
}

export const cadastrarMotorista = createServerFn({ method: "POST" })
  .validator((input) => DriverSignupSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = data.email.toLowerCase();

    const created = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.password,
      email_confirm: true,
      user_metadata: { name: data.name, phone: data.phone, role: "driver" },
    });

    if (created.error || !created.data.user) {
      const message = created.error?.message ?? "";
      if (!isDuplicateAuthError(message)) throw new Error(authErrorMessage(created.error));

      const existingAuthUser = await findAuthUserByEmail(supabaseAdmin, email);
      if (!existingAuthUser) throw new Error("Este e-mail já está cadastrado.");

      const existingDriver = await supabaseAdmin
        .from(DRIVER_TABLE)
        .select("user_id, email")
        .or(`user_id.eq.${existingAuthUser.id},email.eq.${email}`)
        .maybeSingle();
      if (existingDriver.error) throw new Error("Falha ao verificar cadastro existente.");
      if (existingDriver.data) throw new Error("Este e-mail já está cadastrado.");

      throw new Error(
        "Já existe uma conta de autenticação com este e-mail, mas sem cadastro de motorista. Use o diagnóstico temporário para localizar o registro.",
      );
    }
    const finalAuthUserId = created.data.user.id;

    const uploaded: Array<{ bucket: string; path: string }> = [];

    try {
      const uploadedDocs = await Promise.all(
        data.documents.map(async (doc) => {
          // selfie: apenas imagens; demais podem ser imagem ou PDF
          const allowed: readonly string[] = doc.label === "selfie" ? IMAGE_TYPES : DOC_TYPES;
          const ct = (doc.contentType || "").toLowerCase();
          if (!allowed.includes(ct)) {
            throw new Error(
              `Formato inválido em ${doc.label}. Envie ${
                doc.label === "selfie" ? "JPG, PNG ou WEBP" : "JPG, PNG, WEBP ou PDF"
              }.`,
            );
          }
          const path = `${finalAuthUserId}/${doc.label}-${Date.now()}.${cleanExt(doc.fileName)}`;
          const body = decodeBase64(doc.base64);
          if (body.byteLength === 0) {
            throw new Error(`Arquivo vazio em ${doc.label}.`);
          }
          if (body.byteLength > MAX_DOC_BYTES) {
            throw new Error(`Arquivo de ${doc.label} excede 8 MB.`);
          }
          if (import.meta.env.DEV)
            console.log("[MOVVI DOCS] upload iniciado:", { bucket: doc.bucket, path });
          const { error } = await supabaseAdmin.storage
            .from(doc.bucket)
            .upload(path, body, { upsert: true, contentType: ct });
          if (error) {
            console.error("[MOVVI DOCS] falha upload:", doc.label, error.message);
            throw new Error(`Falha no upload de ${doc.label}.`);
          }
          uploaded.push({ bucket: doc.bucket, path });
          if (import.meta.env.DEV)
            console.log("[MOVVI DOCS] upload concluído:", { bucket: doc.bucket, path });
          return [doc.label, { path, body, contentType: ct, fileName: doc.fileName }] as const;
        }),
      );

      const docMap = Object.fromEntries(uploadedDocs) as Record<
        "selfie" | "cnh" | "cnh_back" | "veiculo",
        { path: string; body: ArrayBuffer; contentType: string; fileName: string }
      >;
      if (import.meta.env.DEV)
        console.log("[MOVVI DOCS] paths salvos:", {
          selfie: docMap.selfie.path,
          cnh: docMap.cnh.path,
          cnh_back: docMap.cnh_back.path,
          veiculo: docMap.veiculo.path,
        });

      // Profile photo: copy selfie to profile-photos bucket. Salvamos apenas o
      // path — a UI gera signed URL curta sob demanda.
      let photoPath: string | null = null;
      try {
        const selfie = docMap.selfie;
        const p = `${finalAuthUserId}/avatar-${Date.now()}.${cleanExt(selfie.fileName)}`;
        const photoUpload = await supabaseAdmin.storage
          .from("profile-photos")
          .upload(p, selfie.body, { upsert: true, contentType: selfie.contentType });
        if (photoUpload.error) throw photoUpload.error;
        uploaded.push({ bucket: "profile-photos", path: p });
        photoPath = p;
      } catch (photoErr) {
        console.error("[MOVVI PHOTO] falha ao copiar foto do motorista:", photoErr);
      }
      const photoUrl: string | null = photoPath;

      const profile = await supabaseAdmin.from("users").upsert(
        {
          auth_user_id: finalAuthUserId,
          name: data.name,
          email,
          phone: data.phone,
          avatar_url: photoUrl,
        },
        { onConflict: "auth_user_id" },
      );
      if (profile.error) throw new Error("Falha ao criar perfil do usuário.");

      const role = await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: finalAuthUserId, role: "driver" }, { onConflict: "user_id,role" });
      if (role.error) throw new Error("Falha ao definir perfil de motorista.");

      const driver = await supabaseAdmin.from(DRIVER_TABLE).insert({
        user_id: finalAuthUserId,
        name: data.name,
        email,
        phone: data.phone,
        cpf: data.cpf,
        birth_date: data.birth_date || null,
        city: data.city,
        state: data.state.toUpperCase(),
        category: data.category,
        vehicle_model: data.vehicle_model,
        vehicle_plate: data.vehicle_plate.toUpperCase(),
        vehicle_color: data.vehicle_color,
        vehicle_year: data.vehicle_year,
        selfie_url: docMap.selfie.path,
        cnh_url: docMap.cnh.path,
        cnh_back_url: docMap.cnh_back.path,
        vehicle_document_url: docMap.veiculo.path,
        photo_url: photoUrl,
        approval_status: "em_analise",
        documents_status: "pending_review",
      });
      if (driver.error) throw new Error("Falha ao criar cadastro de motorista.");

      return {
        ok: true,
        message: "Cadastro enviado para análise.",
        table: DRIVER_TABLE,
        auth_link_field: DRIVER_AUTH_LINK_FIELD,
        auth_user_id: finalAuthUserId,
        status: "em_analise" as const,
      };
    } catch (error) {
      await removeUploadedFiles(supabaseAdmin, uploaded);
      await Promise.allSettled([
        supabaseAdmin.from(DRIVER_TABLE).delete().eq("user_id", finalAuthUserId),
        supabaseAdmin
          .from("user_roles")
          .delete()
          .eq("user_id", finalAuthUserId)
          .eq("role", "driver"),
        supabaseAdmin.from("users").delete().eq("auth_user_id", finalAuthUserId),
        supabaseAdmin.auth.admin.deleteUser(finalAuthUserId),
      ]);
      throw new Error(
        error instanceof Error ? error.message : "Não foi possível concluir o cadastro.",
      );
    }
  });

export const diagnosticarAuthMotorista = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => DriverDiagnosticSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { getRequest } = await import("@tanstack/react-start/server");
    const host = getRequest()?.headers.get("host") ?? "";
    if (host && !isDevHost(host)) {
      return emptyDiagnostic("Diagnóstico disponível apenas em ambiente de desenvolvimento.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Apenas administradores podem inspecionar o estado de cadastro alheio.
    const role = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .in("role", ["admin", "super_admin", "support"])
      .maybeSingle();
    if (!role.data) {
      return emptyDiagnostic("Diagnóstico disponível apenas para administradores.");
    }

    const email = data.email.toLowerCase();
    const result = emptyDiagnostic();

    try {
      const users = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (users.error) throw users.error;
      const authUser = users.data.users.find((u) => u.email?.toLowerCase() === email) ?? null;
      result.auth_exists = !!authUser;
      result.auth_user_id = authUser?.id ?? null;

      let driverQuery = supabaseAdmin
        .from(DRIVER_TABLE)
        .select("user_id, email, approval_status, motivo_reprovacao, created_at");
      if (authUser?.id) driverQuery = driverQuery.or(`user_id.eq.${authUser.id},email.eq.${email}`);
      else driverQuery = driverQuery.eq("email", email);
      const driver = await driverQuery.maybeSingle();
      if (driver.error) throw driver.error;
      result.driver_exists = !!driver.data;
      result.auth_user_id = result.auth_user_id ?? driver.data?.user_id ?? null;
      result.status = driver.data?.approval_status ?? null;

      const profile = await supabaseAdmin
        .from("users")
        .select("auth_user_id")
        .or(
          `auth_user_id.eq.${result.auth_user_id ?? "00000000-0000-0000-0000-000000000000"},email.eq.${email}`,
        )
        .maybeSingle();
      if (profile.error) throw profile.error;
      result.related_profile_exists = !!profile.data;
    } catch (error) {
      result.error = error instanceof Error ? error.message : "Erro desconhecido.";
    }

    return result;
  });
