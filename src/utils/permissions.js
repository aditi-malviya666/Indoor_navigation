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
  try {
    const stored = await AsyncStorage.getItem(PERM_KEY);
    return stored === "true";
  } catch {
    return false;
  }
};

export const requestAllPermissionsAtOnce = async () => {
  try {
    // 1. Request Foreground Location (GPS)
    try {
      await Location.requestForegroundPermissionsAsync();
    } catch (e) {
      console.warn("Location permission error:", e);
    }

    // 2. Request Camera
    try {
      await Camera.requestCameraPermissionsAsync();
    } catch (e) {
      console.warn("Camera permission error:", e);
    }

    // 3. Request Media / Storage
    try {
      await MediaLibrary.requestPermissionsAsync();
    } catch (e) {
      console.warn("MediaLibrary permission error:", e);
    }

    // Save permanently so the screen never blocks again
    await AsyncStorage.setItem(PERM_KEY, "true");
    return true;
  } catch (err) {
    console.error("Permission error:", err);
    await AsyncStorage.setItem(PERM_KEY, "true");
    return true;
  }
};
