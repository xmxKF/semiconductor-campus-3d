import * as THREE from 'three';
/**
 * CC0 photographic PBR sets from Poly Haven (see public/ASSETS.md). Geometry stays procedural; these
 * only replace hand-drawn canvas textures where real-world surface response matters.
 *
 * Maps are attached to a material only AFTER the image has arrived. Attaching an empty texture makes
 * WebGL sample black: roughness 0 (mirror) and a broken normal — the "glass floor" seen on slow
 * connections. Until then the material keeps its procedural colour/roughness.
 */
export const assetManager = new THREE.LoadingManager();
const loader = new THREE.TextureLoader(assetManager);
const cache = new Map();
function tex(file, srgb, repeat) {
    const key = `${file}|${repeat.join(',')}`;
    let p = cache.get(key);
    if (!p) {
        p = new Promise((resolve) => {
            loader.load(`public/tex/${file}`, (t) => {
                t.wrapS = t.wrapT = THREE.RepeatWrapping;
                t.anisotropy = 8;
                t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
                t.repeat.set(repeat[0], repeat[1]);
                resolve(t);
            }, undefined, () => { });
        });
        cache.set(key, p);
    }
    return p;
}
/** Apply a Poly Haven set (<id>_diff/_nor/_rough.jpg) to an existing standard material, map by map as they load. */
export function applyPBR(m, id, o = {}) {
    const rep = o.repeat ?? [1, 1];
    if (o.map !== false)
        tex(`${id}_diff.jpg`, true, rep).then(t => {
            m.map = t;
            if (o.tint !== undefined)
                m.color.set(o.tint);
            m.needsUpdate = true;
        });
    else if (o.tint !== undefined)
        m.color.set(o.tint);
    tex(`${id}_nor.jpg`, false, rep).then(t => {
        m.normalMap = t;
        m.normalScale.set(o.normalScale ?? 1, o.normalScale ?? 1);
        m.bumpMap = null;
        m.needsUpdate = true;
    });
    tex(`${id}_rough.jpg`, false, rep).then(t => {
        m.roughnessMap = t;
        m.roughness = o.roughness ?? 1; // the map now carries the variation
        m.needsUpdate = true;
    });
    return m;
}
