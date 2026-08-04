import { Capacitor } from "@capacitor/core";
import { StatusBar, Style } from "@capacitor/status-bar";
import { SplashScreen } from "@capacitor/splash-screen";
import { Keyboard } from "@capacitor/keyboard";
import { App } from "@capacitor/app";

export const isNative = () => Capacitor.isNativePlatform();
export const isAndroid = () => Capacitor.getPlatform() === "android";

export const initializeNativePlatform = async () => {
  if (!isNative()) return;

  try {
    // Status Bar configuration
    if (isAndroid()) {
      await StatusBar.setStyle({ style: Style.Dark });
      await StatusBar.setBackgroundColor({ color: "#000000" });
    }

    // Keyboard configuration
    await Keyboard.setAccessoryBarVisible({ isVisible: false });

    // Initial lifecycle listeners
    App.addListener("appStateChange", ({ isActive }) => {
      console.log("App state changed. Is active?", isActive);
    });

    console.log("Native platform initialized");
  } catch (error) {
    console.error("Error initializing native platform:", error);
  }
};

export const hideSplashScreen = async () => {
  if (isNative()) {
    try {
      await SplashScreen.hide();
    } catch (e) {
      console.warn("Could not hide splash screen", e);
    }
  }
};

export const setupBackButton = (callback: () => void) => {
  if (!isNative()) return () => {};

  const listener = App.addListener("backButton", () => {
    callback();
  });

  return () => {
    listener.then((l) => l.remove());
  };
};
