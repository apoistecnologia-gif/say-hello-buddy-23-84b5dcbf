import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

describe("APOIS Passenger Phase 6 contracts", () => {
  test("passenger rating is not confused with driver-to-passenger rating", () => {
    const activeTypes = source("src/types/rides/active-ride.ts");
    const activeRoute = source("src/routes/_authenticated.corrida.$rideId.tsx");
    const historyRoute = source("src/routes/_authenticated.corridas.$rideId.tsx");

    expect(activeTypes).toContain("passenger_driver_rating?: number");
    expect(activeRoute).toContain("currentRating={ride.passenger_driver_rating ?? null}");
    expect(historyRoute).toContain("ride.passengerDriverRating");
    expect(historyRoute).not.toContain("currentRating={ride.passengerRating}");
  });

  test("secure ride sharing creates a server token before sharing", () => {
    const service = source("src/services/rides/shared-ride-service.ts");
    const route = source("src/routes/_authenticated.corrida.$rideId.tsx");

    expect(service).toContain('rpc("passenger_create_or_refresh_share"');
    expect(service).toContain('rpc("passenger_revoke_share"');
    expect(service).toContain('rpc("get_shared_passenger_ride"');
    expect(route).toContain("sharedRideService.createOrRefresh(ride.id)");
    expect(route).not.toContain("ride.share_token ? publicShareUrl");
  });

  test("safety center registers an operational ride-bound alert", () => {
    const safetyService = source("src/services/rides/ride-safety-service.ts");
    const safetyDialog = source("src/components/rides/active/RideSafetyDialog.tsx");
    const sosAction = source("src/components/rides/active/ApoisSosAction.tsx");

    expect(safetyService).toContain('rpc("passenger_trigger_sos"');
    expect(safetyService).toContain("Geolocation.getCurrentPosition");
    expect(safetyDialog).toContain("<ApoisSosAction rideId={rideId} />");
    expect(sosAction).toContain("triggerSosWithCurrentLocation");
  });

  test("receipt uses canonical settlement RPC instead of frontend arithmetic", () => {
    const receiptService = source("src/services/rides/ride-receipt-service.ts");
    const historyRoute = source("src/routes/_authenticated.corridas.$rideId.tsx");

    expect(receiptService).toContain('rpc("get_passenger_ride_receipt"');
    expect(historyRoute).toContain("receipt.totalAmountCents");
    expect(historyRoute).toContain("Recibo financeiro ainda não disponível");
    expect(historyRoute).toContain("Não é um recibo financeiro");
  });

  test("profile exposes photo, legal documents and a New rating state", () => {
    const profile = source("src/components/profile/PassengerProfileCenter.tsx");
    const profileService = source("src/services/profile/passenger-profile-service.ts");

    expect(profile).toContain('return "Novo"');
    expect(profile).toContain('accept="image/jpeg,image/png,image/webp"');
    expect(profile).toContain('navigate({ to: "/termos" })');
    expect(profile).toContain('navigate({ to: "/privacidade" })');
    expect(profileService).toContain('PROFILE_PHOTO_BUCKET = "profile-photos"');
    expect(profileService).toContain("createSignedUrl");
    expect(profileService).toContain("uploadAvatar(file: File)");
  });

  test("mobile password recovery remains native-safe", () => {
    const recovery = source("src/lib/auth/password-recovery.ts");
    const nativeRecovery = source("src/lib/auth/native-password-recovery.ts");
    const manifest = source("android/app/src/main/AndroidManifest.xml");

    expect(nativeRecovery).toContain("apoispassageiro://auth/redefinir-senha");
    expect(nativeRecovery).toContain("redefinir-senha");
    expect(recovery).toContain("NATIVE_PASSWORD_RECOVERY_REDIRECT");
    expect(recovery).toContain("Capacitor.isNativePlatform()");
    expect(manifest).toContain('android:scheme="apoispassageiro"');
    expect(manifest).toContain('android:pathPrefix="/redefinir-senha"');
  });
});
