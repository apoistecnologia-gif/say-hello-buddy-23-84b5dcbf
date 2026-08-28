import { supabase } from "@/integrations/supabase/client";
import { getPasswordRecoveryRedirectTo } from "@/lib/auth/password-recovery";

export interface PassengerProfileDetails {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  avatarUrl: string | null;
  city: string | null;
  cpf: string | null;
  birthDate: string | null;
  gender: string | null;
  averageRating: number | null;
  totalRatings: number;
  completedRides: number;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface PassengerPreferences {
  rideUpdates: boolean;
  promotions: boolean;
  safetyAlerts: boolean;
  paymentUpdates: boolean;
  accessibilityLargeText: boolean;
}

export interface EmergencyContact {
  id: string;
  name: string;
  phone: string;
  relationship: string | null;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PassengerProfileCenter {
  profile: PassengerProfileDetails;
  preferences: PassengerPreferences;
  emergencyContacts: EmergencyContact[];
}

export interface ProfileUpdateInput {
  name: string;
  phone: string;
  city: string;
  birthDate: string;
  gender: string;
}

export interface EmergencyContactInput {
  id?: string;
  name: string;
  phone: string;
  relationship: string;
  isPrimary: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(record: Record<string, unknown>, key: string, fallback = ""): string {
  const value = record[key];
  return typeof value === "string" ? value : fallback;
}

function nullableString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function numberValue(record: Record<string, unknown>, key: string, fallback = 0): number {
  const value = Number(record[key]);
  return Number.isFinite(value) ? value : fallback;
}

function booleanValue(record: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const value = record[key];
  return typeof value === "boolean" ? value : fallback;
}

function parseCenter(value: unknown): PassengerProfileCenter {
  if (!isRecord(value) || value["ok"] !== true) throw new Error("profile_response_invalid");
  const rawProfile = value["profile"];
  const rawPreferences = value["preferences"];
  const rawContacts = value["emergencyContacts"];
  if (!isRecord(rawProfile) || !isRecord(rawPreferences) || !Array.isArray(rawContacts)) {
    throw new Error("profile_response_invalid");
  }

  const id = stringValue(rawProfile, "id");
  if (!id) throw new Error("profile_response_invalid");

  const emergencyContacts = rawContacts.flatMap((item): EmergencyContact[] => {
    if (!isRecord(item)) return [];
    const contactId = stringValue(item, "id");
    const name = stringValue(item, "name");
    const phone = stringValue(item, "phone");
    if (!contactId || !name || !phone) return [];
    return [
      {
        id: contactId,
        name,
        phone,
        relationship: nullableString(item, "relationship"),
        isPrimary: item["is_primary"] === true,
        createdAt: stringValue(item, "created_at", new Date(0).toISOString()),
        updatedAt: stringValue(item, "updated_at", new Date(0).toISOString()),
      },
    ];
  });

  return {
    profile: {
      id,
      name: stringValue(rawProfile, "name", "Passageiro"),
      email: nullableString(rawProfile, "email"),
      phone: nullableString(rawProfile, "phone"),
      avatarUrl: nullableString(rawProfile, "avatarUrl"),
      city: nullableString(rawProfile, "city"),
      cpf: nullableString(rawProfile, "cpf"),
      birthDate: nullableString(rawProfile, "birthDate"),
      gender: nullableString(rawProfile, "gender"),
      averageRating:
        rawProfile["averageRating"] === null || rawProfile["averageRating"] === undefined
          ? null
          : numberValue(rawProfile, "averageRating"),
      totalRatings: numberValue(rawProfile, "totalRatings"),
      completedRides: numberValue(rawProfile, "completedRides"),
      createdAt: nullableString(rawProfile, "createdAt"),
      updatedAt: nullableString(rawProfile, "updatedAt"),
    },
    preferences: {
      rideUpdates: booleanValue(rawPreferences, "rideUpdates", true),
      promotions: booleanValue(rawPreferences, "promotions", false),
      safetyAlerts: booleanValue(rawPreferences, "safetyAlerts", true),
      paymentUpdates: booleanValue(rawPreferences, "paymentUpdates", true),
      accessibilityLargeText: booleanValue(
        rawPreferences,
        "accessibilityLargeText",
        false,
      ),
    },
    emergencyContacts,
  };
}

async function resolveAvatarUrl(center: PassengerProfileCenter): Promise<PassengerProfileCenter> {
  const avatarPath = center.profile.avatarUrl?.trim();
  if (!avatarPath || /^(https?:|data:|blob:)/i.test(avatarPath)) return center;

  const { data, error } = await supabase.storage
    .from("profile-photos")
    .createSignedUrl(avatarPath, 60 * 60);

  if (error || !data?.signedUrl) {
    console.warn("[PassengerProfileService] Could not sign private avatar path", {
      code: error?.name,
      message: error?.message,
    });
    return {
      ...center,
      profile: { ...center.profile, avatarUrl: null },
    };
  }

  return {
    ...center,
    profile: { ...center.profile, avatarUrl: data.signedUrl },
  };
}

function functionErrorMessage(error: unknown, data: unknown, fallback: string): string {
  if (isRecord(data) && typeof data["message"] === "string" && data["message"].trim()) {
    return data["message"];
  }
  return error instanceof Error && error.message ? error.message : fallback;
}

class PassengerProfileService {
  private async invoke(body?: Record<string, unknown>): Promise<PassengerProfileCenter> {
    const { data, error } = await supabase.functions.invoke("passenger-profile", {
      method: body ? "POST" : "GET",
      ...(body ? { body } : {}),
    });
    if (error) {
      throw new Error(functionErrorMessage(error, data, "Não foi possível carregar seu perfil."));
    }
    return resolveAvatarUrl(parseCenter(data));
  }

  load(): Promise<PassengerProfileCenter> {
    return this.invoke();
  }

  updateProfile(input: ProfileUpdateInput): Promise<PassengerProfileCenter> {
    return this.invoke({ action: "update_profile", ...input });
  }

  updatePreferences(preferences: PassengerPreferences): Promise<PassengerProfileCenter> {
    return this.invoke({ action: "update_preferences", ...preferences });
  }

  saveEmergencyContact(input: EmergencyContactInput): Promise<PassengerProfileCenter> {
    return this.invoke({ action: "save_emergency_contact", ...input });
  }

  deleteEmergencyContact(id: string): Promise<PassengerProfileCenter> {
    return this.invoke({ action: "delete_emergency_contact", id });
  }

  async sendPasswordReset(email: string): Promise<void> {
    const redirectTo = getPasswordRecoveryRedirectTo();
    const { error } = await supabase.auth.resetPasswordForEmail(
      email,
      redirectTo ? { redirectTo } : undefined,
    );
    if (error) throw error;
  }

  async deleteAccount(): Promise<void> {
    const { data, error } = await supabase.functions.invoke("delete-my-account", {
      method: "POST",
      body: {},
    });
    if (error || !isRecord(data) || data["ok"] !== true) {
      throw new Error(
        functionErrorMessage(error, data, "Não foi possível excluir sua conta agora."),
      );
    }
  }
}

export const passengerProfileService = new PassengerProfileService();