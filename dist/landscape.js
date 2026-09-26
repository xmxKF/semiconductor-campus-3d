import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { Batch, trs, rng, makeNoise2D, ribbon, flatPoly, extrudePoly, offsetClosed, pointInPoly, roundedRectPts, smoothClosed } from './util.js?v=bd76b00c2d';
import { B, POND, ISLANDS, FOUNTAINS, ROADS, INTERCHANGE, BLOCKERS, CAUSEWAY, DROPOFF, ROAD_Z, PERIM_Z, FRONTAGE_Z, kerbReturn, BEDS, HALL_FORECOURT, inRect, SITE } from './layout.js?v=bd76b00c2d';
import { softSpriteTex } from './textures.js?v=bd76b00c2d';
const noise = makeNoise2D(2024);
/** Terrain height outside the site: flat campus, gentle rolling land E/W/N, forested ridges south (ref A foreground / ref B skyline). */
export function terrainHeight(x, z) {
    const dx = Math.max(0, Math.abs(x) - 520), dzS = Math.max(0, z - 360), dzN = Math.max(0, -z - 430);
    const edge = Math.hypot(dx, Math.max(dzS, dzN));
    if (edge <= 0)
        return 0;
    const blend = Math.min(1, edge / 160);
    const rolling = (noise.fbm(x / 260, z / 260, 4) - 0.35) * 30 * blend;
    // ref A foreground: forested ridges rise right behind the south wall with misty valleys between
    // ridged noise (1-|2n-1|) gives sharp forested spurs with deep valleys, like ref A's foreground
    const ridged = (px, pz) => { let s = 0, a = 0.55, f = 1; for (let i = 0; i < 4; i++) {
        s += a * (1 - Math.abs(2 * noise.noise(px * f, pz * f) - 1));
        a *= 0.5;
        f *= 2.1;
    } return s; };
    const southRidge = z > 345 ? Math.pow(Math.min(1, (z - 345) / 180), 1.1) * (20 + 230 * Math.pow(ridged(x / 260 + 7, z / 200), 2.2)) : 0;
    const northRidge = z < -900 ? Math.min(1, (-z - 900) / 500) * (60 + 120 * noise.fbm(x / 500, z / 400 + 3, 5)) : 0;
    return Math.max(0, rolling) + southRidge + northRidge;
}
function roadDistanceGrid(roads) {
    // coarse spatial hash of road samples for fast "near road" queries
    const cell = 20;
    const map = new Map();
    for (const r of roads) {
        const P = r.closed ? [...r.pts, r.pts[0]] : r.pts;
        for (let i = 0; i < P.length - 1; i++) {
            const a = P[i], b = P[i + 1];
            const L = a.distanceTo(b);
            const n = Math.max(1, Math.ceil(L / 4));
            for (let k = 0; k <= n; k++) {
                const x = a.x + (b.x - a.x) * (k / n), z = a.y + (b.y - a.y) * (k / n);
                const key = `${Math.floor(x / cell)},${Math.floor(z / cell)}`;
                let arr = map.get(key);
                if (!arr) {
                    arr = [];
                    map.set(key, arr);
                }
                arr.push({ x, z, w: r.width });
            }
        }
    }
    return (x, z, margin) => {
        const cx = Math.floor(x / cell), cz = Math.floor(z / cell);
        for (let i = -2; i <= 2; i++)
            for (let j = -2; j <= 2; j++) {
                const arr = map.get(`${cx + i},${cz + j}`);
                if (!arr)
                    continue;
                for (const p of arr)
                    if (Math.hypot(p.x - x, p.z - z) < p.w / 2 + margin)
                        return true;
            }
        return false;
    };
}
export function buildLandscape(M, scene) {
    const m = M.M;
    const group = new THREE.Group();
    group.name = 'landscape';
    const parts = {};
    const updaters = [];
    const allRoads = [...ROADS, ...INTERCHANGE];
    const nearRoad = roadDistanceGrid(allRoads);
    // ------------------------------------------------------------- terrain
    {
        const W = 3600, D = 3000, nx = 240, nz = 200;
        const g = new THREE.PlaneGeometry(W, D, nx, nz);
        g.rotateX(-Math.PI / 2);
        g.translate(0, 0, 150);
        const pos = g.getAttribute('position');
        const uv = g.getAttribute('uv');
        for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i), z = pos.getZ(i);
            pos.setY(i, terrainHeight(x, z) - 0.3);
            uv.setXY(i, x / 120, z / 120);
        }
        g.computeVertexNormals();
        const mesh = new THREE.Mesh(g, m['forest-floor']);
        mesh.receiveShadow = true;
        mesh.name = 'hills';
        mesh.userData.part = 'hills';
        group.add(mesh);
        parts.terrain = mesh;
    }
    // site lawn plate
    {
        const lawn = new THREE.Mesh(flatPoly(roundedRectPts(0, 0, 990, 670, 80, 12), 0.0, 40), m['grass']);
        lawn.receiveShadow = true;
        group.add(lawn);
    }
    // ------------------------------------------------------------- roads
    {
        const rb = new Batch();
        for (const r of allRoads) {
            rb.tag(r.kind === 'highway' ? 'highway' : r === ROADS[1] ? 'ring-road' : 'roads');
            const mat = m[r.kind];
            rb.add(ribbon(r.pts, r.width, r.closed, r.kind === 'highway' ? 0.14 : 0.1, r.kind === 'highway' ? 60 : 20), mat);
            // kerbs
            if (r.kind !== 'highway') {
                rb.add(ribbon(r.pts.map(p => p), r.width + 1.2, r.closed, 0.06, 20), m['kerb']);
            }
        }
        // kerb returns R10 at the entrance throat (frontage-road junction and perimeter-road T)
        rb.tag('roads');
        for (const sx of [-1, 1]) {
            rb.add(flatPoly(kerbReturn(sx * 8, FRONTAGE_Z + 6, 10, sx > 0 ? 0 : Math.PI / 2).map((p, i) => i === 0 ? new THREE.Vector2(sx * 18, FRONTAGE_Z + 16) : p), 0.1, 20), m['asphalt']);
            rb.add(flatPoly(kerbReturn(sx * 8, PERIM_Z - 7, 10, sx > 0 ? -Math.PI / 2 : Math.PI).map((p, i) => i === 0 ? new THREE.Vector2(sx * 18, PERIM_Z - 17) : p), 0.1, 20), m['asphalt']);
        }
        // highway median barrier and sound walls
        rb.tag('highway');
        rb.box(2800, 1.1, 0.6, m['kerb'], 0, 0, -392);
        rb.box(2800, 3.5, 0.4, m['stone-plain'], 0, 0, -366);
        const g = new THREE.Group();
        g.name = 'roads';
        rb.build(g, { castShadow: false });
        group.add(g);
        parts.roads = g;
    }
    // ------------------------------------------------------------- perimeter wall + fence
    {
        const wb = new Batch().tag('perimeter-wall');
        const P = roundedRectPts(0, 0, 990, 670, 80, 12);
        for (let i = 0; i < P.length; i++) {
            const a = P[i], c = P[(i + 1) % P.length];
            const L = a.distanceTo(c), rot = Math.atan2(-(c.y - a.y), c.x - a.x);
            if (Math.abs((a.x + c.x) / 2) < 90 && (a.y + c.y) / 2 < -300)
                continue; // gate opening
            wb.add(new THREE.BoxGeometry(L + 0.1, 1.2, 0.5), m['stone-plain'], trs((a.x + c.x) / 2, 0.6, (a.y + c.y) / 2, rot));
            const n = Math.max(1, Math.round(L / 3));
            for (let k = 0; k < n; k++) {
                const t = k / n;
                wb.add(new THREE.BoxGeometry(0.12, 1.4, 0.12), m['steel-dark'], trs(a.x + (c.x - a.x) * t, 1.9, a.y + (c.y - a.y) * t));
            }
            wb.add(new THREE.BoxGeometry(L + 0.1, 0.08, 0.08), m['steel-dark'], trs((a.x + c.x) / 2, 2.5, (a.y + c.y) / 2, rot));
        }
        const g = new THREE.Group();
        g.name = 'perimeter-wall';
        wb.build(g);
        group.add(g);
        parts.wall = g;
    }
    // ------------------------------------------------------------- pond system
    {
        const pb = new Batch().tag('pond');
        // bank: slightly lowered soil ring + stone kerb ribbon along shoreline
        pb.add(flatPoly(offsetClosed(POND, 3), 0.05, 6), m['granite-paving']);
        const water = new THREE.Mesh(flatPoly(POND, 0.25, 30), m['water']);
        water.receiveShadow = true;
        water.name = 'pond-water';
        water.userData.part = 'pond-water';
        pb.add(ribbon(POND, 1.6, true, 0.42, 4), m['kerb']);
        // naturalistic rock edging in clusters along the shore (Chinese garden 叠石 style)
        {
            const rr = rng(313);
            for (let i = 0; i < POND.length; i += 3) {
                if (rr() < 0.55)
                    continue;
                const p = POND[i];
                if (Math.abs(p.x) < 14)
                    continue;
                for (let k = 0; k < 2 + Math.floor(rr() * 3); k++) {
                    const s = 0.6 + rr() * 1.3;
                    pb.add(new THREE.DodecahedronGeometry(s, 0), m['rock'], trs(p.x + (rr() - 0.5) * 3, 0.35 + s * 0.3, p.y + (rr() - 0.5) * 3, rr() * 6, rr() * 6, 0, 1.3, 0.7, 1));
                }
            }
        }
        // islands with rock rims
        pb.tag('islands');
        const r = rng(77);
        for (const isl of ISLANDS) {
            pb.add(extrudePoly(isl, 0, 1.1, 0.4), m['lawn-2']);
            for (let i = 0; i < isl.length; i += 3) {
                const p = isl[i];
                pb.add(new THREE.DodecahedronGeometry(0.8 + r() * 0.9, 0), m['rock'], trs(p.x, 0.5, p.y, r() * 6, r() * 6));
            }
        }
        pb.tag('causeway');
        // axial causeway: paved centre path, grass verges, stone edges (ref: tree-lined land bridge)
        const cz0 = CAUSEWAY.z0, cz1 = CAUSEWAY.z1;
        pb.box(22, 1.0, cz1 - cz0, m['lawn-2'], 0, 0, (cz0 + cz1) / 2);
        pb.box(8, 1.1, cz1 - cz0, m['granite-paving'], 0, 0, (cz0 + cz1) / 2);
        for (const sx of [-1, 1])
            pb.box(0.8, 1.25, cz1 - cz0, m['kerb'], sx * 11, 0, (cz0 + cz1) / 2);
        // footbridges from shore to islands
        pb.tag('bridges');
        for (const sx of [-1, 1]) {
            pb.box(3, 0.4, 18, m['timber-light'], sx * 88, 0.8, -30);
            for (let z = -38; z <= -22; z += 4)
                pb.add(new THREE.CylinderGeometry(0.15, 0.15, 1.2, 6), m['timber'], trs(sx * 88 + 1.5, 1.2, z));
            // arched stone bridge from the peninsula to the north islands
            const arch = [];
            for (let t = 0; t <= 1.0001; t += 0.1)
                arch.push(new THREE.Vector3(sx * (46 + t * 48), 0.8 + Math.sin(t * Math.PI) * 2.2, -226 - t * 12));
            pb.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(arch), 16, 1.6, 4), m['stone-plain']);
        }
        const g = new THREE.Group();
        g.name = 'pond';
        pb.build(g);
        g.add(water);
        group.add(g);
        parts.pond = g;
        // fountains: lathe spray column + GPU particle droplets
        const fountainGroup = new THREE.Group();
        // main plume: wide foaming base narrowing to a tall jet, with a flared crown
        const col = new THREE.LatheGeometry([
            new THREE.Vector2(3.2, 0), new THREE.Vector2(2.2, 1.5), new THREE.Vector2(1.3, 5), new THREE.Vector2(0.8, 12),
            new THREE.Vector2(0.6, 20), new THREE.Vector2(1.4, 25), new THREE.Vector2(1.8, 27), new THREE.Vector2(0.0, 28.5),
        ], 24);
        const jet = new THREE.LatheGeometry([new THREE.Vector2(0.5, 0), new THREE.Vector2(0.25, 5), new THREE.Vector2(0.35, 8), new THREE.Vector2(0, 9)], 10);
        const sprayMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xdfeef5, emissiveIntensity: 0.25, transparent: true, opacity: 0.62, roughness: 0.3, depthWrite: false });
        const N = 3200;
        const pGeo = new THREE.BufferGeometry();
        const seeds = new Float32Array(N * 3);
        const rr = rng(5);
        for (let i = 0; i < N; i++) {
            seeds[i * 3] = rr();
            seeds[i * 3 + 1] = rr() * Math.PI * 2;
            seeds[i * 3 + 2] = rr();
        }
        pGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(N * 3), 3));
        pGeo.setAttribute('seed', new THREE.Float32BufferAttribute(seeds, 3));
        pGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 10, 0), 30);
        const pMat = new THREE.ShaderMaterial({
            transparent: true, depthWrite: false,
            uniforms: { uTime: { value: 0 }, uMap: { value: softSpriteTex() } },
            vertexShader: `
        attribute vec3 seed; uniform float uTime; varying float vA;
        void main(){
          float life = fract(uTime*0.45 + seed.x);
          float speed = 22.0 + seed.z*6.0;
          float spread = 3.0 + seed.z*7.0;
          vec3 p = vec3(cos(seed.y)*spread*life, speed*life - 9.8*life*life*1.95, sin(seed.y)*spread*life);
          p.y = max(p.y, 0.0);
          vA = (1.0 - life) * 0.9;
          vec4 mv = modelViewMatrix * vec4(p,1.0);
          gl_PointSize = (70.0 + seed.z*60.0) / -mv.z * 10.0;
          gl_Position = projectionMatrix * mv;
        }`,
            fragmentShader: `uniform sampler2D uMap; varying float vA;
        void main(){ vec4 c = texture2D(uMap, gl_PointCoord); gl_FragColor = vec4(vec3(0.97,0.99,1.0), c.a*vA*0.75); }`,
        });
        for (const f of FOUNTAINS) {
            const fg = new THREE.Group();
            fg.position.set(f.x, 0.3, f.y);
            const c = new THREE.Mesh(col, sprayMat);
            fg.add(c);
            // ring of 12 arching jets (parabolic tubes) leaning into the main plume, plus 6 mid-height plumes
            for (let j = 0; j < 12; j++) {
                const a = (j / 12) * Math.PI * 2;
                const pts = [];
                for (let t = 0; t <= 1.0001; t += 0.1) {
                    const rr = 11 * (1 - t) + 2.5 * t;
                    pts.push(new THREE.Vector3(Math.cos(a) * rr, 4 * t * (1 - t) * 9, Math.sin(a) * rr));
                }
                fg.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.22, 5), sprayMat));
            }
            for (let j = 0; j < 6; j++) {
                const a = (j / 6) * Math.PI * 2 + 0.3;
                const jm = new THREE.Mesh(jet, sprayMat);
                jm.position.set(Math.cos(a) * 4, 0, Math.sin(a) * 4);
                jm.scale.set(1.6, 1.4, 1.6);
                fg.add(jm);
            }
            const ring = new THREE.Mesh(new THREE.RingGeometry(1.5, 12, 40), new THREE.MeshStandardMaterial({ color: 0xf4fafc, transparent: true, opacity: 0.55, roughness: 0.6 }));
            ring.rotation.x = -Math.PI / 2;
            ring.position.y = 0.05;
            fg.add(ring);
            fg.add(new THREE.Points(pGeo, pMat));
            fountainGroup.add(fg);
        }
        fountainGroup.name = 'fountains';
        fountainGroup.userData.part = 'fountains';
        group.add(fountainGroup);
        parts.fountains = fountainGroup;
        updaters.push((t) => {
            pMat.uniforms.uTime.value = t;
            m['water'].normalMap.offset.set(t * 0.004, t * 0.0025);
            fountainGroup.children.forEach((fg, i) => { fg.children[0].scale.y = 1 + Math.sin(t * 2.2 + i) * 0.05; });
        });
    }
    // ------------------------------------------------------------- plaza, green mall, landscape paving
    {
        const lb = new Batch().tag('plaza');
        // entry plaza (granite) with planters and flower beds
        lb.add(flatPoly(roundedRectPts(B.plaza.x, B.plaza.z, B.plaza.w, B.plaza.d, 6), 0.08, 8), m['granite-paving']);
        // hall forecourt: the whole peninsula is paved (pond water/kerb render on top where they overlap)
        lb.add(flatPoly(roundedRectPts(HALL_FORECOURT.x, HALL_FORECOURT.z, HALL_FORECOURT.w, HALL_FORECOURT.d, 4), 0.07, 8), m['granite-paving']);
        // discrete raised planting beds: granite kerb, soil, clipped shrubs (and flowers in the shrub beds)
        {
            const rr = rng(515);
            for (const bd of BEDS) {
                lb.box(bd.w + 0.6, 0.5, bd.d + 0.6, m['kerb'], bd.x, 0.08, bd.z);
                lb.box(bd.w, 0.55, bd.d, m['soil'], bd.x, 0.08, bd.z);
                if (bd.kind === 'shrub') {
                    // rounded shrubs on a grid + a flower strip along the front edge
                    const nx = Math.max(1, Math.round(bd.w / 2.6)), nz = Math.max(1, Math.round(bd.d / 2.6));
                    for (let i = 0; i < nx; i++)
                        for (let j = 0; j < nz; j++) {
                            const px = bd.x - bd.w / 2 + (i + 0.5) * bd.w / nx, pz = bd.z - bd.d / 2 + (j + 0.5) * bd.d / nz;
                            const sh = new THREE.IcosahedronGeometry(1, 1);
                            sh.scale(1.1, 0.75, 1.1);
                            lb.add(sh, m['hedge'], trs(px + (rr() - 0.5) * 0.4, 0.95, pz + (rr() - 0.5) * 0.4, rr() * 6, 0, 0, 0.9 + rr() * 0.3, 0.9 + rr() * 0.3, 0.9 + rr() * 0.3));
                        }
                    lb.box(bd.w - 0.4, 0.2, 0.9, m['flowerbed'], bd.x, 0.62, bd.z - bd.d / 2 + 0.7);
                }
                else {
                    lb.box(bd.w - 0.6, 0.6, bd.d - 0.6, m['hedge'], bd.x, 0.62, bd.z); // low clipped hedge under the tree row
                }
            }
            // benches along the linear beds
            for (const bx of [-38, 38])
                for (let k = 0; k < 4; k++)
                    lb.box(3, 0.45, 0.6, m['timber-light'], bx, 0.08, -300 + k * 13);
        }
        // admin north plaza: between the pond's south shore and the admin north face, meets the causeway
        lb.add(flatPoly(roundedRectPts(0, -20, 150, 22, 4), 0.1, 8), m['granite-paving']);
        lb.tag('green-mall');
        // concrete service yards / aprons around production buildings and the admin block
        lb.tag('plaza');
        for (const [r, mx, mz] of [[B.fab2, 26, 16], [B.fab1, 26, 16], [B.mask, 12, 12], [B.lab, 12, 12], [B.admin, 16, 12]]) {
            lb.add(flatPoly(roundedRectPts(r.x, r.z, r.w + mx * 2, r.d + mz * 2, 8), 0.07, 8), m['concrete']);
        }
        // zebra crossings at the gate spine and the forecourt ring; plaza benches + lamp bollards
        // crossings: gate spine; drop-off lane at the stair axis; shared road at the mall axis
        for (const [cx, cz, len, rot] of [[0, FRONTAGE_Z + 12, 16, Math.PI / 2], [0, PERIM_Z, 14, 0], [0, DROPOFF.zN, 8, 0], [0, ROAD_Z, 11, 0]]) {
            for (let k = -3; k <= 3; k++)
                lb.add(new THREE.BoxGeometry(0.6, 0.04, len), m['white-paint'], trs(cx + Math.cos(rot) * k * 1.2, 0.2, cz - Math.sin(rot) * k * 1.2, rot));
        }
        lb.tag('green-mall');
        // green mall: lawn + cross paths + central water rill
        lb.add(flatPoly(roundedRectPts(B.mall.x, B.mall.z, B.mall.w, B.mall.d, 8), 0.06, 30), m['lawn-2']);
        lb.box(6, 0.1, B.mall.d, m['granite-paving'], 0, 0.06, B.mall.z);
        for (const sx of [-1, 1])
            lb.box(3, 0.1, B.mall.d, m['granite-paving'], sx * 33, 0.06, B.mall.z);
        for (let k = 0; k < 4; k++)
            lb.box(B.mall.w, 0.1, 3, m['granite-paving'], 0, 0.06, B.mall.z - 75 + k * 50);
        // mall hedges (low clipped rows, ref: dense shrub rows between fabs)
        for (const sx of [-1, 1])
            for (let k = 0; k < 8; k++)
                lb.box(10, 1.1, 2, m['hedge'], sx * 17, 0.06, B.mall.z - 77 + k * 22);
        const g = new THREE.Group();
        g.name = 'plaza-mall';
        lb.build(g);
        group.add(g);
        parts.plaza = g;
    }
    // ------------------------------------------------------------- parking lots + cars
    {
        const pb = new Batch().tag('parking');
        const carPos = [];
        const r = rng(404);
        for (const lot of [B.parkingNW, B.parkingNE]) {
            const x0 = lot.x - lot.w / 2, z0 = lot.z - lot.d / 2;
            const g = new THREE.PlaneGeometry(lot.w, lot.d);
            g.rotateX(-Math.PI / 2);
            const pos = g.getAttribute('position'), uv = g.getAttribute('uv');
            for (let i = 0; i < pos.count; i++)
                uv.setXY(i, (pos.getX(i) + lot.w / 2) / 40, (pos.getZ(i) + lot.d / 2) / 20);
            pb.add(g, m['parking'], trs(lot.x, 0.09, lot.z));
            pb.add(ribbon(roundedRectPts(lot.x, lot.z, lot.w + 2, lot.d + 2, 4), 1.4, true, 0.12, 10), m['kerb']);
            // tree islands every 3rd module
            for (let tz = 0; tz < lot.d / 20; tz++)
                for (let tx = 0; tx < lot.w / 40; tx++) {
                    for (const row of [2.75, 17.25])
                        for (let k = 0; k < 16; k++) {
                            const x = x0 + tx * 40 + 1.25 + k * 2.5, z = z0 + tz * 20 + row;
                            if (x > lot.x + lot.w / 2 - 2 || z > lot.z + lot.d / 2 - 2)
                                continue;
                            if (r() < 0.86)
                                carPos.push({ x, z, r: row < 10 ? 0 : Math.PI });
                        }
                }
        }
        const g = new THREE.Group();
        g.name = 'parking';
        pb.build(g, { castShadow: false });
        // car body from an extruded side profile + cabin glass
        const prof = new THREE.Shape();
        prof.moveTo(-2.3, 0.25);
        prof.lineTo(2.3, 0.25);
        prof.lineTo(2.35, 0.75);
        prof.lineTo(1.6, 0.9);
        prof.lineTo(0.9, 1.45);
        prof.lineTo(-1.2, 1.45);
        prof.lineTo(-2.0, 0.95);
        prof.lineTo(-2.35, 0.85);
        prof.closePath();
        const carGeo = new THREE.ExtrudeGeometry(prof, { depth: 1.7, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.08, bevelSegments: 1 });
        carGeo.translate(0, 0, -0.85);
        carGeo.rotateY(Math.PI / 2);
        const glassGeo = new THREE.BoxGeometry(1.62, 0.45, 1.9);
        glassGeo.translate(0, 1.2, -0.1);
        const colors = [0xf2f2f2, 0xf2f2f2, 0xc7cacd, 0x9ea3a8, 0x2b2e33, 0x1f1f22, 0x8b1e1e, 0x1e3f7a, 0x6b7a86];
        const cars = new THREE.InstancedMesh(carGeo, new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.5 }), carPos.length);
        const glass = new THREE.InstancedMesh(glassGeo, m['dark-glass'], carPos.length);
        const c = new THREE.Color();
        carPos.forEach((p, i) => {
            const mm = trs(p.x, 0.1, p.z, p.r + (r() - 0.5) * 0.06);
            cars.setMatrixAt(i, mm);
            glass.setMatrixAt(i, mm);
            cars.setColorAt(i, c.setHex(colors[Math.floor(r() * colors.length)]));
        });
        cars.castShadow = true;
        cars.receiveShadow = true;
        g.add(cars, glass);
        group.add(g);
        parts.parking = g;
        parts.carGeo = new THREE.Mesh(carGeo); // reused for traffic
    }
    // ------------------------------------------------------------- street lamps
    {
        const pts = [];
        for (const rd of ROADS) {
            if (rd.kind === 'highway')
                continue;
            const P = rd.closed ? [...rd.pts, rd.pts[0]] : rd.pts;
            let acc = 0;
            for (let i = 0; i < P.length - 1; i++) {
                const a = P[i], b = P[i + 1], L = a.distanceTo(b);
                const tx = (b.x - a.x) / L, tz = (b.y - a.y) / L;
                for (let d = (30 - acc) % 30; d < L; d += 30) {
                    const x = a.x + tx * d - tz * (rd.width / 2 + 1.5), z = a.y + tz * d + tx * (rd.width / 2 + 1.5);
                    pts.push(new THREE.Vector3(x, 0, z));
                }
                acc = (acc + L) % 30;
            }
        }
        const pole = new THREE.CylinderGeometry(0.1, 0.14, 8, 6);
        pole.translate(0, 4, 0);
        const head = new THREE.BoxGeometry(1.4, 0.25, 0.5);
        head.translate(0.6, 8, 0);
        const lamps = new THREE.InstancedMesh(pole, m['steel-dark'], pts.length);
        const headMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, emissive: 0xffd49a, emissiveIntensity: 0, roughness: 0.4 });
        headMat.userData.nightEmissive = 3; // lamp heads glow in night mode
        const heads = new THREE.InstancedMesh(head, headMat, pts.length);
        pts.forEach((p, i) => { lamps.setMatrixAt(i, trs(p.x, 0, p.z)); heads.setMatrixAt(i, trs(p.x, 0, p.z)); });
        lamps.add(heads);
        lamps.name = 'lamps';
        lamps.userData.part = 'lamps';
        group.add(lamps);
        parts.lamps = lamps;
    }
    // ------------------------------------------------------------- trees
    const treeCounts = buildTrees(M, group, nearRoad, parts);
    void treeCounts;
    // ------------------------------------------------------------- bamboo grove beside the Japanese restaurant (ref A, yellow-green clump)
    {
        const r = rng(88);
        const culm = new THREE.CylinderGeometry(0.06, 0.09, 1, 5);
        culm.translate(0, 0.5, 0);
        const leaf = new THREE.IcosahedronGeometry(1, 1);
        leaf.scale(0.9, 1.8, 0.9);
        const pts = [];
        for (let i = 0; i < 260; i++) {
            const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 20;
            const x = 222 + Math.cos(a) * d * 1.1, z = -80 + Math.sin(a) * d * 0.9;
            if (pointInPoly(x, z, POND) || nearRoad(x, z, 2))
                continue;
            pts.push({ x, z, h: 9 + r() * 6 });
        }
        const culms = new THREE.InstancedMesh(culm, new THREE.MeshStandardMaterial({ color: 0x8a9a4a, roughness: 0.6 }), pts.length);
        const leaves = new THREE.InstancedMesh(leaf, new THREE.MeshStandardMaterial({ color: 0x9fb54f, roughness: 0.85 }), pts.length);
        const c = new THREE.Color();
        pts.forEach((p, i) => {
            const lean = (r() - 0.5) * 0.12;
            culms.setMatrixAt(i, trs(p.x, 0, p.z, 0, lean, lean, 1, p.h, 1));
            leaves.setMatrixAt(i, trs(p.x + lean * p.h, p.h * 0.82, p.z - lean * p.h, r() * 6, 0, 0, 1.3, 1.6, 1.3));
            leaves.setColorAt(i, c.setHSL(0.2 + r() * 0.04, 0.45, 0.42 + r() * 0.12));
        });
        culms.castShadow = leaves.castShadow = true;
        const g = new THREE.Group();
        g.name = 'bamboo';
        g.add(culms, leaves);
        group.add(g);
        parts.bamboo = g;
    }
    // ------------------------------------------------------------- campus traffic on the core loop
    {
        const loop = ROADS[1];
        const curve = new THREE.CatmullRomCurve3(loop.pts.map(p => new THREE.Vector3(p.x, 0.15, p.y)), true);
        const L = curve.getLength();
        const carGeo = parts.carGeo.geometry;
        const N = 26;
        const im = new THREE.InstancedMesh(carGeo, new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.5 }), N);
        const cc = [0xf2f2f2, 0x2b2e33, 0xc7cacd, 0x1e3f7a, 0x8b1e1e];
        const c = new THREE.Color();
        const st = Array.from({ length: N }, (_, i) => ({ u: i / N, dir: i % 2 ? 1 : -1, v: 9 + (i % 5) }));
        st.forEach((_, i) => im.setColorAt(i, c.setHex(cc[i % cc.length])));
        im.castShadow = false;
        im.name = 'campus-traffic'; // moving: excluded from the static shadow map
        group.add(im);
        const p = new THREE.Vector3(), tg = new THREE.Vector3();
        const tick = (dt) => {
            st.forEach((s, i) => {
                s.u = (s.u + (s.dir * s.v * dt) / L + 1) % 1;
                curve.getPointAt(s.u, p);
                curve.getTangentAt(s.u, tg);
                const side = s.dir > 0 ? 1 : -1;
                const nx = -tg.z * side * 2.6, nz = tg.x * side * 2.6;
                const yaw = Math.atan2(tg.x * s.dir, tg.z * s.dir);
                im.setMatrixAt(i, trs(p.x + nx, 0.12, p.z + nz, yaw));
            });
            im.instanceMatrix.needsUpdate = true;
        };
        tick(0);
        updaters.push((_, dt) => tick(dt));
    }
    // ------------------------------------------------------------- highway traffic
    {
        const carGeo = parts.carGeo.geometry;
        const lanes = [-392 - 16, -392 - 12.5, -392 - 9, -392 - 5.5, -392 + 5.5, -392 + 9, -392 + 12.5, -392 + 16, -355, -349];
        const N = 180;
        const traffic = new THREE.InstancedMesh(carGeo, new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.5 }), N);
        const r = rng(9);
        const state = Array.from({ length: N }, (_, i) => {
            const lane = lanes[i % lanes.length];
            const dir = lane < -392 || lane === -355 ? -1 : 1;
            return { x: (r() - 0.5) * 2800, z: lane, dir, v: 22 + r() * 12, s: r() < 0.12 ? 1.8 : 1 };
        });
        const colors = [0xf2f2f2, 0xc7cacd, 0x2b2e33, 0x8b1e1e, 0x1e3f7a, 0xe0e0e0];
        const c = new THREE.Color();
        state.forEach((_, i) => traffic.setColorAt(i, c.setHex(colors[i % colors.length])));
        traffic.castShadow = false;
        traffic.name = 'traffic';
        traffic.userData.part = 'vehicles';
        group.add(traffic);
        parts.traffic = traffic;
        let enabled = true;
        traffic.setEnabled = (v) => { enabled = v; };
        const tmp = new THREE.Matrix4();
        const tick = (dt) => {
            state.forEach((s, i) => {
                if (enabled) {
                    s.x += s.dir * s.v * dt;
                    if (s.x > 1400)
                        s.x = -1400;
                    if (s.x < -1400)
                        s.x = 1400;
                }
                tmp.copy(trs(s.x, 0.15, s.z, s.dir > 0 ? Math.PI / 2 : -Math.PI / 2, 0, 0, s.s, s.s, s.s));
                traffic.setMatrixAt(i, tmp);
            });
            traffic.instanceMatrix.needsUpdate = true;
        };
        tick(0);
        updaters.push((_, dt) => tick(dt));
    }
    // ------------------------------------------------------------- off-site lakes (ref A: lake beyond the NW corner, pond W of parking)
    {
        const lb = new Batch();
        lb.add(flatPoly(smoothClosed([[-760, -600], [-650, -660], [-540, -610], [-560, -500], [-680, -470], [-770, -520]], 80), 0.5, 30), m['water']);
        lb.add(flatPoly(smoothClosed([[-600, -250], [-545, -275], [-515, -230], [-560, -195], [-610, -210]], 50), 0.4, 30), m['water']);
        lb.add(flatPoly(smoothClosed([[560, -250], [610, -270], [650, -235], [610, -200], [565, -215]], 50), 0.4, 30), m['water']);
        const g = new THREE.Group();
        g.name = 'lakes';
        lb.build(g, { castShadow: false });
        group.add(g);
    }
    // ------------------------------------------------------------- mist over the southern hills (both refs)
    {
        const mat = new THREE.SpriteMaterial({ map: softSpriteTex(), color: 0xf4f6f8, transparent: true, opacity: 0.42, depthWrite: false, fog: false, toneMapped: false });
        const mist = new THREE.Group();
        mist.name = 'mist';
        const r = rng(12);
        for (let i = 0; i < 220; i++) {
            const s = new THREE.Sprite(mat);
            const x = (r() - 0.5) * 2600, z = 380 + r() * 900;
            // settle into valleys: sample a few candidates and keep the lowest ground
            let bx = x, bz = z, bh = terrainHeight(x, z);
            for (let k = 0; k < 4; k++) {
                const cx = x + (r() - 0.5) * 160, cz = z + (r() - 0.5) * 120;
                const h = terrainHeight(cx, cz);
                if (h < bh) {
                    bx = cx;
                    bz = cz;
                    bh = h;
                }
            }
            s.position.set(bx, bh + 22 + r() * 20, bz);
            const sc = 70 + r() * 170;
            s.scale.set(sc, sc * 0.32, 1);
            mist.add(s);
        }
        for (let i = 0; i < 26; i++) {
            const s = new THREE.Sprite(mat);
            const x = (r() - 0.5) * 3000, z = -1000 - r() * 400;
            s.position.set(x, terrainHeight(x, z) + 20 + r() * 40, z);
            const sc = 250 + r() * 250;
            s.scale.set(sc, sc * 0.3, 1);
            mist.add(s);
        }
        group.add(mist);
        parts.mist = mist;
        updaters.push((t) => mist.children.forEach((s, i) => { s.position.x += Math.sin(t * 0.05 + i) * 0.02; }));
    }
    scene.add(group);
    const pruneTrees = (boxes) => {
        let removed = 0;
        const m4 = new THREE.Matrix4(), pos = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), col = new THREE.Color();
        const hit = (p, rad) => boxes.some(b => p.x > b.min.x - rad && p.x < b.max.x + rad && p.z > b.min.z - rad && p.z < b.max.z + rad && p.y < b.max.y + 2);
        parts.trees.traverse(o => {
            const im = o;
            if (!im.isInstancedMesh)
                return;
            let k = 0;
            for (let i = 0; i < im.count; i++) {
                im.getMatrixAt(i, m4);
                m4.decompose(pos, q, sc);
                const rad = Math.max(sc.x, sc.z) * 0.9; // canopy radius ≈ 0.9 × instance scale
                if (hit(pos, rad)) {
                    removed++;
                    continue;
                }
                if (k !== i) {
                    im.setMatrixAt(k, m4);
                    if (im.instanceColor) {
                        im.getColorAt(i, col);
                        im.setColorAt(k, col);
                    }
                }
                k++;
            }
            im.count = k;
            im.instanceMatrix.needsUpdate = true;
            if (im.instanceColor)
                im.instanceColor.needsUpdate = true;
            im.computeBoundingSphere();
        });
        return removed;
    };
    return { group, parts, update: (t, dt) => updaters.forEach(u => u(t, dt)), pruneTrees };
}
/** Canopy geometry: cluster of noise-displaced icospheres with a vertical AO gradient in vertex colours. */
function canopyGeometry(seed, lobes, detail, shape) {
    const r = rng(seed);
    const n = makeNoise2D(seed);
    const parts = [];
    if (shape === 'cone') {
        for (let k = 0; k < 3; k++) {
            const g = new THREE.ConeGeometry(1.0 - k * 0.22, 1.2, 8, 1);
            g.translate(0, 0.6 + k * 0.55, 0);
            parts.push(g.toNonIndexed());
        }
    }
    else if (shape === 'umbrella') {
        // Yoshino cherry: vase-shaped branching, broad flattened spreading crown (spread ≈ height)
        for (let i = 0; i < lobes; i++) {
            const g = new THREE.IcosahedronGeometry(1, detail);
            const a = (i / lobes) * Math.PI * 2 + r() * 0.5, d = i === 0 ? 0 : 0.55 + r() * 0.3;
            const s = 0.5 + r() * 0.2;
            g.scale(s * 1.15, s * 0.55, s * 1.15);
            g.translate(Math.cos(a) * d, 0.75 + r() * 0.25 + (i === 0 ? 0.25 : 0), Math.sin(a) * d);
            parts.push(g);
        }
        // visible scaffold branches rising from the trunk in a vase
        for (let i = 0; i < 4; i++) {
            const a = (i / 4) * Math.PI * 2 + 0.4;
            const br = new THREE.CylinderGeometry(0.03, 0.05, 0.8, 4);
            br.translate(0, 0.4, 0);
            br.rotateZ(0.6);
            br.rotateY(a);
            parts.push(br);
        }
    }
    else {
        for (let i = 0; i < lobes; i++) {
            const g = new THREE.IcosahedronGeometry(1, detail);
            const s = shape === 'column' ? 0.55 : 0.6 + r() * 0.35;
            const a = r() * Math.PI * 2, d = i === 0 ? 0 : 0.35 + r() * 0.35;
            g.scale(s, s * (shape === 'column' ? 1.5 : 0.9), s);
            g.translate(Math.cos(a) * d, (shape === 'column' ? 0.9 + i * 0.35 : 0.55 + r() * 0.45), Math.sin(a) * d);
            parts.push(g);
        }
    }
    const merged = mergeGeometries(parts.map(p => (p.index ? p.toNonIndexed() : p)));
    const pos = merged.getAttribute('position');
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        if (shape !== 'cone') {
            const k = 1 + (n.noise(x * 3 + 5, z * 3 + y * 2) - 0.5) * 0.35;
            pos.setXYZ(i, x * k, y * (0.95 + (k - 1) * 0.5), z * k);
        }
        const ao = 0.55 + 0.45 * Math.min(1, Math.max(0, y / 1.6));
        col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = ao;
    }
    merged.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    merged.deleteAttribute('normal');
    merged.deleteAttribute('uv');
    const smooth = shape === 'cone' ? merged : mergeVertices(merged, 1e-3);
    smooth.computeVertexNormals();
    return smooth;
}
function buildTrees(M, group, nearRoad, parts) {
    const r = rng(31337);
    const trees = [];
    const blocked = (x, z, margin = 4) => {
        for (const b of BLOCKERS)
            if (inRect(x, z, b, margin))
                return true;
        if (pointInPoly(x, z, POND))
            return true;
        if (nearRoad(x, z, 3))
            return true;
        return false;
    };
    const inSite = (x, z) => Math.abs(x) < 490 && Math.abs(z) < 330;
    // every paved / sealed surface drawn in this file or in architecture.ts (world coordinates)
    const PAVED = [
        B.plaza, HALL_FORECOURT, { x: 0, z: -20, w: 150, d: 22 }, // gate plaza, hall forecourt, admin north plaza
        { x: 0, z: 76, w: 140, d: 12 }, { x: 0, z: -341, w: 150, d: 10 }, // admin south plaza, gate apron
        B.parkingNW, B.parkingNE,
        { x: B.fab2.x, z: B.fab2.z, w: B.fab2.w + 52, d: B.fab2.d + 32 }, { x: B.fab1.x, z: B.fab1.z, w: B.fab1.w + 52, d: B.fab1.d + 32 },
        { x: B.mask.x, z: B.mask.z, w: B.mask.w + 24, d: B.mask.d + 24 }, { x: B.lab.x, z: B.lab.z, w: B.lab.w + 24, d: B.lab.d + 24 },
        { x: B.admin.x, z: B.admin.z, w: B.admin.w + 32, d: B.admin.d + 24 },
        { x: 0, z: (CAUSEWAY.z0 + CAUSEWAY.z1) / 2, w: 9, d: CAUSEWAY.z1 - CAUSEWAY.z0 }, // causeway deck
        { x: 0, z: B.mall.z, w: 8, d: B.mall.d }, // mall spine path
    ];
    const pondHard = offsetClosed(POND, 6);
    const onGrass = (x, z, r = 1.5) => {
        if (PAVED.some(p => inRect(x, z, p, r)))
            return false;
        if (pointInPoly(x, z, pondHard) && !ISLANDS.some(i => pointInPoly(x, z, i)))
            return false; // water + stone kerb ring
        if (nearRoad(x, z, r + 1.5))
            return false;
        if (Math.abs(z - FRONTAGE_Z) < 20 || Math.abs(z + 392) < 26)
            return false; // frontage verge / sound wall / expressway
        return true;
    };
    const planters = [];
    const push = (x, z, s, kind) => { if (onGrass(x, z, s * 0.35))
        trees.push({ x, z, y: 0, s, kind, tint: r() }); };
    // 1) street trees both sides of internal roads
    for (const rd of ROADS) {
        if (rd.kind === 'highway')
            continue;
        const P = rd.closed ? [...rd.pts, rd.pts[0]] : rd.pts;
        for (let i = 0; i < P.length - 1; i++) {
            const a = P[i], b = P[i + 1], L = a.distanceTo(b);
            const tx = (b.x - a.x) / L, tz = (b.y - a.y) / L;
            for (let d = 0; d < L; d += 15) {
                for (const side of [-1, 1]) {
                    const off = rd.width / 2 + 6;
                    const x = a.x + tx * d - tz * off * side, z = a.y + tz * d + tx * off * side;
                    if (!inSite(x, z) && Math.abs(z + 352) > 20)
                        continue;
                    if (blocked(x, z, 5))
                        continue;
                    push(x, z, 4.2 + r() * 1.4, rd === ROADS[1] && r() < 0.3 ? 'blossom' : 'broad');
                }
            }
        }
    }
    // 2) pond shoreline blossom belt (ref: pink cherry ring around the lake)
    for (const off of [7, 15]) {
        const ring = offsetClosed(POND, off);
        for (let i = 0; i < ring.length; i += 2) {
            const p = ring[i];
            if (r() < 0.5 || blocked(p.x, p.y, 4))
                continue;
            push(p.x + (r() - 0.5) * 3, p.y + (r() - 0.5) * 3, 4.2 + r() * 1.6, r() < 0.7 ? 'blossom' : 'broad');
        }
    }
    // 3) islands
    for (const isl of ISLANDS) {
        let cx = 0, cz = 0;
        isl.forEach(p => { cx += p.x; cz += p.y; });
        cx /= isl.length;
        cz /= isl.length;
        for (let k = 0; k < 4; k++)
            push(cx + (r() - 0.5) * 14, cz + (r() - 0.5) * 7, 3 + r() * 1.5, r() < 0.7 ? 'blossom' : 'broad');
    }
    // 4) causeway columnar rows
    for (let z = CAUSEWAY.z0 + 4; z <= CAUSEWAY.z1 - 4; z += 10)
        for (const sx of [-1, 1])
            trees.push({ x: sx * 7.5, z, y: 1, s: 3.2, kind: 'column', tint: r() });
    // 5) green mall avenues + blossom accents
    for (let z = B.mall.z - B.mall.d / 2 + 6; z <= B.mall.z + B.mall.d / 2 - 6; z += 12) {
        for (const sx of [-1, 1]) {
            push(sx * 24, z, 3.6 + r(), 'column');
            push(sx * 36, z, 3.8 + r(), 'broad');
        }
        if (r() < 0.5)
            push((r() - 0.5) * 20, z, 3.4, 'blossom');
    }
    // 6) plaza tree grid
    for (const bd of BEDS) {
        if (bd.kind === 'linear')
            for (let z = bd.z - bd.d / 2 + 3; z <= bd.z + bd.d / 2 - 3; z += 7)
                trees.push({ x: bd.x, z, y: 0.6, s: 3.0, kind: 'column', tint: r() });
        else if (bd.w >= 12) {
            trees.push({ x: bd.x - bd.w * 0.22, z: bd.z, y: 0.6, s: 2.6, kind: bd.d > 8 ? 'blossom' : 'broad', tint: r() });
            if (bd.d > 8)
                trees.push({ x: bd.x + bd.w * 0.25, z: bd.z + 2, y: 0.6, s: 2.3, kind: 'broad', tint: r() });
        }
    }
    // 7) landscape fill inside site (jittered grid)
    const pondHalo = offsetClosed(POND, 32);
    for (let x = -485; x <= 485; x += 13)
        for (let z = -325; z <= 325; z += 13) {
            const px = x + (r() - 0.5) * 8, pz = z + (r() - 0.5) * 8;
            if (blocked(px, pz, 8))
                continue;
            const nearPond = pointInPoly(px, pz, pondHalo);
            const dens = nearPond ? 0.55 : 0.36;
            if (r() > dens)
                continue;
            const inMall = Math.abs(px) < 50 && pz > ROAD_Z;
            push(px, pz, 4 + r() * 2.2, (nearPond && r() < 0.5) || (inMall && r() < 0.3) ? 'blossom' : r() < 0.1 ? 'conifer' : r() < 0.06 ? 'blossom' : 'broad');
        }
    // 8) forest outside the site (terrain-following), lower poly
    for (let x = -1700; x <= 1700; x += 13)
        for (let z = -1300; z <= 1600; z += 13) {
            // 13 m grid; beyond ~900 m keep roughly the old 17 m density (fog-hazed anyway)
            if (Math.hypot(x, z) > 900 && r() < 0.42)
                continue;
            const px = x + (r() - 0.5) * 11, pz = z + (r() - 0.5) * 11;
            if (Math.abs(px) < 505 && Math.abs(pz) < 345)
                continue;
            if (Math.abs(pz + 392) < 34 || Math.abs(pz + 352) < 10)
                continue; // highway corridor
            if (Math.abs(px - 720) < 22 && pz < -300)
                continue;
            if (px > 560 && px < 880 && pz < -400 && pz > -545)
                continue;
            if (Math.hypot(px + 655, pz + 565) < 125)
                continue; // lake (ref A top-left)
            if (Math.hypot(px + 560, pz + 235) < 60 || Math.hypot(px - 605, pz + 235) < 60)
                continue;
            // thin the far belt (>800 m from the campus centre) — it is fog-hazed in both refs
            const far = Math.hypot(px, pz) > 800;
            if (far && r() < 0.45)
                continue;
            const h = terrainHeight(px, pz);
            trees.push({ x: px, z: pz, y: h, s: (far ? 10 : 9) + r() * 4, kind: r() < 0.08 ? 'conifer' : 'forest', tint: r() });
        }
    const geos = {
        broad: canopyGeometry(1, 3, 1, 'round'),
        column: canopyGeometry(2, 3, 1, 'column'),
        blossom: canopyGeometry(3, 7, 1, 'umbrella'),
        conifer: canopyGeometry(4, 1, 0, 'cone'),
        // off-site forest seen only from aerial distance: detail-0 lobes, smooth normals (~100 tris)
        forest: canopyGeometry(5, 4, 0, 'blob'),
    };
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
    const palettes = {
        broad: [0x3d6230, 0x345a2c, 0x4a7236, 0x5a7f3d, 0x2c4d27, 0x6a8a44, 0x7a8f45],
        column: [0x3a6030, 0x4b733a, 0x5c8240, 0x6f8a3e],
        blossom: [0xeec3d3, 0xf2d3df, 0xe4aec3, 0xf5e3ea, 0xd697b1, 0xe9c9d2],
        conifer: [0x2f5a32, 0x355f36, 0x28502c],
        forest: [0x26432a, 0x2e5030, 0x375a34, 0x213a24, 0x42663a, 0x2b4a2c, 0x4d6b3c],
    };
    const trunkGeo = new THREE.CylinderGeometry(0.08, 0.12, 1, 5);
    trunkGeo.translate(0, 0.5, 0);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4d3b2b, roughness: 0.9 });
    const out = new THREE.Group();
    out.name = 'trees';
    out.userData.part = 'trees';
    if (planters.length) {
        const kerb = new THREE.InstancedMesh(new THREE.CylinderGeometry(2.4, 2.5, 0.55, 20), new THREE.MeshStandardMaterial({ color: 0xcfcbc2, roughness: 0.85 }), planters.length);
        const soil = new THREE.InstancedMesh(new THREE.CylinderGeometry(2.05, 2.05, 0.58, 20), new THREE.MeshStandardMaterial({ color: 0x5f7a3c, roughness: 1 }), planters.length);
        planters.forEach((p, i) => { kerb.setMatrixAt(i, trs(p.x, 0.28, p.z)); soil.setMatrixAt(i, trs(p.x, 0.3, p.z)); });
        kerb.receiveShadow = soil.receiveShadow = true;
        out.add(kerb, soil);
    }
    const c = new THREE.Color();
    const siteTrunks = [];
    for (const kind of Object.keys(geos)) {
        const all = trees.filter(t => t.kind === kind);
        if (!all.length)
            continue;
        // spatial tiles (500 m) so each InstancedMesh gets a tight bounding sphere and is frustum-culled
        const tiles = new Map();
        for (const t of all) {
            const key = `${Math.floor(t.x / 500)},${Math.floor(t.z / 500)}`;
            (tiles.get(key) ?? tiles.set(key, []).get(key)).push(t);
        }
        for (const list of tiles.values()) {
            const im = new THREE.InstancedMesh(geos[kind], mat, list.length);
            list.forEach((t, i) => {
                const lift = kind === 'forest' || kind === 'conifer' ? 0 : t.s * 0.35;
                im.setMatrixAt(i, trs(t.x, t.y + lift, t.z, t.tint * 6, 0, 0, t.s, t.s * (kind === 'column' ? 1.1 : 1), t.s));
                const pal = palettes[kind];
                c.setHex(pal[Math.floor(t.tint * pal.length) % pal.length]);
                // desaturate toward the reference's hazy olive greens (sampled foliage #252F2C..#313C3D)
                if (kind !== 'blossom')
                    c.offsetHSL(0.01, -0.14, -0.01);
                im.setColorAt(i, c);
                if (kind !== 'forest' && kind !== 'conifer')
                    siteTrunks.push(t);
            });
            im.castShadow = kind !== 'forest';
            im.receiveShadow = kind !== 'forest' && kind !== 'conifer'; // off-site forest is outside the shadow frustum
            im.name = `trees-${kind}`;
            im.userData.part = kind === 'blossom' ? 'tree-blossom' : kind === 'conifer' || kind === 'forest' ? 'tree-conifer' : 'tree-broadleaf';
            im.computeBoundingSphere();
            out.add(im);
        }
    }
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, siteTrunks.length);
    siteTrunks.forEach((t, i) => trunks.setMatrixAt(i, trs(t.x, t.y, t.z, 0, 0, 0, t.s * 1.2, t.s * 0.55, t.s * 1.2)));
    out.add(trunks);
    group.add(out);
    parts.trees = out;
    return trees.length;
}
export { smoothClosed, SITE };
