import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.apois.passageiro",
  appName: "APOIS Passageiro",
  webDir: "dist",
  bundledWebRuntime: false,
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      backgroundColor: "#000000",
      androidScaleType: "CENTER_INSIDE",
      showSpinner: false,
    },
    SystemBars: {
      insetsHandling: "css",
      // Capacitor 8: DARK = light system-bar icons/content on a dark background.
      style: "DARK",
      hidden: false,
      animation: "NONE",
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
    Keyboard: {
      resize: "body",
      style: "dark",
      resizeOnFullScreen: true,
    },
  },
};

export default config;
