import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const DocSlot = z.enum(["selfie", "cnh_front", "cnh_back", "crlv"]);
type Slot = z.infer<typeof DocSlot>;

const UpdateSchema = z.object({
  slot: DocSlot,
  storagePath: z.string().min(3).max(500),
});

type DriverDocPatch = {
  selfie_url?: string | null;
  cnh_url?: string | null;
  cnh_back_url?: string | null;
  vehicle_document_url?: string | null;
  documents_status?: "pending_upload" | "pending_review" | "approved" | "rejected";
};

function setSlot(patch: DriverDocPatch, slot: Slot, value: string | null) {
  switch (slot) {
    case "selfie":
      patch.selfie_url = value;
      break;
    case "cnh_front":
      patch.cnh_url = value;
      break;
    case "cnh_back":
      patch.cnh_back_url = value;
      break;
    case "crlv":
      patch.vehicle_document_url = value;
      break;
  }
}

function bucketForSlot(slot: Slot) {
  if (slot === "selfie") return "driver-selfies";
  if (slot === "crlv") return "vehicle-documents";
  return "driver-cnh";
}

/**
 * Records a newly-uploaded document path on the current driver profile.
 * When all 4 slots are filled, the profile transitions to
 * `documents_status = 'pending_review'`.
 * Ride logic, dispatch, RLS on rides, and approval_status are NOT touched.
 */
export const updateDriverDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => UpdateSchema.parse(input))
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (!data.storagePath.startsWith(`${userId}/`)) {
      throw new Error("Caminho de arquivo inválido para este usuário.");
    }

    const existing = await supabaseAdmin
      .from("drivers")
      .select(
        "user_id, selfie_url, cnh_url, cnh_back_url, vehicle_document_url, documents_status, approval_status",
      )
      .eq("user_id", userId)
      .maybeSingle();
    if (existing.error) throw new Error("Falha ao ler cadastro do motorista.");
    if (!existing.data) throw new Error("Cadastro de motorista não encontrado.");

    const patch: DriverDocPatch = {};
    setSlot(patch, data.slot, data.storagePath);

    const merged = {
      selfie_url: existing.data.selfie_url,
      cnh_url: existing.data.cnh_url,
      cnh_back_url: existing.data.cnh_back_url,
      vehicle_document_url: existing.data.vehicle_document_url,
    };
    setSlot(merged as DriverDocPatch, data.slot, data.storagePath);

    const complete =
      !!merged.selfie_url &&
      !!merged.cnh_url &&
      !!merged.cnh_back_url &&
      !!merged.vehicle_document_url;

    if (complete && existing.data.documents_status === "pending_upload") {
      patch.documents_status = "pending_review";
    } else if (!complete && existing.data.documents_status !== "approved") {
      patch.documents_status = "pending_upload";
    }

    const upd = await supabaseAdmin.from("drivers").update(patch).eq("user_id", userId);
    if (upd.error) throw new Error("Falha ao atualizar documento.");

    return {
      ok: true,
      slot: data.slot,
      documents_status: patch.documents_status ?? existing.data.documents_status,
      complete,
    };
  });

const RemoveSchema = z.object({ slot: DocSlot });

/**
 * Clears a document reference before final confirmation.
 * Also removes the stored file when a path is present.
 */
export const removeDriverDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => RemoveSchema.parse(input))
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const existing = await supabaseAdmin
      .from("drivers")
      .select("user_id, selfie_url, cnh_url, cnh_back_url, vehicle_document_url, documents_status")
      .eq("user_id", userId)
      .maybeSingle();
    if (existing.error) throw new Error("Falha ao ler cadastro do motorista.");
    if (!existing.data) throw new Error("Cadastro de motorista não encontrado.");

    const currentPath =
      data.slot === "selfie"
        ? existing.data.selfie_url
        : data.slot === "cnh_front"
          ? existing.data.cnh_url
          : data.slot === "cnh_back"
            ? existing.data.cnh_back_url
            : existing.data.vehicle_document_url;

    if (currentPath && currentPath.startsWith(`${userId}/`)) {
      await supabaseAdmin.storage.from(bucketForSlot(data.slot)).remove([currentPath]);
    }

    const patch: DriverDocPatch = {};
    setSlot(patch, data.slot, null);
    if (existing.data.documents_status !== "approved") {
      patch.documents_status = "pending_upload";
    }

    const upd = await supabaseAdmin.from("drivers").update(patch).eq("user_id", userId);
    if (upd.error) throw new Error("Falha ao remover documento.");

    return { ok: true };
  });
