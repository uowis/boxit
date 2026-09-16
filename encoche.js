const stage = document.querySelector('three-d-stage');
const { THREE } = await stage.ready;

const T = 0.003;
const NW = 0.170 / 2, ND = 0.040, NR = 0.020;   // encoche 170 x 40, rayon 20
const CLOISON_W = 0.315, CLOISON_H = 0.0815;
const RABAT_W = 0.329, RABAT_D = 0.083;
const TONGUE = 0.040;                            // la languette remplit l'encoche

const matCarton = new THREE.MeshStandardMaterial({ color: 0xc8a97e, roughness: 0.95, side: THREE.DoubleSide });
const matTongue = new THREE.MeshStandardMaterial({ color: 0x3d7ea6, roughness: 0.9, side: THREE.DoubleSide });

function extrude(sh) {
  const g = new THREE.ExtrudeGeometry(sh, { depth: T, bevelEnabled: false, curveSegments: 24 });
  g.translate(0, 0, -T / 2);
  return g;
}

/* Cloison : encoche évidée dans le bord supérieur */
function notchedPanel() {
  const w = CLOISON_W / 2, d = CLOISON_H, sh = new THREE.Shape();
  sh.moveTo(-w, 0); sh.lineTo(w, 0); sh.lineTo(w, d); sh.lineTo(NW, d);
  sh.lineTo(NW, d - ND + NR);
  sh.quadraticCurveTo(NW, d - ND, NW - NR, d - ND);
  sh.lineTo(-NW + NR, d - ND);
  sh.quadraticCurveTo(-NW, d - ND, -NW, d - ND + NR);
  sh.lineTo(-NW, d); sh.lineTo(-w, d); sh.closePath();
  return extrude(sh);
}

/* Rabat intérieur : languette saillante, même gabarit que l'encoche */
function tabbedPanel() {
  const w = RABAT_W / 2, d = RABAT_D, sh = new THREE.Shape();
  sh.moveTo(-w, 0); sh.lineTo(w, 0); sh.lineTo(w, d); sh.lineTo(NW, d);
  sh.lineTo(NW, d + TONGUE - NR);
  sh.quadraticCurveTo(NW, d + TONGUE, NW - NR, d + TONGUE);
  sh.lineTo(-NW + NR, d + TONGUE);
  sh.quadraticCurveTo(-NW, d + TONGUE, -NW, d + TONGUE - NR);
  sh.lineTo(-NW, d); sh.lineTo(-w, d); sh.closePath();
  return extrude(sh);
}

/* Contour rouge du seul tracé de l'encoche (U renversé) */
function notchOutline(y0) {
  const c = new THREE.Path();
  c.moveTo(NW, y0);
  c.lineTo(NW, y0 - ND + NR);
  c.quadraticCurveTo(NW, y0 - ND, NW - NR, y0 - ND);
  c.lineTo(-NW + NR, y0 - ND);
  c.quadraticCurveTo(-NW, y0 - ND, -NW, y0 - ND + NR);
  c.lineTo(-NW, y0);
  const pts = c.getPoints(80).map(p => new THREE.Vector3(p.x, p.y, T / 2 + 0.0012));
  const g = new THREE.BufferGeometry().setFromPoints(pts);
  return new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xd93025 }));
}

const root = new THREE.Group();

/* --- pièce 1 : la cloison, verticale --- */
const cloison = new THREE.Group();
const cl = new THREE.Mesh(notchedPanel(), matCarton);
cl.name = 'cloison_transversale';
cloison.add(cl);
cloison.add(notchOutline(CLOISON_H));
root.add(cloison);

/* --- pièce 2 : le rabat intérieur, replié à l'horizontale --- */
const rabat = new THREE.Group();
const rb = new THREE.Mesh(tabbedPanel(), matCarton);
rb.name = 'rabat_interieur';
rabat.add(rb);
/* la languette repeinte pour la distinguer */
const tg = new THREE.Mesh(tabbedPanel(), matTongue);
tg.scale.set(1, 1, 1.02);
tg.name = 'languette';
rabat.add(tg);
rabat.rotation.x = -Math.PI / 2;
root.add(rabat);

/* La languette bleue ne doit apparaître que sur sa partie saillante :
   on masque le corps du rabat en le redessinant par-dessus. */
rabat.remove(tg);
const tongueOnly = (() => {
  const sh = new THREE.Shape();
  sh.moveTo(-NW, RABAT_D);
  sh.lineTo(NW, RABAT_D);
  sh.lineTo(NW, RABAT_D + TONGUE - NR);
  sh.quadraticCurveTo(NW, RABAT_D + TONGUE, NW - NR, RABAT_D + TONGUE);
  sh.lineTo(-NW + NR, RABAT_D + TONGUE);
  sh.quadraticCurveTo(-NW, RABAT_D + TONGUE, -NW, RABAT_D + TONGUE - NR);
  sh.closePath();
  const m = new THREE.Mesh(extrude(sh), matTongue);
  m.name = 'languette';
  m.position.z = 0.0004;
  return m;
})();
rabat.add(tongueOnly);

/* Positions assemblée / éclatée */
const POS = {
  assemble: {
    cloison: new THREE.Vector3(0, 0, 0),
    rabat: new THREE.Vector3(0, CLOISON_H - ND, RABAT_D + TONGUE)
  },
  eclate: {
    cloison: new THREE.Vector3(0, 0, 0),
    rabat: new THREE.Vector3(0, CLOISON_H + 0.075, RABAT_D + TONGUE + 0.02)
  }
};

let mode = 'eclate';
function place(m) {
  cloison.position.copy(POS[m].cloison);
  rabat.position.copy(POS[m].rabat);
  stage._renderer && stage._renderer.render(stage._scene, stage._camera);
}
place(mode);

root.position.y = -CLOISON_H / 2;
await stage.setObject(root);

document.getElementById('toggle').addEventListener('click', (e) => {
  mode = mode === 'eclate' ? 'assemble' : 'eclate';
  place(mode);
  e.target.textContent = mode === 'eclate' ? 'Voir assemblé' : 'Voir séparé';
});
