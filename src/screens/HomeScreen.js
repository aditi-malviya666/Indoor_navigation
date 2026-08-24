/**
 * HomeScreen — Entry point. Create Map or Navigate.
 */
import React, { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  TextInput, Modal, Alert, ActivityIndicator, SafeAreaView,
} from "react-native";
import { listMaps, joinMapByCode } from "../firebase/mapService";

export default function HomeScreen({ navigation }) {
  const [maps, setMaps]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const [codeModal, setCodeModal] = useState(false);
  const [code, setCode]         = useState("");
  const [joining, setJoining]   = useState(false);

  useEffect(() => {
    loadMaps();
  }, []);

  const loadMaps = async () => {
    setLoading(true);
    const result = await listMaps();
    setMaps(result);
    setLoading(false);
  };

  const handleJoinCode = async () => {
    if (code.length !== 6) { Alert.alert("Invalid Code", "Please enter a 6-digit code."); return; }
    setJoining(true);
    const mapResult = await joinMapByCode(code.trim());
    setJoining(false);
    if (!mapResult) { Alert.alert("Not Found", "No map found with that code."); return; }
    setCodeModal(false);
    navigation.navigate("Navigation", { mapId: mapResult.mapId, mapData: mapResult.mapData });
  };

  const renderMapCard = ({ item }) => (
    <TouchableOpacity
      style={s.mapCard}
      onPress={() => navigation.navigate("Navigation", { mapId: item.mapId })}
      activeOpacity={0.8}
    >
      <View style={s.mapCardLeft}>
        <Text style={s.mapIcon}>🏛️</Text>
      </View>
      <View style={s.mapInfo}>
        <Text style={s.mapName}>{item.name}</Text>
        <Text style={s.mapMeta}>{item.floorCount} floor{item.floorCount !== 1 ? "s" : ""} · {item.poiCount} places</Text>
        <Text style={s.mapDate}>{item.createdAt ? new Date(item.createdAt).toLocaleDateString() : ""}</Text>
      </View>
      <TouchableOpacity
        style={s.navBtn}
        onPress={() => navigation.navigate("Navigation", { mapId: item.mapId })}
      >
        <Text style={s.navBtnText}>Navigate</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={s.safe}>
      <FlatList
        data={maps}
        keyExtractor={m => m.mapId}
        renderItem={renderMapCard}
        ListEmptyComponent={
          loading
            ? <ActivityIndicator color="#38bdf8" style={{ marginTop: 40 }} />
            : <Text style={s.emptyText}>No maps yet. Create one below!</Text>
        }
        ListHeaderComponent={
          <View>
            {/* App Title */}
            <View style={s.headerBox}>
              <Text style={s.appTitle}>🧭 Indoor Navigator</Text>
              <Text style={s.appSub}>Zero beacons · Zero QR codes · Just walk</Text>
            </View>

            {/* Primary Action Cards */}
            <View style={s.actionRow}>
              <TouchableOpacity
                style={[s.actionCard, s.actionCardBlue]}
                onPress={() => navigation.navigate("Recording")}
                activeOpacity={0.85}
              >
                <Text style={s.actionIcon}>🗺️</Text>
                <Text style={s.actionTitle}>Create Map</Text>
                <Text style={s.actionDesc}>Walk through your building to generate a navigable map</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[s.actionCard, s.actionCardGreen]}
                onPress={() => setCodeModal(true)}
                activeOpacity={0.85}
              >
                <Text style={s.actionIcon}>🔑</Text>
                <Text style={s.actionTitle}>Join by Code</Text>
                <Text style={s.actionDesc}>Enter a 6-digit code to use someone else's map</Text>
              </TouchableOpacity>
            </View>

            {/* Recent Maps Header */}
            <View style={s.sectionHeader}>
              <Text style={s.sectionTitle}>Available Maps</Text>
              <TouchableOpacity onPress={loadMaps}>
                <Text style={s.refreshBtn}>↻ Refresh</Text>
              </TouchableOpacity>
            </View>
          </View>
        }
        contentContainerStyle={s.list}
      />

      {/* Join by Code Modal */}
      <Modal visible={codeModal} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <Text style={s.modalTitle}>Enter Building Code</Text>
            <TextInput
              style={s.codeInput}
              value={code}
              onChangeText={setCode}
              placeholder="6-digit code"
              placeholderTextColor="#475569"
              keyboardType="numeric"
              maxLength={6}
              autoFocus
            />
            <TouchableOpacity style={s.modalBtn} onPress={handleJoinCode} disabled={joining}>
              {joining ? <ActivityIndicator color="#000" /> : <Text style={s.modalBtnText}>Join Map</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setCodeModal(false)}>
              <Text style={s.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:           { flex: 1, backgroundColor: "#0b0f19" },
  list:           { paddingBottom: 32 },
  headerBox:      { padding: 24, paddingBottom: 16 },
  appTitle:       { fontSize: 24, fontWeight: "800", color: "#f8fafc" },
  appSub:         { fontSize: 12, color: "#64748b", marginTop: 4 },
  actionRow:      { flexDirection: "row", paddingHorizontal: 16, gap: 12, marginBottom: 24 },
  actionCard:     { flex: 1, padding: 18, borderRadius: 16, borderWidth: 1 },
  actionCardBlue: { backgroundColor: "#0c1a2e", borderColor: "#38bdf8" },
  actionCardGreen:{ backgroundColor: "#0c1f18", borderColor: "#10b981" },
  actionIcon:     { fontSize: 28, marginBottom: 8 },
  actionTitle:    { fontSize: 16, fontWeight: "700", color: "#f8fafc", marginBottom: 6 },
  actionDesc:     { fontSize: 11, color: "#64748b", lineHeight: 16 },
  sectionHeader:  { flexDirection: "row", justifyContent: "space-between",
                    alignItems: "center", paddingHorizontal: 16, marginBottom: 10 },
  sectionTitle:   { fontSize: 16, fontWeight: "700", color: "#94a3b8" },
  refreshBtn:     { fontSize: 13, color: "#38bdf8" },
  emptyText:      { textAlign: "center", color: "#475569", marginTop: 24, fontSize: 14 },
  mapCard:        { flexDirection: "row", alignItems: "center", backgroundColor: "#131b2e",
                    marginHorizontal: 16, marginBottom: 10, borderRadius: 12, padding: 14,
                    borderWidth: 1, borderColor: "rgba(255,255,255,0.07)" },
  mapCardLeft:    { marginRight: 12 },
  mapIcon:        { fontSize: 28 },
  mapInfo:        { flex: 1 },
  mapName:        { fontSize: 15, fontWeight: "700", color: "#f8fafc", marginBottom: 3 },
  mapMeta:        { fontSize: 12, color: "#64748b" },
  mapDate:        { fontSize: 11, color: "#475569", marginTop: 2 },
  navBtn:         { backgroundColor: "#38bdf8", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  navBtnText:     { color: "#000", fontWeight: "700", fontSize: 12 },
  modalOverlay:   { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalBox:       { backgroundColor: "#131b2e", borderTopLeftRadius: 24, borderTopRightRadius: 24,
                    padding: 28, paddingBottom: 48 },
  modalTitle:     { fontSize: 20, fontWeight: "800", color: "#f8fafc", marginBottom: 20, textAlign: "center" },
  codeInput:      { backgroundColor: "#1e293b", borderRadius: 12, padding: 16,
                    fontSize: 24, fontWeight: "700", color: "#38bdf8", textAlign: "center",
                    letterSpacing: 8, marginBottom: 20, borderWidth: 1, borderColor: "#38bdf8" },
  modalBtn:       { backgroundColor: "#38bdf8", borderRadius: 12, padding: 16,
                    alignItems: "center", marginBottom: 12 },
  modalBtnText:   { fontWeight: "800", fontSize: 16, color: "#000" },
  cancelText:     { textAlign: "center", color: "#64748b", fontSize: 14, padding: 8 },
});
