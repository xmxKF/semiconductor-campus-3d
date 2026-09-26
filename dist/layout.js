import * as THREE from 'three';
import { smoothClosed, roundedRectPts, polyline } from './util.js';
/**
 * Site plan. 1 unit = 1 m, +X east, -Z north.
 *
 * v3 (client review): the references are AI-generated perspective renders, so building-to-building
 * distances are not measurable from them and parts of the admin forecourt were physically impossible
 * (stairs, drop-off ring, pools and flower rings overlapping). The plan below keeps the reference's
 * axis, building order and footprints, but re-derives every north–south distance from explicit
 * clearances, working from the south boundary northwards:
 *
 *   perimeter road inner edge 313 ── 25 m (entrance canopy + setback) ── FAB south face 288
 *   FAB 142 deep → centre 217, north face 146 ── 16 m apron ── shared road z=130
 *     (FAB service road = south leg of the core loop; one road, not two parallel ones)
 *   U-shaped drop-off hanging off that road, big central pool inside it (≥7 m lawn all round)
 *   drop-off north lane edge 82 ── 12 m pedestrian plaza ── grand stair (8 treads) 65–70
 *     ── 12 m terrace 53–65 ── entrance canopy ── admin south face 41 → admin centre 18
 *   admin north face −5 ── ~25 m north plaza ── pond south shore ≈ −30
 */
export const SITE = { w: 1000, d: 680, x0: -500, x1: 500, z0: -340, z1: 340 };
export const ROAD_Z = 130; // shared FAB-north / core-loop-south road centreline
export const DROPOFF = { x: 50, zN: 86, r: 12, w: 8 }; // U drop-off: legs at ±x, north lane centreline zN
export const ADMIN_POOL = { z: 107, w: 76, d: 20 };
export const B = {
    gate: { x: 0, z: -334 }, // on the boundary wall line; perimeter road passes 14 m inside
    plaza: { x: 0, z: -282, w: 150, d: 64 },
    pavilion: { x: 0, z: -188 },
    admin: { x: 0, z: 18, w: 196, d: 46 },
    fab2: { x: -212, z: 217, w: 244, d: 142 },
    fab1: { x: 212, z: 217, w: 244, d: 142 },
    mask: { x: -352, z: 24, w: 140, d: 104 },
    lab: { x: 352, z: 24, w: 140, d: 104 },
    restGlass: { x: -200, z: -116 },
    restJp: { x: 200, z: -134 },
    mall: { x: 0, z: 222, w: 92, d: 150 },
    parkingNW: { x: -385, z: -196, w: 150, d: 104 },
    parkingNE: { x: 385, z: -196, w: 150, d: 104 },
};
/** North part of the pond is kept; the south part is pulled north so the admin gets a real north plaza. */
const squeeze = (z) => (z < -290 ? z : -290 + (z + 290) * (260 / 282));
/**
 * Pond shoreline: one water body split by the pavilion peninsula (north) and the axial causeway
 * (south); north lobes reach the plaza, south shore stops ≈25 m short of the admin.
 */
const half = [
    [0, -8], [40, -12], [90, -26], [140, -34], [182, -52], [206, -86], [186, -118], [190, -150],
    [214, -186], [210, -228], [188, -266], [148, -290], [104, -286], [70, -266], [52, -236], [44, -208], [0, -206],
];
const outline = [
    ...half,
    ...half.slice(1, -1).reverse().map(([x, z]) => [-x, z]),
].map(([x, z]) => [x, squeeze(z)]);
export const POND = smoothClosed(outline, 300).map((p, i, arr) => {
    // small coves / promontories so the edge reads natural like the reference (deterministic)
    const t = (i / arr.length) * Math.PI * 2;
    const w = Math.sin(t * 9) * 2.2 + Math.sin(t * 23 + 1.3) * 1.1 + Math.sin(t * 5 + 0.4) * 1.6;
    const cx = 0, cz = -150;
    const dx = p.x - cx, dz = p.y - cz, L = Math.hypot(dx, dz) || 1;
    // keep the causeway ends and the pavilion peninsula exact
    const fixed = Math.abs(p.x) < 50 ? 0 : 1;
    return new THREE.Vector2(p.x + (dx / L) * w * fixed, p.y + (dz / L) * w * fixed);
});
const isl = (pts, n) => smoothClosed(pts.map(([x, z]) => [x, squeeze(z)]), n);
/** Islands inside the pond (planted, with blossom trees). */
export const ISLANDS = [
    isl([[-168, -160], [-146, -170], [-128, -158], [-138, -142], [-160, -142]], 36),
    isl([[168, -160], [146, -170], [128, -158], [138, -142], [160, -142]], 36),
    isl([[-128, -244], [-108, -254], [-92, -240], [-110, -226]], 30),
    isl([[128, -244], [108, -254], [92, -240], [110, -226]], 30),
    isl([[-110, -54], [-86, -62], [-68, -50], [-84, -38], [-106, -40]], 30),
    isl([[110, -54], [86, -62], [68, -50], [84, -38], [106, -40]], 30),
];
export const FOUNTAINS = [new THREE.Vector2(-92, squeeze(-110)), new THREE.Vector2(92, squeeze(-110))];
/** Open U (opening south): legs at x=±hx from y0 north to yN, rounded corners of radius r. */
function uPath(hx, y0, yN, r, seg = 8) {
    const pts = [new THREE.Vector2(-hx, y0)];
    for (let i = 0; i <= seg; i++) {
        const a = Math.PI + (i / seg) * (Math.PI / 2);
        pts.push(new THREE.Vector2(-hx + r + Math.cos(a) * r, yN + r + Math.sin(a) * r));
    }
    for (let i = 0; i <= seg; i++) {
        const a = 1.5 * Math.PI + (i / seg) * (Math.PI / 2);
        pts.push(new THREE.Vector2(hx - r + Math.cos(a) * r, yN + r + Math.sin(a) * r));
    }
    pts.push(new THREE.Vector2(hx, y0));
    return pts;
}
/** FAB service road: U from the perimeter road (south) up both sides and across the north at ROAD_Z. */
function fabLoop(cx, halfW) {
    const r = 26, zS = 313, zN = ROAD_Z, seg = 8;
    const pts = [new THREE.Vector2(cx - halfW, zS)];
    for (let i = 0; i <= seg; i++) {
        const a = Math.PI + (i / seg) * (Math.PI / 2);
        pts.push(new THREE.Vector2(cx - halfW + r + Math.cos(a) * r, zN + r + Math.sin(a) * r));
    }
    for (let i = 0; i <= seg; i++) {
        const a = -Math.PI / 2 + (i / seg) * (Math.PI / 2);
        pts.push(new THREE.Vector2(cx + halfW - r + Math.cos(a) * r, zN + r + Math.sin(a) * r));
    }
    pts.push(new THREE.Vector2(cx + halfW, zS));
    return pts;
}
/** Drop the points of a closed loop that satisfy `cut` and return it as an open path starting after the gap. */
function openLoop(pts, cut) {
    const n = pts.length;
    let start = pts.findIndex((p, i) => cut(pts[(i - 1 + n) % n]) && !cut(p));
    if (start < 0)
        start = 0;
    const out = [];
    for (let k = 0; k < n; k++) {
        const p = pts[(start + k) % n];
        if (cut(p))
            break;
        out.push(p);
    }
    return out;
}
/** Quarter-circle kerb return between two perpendicular roads (for small fillet pavements). */
export function kerbReturn(cx, cz, r, a0, seg = 8) {
    const pts = [new THREE.Vector2(cx, cz)];
    for (let i = 0; i <= seg; i++) {
        const a = a0 + (i / seg) * (Math.PI / 2);
        pts.push(new THREE.Vector2(cx + Math.cos(a) * r, cz + Math.sin(a) * r));
    }
    return pts;
}
export const PERIM_Z = -320; // north leg of the perimeter road (inside the wall)
export const FRONTAGE_Z = -352; // frontage road between the expressway and the site wall
const FAB_HALF = B.fab2.w / 2 + 40; // 40 m between facade and road centreline on the sides (docks + trucks)
export const ROADS = [
    // perimeter loop
    { pts: roundedRectPts(0, 0, 940, 640, 70, 12), width: 14, closed: true, kind: 'road-4' },
    // core loop around pond + admin: south leg (z=ROAD_Z) shared with the FAB service roads, north leg merged into
    // the perimeter road (it used to cut through the gate plaza) → an open U joining the perimeter road
    { pts: openLoop(roundedRectPts(0, (PERIM_Z + ROAD_Z) / 2, 490, ROAD_Z - PERIM_Z, 115, 16), p => p.y < PERIM_Z + 0.5), width: 11, closed: false, kind: 'road-2' },
    // FAB service roads (U from the perimeter road, north leg = core-loop south leg)
    { pts: fabLoop(B.fab2.x - 8, FAB_HALF), width: 10, closed: false, kind: 'road-2' },
    { pts: fabLoop(B.fab1.x + 8, FAB_HALF), width: 10, closed: false, kind: 'road-2' },
    // mask / lab service loops
    { pts: roundedRectPts(B.mask.x, B.mask.z, B.mask.w + 30, B.mask.d + 40, 20, 8), width: 9, closed: true, kind: 'road-2' },
    { pts: roundedRectPts(B.lab.x, B.lab.z, B.lab.w + 30, B.lab.d + 40, 20, 8), width: 9, closed: true, kind: 'road-2' },
    // gate entry spine
    // entrance throat: right-in/right-out off the frontage road, through the gate, T-junction with the perimeter road
    { pts: polyline([[0, FRONTAGE_Z + 6], [0, PERIM_Z - 7]]), width: 16, closed: false, kind: 'road-4' },
    // parking-lot driveways to the east/west connectors (the lots had no vehicle access)
    { pts: polyline([[-345, -144], [-345, -105]]), width: 8, closed: false, kind: 'road-2' },
    { pts: polyline([[-425, -144], [-425, -105]]), width: 8, closed: false, kind: 'road-2' },
    { pts: polyline([[345, -144], [345, -105]]), width: 8, closed: false, kind: 'road-2' },
    { pts: polyline([[425, -144], [425, -105]]), width: 8, closed: false, kind: 'road-2' },
    // connectors core loop -> perimeter east/west (between the parking lots and the mask/lab loops)
    { pts: polyline([[-245, -100], [-470, -100]]), width: 11, closed: false, kind: 'road-2' },
    { pts: polyline([[245, -100], [470, -100]]), width: 11, closed: false, kind: 'road-2' },
    // admin drop-off: U hanging north off the shared road, big pool inside, 12 m plaza before the stair
    { pts: uPath(DROPOFF.x, ROAD_Z, DROPOFF.zN, DROPOFF.r), width: DROPOFF.w, closed: false, kind: 'road-2' },
    // north expressway (outside the site) + frontage road
    { pts: polyline([[-1400, -392], [1400, -392]]), width: 44, closed: false, kind: 'highway' },
    { pts: polyline([[-1400, FRONTAGE_Z], [1400, FRONTAGE_Z]]), width: 12, closed: false, kind: 'road-4' },
];
/** North-east cloverleaf interchange loops (visible top-right in the reference). */
export const INTERCHANGE = [
    { pts: roundedRectPts(640, -470, 150, 120, 58, 16), width: 9, closed: true, kind: 'road-2' },
    { pts: roundedRectPts(800, -470, 150, 120, 58, 16), width: 9, closed: true, kind: 'road-2' },
    { pts: polyline([[720, -300], [720, -1000]]), width: 30, closed: false, kind: 'highway' },
];
/** Footprints trees must avoid (buildings, plazas, lots) — expanded by margin at query time.
 *  (Built buildings are additionally pruned against their real bounding boxes in main.ts.) */
export const BLOCKERS = [
    B.fab2, B.fab1, B.mask, B.lab, B.plaza, B.parkingNW, B.parkingNE,
    { x: B.fab2.x - B.fab2.w / 2 - 16, z: B.fab2.z, w: 40, d: 140 }, { x: B.fab1.x + B.fab1.w / 2 + 16, z: B.fab1.z, w: 40, d: 140 },
    { x: 0, z: 37, w: 220, d: 100 }, // admin + north plaza + terrace + stair + apron
    { x: 0, z: (DROPOFF.zN + ROAD_Z) / 2, w: DROPOFF.x * 2 + 10, d: ROAD_Z - DROPOFF.zN + 10 }, // drop-off + pool
    { x: 0, z: B.fab2.z, w: 190, d: 14 }, // sky bridge line
    { x: 0, z: B.pavilion.z - 6, w: 110, d: 60 }, // pavilion
    { x: B.restGlass.x, z: B.restGlass.z, w: 90, d: 50 }, { x: B.restJp.x, z: B.restJp.z, w: 90, d: 50 },
    { x: 0, z: -334, w: 200, d: 20 }, // gate
    { x: 0, z: -338, w: 210, d: 30 }, // gate forecourt apron
    { x: 0, z: -95, w: 26, d: 150 }, // causeway
];
export const BEDS = [
    // gate plaza: two pairs of linear tree beds flanking the central walk
    ...[-56, -20, 20, 56].map(x => ({ x, z: -281, w: 3.2, d: 50, kind: 'linear' })),
    // hall forecourt: beds either side of the axis before the pool, flanking the pool, and at the hall front
    ...[-14, 14].map(x => ({ x, z: -247, w: 8, d: 5, kind: 'shrub' })),
    ...[-27, 27].map(x => ({ x, z: -232, w: 12, d: 12, kind: 'shrub' })),
    ...[-38, 38].map(x => ({ x, z: -217, w: 14, d: 6, kind: 'shrub' })),
];
export const HALL_FORECOURT = { x: 0, z: -229, w: 160, d: 50 }; // paved (sits under the pond water where they overlap)
export const CAUSEWAY = { z0: squeeze(-162), z1: squeeze(-6) };
export function inRect(x, z, r, m = 0) {
    return Math.abs(x - r.x) < r.w / 2 + m && Math.abs(z - r.z) < r.d / 2 + m;
}
