import * as THREE from 'three';
/**
 * CC0 photographic PBR sets from Poly Haven (see public/ASSETS.md). Geometry stays procedural; these
 * only replace hand-drawn canvas textures where real-world surface response matters (concrete, pavers,
 * asphalt, roof tiles, stone, decking, grass, terrain) and add micro-normals to metal cladding.
 */
const loader = new THREE.TextureLoader();
const cache = new Map();
function tex(file, srgb, repeat) {
    const key = `${file}|${repeat.join(',')}`;
    let t = cache.get(key);
    if (!t) {
        t = loader.load(`public/tex/${file}`);
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.anisotropy = 8;
        t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        t.repeat.set(repeat[0], repeat[1]);
        cache.set(key, t);
    }
    return t;
}
/** Apply a Poly Haven set (<id>_diff/_nor/_rough.jpg) to an existing standard material. */
export function applyPBR(m, id, o = {}) {
    const rep = o.repeat ?? [1, 1];
    if (o.map !== false) {
        m.map = tex(`${id}_diff.jpg`, true, rep);
    }
    m.normalMap = tex(`${id}_nor.jpg`, false, rep);
    m.normalScale.set(o.normalScale ?? 1, o.normalScale ?? 1);
    m.roughnessMap = tex(`${id}_rough.jpg`, false, rep);
    m.roughness = o.roughness ?? 1;
    if (o.tint !== undefined)
        m.color.set(o.tint);
    m.bumpMap = null;
    m.needsUpdate = true;
    return m;
}
