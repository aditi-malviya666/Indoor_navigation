/**
 * RelocalizationScreen — Take or upload a photo to re-snap position on map.
 */
import React, { useRef, useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, Image,
  ActivityIndicator, Alert, SafeAreaView,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Relocalization } from "../engine/relocalization";

export default function RelocalizationScreen({ route, navigation }) {
  const { mapId, onResult } = route.params || {};
  const [imageUri, setImageUri]   = useState(null);
  const [matching, setMatching]   = useState(false);
  const [result, setResult]       = useState(null);
  const relocRef = useRef(new Relocalization(mapId));

  const pickImage = async (fromCamera) => {
    let img;
    const opts = { mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.6, allowsEditing: false };
    if (fromCamera) {
      img = await ImagePicker.launchCameraAsync(opts);
    } else {
      img = await ImagePicker.launchImageLibraryAsync(opts);
    }
    if (img.canceled || !img.assets?.[0]?.uri) return;
    const uri = img.assets[0].uri;
    setImageUri(uri);
    setResult(null);
    runMatch(uri);
  };

  const runMatch = async (uri) => {
    setMatching(true);
    try {
      const match = await relocRef.current.findLocation(uri);
      if (match) {
        setResult(match);
      } else {
        Alert.alert("No Match", "Could not identify location from this photo. Try another angle or a clearer view of the corridor.");
      }
    } catch (err) {
      Alert.alert("Error", "Matching failed. Please try again.");
    }
    setMatching(false);
  };

  const confirmSnap = () => {
    if (result && onResult) onResult(result);
    navigation.goBack();
  };

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.container}>
        <Text style={s.title}>📸 Re-Locate Me</Text>
        <Text style={s.sub}>Point camera at a corridor, sign, door, or any distinctive area</Text>

        {/* Photo Preview */}
        <View style={s.photoBox}>
          {imageUri
            ? <Image source={{ uri: imageUri }} style={s.photo} resizeMode="cover"/>
            : <View style={s.photoPlaceholder}>
                <Text style={s.photoPlaceholderIcon}>📷</Text>
                <Text style={s.photoPlaceholderTxt}>Take or upload a photo</Text>
              </View>
          }
          {matching && (
            <View style={s.matchingOverlay}>
              <ActivityIndicator color="#38bdf8" size="large"/>
              <Text style={s.matchingTxt}>Matching against saved frames...</Text>
            </View>
          )}
        </View>

        {/* Result */}
        {result && !matching && (
          <View style={s.resultBox}>
            <Text style={s.resultIcon}>✅</Text>
            <View style={s.resultInfo}>
              <Text style={s.resultTitle}>Location Found!</Text>
              <Text style={s.resultDetail}>Floor {result.floor} · Confidence {result.confidence}%</Text>
            </View>
          </View>
        )}

        {/* Buttons */}
        <View style={s.btnRow}>
          <TouchableOpacity style={[s.btn, s.btnCamera]} onPress={() => pickImage(true)}>
            <Text style={s.btnTxt}>📷 Take Photo</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.btn, s.btnGallery]} onPress={() => pickImage(false)}>
            <Text style={s.btnTxt}>📁 Gallery</Text>
          </TouchableOpacity>
        </View>

        {result && (
          <TouchableOpacity style={s.snapBtn} onPress={confirmSnap}>
            <Text style={s.snapBtnTxt}>Snap to This Location →</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={s.cancelBtn} onPress={() => navigation.goBack()}>
          <Text style={s.cancelTxt}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:             { flex:1, backgroundColor:"#0b0f19" },
  container:        { flex:1, padding:24 },
  title:            { fontSize:24, fontWeight:"800", color:"#f8fafc", marginBottom:6 },
  sub:              { fontSize:13, color:"#64748b", marginBottom:24, lineHeight:19 },
  photoBox:         { height:240, backgroundColor:"#131b2e", borderRadius:16, overflow:"hidden",
                      borderWidth:1, borderColor:"rgba(255,255,255,0.07)", marginBottom:20,
                      justifyContent:"center", alignItems:"center" },
  photo:            { width:"100%", height:"100%" },
  photoPlaceholder: { alignItems:"center", gap:10 },
  photoPlaceholderIcon:{ fontSize:44 },
  photoPlaceholderTxt: { color:"#475569", fontSize:14 },
  matchingOverlay:  { ...StyleSheet.absoluteFillObject, backgroundColor:"rgba(0,0,0,0.7)",
                      justifyContent:"center", alignItems:"center", gap:14 },
  matchingTxt:      { color:"#94a3b8", fontSize:13 },
  resultBox:        { flexDirection:"row", alignItems:"center", backgroundColor:"rgba(16,185,129,0.15)",
                      borderRadius:12, padding:14, marginBottom:20, borderWidth:1, borderColor:"#10b981" },
  resultIcon:       { fontSize:28, marginRight:12 },
  resultInfo:       { flex:1 },
  resultTitle:      { color:"#34d399", fontWeight:"800", fontSize:15 },
  resultDetail:     { color:"#64748b", fontSize:12, marginTop:2 },
  btnRow:           { flexDirection:"row", gap:12, marginBottom:12 },
  btn:              { flex:1, padding:16, borderRadius:12, alignItems:"center" },
  btnCamera:        { backgroundColor:"#38bdf8" },
  btnGallery:       { backgroundColor:"#1e293b", borderWidth:1, borderColor:"rgba(255,255,255,0.1)" },
  btnTxt:           { color:"#000", fontWeight:"700", fontSize:14 },
  snapBtn:          { backgroundColor:"#10b981", borderRadius:12, padding:16,
                      alignItems:"center", marginBottom:12 },
  snapBtnTxt:       { color:"#fff", fontWeight:"800", fontSize:15 },
  cancelBtn:        { padding:12, alignItems:"center" },
  cancelTxt:        { color:"#475569", fontSize:14 },
});
