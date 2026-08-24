/**
 * RecordingScreen — Live walk recording with GPS+IMU tracking,
 * real-time trail drawing, and instant label pinning.
 */
import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, Modal,
  TextInput, Alert, SafeAreaView, ScrollView, Platform,
} from "react-native";
import * as Location from "expo-location";
import Svg, { Polyline, Circle, Text as SvgText, Line } from "react-native-svg";
import { SensorEngine } from "../engine/sensorEngine";

const CATEGORIES = ["Room","Lab","Office","Washroom","Stairs","Elevator","Exit","Library","Cafeteria","Lecture Hall","Other"];
const CAT_ICONS  = { Room:"🚪",Lab:"🔬",Office:"💼",Washroom:"🚻",Stairs:"🪜",
                     Elevator:"🛗",Exit:"🚪",Library:"📚",Cafeteria:"☕",
                     "Lecture Hall":"📖",Other:"📍" };

// Haversine
function haversine(lat1,lng1,lat2,lng2) {
  const R=6371000, dLat=(lat2-lat1)*Math.PI/180, dLng=(lng2-lng1)*Math.PI/180;
  const a=Math.sin(dLat/2)**2+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}
function gpsToXY(lat,lng,aLat,aLng) {
  const x=haversine(aLat,aLng,aLat,lng)*(lng>aLng?1:-1);
  const y=haversine(aLat,aLng,lat,aLng)*(lat>aLat?1:-1);
  return {x,y};
}

export default function RecordingScreen({ navigation }) {
  const [trajectory, setTrajectory]   = useState([]);
  const [labels, setLabels]           = useState([]);
  const [currentPos, setCurrentPos]   = useState({ x:0, y:0 });
  const [currentFloor, setCurrentFloor] = useState(1);
  const [elapsed, setElapsed]         = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [labelModal, setLabelModal]   = useState(false);
  const [labelName, setLabelName]     = useState("");
  const [labelCat, setLabelCat]       = useState("Room");

  const sensorRef   = useRef(null);
  const anchorRef   = useRef(null);
  const timerRef    = useRef(null);
  const keyframesRef= useRef([]);
  const lastKFPos   = useRef({ x:0, y:0 });

  // ─── Start recording on mount ─────────────────────────────────────────────
  useEffect(() => {
    startRecording();
    return () => stopSensors();
  }, []);

  const startRecording = async () => {
    setIsRecording(true);
    // Elapsed timer
    timerRef.current = setInterval(() => setElapsed(e => e+1), 1000);

    const engine = new SensorEngine((pose) => {
      setCurrentPos({ x: pose.x, y: pose.y });
      setCurrentFloor(pose.floor);
      setTrajectory(prev => {
        const last = prev[prev.length-1];
        if (last && Math.hypot(pose.x-last.x, pose.y-last.y) < 0.3) return prev;
        const newPt = { x:pose.x, y:pose.y, floor:pose.floor,
                        heading:pose.heading, timestamp:Date.now() };
        // Keyframe every 3m
        const kfDist = Math.hypot(pose.x-lastKFPos.current.x, pose.y-lastKFPos.current.y);
        if (kfDist >= 3) {
          lastKFPos.current = { x:pose.x, y:pose.y };
          keyframesRef.current.push({ x:pose.x, y:pose.y, floor:pose.floor, uri:null });
        }
        return [...prev, newPt];
      });
    });

    // Get first GPS fix for anchor (with safe fallback for indoor start)
    try {
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      anchorRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      engine.setInitialAnchor(anchorRef.current.lat, anchorRef.current.lng, 0, 0, 1);
    } catch (e) {
      console.warn("Indoor GPS fix fallback:", e);
      anchorRef.current = { lat: 0, lng: 0 };
      engine.setInitialAnchor(0, 0, 0, 0, 1);
    }
    await engine.start();
    sensorRef.current = engine;
  };

  const stopSensors = () => {
    sensorRef.current?.stop();
    clearInterval(timerRef.current);
  };

  const handleStop = () => {
    Alert.alert("Stop Recording?", "Generate the map from this walk?", [
      { text: "Cancel", style: "cancel" },
      { text: "Yes, Generate Map", onPress: () => {
        stopSensors();
        setIsRecording(false);
        const floors = [...new Set(trajectory.map(p => p.floor))];
        navigation.replace("MapGeneration", {
          trajectory, labels,
          floors: floors.length ? floors : [1],
          keyframes: keyframesRef.current,
        });
      }},
    ]);
  };

  const saveLabel = () => {
    if (!labelName.trim()) { Alert.alert("Name required"); return; }
    const newLabel = {
      name: labelName.trim(),
      category: labelCat.toLowerCase(),
      icon: CAT_ICONS[labelCat] || "📍",
      x: currentPos.x, y: currentPos.y,
      floor: currentFloor,
      timestamp: Date.now(),
    };
    setLabels(prev => [...prev, newLabel]);
    setLabelName(""); setLabelCat("Room"); setLabelModal(false);
  };

  // ─── SVG map calculation ──────────────────────────────────────────────────
  const svgW = 340, svgH = 260, pad = 20;
  const floorPts = trajectory.filter(p => p.floor === currentFloor);
  let scaleX = 1, scaleY = 1, offX = 0, offY = 0;
  if (floorPts.length > 1) {
    const xs = floorPts.map(p=>p.x), ys = floorPts.map(p=>p.y);
    const [minX,maxX,minY,maxY] = [Math.min(...xs),Math.max(...xs),Math.min(...ys),Math.max(...ys)];
    const rangeX = maxX-minX||1, rangeY = maxY-minY||1;
    scaleX = (svgW-2*pad)/rangeX; scaleY = (svgH-2*pad)/rangeY;
    const sc = Math.min(scaleX,scaleY);
    scaleX=sc; scaleY=sc;
    offX = pad - minX*sc + ((svgW-2*pad) - rangeX*sc)/2;
    offY = pad - minY*sc + ((svgH-2*pad) - rangeY*sc)/2;
  }
  const toSvgX = v => (v*scaleX + offX).toFixed(1);
  const toSvgY = v => (v*scaleY + offY).toFixed(1);

  const polylinePoints = floorPts.map(p => `${toSvgX(p.x)},${toSvgY(p.y)}`).join(" ");
  const floorLabels = labels.filter(l => l.floor === currentFloor);

  const fmtTime = s => `${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;

  return (
    <SafeAreaView style={s.safe}>
      {/* Top Bar */}
      <View style={s.topBar}>
        <View style={s.recRow}>
          <View style={[s.recDot, !isRecording && { opacity:0 }]} />
          <Text style={s.recLabel}>{isRecording ? "REC" : "STOPPED"}</Text>
          <Text style={s.timeLabel}>{fmtTime(elapsed)}</Text>
        </View>
        <View style={s.floorBadge}>
          <Text style={s.floorText}>Floor {currentFloor}</Text>
        </View>
        <Text style={s.kfCount}>📸 {keyframesRef.current.length}</Text>
      </View>

      {/* Live SVG Trail Map */}
      <View style={s.mapBox}>
        <Svg width={svgW} height={svgH} style={s.svg}>
          <Line x1="0" y1="0" x2={svgW} y2="0" stroke="#1e293b" strokeWidth="1"/>
          {polylinePoints.length > 0 && (
            <Polyline points={polylinePoints} stroke="#38bdf8" strokeWidth="2.5"
                      fill="none" strokeLinecap="round" strokeLinejoin="round"/>
          )}
          {/* Labels */}
          {floorLabels.map((l,i) => (
            <React.Fragment key={i}>
              <Circle cx={toSvgX(l.x)} cy={toSvgY(l.y)} r="7" fill="#6366f1"/>
              <SvgText x={toSvgX(l.x)} y={(parseFloat(toSvgY(l.y))-10).toFixed(1)}
                       fill="#fff" fontSize="7" textAnchor="middle">{l.name.slice(0,12)}</SvgText>
            </React.Fragment>
          ))}
          {/* Current position dot */}
          {floorPts.length > 0 && (
            <Circle cx={toSvgX(currentPos.x)} cy={toSvgY(currentPos.y)} r="7" fill="#38bdf8"/>
          )}
        </Svg>
        <Text style={s.mapHint}>Live trail • {floorPts.length} points on Floor {currentFloor}</Text>
      </View>

      {/* Controls */}
      <View style={s.controls}>
        {/* Floor adjustment */}
        <View style={s.floorRow}>
          <TouchableOpacity style={s.floorBtn} onPress={() => {
            setCurrentFloor(f => Math.max(1,f-1));
            sensorRef.current && (sensorRef.current.floor = Math.max(1, currentFloor-1));
          }}>
            <Text style={s.floorBtnTxt}>⬇ Down</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.floorBtn} onPress={() => {
            setCurrentFloor(f => f+1);
            sensorRef.current && (sensorRef.current.floor = currentFloor+1);
          }}>
            <Text style={s.floorBtnTxt}>⬆ Up</Text>
          </TouchableOpacity>
        </View>

        {/* Add Label */}
        <TouchableOpacity style={s.addLabelBtn} onPress={() => setLabelModal(true)}>
          <Text style={s.addLabelTxt}>+ Add Place Name</Text>
        </TouchableOpacity>

        {/* Stop */}
        <TouchableOpacity style={s.stopBtn} onPress={handleStop}>
          <Text style={s.stopTxt}>■  Stop & Generate Map</Text>
        </TouchableOpacity>
      </View>

      {/* Label Modal */}
      <Modal visible={labelModal} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <Text style={s.modalTitle}>📍 Add Place</Text>
            <TextInput style={s.input} value={labelName} onChangeText={setLabelName}
                       placeholder="Place name (e.g. Lab 204)" placeholderTextColor="#475569"
                       autoFocus returnKeyType="done"/>
            <Text style={s.catLabel}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.catScroll}>
              {CATEGORIES.map(c => (
                <TouchableOpacity key={c} style={[s.catChip, labelCat===c && s.catChipActive]}
                                  onPress={() => setLabelCat(c)}>
                  <Text style={[s.catChipTxt, labelCat===c && s.catChipTxtActive]}>
                    {CAT_ICONS[c]} {c}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <View style={s.modalBtns}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setLabelModal(false)}>
                <Text style={s.cancelTxt}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.saveBtn} onPress={saveLabel}>
                <Text style={s.saveTxt}>✔ Save Pin</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:         { flex:1, backgroundColor:"#0b0f19" },
  topBar:       { flexDirection:"row", alignItems:"center", padding:14, paddingTop:8,
                  backgroundColor:"#131b2e", borderBottomWidth:1,
                  borderBottomColor:"rgba(255,255,255,0.07)" },
  recRow:       { flexDirection:"row", alignItems:"center", flex:1 },
  recDot:       { width:10, height:10, borderRadius:5, backgroundColor:"#f43f5e", marginRight:6 },
  recLabel:     { color:"#f43f5e", fontWeight:"800", fontSize:13, marginRight:12 },
  timeLabel:    { color:"#94a3b8", fontSize:14, fontWeight:"600" },
  floorBadge:   { backgroundColor:"#1e293b", paddingHorizontal:12, paddingVertical:5,
                  borderRadius:10, marginHorizontal:8 },
  floorText:    { color:"#38bdf8", fontWeight:"700", fontSize:12 },
  kfCount:      { color:"#64748b", fontSize:12 },
  mapBox:       { flex:1, alignItems:"center", justifyContent:"center",
                  backgroundColor:"#0f172a", margin:10, borderRadius:16,
                  borderWidth:1, borderColor:"rgba(255,255,255,0.07)" },
  svg:          { borderRadius:12 },
  mapHint:      { color:"#475569", fontSize:10, marginTop:6 },
  controls:     { padding:14, gap:10 },
  floorRow:     { flexDirection:"row", gap:10 },
  floorBtn:     { flex:1, backgroundColor:"#1e293b", borderRadius:10, padding:12,
                  alignItems:"center", borderWidth:1, borderColor:"rgba(255,255,255,0.1)" },
  floorBtnTxt:  { color:"#94a3b8", fontWeight:"700" },
  addLabelBtn:  { backgroundColor:"#6366f1", borderRadius:12, padding:16, alignItems:"center" },
  addLabelTxt:  { color:"#fff", fontWeight:"800", fontSize:16 },
  stopBtn:      { backgroundColor:"#1e293b", borderRadius:12, padding:16, alignItems:"center",
                  borderWidth:1, borderColor:"#f43f5e" },
  stopTxt:      { color:"#f43f5e", fontWeight:"800", fontSize:15 },
  modalOverlay: { flex:1, backgroundColor:"rgba(0,0,0,0.75)", justifyContent:"flex-end" },
  modalBox:     { backgroundColor:"#131b2e", borderTopLeftRadius:24, borderTopRightRadius:24,
                  padding:24, paddingBottom:40 },
  modalTitle:   { fontSize:20, fontWeight:"800", color:"#f8fafc", marginBottom:16 },
  input:        { backgroundColor:"#1e293b", borderRadius:12, padding:14, color:"#f8fafc",
                  fontSize:15, borderWidth:1, borderColor:"rgba(255,255,255,0.1)", marginBottom:14 },
  catLabel:     { color:"#64748b", fontSize:12, fontWeight:"700", marginBottom:8, textTransform:"uppercase" },
  catScroll:    { marginBottom:20 },
  catChip:      { backgroundColor:"#1e293b", borderRadius:20, paddingHorizontal:12,
                  paddingVertical:7, marginRight:8, borderWidth:1, borderColor:"rgba(255,255,255,0.08)" },
  catChipActive:{ backgroundColor:"#6366f1", borderColor:"#6366f1" },
  catChipTxt:   { color:"#64748b", fontSize:12, fontWeight:"600" },
  catChipTxtActive:{ color:"#fff" },
  modalBtns:    { flexDirection:"row", gap:12 },
  cancelBtn:    { flex:1, backgroundColor:"#1e293b", borderRadius:12, padding:14, alignItems:"center" },
  cancelTxt:    { color:"#64748b", fontWeight:"700" },
  saveBtn:      { flex:1, backgroundColor:"#6366f1", borderRadius:12, padding:14, alignItems:"center" },
  saveTxt:      { color:"#fff", fontWeight:"800" },
});
