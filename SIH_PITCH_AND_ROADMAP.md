# 🏆 Smart India Hackathon (SIH) — Project Pitch, Problem Statement & Roadmap

---

## 1. 🎯 The Core Problem (The "Indoor GPS Blindspot")

Outdoor navigation (Google Maps / Apple Maps) works because of satellite line-of-sight. However, **satellite GPS signals cannot penetrate reinforced concrete and metal ceilings**. Once a user enters an indoor environment, GPS accuracy degrades from $\pm 3\text{m}$ to $\pm 30\text{--}50\text{m}$ or disappears entirely.

### Why existing indoor solutions fail in India:
1. **BLE Beacons / UWB Tags**:
   - Extremely expensive (₹1,500 – ₹4,000 per beacon; a 4-floor hospital requires 200+ beacons).
   - Require continuous battery replacement, physical maintenance, and wiring.
2. **QR Code Kiosks**:
   - Highly static. If a user walks past a QR code, they lose navigation until they find the next physical poster.
3. **CAD / Architectural Blueprints**:
   - Static, outdated, and require specialized civil engineering software to digitize.
   - Buildings frequently undergo interior renovations (partitions, temporary stalls, room reassignments) that blueprints never reflect.

---

## 2. 💡 Your Breakthrough Idea: "Dynamic Walk-to-Map"

> **"If a human can walk through a building once, our system can turn that single walk into an interactive, multi-floor, vector-navigable digital twin in under 5 minutes — with ZERO external hardware."**

### Why this is a game-changer:
- **Zero Infrastructure Cost ($0)**: No beacons, no tags, no Wi-Fi infrastructure modification.
- **Zero-to-Live in Minutes**: Anyone (security guard, admin, student, volunteer) can walk a floor with their phone, tap `+ Add Place` to drop pins, and publish the map instantly to the cloud.
- **Crowdsourced & Self-Updating**: If a hallway is modified or new rooms are added, re-walking the route updates the GeoJSON graph instantly.
- **Universal 6-Digit Code Access**: Visitors simply enter a 6-digit code (e.g. `849201`) or tap a link to navigate immediately.

---

## 3. 🏢 Real-World Use Cases

| Sector | Practical Application |
|---|---|
| 🏥 **Hospitals & Medical Centers** | Patients and emergency visitors finding OPDs, Radiology, ICUs, and Blood Banks in multi-wing medical campuses without stress. |
| 🎓 **Universities & Exam Centers** | Thousands of students locating examination halls, laboratories, departments, and seminar auditoriums on day one. |
| ✈️ **Airports & Railway Terminals** | Multi-level transit passengers navigating gates, baggage carousels, security checkpoints, and washrooms during tight layovers. |
| 🏬 **Malls & Exhibition Centers** | Finding specific retail stores, pop-up stalls, food courts, and emergency exits dynamically. |
| 🚒 **Disaster Management & Fire Rescue** | First responders accessing real-time corridor maps and room layouts in smoke-filled, power-outage environments where satellite GPS is completely dead. |

---

## 4. ⚠️ Potential Challenges & How Your Engineering Solves Them

### Challenge 1: Sensor Drift in Pedestrian Dead Reckoning (PDR)
- **Problem**: Low-cost smartphone accelerometers and magnetometers accumulate rotational and translational drift over time.
- **Your Solution**: **Map-Constrained 250-Particle Filter (Monte Carlo Localization)**.
  - Every particle represents a possible user position.
  - Using **2D Counter-Clockwise (CCW) Line-Segment Raycasting**, particles that attempt to walk through solid walls are instantly eliminated.
  - The blue dot remains locked inside navigable corridors.

### Challenge 2: Device Orientation & Stride Variations
- **Problem**: People walk with different stride lengths and swing their phones differently.
- **Your Solution**: **Weinberg Dynamic Step Estimation Model**:
  $$L = K \cdot \sqrt[4]{a_{\text{max}} - a_{\text{min}}}$$
  Calculates step length dynamically based on real-time swing acceleration rather than static height assumptions.

### Challenge 3: Multi-Floor Transitions (Stairs vs Elevators)
- **Problem**: GPS has zero vertical altitude precision indoors.
- **Your Solution**: **Barometric Air Pressure Differential ($\Delta P \ge 120\text{ Pa}$)**:
  - Detects physical elevation changes between floors automatically.
  - Reinforced with manual floor toggle buttons (`⬆ Upstairs` / `⬇ Downstairs`) and multi-floor A* transit routing.

### Challenge 4: Total Loss of Position (e.g., Phone in Pocket)
- **Problem**: If the user loses tracking or opens the app midway through a building.
- **Your Solution**: **Visual Re-Localization via 96-Dimensional Feature Matching**:
  - User takes a quick photo of a corridor, sign, or landmark.
  - Color-spatial histogram vector is compared against cloud keyframes using **Cosine Similarity**.
  - Blue dot snaps back to the exact physical coordinates with $>80\%$ confidence.

---

## 5. 🚀 Future Roadmap & Scaling Upgrades (For SIH Judges)

### Phase 1: Accessibility & Voice Guidance (Inclusion)
- Integration of Text-to-Speech (TTS) turn-by-turn voice prompts for visually impaired visitors (*"In 5 steps, turn right at the Pharmacy"*).
- Haptic vibration feedback at decision points.

### Phase 2: Augmented Reality (AR) Overlay
- 3D directional floating arrows projected directly onto the live camera feed using ARCore / Three.js.

### Phase 3: Hybrid RF-Fusion (Wi-Fi RTT / Passive RSSI Fingerprinting)
- Opportunistically fusing ambient Wi-Fi signal strength profiles to provide instant zero-step absolute positioning.

### Phase 4: Dynamic Emergency Evacuation Routing
- In case of fire or hazard, administrators mark blocked zones on the cloud map; the A* routing engine immediately reroutes all active users to the nearest clear emergency exit.
