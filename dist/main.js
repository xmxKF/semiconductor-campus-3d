import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createMaterials } from './materials.js';
import { buildFab, buildLab, buildSkyBridge } from './fab.js';
import { buildAdmin, buildExhibitionHall, buildGlassRestaurant, buildChineseRestaurant, buildGate } from './architecture.js';
import { buildLandscape } from './landscape.js';
import { B, ROADS } from './layout.js';
import { flagTex } from './textures.js';
// ---------------------------------------------------------------- renderer / scene
const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
const DPR = Math.min(window.devicePixelRatio, 1.75);
renderer.setPixelRatio(DPR);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap; // cheaper per-fragment sampling than PCFSoft
// the campus is static: render the 4096 shadow map once (and on sun changes), not every frame
renderer.shadowMap.autoUpdate = false;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.72;
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xc9d6de, 0.00034);
const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 4, 9000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI * 0.47;
controls.minDistance = 40;
controls.maxDistance = 3200;
// adaptive resolution: drop to 1x while the user drags/zooms, restore full DPR 250 ms after they stop
let idleTimer = 0;
controls.addEventListener('start', () => { clearTimeout(idleTimer); renderer.setPixelRatio(Math.min(1, DPR)); });
controls.addEventListener('end', () => { idleTimer = window.setTimeout(() => renderer.setPixelRatio(DPR), 250); });
// ---------------------------------------------------------------- sky, sun, environment
const sky = new Sky();
sky.scale.setScalar(20000);
const su = sky.material.uniforms;
su.turbidity.value = 6;
su.rayleigh.value = 1.4;
su.mieCoefficient.value = 0.004;
su.mieDirectionalG.value = 0.82;
scene.add(sky);
const sunDir = new THREE.Vector3();
const sun = new THREE.DirectionalLight(0xfff1dc, 2.6);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
sun.shadow.camera.left = -700;
sun.shadow.camera.right = 700;
sun.shadow.camera.top = 520;
sun.shadow.camera.bottom = -520;
sun.shadow.camera.near = 10;
sun.shadow.camera.far = 3000;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.6;
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight(0xcfe3f5, 0x4e5e3c, 0.45);
scene.add(hemi);
const pmrem = new THREE.PMREMGenerator(renderer);
let envRT = null;
let mistRef = null; // set once the landscape exists
let hdriEnv = null, isNight = false;
// CC0 HDRI (Poly Haven kloofendal_48d_partly_cloudy_puresky) → PMREM image-based light for the day look
new RGBELoader().load('public/hdri/kloofendal_48d_partly_cloudy_puresky_1k.hdr', (hdr) => {
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    hdriEnv = pmrem.fromEquirectangular(hdr).texture;
    hdr.dispose();
    if (!isNight) {
        scene.environment = hdriEnv;
        scene.environmentIntensity = 0.75;
    }
    markDirty();
});
function setSun(elevDeg, azimDeg, night = false) {
    const phi = THREE.MathUtils.degToRad(90 - elevDeg), theta = THREE.MathUtils.degToRad(azimDeg);
    sunDir.setFromSphericalCoords(1, phi, theta);
    su.sunPosition.value.copy(sunDir);
    sun.position.copy(sunDir).multiplyScalar(1500);
    sun.intensity = night ? 0.25 : 2.6;
    sun.color.set(night ? 0x9fb4ff : 0xfff1dc); // moonlight at night
    hemi.intensity = night ? 0.7 : 0.45;
    hemi.color.set(night ? 0x5a6a9a : 0xcfe3f5);
    renderer.toneMappingExposure = night ? 1.25 : 0.72;
    scene.fog.color.set(night ? 0x1a2230 : 0xc9d6de);
    // environment from sky for glass & water reflections
    const envScene = new THREE.Scene();
    const s2 = new Sky();
    s2.scale.setScalar(10000);
    Object.assign(s2.material.uniforms.sunPosition.value, sunDir);
    s2.material.uniforms.turbidity.value = su.turbidity.value;
    s2.material.uniforms.rayleigh.value = su.rayleigh.value;
    envScene.add(s2);
    envRT?.dispose();
    envRT = pmrem.fromScene(envScene, 0, 1, 20000);
    scene.environment = !night && hdriEnv ? hdriEnv : envRT.texture;
    renderer.shadowMap.needsUpdate = true;
    scene.environmentIntensity = night ? 0.12 : (hdriEnv ? 0.75 : 0.55);
    isNight = night;
    // unlit mist sprites must dim with the sky
    mistRef?.traverse(o => { if (o.isSprite)
        o.material.color.set(night ? 0x2c3442 : 0xf4f6f8); });
    // night: lit interiors — boost existing emissive glazing, let curtain-wall panes self-illuminate
    scene.traverse(o => {
        const mm = o.material;
        if (!mm || !mm.isMeshStandardMaterial)
            return;
        if (mm.userData.baseEmissive === undefined) {
            mm.userData.baseEmissive = mm.emissiveIntensity;
            if (mm.userData.curtain && !mm.emissiveMap) {
                mm.emissiveMap = mm.map;
                mm.emissive.set(0xffd9a0);
                mm.userData.baseEmissive = 0;
                mm.needsUpdate = true;
            }
        }
        const nightI = mm.userData.nightEmissive ?? Math.max(mm.userData.baseEmissive * 3.5, mm.emissiveMap ? 0.7 : 0);
        mm.emissiveIntensity = night ? nightI : mm.userData.baseEmissive;
    });
}
// sun from the south-west (shadows fall to the NE as in ref A)
setSun(40, 325);
// ---------------------------------------------------------------- build campus
const mats = createMaterials();
/** campus root = spec component `root`; every building / landscape system hangs under it */
const root = new THREE.Group();
root.name = 'root';
root.userData.part = 'root';
scene.add(root);
const land = buildLandscape(mats, root);
mistRef = land.parts.mist;
const entries = [];
const pickables = [];
function add(key, p) {
    root.add(p.group);
    p.group.userData.home = p.group.position.clone();
    p.group.userData.key = key;
    entries.push({ ...p, key });
    pickables.push(p.group);
    return p;
}
add('fab-2', buildFab(mats, 'FAB-2', B.fab2.x, B.fab2.z, B.fab2.w, B.fab2.d, 1, 21));
add('fab-1', buildFab(mats, 'FAB-1', B.fab1.x, B.fab1.z, B.fab1.w, B.fab1.d, -1, 42));
add('mask', buildLab(mats, 'mask', '掩膜厂', B.mask.x, B.mask.z, B.mask.w, B.mask.d, 5, '光罩（掩膜版）制造厂房：3 层洁净区 + 屋面设备与管廊，两道横向带形窗。'));
add('lab', buildLab(mats, 'lab', '先进制造实验室', B.lab.x, B.lab.z, B.lab.w, B.lab.d, 8, '先进工艺研发实验楼：高耸工艺塔柱、屋面 AHU 阵列与储罐组。'));
add('bridge', buildSkyBridge(mats, B.fab2.x + B.fab2.w / 2, B.fab1.x - B.fab1.w / 2, B.fab2.z));
add('admin', buildAdmin(mats, B.admin.x, B.admin.z));
add('pavilion', buildExhibitionHall(mats, B.pavilion.x, B.pavilion.z));
add('rest-glass', buildGlassRestaurant(mats, B.restGlass.x, B.restGlass.z, 1));
add('rest-cn', buildChineseRestaurant(mats, B.restJp.x, B.restJp.z, -1));
const flagMats = [['#d62828', '#d62828'], ['#1d4e89', '#ffffff'], ['#2a9d8f', '#e9c46a'], ['#ffffff', '#1d4e89'], ['#e63946', '#f1faee'], ['#264653', '#e9c46a']]
    .map(c => new THREE.MeshStandardMaterial({ map: flagTex(c), side: THREE.DoubleSide, roughness: 0.8 }));
const gate = buildGate(mats, B.gate.x, B.gate.z, flagMats);
add('gate', gate);
// no tree may clip a building: prune against the real (world) bounding boxes of every building part
{
    root.updateMatrixWorld(true);
    const boxes = [];
    for (const e of entries)
        e.group.traverse(o => {
            if (!o.isMesh || !o.userData)
                return;
            const b = new THREE.Box3().setFromObject(o);
            if (b.max.y - b.min.y > 1.5)
                boxes.push(b); // flat paving / lawn / pools are allowed under canopies
        });
    const n = land.pruneTrees(boxes);
    console.log('[campus] trees pruned against buildings:', n);
}
// ?check=1 : building-vs-road clearance audit (every solid building mesh box vs every road sample incl. width)
if (new URLSearchParams(location.search).get('check') === '1') {
    const hits = [];
    for (const e of entries) {
        const boxes = [];
        e.group.traverse(o => { if (o.isMesh) {
            const b = new THREE.Box3().setFromObject(o);
            if (b.max.y - b.min.y > 1.5)
                boxes.push(b);
        } });
        ROADS.forEach((rd, ri) => {
            if (rd.kind === 'highway')
                return;
            const P = rd.closed ? [...rd.pts, rd.pts[0]] : rd.pts;
            for (let i = 0; i < P.length - 1; i++) {
                const a = P[i], c = P[i + 1], L = a.distanceTo(c), n = Math.max(1, Math.ceil(L / 2));
                for (let k = 0; k <= n; k++) {
                    const x = a.x + (c.x - a.x) * k / n, z = a.y + (c.y - a.y) * k / n, h = rd.width / 2 + 1; // 1 m kerb clearance
                    const b = boxes.find(b => x > b.min.x - h && x < b.max.x + h && z > b.min.z - h && z < b.max.z + h);
                    if (b) {
                        hits.push(`${e.key} × road#${ri} @(${x.toFixed(0)},${z.toFixed(0)})`);
                        return;
                    }
                }
            }
        });
    }
    const pre = document.createElement('pre');
    pre.id = 'check';
    pre.textContent = JSON.stringify(hits);
    document.body.appendChild(pre);
}
// ---------------------------------------------------------------- labels (callouts as in the refs)
/** Callout labels as WebGL sprites (white rounded card + stem, like the reference callouts).
 *  Screen-space sized (sizeAttenuation off), always on top, pickable by the raycaster. */
const labels = new THREE.Group();
labels.name = 'labels';
scene.add(labels);
function labelTexture(title, area) {
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d');
    const f1 = '800 44px "PingFang SC","Microsoft YaHei",sans-serif', f2 = '34px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.font = f1;
    const w1 = ctx.measureText(title).width;
    ctx.font = f2;
    const w2 = ctx.measureText(area).width;
    const W = Math.ceil(Math.max(w1, w2) + 64), boxH = 118, stem = 70;
    c.width = W;
    c.height = boxH + stem;
    ctx.shadowColor = 'rgba(0,0,0,0.28)';
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    const r = 22;
    ctx.beginPath();
    ctx.moveTo(r, 6);
    ctx.arcTo(W - 6, 6, W - 6, boxH, r);
    ctx.arcTo(W - 6, boxH, 6, boxH, r);
    ctx.arcTo(6, boxH, 6, 6, r);
    ctx.arcTo(6, 6, W - 6, 6, r);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.fillRect(W / 2 - 2, boxH, 4, stem - 12);
    ctx.save();
    ctx.translate(W / 2, c.height - 10);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-6, -6, 12, 12);
    ctx.restore();
    ctx.fillStyle = '#111';
    ctx.textAlign = 'center';
    ctx.font = f1;
    ctx.fillText(title, W / 2, 56);
    ctx.font = f2;
    ctx.fillStyle = '#222';
    ctx.fillText(area, W / 2, 100);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return { t, aspect: W / c.height };
}
function makeLabel(def) {
    const { t, aspect } = labelTexture(def.title, def.area);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, depthWrite: false, sizeAttenuation: false, transparent: true, fog: false }));
    const H = 0.044; // screen-space height (sizeAttenuation off)
    sp.scale.set(H * aspect, H, 1);
    sp.center.set(0.5, 0.0); // stem tip sits on the anchor
    sp.renderOrder = 10;
    const e = entries.find(x => x.key === def.key);
    sp.position.copy(def.at ?? new THREE.Vector3(0, def.h, 0)).add(e.group.position);
    sp.userData.key = def.key;
    labels.add(sp);
    e.label = sp;
    return sp;
}
// one design seen from two directions: labels follow 厂区坐南朝北望.jpg (the newest reference, whose names
// also match the building styles). NB: 厂区坐北朝南望.jpg labels the east pitched-roof building 西式 — a label
// inconsistency in that image, not a second design.
const baseLabels = [
    { key: 'fab-2', title: 'FAB-2', area: '50,000㎡', h: 58 },
    { key: 'fab-1', title: 'FAB-1', area: '50,000㎡', h: 58 },
    { key: 'mask', title: '掩膜厂', area: '30,000㎡', h: 50 },
    { key: 'lab', title: '先进制造实验室', area: '30,000㎡', h: 50 },
    { key: 'admin', title: '集团行政大楼', area: '30,000㎡', h: 56 },
    { key: 'pavilion', title: '产品展示接待馆', area: '4,000㎡', h: 32 },
    { key: 'rest-glass', title: '西式餐厅', area: '3,000㎡', h: 26 },
    { key: 'rest-cn', title: '中式餐厅', area: '3,000㎡', h: 28 },
];
baseLabels.forEach(makeLabel);
// ---------------------------------------------------------------- camera presets
const views = {
    S: { pos: [0, 781.9, 1048.7], target: [0, 0, 123.7], fov: 25.88 }, // 坐南朝北望 — camera fitted to the reference (tools/fit_camera.py)
    N: { pos: [0, 484.7, -676.9], target: [0, 0, -97.5], fov: 41.97 }, // 坐北朝南望 — camera fitted to the reference
    fab: { pos: [-40, 150, 390], target: [-212, 20, 223] },
    admin: { pos: [0, 60, 250], target: [0, 14, 58] },
    pond: { pos: [150, 95, 10], target: [0, 5, -150] },
    gate: { pos: [0, 45, -480], target: [0, 10, -320] },
    // close-ups framed like the reference crops (ref/crops/*) for form review
    cFab: { pos: [-212, 200, 410], target: [-212, 14, 222], fov: 32 },
    cAdmin: { pos: [0, 78, 235], target: [0, 16, 72], fov: 32 },
    cRest: { pos: [160, 48, -196], target: [206, 6, -134], fov: 34 },
    cGate: { pos: [0, 55, -440], target: [0, 9, -326], fov: 34 },
    cFabN: { pos: [-60, 90, 60], target: [-150, 5, 150], fov: 40 },
    gateOut: { pos: [70, 70, -430], target: [0, 0, -335], fov: 40 },
    gateTop: { pos: [0, 260, -330], target: [0, 0, -329], fov: 40 },
    hallN: { pos: [0, 75, -330], target: [0, 2, -228], fov: 42 },
    hallNTop: { pos: [0, 200, -240], target: [0, 0, -239], fov: 40 },
    adminN: { pos: [0, 7, -40], target: [0, 5, -12], fov: 55 },
    hallS: { pos: [0, 7, -150], target: [0, 5, -175], fov: 55 },
    parkTop: { pos: [-360, 260, -150], target: [-360, 0, -149], fov: 40 },
    mallTop: { pos: [0, 300, 170], target: [0, 0, 171], fov: 45 },
    hall: { pos: [60, 55, -290], target: [0, 8, -184] },
    restW: { pos: [-140, 45, -190], target: [-206, 6, -114] },
    restE: { pos: [140, 45, -210], target: [206, 6, -134] },
    top: { pos: [0, 1500, 1], target: [0, 0, 0], fov: 45 },
    E: { pos: [1150, 620, 0], target: [0, 0, 0], fov: 38 },
    W: { pos: [-1150, 620, 0], target: [0, 0, 0], fov: 38 },
    orbitN: { pos: [0, 620, -1150], target: [0, 0, 0], fov: 38 },
};
let tween = null;
function goView(k, instant = false) {
    const v = views[k];
    const refimg = document.getElementById('refimg'); // absent in the public build
    if (refimg && (k === 'S' || k === 'N'))
        refimg.src = k === 'N' ? 'public/viewN.jpg' : 'public/viewS.jpg';
    const to = new THREE.Vector3(...v.pos), tt = new THREE.Vector3(...v.target);
    if (instant) {
        camera.position.copy(to);
        controls.target.copy(tt);
        camera.fov = v.fov ?? 40;
        camera.updateProjectionMatrix();
        return;
    }
    tween = { t: 0, from: camera.position.clone(), to, ft: controls.target.clone(), tt, f0: camera.fov, f1: v.fov ?? 40 };
}
// ---------------------------------------------------------------- picking + info card
const ray = new THREE.Raycaster();
const ptr = new THREE.Vector2();
let selected = null;
const info = document.getElementById('info');
const highlight = new THREE.BoxHelper(new THREE.Object3D(), 0xffc040);
highlight.visible = false;
scene.add(highlight);
function select(e) {
    selected = e;
    if (!e) {
        info.classList.remove('show');
        highlight.visible = false;
        return;
    }
    const i = e.group.userData.info;
    info.innerHTML = `<h3>${i.title}</h3>${i.area ? `<div class="area">${i.area}</div>` : ''}<p>${i.desc}</p><small>点击空白处关闭</small>`;
    info.classList.add('show');
    highlight.setFromObject(e.group);
    highlight.visible = true;
}
let downAt = 0;
renderer.domElement.addEventListener('pointerdown', () => { downAt = performance.now(); });
renderer.domElement.addEventListener('pointerup', (ev) => {
    if (performance.now() - downAt > 250)
        return;
    ptr.set((ev.clientX / window.innerWidth) * 2 - 1, -(ev.clientY / window.innerHeight) * 2 + 1);
    ray.setFromCamera(ptr, camera);
    const lh = labels.visible ? ray.intersectObjects(labels.children, false) : [];
    if (lh.length)
        return select(entries.find(e => e.key === lh[0].object.userData.key) ?? null);
    const hits = ray.intersectObjects(pickables.filter(p => p.visible), true);
    if (!hits.length)
        return select(null);
    let o = hits[0].object;
    while (o && !o.userData.key)
        o = o.parent;
    select(o ? entries.find(e => e.key === o.userData.key) ?? null : null);
});
// ---------------------------------------------------------------- UI wiring
let traffic = true;
document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => goView(b.dataset.view)));
const tg = (id, fn) => {
    const el = document.getElementById(id);
    if (!el)
        return; // optional controls (e.g. the reference overlay is not in the public build)
    el.addEventListener('change', () => fn(el.checked));
};
tg('t-labels', on => labels.visible = on);
tg('t-hq', on => { hq = on; });
tg('t-traffic', on => { traffic = on; land.parts.traffic.setEnabled(on); });
tg('t-night', on => setSun(on ? -8 : 40, 325, on));
tg('t-ref', on => document.getElementById('refwrap').classList.toggle('show', on));
tg('t-mist', on => land.parts.mist.visible = on);
// ---------------------------------------------------------------- quality: idle-only ambient occlusion
// While the user navigates we render directly (fast). Once the view has been still for 300 ms we switch to
// a composer with GTAO (contact shadows under equipment, eaves, trees) + SMAA. Toggle: 高画质.
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const gtao = new GTAOPass(scene, camera, window.innerWidth, window.innerHeight);
gtao.updateGtaoMaterial({ radius: 6, distanceExponent: 1.5, thickness: 4, scale: 1.2, samples: 12 });
gtao.blendIntensity = 0.85;
// GTAO's depth/normal prepass renders every visible object opaque; transparent sprites (mist, labels) and
// the sky dome would become black blocks — hide them for that prepass only.
const baseOverride = gtao.overrideVisibility.bind(gtao);
gtao.overrideVisibility = function () {
    baseOverride();
    scene.traverse(o => {
        const mat = o.material;
        if (o.isSprite || o === sky || (mat && mat.transparent))
            o.visible = false;
    });
};
composer.addPass(gtao);
composer.addPass(new SMAAPass(window.innerWidth, window.innerHeight));
composer.addPass(new OutputPass());
let hq = new URLSearchParams(location.search).get('hq') !== '0';
let stillSince = performance.now();
const camPrev = new THREE.Matrix4();
function markDirty() { stillSince = performance.now(); }
controls.addEventListener('change', markDirty);
// ---------------------------------------------------------------- loop
const clock = new THREE.Clock();
function resize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', resize);
// idle throttling: once the view has been still for 1.5 s, render ~20 fps instead of 60 (animations keep running,
// GPU load drops ~3×; an idle tab was measured at 90% GPU). Any camera move restores full rate immediately.
let lastRender = 0;
function frame() {
    const nowMs = performance.now();
    if (!bench.on && !tween && nowMs - stillSince > 1500 && nowMs - lastRender < 48) {
        requestAnimationFrame(frame);
        return;
    }
    lastRender = nowMs;
    const dt = Math.min(clock.getDelta(), 0.1);
    const t = clock.elapsedTime;
    if (tween) {
        tween.t = Math.min(1, tween.t + dt / 1.6);
        const k = tween.t < 0.5 ? 4 * tween.t ** 3 : 1 - Math.pow(-2 * tween.t + 2, 3) / 2;
        camera.position.lerpVectors(tween.from, tween.to, k);
        controls.target.lerpVectors(tween.ft, tween.tt, k);
        camera.fov = tween.f0 + (tween.f1 - tween.f0) * k;
        camera.updateProjectionMatrix();
        if (tween.t >= 1)
            tween = null;
    }
    if (selected && highlight.visible)
        highlight.setFromObject(selected.group);
    land.update(t, traffic ? dt : 0);
    // flags wave
    for (const f of gate.flags) {
        const pos = f.geometry.getAttribute('position');
        const base = f.userData.base;
        for (let i = 0; i < pos.count; i++) {
            const x = base[i * 3];
            pos.setZ(i, Math.sin(x * 1.6 - t * 5 + f.userData.phase) * 0.18 * x);
        }
        pos.needsUpdate = true;
    }
    sun.target.position.set(0, 0, 0);
    controls.update();
    if (!camera.matrixWorld.equals(camPrev)) {
        camPrev.copy(camera.matrixWorld);
        markDirty();
    }
    const idle = performance.now() - stillSince > 300 && !tween;
    if (hq && idle && !bench.on)
        composer.render(dt);
    else
        renderer.render(scene, camera);
    benchTick();
    requestAnimationFrame(frame);
}
// ?bench=1 : orbit the camera for 240 frames and report GPU-bound frame time (performance regression check)
const bench = { on: new URLSearchParams(location.search).get('bench') === '1', n: 0, t0: 0, times: [], last: 0 };
function benchTick() {
    if (!bench.on)
        return;
    const now = performance.now();
    if (bench.n === 30)
        bench.t0 = now;
    if (bench.n > 30)
        bench.times.push(now - bench.last);
    bench.last = now;
    const a = bench.n * 0.012;
    camera.position.set(Math.sin(a) * 900, 520, Math.cos(a) * 900);
    controls.target.set(0, 0, 0);
    camera.lookAt(0, 0, 0);
    bench.n++;
    if (bench.n === 270) {
        const ts = bench.times.slice().sort((x, y) => x - y);
        const avg = ts.reduce((x, y) => x + y, 0) / ts.length;
        const pre = document.createElement('pre');
        pre.id = 'bench';
        pre.textContent = JSON.stringify({ frames: ts.length, avgMs: +avg.toFixed(2), p95Ms: +ts[Math.floor(ts.length * 0.95)].toFixed(2), fps: +(1000 / avg).toFixed(1), calls: renderer.info.render.calls, tris: renderer.info.render.triangles });
        document.body.appendChild(pre);
    }
}
{
    const q = new URLSearchParams(location.search);
    if (q.get('shadows') === '0')
        renderer.shadowMap.enabled = false;
    // review modes: isolate = campus only on white (silhouette gates); mapstrip = untextured grey (blockout evidence)
    if (q.get('isolate') === '1') {
        scene.background = new THREE.Color(0xffffff);
        sky.visible = false;
        scene.fog = null;
        for (const k of ['terrain', 'mist', 'traffic'])
            if (land.parts[k])
                land.parts[k].visible = false;
        land.group.traverse(o => { if (o.name === 'trees-forest' || o.name === 'trees-conifer' || o.name === 'lakes')
            o.visible = false; });
        renderer.clippingPlanes = [
            new THREE.Plane(new THREE.Vector3(-1, 0, 0), 496), new THREE.Plane(new THREE.Vector3(1, 0, 0), 496),
            new THREE.Plane(new THREE.Vector3(0, 0, -1), 336), new THREE.Plane(new THREE.Vector3(0, 0, 1), 336),
        ];
        labels.visible = false;
    }
    if (q.get('mapstrip') === '1') {
        const grey = new THREE.MeshStandardMaterial({ color: 0xb8b8b8, roughness: 0.8 });
        scene.traverse(o => { const mm = o; if (mm.isMesh && !mm.material.transparent)
            mm.material = grey; });
    }
    const sel = q.get('select');
    if (sel)
        setTimeout(() => { const e = entries.find(x => x.key === sel); if (e)
            select(e); }, 0);
    if (q.get('night') === '1') {
        setSun(-8, 325, true);
        document.getElementById('t-night').checked = true;
    }
    if (q.get('mist') === '0')
        land.parts.mist.visible = false;
    if (q.get('labels') === '0')
        labels.visible = false;
    if (q.get('trees') === '0')
        land.parts.trees.visible = false;
    const sp = q.get('sun');
    if (sp) {
        const [e, a] = sp.split(',').map(Number);
        setSun(e, a);
    }
}
goView(new URLSearchParams(location.search).get('view') ?? 'S', true);
const qs = new URLSearchParams(location.search);
if (qs.get('labels') === '0') {
    labels.visible = false;
    document.getElementById('t-labels').checked = false;
}
if (qs.get('ui') === '0')
    document.body.classList.add('noui');
frame();
document.getElementById('loading')?.remove();
window.__campus = { scene, camera, renderer, goView, entries, ready: true };
// stats line
let tris = 0, draws = 0;
scene.traverse(o => {
    const mesh = o;
    if (mesh.isMesh && mesh.geometry) {
        const g = mesh.geometry;
        const n = (g.index ? g.index.count : g.getAttribute('position').count) / 3;
        const inst = o.isInstancedMesh ? o.count : 1;
        tris += n * inst;
        draws++;
    }
});
// action-ready runtime maps (img2threejs contract): nodes / meshes / sockets / colliders / destruction groups
{
    const nodes = {}, meshes = {};
    const sockets = {}, colliders = {};
    const destructionGroups = {};
    root.traverse(o => {
        const id = o.userData.part;
        if (id)
            (nodes[id] ??= []).push(o);
        const mm = o;
        if (mm.isMesh) {
            let p = o;
            while (p && !p.userData.part)
                p = p.parent;
            if (p)
                (meshes[p.userData.part] ??= []).push(mm);
        }
    });
    root.updateMatrixWorld(true);
    for (const e of entries) {
        const box = new THREE.Box3().setFromObject(e.group);
        // pivot = building origin on the ground; roof socket at the top centre for attaching labels / effects
        const sock = new THREE.Object3D();
        sock.name = `${e.key}:roof-socket`;
        sock.position.set(0, box.max.y - e.group.position.y, 0);
        e.group.add(sock);
        sockets[`${e.key}:roof`] = sock;
        colliders[e.key] = { type: 'box', box: [box.min.toArray(), box.max.toArray()] };
        destructionGroups[e.key] = [e.group];
    }
    root.userData.sculptRuntime = { nodes, meshes, sockets, colliders, destructionGroups };
}
// runtime part-tree manifest for the assembly gate (check_part_coverage.py)
function partManifest() {
    const parts = new Map();
    let unnamed = 0, integral = 0;
    scene.traverse(o => {
        const mesh = o;
        if (!mesh.isMesh && !o.isPoints)
            return;
        let p = o;
        while (p && !p.userData.part)
            p = p.parent;
        if (!p) {
            if (o !== sky && o.type !== 'Sprite')
                unnamed++;
            return;
        }
        integral++;
        const name = p.userData.part;
        const g = mesh.geometry;
        const n = g ? (g.index ? g.index.count : g.getAttribute('position').count) / 3 : 0;
        const inst = o.isInstancedMesh ? o.count : 1;
        let top = p;
        while (top && top.parent && top.parent !== root)
            top = top.parent;
        const rec = parts.get(name) ?? { name, kind: 'part', module: top?.name ?? '', triangles: 0, meshes: 0 };
        rec.triangles += Math.round(n * inst);
        rec.meshes++;
        parts.set(name, rec);
    });
    const rt = root.userData.sculptRuntime;
    const runtime = rt ? { nodes: Object.keys(rt.nodes).length, meshGroups: Object.keys(rt.meshes).length, sockets: Object.keys(rt.sockets), colliders: Object.keys(rt.colliders).length, destructionGroups: Object.keys(rt.destructionGroups).length, pickable: pickables.length } : null;
    return { model: 'semiconductor-campus', parts: [...parts.values()], unnamedMeshes: unnamed, integralMeshes: integral, sculptRuntime: runtime };
}
window.__campus.manifest = partManifest;
if (new URLSearchParams(location.search).get('manifest') === '1') {
    const pre = document.createElement('pre');
    pre.id = 'manifest';
    pre.textContent = JSON.stringify(partManifest());
    document.body.appendChild(pre);
}
document.getElementById('stats').textContent = `${(tris / 1e6).toFixed(2)} M 三角面 · ${draws} 网格`;
