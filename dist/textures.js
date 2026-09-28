import * as THREE from 'three';
import { rng, makeNoise2D } from './util.js?v=b3d95c4e38';
function canvasTex(w, h, draw, opts = {}) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    draw(ctx, w, h);
    const t = new THREE.CanvasTexture(c);
    if (opts.srgb !== false)
        t.colorSpace = THREE.SRGBColorSpace;
    if (opts.repeat !== false) {
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
    }
    t.anisotropy = opts.aniso ?? 8;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    return t;
}
function speckle(ctx, w, h, seed, amount, alpha, light = false) {
    const r = rng(seed);
    for (let i = 0; i < amount; i++) {
        const v = light ? 255 : 0;
        ctx.fillStyle = `rgba(${v},${v},${v},${r() * alpha})`;
        ctx.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2);
    }
}
/**
 * FAB / lab insulated-metal-panel facade. One tile = tileW metres wide × full wall height.
 * Vertical panel seams every ~1.2 m, dark louvre band(s), darker plinth, subtle weathering streaks.
 */
export function panelFacadeTex(bands, bandH, opts = {}) {
    return canvasTex(512, 512, (ctx, w, h) => {
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, '#e4e6e7');
        g.addColorStop(0.7, '#d8dadc');
        g.addColorStop(1, '#cfd2d4');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
        // panel seams
        const seams = 24;
        for (let i = 0; i < seams; i++) {
            const x = (i / seams) * w;
            ctx.fillStyle = 'rgba(120,125,130,0.35)';
            ctx.fillRect(x, 0, 1.2, h);
            ctx.fillStyle = 'rgba(255,255,255,0.35)';
            ctx.fillRect(x + 1.2, 0, 1, h);
        }
        // horizontal panel joints
        for (let y = 0; y < h; y += h / 9) {
            ctx.fillStyle = 'rgba(130,134,138,0.25)';
            ctx.fillRect(0, y, w, 1);
        }
        // weathering streaks
        const r = rng(opts.seed ?? 7);
        for (let i = 0; i < 40; i++) {
            ctx.fillStyle = `rgba(90,95,100,${r() * 0.05})`;
            ctx.fillRect(r() * w, r() * h * 0.3, 2 + r() * 4, h * (0.2 + r() * 0.6));
        }
        // louvre bands (v measured bottom-up in world, canvas is top-down)
        for (const b of bands) {
            const y = h - b * h;
            ctx.fillStyle = '#5a6168';
            ctx.fillRect(w * 0.04, y - bandH * h, w * 0.92, bandH * h);
            for (let k = 0; k < bandH * h; k += 3) {
                ctx.fillStyle = 'rgba(30,34,38,0.55)';
                ctx.fillRect(w * 0.04, y - bandH * h + k, w * 0.92, 1);
            }
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            ctx.fillRect(w * 0.04, y, w * 0.92, 1.5);
        }
        if (opts.plinth !== false) {
            ctx.fillStyle = '#b9bcbf';
            ctx.fillRect(0, h * 0.965, w, h * 0.035);
        }
        if (opts.doors) {
            ctx.fillStyle = '#6d7379';
            ctx.fillRect(w * 0.1, h * 0.88, w * 0.08, h * 0.085);
            ctx.fillStyle = '#7d848a';
            ctx.fillRect(w * 0.62, h * 0.86, w * 0.12, h * 0.105);
            for (let k = 0; k < 8; k++) {
                ctx.fillStyle = 'rgba(0,0,0,0.2)';
                ctx.fillRect(w * 0.62, h * 0.86 + k * h * 0.013, w * 0.12, 1);
            }
        }
        speckle(ctx, w, h, 11, 3000, 0.06);
    });
}
/** Ribbon-window facade (掩膜厂 / 实验室): two long dark window strips. */
export function ribbonFacadeTex() {
    {
        return canvasTex(512, 512, (ctx, w, h) => {
            ctx.fillStyle = '#dfe1e2';
            ctx.fillRect(0, 0, w, h);
            for (let i = 0; i < 20; i++) {
                ctx.fillStyle = 'rgba(120,125,130,0.28)';
                ctx.fillRect((i / 20) * w, 0, 1, h);
            }
            const strips = [0.42, 0.62];
            for (const s of strips) {
                const y = h - s * h;
                ctx.fillStyle = '#2f3a44';
                ctx.fillRect(0, y - 14, w, 14);
                for (let x = 0; x < w; x += 16) {
                    ctx.fillStyle = '#56626d';
                    ctx.fillRect(x, y - 14, 2, 14);
                }
                ctx.fillStyle = 'rgba(160,190,210,0.25)';
                ctx.fillRect(0, y - 14, w, 4);
            }
            ctx.fillStyle = '#bfc2c4';
            ctx.fillRect(0, h * 0.96, w, h * 0.04);
            speckle(ctx, w, h, 5, 2500, 0.05);
        });
    }
}
/**
 * Curtain wall glass. One tile = `cols` mullion bays × `floors` storeys.
 * Glass panes with vertical sky-reflection gradient, per-pane value jitter, spandrel bands.
 */
export function curtainWallTex(cols, floors, opts = {}) {
    const r = rng(opts.seed ?? 21);
    const map = canvasTex(512, 512, (ctx, w, h) => {
        const cw = w / cols, fh = h / floors;
        for (let f = 0; f < floors; f++) {
            for (let c = 0; c < cols; c++) {
                const x = c * cw, y = f * fh;
                const g = ctx.createLinearGradient(x, y, x + cw * 0.6, y + fh);
                const j = (r() - 0.5) * 18;
                const lit = r() < (opts.warm ?? 0);
                if (lit) {
                    g.addColorStop(0, '#f5d9a2');
                    g.addColorStop(1, '#d9a861');
                }
                else {
                    g.addColorStop(0, `rgb(${120 + j},${150 + j},${175 + j})`);
                    g.addColorStop(0.55, `rgb(${70 + j},${96 + j},${122 + j})`);
                    g.addColorStop(1, `rgb(${55 + j},${76 + j},${98 + j})`);
                }
                ctx.fillStyle = g;
                ctx.fillRect(x, y, cw, fh);
                // interior hints (ceiling line, blinds)
                ctx.fillStyle = 'rgba(20,30,40,0.25)';
                ctx.fillRect(x, y + fh * 0.08, cw, fh * 0.05);
            }
            // spandrel / slab band
            ctx.fillStyle = '#7f8a94';
            ctx.fillRect(0, f * fh + fh * 0.9, w, fh * 0.1);
        }
        // mullions
        for (let c = 0; c <= cols; c++) {
            ctx.fillStyle = '#9aa3ab';
            ctx.fillRect(c * cw - 2, 0, 4, h);
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            ctx.fillRect(c * cw - 2, 0, 1, h);
        }
        // diagonal sky streak
        ctx.globalCompositeOperation = 'screen';
        const s = ctx.createLinearGradient(0, 0, w, h);
        s.addColorStop(0.3, 'rgba(255,255,255,0)');
        s.addColorStop(0.45, 'rgba(210,230,245,0.22)');
        s.addColorStop(0.6, 'rgba(255,255,255,0)');
        ctx.fillStyle = s;
        ctx.fillRect(0, 0, w, h);
        ctx.globalCompositeOperation = 'source-over';
    });
    return map;
}
/** Warm-lit glazing with timber mullions — restaurants and pavilion halls. */
export function warmGlazingTex(cols, rows, frame = '#3b2c20') {
    return canvasTex(512, 256, (ctx, w, h) => {
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, '#f8e2b0');
        g.addColorStop(0.6, '#e7b870');
        g.addColorStop(1, '#c98c45');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
        const r = rng(9);
        for (let i = 0; i < 26; i++) {
            ctx.fillStyle = `rgba(90,55,25,${0.15 + r() * 0.2})`;
            ctx.fillRect(r() * w, h * (0.55 + r() * 0.35), 6 + r() * 14, 8 + r() * 20);
        }
        for (let c = 0; c <= cols; c++) {
            ctx.fillStyle = frame;
            ctx.fillRect(c * w / cols - 3, 0, 6, h);
        }
        for (let rr = 0; rr <= rows; rr++) {
            ctx.fillStyle = frame;
            ctx.fillRect(0, rr * h / rows - 2, w, 4);
        }
        for (let c = 0; c < cols * 3; c++) {
            ctx.fillStyle = 'rgba(60,40,25,0.5)';
            ctx.fillRect(c * w / (cols * 3), 0, 1.5, h);
        }
    });
}
/** Clay roof tile rows: returns {map,bump}. u runs across slope, v down-slope. */
export function roofTileTex() {
    const draw = (ctx, w, h) => {
        ctx.fillStyle = '#41464d';
        ctx.fillRect(0, 0, w, h);
        const n = 16;
        for (let i = 0; i < n; i++) {
            const x = (i / n) * w;
            const g = ctx.createLinearGradient(x, 0, x + w / n, 0);
            g.addColorStop(0, '#2b2f34');
            g.addColorStop(0.35, '#555b62');
            g.addColorStop(0.7, '#3d4248');
            g.addColorStop(1, '#23272b');
            ctx.fillStyle = g;
            ctx.fillRect(x, 0, w / n, h);
        }
        for (let y = 0; y < h; y += h / 24) {
            ctx.fillStyle = 'rgba(0,0,0,0.25)';
            ctx.fillRect(0, y, w, 1.5);
        }
        speckle(ctx, w, h, 4, 1500, 0.12, true);
    };
    const map = canvasTex(256, 256, draw);
    const bump = canvasTex(256, 256, (ctx, w, h) => {
        const n = 16;
        for (let i = 0; i < n; i++) {
            const x = (i / n) * w;
            const g = ctx.createLinearGradient(x, 0, x + w / n, 0);
            g.addColorStop(0, '#000');
            g.addColorStop(0.45, '#fff');
            g.addColorStop(1, '#000');
            ctx.fillStyle = g;
            ctx.fillRect(x, 0, w / n, h);
        }
    }, { srgb: false });
    return { map, bump };
}
/** Granite pavers with joint grid, 1 tile = 8 m. */
export function pavingTex() {
    return canvasTex(512, 512, (ctx, w, h) => {
        ctx.fillStyle = '#d9d6cf';
        ctx.fillRect(0, 0, w, h);
        const r = rng(33);
        const s = w / 16;
        for (let y = 0; y < 16; y++)
            for (let x = 0; x < 16; x++) {
                const v = 205 + (r() - 0.5) * 22;
                ctx.fillStyle = `rgb(${v},${v - 2},${v - 7})`;
                ctx.fillRect(x * s + 1, y * s + 1, s - 2, s - 2);
            }
        ctx.strokeStyle = 'rgba(150,146,138,0.9)';
        ctx.lineWidth = 3;
        for (let i = 0; i <= 4; i++) {
            ctx.beginPath();
            ctx.moveTo(i * w / 4, 0);
            ctx.lineTo(i * w / 4, h);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, i * h / 4);
            ctx.lineTo(w, i * h / 4);
            ctx.stroke();
        }
        speckle(ctx, w, h, 8, 5000, 0.08);
    });
}
/** Asphalt base noise. */
export function asphaltTex() {
    return canvasTex(256, 256, (ctx, w, h) => {
        ctx.fillStyle = '#4b4e52';
        ctx.fillRect(0, 0, w, h);
        speckle(ctx, w, h, 2, 9000, 0.25);
        speckle(ctx, w, h, 3, 4000, 0.12, true);
    });
}
/** Road ribbon texture: u along road (1 tile = uvScale m), v across. lanes = lanes per direction. */
export function roadTex(lanes, opts = {}) {
    return canvasTex(256, 256, (ctx, w, h) => {
        ctx.fillStyle = '#505357';
        ctx.fillRect(0, 0, w, h);
        speckle(ctx, w, h, 12, 5000, 0.22);
        speckle(ctx, w, h, 13, 2000, 0.1, true);
        // tyre wear lanes
        const total = lanes * 2;
        for (let i = 0; i < total; i++) {
            const y = ((i + 0.5) / total) * h;
            ctx.fillStyle = 'rgba(30,30,32,0.18)';
            ctx.fillRect(0, y - h / total * 0.3, w, h / total * 0.12);
            ctx.fillRect(0, y + h / total * 0.18, w, h / total * 0.12);
        }
        ctx.fillStyle = '#ececec';
        if (opts.edge !== false) {
            ctx.fillRect(0, h * 0.03, w, 3);
            ctx.fillRect(0, h * 0.97 - 3, w, 3);
        }
        for (let i = 1; i < total; i++) {
            const y = (i / total) * h;
            if (i === lanes) {
                if (opts.median) {
                    ctx.fillStyle = '#9a9c9e';
                    ctx.fillRect(0, y - 5, w, 10);
                    ctx.fillStyle = '#ececec';
                }
                else {
                    ctx.fillStyle = '#e8c547';
                    ctx.fillRect(0, y - 4, w, 3);
                    ctx.fillRect(0, y + 1, w, 3);
                    ctx.fillStyle = '#ececec';
                }
            }
            else {
                for (let x = 0; x < w; x += 64)
                    ctx.fillRect(x, y - 1.5, 34, 3);
            }
        }
    }, { aniso: 16 });
}
/** Parking lot: bays 2.5 m × 5.5 m with double rows and a drive aisle. 1 tile = 40m × 20m. */
export function parkingTex() {
    return canvasTex(512, 256, (ctx, w, h) => {
        ctx.fillStyle = '#55585c';
        ctx.fillRect(0, 0, w, h);
        speckle(ctx, w, h, 22, 6000, 0.2);
        ctx.fillStyle = '#e6e6e6';
        const bay = w / 16;
        for (let i = 0; i <= 16; i++) {
            ctx.fillRect(i * bay - 1, 0, 2, h * 0.27);
            ctx.fillRect(i * bay - 1, h * 0.73, 2, h * 0.27);
        }
        ctx.fillRect(0, h * 0.27, w, 2);
        ctx.fillRect(0, h * 0.73 - 2, w, 2);
        // oil spots
        const r = rng(5);
        for (let i = 0; i < 16; i++) {
            ctx.fillStyle = 'rgba(20,20,20,0.18)';
            ctx.beginPath();
            ctx.ellipse(i * bay + bay / 2, h * (r() < 0.5 ? 0.14 : 0.86), 6, 10, 0, 0, 7);
            ctx.fill();
        }
    });
}
/** Lawn with mowing stripes and colour noise. */
export function grassTex(seed = 1, base = [110, 154, 69]) {
    const { fbm } = makeNoise2D(seed);
    return canvasTex(512, 512, (ctx, w, h) => {
        const img = ctx.createImageData(w, h);
        for (let y = 0; y < h; y++)
            for (let x = 0; x < w; x++) {
                const n = fbm(x / 60, y / 60, 4) - 0.5;
                const stripe = Math.floor(x / 64) % 2 ? 6 : -6;
                const k = (y * w + x) * 4;
                const grain = (Math.random() - 0.5) * 14;
                img.data[k] = base[0] + n * 50 + stripe + grain;
                img.data[k + 1] = base[1] + n * 55 + stripe + grain;
                img.data[k + 2] = base[2] + n * 30 + grain * 0.5;
                img.data[k + 3] = 255;
            }
        ctx.putImageData(img, 0, 0);
    });
}
/** Large-scale ground colour for the forest floor / terrain outside the site. */
export function forestFloorTex() {
    const { fbm } = makeNoise2D(99);
    return canvasTex(512, 512, (ctx, w, h) => {
        const img = ctx.createImageData(w, h);
        for (let y = 0; y < h; y++)
            for (let x = 0; x < w; x++) {
                const n = fbm(x / 40, y / 40, 5);
                const k = (y * w + x) * 4;
                img.data[k] = 45 + n * 50;
                img.data[k + 1] = 78 + n * 60;
                img.data[k + 2] = 38 + n * 30;
                img.data[k + 3] = 255;
            }
        ctx.putImageData(img, 0, 0);
    });
}
/** Tangent-space water normal map from summed sine waves + noise (tileable). */
export function waterNormalTex() {
    const { noise } = makeNoise2D(5);
    const S = 256;
    const hgt = new Float32Array(S * S);
    for (let y = 0; y < S; y++)
        for (let x = 0; x < S; x++) {
            const u = (x / S) * Math.PI * 2, v = (y / S) * Math.PI * 2;
            hgt[y * S + x] = Math.sin(u * 3 + v * 2) * 0.5 + Math.sin(u * 7 - v * 5) * 0.25 + Math.sin(u * 13 + v * 11) * 0.12 + noise(x / 16, y / 16) * 0.1;
        }
    return canvasTex(S, S, (ctx) => {
        const img = ctx.createImageData(S, S);
        for (let y = 0; y < S; y++)
            for (let x = 0; x < S; x++) {
                const hx = hgt[y * S + ((x + 1) % S)] - hgt[y * S + ((x - 1 + S) % S)];
                const hy = hgt[((y + 1) % S) * S + x] - hgt[((y - 1 + S) % S) * S + x];
                const nx = -hx * 1.5, ny = -hy * 1.5, nz = 1;
                const L = Math.hypot(nx, ny, nz);
                const k = (y * S + x) * 4;
                img.data[k] = (nx / L * 0.5 + 0.5) * 255;
                img.data[k + 1] = (ny / L * 0.5 + 0.5) * 255;
                img.data[k + 2] = (nz / L * 0.5 + 0.5) * 255;
                img.data[k + 3] = 255;
            }
        ctx.putImageData(img, 0, 0);
    }, { srgb: false });
}
/** Louvre grille for AHU / MAU sides. */
export function louvreTex() {
    return canvasTex(128, 128, (ctx, w, h) => {
        ctx.fillStyle = '#b5bbc0';
        ctx.fillRect(0, 0, w, h);
        for (let y = 8; y < h - 8; y += 5) {
            ctx.fillStyle = '#6f777e';
            ctx.fillRect(6, y, w - 12, 2.5);
            ctx.fillStyle = '#d8dde1';
            ctx.fillRect(6, y + 2.5, w - 12, 1);
        }
        ctx.strokeStyle = '#8c949b';
        ctx.lineWidth = 3;
        ctx.strokeRect(3, 3, w - 6, h - 6);
    });
}
/** Roof membrane with seams + walkway pads. 1 tile = 20 m. */
export function roofMembraneTex() {
    return canvasTex(512, 512, (ctx, w, h) => {
        ctx.fillStyle = '#bfc3c6';
        ctx.fillRect(0, 0, w, h);
        for (let x = 0; x < w; x += 26) {
            ctx.fillStyle = 'rgba(150,154,158,0.5)';
            ctx.fillRect(x, 0, 1, h);
        }
        const r = rng(17);
        for (let i = 0; i < 30; i++) {
            ctx.fillStyle = `rgba(120,124,128,${r() * 0.08})`;
            ctx.beginPath();
            ctx.ellipse(r() * w, r() * h, 20 + r() * 60, 10 + r() * 40, r() * 3, 0, 7);
            ctx.fill();
        }
        speckle(ctx, w, h, 19, 4000, 0.06);
    });
}
/** Stone cladding with coursing joints. 1 tile = 6 m. */
export function stoneTex() {
    return canvasTex(256, 256, (ctx, w, h) => {
        ctx.fillStyle = '#d9d1c1';
        ctx.fillRect(0, 0, w, h);
        const r = rng(41);
        const rows = 8;
        for (let y = 0; y < rows; y++) {
            const off = (y % 2) * 32;
            for (let x = -64; x < w; x += 64) {
                const v = 210 + (r() - 0.5) * 14;
                ctx.fillStyle = `rgb(${v},${v - 7},${v - 20})`;
                ctx.fillRect(x + off + 1, y * h / rows + 1, 62, h / rows - 2);
            }
        }
        speckle(ctx, w, h, 42, 2500, 0.08);
    });
}
/** Canvas label sprite texture (for flags etc). */
export function flagTex(colors) {
    return canvasTex(64, 40, (ctx, w, h) => {
        colors.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(0, (i * h) / colors.length, w, h / colors.length + 1); });
    }, { repeat: false });
}
/** Soft radial sprite (mist / spray). */
export function softSpriteTex() {
    return canvasTex(128, 128, (ctx, w, h) => {
        const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
        g.addColorStop(0, 'rgba(255,255,255,1)');
        g.addColorStop(0.4, 'rgba(255,255,255,0.5)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
    }, { repeat: false });
}
