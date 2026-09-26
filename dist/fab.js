import * as THREE from 'three';
import { Batch, trs, facadeBox, rng } from './util.js';
/**
 * Rooftop MEP kit shared by FABs, 掩膜厂 and 实验室.
 * Grounded in public fab references: roof-mounted packed-tower wet scrubbers (vertical
 * counter-flow cylinders), induced-draft cooling-tower fan stacks, MAU/AHU boxes, multi-tier
 * pipe racks carrying process exhaust / utilities.
 */
export class RoofKit {
    b;
    m;
    tags;
    /** tags: which spec component each equipment family belongs to (fans/scrubbers/racks/ahu/misc). */
    constructor(b, m, tags = {}) {
        this.b = b;
        this.m = m;
        this.tags = tags;
    }
    t(kind) { const id = this.tags[kind] ?? this.tags.misc; if (id)
        this.b.tag(id); }
    /** Induced-draft cooling-tower cell: louvred base box + flared lathe fan stack + blades + grille. */
    coolingCell(x, y, z, s = 1) {
        this.t('fans');
        const { b, m } = this;
        const cell = 13 * s;
        b.add(facadeBox(cell, 6 * s, cell, 6, 6), m['louvre'], trs(x, y + 3 * s, z));
        b.box(cell + 0.6, 0.4, cell + 0.6, m['steel-dark'], x, y + 6 * s, z);
        // flared fan stack (velocity-recovery stack) as lathe profile
        const r = 5.2 * s;
        // fan stack per public cooling-tower references: eased bell-mouth inlet, venturi throat around
        // the blade plane, then a velocity-recovery section diverging at ~7.5° (stack ≈ 4.5 m)
        const tan75 = Math.tan(THREE.MathUtils.degToRad(7.5));
        const th = 1.1 * s, top = 4.6 * s, rt = r * 0.86;
        const outer = [
            new THREE.Vector2(r * 1.05, 0), new THREE.Vector2(r * 0.96, 0.25 * s), new THREE.Vector2(r * 0.9, 0.6 * s), new THREE.Vector2(rt + 0.12, th),
            new THREE.Vector2(rt + 0.12 + (top - th) * tan75 * 0.5, (th + top) / 2), new THREE.Vector2(rt + 0.12 + (top - th) * tan75, top),
        ];
        const inner = outer.slice().reverse().map(v => new THREE.Vector2(v.x - 0.14, v.y));
        const prof = [...outer, new THREE.Vector2(outer[outer.length - 1].x - 0.07, top + 0.08), ...inner];
        b.add(new THREE.LatheGeometry(prof, 36), m['galvanized-steel'], trs(x, y + 6.2 * s, z));
        // stiffening rings
        for (const h of [2.2, 3.6])
            b.add(new THREE.TorusGeometry(rt + 0.14 + (h * s - th) * tan75, 0.1 * s, 6, 36), m['steel-dark'], trs(x, y + 6.2 * s + h * s, z, 0, Math.PI / 2));
        // dark fan throat + hub + 8 blades
        b.add(new THREE.CircleGeometry(r * 0.85, 32), m['fan-dark'], trs(x, y + 6.2 * s + th - 0.4 * s, z, 0, -Math.PI / 2));
        b.add(new THREE.CylinderGeometry(0.9 * s, 1.1 * s, 0.8 * s, 16), m['steel-dark'], trs(x, y + 6.2 * s + th - 0.1 * s, z));
        for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            b.add(new THREE.BoxGeometry(r * 0.72, 0.08 * s, 0.9 * s), m['galvanized-steel'], trs(x + Math.cos(a) * r * 0.42, y + 6.2 * s + th, z + Math.sin(a) * r * 0.42, -a, 0.25));
        }
        // grille: concentric rings + spokes
        for (const rr of [0.35, 0.65, 0.97])
            b.add(new THREE.TorusGeometry(r * rr * 1.02, 0.05 * s, 4, 32), m['steel-dark'], trs(x, y + 6.2 * s + top + 0.05, z, 0, Math.PI / 2));
        for (let i = 0; i < 6; i++)
            b.add(new THREE.BoxGeometry(r * 2, 0.08 * s, 0.08 * s), m['steel-dark'], trs(x, y + 6.2 * s + top + 0.05, z, (i / 6) * Math.PI));
        // service ladder
        this.ladder(x + cell / 2 + 0.3, y, z, 6 * s, 0);
    }
    /** Vertical packed-tower scrubber: body + conical top + exhaust stack + rings + ladder + platform. */
    scrubber(x, y, z, r, h, rot = 0) {
        this.t('scrubbers');
        const { b, m } = this;
        b.add(new THREE.CylinderGeometry(r * 1.15, r * 1.2, 1, 20), m['steel-dark'], trs(x, y + 0.5, z));
        b.add(new THREE.CylinderGeometry(r, r, h, 24), m['galvanized-steel'], trs(x, y + 1 + h / 2, z));
        b.add(new THREE.ConeGeometry(r, r * 0.9, 24), m['galvanized-steel'], trs(x, y + 1 + h + r * 0.45, z));
        b.add(new THREE.CylinderGeometry(r * 0.35, r * 0.35, h * 0.5, 14), m['pipe-paint'], trs(x, y + 1 + h + h * 0.25 + r * 0.4, z));
        b.add(new THREE.TorusGeometry(r * 0.38, 0.1, 5, 14), m['steel-dark'], trs(x, y + 1 + h * 1.5 + r * 0.4, z, 0, Math.PI / 2));
        for (let k = 1; k < 5; k++)
            b.add(new THREE.TorusGeometry(r * 1.01, 0.09, 5, 24), m['steel-dark'], trs(x, y + 1 + (h * k) / 5, z, 0, Math.PI / 2));
        // access platform ring
        b.add(new THREE.RingGeometry(r, r + 1.1, 24), m['steel-dark'], trs(x, y + 1 + h * 0.7, z, 0, -Math.PI / 2));
        b.add(new THREE.TorusGeometry(r + 1.05, 0.05, 4, 24), m['galvanized-steel'], trs(x, y + 2.1 + h * 0.7, z, 0, Math.PI / 2));
        // inlet duct stub
        b.add(new THREE.CylinderGeometry(r * 0.45, r * 0.45, r * 2.2, 14), m['pipe-paint'], trs(x + Math.cos(rot) * r * 1.4, y + 2 + r * 0.4, z + Math.sin(rot) * r * 1.4, -rot, 0, Math.PI / 2));
        this.ladder(x - Math.cos(rot) * (r + 0.3), y, z - Math.sin(rot) * (r + 0.3), h + 1, rot);
    }
    ladder(x, y, z, h, rot) {
        const { b, m } = this;
        const ox = Math.sin(rot) * 0.25, oz = Math.cos(rot) * 0.25;
        b.add(new THREE.BoxGeometry(0.06, h, 0.06), m['steel-dark'], trs(x + ox, y + h / 2, z + oz));
        b.add(new THREE.BoxGeometry(0.06, h, 0.06), m['steel-dark'], trs(x - ox, y + h / 2, z - oz));
        for (let k = 0.4; k < h; k += 0.6)
            b.add(new THREE.BoxGeometry(0.04, 0.04, 0.5), m['steel-dark'], trs(x, y + k, z, rot));
    }
    /** Horizontal storage tank on saddles. */
    tank(x, y, z, r, L, rot = 0) {
        this.t('scrubbers');
        const { b, m } = this;
        const g = new THREE.CapsuleGeometry(r, L, 6, 18);
        b.add(g, m['galvanized-steel'], trs(x, y + r + 0.6, z, rot, 0, Math.PI / 2));
        for (const s of [-L * 0.35, L * 0.35])
            b.box(0.5, r + 0.6, r * 1.6, m['steel-dark'], x + Math.cos(rot) * s, y, z - Math.sin(rot) * s, rot);
    }
    /** Vertical bulk tank (chemical / N2), with legs & top manway. */
    vtank(x, y, z, r, h) {
        this.t('scrubbers');
        const { b, m } = this;
        for (let i = 0; i < 4; i++) {
            const a = (i / 4) * Math.PI * 2 + 0.78;
            b.box(0.3, 1.5, 0.3, m['steel-dark'], x + Math.cos(a) * r * 0.8, y, z + Math.sin(a) * r * 0.8);
        }
        b.add(new THREE.CapsuleGeometry(r, h, 6, 18), m['white-paint'], trs(x, y + 1.5 + r + h / 2, z));
        b.add(new THREE.CylinderGeometry(0.5, 0.5, 0.5, 10), m['steel-dark'], trs(x, y + 1.5 + 2 * r + h + 0.1, z));
    }
    /** Air handler / MAU box with louvres, top fans, and a supply duct. */
    ahu(x, y, z, w, h, d, rot = 0, fans = 2) {
        this.t('ahu');
        const { b, m } = this;
        b.box(w + 0.6, 0.5, d + 0.6, m['steel-dark'], x, y, z, rot);
        b.add(facadeBox(w, h, d, 4, h), m['louvre'], trs(x, y + 0.5 + h / 2, z, rot));
        b.box(w + 0.3, 0.25, d + 0.3, m['galvanized-steel'], x, y + 0.5 + h, z, rot);
        const c = Math.cos(rot), s = Math.sin(rot);
        for (let i = 0; i < fans; i++) {
            const t = ((i + 0.5) / fans - 0.5) * w;
            const fx = x + c * t, fz = z - s * t;
            b.add(new THREE.CylinderGeometry(Math.min(d, w / fans) * 0.36, Math.min(d, w / fans) * 0.4, 1.1, 18), m['galvanized-steel'], trs(fx, y + 1.3 + h, fz));
            b.add(new THREE.CircleGeometry(Math.min(d, w / fans) * 0.33, 18), m['fan-dark'], trs(fx, y + 1.86 + h, fz, 0, -Math.PI / 2));
        }
    }
    /** Straight pipe from a to b (world points). */
    pipe(a, bb, r, mat) {
        const d = new THREE.Vector3().subVectors(bb, a);
        const L = d.length();
        const g = new THREE.CylinderGeometry(r, r, L, 10, 1, true);
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
        const mm = new THREE.Matrix4().compose(new THREE.Vector3().addVectors(a, bb).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1));
        this.b.add(g, mat, mm);
    }
    /**
     * Multi-tier pipe rack from (x0,z0) to (x1,z1) (axis-aligned), with portal frames every 6 m
     * and a bundle of parallel pipes of mixed diameters/colours on each tier.
     */
    pipeRack(x0, z0, x1, z1, y, tiers = 2, width = 4, seed = 1) {
        this.t('racks');
        const { b, m } = this;
        const r = rng(seed);
        const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
        const L = alongX ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
        const n = Math.max(1, Math.round(L / 6));
        const tierH = 2.4;
        const H = tierH * tiers + 0.8;
        for (let i = 0; i <= n; i++) {
            const t = i / n;
            const px = x0 + (x1 - x0) * t, pz = z0 + (z1 - z0) * t;
            const ox = alongX ? 0 : width / 2, oz = alongX ? width / 2 : 0;
            b.box(0.35, H, 0.35, m['steel-dark'], px + ox, y, pz + oz);
            b.box(0.35, H, 0.35, m['steel-dark'], px - ox, y, pz - oz);
            for (let k = 1; k <= tiers; k++)
                b.box(alongX ? 0.3 : width + 0.4, 0.3, alongX ? width + 0.4 : 0.3, m['steel-dark'], px, y + k * tierH, pz);
        }
        // longitudinal stringers
        for (let k = 1; k <= tiers; k++)
            for (const side of [-1, 1]) {
                const a = new THREE.Vector3(x0 + (alongX ? 0 : side * width / 2), y + k * tierH + 0.15, z0 + (alongX ? side * width / 2 : 0));
                const c = new THREE.Vector3(x1 + (alongX ? 0 : side * width / 2), y + k * tierH + 0.15, z1 + (alongX ? side * width / 2 : 0));
                this.pipe(a, c, 0.12, m['steel-dark']);
            }
        const pmats = [m['pipe-paint'], m['pipe-paint'], m['galvanized-steel'], m['pipe-yellow'], m['pipe-blue']];
        for (let k = 1; k <= tiers; k++) {
            let off = -width / 2 + 0.4;
            while (off < width / 2 - 0.3) {
                const pr = 0.12 + r() * 0.35;
                const mat = pmats[Math.floor(r() * pmats.length)];
                const yy = y + k * tierH + 0.3 + pr;
                const a = new THREE.Vector3(x0 + (alongX ? 0 : off + pr), yy, z0 + (alongX ? off + pr : 0));
                const c = new THREE.Vector3(x1 + (alongX ? 0 : off + pr), yy, z1 + (alongX ? off + pr : 0));
                this.pipe(a, c, pr, mat);
                off += pr * 2 + 0.15;
            }
        }
    }
    /** Rectangular exhaust duct run with flanges. */
    duct(x0, z0, x1, z1, y, s, roofY = y - 3) {
        this.t('racks');
        const { b, m } = this;
        const L = Math.hypot(x1 - x0, z1 - z0);
        const rot = Math.atan2(-(z1 - z0), x1 - x0);
        b.add(new THREE.BoxGeometry(L, s, s), m['galvanized-steel'], trs((x0 + x1) / 2, y, (z0 + z1) / 2, rot));
        for (let t = 0; t <= L; t += 3) {
            const px = x0 + (x1 - x0) * (t / L), pz = z0 + (z1 - z0) * (t / L);
            b.add(new THREE.BoxGeometry(0.15, s + 0.2, s + 0.2), m['steel-dark'], trs(px, y, pz, rot));
        }
        for (let t = 0; t <= L; t += 6) {
            const px = x0 + (x1 - x0) * (t / L), pz = z0 + (z1 - z0) * (t / L);
            b.box(0.25, y - s / 2 - roofY, 0.25, m['steel-dark'], px, roofY, pz);
        }
    }
    /** Tall exhaust stack with guy ring. */
    stack(x, y, z, r, h) {
        this.t('scrubbers');
        const { b, m } = this;
        b.add(new THREE.CylinderGeometry(r * 0.9, r * 1.1, h, 18), m['galvanized-steel'], trs(x, y + h / 2, z));
        b.add(new THREE.TorusGeometry(r * 0.95, 0.12, 5, 18), m['steel-dark'], trs(x, y + h - 0.3, z, 0, Math.PI / 2));
        b.add(new THREE.TorusGeometry(r * 1.05, 0.1, 5, 18), m['steel-dark'], trs(x, y + h * 0.5, z, 0, Math.PI / 2));
        b.add(new THREE.CircleGeometry(r * 0.85, 16), m['fan-dark'], trs(x, y + h - 0.01, z, 0, -Math.PI / 2));
    }
    /** Parapet ring around a roof rectangle. */
    parapet(cx, cz, w, d, y, h = 1.4, t = 0.5) {
        const { b, m } = this;
        b.box(w, h, t, m['parapet'], cx, y, cz - d / 2 + t / 2);
        b.box(w, h, t, m['parapet'], cx, y, cz + d / 2 - t / 2);
        b.box(t, h, d, m['parapet'], cx - w / 2 + t / 2, y, cz);
        b.box(t, h, d, m['parapet'], cx + w / 2 - t / 2, y, cz);
        b.box(w + 0.3, 0.15, t + 0.3, m['galvanized-steel'], cx, y + h, cz - d / 2 + t / 2);
        b.box(w + 0.3, 0.15, t + 0.3, m['galvanized-steel'], cx, y + h, cz + d / 2 - t / 2);
        b.box(t + 0.3, 0.15, d, m['galvanized-steel'], cx - w / 2 + t / 2, y + h, cz);
        b.box(t + 0.3, 0.15, d, m['galvanized-steel'], cx + w / 2 - t / 2, y + h, cz);
    }
}
/**
 * Wafer fab: main cleanroom block (subfab + fab + interstitial ≈ 24 m, public fab references),
 * lower perimeter support annex, loading docks with trucks, and a rooftop MEP field laid out
 * after ref A (FAB-2 / FAB-1 crops): 2×3 cooling-cell cluster on the outer-front quadrant,
 * scrubber/tank farm on the inner side, E-W + N-S pipe racks, AHU rows, penthouse.
 * `mirror` = -1 flips the layout for the east fab so the pair reads bilaterally as in the refs.
 */
export function buildFab(M, name, cx, cz, W, D, mirror, seed) {
    const m = M.M;
    const group = new THREE.Group();
    const id = name.toLowerCase();
    group.name = id;
    const body = new THREE.Group(), roof = new THREE.Group(), equip = new THREE.Group();
    body.name = `${id}-body`;
    roof.name = `${id}-roofdeck`;
    equip.name = `${id}-equipment`;
    group.add(body, roof, equip);
    const H = 24;
    const bb = new Batch().tag(id);
    // main block (facade texture tiles every 30 m)
    bb.add(facadeBox(W, H, D, 30, H), m['fab-cladding'], trs(0, H / 2, 0));
    // stepped upper band (interstitial level expressed as a slight setback reveal)
    bb.box(W + 0.6, 0.6, D + 0.6, m['galvanized-steel'], 0, H * 0.72, 0);
    // perimeter lower annex (support / corridor) on the outer & north side, like the refs
    const ax = mirror * -(W / 2 + 12);
    bb.tag(`${id}-annex`);
    bb.add(facadeBox(24, 13, D * 0.86, 30, 13), m['fab-annex'], trs(ax, 6.5, 0));
    bb.add(facadeBox(W * 0.9, 9, 6, 30, 9), m['fab-annex'], trs(0, 4.5, -D / 2 - 3));
    bb.tag(id);
    // front (south) entrance pavilion — slightly projecting volume
    bb.add(facadeBox(40, 18, 8, 20, 18), m['cladding-plain'], trs(mirror * W * 0.18, 9, D / 2 + 4));
    bb.box(38, 5, 0.4, m['dark-glass'], mirror * W * 0.18, 1, D / 2 + 8.1);
    // cantilevered entrance canopy + name band
    bb.box(46, 0.8, 9, m['galvanized-steel'], mirror * W * 0.18, 6.4, D / 2 + 12);
    bb.box(24, 1.6, 0.3, m['signage'], mirror * W * 0.18, 14, D / 2 + 8.2);
    // external riser / duct shafts on the long facades (vertical service cores)
    for (const fx of [-0.36, -0.12, 0.12, 0.36]) {
        bb.add(facadeBox(5, H + 1, 3, 5, H + 1), m['cladding-plain'], trs(fx * W, (H + 1) / 2, -D / 2 - 1.5));
    }
    // corner stair / riser towers
    for (const sx of [-1, 1])
        bb.add(facadeBox(10, H + 3, 10, 10, H + 3), m['cladding-plain'], trs(sx * (W / 2 - 5), (H + 3) / 2, D / 2 - 5));
    // loading docks on annex face with dock doors + canopies
    for (let i = 0; i < 7; i++) {
        const z = -D * 0.34 + i * (D * 0.68 / 6);
        const dx = ax + mirror * -12.3;
        bb.box(0.3, 4.2, 4, m['steel-dark'], dx, 0.2, z);
        bb.box(4, 0.3, 6, m['galvanized-steel'], dx + mirror * -2, 5, z);
    }
    bb.build(body);
    // ---------------- roof
    const rb = new Batch().tag(id);
    rb.add(new THREE.PlaneGeometry(W - 1, D - 1).rotateX(-Math.PI / 2), m['roof-membrane'], trs(0, H + 0.02, 0));
    const kit = new RoofKit(rb, m);
    kit.parapet(0, 0, W, D, H, 1.6);
    rb.add(new THREE.PlaneGeometry(24, D * 0.86).rotateX(-Math.PI / 2), m['roof-membrane'], trs(ax, 13.02, 0));
    kit.parapet(ax, 0, 24, D * 0.86, 13, 1);
    // walkway strips
    for (let i = -2; i <= 2; i++)
        rb.box(W * 0.9, 0.08, 1.4, m['cladding-plain'], 0, H + 0.03, i * D * 0.18);
    rb.build(roof);
    // ---------------- rooftop MEP (local coords of the roof top at y = H)
    // Zoning read from the FAB-2 crop of ref A: tall process towers at the outer-rear corner,
    // a pipe-rack ring framing a dense grid of equipment modules in the centre, 2×3 cooling
    // cells at the outer-front, a scrubber/stack farm on the inner side, tank rows front-centre.
    const eb = new Batch().tag(`${id}-roof`);
    const k = new RoofKit(eb, m, { fans: `${id}-fans`, scrubbers: `${id}-scrubbers`, racks: `${id}-racks`, ahu: `${id}-ahu`, misc: `${id}-roof` });
    const y = H;
    const r = rng(seed + 9);
    const sx = (v) => v * mirror;
    const U = (u) => sx(u * W), V = (v) => v * D;
    // raised inner roof tier (the lighter framed band visible in both refs)
    eb.add(facadeBox(W * 0.82, 1.2, D * 0.8, 20, 1.2), m['cladding-plain'], trs(U(0), y + 0.6, V(-0.02)));
    const y2 = y + 1.2;
    // 1) cooling cells 2×3, outer-front
    for (let rr = 0; rr < 2; rr++)
        for (let c = 0; c < 3; c++)
            k.coolingCell(U(-0.36) + sx(c * 15.5), y2, V(0.16) + rr * 15.5, 1.12);
    // 2) tall process towers, outer-rear
    for (let i = 0; i < 6; i++)
        k.scrubber(U(-0.42) + sx((i % 3) * 6.5), y2, V(-0.36) + Math.floor(i / 3) * 7, 1.7, 14 + (i % 3) * 2.5, Math.PI / 2);
    for (let i = 0; i < 4; i++)
        k.stack(U(-0.44) + sx(i * 4.5), y2, V(-0.16), 0.9, 16 + (i % 2) * 4);
    // 3) pipe-rack ring + cross racks framing the centre
    const ru0 = -0.24, ru1 = 0.2, rv0 = -0.36, rv1 = 0.08;
    k.pipeRack(U(ru0), V(rv0), U(ru1), V(rv0), y2, 2, 4.5, seed);
    k.pipeRack(U(ru0), V(rv1), U(ru1), V(rv1), y2, 2, 5, seed + 1);
    k.pipeRack(U(ru0), V(rv0), U(ru0), V(rv1), y2, 2, 4, seed + 2);
    k.pipeRack(U(ru1), V(rv0), U(ru1), V(rv1), y2, 2, 4, seed + 3);
    k.pipeRack(U(-0.44), V(rv1), U(ru0), V(rv1), y2, 1, 4, seed + 4);
    k.pipeRack(U(ru1), V(rv1), U(0.44), V(rv1), y2, 2, 4, seed + 5);
    k.pipeRack(U(-0.02), V(rv1), U(-0.02), V(0.42), y2, 1, 3.5, seed + 6);
    // 4) dense module grid inside the ring
    const cols = 7, rows = 4;
    for (let i = 0; i < cols; i++)
        for (let j = 0; j < rows; j++) {
            const cu = ru0 + ((i + 0.5) / cols) * (ru1 - ru0), cv = rv0 + ((j + 0.5) / rows) * (rv1 - rv0);
            equipmentModule(k, eb, m, U(cu), y2, V(cv), (ru1 - ru0) * W / cols - 3, (rv1 - rv0) * D / rows - 3, r, `${id}-ahu`);
        }
    // 5) scrubber / stack farm on the inner side (the vertical cylinder cluster, ref right half)
    for (let i = 0; i < 4; i++)
        for (let j = 0; j < 4; j++) {
            const px = U(0.27) + sx(i * 7.5), pz = V(-0.12) + j * 9;
            if ((i + j) % 3 === 2)
                k.vtank(px, y2, pz, 1.7, 5 + r() * 3);
            else
                k.scrubber(px, y2, pz, 1.5 + r() * 0.5, 10 + r() * 6, mirror > 0 ? Math.PI : 0);
        }
    for (let i = 0; i < 5; i++)
        k.stack(U(0.43), y2, V(-0.3) + i * 5, 0.8, 13 + r() * 5);
    // 6) front-centre: horizontal tank rows + chillers
    for (let i = 0; i < 4; i++)
        k.tank(U(0.02) + sx(i * 8), y2, V(0.3), 1.4, 7, Math.PI / 2);
    for (let i = 0; i < 3; i++)
        k.ahu(U(0.2) + sx(i * 14), y2, V(0.36), 12, 3.4, 7, 0, 3);
    for (let i = 0; i < 3; i++)
        k.ahu(U(-0.12) + sx(i * 14), y2, V(0.38), 12, 2.8, 6, 0, 2);
    // 6b) front half is as busy as the rear in the ref: second E-W rack, mid-front tower cluster,
    //     chemical tank skids and duct runs down to the cooling cells
    k.pipeRack(U(-0.1), V(0.24), U(0.44), V(0.24), y2, 2, 4, seed + 11);
    k.pipeRack(U(0.12), V(rv1), U(0.12), V(0.42), y2, 1, 3.5, seed + 12);
    for (let i = 0; i < 6; i++)
        k.scrubber(U(0.0) + sx((i % 3) * 6), y2, V(0.15) + Math.floor(i / 3) * 6.5, 1.3 + r() * 0.4, 9 + r() * 5, mirror > 0 ? Math.PI : 0);
    for (let i = 0; i < 4; i++)
        for (let j = 0; j < 2; j++)
            k.vtank(U(0.2) + sx(i * 6), y2, V(0.16) + j * 6, 1.4, 3 + r() * 2);
    for (let i = 0; i < 5; i++)
        equipmentModule(k, eb, m, U(0.3) + sx((i % 3) * 13), y2, V(0.3) + Math.floor(i / 3) * 11, 11, 9, r, `${id}-ahu`);
    k.duct(U(-0.14), V(0.1), U(-0.14), V(0.3), y2 + 4, 1.6, y2);
    k.duct(U(-0.2), V(0.12), U(0.0), V(0.12), y2 + 4, 1.6, y2);
    // 7) MAU row along the rear edge
    for (let i = 0; i < 9; i++)
        k.ahu(U(-0.2) + sx(i * 16), y2, V(-0.44), 13, 3.8, 7, 0, 3);
    // 8) exhaust ducts linking modules to the scrubber farm
    k.duct(U(ru1), V(-0.05), U(0.27), V(-0.05), y2 + 5.5, 2.2, y2);
    k.duct(U(ru1), V(-0.2), U(0.27), V(-0.2), y2 + 5.5, 1.8, y2);
    k.duct(U(-0.3), V(0.02), U(ru0), V(0.02), y2 + 4.5, 1.6, y2);
    // slender exhaust risers (the tall thin columns visible along the FAB roofs in ref A)
    for (let i = 0; i < 10; i++)
        k.stack(U(-0.3 + i * 0.07), y2, V(-0.3 + (i % 2) * 0.05), 0.45, 9 + r() * 7);
    eb.tag(`${id}-roof`);
    // 9) risers / vents scatter on the free roof
    for (let i = 0; i < 90; i++) {
        const px = sx((r() - 0.5) * W * 0.9), pz = (r() - 0.5) * D * 0.86;
        eb.add(new THREE.CylinderGeometry(0.3, 0.3, 1 + r() * 1.6, 8), m['galvanized-steel'], trs(px, y + 0.8, pz));
    }
    // solar-panel strip on annex roof
    for (let i = 0; i < 10; i++)
        eb.add(new THREE.BoxGeometry(18, 0.15, 3.5), m['solar'], trs(ax, 13.6, -D * 0.38 + i * 7.5, 0, 0.18));
    eb.build(equip);
    // ---------------- trucks at docks
    const tb = new Batch().tag('vehicles');
    for (let i = 0; i < 7; i++) {
        if (i % 3 === 1)
            continue;
        const z = -D * 0.34 + i * (D * 0.68 / 6);
        const dx = ax + mirror * -12.3 + mirror * -9;
        truck(tb, m, dx, z, mirror > 0 ? Math.PI / 2 : -Math.PI / 2);
    }
    tb.build(body);
    group.position.set(cx, 0, cz);
    group.userData.info = { id, title: name, area: '50,000㎡', desc: '12 英寸晶圆厂：底层 subfab + 洁净室 + 上部夹层（约 24 m），屋面布置冷却塔风机组、湿式洗涤塔、化学品储罐、MAU/AHU 与管廊。' };
    return { group, explode: [{ obj: roof, dir: new THREE.Vector3(0, 18, 0) }, { obj: equip, dir: new THREE.Vector3(0, 40, 0) }] };
}
/** Box truck (cab + trailer + wheels). */
export function truck(b, m, x, z, rot) {
    const c = Math.cos(rot), s = Math.sin(rot);
    const at = (t) => [x + c * t, z - s * t];
    let [px, pz] = at(-2);
    b.add(new THREE.BoxGeometry(12, 3.6, 2.5), m['truck-white'], trs(px, 1.2 + 1.8, pz, rot));
    [px, pz] = at(5.6);
    b.add(new THREE.BoxGeometry(2.6, 2.6, 2.4), m['truck-cab'], trs(px, 0.9 + 1.3, pz, rot));
    b.add(new THREE.BoxGeometry(0.1, 1.0, 2.2), m['dark-glass'], trs(x + c * 6.95, 2.8, z - s * 6.95, rot));
    for (const t of [-6, -4.8, 1.5, 5.8])
        for (const sd of [-1.1, 1.1]) {
            const wx = x + c * t + s * sd, wz = z - s * t + c * sd;
            b.add(new THREE.CylinderGeometry(0.5, 0.5, 0.35, 12), m['tyre'], trs(wx, 0.5, wz, rot, Math.PI / 2));
        }
}
/**
 * 掩膜厂 / 先进制造实验室: 3-storey clean block with ribbon windows and a dense rooftop plant
 * field (tall vertical tanks + AHU clusters as in the lab crop).
 */
export function buildLab(M, name, title, cx, cz, W, D, seed, desc) {
    const m = M.M;
    const group = new THREE.Group();
    group.name = name;
    const body = new THREE.Group(), roof = new THREE.Group(), equip = new THREE.Group();
    body.name = `${name}-body`;
    roof.name = `${name}-roofdeck`;
    equip.name = `${name}-equipment`;
    group.add(body, roof, equip);
    const H = 20;
    const bb = new Batch().tag(name);
    bb.add(facadeBox(W, H, D, 40, H), m['lab-cladding'], trs(0, H / 2, 0));
    bb.box(26, 6, 0.4, m['dark-glass'], 0, 0.3, D / 2 + 0.2);
    bb.box(30, 0.5, 6, m['galvanized-steel'], 0, 6.2, D / 2 + 3);
    for (const sx of [-6, 6])
        bb.add(new THREE.CylinderGeometry(0.25, 0.25, 6, 8), m['steel-dark'], trs(sx, 3, D / 2 + 5.5));
    bb.build(body);
    const rb = new Batch().tag(name);
    const kit = new RoofKit(rb, m, { misc: name });
    rb.add(new THREE.PlaneGeometry(W - 1, D - 1).rotateX(-Math.PI / 2), m['roof-membrane'], trs(0, H + 0.02, 0));
    kit.parapet(0, 0, W, D, H, 1.5);
    rb.build(roof);
    const eb = new Batch().tag(`${name}-roof`);
    const k = new RoofKit(eb, m, { misc: `${name}-roof` });
    const r = rng(seed);
    // tall vertical columns (ref: thin tall cylinders at NW corner of the lab roof)
    for (let i = 0; i < 4; i++)
        k.scrubber(-W * 0.38 + i * 6.5, H, -D * 0.32, 1.5, 12 + r() * 3, Math.PI / 2);
    // AHU blocks in a grid, varied heights
    // dense module grid (ref: the lab / mask roofs are ~70% covered by plant in rows)
    for (let gx = 0; gx < 8; gx++)
        for (let gz = 0; gz < 5; gz++) {
            if (r() < 0.12)
                continue;
            const cx0 = -W * 0.3 + gx * (W * 0.62 / 7), cz0 = -D * 0.2 + gz * (D * 0.6 / 4);
            equipmentModule(k, eb, m, cx0, H, cz0, W * 0.62 / 7 - 2.5, D * 0.6 / 4 - 2.5, r, `${name}-roof`);
        }
    k.pipeRack(-W * 0.42, D * 0.05, W * 0.42, D * 0.05, H, 1, 3.5, seed + 3);
    k.pipeRack(W * 0.05, -D * 0.4, W * 0.05, D * 0.38, H, 1, 3, seed + 4);
    for (let i = 0; i < 6; i++)
        k.vtank(W * 0.36, H, -D * 0.32 + i * 5, 1.5, 3);
    for (let i = 0; i < 20; i++)
        eb.add(new THREE.CylinderGeometry(0.3, 0.3, 1.2 + r() * 1.4, 8), m['galvanized-steel'], trs((r() - 0.5) * W * 0.85, H + 0.7, (r() - 0.5) * D * 0.8));
    eb.build(equip);
    group.position.set(cx, 0, cz);
    group.userData.info = { id: name, title, area: '30,000㎡', desc };
    return { group, explode: [{ obj: roof, dir: new THREE.Vector3(0, 14, 0) }, { obj: equip, dir: new THREE.Vector3(0, 30, 0) }] };
}
/** Enclosed glass sky bridge with Warren-truss sides linking FAB-2 and FAB-1 (level 3). */
export function buildSkyBridge(M, x0, x1, z) {
    const m = M.M;
    const group = new THREE.Group();
    group.name = 'sky-bridge';
    const b = new Batch().tag('sky-bridge');
    const L = x1 - x0, cx = (x0 + x1) / 2, y = 11;
    const glass = M.glass(40, 1, 0, 7);
    b.add(facadeBox(L, 5, 9, 12, 5), glass, trs(cx, y + 2.5, z));
    b.box(L + 0.4, 0.6, 9.6, m['galvanized-steel'], cx, y - 0.6, z);
    b.box(L + 0.4, 0.6, 9.6, m['galvanized-steel'], cx, y + 5, z);
    // truss diagonals
    const kit = new RoofKit(b, m, { misc: 'sky-bridge' });
    for (let t = 0; t < L; t += 6)
        for (const sd of [-4.9, 4.9]) {
            const up = (t / 6) % 2 === 0;
            const t1 = Math.min(t + 6, L);
            kit.pipe(new THREE.Vector3(x0 + t, up ? y : y + 5, z + sd), new THREE.Vector3(x0 + t1, up ? y + 5 : y, z + sd), 0.18, m['steel-dark']);
            kit.pipe(new THREE.Vector3(x0 + t, y, z + sd), new THREE.Vector3(x0 + t, y + 5, z + sd), 0.14, m['steel-dark']);
        }
    // supporting piers
    for (const px of [cx - 30, cx, cx + 30]) { // piers inside the mall, clear of the FAB inner roads
        b.box(2.2, y - 0.6, 2.2, m['cladding-plain'], px, 0, z);
    }
    b.build(group);
    group.userData.info = { id: 'sky-bridge', title: 'FAB 连廊', area: '', desc: 'FAB-1 与 FAB-2 之间的三层封闭玻璃连廊（桁架结构），承载人员与物料通行。' };
    return { group, explode: [] };
}
/** One rooftop equipment module (varied): AHU, chiller skid, tank cluster, or transformer box. */
function equipmentModule(k, b, m, x, y, z, w, d, r, tag) {
    if (tag)
        b.tag(tag);
    const t = r();
    if (t < 0.35) {
        k.ahu(x, y, z, w * 0.9, 2.8 + r() * 2, d * 0.7, 0, Math.max(1, Math.round(w / 7)));
    }
    else if (t < 0.6) {
        // chiller skid: base + 2–3 horizontal shells + control box
        b.box(w * 0.9, 0.5, d * 0.8, m['steel-dark'], x, y, z);
        const n = 2 + Math.floor(r() * 2);
        for (let i = 0; i < n; i++)
            b.add(new THREE.CapsuleGeometry(0.9, w * 0.55, 4, 12), m['pipe-blue'], trs(x, y + 1.6, z - d * 0.28 + (i * d * 0.56) / Math.max(1, n - 1), 0, 0, Math.PI / 2));
        b.box(1.6, 2.2, 1.2, m['louvre'], x + w * 0.38, y + 0.5, z);
    }
    else if (t < 0.82) {
        // vertical tank cluster on a pad
        b.box(w * 0.9, 0.4, d * 0.8, m['cladding-plain'], x, y, z);
        for (let i = 0; i < 4; i++)
            k.vtank(x + ((i % 2) - 0.5) * w * 0.45, y + 0.4, z + (Math.floor(i / 2) - 0.5) * d * 0.4, 1.1, 2 + r() * 3);
    }
    else {
        // enclosed plant room with roof fans
        b.add(facadeBox(w * 0.85, 4, d * 0.75, 5, 4), m['louvre'], trs(x, y + 2, z));
        b.box(w * 0.88, 0.3, d * 0.78, m['galvanized-steel'], x, y + 4, z);
        b.add(new THREE.CylinderGeometry(1.2, 1.3, 1.4, 14), m['galvanized-steel'], trs(x, y + 4.8, z));
    }
}
