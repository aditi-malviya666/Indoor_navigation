/**
 * Visual Re-Localization Engine (Firestore-Only / Free Tier Compatible)
 * Stores keyframes and feature vectors directly in Firestore.
 */
import * as FileSystem from "expo-file-system";
import { collection, addDoc, getDocs } from "firebase/firestore";
import { db } from "../firebase/config";

export class Relocalization {
  constructor(mapId) {
    this.mapId = mapId;
    this.cachedFrames = null;
  }

  // Called during recording: save a keyframe with its position & thumbnail directly to Firestore
  async indexFrame(imageUri, x, y, floor) {
    try {
      const frameId = `frame_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
      const imgData = await FileSystem.readAsStringAsync(imageUri, { encoding: "base64" });
      
      // Compute lightweight feature vector (96 values)
      const features = this._computeFeatures(imgData);

      // Save keyframe features + compact base64 preview directly to Firestore
      // (keeps it 100% free on Firebase Spark plan with no Cloud Storage required)
      await addDoc(collection(db, `maps/${this.mapId}/frames`), {
        frameId,
        x,
        y,
        floor,
        features: Array.from(features),
        timestamp: Date.now(),
      });
      this.cachedFrames = null;
    } catch (err) {
      console.warn("indexFrame error:", err);
    }
  }

  // Called during navigation: find location from photo
  async findLocation(imageUri) {
    try {
      const imgData = await FileSystem.readAsStringAsync(imageUri, { encoding: "base64" });
      const queryFeatures = this._computeFeatures(imgData);

      // Load all frames (cached for speed)
      if (!this.cachedFrames) {
        const snap = await getDocs(collection(db, `maps/${this.mapId}/frames`));
        this.cachedFrames = snap.docs.map(d => d.data());
      }

      if (!this.cachedFrames || !this.cachedFrames.length) return null;

      // Find best matching frame by cosine similarity
      let bestMatch = null, bestScore = -1;
      for (const frame of this.cachedFrames) {
        if (!frame.features) continue;
        const score = this._cosineSimilarity(queryFeatures, new Float32Array(frame.features));
        if (score > bestScore) {
          bestScore = score;
          bestMatch = frame;
        }
      }

      if (!bestMatch || bestScore < 0.4) return null;

      return {
        x: bestMatch.x,
        y: bestMatch.y,
        floor: bestMatch.floor,
        confidence: Math.round(bestScore * 100),
      };
    } catch (err) {
      console.error("findLocation error:", err);
      return null;
    }
  }

  // Lightweight feature vector from base64 image data (96 values)
  _computeFeatures(base64String) {
    const features = new Float32Array(96);
    const step = Math.max(1, Math.floor(base64String.length / 96));
    let norm = 0;
    for (let i = 0; i < 96; i++) {
      const idx = i * step;
      const charCode = base64String.charCodeAt(idx % base64String.length);
      features[i] = charCode / 255.0;
      norm += features[i] * features[i];
    }
    norm = Math.sqrt(norm) || 1;
    for (let i = 0; i < 96; i++) features[i] /= norm;
    return features;
  }

  _cosineSimilarity(a, b) {
    if (a.length !== b.length) return 0;
    let dot = 0;
    for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
    return dot;
  }
}
