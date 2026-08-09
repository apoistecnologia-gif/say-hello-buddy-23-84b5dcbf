import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const read = (path) => readFileSync(path, "utf8");
const includes = (source, needle, label) => assert.ok(source.includes(needle), `${label}: missing ${needle}`);
const excludes = (source, needle, label) => assert.ok(!source.includes(needle), `${label}: forbidden ${needle}`);

const pkg = JSON.parse(read("package.json"));
const capacitor = read("capacitor.config.ts");
const manifest = read("android/app/src/main/AndroidManifest.xml");
const strings = read("android/app/src/main/res/values/strings.xml");
const gradle = read("android/app/build.gradle");
const recovery = read("src/lib/auth/native-password-recovery.ts");
const recoveryRequest = read("src/routes/_public.recuperar-senha.tsx");
const resetRoute = read("src/routes/_public.redefinir-senha.tsx");
const main = read("src/main.tsx");
const terms = read("src/routes/_public.termos.tsx");
const privacy = read("src/routes/_public.privacidade.tsx");

assert.equal(pkg.dependencies?.["@capacitor/app"], "^8.1.1", "Capacitor App plugin must match v8 release line");
includes(capacitor, 'appId: "com.apois.passageiro"', "Passenger package id");
includes(capacitor, 'appName: "APOIS Passageiro"', "Passenger app name");
includes(manifest, 'android:allowBackup="false"', "Android backup hardening");
includes(manifest, 'android:usesCleartextTraffic="false"', "Android cleartext hardening");
includes(manifest, 'android.permission.POST_NOTIFICATIONS', "Notification permission");
includes(manifest, 'android:scheme="apoispassageiro"', "Passenger recovery scheme");
includes(manifest, 'android:pathPrefix="/redefinir-senha"', "Passenger recovery path");
includes(manifest, 'com.google.firebase.messaging.default_notification_channel_id', "Firebase default channel metadata");
includes(manifest, 'com.google.android.geo.API_KEY', "Native Google Maps key placeholder");
includes(strings, '<string name="default_notification_channel_id">apois_rides</string>', "Passenger ride channel");

includes(recovery, "appUrlOpen", "Native recovery listener");
includes(recovery, "exchangeCodeForSession", "PKCE recovery exchange");
includes(recovery, "setSession", "Token recovery fallback");
includes(recoveryRequest, "resetPasswordForEmail", "Recovery email request");
includes(resetRoute, "updateUser", "Password update");
includes(main, "registerNativePasswordRecoveryHandler", "Recovery listener mounted at startup");
includes(terms, "PublicLegalDocument", "Public terms route");
includes(privacy, "PublicLegalDocument", "Public privacy route");

includes(gradle, "APOIS_VERSION_CODE", "Release versionCode input");
includes(gradle, "APOIS_VERSION_NAME", "Release versionName input");
includes(gradle, "APOIS_UPLOAD_KEYSTORE_PATH", "External upload keystore path");
includes(gradle, "APOIS_UPLOAD_KEY_ALIAS", "External upload alias");
includes(gradle, "APOIS_UPLOAD_STORE_PASSWORD", "External upload store password");
includes(gradle, "APOIS_UPLOAD_KEY_PASSWORD", "External upload key password");
excludes(gradle.toLowerCase(), ".jks\"", "Hardcoded JKS path");

console.log("APOIS_PASSENGER_PHASE9_RELEASE_CONTRACT_OK");
