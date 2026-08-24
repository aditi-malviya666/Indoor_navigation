/**
 * NavigationScreen — Live 2D map, blue dot tracking, A* routing, re-localization.
 */
import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  Modal, FlatList, SafeAreaView, ActivityIndicator, Alert,
} from "react-native";
import Svg, { Line, Circle, Polyline, Text as SvgText } from "react-native-svg";
import { IndoorRouter } from "../engine/router";
import { ParticleFilter } from "../engine/particleFilter";
import { SensorEngine } from "../engine/sensorEngine";
import { downloadMap } from "../firebase/mapService";

const SVG_W = 360, SVG_H = 300, PAD = 16;

export default function NavigationScreen({ route, navigation }) {
  const { mapId, mapData: initialMapData } = route.params || {};
  const [mapData, setMapData]     = useState(initialMapData || null);
  const [loading, setLoading]     = useState(!initialMapData);
  const [currentFloor, setFloor]  = useState(1);
  const [pose, setPose]           = useState({ x:0, y:0, heading:0, confidence:100 });
  const [route_, setRoute_]       = useState(null);
  const [instruction, setInstruction] = useState(null);
  const [searchModal, setSearchModal] = useState(false);
  const [searchTerm, setSearchTerm]   = useState("");
  const [dashOffset, setDashOffset]   = useState(0);

  const routerRef = useRef(null);
  const pfRef     = useRef(null);
  const sensorRef = useRef(null);
  const animRef   = useRef(null);

  // ─── Load map ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!initialMapData && mapId) {
      downloadMap(mapId).then(m => {
        if (m) { setMapData(m.mapData); setLoading(false); }
        else   { Alert.alert("Map not found"); navigation.goBack(); }
      });
    }
  }, []);

  // ─── Init engines when map is ready ───────────────────────────────────────
  useEffect(() => {
    if (!mapData) return;
    const floor1 = mapData.floors?.[1] || mapData.floors?.[Object.keys(mapData.floors)[0]];
    const walls  = floor1?.walls || [];

    routerRef.current = new IndoorRouter(mapData);
    pfRef.current     = new ParticleFilter(walls);

    // Start sensor engine
    const engine = new SensorEngine((p) => {
      pfRef.current?.step(0.75, p.heading);
      const est = pfRef.current?.estimatedPose || p;
      setPose({ x:est.x, y:est.y, heading:est.heading, confidence:est.confidence });
      if (est.floor !== currentFloor) setFloor(est.floor);
      updateInstruction(est);
    });
    engine.start();
    sensorRef.current = engine;

    // Animate route dash
    animRef.current = setInterval(() => setDashOffset(d => d - 1), 50);

    return () => {
      engine.stop();
      clearInterval(animRef.current);
    };
  }, [mapData]);

  const updateInstruction = (est) => {
    if (!route_?.instructions?.length) return;
    const instr = route_.instructions[0];
    setInstruction(instr);
  };

  // ─── Map coordinate helpers ────────────────────────────────────────────────
  const getTransform = useCallback(() => {
    const floor = mapData?.floors?.[currentFloor];
    if (!floor?.dimensions) return { scaleX:1, scaleY:1, offX:PAD, offY:PAD };
    const { width:W=100, height:H=100, offsetX:ox=0, offsetY:oy=0 } = floor.dimensions;
    const sc = Math.min((SVG_W-2*PAD)/W, (SVG_H-2*PAD)/H);
    return { sc, offX: PAD - ox*sc, offY: PAD - oy*sc };
  }, [mapData, currentFloor]);

  const toSX = (v, t) => ((v * t.sc + t.offX)).toFixed(1);
  const toSY = (v, t) => ((v * t.sc + t.offY)).toFixed(1);

  const navigateTo = (poi) => {
    setSearchModal(false);
    if (!routerRef.current) return;
    const r = routerRef.current.findRoute(
      { x: pose.x, y: pose.y, floor: currentFloor },
      { x: poi.x,  y: poi.y,  floor: poi.floor }
    );
    if (r) { setRoute_(r); setInstruction(r.instructions?.[0]); }
    else   Alert.alert("No route found to this location.");
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.center}>
          <ActivityIndicator color="#38bdf8" size="large"/>
          <Text style={s.loadTxt}>Loading map...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const floor = mapData?.floors?.[currentFloor];
  const t     = getTransform();
  const walls = floor?.walls || [];
  const pois  = floor?.pois  || [];
  const allPois = Object.values(mapData?.floors || {}).flatMap(f => f.pois || []);
  const filteredPois = allPois.filter(p => p.name?.toLowerCase().includes(searchTerm.toLowerCase()));

  const routePath = route_?.path?.filter(n => n.floor === currentFloor) || [];
  const routePoints = routePath.map(n => `${toSX(n.x,t)},${toSY(n.y,t)}`).join(" ");

  return (
    <SafeAreaView style={s.safe}>
      {/* Search Bar */}
      <TouchableOpacity style={s.searchBar} onPress={() => setSearchModal(true)} activeOpacity={0.8}>
        <Text style={s.searchIcon}>🔍</Text>
        <Text style={s.searchPlaceholder}>
          {instruction ? instruction.text : "Where do you want to go?"}
        </Text>
        {route_ && (
          <TouchableOpacity onPress={() => { setRoute_(null); setInstruction(null); }}>
            <Text style={s.clearBtn}>✕</Text>
          </TouchableOpacity>
        )}
      </TouchableOpacity>

      {/* SVG Map */}
      <View style={s.mapBox}>
        <Svg width={SVG_W} height={SVG_H}>
          {/* Walls */}
          {walls.map(([x1,y1,x2,y2], i) => (
            <Line key={`w${i}`} x1={toSX(x1,t)} y1={toSY(y1,t)}
                  x2={toSX(x2,t)} y2={toSY(y2,t)} stroke="#334155" strokeWidth="2.5" strokeLinecap="round"/>
          ))}
          {/* Route */}
          {routePoints.length > 0 && <>
            <Polyline points={routePoints} stroke="rgba(56,189,248,0.3)" strokeWidth="8"
                      fill="none" strokeLinecap="round"/>
            <Polyline points={routePoints} stroke="#38bdf8" strokeWidth="3"
                      fill="none" strokeLinecap="round" strokeDasharray="8,5"
                      strokeDashoffset={dashOffset}/>
          </>}
          {/* POI Pins */}
          {pois.map((p,i) => (
            <React.Fragment key={`p${i}`}>
              <Circle cx={toSX(p.x,t)} cy={toSY(p.y,t)} r="8" fill="#1e293b" stroke="#38bdf8" strokeWidth="1.5"/>
              <SvgText x={toSX(p.x,t)} y={(parseFloat(toSY(p.y,t))-12).toFixed(1)}
                       fill="#94a3b8" fontSize="7" textAnchor="middle">{p.name?.slice(0,10)}</SvgText>
            </React.Fragment>
          ))}
          {/* User Puck */}
          <Circle cx={toSX(pose.x,t)} cy={toSY(pose.y,t)} r="14" fill="rgba(56,189,248,0.15)"/>
          <Circle cx={toSX(pose.x,t)} cy={toSY(pose.y,t)} r="8"  fill="#38bdf8"/>
          <Circle cx={toSX(pose.x,t)} cy={toSY(pose.y,t)} r="8"  fill="none" stroke="#fff" strokeWidth="2"/>
        </Svg>
      </View>

      {/* Floor Switcher + Action Buttons */}
      <View style={s.sidebar}>
        {Object.keys(mapData?.floors || {}).reverse().map(f => (
          <TouchableOpacity key={f} style={[s.floorBtn, parseInt(f)===currentFloor && s.floorBtnActive]}
                            onPress={() => setFloor(parseInt(f))}>
            <Text style={[s.floorBtnTxt, parseInt(f)===currentFloor && s.floorBtnTxtActive]}>L{f}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={s.actionBtn}
          onPress={() => navigation.navigate("Relocalization", { mapId, onResult: (r) => {
            if (r) { pfRef.current?.initKnownPose(r.x, r.y, pose.heading, r.floor); setFloor(r.floor); }
          }})}>
          <Text style={s.actionBtnTxt}>📸</Text>
        </TouchableOpacity>
      </View>

      {/* Turn-by-Turn Banner */}
      {instruction && (
        <View style={s.banner}>
          <Text style={s.bannerIcon}>{instruction.icon}</Text>
          <View style={s.bannerInfo}>
            <Text style={s.bannerText}>{instruction.text}</Text>
            {route_ && <Text style={s.bannerMeta}>{route_.totalDistanceMeters}m · ~{Math.ceil(route_.estimatedTimeSeconds/60)} min</Text>}
          </View>
          <View style={[s.confBadge, pose.confidence>75 ? s.confHigh : pose.confidence>45 ? s.confMed : s.confLow]}>
            <Text style={s.confTxt}>{pose.confidence}%</Text>
          </View>
        </View>
      )}

      {/* POI Search Modal */}
      <Modal visible={searchModal} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <View style={s.modalHandle}/>
            <TextInput style={s.searchInput} value={searchTerm} onChangeText={setSearchTerm}
                       placeholder="Search rooms, labs..." placeholderTextColor="#475569"
                       autoFocus/>
            <FlatList
              data={filteredPois}
              keyExtractor={(p,i) => `${p.id||i}`}
              renderItem={({ item }) => (
                <TouchableOpacity style={s.poiCard} onPress={() => navigateTo(item)}>
                  <Text style={s.poiIcon}>{item.icon || "📍"}</Text>
                  <View style={s.poiInfo}>
                    <Text style={s.poiName}>{item.name}</Text>
                    <Text style={s.poiDesc}>{item.desc || item.category}</Text>
                  </View>
                  <Text style={s.poiFloor}>Floor {item.floor}</Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={<Text style={s.emptyTxt}>No results</Text>}
            />
            <TouchableOpacity style={s.closeModal} onPress={() => setSearchModal(false)}>
              <Text style={s.closeModalTxt}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:         { flex:1, backgroundColor:"#0b0f19" },
  center:       { flex:1, justifyContent:"center", alignItems:"center" },
  loadTxt:      { color:"#64748b", marginTop:14, fontSize:14 },
  searchBar:    { flexDirection:"row", alignItems:"center", margin:12,
                  backgroundColor:"#131b2e", borderRadius:14, padding:14,
                  borderWidth:1, borderColor:"rgba(255,255,255,0.07)" },
  searchIcon:   { fontSize:18, marginRight:10 },
  searchPlaceholder: { flex:1, color:"#64748b", fontSize:14 },
  clearBtn:     { color:"#64748b", fontSize:18, padding:4 },
  mapBox:       { alignSelf:"center", backgroundColor:"#0f172a", borderRadius:16, overflow:"hidden",
                  borderWidth:1, borderColor:"rgba(255,255,255,0.06)" },
  sidebar:      { position:"absolute", right:12, top:80, gap:8 },
  floorBtn:     { width:40, height:40, borderRadius:10, backgroundColor:"#131b2e",
                  alignItems:"center", justifyContent:"center",
                  borderWidth:1, borderColor:"rgba(255,255,255,0.08)" },
  floorBtnActive:{ backgroundColor:"#38bdf8" },
  floorBtnTxt:  { color:"#64748b", fontWeight:"700", fontSize:12 },
  floorBtnTxtActive:{ color:"#000" },
  actionBtn:    { width:40, height:40, borderRadius:10, backgroundColor:"#131b2e",
                  alignItems:"center", justifyContent:"center",
                  borderWidth:1, borderColor:"rgba(255,255,255,0.08)", marginTop:4 },
  actionBtnTxt: { fontSize:20 },
  banner:       { margin:12, backgroundColor:"#131b2e", borderRadius:14, padding:14,
                  flexDirection:"row", alignItems:"center",
                  borderWidth:1, borderColor:"rgba(56,189,248,0.3)" },
  bannerIcon:   { fontSize:26, marginRight:12 },
  bannerInfo:   { flex:1 },
  bannerText:   { color:"#f8fafc", fontWeight:"700", fontSize:14 },
  bannerMeta:   { color:"#64748b", fontSize:11, marginTop:2 },
  confBadge:    { paddingHorizontal:8, paddingVertical:4, borderRadius:8 },
  confHigh:     { backgroundColor:"rgba(16,185,129,0.2)" },
  confMed:      { backgroundColor:"rgba(245,158,11,0.2)" },
  confLow:      { backgroundColor:"rgba(244,63,94,0.2)" },
  confTxt:      { color:"#f8fafc", fontWeight:"700", fontSize:11 },
  modalOverlay: { flex:1, backgroundColor:"rgba(0,0,0,0.7)", justifyContent:"flex-end" },
  modalBox:     { backgroundColor:"#131b2e", borderTopLeftRadius:24, borderTopRightRadius:24,
                  padding:16, maxHeight:"75%", paddingBottom:32 },
  modalHandle:  { width:40, height:5, backgroundColor:"rgba(255,255,255,0.15)",
                  borderRadius:3, alignSelf:"center", marginBottom:12 },
  searchInput:  { backgroundColor:"#1e293b", borderRadius:12, padding:12, color:"#f8fafc",
                  fontSize:14, marginBottom:10, borderWidth:1, borderColor:"rgba(255,255,255,0.07)" },
  poiCard:      { flexDirection:"row", alignItems:"center", padding:12, backgroundColor:"#1e293b",
                  borderRadius:10, marginBottom:8 },
  poiIcon:      { fontSize:22, width:36, textAlign:"center" },
  poiInfo:      { flex:1, marginLeft:10 },
  poiName:      { color:"#f8fafc", fontWeight:"700", fontSize:14 },
  poiDesc:      { color:"#64748b", fontSize:11, marginTop:2 },
  poiFloor:     { color:"#38bdf8", fontSize:11, fontWeight:"700" },
  emptyTxt:     { color:"#475569", textAlign:"center", padding:20 },
  closeModal:   { backgroundColor:"#1e293b", borderRadius:12, padding:14, alignItems:"center", marginTop:8 },
  closeModalTxt:{ color:"#94a3b8", fontWeight:"700" },
});
