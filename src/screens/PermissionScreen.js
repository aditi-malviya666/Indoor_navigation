/**
 * PermissionScreen — Shown ONCE on first launch.
 * Requests all permissions simultaneously. Never shown again.
 */
import React, { useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, SafeAreaView, ScrollView,
} from "react-native";
import { requestAllPermissionsAtOnce } from "../utils/permissions";

const PERMS = [
  { icon: "📍", title: "Location (GPS)", desc: "Track your position while walking through the building" },
  { icon: "📷", title: "Camera", desc: "Capture surroundings for re-localization when location is lost" },
  { icon: "🏃", title: "Motion Sensors", desc: "Count your steps and detect walking direction & floor changes" },
  { icon: "💾", title: "Storage", desc: "Save maps, keyframes and navigation data locally" },
];

export default function PermissionScreen({ navigation }) {
  const [loading, setLoading] = useState(false);

  const handleGrant = async () => {
    setLoading(true);
    const granted = await requestAllPermissionsAtOnce();
    setLoading(false);
    if (granted) navigation.replace("Home");
  };

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.container} keyboardShouldPersistTaps="handled">
        {/* Header */}
        <View style={s.header}>
          <Text style={s.compassIcon}>🧭</Text>
          <Text style={s.title}>Indoor Navigator</Text>
          <Text style={s.subtitle}>
            Map any building once and navigate it forever — no beacons, no QR codes.
          </Text>
        </View>

        {/* Permission Items */}
        <View style={s.permList}>
          <Text style={s.permHeading}>Required Permissions</Text>
          {PERMS.map((p, i) => (
            <View key={i} style={s.permItem}>
              <Text style={s.permIcon}>{p.icon}</Text>
              <View style={s.permText}>
                <Text style={s.permTitle}>{p.title}</Text>
                <Text style={s.permDesc}>{p.desc}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Grant Button */}
        <TouchableOpacity
          style={[s.btn, loading && s.btnDisabled]}
          onPress={handleGrant}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color="#000" size="small" />
          ) : (
            <Text style={s.btnText}>Grant All & Continue →</Text>
          )}
        </TouchableOpacity>

        <Text style={s.note}>
          All permissions are requested at once. You will not be asked again.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: "#0b0f19" },
  container:   { padding: 24, paddingTop: 48, paddingBottom: 40 },
  header:      { alignItems: "center", marginBottom: 40 },
  compassIcon: { fontSize: 52, marginBottom: 12 },
  title:       { fontSize: 28, fontWeight: "800", color: "#f8fafc", textAlign: "center", marginBottom: 10 },
  subtitle:    { fontSize: 14, color: "#94a3b8", textAlign: "center", lineHeight: 20 },
  permHeading: { fontSize: 13, fontWeight: "700", color: "#64748b", textTransform: "uppercase",
                 letterSpacing: 1, marginBottom: 12 },
  permList:    { backgroundColor: "#131b2e", borderRadius: 16, padding: 16,
                 borderWidth: 1, borderColor: "rgba(255,255,255,0.07)", marginBottom: 32 },
  permItem:    { flexDirection: "row", alignItems: "flex-start", paddingVertical: 12,
                 borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.05)" },
  permIcon:    { fontSize: 24, width: 40, textAlign: "center" },
  permText:    { flex: 1, marginLeft: 10 },
  permTitle:   { fontSize: 15, fontWeight: "700", color: "#f8fafc", marginBottom: 2 },
  permDesc:    { fontSize: 12, color: "#64748b", lineHeight: 17 },
  btn:         { backgroundColor: "#38bdf8", borderRadius: 14, paddingVertical: 17,
                 alignItems: "center", marginBottom: 16 },
  btnDisabled: { opacity: 0.6 },
  btnText:     { fontSize: 16, fontWeight: "800", color: "#000" },
  note:        { fontSize: 11, color: "#475569", textAlign: "center", lineHeight: 16 },
});
