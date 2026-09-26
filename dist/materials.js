import * as THREE from 'three';
import * as T from './textures.js';
import { applyPBR } from './pbr.js';
/** Material library — ids mirror object-sculpt-spec.json `materials[].id`. */
export function createMaterials() {
    const tile = T.roofTileTex();
    const water = T.waterNormalTex();
    water.repeat.set(18, 18);
    const fabFacade = T.panelFacadeTex([0.62], 0.05, { doors: true, seed: 3 });
    const fabAnnex = T.panelFacadeTex([0.72], 0.08, { doors: true, seed: 5 });
    const ribbon = T.ribbonFacadeTex();
    const membrane = T.roofMembraneTex();
    const paving = T.pavingTex();
    // olive lawn tones sampled from the reference (grass region palette #8E8F65 / #7D825B)
    const grass = T.grassTex(1, [116, 132, 80]);
    const lawn2 = T.grassTex(2, [108, 126, 74]);
    const stone = T.stoneTex();
    const louvre = T.louvreTex();
    const std = (p) => new THREE.MeshStandardMaterial(p);
    const phys = (p) => new THREE.MeshPhysicalMaterial(p);
    const M = {
        'fab-cladding': std({ map: fabFacade, roughness: 0.72, metalness: 0.15, color: 0xffffff }),
        'fab-annex': std({ map: fabAnnex, roughness: 0.72, metalness: 0.15 }),
        'lab-cladding': std({ map: ribbon, roughness: 0.7, metalness: 0.15 }),
        'cladding-plain': std({ color: 0xcfd2d4, roughness: 0.75, metalness: 0.1 }),
        'parapet': std({ color: 0xd9dbdc, roughness: 0.7, metalness: 0.1 }),
        'roof-membrane': std({ map: membrane, color: 0xdadcdd, roughness: 0.92, metalness: 0 }),
        'galvanized-steel': std({ color: 0xbfc4c9, roughness: 0.42, metalness: 0.65 }),
        'steel-dark': std({ color: 0x7c848c, roughness: 0.5, metalness: 0.6 }),
        'pipe-paint': std({ color: 0xd4d8db, roughness: 0.45, metalness: 0.35 }),
        'pipe-yellow': std({ color: 0xd9c77a, roughness: 0.5, metalness: 0.3 }),
        'pipe-blue': std({ color: 0x8fa9c4, roughness: 0.5, metalness: 0.3 }),
        'louvre': std({ map: louvre, color: 0xc4c9cd, roughness: 0.55, metalness: 0.5 }),
        'fan-dark': std({ color: 0x2d3136, roughness: 0.6, metalness: 0.4 }),
        'curtain-glass': phys({ color: 0xffffff, roughness: 0.08, metalness: 0.3, envMapIntensity: 1.3 }),
        'mullion-alu': std({ color: 0x8e959c, roughness: 0.35, metalness: 0.8 }),
        'stone-cladding': std({ map: stone, roughness: 0.8, metalness: 0 }),
        'stone-plain': std({ color: 0xd6cebe, roughness: 0.82 }),
        'roof-tile': std({ map: tile.map, bumpMap: tile.bump, bumpScale: 1.2, roughness: 0.78, metalness: 0.05 }),
        'ridge-tile': std({ color: 0x2b2f34, roughness: 0.7, metalness: 0.05 }),
        'metal-roof': std({ color: 0x5d6873, roughness: 0.35, metalness: 0.75 }),
        'warm-glazing': phys({ roughness: 0.15, metalness: 0.05, emissive: 0xffb45e, emissiveIntensity: 0.35, envMapIntensity: 0.8 }),
        'timber': std({ color: 0x4a3526, roughness: 0.7 }),
        // weathered light-grey composite decking (ref B: the waterside decks read pale grey-beige)
        'timber-light': std({ color: 0xb8ad9b, roughness: 0.75 }),
        'column-red': std({ color: 0x7a2a22, roughness: 0.6 }),
        'water': phys({ color: 0x4a6573, roughness: 0.08, metalness: 0.0, normalMap: water, normalScale: new THREE.Vector2(0.3, 0.3), envMapIntensity: 1.1, clearcoat: 0.8, clearcoatRoughness: 0.08, specularIntensity: 0.6 }),
        'pool-water': phys({ color: 0x4b7f8f, roughness: 0.05, normalMap: water, normalScale: new THREE.Vector2(0.2, 0.2), clearcoat: 1 }),
        'asphalt': std({ map: T.asphaltTex(), roughness: 0.92 }),
        'road-2': std({ map: T.roadTex(1), roughness: 0.9 }),
        'road-4': std({ map: T.roadTex(2), roughness: 0.9 }),
        'highway': std({ map: T.roadTex(4, { median: true }), roughness: 0.9 }),
        'parking': std({ map: T.parkingTex(), roughness: 0.9 }),
        'granite-paving': std({ map: paving, roughness: 0.82 }),
        'kerb': std({ color: 0xcfcbc2, roughness: 0.85 }),
        // light concrete service yards around the fabs/labs (large grey aprons in both refs)
        'concrete': std({ map: T.pavingTex(), color: 0xc9c9c6, roughness: 0.9 }),
        'grass': std({ map: grass, roughness: 0.95 }),
        'lawn-2': std({ map: lawn2, roughness: 0.95 }),
        'hedge': std({ color: 0x3f6a32, roughness: 0.9 }),
        'flowerbed': std({ color: 0xb4486a, roughness: 0.9 }),
        'soil': std({ color: 0x6b5a45, roughness: 1 }),
        'rock': std({ color: 0x8d8a82, roughness: 0.9, flatShading: true }),
        'forest-floor': std({ map: T.forestFloorTex(), color: 0x6e8062, roughness: 1 }),
        'white-paint': std({ color: 0xf2f2f2, roughness: 0.5 }),
        'dark-glass': std({ color: 0x2a3440, roughness: 0.12, metalness: 0.5 }),
        'signage': std({ color: 0x2b3a4a, roughness: 0.4, metalness: 0.3 }),
        'gold-letter': std({ color: 0xc9a44c, roughness: 0.3, metalness: 0.9 }),
        'truck-white': std({ color: 0xeceeef, roughness: 0.5, metalness: 0.2 }),
        'truck-cab': std({ color: 0x3a5f8a, roughness: 0.4, metalness: 0.4 }),
        'tyre': std({ color: 0x1b1c1e, roughness: 0.9 }),
        'solar': std({ color: 0x1c2a44, roughness: 0.15, metalness: 0.7 }),
    };
    // ---- CC0 photographic PBR sets (Poly Haven) — UV units: flatPoly uses 8 m tiles, facadeBox 6 m, roofs 4 m
    // photo albedos read too brown vs the reference's pale grey hardscape: keep reference-sampled colour, use photo relief
    applyPBR(M['concrete'], 'concrete_floor_01', { map: false, repeat: [1.5, 1.5], tint: 0xcfcfcb, normalScale: 0.8 });
    applyPBR(M['granite-paving'], 'concrete_pavement', { map: false, repeat: [3, 3], normalScale: 0.9 });
    applyPBR(M['roof-tile'], 'grey_roof_tiles', { repeat: [1.6, 1.6], tint: 0x8a9098, normalScale: 1.2 });
    applyPBR(M['stone-cladding'], 'beige_wall_001', { map: false, repeat: [1.2, 1.2], normalScale: 0.7 });
    applyPBR(M['timber-light'], 'brown_planks_03', { repeat: [2, 2], tint: 0xcfc6b8 });
    // forest floor under canopy: dark green (ref shows continuous forest, no bare soil); photo relief only
    applyPBR(M['forest-floor'], 'aerial_grass_rock', { map: false, repeat: [3, 3], tint: 0x33462d, normalScale: 0.8 });
    // grass: keep the olive procedural colour field (reference-sampled), add photographic normal/roughness
    applyPBR(M['grass'], 'grass_path_2', { map: false, repeat: [12, 12], normalScale: 0.6 });
    applyPBR(M['lawn-2'], 'grass_path_2', { map: false, repeat: [8, 8], normalScale: 0.6 });
    // roads keep the lane-marking colour maps; asphalt micro-relief from the aerial asphalt set
    for (const k of ['road-2', 'road-4', 'highway', 'parking', 'asphalt'])
        applyPBR(M[k], 'aerial_asphalt_01', { map: false, repeat: [2, 1], normalScale: 0.5 });
    // metal cladding: keep the banded facade colour, add brushed-plate micro normals
    for (const k of ['fab-cladding', 'fab-annex', 'lab-cladding']) {
        applyPBR(M[k], 'metal_plate', { map: false, repeat: [12, 10], normalScale: 0.25, roughness: 0.8 });
        M[k].metalness = 0.2;
    }
    // curtain wall variants (texture per building so bay counts match proportions)
    const glass = (cols, floors, warm = 0, seed = 1) => {
        const t = T.curtainWallTex(cols, floors, { warm, seed });
        const g = phys({ map: t, roughness: 0.1, metalness: 0.35, envMapIntensity: 1.4 });
        g.userData.curtain = true; // lit panes glow in night mode
        return g;
    };
    const warm = (cols, rows, frame) => {
        const t = T.warmGlazingTex(cols, rows, frame);
        return phys({ map: t, roughness: 0.2, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.25, envMapIntensity: 0.6 });
    };
    return { M, glass, warm, textures: { paving, water } };
}
