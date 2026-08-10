import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import assert from "node:assert/strict";

const read = (path) => readFileSync(path, "utf8");
const includes = (source, needle, label) => assert.ok(source.includes(needle), `${label}: missing ${needle}`);
const excludes = (source, needle, label) => assert.ok(!source.includes(needle), `${label}: forbidden ${needle}`);

const pkg = JSON.parse(read("package.json"));
const capacitor = read("capacitor.config.ts");
const manifest = read("android/app/src/main/AndroidManifest.xml");
const strings = read("android/app/src/main/res/values/strings.xml");
const gradle = read("android/app/build.gradle");
const workflow = read(".github/workflows/apois-passenger-phase9-release.yml");
const pushService = read("src/services/push/push-service.ts");
const recovery = read("src/lib/auth/native-password-recovery.ts");
const recoveryRequest = read("src/routes/_public.recuperar-senha.tsx");
const resetRoute = read("src/routes/_public.redefinir-senha.tsx");
const main = read("src/main.tsx");
const terms = read("src/routes/_public.termos.tsx");
const privacy = read("src/routes/_public.privacidade.tsx");
const adaptiveLauncher = read("android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml");
const adaptiveLauncherRound = read("android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml");
const legacyLauncher = read("android/app/src/main/res/mipmap-anydpi/ic_launcher.xml");
const legacyLauncherRound = read("android/app/src/main/res/mipmap-anydpi/ic_launcher_round.xml");
const launchScreen = read("android/app/src/main/res/drawable/apois_launch_screen.xml");
const launcherForeground = read("android/app/src/main/res/drawable/apois_launcher_foreground.xml");
const splashV31 = read("android/app/src/main/res/values-v31/styles.xml");
const colors = read("android/app/src/main/res/values/apois_colors.xml");
const notificationIcon = read("android/app/src/main/res/drawable/ic_stat_apois_notification.xml");
const brandLogoPath = "android/app/src/main/res/drawable-mdpi/apois_brand_logo.png";

assert.equal(pkg.dependencies?.["@capacitor/app"], "^8.1.1", "Capacitor App plugin must match v8 release line");
includes(capacitor, 'appId: "com.apois.passageiro"', "Passenger package id");
includes(capacitor, 'appName: "APOIS Passageiro"', "Passenger app name");
includes(manifest, 'android:allowBackup="false"', "Android backup hardening");
includes(manifest, 'android:usesCleartextTraffic="false"', "Android cleartext hardening");
includes(manifest, 'android.permission.POST_NOTIFICATIONS', "Notification permission");
includes(manifest, 'android:scheme="apoispassageiro"', "Passenger recovery scheme");
includes(manifest, 'android:pathPrefix="/redefinir-senha"', "Passenger recovery path");
includes(manifest, 'com.google.firebase.messaging.default_notification_channel_id', "Firebase default channel metadata");
includes(manifest, 'com.google.firebase.messaging.default_notification_icon', "Firebase default notification icon metadata");
includes(manifest, 'android:resource="@drawable/ic_stat_apois_notification"', "Dedicated monochrome notification icon");
includes(manifest, 'com.google.firebase.messaging.default_notification_color', "Firebase default notification color metadata");
includes(manifest, 'com.google.android.geo.API_KEY', "Native Google Maps key placeholder");
includes(strings, '<string name="default_notification_channel_id">apois_rides</string>', "Passenger ride channel");
includes(pushService, 'RIDES_CHANNEL_ID = "apois_rides"', "Passenger canonical push channel id");
includes(pushService, "PushNotifications.createChannel", "Passenger Android push channel creation");

includes(adaptiveLauncher, '@color/apois_black', "Adaptive launcher black background");
includes(adaptiveLauncher, '@drawable/apois_launcher_foreground', "Adaptive launcher APOIS foreground");
includes(adaptiveLauncherRound, '@color/apois_black', "Adaptive round launcher black background");
includes(adaptiveLauncherRound, '@drawable/apois_launcher_foreground', "Adaptive round launcher APOIS foreground");
includes(legacyLauncher, '@drawable/apois_brand_logo', "Legacy launcher APOIS brand");
includes(legacyLauncherRound, '@drawable/apois_brand_logo', "Legacy round launcher APOIS brand");
includes(launcherForeground, '@drawable/apois_brand_logo', "Launcher foreground official APOIS brand");
includes(launchScreen, '@color/apois_black', "Pre-Android 12 splash black background");
includes(launchScreen, '@drawable/apois_launcher_foreground', "Pre-Android 12 splash APOIS brand");
includes(splashV31, 'windowSplashScreenBackground">#000000', "Android 12 splash black background");
includes(splashV31, 'windowSplashScreenAnimatedIcon">@drawable/apois_splash_icon', "Android 12 splash APOIS dedicated icon");
includes(colors, '<color name="apois_black">#000000</color>', "APOIS native black");
includes(colors, '<color name="apois_gold">#FFB800</color>', "APOIS native gold");
includes(notificationIcon, 'android:fillColor="#FFFFFFFF"', "Notification icon white-mask fill");
assert.ok(existsSync(brandLogoPath), "Official APOIS native brand PNG must exist");
const brandLogoSha256 = createHash("sha256").update(readFileSync(brandLogoPath)).digest("hex");
assert.equal(brandLogoSha256, "8ae8a1320a2231151ac5e9affc12c86be4cca76a914f4819f1d295ef9f160d76", "Official APOIS native brand PNG hash drifted");

const forbiddenCapacitorResources = [
  "android/app/src/main/res/drawable/splash.png",
  ...["mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"].flatMap((density) => [
    `android/app/src/main/res/mipmap-${density}/ic_launcher.png`,
    `android/app/src/main/res/mipmap-${density}/ic_launcher_round.png`,
    `android/app/src/main/res/mipmap-${density}/ic_launcher_foreground.png`,
    `android/app/src/main/res/drawable-land-${density}/splash.png`,
    `android/app/src/main/res/drawable-port-${density}/splash.png`,
  ]),
];
for (const path of forbiddenCapacitorResources) {
  assert.ok(!existsSync(path), `Stale Capacitor native resource must be removed: ${path}`);
}

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

includes(workflow, "vars.APOIS_PASSENGER_PUBLIC_URL", "Passenger public URL repository variable");
includes(workflow, 'export VITE_PUBLIC_APP_URL="$APOIS_PASSENGER_PUBLIC_URL"', "Passenger build uses validated public URL");
excludes(workflow, "passageiro.apois.example", "Fake passenger public URL");
excludes(workflow, "https://passageiro.apois.example", "Reserved .example release URL");
includes(workflow, "secrets.APOIS_UPLOAD_KEYSTORE_BASE64", "Release workflow upload keystore secret");
includes(workflow, "secrets.APOIS_UPLOAD_KEY_ALIAS", "Release workflow upload alias secret");
includes(workflow, "secrets.APOIS_UPLOAD_STORE_PASSWORD", "Release workflow store password secret");
includes(workflow, "secrets.APOIS_UPLOAD_KEY_PASSWORD", "Release workflow key password secret");
includes(workflow, "base64 --decode", "Release workflow restores external keystore");
includes(workflow, "keytool -list", "Release workflow validates upload key");
includes(workflow, "jarsigner -verify", "Release workflow verifies AAB signature");
includes(workflow, "APOIS_PASSENGER_SIGNED_AAB_OK", "Signed AAB release gate");

console.log("APOIS_PASSENGER_PHASE9_RELEASE_CONTRACT_OK");
