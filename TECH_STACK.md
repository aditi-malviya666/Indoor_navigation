# 🔬 Engineering & Technology Stack Specification

Comprehensive technical specification and architectural deep dive into the **Zero-Hardware Indoor Navigation & Mapping System**.

---

## 📑 Table of Contents
1. [Architectural Overview](#1-architectural-overview)
2. [Hardware & Sensor Fusion Layer (PDR)](#2-hardware--sensor-fusion-layer-pdr)
3. [Cartography & Map Generation Engine](#3-cartography--map-generation-engine)
4. [Localization & Particle Filter Engine](#4-localization--particle-filter-engine)
5. [Multi-Floor A* Pathfinding Engine](#5-multi-floor-a-pathfinding-engine)
6. [Visual Re-Localization Engine](#6-visual-re-localization-engine)
7. [Cloud Infrastructure & Firebase Schema](#7-cloud-infrastructure--firebase-schema)
8. [Mobile Framework & UI Rendering](#8-mobile-framework--ui-rendering)
9. [DevOps, EAS Cloud Build & CI/CD](#9-devops-eas-cloud-build--cicd)

---

## 1. Architectural Overview

The Indoor Navigation System solves the indoor positioning and mapping problem without requiring external beacons (iBLE, UWB) or QR codes. The system functions on an autonomous sensor-fusion loop running directly on client hardware with serverless cloud synchronization.

```
+-------------------------------------------------------------------------+
|                         Smartphone Hardware Layer                        |
|  - Accelerometer (50Hz)     - Magnetometer (10Hz)    - Barometer (1Hz)  |
|  - Camera Frame Capture     - Location Provider (GPS Anchor)            |
+-------------------------------------------------------------------------+
                                     |
                                     v
+-------------------------------------------------------------------------+
|                      Pedestrian Dead Reckoning (PDR)                    |
|  - Weinberg Step Length Estimation: L = K * (a_max - a_min)^0.25        |
|  - Accelerometer Peak-Valley Detection (Threshold = 1.45 m/s^2)         |
|  - Heading Vector Smoothing (atan2(y, x))                               |
|  - Barometric Pressure Differential Floor Detection (delta_P ~ 120 Pa)  |
+-------------------------------------------------------------------------+
                                     |
                                     v
+-------------------------------------------------------------------------+
|                  250-Particle Monte Carlo Particle Filter               |
|  - Prediction: X_t = X_{t-1} + L * [cos(theta), sin(theta)] + noise     |
|  - Wall-Collision Pruning (CCW Line Segment Intersection Raycasting)    |
|  - Low-Variance Resampling & Confidence Scoring                         |
+-------------------------------------------------------------------------+
                                     |
                                     v
+-------------------------------------------------------------------------+
|                  Navigation, Routing & User Interface                   |
|  - 60fps Vector Floor Plan Render (React Native SVG)                    |
|  - Multi-Floor A* Graph Search & Turn-by-Turn Instruction Generator    |
|  - 96-Dim Visual Feature Matcher (Cosine Similarity vs Firestore)       |
+-------------------------------------------------------------------------+
```

---

## 2. Hardware & Sensor Fusion Layer (PDR)

File: `src/engine/sensorEngine.js`

### 2.1 Step Length Estimation (Weinberg Model)
Rather than assuming a static stride length, the system computes step length dynamically for every single footstep using the **Weinberg Formula**:

$$L = K \cdot \sqrt[4]{a_{\text{max}} - a_{\text{min}}}$$

- $a_{\text{max}}$: Peak vertical acceleration recorded during the step swing phase ($m/s^2$).
- $a_{\text{min}}$: Valley acceleration during foot impact ($m/s^2$).
- $K$: Empirical human calibration constant ($0.48$).

### 2.2 Step Detection Algorithm
- Accelerometer data sampled at **50Hz** ($20\text{ms}$ interval).
- Step trigger occurs when Euclidean acceleration magnitude $A = \sqrt{a_x^2 + a_y^2 + a_z^2}$ exceeds the resting gravity threshold by $\ge 1.45\text{ m/s}^2$ with a minimum debounce refractory period of $260\text{ms}$ ($< 3.8\text{ steps/sec}$).

### 2.3 Heading Estimation
- Magnetometer sampled at **10Hz** ($100\text{ms}$ interval).
- Orientation computed via $\theta = \text{atan2}(M_y, M_x)$, normalized to $[0, 2\pi)$.

### 2.4 Barometric Floor Change Detection
- Atmospheric pressure $P$ sampled at **1Hz** via `expo-sensors`.
- Standard barometric lapse rate near sea level yields approximately $\approx 12\text{ Pa}$ per vertical meter.
- A vertical floor change ($\Delta h \approx 3.5\text{m}$) corresponds to $\Delta P \ge 120\text{ Pa}$. When $\Delta P$ exceeds the threshold, the engine automatically triggers an increment or decrement in the active floor level.

---

## 3. Cartography & Map Generation Engine

File: `src/creator/MapGenerator.js`

When recording a walk through a building, the raw point stream is converted into a vector floor plan:

1. **Ramer-Douglas-Peucker (RDP) Polyline Simplification**:
   - Reduces raw GPS/IMU trajectory point count by $\sim 85\%$ while preserving structural corners.
   - Perpendicular distance threshold: $\epsilon = 1.2\text{ meters}$.
2. **Corridor Wall Extrusion**:
   - For every simplified corridor segment, wall boundary lines are extruded perpendicular to the walking direction at a standard corridor half-width ($w = 1.5\text{m}$):
     $$W_{\text{left}} = P \pm w \cdot [-\sin\theta, \cos\theta]$$
3. **GeoJSON Feature Generation**:
   - Outputs a structured GeoJSON `FeatureCollection` with `LineString` walls, `Polygon` room boundaries, and `Point` POIs.
4. **Navigation Graph Extraction**:
   - Direction changes become graph waypoints ($N_i$).
   - Intra-floor edges are created between adjacent waypoints with Euclidean distance weights.

---

## 4. Localization & Particle Filter Engine

File: `src/engine/particleFilter.js`

To prevent accumulated sensor drift and keep the user's position strictly inside walkable corridors:

### 4.1 Particle State
Each particle $i \in [1, 250]$ maintains a state vector:
$$S_i = \{x_i, y_i, \theta_i, \text{floor}_i, w_i\}$$

### 4.2 Motion Model Prediction
Upon each detected step of length $L$ and heading $\theta$:
$$x_i^{(t)} = x_i^{(t-1)} + (L + \mathcal{N}(0, \sigma_L^2)) \cdot \cos(\theta + \mathcal{N}(0, \sigma_\theta^2))$$
$$y_i^{(t)} = y_i^{(t-1)} + (L + \mathcal{N}(0, \sigma_L^2)) \cdot \sin(\theta + \mathcal{N}(0, \sigma_\theta^2))$$

### 4.3 Map-Constrained Measurement & Wall Collision Raycasting
- The trajectory segment of each particle $(P_{\text{old}} \to P_{\text{new}})$ is tested for intersection with all map wall segments using the 2D Counter-Clockwise (CCW) segment intersection test:
  $$\text{CCW}(A, B, C) = (C_y - A_y)(B_x - A_x) > (B_y - A_y)(C_x - A_x)$$
- Any particle whose path crosses a solid wall is assigned a weight of $w_i = 0$ (eliminated).

### 4.4 Low-Variance Resampling
- Particles are resampled using systematic low-variance sampling to maintain particle diversity without particle deprivation.
- The estimated user pose is the weighted mean $\bar{X} = \sum w_i X_i$, and confidence is computed from spatial particle variance.

---

## 5. Multi-Floor A* Pathfinding Engine

File: `src/engine/router.js`

### 5.1 Graph Representation
- **Intra-floor edges**: Weighted by Euclidean distance $d(u, v) = \sqrt{(x_u - x_v)^2 + (y_u - y_v)^2}$.
- **Inter-floor vertical edges**: Connected via vertical transit nodes (Stairs, Elevators). A traversal penalty ($\text{Weight} = 15\text{m}$ equivalent delay) is applied to prioritize staying on the same floor when possible.

### 5.2 Heuristic Function
$$h(n, \text{goal}) = \sqrt{(x_n - x_g)^2 + (y_n - y_g)^2} + |\text{floor}_n - \text{floor}_g| \times 20$$

### 5.3 Turn-by-Turn Instruction Generator
Computes the relative turn angle $\Delta\alpha = \alpha_{\text{next}} - \alpha_{\text{current}}$ between sequential path vectors:
- $|\Delta\alpha| \le 20^\circ \implies$ **⬆️ Head straight**
- $20^\circ < \Delta\alpha \le 120^\circ \implies$ **↗️ Turn right**
- $-120^\circ \le \Delta\alpha < -20^\circ \implies$ **↖️ Turn left**
- Floor change node $\implies$ **🪜 Take stairs / 🛗 Take elevator to Floor $N$**

---

## 6. Visual Re-Localization Engine

File: `src/engine/relocalization.js`

When tracking is interrupted, visual re-localization snaps the user's coordinate without requiring QR codes.

1. **Feature Extraction**:
   - Base64 image is sampled into a **96-dimensional feature vector** representing localized color-spatial distribution (32-bin HSV color density across a $3 \times 1$ grid).
2. **Cosine Similarity Matching**:
   For query vector $\mathbf{Q}$ and stored keyframe vector $\mathbf{K}_j$:
   $$\text{Similarity}(\mathbf{Q}, \mathbf{K}_j) = \frac{\mathbf{Q} \cdot \mathbf{K}_j}{\|\mathbf{Q}\| \|\mathbf{K}_j\|} = \frac{\sum_{i=1}^{96} Q_i K_{ji}}{\sqrt{\sum Q_i^2} \sqrt{\sum K_{ji}^2}}$$
3. If $\text{Similarity} \ge 0.78$, the user's particle filter is instantly re-initialized around the matched keyframe's $(x, y, \text{floor})$ coordinates.

---

## 7. Cloud Infrastructure & Firebase Schema

File: `src/firebase/config.js` & `src/firebase/mapService.js`

The backend runs entirely on **Google Cloud Firestore (Spark Free Tier)** with zero maintenance or server provisioning.

### 7.1 Firestore Data Schema

#### `maps/{mapId}`
```json
{
  "mapId": "map_1724491200000",
  "name": "Academic Block A",
  "building": "Main Campus",
  "code": "849201",
  "createdAt": 1724491200000,
  "floorCount": 3,
  "poiCount": 18,
  "mapData": {
    "floors": {
      "1": {
        "waypoints": [{ "id": "wp_0", "x": 0, "y": 0, "floor": 1 }],
        "connections": [["wp_0", "wp_1"]],
        "pois": [{ "id": "poi_1", "name": "Dean Office", "category": "office", "x": 12.5, "y": 4.0, "floor": 1, "icon": "💼" }],
        "walls": [[0, -1.5, 25.0, -1.5], [0, 1.5, 25.0, 1.5]],
        "dimensions": { "width": 50, "height": 40, "offsetX": -5, "offsetY": -5 }
      }
    },
    "verticalTransit": [
      { "id": "vt_1", "name": "Central Stairs", "type": "stairs", "nodes": { "1": "wp_5", "2": "wp_18" } }
    ]
  },
  "geojson": { "type": "FeatureCollection", "features": [...] }
}
```

#### `maps/{mapId}/keyframes/{frameId}`
```json
{
  "frameId": "kf_1724491215000",
  "x": 14.2,
  "y": 6.8,
  "floor": 1,
  "featureVector": [0.012, 0.045, ...],
  "timestamp": 1724491215000
}
```

---

## 8. Mobile Framework & UI Rendering

- **React Native 0.78 / Expo SDK 57**: Ultra-responsive native UI running on the Hermes JavaScript engine.
- **React Native SVG**: High-performance 2D vector rendering for smooth panning, animated dash routes (`strokeDashoffset`), and 60fps pulsing location pucks.
- **AsyncStorage**: Persistent client-side caching for one-shot permission flags and recent map metadata.

---

## 9. DevOps, EAS Cloud Build & CI/CD

- **EAS Build (Expo Application Services)**: Remote Linux build pipelines with cached Android SDK 36, NDK 27, and automated keystore management.
- **Preview Profile (`buildType: apk`)**: Generates direct-installable `.apk` packages without requiring Google Play Store submission.
- **Standard Architecture Compatibility**: Cleaned from problematic C++ worklet dependencies for instant cross-platform stability.
