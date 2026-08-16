import { useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

const MAX_AVATAR_BYTES = 10 * 1024 * 1024;
const ALLOWED_AVATAR_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function extensionFor(file: File): "jpg" | "png" | "webp" {
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "jpg";
}

export function PassengerAvatarControl() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { user, profile, refreshSession } = useAuth();
  const [isUploading, setIsUploading] = useState(false);

  const selectPhoto = () => {
    if (!isUploading) inputRef.current?.click();
  };

  const uploadPhoto = async (file: File): Promise<void> => {
    if (!user || isUploading) return;

    if (!ALLOWED_AVATAR_TYPES.has(file.type)) {
      toast.error("Escolha uma foto JPG, PNG ou WEBP.");
      return;
    }
    if (file.size <= 0 || file.size > MAX_AVATAR_BYTES) {
      toast.error("A foto deve ter no máximo 10 MB.");
      return;
    }

    const previousPath =
      typeof profile?.avatar_storage_path === "string" &&
      profile.avatar_storage_path.startsWith(`${user.id}/`)
        ? profile.avatar_storage_path
        : null;
    const nextPath = `${user.id}/avatar-${Date.now()}.${extensionFor(file)}`;

    setIsUploading(true);
    try {
      const { error: uploadError } = await supabase.storage.from("profile-photos").upload(
        nextPath,
        file,
        {
          cacheControl: "3600",
          contentType: file.type,
          upsert: false,
        },
      );
      if (uploadError) throw uploadError;

      const { error: updateError } = await supabase
        .from("users")
        .update({ avatar_url: nextPath, updated_at: new Date().toISOString() })
        .eq("auth_user_id", user.id);

      if (updateError) {
        await supabase.storage.from("profile-photos").remove([nextPath]);
        throw updateError;
      }

      if (previousPath && previousPath !== nextPath) {
        const { error: cleanupError } = await supabase.storage
          .from("profile-photos")
          .remove([previousPath]);
        if (cleanupError) {
          console.warn("[PassengerAvatarControl] Previous avatar cleanup failed", {
            message: cleanupError.message,
          });
        }
      }

      await refreshSession();
      toast.success("Foto de perfil atualizada.");
      window.location.reload();
    } catch (caughtError: unknown) {
      console.error("[PassengerAvatarControl] Avatar upload failed", {
        message: caughtError instanceof Error ? caughtError.message : "unknown_error",
      });
      toast.error("Não foi possível atualizar sua foto agora.");
    } finally {
      setIsUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div
      className="pointer-events-none fixed left-1/2 z-30 translate-x-5"
      style={{ top: "calc(env(safe-area-inset-top) + 94px)" }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="user"
        className="hidden"
        aria-hidden="true"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) void uploadPhoto(file);
        }}
      />
      <button
        type="button"
        aria-label="Alterar foto de perfil"
        onClick={selectPhoto}
        disabled={!user || isUploading}
        className="app-pressable pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full border-2 border-black bg-apois-yellow text-black shadow-lg disabled:opacity-60"
      >
        {isUploading ? <Loader2 className="animate-spin" size={17} /> : <Camera size={17} />}
      </button>
    </div>
  );
}
