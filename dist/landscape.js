import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { Batch, trs, rng, makeNoise2D, ribbon, flatPoly, extrudePoly, offsetClosed, roundedRectPts, smoothClosed } from './util.js?v=b3d95c4e38';
import { B, POND, ISLANDS, FOUNTAINS, ROADS, TRAFFIC_ROUTE, INTERCHANGE, CAUSEWAY, DROPOFF, ROAD_Z, PERIM_Z, FRONTAGE_Z, VEHICLE_GATE_X, PARKING_AISLES, WALKS, BEDS, HALL_FORECOURT, SITE } from './layout.js?v=b3d95c4e38';
import { softSpriteTex } from './textures.js?v=b3d95c4e38';
export function buildLandscape(M, scene) {
    const m = M.M;
    const group = new THREE.Group();
    group.name = 'landscape';
    const parts = {};
    const updaters = [];
    const allRoads = [...ROADS, ...INTERCHANGE];
    // Plain presentation ground: no inferred mountain terrain or off-site scenery.
    {
        const g = new THREE.PlaneGeometry(20000, 20000);
        g.rotateX(-Math.PI / 2);
        g.translate(0, -0.3, 0);
        const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xf1f0ec, toneMapped: false }));
        mesh.name = 'context-plane';
        mesh.userData.part = 'context-plane';
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
        // Side vehicle junctions with unmarked asphalt over intersecting lane textures.
        rb.tag('roads');
        for (const s of [-1, 1]) {
            rb.add(flatPoly(roundedRectPts(s * VEHICLE_GATE_X, PERIM_Z, 20, 17, 5), 0.115, 20), m['asphalt']);
            rb.add(flatPoly(roundedRectPts(s * VEHICLE_GATE_X, FRONTAGE_Z + 5, 22, 14, 5), 0.115, 20), m['asphalt']);
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
        const segments = [];
        for (let i = 0; i < P.length; i++) {
            const a = P[i], c = P[(i + 1) % P.length];
            if (Math.abs(a.y + 335) < 0.001 && Math.abs(c.y + 335) < 0.001)
                continue;
            segments.push([a, c]);
        }
        for (const s of [-1, 1]) {
            for (const [a, c] of [[[77, B.gate.z], [100, -335]], [[100, -335], [122, -335]], [[138, -335], [415, -335]]])
                segments.push([new THREE.Vector2(s * a[0], a[1]), new THREE.Vector2(s * c[0], c[1])]);
        }
        for (const [a, c] of segments) {
            const L = a.distanceTo(c), rot = Math.atan2(-(c.y - a.y), c.x - a.x);
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
        const vb = new Batch().tag('vehicle-gates');
        for (const s of [-1, 1]) {
            const x = s * VEHICLE_GATE_X;
            vb.box(3.8, 3.0, 4.4, m['dark-glass'], x + s * 10, 0.12, -338);
            vb.box(4.4, 0.3, 5, m['stone-plain'], x + s * 10, 3.12, -338);
            for (const lane of [-1, 1]) {
                vb.box(0.45, 1.0, 0.45, m['steel-dark'], x + lane * 5.8, 0.12, -335);
                vb.add(new THREE.BoxGeometry(4.6, 0.12, 0.15), m['white-paint'], trs(x + lane * 4.4, 2.8, -335, 0, 0, lane * 0.85));
            }
        }
        const vg = new THREE.Group();
        vg.name = 'vehicle-gates';
        vb.build(vg);
        group.add(vg);
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
        for (const x of [-8, 8])
            lb.box(0.5, 0.025, 70, m['stone-plain'], x, 0.09, -287);
        for (const walk of WALKS)
            lb.add(ribbon(walk, 5, false, 0.16, 8), m['granite-paving']);
        lb.box(310, 0.035, 3, m['granite-paving'], 0, 0.13, -343);
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
        for (const [cx, cz, len, rot] of [[-130, -344, 12, Math.PI / 2], [130, -344, 12, Math.PI / 2], [-190, -303, 17, Math.PI / 2], [190, -303, 17, Math.PI / 2], [0, DROPOFF.zN, 8, 0], [0, ROAD_Z, 11, 0]]) {
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
            const lanes = PARKING_AISLES.filter(x => Math.abs(x - lot.x) < lot.w / 2);
            for (const x of lanes)
                pb.box(8, 0.025, lot.d, m['asphalt'], x, 0.13, lot.z);
            pb.box(lot.w, 0.025, 8, m['asphalt'], lot.x, 0.13, z0 + 7);
            pb.box(lot.w, 0.025, 8, m['asphalt'], lot.x, 0.13, lot.z + lot.d / 2 - 7);
            const edge = lot.z + lot.d / 2 + 1;
            const breaks = [x0, ...lanes.flatMap(x => [x - 5, x + 5]), x0 + lot.w];
            for (let k = 0; k < breaks.length; k += 2)
                pb.box(breaks[k + 1] - breaks[k], 0.14, 1.2, m['kerb'], (breaks[k + 1] + breaks[k]) / 2, 0, edge);
            pb.box(lot.w, 0.14, 1.2, m['kerb'], lot.x, 0, z0 - 1);
            for (const x of [x0 - 1, x0 + lot.w + 1])
                pb.box(1.2, 0.08, lot.d, m['kerb'], x, 0, lot.z);
            pb.box(12, 0.025, 5, m['granite-paving'], Math.sign(lot.x) * 305, 0.16, -200);
            // tree islands every 3rd module
            for (let tz = 0; tz < lot.d / 20; tz++)
                for (let tx = 0; tx < lot.w / 40; tx++) {
                    for (const row of [2.75, 17.25])
                        for (let k = 0; k < 16; k++) {
                            const x = x0 + tx * 40 + 1.25 + k * 2.5, z = z0 + tz * 20 + row;
                            if (x > lot.x + lot.w / 2 - 2 || z > lot.z + lot.d / 2 - 2)
                                continue;
                            if (lanes.some(a => Math.abs(x - a) < 5.4) || z < z0 + 12 || z > lot.z + lot.d / 2 - 12)
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
    const treeCounts = buildTrees(group, parts);
    void treeCounts;
    // ------------------------------------------------------------- campus traffic on the core loop
    {
        // Close traffic via the outer road, never across the pedestrian-only entrance court.
        const trafficPts = TRAFFIC_ROUTE;
        const curve = new THREE.CurvePath();
        for (let i = 0; i < trafficPts.length - 1; i++) {
            const a = trafficPts[i], b = trafficPts[i + 1];
            if (a.distanceTo(b) > 0.01)
                curve.add(new THREE.LineCurve3(new THREE.Vector3(a.x, .15, a.y), new THREE.Vector3(b.x, .15, b.y)));
        }
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
function buildTrees(group, parts) {
    const r = rng(31337);
    const trees = [];
    // Only the deliberately arranged entrance tree rows and forecourt planting beds remain.
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
    const geos = {
        broad: canopyGeometry(1, 3, 1, 'round'),
        column: canopyGeometry(2, 3, 1, 'column'),
        blossom: canopyGeometry(3, 7, 1, 'umbrella'),
    };
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
    const palettes = {
        broad: [0x3d6230, 0x345a2c, 0x4a7236, 0x5a7f3d, 0x2c4d27, 0x6a8a44, 0x7a8f45],
        column: [0x3a6030, 0x4b733a, 0x5c8240, 0x6f8a3e],
        blossom: [0xeec3d3, 0xf2d3df, 0xe4aec3, 0xf5e3ea, 0xd697b1, 0xe9c9d2],
    };
    const trunkGeo = new THREE.CylinderGeometry(0.08, 0.12, 1, 5);
    trunkGeo.translate(0, 0.5, 0);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4d3b2b, roughness: 0.9 });
    const out = new THREE.Group();
    out.name = 'trees';
    out.userData.part = 'trees';
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
                const lift = t.s * 0.35;
                im.setMatrixAt(i, trs(t.x, t.y + lift, t.z, t.tint * 6, 0, 0, t.s, t.s * (kind === 'column' ? 1.1 : 1), t.s));
                const pal = palettes[kind];
                c.setHex(pal[Math.floor(t.tint * pal.length) % pal.length]);
                // desaturate toward the reference's hazy olive greens (sampled foliage #252F2C..#313C3D)
                if (kind !== 'blossom')
                    c.offsetHSL(0.01, -0.14, -0.01);
                im.setColorAt(i, c);
                siteTrunks.push(t);
            });
            im.castShadow = true;
            im.receiveShadow = true;
            im.name = `trees-${kind}`;
            im.userData.part = kind === 'blossom' ? 'tree-blossom' : 'tree-broadleaf';
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
