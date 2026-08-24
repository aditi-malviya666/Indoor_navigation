/**
 * MapGenerationScreen — Animated map processing pipeline + cloud upload.
 */
import React, { useEffect, useRef, useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity,
  TextInput, Alert, SafeAreaView, ActivityIndicator,
} from "react-native";
import { MapGenerator } from "../creator/MapGenerator";
import { uploadMap } from "../firebase/mapService";
import { Relocalization } from "../engine/relocalization";

const STEPS = [
  "Fusing GPS + step trajectory...",
  "Extracting corridor skeleton...",
  "Building navigation graph...",
  "Indexing frames for re-localization...",
  "Uploading map to cloud...",
  "Map is Live! 🎉",
];

function uuid() {
  return `map_${Date.now()}_${Math.floor(Math.random()*1e6)}`;
}

export default function MapGenerationScreen({ route, navigation }) {
  const { trajectory, labels, floors, keyframes = [] } = route.params;
  const [step, setStep]           = useState(0);
  const [done, setDone]           = useState(false);
  const [buildingName, setBuildingName] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [resultCode, setResultCode]  = useState(null);
  const [mapId]   = useState(uuid);
  const mapResult = useRef(null);

  useEffect(() => {
    runPipeline();
  }, []);

  const runPipeline = async () => {
    // Step 1 & 2 — Generate map from trajectory
    setStep(0);
    await delay(600);
    const gen = new MapGenerator(trajectory, labels, floors);
    setStep(1);
    await delay(400);
    const result = gen.generate();
    mapResult.current = result;

    // Step 3 — Nav graph is built inside generate()
    setStep(2);
    await delay(400);

    // Step 4 — Index keyframes
    setStep(3);
    const reloc = new Relocalization(mapId);
    for (const kf of keyframes) {
      if (kf.uri) {
        await reloc.indexFrame(kf.uri, kf.x, kf.y, kf.floor);
      }
    }
    await delay(300);

    // Step 5 — Upload map
    setStep(4);
    const { code } = await uploadMap(
      mapId,
      result.mapData,
      result.geojson,
      result.thumbnail,
      { name: buildingName || "My Building", building: buildingName }
    );
    setResultCode(code);

    // Done
    setStep(5);
    setDone(true);
  };

  const delay = ms => new Promise(r => setTimeout(r, ms));

  const handlePublish = async () => {
    if (!buildingName.trim()) { Alert.alert("Enter building name first"); return; }
    setPublishing(true);
    try {
      await uploadMap(mapId, mapResult.current.mapData, mapResult.current.geojson,
                      mapResult.current.thumbnail, { name: buildingName, building: buildingName });
      navigation.replace("Navigation", { mapId, mapData: mapResult.current.mapData });
    } catch {
      Alert.alert("Upload failed. Check your Firebase config.");
    }
    setPublishing(false);
  };

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.container}>
        <Text style={s.title}>Generating Map</Text>
        <Text style={s.sub}>{trajectory.length} points · {labels.length} labels · {floors.length} floor(s)</Text>

        {/* Step List */}
        <View style={s.stepList}>
          {STEPS.map((txt, i) => {
            const state = i < step ? "done" : i === step ? "active" : "pending";
            return (
              <View key={i} style={s.stepRow}>
                <View style={[s.stepDot, state==="done"&&s.dotDone, state==="active"&&s.dotActive]}>
                  {state==="done" && <Text style={s.checkMark}>✓</Text>}
                  {state==="active" && <ActivityIndicator size="small" color="#fff" style={{transform:[{scale:0.65}]}}/>}
                </View>
                <Text style={[s.stepTxt, state==="done"&&s.stepDone, state==="active"&&s.stepActive]}>
                  {txt}
                </Text>
              </View>
            );
          })}
        </View>

        {/* Done state */}
        {done && (
          <View style={s.doneBox}>
            <TextInput
              style={s.input}
              value={buildingName}
              onChangeText={setBuildingName}
              placeholder="Enter building name (e.g. Block A)"
              placeholderTextColor="#475569"
            />
            {resultCode && (
              <View style={s.codeBox}>
                <Text style={s.codeLabel}>Sharing Code</Text>
                <Text style={s.codeValue}>{resultCode}</Text>
                <Text style={s.codeHint}>Share this code with others to use your map</Text>
              </View>
            )}
            <TouchableOpacity style={s.navBtn} disabled={publishing}
              onPress={() => navigation.replace("Navigation", { mapId, mapData: mapResult.current?.mapData })}>
              {publishing
                ? <ActivityIndicator color="#000"/>
                : <Text style={s.navBtnTxt}>Start Navigating →</Text>}
            </TouchableOpacity>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:      { flex:1, backgroundColor:"#0b0f19" },
  container: { flex:1, padding:24 },
  title:     { fontSize:24, fontWeight:"800", color:"#f8fafc", marginBottom:6 },
  sub:       { fontSize:12, color:"#64748b", marginBottom:32 },
  stepList:  { gap:14 },
  stepRow:   { flexDirection:"row", alignItems:"center", gap:14 },
  stepDot:   { width:28, height:28, borderRadius:14, backgroundColor:"#1e293b",
               alignItems:"center", justifyContent:"center" },
  dotDone:   { backgroundColor:"#10b981" },
  dotActive: { backgroundColor:"#38bdf8" },
  checkMark: { color:"#fff", fontWeight:"800", fontSize:14 },
  stepTxt:   { fontSize:14, color:"#475569", flex:1 },
  stepDone:  { color:"#94a3b8" },
  stepActive:{ color:"#f8fafc", fontWeight:"700" },
  doneBox:   { marginTop:36, gap:14 },
  input:     { backgroundColor:"#131b2e", borderRadius:12, padding:16,
               color:"#f8fafc", fontSize:15, borderWidth:1, borderColor:"rgba(255,255,255,0.1)" },
  codeBox:   { backgroundColor:"#131b2e", borderRadius:14, padding:20,
               alignItems:"center", borderWidth:1, borderColor:"#38bdf8" },
  codeLabel: { color:"#64748b", fontSize:12, fontWeight:"700", textTransform:"uppercase",
               letterSpacing:1, marginBottom:8 },
  codeValue: { fontSize:36, fontWeight:"900", color:"#38bdf8", letterSpacing:8 },
  codeHint:  { color:"#475569", fontSize:11, marginTop:8, textAlign:"center" },
  navBtn:    { backgroundColor:"#38bdf8", borderRadius:14, padding:18, alignItems:"center" },
  navBtnTxt: { color:"#000", fontWeight:"800", fontSize:16 },
});
