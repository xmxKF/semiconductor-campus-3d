import * as THREE from 'three';
import { trs } from './util.js?v=bd76b00c2d';
export function roofGeometry(W, D, H, style, opts = {}) {
    const D2 = D / 2, W2 = W / 2;
    const concave = style === 'hip' ? 1.0 : style === 'irimoya' ? 1.35 : 1.6;
    const f = (t) => Math.pow(Math.min(Math.max(t, 0), 1), concave);
    const gableH = style === 'hip' ? Infinity : H * (opts.gableFrac ?? 0.45); // height at which the hip skirt meets the 山花
    // x where hip slope from the end eave reaches gableH
    const tg = style === 'hip' ? 1 : Math.pow(gableH / H, 1 / concave);
    const xg = W2 - tg * D2; // gable line
    const U = opts.upturn ?? (style === 'xieshan' ? H * 0.22 : style === 'irimoya' ? H * 0.08 : 0);
    const corner = Math.min(W2, D2) * 0.6;
    // sample columns: uniform + exact duplicates around xg to make the 山花 vertical and crisp
    const nx = opts.nx ?? 64, nz = opts.nz ?? 32;
    const xs = [];
    for (let i = 0; i <= nx; i++)
        xs.push(-W2 + (W * i) / nx);
    if (style !== 'hip' && xg > 0) {
        xs.push(-xg - 0.001, -xg + 0.001, xg - 0.001, xg + 0.001);
    }
    xs.sort((a, b) => a - b);
    const zs = [];
    for (let j = 0; j <= nz; j++)
        zs.push(-D2 + (D * j) / nz);
    zs.push(0);
    zs.sort((a, b) => a - b);
    const height = (x, z) => {
        const dz = D2 - Math.abs(z), dx = W2 - Math.abs(x);
        let h;
        const hz = H * f(dz / D2), hx = H * f(dx / D2);
        // inside the gable line the section is a pure gable; outside, the hip skirt (capped at gableH
        // by construction because hx(xg) == gableH) — the jump at |x| = xg is the vertical 山花
        h = style !== 'hip' && Math.abs(x) < xg ? hz : Math.min(hz, hx);
        // corner upturn
        if (U > 0) {
            const cx = Math.max(0, 1 - dx / corner), cz = Math.max(0, 1 - dz / corner);
            h += U * cx * cx * cz * cz * 1.0 + U * 0.35 * (cx * cx * (dz < corner * 0.4 ? 1 - dz / (corner * 0.4) : 0) + cz * cz * (dx < corner * 0.4 ? 1 - dx / (corner * 0.4) : 0));
        }
        return h;
    };
    const pos = [], uv = [], idx = [];
    for (let j = 0; j < zs.length; j++)
        for (let i = 0; i < xs.length; i++) {
            const x = xs[i], z = zs[j];
            const h = height(x, z);
            pos.push(x, h, z);
            const dz = D2 - Math.abs(z), dx = W2 - Math.abs(x);
            const onLongSlope = Math.abs(x) < xg || dz < dx;
            // tile rows run down-slope: u across slope (metres / 1 tile), v down slope
            if (onLongSlope)
                uv.push(x / 4, z / 4);
            else
                uv.push(z / 4, x / 4);
        }
    const cols = xs.length;
    for (let j = 0; j < zs.length - 1; j++)
        for (let i = 0; i < cols - 1; i++) {
            const a = j * cols + i, b = a + 1, c = a + cols, d = c + 1;
            idx.push(a, c, b, b, c, d);
        }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return { geo: g, height, xg, gableH, U };
}
/**
 * Full roof assembly: tile surface, eave fascia/underside, 山花 gable boards, ridges
 * (正脊 + 垂脊 + 戗脊) as swept tubes that follow the surface, and 鸱吻 ridge-end ornaments.
 */
export function buildRoof(b, M, x, y, z, W, D, H, style, rot = 0, opts = {}) {
    const { geo, height, xg, gableH } = roofGeometry(W, D, H, style, opts);
    const base = trs(x, y, z, rot);
    const surf = opts.surfaceMat ?? M['roof-tile'];
    b.add(geo, surf, base);
    // underside (flipped copy lowered slightly) so the roof reads solid from below
    const under = geo.clone();
    under.scale(1, 1, 1);
    const ix = under.getIndex();
    const arr = ix.array;
    for (let i = 0; i < arr.length; i += 3) {
        const t = arr[i + 1];
        arr[i + 1] = arr[i + 2];
        arr[i + 2] = t;
    }
    under.translate(0, -0.35, 0);
    under.computeVertexNormals();
    b.add(under, M['timber'], base);
    const ridgeMat = opts.ridgeMat ?? M['ridge-tile'];
    const W2 = W / 2, D2 = D / 2;
    const tube = (pts, r) => {
        if (pts.length < 2)
            return;
        const c = new THREE.CatmullRomCurve3(pts);
        b.add(new THREE.TubeGeometry(c, Math.max(8, pts.length * 2), r, 6, false), ridgeMat, base);
    };
    const ridgeR = Math.max(0.18, H * 0.05);
    if (style === 'hip') {
        // 4 hip ridges + short top ridge
        const top = Math.max(0, W2 - D2);
        tube([new THREE.Vector3(-top, H + 0.1, 0), new THREE.Vector3(top, H + 0.1, 0)], ridgeR * 0.8);
        for (const sx of [-1, 1])
            for (const sz of [-1, 1]) {
                const pts = [];
                for (let t = 0; t <= 1.0001; t += 0.1) {
                    const px = sx * (top + (W2 - top) * t), pz = sz * D2 * t;
                    pts.push(new THREE.Vector3(px, height(px * 0.999, pz * 0.999) + 0.1, pz));
                }
                tube(pts, ridgeR * 0.7);
            }
        // eave fascia
        b.add(new THREE.BoxGeometry(W, 0.4, 0.3), M['timber'], trs(x, y + 0.1, z, rot).multiply(trs(0, 0, D2)));
        return;
    }
    // 正脊 main ridge with slight upward sweep at the ends
    const ridge = [];
    for (let t = -1; t <= 1.0001; t += 0.1)
        ridge.push(new THREE.Vector3(t * xg, H + ridgeR * 1.4 + Math.pow(Math.abs(t), 6) * H * 0.08, 0));
    tube(ridge, ridgeR * 1.3);
    b.add(new THREE.BoxGeometry(xg * 2, ridgeR * 2.2, ridgeR * 1.6), ridgeMat, base.clone().multiply(trs(0, H + ridgeR * 0.6, 0)));
    // 鸱吻 ornaments: curled fish-tail as a small lathe-like bent tube at both ends
    if (style === 'xieshan') {
        for (const sx of [-1, 1]) {
            const pts = [0, 0.3, 0.6, 0.85, 1].map((t) => new THREE.Vector3(sx * (xg + 0.2 - t * 0.9 * (t > 0.6 ? 1 : 0.3)), H + ridgeR * 1.5 + t * H * 0.28, 0));
            b.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, ridgeR * 1.2, 6), ridgeMat, base);
            b.add(new THREE.SphereGeometry(ridgeR * 1.3, 8, 6), ridgeMat, base.clone().multiply(trs(sx * (xg - 0.5), H + ridgeR * 1.5 + H * 0.28, 0)));
        }
    }
    else {
        for (const sx of [-1, 1])
            b.add(new THREE.BoxGeometry(0.8, ridgeR * 3.2, ridgeR * 2.2), ridgeMat, base.clone().multiply(trs(sx * xg, H + ridgeR * 1.2, 0)));
    }
    // 垂脊 (4): from ridge end down the gable edge to the gable-skirt line
    for (const sx of [-1, 1])
        for (const sz of [-1, 1]) {
            const pts = [];
            for (let t = 0; t <= 1.0001; t += 0.08) {
                const pz = sz * D2 * t;
                const hz = height(sx * (xg - 0.01), pz);
                if (hz < gableH - 0.05)
                    break;
                pts.push(new THREE.Vector3(sx * (xg + 0.05), hz + ridgeR * 0.6, pz));
            }
            tube(pts, ridgeR * 0.8);
            // 戗脊: from the gable foot diagonally to the corner
            const start = pts.length ? pts[pts.length - 1] : new THREE.Vector3(sx * xg, gableH, 0);
            const dp = [];
            for (let t = 0; t <= 1.0001; t += 0.08) {
                const px = start.x + (sx * W2 - start.x) * t;
                const pz = start.z + (sz * D2 - start.z) * t;
                dp.push(new THREE.Vector3(px, height(px * 0.999, pz * 0.999) + ridgeR * 0.6, pz));
            }
            tube(dp, ridgeR * 0.75);
            // small upturned tip ornament (仙人走兽 simplified as a finial)
            b.add(new THREE.ConeGeometry(ridgeR * 0.9, ridgeR * 3, 6), ridgeMat, base.clone().multiply(trs(dp[dp.length - 1].x, dp[dp.length - 1].y + ridgeR, dp[dp.length - 1].z)));
        }
    // 山花 gable boards: vertical triangle panels at ±xg, inset (收山)
    for (const sx of [-1, 1]) {
        const shape = new THREE.Shape();
        const steps = 16;
        shape.moveTo(-D2 * 0.98, gableH);
        for (let i = 0; i <= steps; i++) {
            const zz = -D2 + (D * i) / steps;
            const hz = height(sx * (xg - 0.02), zz);
            shape.lineTo(zz * 0.98, Math.max(gableH, hz - 0.05));
        }
        shape.lineTo(D2 * 0.98, gableH);
        const g = new THREE.ShapeGeometry(shape);
        g.rotateY(Math.PI / 2 * sx);
        b.add(g, style === 'xieshan' ? M['column-red'] : M['timber'], base.clone().multiply(trs(sx * (xg - 0.15), 0, 0)));
        // 博风板 barge board trim following the gable edge
        const bp = [];
        for (let i = 0; i <= steps; i++) {
            const zz = -D2 + (D * i) / steps;
            const hz = height(sx * (xg - 0.02), zz);
            if (hz >= gableH)
                bp.push(new THREE.Vector3(sx * (xg + 0.02), hz - 0.1, zz));
        }
        if (bp.length > 1)
            b.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(bp), 24, 0.12, 4), M['timber'], base);
    }
    // eave fascia boards (follow the upturn along the long edges)
    for (const sz of [-1, 1]) {
        const pts = [];
        for (let t = -1; t <= 1.0001; t += 0.05)
            pts.push(new THREE.Vector3(t * W2 * 0.999, height(t * W2 * 0.999, sz * D2 * 0.999) - 0.15, sz * D2));
        b.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.16, 4), M['timber'], base);
    }
    for (const sx of [-1, 1]) {
        const pts = [];
        for (let t = -1; t <= 1.0001; t += 0.05)
            pts.push(new THREE.Vector3(sx * W2, height(sx * W2 * 0.999, t * D2 * 0.999) - 0.15, t * D2));
        b.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.16, 4), M['timber'], base);
    }
}
