const stage = document.querySelector('three-d-stage');
const { THREE } = await stage.ready;

// --- Cotes relevées sur le patron (uploads/patron.pdf), en mètres ------
const T = 0.003;
const L = 0.323 - 2 * T;
const W = 0.246 - 2 * T;
const H = 0.164 - T;
const FLAP_LONG = 0.323 / 2 - 0.00025;   // 0,5 mm de jeu entre les deux rabats
const FLAP_SHORT = 0.083;
const CLOISON_H = 0.0815;
const PZ = W / 2 - FLAP_SHORT;
const FLOOR = 2 * T;
const RCORNER = 0.014;              // arrondi des angles libres des rabats
const outerL = L + 2 * T;

// --- Texture : le patron à plat, repère en mm du tracé ----------------
// Remplace patron-texture.png par ton visuel, cadré EXACTEMENT sur
// X 333,7→1504,7 mm et Y 417,4→910,4 mm du PDF (ratio 1171 x 493).
const SHEET = { x0: 333.7, x1: 1504.7, y0: 417.4, y1: 910.4 };
const tex = new THREE.TextureLoader().load('patron-texture.png', () => {
  if (stage._renderer && stage._scene) stage._renderer.render(stage._scene, stage._camera);
});
tex.colorSpace = THREE.SRGBColorSpace;
tex.anisotropy = 8;

const mat = {
  carton: new THREE.MeshStandardMaterial({ name: 'carton_imprime', map: tex, roughness: 0.94 }),
  verre: new THREE.MeshStandardMaterial({ name: 'verre_bouteille', color: 0x1f3a24, roughness: 0.22, metalness: 0.25 }),
  capsule: new THREE.MeshStandardMaterial({ name: 'capsule_etain', color: 0x6b1e2b, roughness: 0.4, metalness: 0.3 }),
  etiquette: new THREE.MeshStandardMaterial({ name: 'etiquette', color: 0xe8dfcb, roughness: 0.85 })
};

/** UV = position réelle de la pièce sur la planche du patron. */
function sheetUV(geo, uAxis, uFrom, uTo, vAxis, vFrom, vTo) {
  geo.computeBoundingBox();
  const bb = geo.boundingBox, pos = geo.attributes.position;
  const idx = { x: 0, y: 1, z: 2 };
  const uMin = bb.min.getComponent(idx[uAxis]), uMax = bb.max.getComponent(idx[uAxis]);
  const vMin = bb.min.getComponent(idx[vAxis]), vMax = bb.max.getComponent(idx[vAxis]);
  const uv = new Float32Array(pos.count * 2);
  const SW = SHEET.x1 - SHEET.x0, SH = SHEET.y1 - SHEET.y0;
  for (let i = 0; i < pos.count; i++) {
    const tu = uMax > uMin ? (pos.getComponent(i, idx[uAxis]) - uMin) / (uMax - uMin) : 0;
    const tv = vMax > vMin ? (pos.getComponent(i, idx[vAxis]) - vMin) / (vMax - vMin) : 0;
    uv[i * 2] = (uFrom + tu * (uTo - uFrom) - SHEET.x0) / SW;
    uv[i * 2 + 1] = (vFrom + tv * (vTo - vFrom) - SHEET.y0) / SH;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

const carton = new THREE.Group();           // pièces avant fusion
function add(mesh) { carton.add(mesh); return mesh; }
function slab(w, h, d) { return new THREE.BoxGeometry(w, h, d); }
function extrude(sh) {
  const g = new THREE.ExtrudeGeometry(sh, { depth: T, bevelEnabled: false, curveSegments: 16 });
  g.translate(0, 0, -T / 2);
  return g;
}

// --- parois -----------------------------------------------------------
function wall(name, geo, x, y, z) {
  const m = new THREE.Mesh(geo, mat.carton);
  m.name = name; m.position.set(x, y, z);
  return add(m);
}
wall('paroi_avant', sheetUV(slab(outerL, H, T), 'x', 614.7, 937.7, 'y', 581.9, 745.9),
  0, H / 2, W / 2 + T / 2);
wall('paroi_arriere', sheetUV(slab(outerL, H, T), 'x', 1504.7, 1183.7, 'y', 581.9, 745.9),
  0, H / 2, -(W / 2 + T / 2));
wall('paroi_droite', sheetUV(slab(T, H, W), 'z', 1183.7, 937.7, 'y', 581.9, 745.9),
  L / 2 + T / 2, H / 2, 0);
wall('paroi_gauche', sheetUV(slab(T, H, W), 'z', 368.7, 614.7, 'y', 581.9, 745.9),
  -(L / 2 + T / 2), H / 2, 0);

// --- encoche arrondie 170 x 40 (r 20) ---------------------------------
const NW = 0.170 / 2, ND = 0.040, NR = 0.020;
function notchedPanel(width, depth) {          // cloison : matière enlevée
  const w = width / 2, sh = new THREE.Shape();
  sh.moveTo(-w, 0); sh.lineTo(w, 0); sh.lineTo(w, depth); sh.lineTo(NW, depth);
  sh.lineTo(NW, depth - ND + NR);
  sh.quadraticCurveTo(NW, depth - ND, NW - NR, depth - ND);
  sh.lineTo(-NW + NR, depth - ND);
  sh.quadraticCurveTo(-NW, depth - ND, -NW, depth - ND + NR);
  sh.lineTo(-NW, depth); sh.lineTo(-w, depth); sh.closePath();
  return extrude(sh);
}
const NDT = W / 2 - FLAP_SHORT - 0.0005;   // languette : 1 mm de jeu au centre
function tabbedPanel(width, depth) {           // rabat : la languette reste à plat
  const w = width / 2, sh = new THREE.Shape();
  sh.moveTo(-w, 0); sh.lineTo(w, 0); sh.lineTo(w, depth); sh.lineTo(NW, depth);
  sh.lineTo(NW, depth + NDT - NR);
  sh.quadraticCurveTo(NW, depth + NDT, NW - NR, depth + NDT);
  sh.lineTo(-NW + NR, depth + NDT);
  sh.quadraticCurveTo(-NW, depth + NDT, -NW, depth + NDT - NR);
  sh.lineTo(-NW, depth); sh.lineTo(-w, depth); sh.closePath();
  return extrude(sh);
}
// rabat extérieur : angles libres arrondis (r 14), pli en x = 0
function roundedFlap(len, width, r) {
  const hw = width / 2, sh = new THREE.Shape();
  sh.moveTo(0, -hw);
  sh.lineTo(len - r, -hw);
  sh.quadraticCurveTo(len, -hw, len, -hw + r);
  sh.lineTo(len, hw - r);
  sh.quadraticCurveTo(len, hw, len - r, hw);
  sh.lineTo(0, hw);
  sh.closePath();
  return extrude(sh);
}

function cloison(name, z, y, flipped, uFrom, uTo, vFrom, vTo) {
  const m = new THREE.Mesh(sheetUV(notchedPanel(0.315, CLOISON_H), 'x', uFrom, uTo, 'y', vFrom, vTo), mat.carton);
  m.name = name; m.position.set(0, y, z);
  if (flipped) m.rotation.z = Math.PI;
  return add(m);
}
function rabatInterieur(name, y, s, uFrom, uTo, vFrom, vTo) {
  const m = new THREE.Mesh(sheetUV(tabbedPanel(outerL, FLAP_SHORT), 'x', uFrom, uTo, 'y', vFrom, vTo), mat.carton);
  m.name = name;
  m.rotation.x = s > 0 ? -Math.PI / 2 : Math.PI / 2;
  m.position.set(0, y, s * (W / 2));
  return add(m);
}
function rabatExterieur(name, hingeX, y, mirrored, angle, uFrom, uTo, vFrom, vTo) {
  const pivot = new THREE.Group();
  pivot.name = name + '_charniere';
  const m = new THREE.Mesh(sheetUV(roundedFlap(FLAP_LONG, W, RCORNER), 'y', uFrom, uTo, 'x', vFrom, vTo), mat.carton);
  m.name = name;
  m.rotation.x = -Math.PI / 2;
  pivot.add(m);
  pivot.rotation.set(0, mirrored ? Math.PI : 0, angle);
  pivot.position.set(hingeX, y, 0);
  carton.add(pivot);
  return pivot;
}

// --- fond -------------------------------------------------------------
rabatInterieur('rabat_fond_avant_interieur', T / 2, 1, 614.7, 937.7, 581.9, 458.9);
rabatInterieur('rabat_fond_arriere_interieur', T / 2, -1, 1504.7, 1183.7, 581.9, 458.9);
cloison('cloison_montante_avant', PZ - 0.0006, FLOOR + CLOISON_H, true, 618.7, 933.7, 418.1, 499.6);
cloison('cloison_montante_arriere', -(PZ - 0.0006), FLOOR + CLOISON_H, true, 1502.2, 1187.2, 418.1, 499.6);
rabatExterieur('rabat_fond_droit_exterieur', L / 2 + T / 2, T * 1.5, true, 0, 1183.7, 937.7, 581.9, 417.4);
rabatExterieur('rabat_fond_gauche_exterieur', -(L / 2 + T / 2), T * 1.5, false, 0, 614.7, 368.7, 581.9, 417.4);

// --- dessus -----------------------------------------------------------
rabatInterieur('rabat_dessus_avant_interieur', H + T / 2, 1, 614.7, 937.7, 745.9, 868.9);
rabatInterieur('rabat_dessus_arriere_interieur', H + T / 2, -1, 1504.7, 1183.7, 745.9, 868.9);
cloison('cloison_descendante_avant', PZ + 0.0006, H - CLOISON_H, false, 618.7, 933.7, 910.4, 828.9);
cloison('cloison_descendante_arriere', -(PZ + 0.0006), H - CLOISON_H, false, 1502.2, 1187.2, 910.4, 828.9);
rabatExterieur('rabat_dessus_droit_exterieur', L / 2 + T / 2, H, false, 1.25, 937.7, 1183.7, 745.9, 910.4);
rabatExterieur('rabat_dessus_gauche_exterieur', -(L / 2 + T / 2), H, true, 1.25, 368.7, 614.7, 745.9, 910.4);

// --- fusion : un seul maillage, une seule matière ---------------------
carton.updateMatrixWorld(true);
const parts = [];
carton.traverse((o) => { if (o.isMesh) parts.push(o); });
let total = 0;
const geos = parts.map((m) => {
  const g = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone());
  g.applyMatrix4(m.matrixWorld);
  total += g.attributes.position.count;
  return g;
});
const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), uvs = new Float32Array(total * 2);
let o3 = 0, o2 = 0;
geos.forEach((g) => {
  pos.set(g.attributes.position.array, o3);
  nor.set(g.attributes.normal.array, o3);
  uvs.set(g.attributes.uv.array, o2);
  o3 += g.attributes.position.count * 3;
  o2 += g.attributes.uv.count * 2;
});
const cartonGeo = new THREE.BufferGeometry();
cartonGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
cartonGeo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
cartonGeo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
const cartonMesh = new THREE.Mesh(cartonGeo, mat.carton);
cartonMesh.name = 'carton_une_piece';
cartonMesh.castShadow = true;
cartonMesh.receiveShadow = true;

const box = new THREE.Group();
box.name = 'caisse_6_bouteilles_couchees';
box.add(cartonMesh);

// --- 6 bouteilles couchées (Ø 68 mm, longueur 300 mm) -----------------
const RAD = 0.918;
const profile = [
  [0, 0], [0.0368, 0], [0.037, 0.004], [0.037, 0.168],
  [0.0345, 0.186], [0.027, 0.203], [0.0182, 0.218], [0.0146, 0.234],
  [0.0143, 0.282], [0.0163, 0.290], [0.0166, 0.298], [0.0138, 0.300], [0, 0.300]
].map(p => new THREE.Vector2(p[0], p[1]));
const bottleGeo = new THREE.LatheGeometry(profile, 48);
const labelGeo = new THREE.CylinderGeometry(0.0375, 0.0375, 0.095, 48, 1, true);
const capsuleGeo = new THREE.CylinderGeometry(0.0173, 0.0163, 0.055, 32, 1, true);

const cellZ = [(W / 2 + PZ) / 2, 0, -(W / 2 + PZ) / 2];
let n = 0;
cellZ.forEach((z) => {
  [0, 1].forEach((level) => {
    n++;
    const g = new THREE.Group();
    g.name = `bouteille_${n}`;
    const b = new THREE.Mesh(bottleGeo, mat.verre); b.name = `verre_${n}`;
    const lab = new THREE.Mesh(labelGeo, mat.etiquette); lab.name = `etiquette_${n}`; lab.position.y = 0.085;
    const cap = new THREE.Mesh(capsuleGeo, mat.capsule); cap.name = `capsule_${n}`; cap.position.y = 0.2725;
    g.add(b, lab, cap);
    g.scale.set(RAD, 1, RAD);
    g.rotation.z = level ? Math.PI / 2 : -Math.PI / 2;
    g.position.set(level ? 0.150 : -0.150, FLOOR + 0.035 + level * 0.070, z);
    box.add(g);
  });
});

stage.setObject(box);
