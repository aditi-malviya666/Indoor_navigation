// ─────────────────────────────────────────────────────
//  ONE-SHOT PERMISSION MANAGER
//  All permissions requested simultaneously in one call.
//  Result cached in AsyncStorage — never asked again.
// ─────────────────────────────────────────────────────
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Camera from "expo-camera";
import * as Location from "expo-location";
import * as MediaLibrary from "expo-media-library";
import { Platform, Alert } from "react-native";

const PERM_KEY = "indoor_nav_permissions_granted_v1";

export const arePermissionsGranted = async () => {
  const stored = await AsyncStorage.getItem(PERM_KEY);
  return stored === "true";
};

export const requestAllPermissionsAtOnce = async () => {
  // Already granted before — skip entirely
  const already = await arePermissionsGranted();
  if (already) return true;

  try {
    // Fire ALL permission requests simultaneously
    const results = await Promise.all([
      Camera.requestCameraPermissionsAsync(),
      Location.requestForegroundPermissionsAsync(),
      Location.requestBackgroundPermissionsAsync(),
      MediaLibrary.requestPermissionsAsync(),
    ]);

    const [cam, locFg, locBg, media] = results;

    const allGranted =
      cam.status === "granted" &&
      locFg.status === "granted" &&
      media.status === "granted";

    if (allGranted) {
      // Save permanently — never asked again
      await AsyncStorage.setItem(PERM_KEY, "true");
      return true;
    } else {
      // Show what was denied
      const denied = [];
      if (cam.status !== "granted") denied.push("Camera");
      if (locFg.status !== "granted") denied.push("Location");
      if (media.status !== "granted") denied.push("Storage");
      Alert.alert(
        "Permissions Required",
        `Please enable ${denied.join(", ")} in your phone Settings to use this app. Go to Settings → Apps → IndoorNav → Permissions`,
        [{ text: "OK" }]
      );
      return false;
    }
  } catch (err) {
    console.error("Permission error:", err);
    return false;
  }
};
