/**
 * Firebase Map Service (Firestore Only — 100% Free Plan Compatible)
 */
import { db } from "./config";
import {
  collection, doc, setDoc, getDoc, getDocs, addDoc,
  query, where, orderBy, serverTimestamp,
} from "firebase/firestore";

const MAPS_COL = "maps";

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function uploadMap(mapId, mapData, geojson, thumbnailSvg, metadata = {}) {
  try {
    const code = generateCode();
    await setDoc(doc(db, MAPS_COL, mapId), {
      mapId, code,
      name: metadata.name || "Unnamed Building",
      building: metadata.building || "",
      creatorNote: metadata.note || "",
      floorCount: Object.keys(mapData.floors || {}).length,
      poiCount: Object.values(mapData.floors || {}).reduce((s, f) => s + (f.pois?.length || 0), 0),
      mapData: JSON.stringify(mapData),
      geojson: JSON.stringify(geojson),
      thumbnailSvg: thumbnailSvg || "",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return { mapId, code };
  } catch (err) {
    console.error("uploadMap error:", err);
    throw err;
  }
}

export async function downloadMap(mapId) {
  try {
    const snap = await getDoc(doc(db, MAPS_COL, mapId));
    if (!snap.exists()) return null;
    const data = snap.data();
    return {
      ...data,
      mapData: JSON.parse(data.mapData || "{}"),
      geojson: JSON.parse(data.geojson || "{}"),
    };
  } catch (err) {
    console.error("downloadMap error:", err);
    return null;
  }
}

export async function listMaps() {
  try {
    const snap = await getDocs(
      query(collection(db, MAPS_COL), orderBy("createdAt", "desc"))
    );
    return snap.docs.map(d => {
      const data = d.data();
      return {
        mapId: data.mapId,
        name: data.name,
        building: data.building,
        floorCount: data.floorCount,
        poiCount: data.poiCount,
        code: data.code,
        createdAt: data.createdAt?.toDate?.() ?? new Date(),
        thumbnailSvg: data.thumbnailSvg,
      };
    });
  } catch (err) {
    console.error("listMaps error:", err);
    return [];
  }
}

export async function joinMapByCode(code) {
  try {
    const snap = await getDocs(
      query(collection(db, MAPS_COL), where("code", "==", code.toString()))
    );
    if (snap.empty) return null;
    const data = snap.docs[0].data();
    return {
      ...data,
      mapData: JSON.parse(data.mapData || "{}"),
      geojson: JSON.parse(data.geojson || "{}"),
    };
  } catch (err) {
    console.error("joinMapByCode error:", err);
    return null;
  }
}

export async function getKeyframes(mapId) {
  try {
    const snap = await getDocs(collection(db, `${MAPS_COL}/${mapId}/frames`));
    return snap.docs.map(d => d.data());
  } catch (err) {
    console.error("getKeyframes error:", err);
    return [];
  }
}
