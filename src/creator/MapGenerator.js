/**
 * MapGenerator — Converts a recorded GPS+PDR trajectory into a navigable GeoJSON map.
 * Uses Ramer-Douglas-Peucker simplification to extract corridor centrelines,
 * infers walls at a fixed corridor half-width, and builds an A* waypoint graph.
 */

const CORRIDOR_HALF_WIDTH = 2.5;  // metres either side of centreline
const RDP_EPSILON          = 1.5; // metres — simplification tolerance
const KEYFRAME_INTERVAL_M  = 3.0; // metres between stored keyframes

// ─── Ramer-Douglas-Peucker polyline simplification ───────────────────────────
function rdpSimplify(pts, eps) {
  if (pts.length <= 2) return pts;
  let maxD = 0, maxI = 0;
  const [p0, pN] = [pts[0], pts[pts.length - 1]];
  const dx = pN.x - p0.x, dy = pN.y - p0.y;
  const len = Math.hypot(dx, dy) || 1;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs(dy * pts[i].x - dx * pts[i].y + pN.x * p0.y - pN.y * p0.x) / len;
    if (d > maxD) { maxD = d; maxI = i; }
  }
  if (maxD > eps) {
    return [...rdpSimplify(pts.slice(0, maxI + 1), eps).slice(0, -1),
            ...rdpSimplify(pts.slice(maxI), eps)];
  }
  return [p0, pN];
}

// ─── Perpendicular unit vector ────────────────────────────────────────────────
function perpendicular(dx, dy) {
  const len = Math.hypot(dx, dy) || 1;
  return { x: -dy / len, y: dx / len };
}

export class MapGenerator {
  /**
   * @param {Array<{x,y,floor,heading,timestamp}>} trajectory
   * @param {Array<{name,category,x,y,floor,icon,timestamp}>} labels
   * @param {number[]} floors  detected floor numbers
   */
  constructor(trajectory, labels, floors) {
    this.trajectory = trajectory;
    this.labels     = labels;
    this.floors     = floors.length ? floors : [1];
  }

  generate() {
    const mapData = { floors: {}, verticalTransit: [] };
    const geojsonFeatures = [];

    for (const floorNum of this.floors) {
      // Filter trajectory points for this floor
      const pts = this.trajectory.filter(p => p.floor === floorNum);
      if (pts.length < 2) continue;

      // Simplify centreline
      const simplified = rdpSimplify(pts.map(p => ({ x: p.x, y: p.y })), RDP_EPSILON);

      // Infer wall segments from corridor half-width
      const walls = this._inferWalls(simplified);

      // Build navigation waypoints at every simplified vertex + at label positions
      const floorLabels = this.labels.filter(l => l.floor === floorNum);
      const { waypoints, connections } = this._buildNavGraph(simplified, floorLabels);

      // POIs from labels
      const pois = floorLabels.map((l, i) => ({
        id: `poi_f${floorNum}_${i}`,
        name: l.name,
        floor: floorNum,
        category: l.category || "room",
        icon: l.icon || this._defaultIcon(l.category),
        waypointId: `wp_f${floorNum}_label_${i}`,
        desc: l.name,
        x: l.x, y: l.y,
      }));

      // Bounding box
      const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
      const minX = Math.min(...xs), maxX = Math.max(...xs);
      const minY = Math.min(...ys), maxY = Math.max(...ys);
      const pad  = CORRIDOR_HALF_WIDTH + 2;
      const dimensions = {
        width:  (maxX - minX) + 2 * pad,
        height: (maxY - minY) + 2 * pad,
        offsetX: minX - pad,
        offsetY: minY - pad,
      };

      mapData.floors[floorNum] = { id: floorNum, waypoints, connections, pois, walls, dimensions };

      // GeoJSON features
      for (const wp of waypoints) {
        geojsonFeatures.push({ type: "Feature",
          properties: { id: wp.id, floor: floorNum, type: "waypoint" },
          geometry: { type: "Point", coordinates: [wp.x, wp.y] } });
      }
      for (const [wx1,wy1,wx2,wy2] of walls) {
        geojsonFeatures.push({ type: "Feature",
          properties: { floor: floorNum, type: "wall" },
          geometry: { type: "LineString", coordinates: [[wx1,wy1],[wx2,wy2]] } });
      }
      for (const poi of pois) {
        geojsonFeatures.push({ type: "Feature",
          properties: { ...poi, type: "poi" },
          geometry: { type: "Point", coordinates: [poi.x, poi.y] } });
      }
    }

    // Detect stair/elevator labels to build vertical transit
    const transitLabels = this.labels.filter(l =>
      ["stairs","elevator","lift"].some(k => l.name?.toLowerCase().includes(k) || l.category?.toLowerCase().includes(k)));
    if (transitLabels.length >= 2) {
      const byFloor = {};
      for (const t of transitLabels) {
        if (!byFloor[t.floor]) byFloor[t.floor] = t;
      }
      const floorNums = Object.keys(byFloor).map(Number).sort();
      if (floorNums.length >= 2) {
        mapData.verticalTransit.push({
          id: "transit_1", name: "Staircase / Elevator",
          type: "stairs", floors: floorNums,
          nodes: Object.fromEntries(floorNums.map(f => {
            const lbl = byFloor[f];
            const wp = mapData.floors[f]?.waypoints?.find(w => Math.hypot(w.x-lbl.x,w.y-lbl.y) < 5);
            return [f, wp?.id ?? `wp_f${f}_label_0`];
          })),
          transitionWeight: 20,
        });
      }
    }

    const geojson = { type: "FeatureCollection", features: geojsonFeatures };
    const thumbnail = this._toSVG(mapData, this.floors[0]);

    return { geojson, mapData, thumbnail };
  }

  _inferWalls(simplified) {
    const walls = [];
    const hw = CORRIDOR_HALF_WIDTH;
    for (let i = 0; i < simplified.length - 1; i++) {
      const [a, b] = [simplified[i], simplified[i+1]];
      const dx = b.x - a.x, dy = b.y - a.y;
      const p  = perpendicular(dx, dy);
      // Left wall segment
      walls.push([a.x + p.x*hw, a.y + p.y*hw, b.x + p.x*hw, b.y + p.y*hw]);
      // Right wall segment
      walls.push([a.x - p.x*hw, a.y - p.y*hw, b.x - p.x*hw, b.y - p.y*hw]);
    }
    return walls;
  }

  _buildNavGraph(simplified, floorLabels) {
    const waypoints = [];
    const connections = [];

    // One waypoint per simplified vertex
    for (let i = 0; i < simplified.length; i++) {
      waypoints.push({ id: `wp_${i}`, x: simplified[i].x, y: simplified[i].y });
      if (i > 0) connections.push([`wp_${i-1}`, `wp_${i}`]);
    }

    // One waypoint per label, connected to nearest corridor waypoint
    floorLabels.forEach((l, li) => {
      const wpId = `wp_f${l.floor}_label_${li}`;
      waypoints.push({ id: wpId, x: l.x, y: l.y });
      // Find nearest corridor wp
      let nearId = "wp_0", nearD = Infinity;
      for (const w of waypoints) {
        if (w.id === wpId) continue;
        const d = Math.hypot(w.x - l.x, w.y - l.y);
        if (d < nearD) { nearD = d; nearId = w.id; }
      }
      connections.push([nearId, wpId]);
    });

    return { waypoints, connections };
  }

  _defaultIcon(category = "") {
    const map = { room:"🚪", lab:"🔬", office:"💼", washroom:"🚻", toilet:"🚻",
                  stairs:"🪜", elevator:"🛗", lift:"🛗", library:"📚",
                  cafeteria:"☕", canteen:"🍽️", exit:"🚪", lecture:"📖" };
    return map[category?.toLowerCase()] ?? "📍";
  }

  _toSVG(mapData, floorNum) {
    const f = mapData.floors[floorNum];
    if (!f) return "<svg/>";
    const { dimensions: d, walls, waypoints, pois } = f;
    const W = 300, H = 200;
    const sx = W / (d.width  || 1);
    const sy = H / (d.height || 1);
    const tx = p => ((p - d.offsetX) * sx).toFixed(1);
    const ty = p => ((p - d.offsetY) * sy).toFixed(1);

    const wallLines = walls.map(([x1,y1,x2,y2]) =>
      `<line x1="${tx(x1)}" y1="${ty(y1)}" x2="${tx(x2)}" y2="${ty(y2)}" stroke="#475569" stroke-width="1.5"/>`).join("");

    const poiCircles = pois.map(p =>
      `<circle cx="${tx(p.x)}" cy="${ty(p.y)}" r="4" fill="#38bdf8"/>
       <text x="${tx(p.x)}" y="${(parseFloat(ty(p.y))-6).toFixed(1)}" font-size="5" fill="#fff" text-anchor="middle">${p.name.slice(0,8)}</text>`).join("");

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#0f172a"/>
  ${wallLines}
  ${poiCircles}
</svg>`;
  }
}
