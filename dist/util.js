import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
/** Deterministic PRNG (mulberry32) so every rebuild yields the same campus. */
export function rng(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
/** 2D value noise + fBm, seeded. */
export function makeNoise2D(seed) {
    const r = rng(seed);
    const perm = new Uint8Array(512);
    const p = Array.from({ length: 256 }, (_, i) => i);
    for (let i = 255; i > 0; i--) {
        const j = Math.floor(r() * (i + 1));
        [p[i], p[j]] = [p[j], p[i]];
    }
    for (let i = 0; i < 512; i++)
        perm[i] = p[i & 255];
    const vals = Array.from({ length: 256 }, () => r());
    const fade = (t) => t * t * (3 - 2 * t);
    const noise = (x, y) => {
        const xi = Math.floor(x), yi = Math.floor(y);
        const xf = x - xi, yf = y - yi;
        const h = (a, b) => vals[perm[(perm[a & 255] + b) & 255]];
        const v00 = h(xi, yi), v10 = h(xi + 1, yi), v01 = h(xi, yi + 1), v11 = h(xi + 1, yi + 1);
        const u = fade(xf), v = fade(yf);
        return (v00 * (1 - u) + v10 * u) * (1 - v) + (v01 * (1 - u) + v11 * u) * v;
    };
    const fbm = (x, y, oct = 5) => {
        let s = 0, a = 0.5, f = 1, n = 0;
        for (let i = 0; i < oct; i++) {
            s += a * noise(x * f, y * f);
            n += a;
            a *= 0.5;
            f *= 2.03;
        }
        return s / n;
    };
    return { noise, fbm };
}
/**
 * Collects geometries per material and merges them into one mesh per material.
 * Keeps draw calls low while every building stays its own clickable Group.
 */
export class Batch {
    /** part tag -> material -> geometries. Tags map 1:1 to object-sculpt-spec componentTree ids. */
    buckets = new Map();
    current = '';
    /** Subsequent geometry belongs to spec component `id` (built as its own named, pickable group). */
    tag(id) { this.current = id; return this; }
    add(geo, mat, m) {
        let g = geo.index ? geo.toNonIndexed() : geo.clone();
        if (!g.getAttribute('uv')) {
            const n = g.getAttribute('position').count;
            g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
        }
        if (!g.getAttribute('normal'))
            g.computeVertexNormals();
        for (const k of Object.keys(g.attributes))
            if (!['position', 'normal', 'uv'].includes(k))
                g.deleteAttribute(k);
        if (m)
            g.applyMatrix4(m);
        let byMat = this.buckets.get(this.current);
        if (!byMat) {
            byMat = new Map();
            this.buckets.set(this.current, byMat);
        }
        let arr = byMat.get(mat);
        if (!arr) {
            arr = [];
            byMat.set(mat, arr);
        }
        arr.push(g);
    }
    box(w, h, d, mat, x, y, z, ry = 0) {
        const g = new THREE.BoxGeometry(w, h, d);
        this.add(g, mat, trs(x, y + h / 2, z, ry));
    }
    build(group, opts = {}) {
        for (const [tag, byMat] of this.buckets) {
            let target = group;
            if (tag) {
                target = group.children.find(c => c.name === tag) ?? new THREE.Group();
                target.name = tag;
                target.userData.part = tag;
                if (!target.parent)
                    group.add(target);
            }
            for (const [mat, list] of byMat) {
                if (!list.length)
                    continue;
                const merged = mergeGeometries(list, false);
                if (!merged)
                    continue;
                const mesh = new THREE.Mesh(merged, mat);
                mesh.name = `${tag || group.name}:${mat.name || mat.type}`;
                mesh.castShadow = opts.castShadow ?? true;
                mesh.receiveShadow = opts.receiveShadow ?? true;
                target.add(mesh);
            }
        }
        this.buckets.clear();
        this.current = '';
        return group;
    }
}
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
export function trs(x, y, z, ry = 0, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    _e.set(rx, ry, rz);
    _q.setFromEuler(_e);
    return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), _q, new THREE.Vector3(sx, sy, sz));
}
/** Box whose side-face UVs are measured in metres / tile size so facade textures never stretch. */
export function facadeBox(w, h, d, tileW, tileH = h) {
    const g = new THREE.BoxGeometry(w, h, d);
    const uv = g.getAttribute('uv');
    // BoxGeometry face order: +x, -x, +y, -y, +z, -z (4 verts each)
    const faceDims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) {
        const [fw, fh] = faceDims[f];
        for (let i = 0; i < 4; i++) {
            const idx = f * 4 + i;
            uv.setXY(idx, uv.getX(idx) * fw / tileW, uv.getY(idx) * fh / tileH);
        }
    }
    return g;
}
/** Rounded rectangle as a closed list of points (x,z). */
export function roundedRectPts(cx, cz, w, d, r, seg = 10) {
    const pts = [];
    const hw = w / 2 - r, hd = d / 2 - r;
    const corners = [[hw, -hd, -Math.PI / 2], [hw, hd, 0], [-hw, hd, Math.PI / 2], [-hw, -hd, Math.PI]];
    for (const [x, z, a0] of corners) {
        for (let i = 0; i <= seg; i++) {
            const a = a0 + (i / seg) * (Math.PI / 2);
            pts.push(new THREE.Vector2(cx + x + Math.cos(a) * r, cz + z + Math.sin(a) * r));
        }
    }
    return pts;
}
/**
 * Ribbon (road / path) along a polyline on the ground, UV.x = distance in metres / uvScale,
 * UV.y = 0..1 across. Suitable for lane-marking textures.
 */
export function ribbon(pts, width, closed, y = 0, uvScale = 20) {
    const P = closed ? [...pts, pts[0]] : pts;
    const pos = [], uv = [], idx = [];
    let dist = 0;
    for (let i = 0; i < P.length; i++) {
        const prev = P[Math.max(0, i - 1)], next = P[Math.min(P.length - 1, i + 1)];
        let tx = next.x - prev.x, tz = next.y - prev.y;
        if (closed && (i === 0 || i === P.length - 1)) {
            const a = P[P.length - 2], b = P[1];
            tx = b.x - a.x;
            tz = b.y - a.y;
        }
        const L = Math.hypot(tx, tz) || 1;
        const nx = -tz / L, nz = tx / L;
        if (i > 0)
            dist += P[i].distanceTo(P[i - 1]);
        pos.push(P[i].x + nx * width / 2, y, P[i].y + nz * width / 2, P[i].x - nx * width / 2, y, P[i].y - nz * width / 2);
        uv.push(dist / uvScale, 0, dist / uvScale, 1);
        if (i > 0) {
            const a = (i - 1) * 2;
            idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    // guarantee upward normals regardless of winding
    const n = g.getAttribute('normal');
    if (n.getY(0) < 0) {
        for (let i = 0; i < n.count; i++)
            n.setXYZ(i, 0, 1, 0);
        g.setIndex(idx.map((_, k) => idx[k - (k % 3) + [0, 2, 1][k % 3]]));
    }
    return g;
}
/** Closed Catmull-Rom smoothing of a coarse (x,z) outline. */
export function smoothClosed(pts, samples = 200) {
    const curve = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'centripetal');
    return curve.getSpacedPoints(samples).slice(0, -1).map(v => new THREE.Vector2(v.x, v.z));
}
export function pointInPoly(x, z, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i].x, zi = poly[i].y, xj = poly[j].x, zj = poly[j].y;
        if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi)
            inside = !inside;
    }
    return inside;
}
/** Shape in the XZ plane (Shape uses x,y -> we map y to -z after rotating -90° about X). */
export function shapeFromPts(pts) {
    return new THREE.Shape(pts.map(p => new THREE.Vector2(p.x, -p.y)));
}
/** Flat ground polygon at height y. */
export function flatPoly(pts, y, uvScale = 1) {
    const g = new THREE.ShapeGeometry(shapeFromPts(pts), 1);
    g.rotateX(-Math.PI / 2);
    g.translate(0, y, 0);
    const pos = g.getAttribute('position'), uv = g.getAttribute('uv');
    for (let i = 0; i < pos.count; i++)
        uv.setXY(i, pos.getX(i) / uvScale, pos.getZ(i) / uvScale);
    return g;
}
/** Extruded solid from an XZ outline, bottom at y0, height h. */
export function extrudePoly(pts, y0, h, bevel = 0) {
    const g = new THREE.ExtrudeGeometry(shapeFromPts(pts), {
        depth: h, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: 6,
    });
    g.rotateX(-Math.PI / 2);
    g.translate(0, y0, 0);
    return g;
}
/** Offset a closed polyline outward (positive d) — adequate for smooth outlines. */
export function offsetClosed(pts, d) {
    const n = pts.length;
    // orientation
    let area = 0;
    for (let i = 0; i < n; i++) {
        const a = pts[i], b = pts[(i + 1) % n];
        area += a.x * b.y - b.x * a.y;
    }
    const s = area > 0 ? -1 : 1;
    return pts.map((p, i) => {
        const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
        const tx = b.x - a.x, tz = b.y - a.y, L = Math.hypot(tx, tz) || 1;
        return new THREE.Vector2(p.x + s * (tz / L) * d, p.y - s * (tx / L) * d);
    });
}
export function polyline(points) {
    return points.map(([x, z]) => new THREE.Vector2(x, z));
}
