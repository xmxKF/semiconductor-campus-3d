import * as THREE from 'three';
import { Batch, trs, facadeBox, extrudePoly, flatPoly, roundedRectPts } from './util.js?v=bd76b00c2d';
import { buildRoof } from './roofs.js?v=bd76b00c2d';
import { RoofKit } from './fab.js?v=bd76b00c2d';
/** Box with glass facade texture whose bays keep a fixed metric size (bay m × floor m). */
function glassBox(b, mat, w, h, d, x, y, z, bay = 16, rot = 0) {
    b.add(facadeBox(w, h, d, bay, h), mat, trs(x, y + h / 2, z, rot));
}
/** Glazed double-leaf entrance: bronze frame, lit glazing, transom, pull handles; faces +z (sz=1) or -z (sz=-1). */
function entranceDoors(b, M, x, y, z, w, h, sz, leaves = 4) {
    const m = M.M;
    const glass = M.warm(leaves, 2, '#2b2621');
    b.add(new THREE.BoxGeometry(w, h, 0.25), glass, trs(x, y + h / 2, z));
    // stone portal surround so the entrance reads against the curtain wall: side piers + deep lintel
    for (const sx of [-1, 1])
        b.box(1.4, h + 1.6, 1.4, m['stone-plain'], x + sx * (w / 2 + 0.9), y, z + sz * 0.45);
    b.box(w + 3.2, 1.3, 1.4, m['stone-plain'], x, y + h + 0.3, z + sz * 0.45);
    b.box(w + 0.8, 0.5, 0.5, m['steel-dark'], x, y + h, z + sz * 0.1); // head
    for (const sx of [-1, 1])
        b.box(0.5, h, 0.5, m['steel-dark'], x + sx * (w / 2 + 0.15), y, z + sz * 0.1); // jambs
    for (let i = 1; i < leaves; i++)
        b.box(0.14, h, 0.3, m['steel-dark'], x - w / 2 + (i * w) / leaves, y, z + sz * 0.1);
    b.box(w, 0.12, 0.3, m['steel-dark'], x, y + h * 0.78, z + sz * 0.1); // transom
    for (let i = 0; i < leaves; i++)
        b.box(0.08, 1.2, 0.12, m['gold-letter'], x - w / 2 + ((i + 0.5) * w) / leaves + (i % 2 ? -0.5 : 0.5), y + 0.9, z + sz * 0.22);
}
function balustrade(b, m, pts, y, h = 1.1) {
    for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], c = pts[i + 1];
        const L = a.distanceTo(c), rot = Math.atan2(-(c.y - a.y), c.x - a.x);
        b.add(new THREE.BoxGeometry(L, 0.18, 0.3), m['stone-plain'], trs((a.x + c.x) / 2, y + h, (a.y + c.y) / 2, rot));
        b.add(new THREE.BoxGeometry(L, 0.15, 0.25), m['stone-plain'], trs((a.x + c.x) / 2, y + 0.2, (a.y + c.y) / 2, rot));
        const n = Math.max(1, Math.round(L / 1.6));
        for (let k = 0; k <= n; k++) {
            const t = k / n;
            b.add(new THREE.BoxGeometry(0.25, h, 0.25), m['stone-plain'], trs(a.x + (c.x - a.x) * t, y + h / 2, a.y + (c.y - a.y) * t));
        }
    }
}
/**
 * 集团行政大楼 — symmetric: tall glazed atrium, stone piers, five-storey glazed wings,
 * stone end towers with slot windows, recessed colonnade ground floor, entrance canopy,
 * skylights, entrance terrace + grand stair, 12 m plaza, U drop-off around one big central pool.
 */
export function buildAdmin(M, cx, cz) {
    const m = M.M;
    const group = new THREE.Group();
    group.name = 'admin';
    const body = new THREE.Group(), roofG = new THREE.Group(), court = new THREE.Group();
    group.add(body, roofG, court);
    const b = new Batch().tag('admin');
    const atriumGlass = M.glass(6, 7, 0.15, 3);
    const wingGlass = M.glass(8, 6, 0.1, 4);
    const Dm = 46;
    // podium / plinth
    b.add(facadeBox(196, 1.6, 60, 6), m['stone-cladding'], trs(0, 0.8, 0));
    // ground floor colonnade: recessed dark glass + stone columns
    b.box(188, 5, Dm - 4, m['dark-glass'], 0, 1.6, 0);
    for (let x = -91; x <= 91; x += 6.5)
        b.box(1.3, 5, 1.3, m['stone-plain'], x, 1.6, Dm / 2 - 1.2);
    // central atrium
    b.tag('admin-atrium');
    glassBox(b, atriumGlass, 70, 26, Dm, 0, 6.6, 0, 11);
    b.tag('admin-mullions');
    for (let x = -33; x <= 33; x += 5.5)
        b.box(0.5, 26, 1.2, m['mullion-alu'], x, 6.6, Dm / 2 + 0.3);
    b.tag('admin-atrium');
    b.box(72, 1.2, Dm + 2, m['stone-plain'], 0, 32.4, 0);
    // stone piers flanking the atrium (with inset shadow reveal)
    b.tag('admin-tower');
    for (const sx of [-1, 1]) {
        b.add(facadeBox(9, 29, Dm + 2, 6), m['stone-cladding'], trs(sx * 39.5, 6.6 + 14.5, 0));
        b.box(2, 22, 0.4, m['dark-glass'], sx * 39.5, 9, Dm / 2 + 1.05);
    }
    // wings
    for (const sx of [-1, 1]) {
        b.tag('admin-wing');
        glassBox(b, wingGlass, 40, 21, Dm - 2, sx * 64, 6.6, 0, 10);
        // vertical stone fins every bay (ref: gridded stone-and-glass wings)
        for (let k = 0; k <= 8; k++)
            b.box(0.7, 21, 1.4, m['stone-plain'], sx * 64 - 20 + k * 5, 6.6, Dm / 2 - 0.3);
        for (let k = 0; k < 6; k++)
            b.box(40.4, 0.35, 0.8, m['stone-plain'], sx * 64, 6.6 + k * 3.5, Dm / 2 - 0.6);
        b.box(41, 1, Dm, m['stone-plain'], sx * 64, 27.6, 0);
        // end towers with slot windows
        b.tag('admin-tower');
        b.add(facadeBox(14, 25, Dm + 4, 6), m['stone-cladding'], trs(sx * 91, 6.6 + 12.5 - 3.3, 0));
        for (const o of [-3, 0, 3])
            b.box(1.1, 19, 0.3, m['dark-glass'], sx * 91 + o, 8, Dm / 2 + 2.1);
        b.box(15, 0.8, Dm + 5, m['stone-plain'], sx * 91, 28.2, 0);
    }
    // north entrance (faces the causeway / north plaza): doors in the colonnade, canopy on 4 columns, steps
    entranceDoors(b, M, 0, 1.6, -Dm / 2 + 1.7, 16, 4.6, -1, 6);
    b.box(30, 0.8, 9, m['stone-plain'], 0, 6.4, -Dm / 2 - 3.5);
    for (const x of [-13, -4.5, 4.5, 13])
        b.add(new THREE.CylinderGeometry(0.45, 0.45, 4.8, 12), m['stone-plain'], trs(x, 1.6 + 2.4, -Dm / 2 - 7.2));
    for (let s = 0; s < 5; s++)
        b.box(30, 1.6 - s * 0.32, 0.6, m['granite-paving'], 0, 0, -30.3 - s * 0.6);
    b.box(14, 1.1, 0.2, m['gold-letter'], 0, 7.6, -Dm / 2 - 8.05);
    // entrance canopy + name board
    b.tag('admin');
    b.box(44, 0.9, 12, m['stone-plain'], 0, 7, Dm / 2 + 6);
    for (const x of [-20, -7, 7, 20])
        b.add(new THREE.CylinderGeometry(0.5, 0.5, 7, 12), m['stone-plain'], trs(x, 3.5 + 1.6, Dm / 2 + 11));
    b.box(30, 3.6, 0.5, m['stone-cladding'], 0, 8.6, Dm / 2 + 0.6);
    entranceDoors(b, M, 0, 1.6, Dm / 2 - 1.7, 20, 4.6, 1, 8);
    b.box(18, 1.2, 0.2, m['gold-letter'], 0, 9.8, Dm / 2 + 0.9);
    // entrance terrace (local 35–47 = world 53–65) + grand stair: 8 treads × 0.6 m, rise 0.2 m (world 65–69.8)
    b.box(110, 1.6, 12, m['granite-paving'], 0, 0, 41);
    for (const sx of [-1, 1]) {
        b.box(1.2, 2.5, 12, m['stone-plain'], sx * 55.6, 0, 41);
    } // terrace cheek walls
    for (let s = 0; s < 8; s++)
        b.box(80, 1.6 - s * 0.2, 0.6, m['granite-paving'], 0, 0, 47.3 + s * 0.6);
    for (const sx of [-1, 1])
        b.box(1.0, 1.9, 4.8, m['stone-plain'], sx * 40.5, 0, 49.4); // stair cheek walls
    // handrails every 20 m on the stair
    for (const x of [-20, 0, 20]) {
        const g = new THREE.CylinderGeometry(0.05, 0.05, 5.6, 6);
        g.rotateX(Math.PI / 2 - 0.33);
        b.add(g, m['galvanized-steel'], trs(x, 1.9, 49.4));
    }
    b.build(body);
    // roofs: skylights and small plant
    const r = new Batch().tag('admin');
    const kit = new RoofKit(r, m, { misc: 'admin' });
    kit.parapet(0, 0, 72, Dm + 2, 33.6, 1);
    for (const sx of [-1, 1])
        kit.parapet(sx * 64, 0, 41, Dm, 28.6, 1);
    // atrium ridge skylight (glass gable strip) + wing skylight squares (blue squares in both refs)
    // pitched glass ridge skylight along the atrium (triangular prism with aluminium ribs)
    const prism = new THREE.Shape([new THREE.Vector2(-9, 0), new THREE.Vector2(9, 0), new THREE.Vector2(0, 4.5)]);
    const pg = new THREE.ExtrudeGeometry(prism, { depth: 60, bevelEnabled: false });
    pg.translate(0, 0, -30);
    pg.rotateY(Math.PI / 2);
    r.add(pg, M.glass(12, 2, 0, 9), trs(0, 34, 0));
    for (let k = -30; k <= 30; k += 5)
        r.add(new THREE.BoxGeometry(0.3, 0.3, 20), m['mullion-alu'], trs(k, 36.1, 0, 0, 0, 0));
    for (const sx of [-1, 1]) {
        r.add(new THREE.BoxGeometry(10, 1.2, 30), M.glass(4, 2, 0, 13), trs(sx * 91, 29.2, 0));
        for (let k = 0; k < 3; k++)
            kit.ahu(sx * (52 + k * 9), 28.6, -12, 7, 2.4, 5, 0, 1);
    }
    r.build(roofG);
    // forecourt (all admin-local; world z = local + 18):
    //   12 m granite plaza between stair foot and the drop-off lane (local 52–64 = world 70–82)
    //   drop-off lane itself is a road in layout.ts; inside the U: lawn + one big reflecting pool
    const c = new Batch().tag('forecourt');
    c.add(flatPoly(roundedRectPts(0, 58, 140, 12, 2), 0.1, 8), m['granite-paving']);
    // bollards along the kerb so cars cannot enter the plaza
    for (let x = -66; x <= 66; x += 4)
        if (Math.abs(x) > 2)
            c.add(new THREE.CylinderGeometry(0.18, 0.2, 0.9, 8), m['steel-dark'], trs(x, 0.55, 63.4));
    // lawn inside the U (edges 7 m from the pool) — ADMIN_POOL is world z; convert to local
    const pz = 107 - 18, pw = 76, pd = 20;
    c.add(flatPoly(roundedRectPts(0, pz, 92, 34, 3), 0.08, 6), m['lawn-2']);
    // pool: granite kerb + coping, water, a central line of 9 jets (spray columns) and 2 bubbler rows
    c.box(pw + 2.4, 0.6, pd + 2.4, m['kerb'], 0, 0, pz);
    c.box(pw + 0.8, 0.62, pd + 0.8, m['stone-plain'], 0, 0.02, pz);
    c.box(pw, 0.64, pd, m['pool-water'], 0, 0.03, pz);
    const spray = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xdfeef5, emissiveIntensity: 0.2, transparent: true, opacity: 0.6, roughness: 0.3, depthWrite: false });
    const jet = new THREE.LatheGeometry([new THREE.Vector2(0.9, 0), new THREE.Vector2(0.45, 1.2), new THREE.Vector2(0.28, 4.5), new THREE.Vector2(0.5, 5.6), new THREE.Vector2(0, 6.2)], 12);
    const bub = new THREE.LatheGeometry([new THREE.Vector2(0.7, 0), new THREE.Vector2(0.5, 0.6), new THREE.Vector2(0, 1.0)], 10);
    for (let i = -4; i <= 4; i++) {
        c.add(new THREE.CylinderGeometry(0.35, 0.45, 0.2, 10), m['steel-dark'], trs(i * 7.5, 0.64, pz));
        c.add(jet, spray, trs(i * 7.5, 0.7, pz, 0, 0, 0, 1, i % 2 ? 0.75 : 1, 1));
        c.add(new THREE.RingGeometry(0.9, 2.2, 20), spray, trs(i * 7.5, 0.7, pz, 0, -Math.PI / 2));
    }
    for (const zo of [-6, 6])
        for (let i = -8; i <= 8; i++)
            c.add(bub, spray, trs(i * 4.2, 0.68, pz + zo));
    // low clipped hedges framing the lawn at the U corners (not a ring of planters)
    for (const sx of [-1, 1])
        c.box(12, 1.0, 2.2, m['hedge'], sx * 38, 0.08, pz - 15);
    c.build(court);
    group.position.set(cx, 0, cz);
    group.userData.jets = Array.from({ length: 9 }, (_, i) => new THREE.Vector3(cx + (i - 4) * 6.5, 1.2, cz + 107 - 18));
    group.userData.info = { id: 'admin', title: '集团行政大楼', area: '30,000㎡', desc: '中轴核心建筑：玻璃中庭 + 双翼办公 + 石材塔楼。南侧依次为入口平台、8 级长台阶、12 m 步行广场、U 形落客车道，车道环抱中央大水池（叠水 + 喷泉）。' };
    return { group, explode: [{ obj: roofG, dir: new THREE.Vector3(0, 16, 0) }, { obj: court, dir: new THREE.Vector3(0, 0, 20) }] };
}
export function buildExhibitionHall(M, cx, cz) {
    // 新中式 hall. South face (坐南朝北望): dark-grey tile 歇山 roof with gentle 起翘 over a full-height glazed
    // hall with slender dark-steel columns, lower side halls. North face (坐北朝南望): glazed entrance, reflecting pool.
    const m = M.M;
    const group = new THREE.Group();
    group.name = 'pavilion';
    const bodyG = new THREE.Group(), roofG = new THREE.Group();
    group.add(bodyG, roofG);
    const b = new Batch().tag('pavilion'), r = new Batch().tag('pavilion-roof');
    const glaze = M.warm(12, 2, '#2f3338');
    // stone podium (台基) with steps on both long sides + balustrade
    b.add(facadeBox(100, 1.4, 46, 6), m['stone-cladding'], trs(0, 0.7, 0));
    for (const sz of [-1, 1])
        for (let s2 = 0; s2 < 4; s2++)
            b.box(18, 0.35, 1.2, m['stone-plain'], 0, 1.4 - (s2 + 1) * 0.35, sz * (23.6 + s2 * 1.2));
    balustrade(b, m, [new THREE.Vector2(-50, 23), new THREE.Vector2(-10, 23)], 1.4);
    balustrade(b, m, [new THREE.Vector2(10, 23), new THREE.Vector2(50, 23)], 1.4);
    // main hall: glazed walls between slender dark columns, deep eave soffit
    b.add(facadeBox(44, 9.5, 24, 11, 9.5), glaze, trs(0, 1.4 + 4.75, 0));
    for (let x = -22; x <= 22; x += 4.4)
        for (const z of [-12.6, 12.6])
            b.add(new THREE.CylinderGeometry(0.32, 0.36, 9.5, 12), m['steel-dark'], trs(x, 1.4 + 4.75, z));
    for (const z of [-12.6, 12.6])
        b.box(46, 0.9, 0.6, m['steel-dark'], 0, 1.4 + 9.2, z);
    buildRoof(r, m, 0, 1.4 + 10.1, 0, 54, 32, 8.5, 'xieshan', 0, { upturn: 1.1, gableFrac: 0.48 });
    // side halls (lower, 歇山 roofs) + glazed links
    b.tag('pavilion-wings');
    r.tag('pavilion-wings');
    for (const sx of [-1, 1]) {
        b.add(facadeBox(22, 6.5, 18, 11, 6.5), glaze, trs(sx * 35, 1.4 + 3.25, 1));
        for (let x = -10; x <= 10; x += 5)
            for (const z of [-9.3, 9.3])
                b.add(new THREE.CylinderGeometry(0.26, 0.28, 6.5, 10), m['steel-dark'], trs(sx * 35 + x, 1.4 + 3.25, 1 + z));
        buildRoof(r, m, sx * 35, 1.4 + 6.9, 1, 27, 22, 5.2, 'xieshan', 0, { upturn: 0.7, gableFrac: 0.5 });
        b.add(facadeBox(6, 5, 10, 6, 5), glaze, trs(sx * 23, 1.4 + 2.5, 2));
        b.box(7, 0.5, 11, m['steel-dark'], sx * 23, 6.4, 2);
    }
    b.tag('pavilion');
    // north entrance: reflecting pool with fountain (faces the gate plaza, 坐北朝南望)
    b.box(32, 0.8, 16, m['kerb'], 0, 0, -44);
    b.box(30, 0.82, 14, m['pool-water'], 0, 0.02, -44);
    b.add(new THREE.CylinderGeometry(2, 2.3, 1.1, 20), m['kerb'], trs(0, 0.5, -44));
    {
        const jet = new THREE.LatheGeometry([new THREE.Vector2(0.8, 0), new THREE.Vector2(0.35, 1.5), new THREE.Vector2(0.22, 4.2), new THREE.Vector2(0.5, 5.2), new THREE.Vector2(0, 5.8)], 12);
        b.add(jet, new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, roughness: 0.3, depthWrite: false }), trs(0, 1.05, -44));
    }
    // entrances: north (towards the gate) and south (onto the causeway to the admin building)
    entranceDoors(b, M, 0, 1.4, -12.35, 12, 5.2, -1, 4);
    entranceDoors(b, M, 0, 1.4, 12.35, 12, 5.2, 1, 4);
    b.box(20, 0.6, 6, m['steel-dark'], 0, 7.2, 15.5); // south canopy
    b.box(10, 1.2, 0.2, m['gold-letter'], 0, 8.4, 12.8);
    // entrance canopy + name board on the north face
    b.box(20, 0.6, 6, m['steel-dark'], 0, 7.2, -15.5);
    b.box(12, 1.4, 0.2, m['gold-letter'], 0, 8.6, -12.8);
    b.build(bodyG);
    r.build(roofG);
    group.position.set(cx, 0, cz);
    group.userData.info = { id: 'pavilion', title: '产品展示接待馆', area: '4,000㎡', desc: '新中式展示接待馆：深灰瓦歇山屋面（缓起翘）覆盖通高玻璃大厅，深色细钢柱，两侧配殿与玻璃连廊；北侧入口镜面水池，南侧台基踏步接中轴堤。' };
    return { group, explode: [] };
}
/** Glass-box 西式餐厅 (3,000㎡, west) with water deck and parasols. */
export function buildGlassRestaurant(M, cx, cz, deckDir) {
    const m = M.M;
    const group = new THREE.Group();
    group.name = 'rest-glass';
    const bodyG = new THREE.Group(), roofG = new THREE.Group();
    group.add(bodyG, roofG);
    const b = new Batch().tag('rest-glass'), r = new Batch().tag('rest-glass');
    // ref (坐南朝北望 crop): a single tall, very transparent clear-glass volume on a thin white aluminium grid,
    // warm interior visible through it, flat roof with a smaller glazed roof pavilion.
    const clear = new THREE.MeshPhysicalMaterial({ color: 0xdfeaf0, roughness: 0.04, metalness: 0.1, transmission: 0.0, transparent: true, opacity: 0.38, envMapIntensity: 1.6, depthWrite: false });
    b.add(facadeBox(44, 0.8, 30, 6), m['stone-plain'], trs(0, 0.4, 0));
    // interior visible through the glass: warm floor slabs, dining furniture blocks, back wall
    b.add(facadeBox(40, 10, 26, 10, 10), M.warm(10, 3, '#c9b89a'), trs(0, 0.8 + 5, 0));
    b.box(41, 0.35, 27, m['stone-plain'], 0, 5.7, 0);
    // glass skin + white aluminium grid (vertical mullions every 2.2 m, transoms at 3.6 / 7.2 m)
    b.add(new THREE.BoxGeometry(42.4, 11, 28.4), clear, trs(0, 0.8 + 5.5, 0));
    for (let x = -21.2; x <= 21.2; x += 2.2)
        for (const z of [-14.2, 14.2])
            b.box(0.18, 11, 0.22, m['white-paint'], x, 0.8, z);
    for (let z = -14.2; z <= 14.2; z += 2.2)
        for (const x of [-21.2, 21.2])
            b.box(0.22, 11, 0.18, m['white-paint'], x, 0.8, z);
    for (const y of [0.8, 4.4, 8.0, 11.6]) {
        b.box(42.6, 0.25, 0.3, m['white-paint'], 0, y, -14.2);
        b.box(42.6, 0.25, 0.3, m['white-paint'], 0, y, 14.2);
        b.box(0.3, 0.25, 28.6, m['white-paint'], -21.2, y, 0);
        b.box(0.3, 0.25, 28.6, m['white-paint'], 21.2, y, 0);
    }
    b.box(43.4, 0.8, 29.4, m['white-paint'], 0, 11.8, 0);
    const kit = new RoofKit(r, m, { misc: 'rest-glass' });
    kit.parapet(0, 0, 43.4, 29.4, 12.6, 0.9, 0.3);
    kit.ahu(-12, 12.6, -6, 9, 1.8, 5, 0, 2);
    // glazed roof pavilion (rooftop bar) with white frame
    r.add(new THREE.BoxGeometry(16, 3.6, 11), clear, trs(6, 12.6 + 1.8, 3));
    r.box(16.6, 0.4, 11.6, m['white-paint'], 6, 16.2, 3);
    // deck over the water with parasols and tables
    b.tag('rest-glass-deck');
    const dx = deckDir * 30;
    b.box(20, 0.5, 34, m['timber-light'], dx, 0.6, 0);
    for (let z = -15; z <= 15; z += 5)
        b.add(new THREE.CylinderGeometry(0.25, 0.25, 1.4, 6), m['timber'], trs(dx + deckDir * 9, 0.2, z));
    for (let i = 0; i < 6; i++) {
        const px = dx + (i % 2 ? -4 : 4), pz = -12 + Math.floor(i / 2) * 11;
        b.add(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 6), m['steel-dark'], trs(px, 2.4, pz));
        b.add(new THREE.ConeGeometry(2, 0.7, 12), m['white-paint'], trs(px, 3.8, pz));
        b.add(new THREE.CylinderGeometry(0.8, 0.8, 0.08, 12), m['white-paint'], trs(px, 1.9, pz));
    }
    b.build(bodyG);
    r.build(roofG);
    group.position.set(cx, 0, cz);
    group.userData.info = { id: 'rest-glass', title: '西式餐厅', area: '3,000㎡', desc: '两层通透玻璃盒子餐厅，白色框架与屋顶机组，临水木平台配遮阳伞。' };
    return { group, explode: [{ obj: roofG, dir: new THREE.Vector3(0, 12, 0) }] };
}
/** Pitched-roof restaurant (A: 日式餐厅 / B: 西式餐厅, 3,000㎡): timber frame + 入母屋 roofs + deck. */
export function buildChineseRestaurant(M, cx, cz, deckDir) {
    const m = M.M;
    const group = new THREE.Group();
    group.name = 'rest-cn';
    const bodyG = new THREE.Group(), roofG = new THREE.Group();
    group.add(bodyG, roofG);
    const b = new Batch().tag('rest-cn'), r = new Batch().tag('rest-cn-roof');
    const glaze = M.warm(12, 2, '#3b2c20');
    b.add(facadeBox(58, 0.9, 30, 6), m['stone-plain'], trs(0, 0.45, 0));
    // main hall
    // taller warm-glazed walls (≈2/5 of total height in ref B), roof with moderate 1.8–2.2 m eaves
    b.add(facadeBox(34, 7.6, 18, 11, 7.6), glaze, trs(0, 0.9 + 3.8, 0));
    for (let x = -17; x <= 17; x += 3.4)
        for (const z of [-9.3, 9.3])
            b.box(0.45, 7.6, 0.45, m['timber'], x, 0.9, z);
    b.box(35, 0.6, 19, m['timber'], 0, 8.5, 0);
    buildRoof(r, m, 0, 9.0, 0, 38.5, 22.4, 6.4, 'xieshan', 0, { gableFrac: 0.5, upturn: 0.9 });
    // east wing
    b.add(facadeBox(14, 6, 14, 7, 6), glaze, trs(deckDir * -22, 0.9 + 3, 2));
    buildRoof(r, m, deckDir * -22, 6.9, 2, 17.5, 17.5, 4.4, 'xieshan', 0, { gableFrac: 0.5, upturn: 0.6 });
    // rear kitchen block (low hip roof)
    b.add(facadeBox(20, 4, 10, 10, 4), m['stone-plain'], trs(6, 0.9 + 2, -14));
    buildRoof(r, m, 6, 4.9, -14, 24, 13, 3, 'hip');
    // engawa veranda + deck toward water
    b.box(40, 0.4, 4, m['timber-light'], 0, 0.9, 11);
    b.box(10, 0.5, 18, m['timber-light'], deckDir * 22, 0.55, 2);
    for (let z = -6; z <= 10; z += 4)
        b.add(new THREE.CylinderGeometry(0.15, 0.15, 1.2, 6), m['timber'], trs(deckDir * 27, 1.2, z));
    // stone lanterns (tōrō)
    for (const px of [-12, 12]) {
        b.add(new THREE.CylinderGeometry(0.35, 0.45, 1.4, 6), m['stone-plain'], trs(px, 1.6, 17));
        b.add(new THREE.BoxGeometry(1.1, 0.8, 1.1), m['stone-plain'], trs(px, 2.7, 17));
        b.add(new THREE.ConeGeometry(1.0, 0.7, 4), m['stone-plain'], trs(px, 3.45, 17, Math.PI / 4));
    }
    b.build(bodyG);
    r.build(roofG);
    group.position.set(cx, 0, cz);
    group.userData.info = { id: 'rest-cn', title: '中式餐厅', area: '3,000㎡', desc: '临水中式餐厅：木构暖光玻璃立面，深灰瓦歇山屋面（小起翘）、配殿与后厨，回廊、石灯与临水平台，旁有竹林。' };
    return { group, explode: [{ obj: roofG, dir: new THREE.Vector3(0, 12, 0) }] };
}
/** Main ceremonial gate (ref B crop): 4 stone pylons, lintels + plaque, side walls, guard booths, flagpoles. */
export function buildGate(M, cx, cz, flagMats) {
    const m = M.M;
    const group = new THREE.Group();
    group.name = 'gate';
    const b = new Batch().tag('gate-pylon');
    const pylon = (x, h, w) => {
        b.add(facadeBox(w + 1.2, 1.4, w + 1.2, 6), m['stone-plain'], trs(x, 0.7, 0));
        b.add(facadeBox(w, h, w, 6), m['stone-cladding'], trs(x, 1.4 + h / 2, 0));
        // recessed front/back panels
        for (const sz of [-1, 1])
            b.box(w * 0.55, h * 0.62, 0.3, m['stone-plain'], x, 1.4 + h * 0.18, sz * (w / 2 + 0.05));
        // stepped cap
        b.box(w + 0.8, 0.8, w + 0.8, m['stone-plain'], x, 1.4 + h, 0);
        b.box(w + 0.2, 0.9, w + 0.2, m['stone-cladding'], x, 1.4 + h + 0.8, 0);
        b.box(w - 0.8, 0.6, w - 0.8, m['stone-plain'], x, 1.4 + h + 1.7, 0);
    };
    pylon(-12.5, 20, 6.5);
    pylon(12.5, 20, 6.5);
    pylon(-32, 17, 5.5);
    pylon(32, 17, 5.5);
    // main lintel between inner pylons + plaque
    b.tag('gate');
    b.box(19, 3.2, 5, m['stone-cladding'], 0, 17.4, 0);
    b.box(19.6, 0.6, 5.6, m['stone-plain'], 0, 20.6, 0);
    b.box(8, 1.6, 0.2, m['signage'], 0, 18.3, 2.6);
    b.box(6, 0.6, 0.1, m['gold-letter'], 0, 18.3, 2.72);
    b.box(8, 1.6, 0.2, m['signage'], 0, 18.3, -2.6);
    // side lintels (inner-outer)
    for (const sx of [-1, 1]) {
        b.box(13.5, 2.4, 4, m['stone-cladding'], sx * 22.25, 13.6, 0);
        b.box(8, 1.2, 0.2, m['signage'], sx * 22.25, 14.3, 2.1);
        // lower screen beam with planter row (ref shows greenery on the gate beam)
        b.box(13.5, 1, 3.6, m['stone-plain'], sx * 22.25, 6, 0);
        // side walls with end piers
        b.tag('gate-wall');
        b.box(36, 7, 1.6, m['stone-cladding'], sx * 53, 0, 0);
        b.box(37, 0.5, 2, m['stone-plain'], sx * 53, 7, 0);
        b.add(facadeBox(6, 10, 6, 6), m['stone-cladding'], trs(sx * 74, 5, 0));
        b.box(6.8, 0.6, 6.8, m['stone-plain'], sx * 74, 10, 0);
        // guard booth
        b.tag('gate');
        b.add(facadeBox(6, 3.4, 4, 3, 3.4), m['dark-glass'], trs(sx * 22.25, 1.7, 0));
        b.box(7, 0.4, 5, m['stone-plain'], sx * 22.25, 3.4, 0);
        // lift barriers
        b.box(8, 0.15, 0.15, m['white-paint'], sx * 4.6, 1.1, 1);
    }
    b.tag('gate');
    // entry apron paving and planters in front
    // apron either side of the entrance throat (the 16 m carriageway itself stays asphalt)
    for (const sx of [-1, 1])
        b.box(66, 0.12, 10, m['granite-paving'], sx * 42, 0, -7);
    // flagpoles (6 per side)
    b.tag('flagpoles');
    const flags = [];
    for (const sx of [-1, 1])
        for (let k = 0; k < 6; k++) {
            const px = sx * (86 + k * 6), pz = -6;
            b.add(new THREE.CylinderGeometry(0.1, 0.15, 18, 8), m['galvanized-steel'], trs(px, 9, pz));
            b.add(new THREE.SphereGeometry(0.25, 8, 6), m['gold-letter'], trs(px, 18.1, pz));
            const fg = new THREE.PlaneGeometry(3.6, 2.4, 12, 4);
            fg.translate(1.8, 0, 0);
            const flag = new THREE.Mesh(fg, flagMats[(k + (sx > 0 ? 3 : 0)) % flagMats.length]);
            flag.position.set(px + 0.15, 16.4, pz);
            flag.userData.base = fg.getAttribute('position').array.slice(0);
            flag.userData.phase = k * 0.7 + (sx > 0 ? 2 : 0);
            flag.castShadow = true;
            group.add(flag);
            flags.push(flag);
        }
    b.build(group);
    group.position.set(cx, 0, cz);
    group.userData.info = { id: 'gate', title: '园区主入口大门', area: '', desc: '四柱三门石材牌楼式大门，额枋匾额、两翼门卫岗亭与挡墙，前侧 12 面旗杆，南北向中轴起点。' };
    return { group, explode: [], flags };
}
export { extrudePoly };
