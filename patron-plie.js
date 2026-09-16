const stage = document.querySelector('three-d-stage');
const { THREE } = await stage.ready;

const S = 0.001; // mm -> m

import { CONTOURS as FACES } from './patron-contours.js';

/* pivot [x,y], parent, angle final (deg), axe
   Racine = fond_gauche : il ne tourne jamais, la boîte se monte au-dessus.
   La chaîne fondG -> pGauche -> pAvant est l'inverse de l'ancienne. */
const RIG = {
  fondG:    { pivot: [158, 161], parent: null, a: 0, ax: 'x' },
  pGauche:  { pivot: [158, 161], parent: 'fondG', a: -90, ax: 'x' },
  pAvant:   { pivot: [281, 246.5], parent: 'pGauche', a: 90, ax: 'y' },
  pDroite:  { pivot: [604, 246.5], parent: 'pAvant', a: 90, ax: 'y' },
  pArriere: { pivot: [850, 246.5], parent: 'pDroite', a: 90, ax: 'y' },
  patte:    { pivot: [35, 246.5], parent: 'pGauche', a: -90, ax: 'y' },

  couvG: { pivot: [158, 332], parent: 'pGauche', a: -90, ax: 'x' },
  couvD: { pivot: [727, 332], parent: 'pDroite', a: -90, ax: 'x' },
  fondD: { pivot: [727, 161], parent: 'pDroite', a: 90, ax: 'x' },

  rAvH: { pivot: [442.5, 328.5], parent: 'pAvant', a: -90, ax: 'x' },
  rAvB: { pivot: [442.5, 164.5], parent: 'pAvant', a: 90, ax: 'x' },
  rArH: { pivot: [1010.5, 328.5], parent: 'pArriere', a: -90, ax: 'x' },
  rArB: { pivot: [1010.5, 164.5], parent: 'pArriere', a: 90, ax: 'x' },

  clA: { pivot: [442.5, 411.5], parent: 'rAvH', a: -90, ax: 'x' },
  clC: { pivot: [442.5, 81.5], parent: 'rAvB', a: 90, ax: 'x' },
  clB: { pivot: [1010.5, 411.5], parent: 'rArH', a: -90, ax: 'x' },
  clD: { pivot: [1010.5, 81.5], parent: 'rArB', a: 90, ax: 'x' }
};

const COL = {
  patte: 0xd8c7ae, pGauche: 0xc9b393, pAvant: 0xc9b393, pDroite: 0xc9b393, pArriere: 0xc9b393,
  couvG: 0x7fc4e3, couvD: 0x7fc4e3, fondG: 0xe0857a, fondD: 0xe0857a,
  rAvH: 0xd3c6a8, rAvB: 0xd3c6a8, rArH: 0xd3c6a8, rArB: 0xd3c6a8,
  clA: 0x8fbf8a, clB: 0x8fbf8a, clC: 0x8fbf8a, clD: 0x8fbf8a
};

/* --- contour : noeuds Bézier du PDF -------------------------------- */
const near = (p, q) => Math.abs(p[0] - q[0]) < 0.01 && Math.abs(p[1] - q[1]) < 0.01;

function buildShape(knots) {
  const sh = new THREE.Shape();
  sh.moveTo(knots[0][0][0], knots[0][0][1]);
  const seg = (from, to) => {
    const c1 = from[2], c2 = to[1], p = to[0];
    if (near(c1, from[0]) && near(c2, p)) sh.lineTo(p[0], p[1]);
    else sh.bezierCurveTo(c1[0], c1[1], c2[0], c2[1], p[0], p[1]);
  };
  for (let i = 1; i < knots.length; i++) seg(knots[i - 1], knots[i]);
  seg(knots[knots.length - 1], knots[0]);
  return sh;
}

/* --- textures : UV planaires prises sur le patron à plat --------------- */
const PATRON_W = 1171, PATRON_H = 493; // mm, = patron-texture.png / 2

const rendre = () => {
  if (stage._renderer) stage._renderer.render(stage._scene, stage._camera);
};

const tl = new THREE.TextureLoader();

const texInterieur = tl.load('carton-interieur.png');
texInterieur.colorSpace = THREE.SRGBColorSpace;
texInterieur.wrapS = texInterieur.wrapT = THREE.RepeatWrapping;

/* Fond : la couleur du carton nu, sous tous les calques. */
const matFond = new THREE.MeshStandardMaterial({
  color: 0xc39a6b, roughness: 0.9, metalness: 0, side: THREE.FrontSide,
  envMapIntensity: 0.02
});
const matInterieur = new THREE.MeshStandardMaterial({
  map: texInterieur, roughness: 0.95, side: THREE.FrontSide, envMapIntensity: 0.02
});

/* Pile de calques : chacun est un plan aux mêmes UV que le patron, décalé
   de 0,2 mm par rang. L'ordre de la pile = l'ordre d'empilement réel. */
const couches = [];
const geoFaces = {};
let idSuivant = 1;

/* --- environnement ----------------------------------------------------
   Un métal n'a pas de couleur propre : il ne montre que ce qui l'entoure.
   Sans environnement, la dorure sort noire quel que soit le matériau. */
let envir = null, fondVu = null, pmrem = null;

/* Étalonnage de sortie : l'ACES filmique désature franchement les encres et le
   kraft. On rattrape la vivacité et le niveau sur l'image finale, comme une LUT
   de visionnage — sans toucher aux matériaux. */
const GRADE = { expo: 1.28, satur: 1.24 };
function appliquerGrade() {
  if (!stage._renderer) return;
  stage._renderer.toneMappingExposure = GRADE.expo;
  stage._renderer.domElement.style.filter =
    'saturate(' + GRADE.satur + ') contrast(1.05)';
}

const ENV = {
  rotation: 0, intensite: 0.95, fond: true, nom: 'Salon (généré)'
};

/* Dans cette version de three.js, `envMapIntensity` du matériau n'agit que si
   le matériau porte lui-même son envMap : sans ça, seul l'éclairage global
   compte et le réglage Éclat de chaque calque reste sans effet. On assigne
   donc l'environnement aux deux niveaux — la scène pour l'ambiante, chaque
   matériau pour ses propres reflets. */
function brancherEnv() {
  const tous = [matFond, matInterieur];
  for (const c of couches) tous.push(c.mat, c.matCol);
  for (const m of tous) { m.envMap = envir; m.needsUpdate = true; }
}

/* Un canvas LDR plafonne à 1,0 : une petite softbox blanche sur fond sombre
   n'apporte presque aucune irradiance, et un métal pur en ressort brun.
   On repasse donc le dessin en flottant : les blancs montent à `gain`. */
function equirect(peindre, gain = 90, seuil = 0.42, plage = 0.28) {
  const W = 2048, H = 1024;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  peindre(c.getContext('2d'), W, H);
  const px = c.getContext('2d').getImageData(0, 0, W, H).data;
  const data = new Float32Array(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    for (let k = 0; k < 3; k++) {
      const s = px[i * 4 + k] / 255;
      const lin = s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      /* seul ce qui est franchement lumineux émet : les softboxes montent à
         `gain`, la base reste une ambiante discrète pour ne pas laver le diffus. */
      const e = Math.min(1, Math.max(0, (lin - seuil) / plage));
      data[i * 4 + k] = lin * (0.03 + gain * e * e * (3 - 2 * e));
    }
    data[i * 4 + 3] = 1;
  }
  const t = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.FloatType);
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.colorSpace = THREE.LinearSRGBColorSpace;
  t.needsUpdate = true;

  /* La carte d'éclairage n'est pas regardable : ses hautes lumières sont
     poussées ×gain. On garde donc le dessin tel quel pour le fond visible. */
  const vue = new THREE.CanvasTexture(c);
  vue.mapping = THREE.EquirectangularReflectionMapping;
  vue.colorSpace = THREE.SRGBColorSpace;
  vue.needsUpdate = true;
  return { env: t, fond: vue };
}

const AMBIANTE = { 'Salon (généré)': 0.95, 'Vitrine chaude': 0.4, 'Ciel doux': 0.3 };

const PRESETS = {
  'Studio 3 boîtes': () => equirect((x, W, H) => {
    x.fillStyle = '#4a4a50'; x.fillRect(0, 0, W, H);
    const softbox = (cx, cy, w, h, i) => {
      const g = x.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) / 2);
      g.addColorStop(0, `rgba(255,255,255,${i})`);
      g.addColorStop(0.55, `rgba(255,255,255,${i * 0.5})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g;
      x.save(); x.translate(cx, cy); x.scale(1, h / w); x.translate(-cx, -cy);
      x.fillRect(cx - w / 2, cy - w / 2, w, w); x.restore();
      x.fillStyle = `rgba(255,255,255,${i})`;
      x.fillRect(cx - w / 2.6, cy - h / 2.6, w / 1.3, h / 1.3);
    };
    /* voûte large : c'est elle que renvoie une surface plane comme le patron
       à plat ; sans elle un métal lisse ne réfléchit que le fond sombre. */
    x.fillStyle = 'rgba(255,255,255,.72)'; x.fillRect(0, 0, W, H * 0.30);
    softbox(W * 0.18, H * 0.34, 300, 190, 1);
    softbox(W * 0.52, H * 0.26, 230, 250, 1);
    softbox(W * 0.82, H * 0.42, 210, 140, 0.95);
    softbox(W * 0.36, H * 0.72, 260, 130, 0.7);
    x.fillStyle = 'rgba(255,255,255,.14)'; x.fillRect(0, H * 0.62, W, H * 0.38);
  }),
  'Salon (généré)': () => equirect((x, W, H) => {
    /* En équirectangulaire y est linéaire en élévation : l'horizon doit rester
       haut et le mobilier occuper une large bande, sinon tout se tasse. */
    const HZ = H * 0.45, MUR_H = H * 0.13, MH = HZ - MUR_H;
    const rect = (c, a, b, w, h) => { x.fillStyle = c; x.fillRect(a, b, w, h); };
    const u = f => W * f;

    /* sol : parquet, dégradé contenu pour ne pas noyer l'hémisphère bas */
    const solG = x.createLinearGradient(0, HZ, 0, H);
    solG.addColorStop(0, '#8a6743'); solG.addColorStop(0.45, '#6d4f34'); solG.addColorStop(1, '#5a4029');
    rect(solG, 0, HZ, W, H - HZ);
    for (let i = 0; i < 40; i++) {
      const t = i / 40, y = HZ + Math.pow(t, 1.25) * (H - HZ) * 0.9;
      rect('rgba(0,0,0,' + (0.05 + 0.10 * t) + ')', 0, y, W, 2 + 5 * t);
    }
    for (let i = 0; i < 40; i++) rect('rgba(255,238,210,.06)', u(i / 40), HZ, 2, H - HZ);
    x.fillStyle = '#84403a'; x.beginPath();
    x.ellipse(u(0.63), HZ + (H - HZ) * 0.5, W * 0.17, (H - HZ) * 0.42, 0, 0, 7); x.fill();
    x.strokeStyle = 'rgba(236,214,174,.55)'; x.lineWidth = 5; x.stroke();

    /* plafond + plafonniers */
    const plG = x.createLinearGradient(0, 0, 0, MUR_H);
    plG.addColorStop(0, '#efe7db'); plG.addColorStop(1, '#d3c8b8');
    rect(plG, 0, 0, W, MUR_H);
    rect('#f6f0e6', 0, MUR_H - 10, W, 10);
    for (const fx of [0.3, 0.78]) {
      const g = x.createRadialGradient(u(fx), MUR_H * 0.6, 0, u(fx), MUR_H * 0.6, 70);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.4, '#fff4da'); g.addColorStop(1, 'rgba(255,240,210,0)');
      rect(g, u(fx) - 90, 0, 180, MUR_H * 1.4);
      rect('#2d2723', u(fx) - 3, 0, 6, MUR_H * 0.5);
    }

    /* murs */
    const murG = x.createLinearGradient(0, MUR_H, 0, HZ);
    murG.addColorStop(0, '#dcd2c3'); murG.addColorStop(1, '#bcae99');
    rect(murG, 0, MUR_H, W, MH);
    rect('#d6cab6', 0, HZ - MH * 0.06, W, MH * 0.06);

    /* --- fenêtres + rideaux (les sources) --- */
    const fen = (a, w) => {
      const b = MUR_H + MH * 0.10, hh = MH * 0.66;
      rect('#f2ece0', a - 14, b - 14, w + 28, hh + 28);
      const jour = x.createLinearGradient(0, b, 0, b + hh);
      jour.addColorStop(0, '#ffffff'); jour.addColorStop(0.5, '#f8fcff'); jour.addColorStop(1, '#e2ecf4');
      rect(jour, a, b, w, hh);
      rect('rgba(190,212,172,.5)', a, b + hh * 0.66, w, hh * 0.34);
      rect('rgba(146,176,138,.45)', a, b + hh * 0.82, w, hh * 0.18);
      x.fillStyle = '#ece5d8';
      x.fillRect(a + w / 2 - 4, b, 8, hh);
      x.fillRect(a, b + hh * 0.36, w, 6); x.fillRect(a, b + hh * 0.7, w, 6);
      for (const [rx, rw] of [[a - 62, 62], [a + w, 62]]) {
        const rg = x.createLinearGradient(rx, 0, rx + rw, 0);
        rg.addColorStop(0, '#8a7a64'); rg.addColorStop(0.5, '#c3b296'); rg.addColorStop(1, '#776950');
        rect(rg, rx, MUR_H + 8, rw, MH * 0.94);
        for (let i = 0; i < 7; i++) rect('rgba(0,0,0,.15)', rx + (i + 0.5) * rw / 7, MUR_H + 8, 4, MH * 0.94);
      }
      rect('#6f6253', a - 76, MUR_H + 2, w + 152, 12);
    };
    fen(u(0.045), W * 0.085);
    fen(u(0.175), W * 0.085);

    /* --- bibliothèque --- */
    const bx = u(0.28), bw = W * 0.145, by = MUR_H + MH * 0.10;
    rect('#4a372a', bx, by, bw, HZ - by);
    const et = (HZ - by) / 4;
    for (let r = 0; r < 4; r++) {
      const ry = by + r * et;
      rect('#33251b', bx + 5, ry + et - 11, bw - 10, 11);
      let cx = bx + 11;
      while (cx < bx + bw - 20) {
        const lw = 7 + Math.random() * 12, lh = et - 16 - Math.random() * et * 0.25;
        rect('hsl(' + Math.round(180 + Math.random() * 150) + ',' + Math.round(22 + Math.random() * 38)
             + '%,' + Math.round(28 + Math.random() * 30) + '%)', cx, ry + et - 11 - lh, lw, lh);
        cx += lw + 2.5;
      }
    }

    /* --- console, miroir, objets --- */
    const kx = u(0.43), kw = W * 0.115;
    rect('#3f3226', kx + kw * 0.16, MUR_H + MH * 0.08, kw * 0.68, MH * 0.4);
    rect('#e8eef0', kx + kw * 0.19, MUR_H + MH * 0.095, kw * 0.62, MH * 0.37);
    rect('rgba(255,255,255,.35)', kx + kw * 0.19, MUR_H + MH * 0.095, kw * 0.62, MH * 0.12);
    rect('#5b4632', kx, HZ - MH * 0.30, kw, MH * 0.05);
    rect('#3f3122', kx + 12, HZ - MH * 0.25, 12, MH * 0.25);
    rect('#3f3122', kx + kw - 24, HZ - MH * 0.25, 12, MH * 0.25);
    rect('#8fae94', kx + kw * 0.15, HZ - MH * 0.44, 26, MH * 0.14);
    rect('#c9a24a', kx + kw * 0.46, HZ - MH * 0.40, 18, MH * 0.10);
    rect('#ded7c9', kx + kw * 0.68, HZ - MH * 0.38, 30, MH * 0.08);

    /* --- fauteuils, table basse, lampe verte --- */
    const fauteuil = (a, w, ton) => {
      const t = HZ + (H - HZ) * 0.16, hh = MH * 0.52;
      rect(ton, a, t - hh, w, hh);
      rect('rgba(0,0,0,.2)', a, t - hh, w, hh * 0.16);
      rect('rgba(255,255,255,.12)', a + w * 0.12, t - hh * 0.62, w * 0.76, hh * 0.34);
      rect(ton, a - w * 0.16, t - hh * 0.5, w * 0.2, hh * 0.5);
      rect(ton, a + w * 0.96, t - hh * 0.5, w * 0.2, hh * 0.5);
      rect('#2e2118', a + w * 0.1, t, w * 0.1, MH * 0.13);
      rect('#2e2118', a + w * 0.8, t, w * 0.1, MH * 0.13);
    };
    fauteuil(u(0.565), W * 0.075, '#8f6052');
    fauteuil(u(0.695), W * 0.075, '#6f6c59');

    rect('#7a5738', u(0.625), HZ + (H - HZ) * 0.3, W * 0.062, MH * 0.07);
    rect('#3d2c1d', u(0.632), HZ + (H - HZ) * 0.3 + MH * 0.07, 12, MH * 0.16);
    rect('#3d2c1d', u(0.678), HZ + (H - HZ) * 0.3 + MH * 0.07, 12, MH * 0.16);
    rect('#9fb98f', u(0.638), HZ + (H - HZ) * 0.3 - MH * 0.16, 22, MH * 0.16);
    rect('#efe8da', u(0.668), HZ + (H - HZ) * 0.3 - MH * 0.07, 18, MH * 0.07);

    const lx = u(0.76), lampY = HZ - MH * 0.62, pied = HZ + (H - HZ) * 0.2;
    rect('#2c2620', lx + 22, lampY + MH * 0.34, 8, pied - lampY - MH * 0.34);
    rect('#2c2620', lx + 6, pied, 42, 12);
    const ag = x.createLinearGradient(lx, 0, lx + 52, 0);
    ag.addColorStop(0, '#2b6b43'); ag.addColorStop(0.42, '#86dda2'); ag.addColorStop(1, '#215034');
    x.beginPath();
    x.moveTo(lx + 8, lampY + MH * 0.34); x.lineTo(lx + 44, lampY + MH * 0.34);
    x.lineTo(lx + 52, lampY); x.lineTo(lx, lampY); x.closePath();
    x.fillStyle = ag; x.fill();
    rect('rgba(0,0,0,.18)', lx + 4, lampY + MH * 0.30, 44, MH * 0.05);
    const lueur = x.createRadialGradient(lx + 26, lampY + MH * 0.36, 0, lx + 26, lampY + MH * 0.36, 95);
    lueur.addColorStop(0, 'rgba(255,246,214,.9)'); lueur.addColorStop(1, 'rgba(255,240,200,0)');
    rect(lueur, lx - 70, lampY, 190, MH * 0.8);
    rect('#fff6d6', lx + 7, lampY + MH * 0.325, 38, 10);

    /* --- table à manger, chaises, tableau, porte --- */
    const tx = u(0.82), tw = W * 0.155;
    rect('#3d3226', tx + tw * 0.22, MUR_H + MH * 0.10, tw * 0.46, MH * 0.42);
    rect('#8a6b4a', tx + tw * 0.24, MUR_H + MH * 0.115, tw * 0.42, MH * 0.39);
    rect('#bb9d6f', tx + tw * 0.24, MUR_H + MH * 0.30, tw * 0.42, MH * 0.20);
    rect('#7a5638', tx, HZ + (H - HZ) * 0.26, tw, MH * 0.09);
    rect('rgba(255,255,255,.14)', tx, HZ + (H - HZ) * 0.26, tw, MH * 0.03);
    rect('#3f2d1d', tx + 22, HZ + (H - HZ) * 0.26 + MH * 0.09, 16, MH * 0.22);
    rect('#3f2d1d', tx + tw - 38, HZ + (H - HZ) * 0.26 + MH * 0.09, 16, MH * 0.22);
    for (const f of [0.08, 0.4, 0.72]) {
      rect('#4b3624', tx + tw * f, HZ - MH * 0.02, tw * 0.16, MH * 0.28);
      rect('#5d4430', tx + tw * f - 6, HZ + (H - HZ) * 0.22, tw * 0.19, MH * 0.05);
    }
    rect('#ebe4d4', tx + tw * 0.18, HZ + (H - HZ) * 0.26 - MH * 0.16, 22, MH * 0.16);
    rect('#c7b184', tx + tw * 0.52, HZ + (H - HZ) * 0.26 - MH * 0.09, 18, MH * 0.09);
    rect('#8fae8a', tx + tw * 0.7, HZ + (H - HZ) * 0.26 - MH * 0.2, 24, MH * 0.2);
    rect('#cdbfa9', u(0.985), MUR_H + MH * 0.04, W * 0.03, HZ - MUR_H - MH * 0.04);
    rect('#a08b6e', u(0.9855), MUR_H + MH * 0.06, W * 0.029, HZ - MUR_H - MH * 0.08);

    rect('rgba(255,248,235,.04)', 0, MUR_H, W, MH);
  }, 55, 0.86, 0.1),
  'Contraste dur': () => equirect((x, W, H) => {
    x.fillStyle = '#26262c'; x.fillRect(0, 0, W, H);
    x.fillStyle = '#ffffff'; x.fillRect(W * 0.06, H * 0.14, W * 0.07, H * 0.44);
    x.fillStyle = '#ffffff'; x.fillRect(W * 0.50, H * 0.06, W * 0.03, H * 0.62);
    x.fillStyle = '#ffffff'; x.fillRect(W * 0.72, H * 0.3, W * 0.02, H * 0.38);
    x.fillStyle = 'rgba(255,255,255,.18)'; x.fillRect(0, H * 0.72, W, H * 0.28);
  }, 140),
  'Vitrine chaude': () => equirect((x, W, H) => {
    const g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#f6e6c8'); g.addColorStop(0.5, '#a8895e'); g.addColorStop(1, '#2e241a');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    for (let i = 0; i < 5; i++) {
      x.fillStyle = 'rgba(255,248,230,.9)';
      x.fillRect(W * (0.06 + i * 0.19), H * 0.12, W * 0.035, H * 0.3);
    }
  }),
  'Ciel doux': () => equirect((x, W, H) => {
    const g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#dff0ff'); g.addColorStop(0.48, '#ffffff'); g.addColorStop(0.52, '#c6bcae');
    g.addColorStop(1, '#6d6459');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    const s = x.createRadialGradient(W * 0.3, H * 0.2, 0, W * 0.3, H * 0.2, 420);
    s.addColorStop(0, 'rgba(255,255,255,1)'); s.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = s; x.fillRect(0, 0, W, H * 0.5);
  })
};

function appliquerEnv(tex) {
  const sc = stage._scene;
  if (!sc) return;
  if (stage._renderer && stage._renderer.toneMapping !== THREE.ACESFilmicToneMapping) {
    stage._renderer.toneMapping = THREE.ACESFilmicToneMapping;
    stage._renderer.toneMappingExposure = GRADE.expo;
    appliquerGrade();
    /* Le rig du stage a été réglé pour une scène SANS environnement : cumulé
       avec l'environnement HDR il surexpose et désature le kraft. On l'atténue
       une seule fois, l'ambiante venant désormais de l'environnement. */
    sc.traverse(o => {
      if (o.isLight) o.intensity *= o.isHemisphereLight ? 0.26 : 0.62;
      if (o.material) o.material.needsUpdate = true;
    });
  }
  if (!pmrem && stage._renderer) pmrem = new THREE.PMREMGenerator(stage._renderer);
  if (envir) envir.dispose();
  if (fondVu && fondVu !== tex) fondVu.dispose();
  const src = tex.env || tex;
  fondVu = tex.fond || tex;
  envir = pmrem ? pmrem.fromEquirectangular(src).texture : src;
  sc.environment = envir;
  brancherEnv();
  if (sc.environmentRotation) sc.environmentRotation.y = ENV.rotation;
  sc.environmentIntensity = ENV.intensite;
  sc.background = ENV.fond ? fondVu : null;
  if (sc.backgroundRotation) sc.backgroundRotation.y = ENV.rotation;
  /* la source flottante ne sert qu'à générer la PMREM ; une texture importée
     reste en place, elle sert aussi de fond. */
  if (tex.env && src !== envir) src.dispose();
  rendre();
}

/* --- montage ---------------------------------------------------------- */
const root = new THREE.Group();
const pivots = {}, meshes = {}, versoMeshes = [];

for (const [k, def] of Object.entries(FACES)) {
  const rig = RIG[k];
  const g = new THREE.Group();
  g.position.set(rig.pivot[0] * S, rig.pivot[1] * S, 0);
  pivots[k] = g;

  const geo = new THREE.ShapeGeometry(buildShape(def), 12);

  /* ShapeGeometry écrit les UV = coordonnées mm du patron : il suffit de
     les normaliser par la taille du patron pour que la texture imprimée
     tombe exactement en place, face par face. */
  const uv = geo.attributes.uv;
  const uvInt = uv.clone();
  for (let i = 0; i < uv.count; i++) {
    const x = uv.getX(i), y = uv.getY(i);
    uv.setXY(i, x / PATRON_W, y / PATRON_H);
    uvInt.setXY(i, x / 120, y / 120); // cannelure intérieure, motif de 120 mm
  }
  uv.needsUpdate = true;

  geo.scale(S, S, S);
  geo.translate(-rig.pivot[0] * S, -rig.pivot[1] * S, 0);

  /* L'impression est la peau EXTÉRIEURE de la caisse montée : les rabats se
     replient vers -Z, l'extérieur est donc la face +Z — le sens naturel de la
     ShapeGeometry, sans miroir sur les UV. Le kraft intérieur part sur -Z. */
  const geoVerso = geo.clone();
  geoVerso.setAttribute('uv', uvInt);

  const idxP = geoVerso.getIndex();
  if (idxP) {
    const a = idxP.array;
    for (let i = 0; i < a.length; i += 3) { const t = a[i]; a[i] = a[i + 2]; a[i + 2] = t; }
    idxP.needsUpdate = true;
  }
  const nrmP = geoVerso.attributes.normal;
  for (let i = 0; i < nrmP.count; i++) nrmP.setXYZ(i, -nrmP.getX(i), -nrmP.getY(i), -nrmP.getZ(i));
  nrmP.needsUpdate = true;

  geoFaces[k] = geo;

  const matCouleur = new THREE.MeshStandardMaterial({
    color: COL[k], roughness: 0.92, side: THREE.DoubleSide
  });
  const m = new THREE.Mesh(geo, matCouleur);
  m.name = k;
  m.userData.matCouleur = matCouleur;
  g.add(m);
  meshes[k] = m;

  const verso = new THREE.Mesh(geoVerso, matInterieur);
  geoVerso.translate(0, 0, -0.0003);
  verso.name = k + '_interieur';
  verso.visible = false;
  g.add(verso);
  versoMeshes.push(verso);
}

for (const [k, rig] of Object.entries(RIG)) {
  if (rig.parent) {
    const p = pivots[rig.parent];
    const g = pivots[k];
    g.position.set((rig.pivot[0] - RIG[rig.parent].pivot[0]) * S,
                   (rig.pivot[1] - RIG[rig.parent].pivot[1]) * S, 0);
    p.add(g);
  } else root.add(pivots[k]);
}

/* Phases de montage : rien ne se chevauche, dans cet ordre exact. */
const PHASES = [
  ['pAvant', 'pDroite', 'pArriere', 'patte'],
  ['clC', 'clD'],
  ['rAvB', 'rArB'],
  ['pGauche', 'fondD'],
  ['clA', 'clB'],
  ['rAvH', 'rArH'],
  ['couvG', 'couvD']
];
const PHASE_NOM = ['Parois', 'Cloisons basses', 'Rabats bas', 'Fond',
                   'Cloisons hautes', 'Rabats haut', 'Couvercles'];
const ease = u => u * u * (3 - 2 * u);

function fold(t) {
  const n = PHASES.length;
  let courante = 0;
  PHASES.forEach((grp, i) => {
    const u = Math.min(1, Math.max(0, t * n - i));
    if (u > 0 && u < 1) courante = i;
    else if (u >= 1) courante = Math.min(n - 1, i + (t < 1 ? 1 : 0));
    for (const k of grp) {
      const rig = RIG[k];
      const a = THREE.MathUtils.degToRad(rig.a * ease(u));
      pivots[k].rotation.set(0, 0, 0);
      if (rig.ax === 'x') pivots[k].rotation.x = a; else pivots[k].rotation.y = a;
    }
  });
  pivots.fondG.rotation.set(0, 0, 0);
  /* À plat, le patron est présenté impression vers le haut ; comme les rabats
     se replient de l'autre côté, on retourne le patron dès le début du montage
     pour que la caisse se construise vers le haut et finisse debout. */
  const r = ease(Math.min(1, t / 0.22));
  root.rotation.x = -Math.PI / 2 + Math.PI * r;
  const ph = document.getElementById('ph');
  if (ph) ph.textContent = t <= 0 ? 'à plat' : (t >= 1 ? 'fermée' : PHASE_NOM[courante]);
  if (stage._renderer) stage._renderer.render(stage._scene, stage._camera);
}

/* remplissage : sans lui, l'intérieur de la boîte (faces tournées vers le
   centre) reste noir une fois le pliage entamé. */
root.add(new THREE.HemisphereLight(0xffffff, 0xb9a98f, 0.25));

fold(0);
/* Le patron est couché avec la peau IMPRIMÉE vers le haut — c'est elle qu'on
   vient juger — donc les rabats se replient vers le bas : l'impression reste
   bien à l'extérieur de la boîte montée. */
root.rotation.x = -Math.PI / 2;
await stage.setObject(root);

const sl = document.getElementById('t');
const lbl = document.getElementById('tv');
sl.addEventListener('input', () => {
  const t = +sl.value / 100;
  lbl.textContent = sl.value + ' %';
  fold(t);
});
/* --- pile de calques -------------------------------------------------- */
const listeEl = document.getElementById('couches');
const choixEl = document.getElementById('fchoix');
const repEl = document.getElementById('rep');
let cibleImport = null;

function orienter(t, c) {
  if (!t) return;
  t.center.set(0.5, 0.5);
  t.rotation = -(c.rot || 0) * Math.PI / 180;
  t.repeat.set(c.miroir ? -1 : 1, 1);
  t.needsUpdate = true;
}

function majMateriau(c) {
  const m = c.mat;
  orienter(c.tex, c);
  if (c.tex && c.masque === 'blanc') {
    /* pochoir : l'image découpe, la couleur peint (dorure, vernis, Pantone). */
    m.map = null; m.alphaMap = c.tex; m.color.set(c.couleur || '#ffffff');
    m.transparent = true;
  } else {
    /* sinon l'image garde ses propres couleurs : la couleur du calque est un
       aplat posé DESSOUS, elle ne teinte jamais l'image. */
    m.map = c.tex || null; m.alphaMap = null; m.color.set('#ffffff');
    m.transparent = true;
  }
  for (const mm of [m, c.matCol]) {
    mm.opacity = c.opacite;
    mm.roughness = 1 - c.brillance;
    mm.metalness = c.metal;
    mm.envMapIntensity = c.eclat;
    mm.needsUpdate = true;
  }
  c.matCol.color.set(c.couleur || '#ffffff');
  c.matCol.transparent = c.opacite < 1;
}

/* Image et couleur sont optionnelles : un calque vide ne peint rien, et un
   calque en mode masque sans masque n'a rien à découper. */
const utile = c => c.masque === 'blanc' ? !!c.tex : (!!c.tex || !!c.couleur);
const pochoir = c => !!c.tex && c.masque === 'blanc';

let surMajOrdre = null;

function majOrdre() {
  couches.forEach((c, i) => {
    const z = 0.0002 * (i + 1), on = c.visible && !repEl.checked;
    c.meshesCol.forEach(mesh => {
      mesh.position.z = z;
      mesh.renderOrder = (i + 1) * 2;
      /* en mode pochoir la couleur ne remplit jamais : elle ne peint qu'à
         travers le masque (sinon un calque dorure sans masque peindrait tout). */
      mesh.visible = on && !!c.couleur && c.masque !== 'blanc';
    });
    c.meshes.forEach(mesh => {
      mesh.position.z = z + 0.00006;
      mesh.renderOrder = (i + 1) * 2 + 1;
      mesh.visible = on && (pochoir(c) ? true : !!c.tex);
    });
  });
  if (surMajOrdre) surMajOrdre();
  rendre();
}

function ajouterCouche(opts = {}) {
  const c = {
    id: idSuivant++,
    nom: opts.nom || 'Calque ' + idSuivant,
    tex: null, texNom: '',
    couleur: opts.couleur || null,
    brillance: opts.brillance ?? 0.12,
    metal: opts.metal ?? 0,
    opacite: 1,
    eclat: opts.eclat ?? 0.02,
    masque: 'alpha',
    rot: opts.rot ?? 0,
    miroir: !!opts.miroir,
    visible: true,
    meshes: [], meshesCol: []
  };
  c.mat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, envMap: envir });
  c.matCol = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, envMap: envir });
  for (const [k, geo] of Object.entries(geoFaces)) {
    const fond = new THREE.Mesh(geo, c.matCol);
    fond.name = k + '_c' + c.id + '_fond';
    pivots[k].add(fond);
    c.meshesCol.push(fond);

    const mesh = new THREE.Mesh(geo, c.mat);
    mesh.name = k + '_c' + c.id;
    pivots[k].add(mesh);
    c.meshes.push(mesh);
  }
  couches.push(c);
  majMateriau(c);
  dessinerListe();
  majOrdre();
  return c;
}

function supprimer(c) {
  [...c.meshes, ...c.meshesCol].forEach(m => m.parent && m.parent.remove(m));
  c.matCol.dispose();
  if (c.tex) c.tex.dispose();
  c.mat.dispose();
  couches.splice(couches.indexOf(c), 1);
  dessinerListe();
  majOrdre();
}

function deplacer(c, d) {
  const i = couches.indexOf(c), j = i + d;
  if (j < 0 || j >= couches.length) return;
  couches[i] = couches[j]; couches[j] = c;
  dessinerListe();
  majOrdre();
}

function chargerImage(c, f) {
  const url = URL.createObjectURL(f);
  tl.load(url, t => {
    t.colorSpace = c.masque === 'blanc' ? THREE.NoColorSpace : THREE.SRGBColorSpace;    t.anisotropy = 8;
    if (c.tex) c.tex.dispose();
    c.tex = t; c.texNom = f.name;
    majMateriau(c);
    URL.revokeObjectURL(url);
    dessinerListe();
    majOrdre();
    /* servie par le serveur de partage : l'image part sur le disque pour que
       le client la retrouve au prochain chargement. */
    if (SERVI) {
      const fd = new FormData();
      fd.append('image', f);
      fetch('/api/upload', { method: 'POST', body: fd })
        .then(r => r.json()).then(d => { c.texUrl = d.url; }).catch(() => {});
    }
  });
}

if (choixEl) choixEl.addEventListener('change', () => {
  const f = choixEl.files && choixEl.files[0];
  if (f && cibleImport) chargerImage(cibleImport, f);
  choixEl.value = '';
});

function ligne(txt, el) {
  const d = document.createElement('div');
  d.className = 'row';
  const l = document.createElement('label');
  l.textContent = txt;
  d.append(l, el);
  return d;
}

function reglage(nom, val, max, c) {
  const wrap = document.createElement('div');
  const tete = document.createElement('div');
  tete.className = 'row';
  const lab = document.createElement('label');
  lab.textContent = nom;
  const aff = document.createElement('span');
  const r = document.createElement('input');
  r.type = 'range'; r.min = 0; r.max = max; r.value = Math.round(val * 100);
  aff.textContent = r.value + ' %';
  tete.append(lab, aff);
  r.addEventListener('input', () => {
    aff.textContent = r.value + ' %';
    c(+r.value / 100);
    rendre();
  });
  wrap.append(tete, r);
  return wrap;
}

function dessinerListe() {
  if (!listeEl) return;
  listeEl.textContent = '';
  [...couches].reverse().forEach(c => {
    const carte = document.createElement('div');
    carte.className = 'cq';

    const tete = document.createElement('div');
    tete.className = 'cqt';
    const t = document.createElement('input');
    t.className = 'cqn'; t.value = c.nom;
    t.addEventListener('input', () => { c.nom = t.value; });
    const outils = document.createElement('div');
    outils.className = 'cqo';
    const bouton = (txt, titre, sur) => {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = txt; b.title = titre;
      b.addEventListener('click', sur);
      return b;
    };
    outils.append(
      bouton(c.visible ? '◉' : '○', 'Afficher / masquer', () => { c.visible = !c.visible; dessinerListe(); majOrdre(); }),
      bouton('↑', 'Monter', () => deplacer(c, 1)),
      bouton('↓', 'Descendre', () => deplacer(c, -1)),
      bouton('✕', 'Supprimer', () => supprimer(c))
    );
    tete.append(t, outils);
    carte.append(tete);

    const bImg = document.createElement('button');
    bImg.type = 'button'; bImg.className = 'plein';
    bImg.textContent = c.texNom ? 'Remplacer l\'image…' : 'Importer une image…';
    bImg.addEventListener('click', () => { cibleImport = c; choixEl.click(); });
    carte.append(bImg);

    if (c.texNom) {
      const n = document.createElement('div');
      n.className = 'cqf';
      n.textContent = c.texNom;
      const bX = document.createElement('button');
      bX.type = 'button'; bX.className = 'lien'; bX.textContent = 'retirer';
      bX.addEventListener('click', () => {
        c.tex.dispose(); c.tex = null; c.texNom = '';
        majMateriau(c); dessinerListe(); majOrdre();
      });
      n.append(' ', bX);
      carte.append(n);

      const sel = document.createElement('select');
      for (const [v, lbl2] of [['alpha', 'Couleurs de l\'image'], ['blanc', 'Masque : blanc = couleur']]) {
        const o = document.createElement('option');
        o.value = v; o.textContent = lbl2; o.selected = c.masque === v;
        sel.append(o);
      }
      sel.addEventListener('change', () => {
        c.masque = sel.value;
        if (c.tex) c.tex.colorSpace = c.masque === 'blanc' ? THREE.NoColorSpace : THREE.SRGBColorSpace;
        if (c.tex) c.tex.needsUpdate = true;
        majMateriau(c); dessinerListe(); majOrdre();
      });
      carte.append(ligne('Image', sel));

      const so = document.createElement('select');
      for (const v of [0, 90, 180, 270]) {
        const o = document.createElement('option');
        o.value = v; o.textContent = v + '°'; o.selected = (c.rot || 0) === v;
        so.append(o);
      }
      so.addEventListener('change', () => {
        c.rot = +so.value; majMateriau(c); rendre();
      });
      carte.append(ligne('Orientation', so));

      const mi = document.createElement('input');
      mi.type = 'checkbox'; mi.checked = !!c.miroir;
      mi.addEventListener('change', () => {
        c.miroir = mi.checked; majMateriau(c); rendre();
      });
      carte.append(ligne('Miroir', mi));
    }

    const boite = document.createElement('div');
    boite.className = 'cqc';
    const col = document.createElement('input');
    col.type = 'color'; col.value = c.couleur || '#c39a6b';
    col.disabled = !c.couleur;
    const act = document.createElement('input');
    act.type = 'checkbox'; act.checked = !!c.couleur;
    act.addEventListener('change', () => {
      c.couleur = act.checked ? col.value : null;
      col.disabled = !act.checked;
      majMateriau(c); majOrdre();
    });
    col.addEventListener('input', () => { c.couleur = col.value; majMateriau(c); rendre(); });
    boite.append(act, col);
    carte.append(ligne('Couleur', boite));

    carte.append(
      reglage('Brillance', c.brillance, 100, v => { c.brillance = v; majMateriau(c); }),
      reglage('Métal', c.metal, 100, v => { c.metal = v; majMateriau(c); }),
      reglage('Éclat', c.eclat, 300, v => { c.eclat = v; majMateriau(c); }),
      reglage('Opacité', c.opacite, 100, v => { c.opacite = v; majMateriau(c); })
    );

    listeEl.append(carte);
  });
}

/* --- fond + repérage --------------------------------------------------- */
const fondEl = document.getElementById('fond');
if (fondEl) fondEl.addEventListener('input', () => {
  matFond.color.set(fondEl.value);
  matFond.envMapIntensity = 0.02;
  matFond.needsUpdate = true;
  rendre();
});

function setTexture(on) {
  for (const [k, m] of Object.entries(meshes)) {
    m.material = on ? matFond : m.userData.matCouleur;
  }
  for (const v of versoMeshes) v.visible = on;
  majOrdre();
}
if (repEl) repEl.addEventListener('change', () => setTexture(!repEl.checked));

/* --- étalonnage -------------------------------------------------------- */
for (const [id, cle, div] of [['expo', 'expo', 100], ['satur', 'satur', 100]]) {
  const el = document.getElementById(id), vu = document.getElementById(id + 'v');
  if (!el) continue;
  el.value = Math.round(GRADE[cle] * div);
  if (vu) vu.textContent = Math.round(GRADE[cle] * div) + ' %';
  el.addEventListener('input', () => {
    GRADE[cle] = +el.value / div;
    if (vu) vu.textContent = el.value + ' %';
    appliquerGrade();
    rendre();
  });
}

/* --- réglages de l'environnement -------------------------------------- */
const envSel = document.getElementById('envsel');
const envFond = document.getElementById('envfond');
const envRot = document.getElementById('envrot');
const envRotV = document.getElementById('envrotv');
const envInt = document.getElementById('envint');
const envIntV = document.getElementById('envintv');
const envFile = document.getElementById('envfile');
const envImp = document.getElementById('envimp');
const envNom = document.getElementById('envnom');

if (envSel) {
  for (const k of [...Object.keys(PRESETS), 'studio-env.png']) {
    const o = document.createElement('option');
    o.value = k; o.textContent = k; o.selected = k === ENV.nom;
    envSel.append(o);
  }
  envSel.addEventListener('change', () => {
    ENV.nom = envSel.value;
    if (envNom) envNom.textContent = '';
    ENV.intensite = AMBIANTE[ENV.nom] ?? 0.12;
    if (envInt) envInt.value = Math.round(ENV.intensite * 100);
    if (envIntV) envIntV.textContent = Math.round(ENV.intensite * 100) + ' %';
    if (PRESETS[ENV.nom]) appliquerEnv(PRESETS[ENV.nom]());
    else tl.load(ENV.nom, t => {
      t.mapping = THREE.EquirectangularReflectionMapping;
      t.colorSpace = THREE.SRGBColorSpace;
      appliquerEnv(t);
    });
  });
}
if (envFond) envFond.addEventListener('change', () => {
  ENV.fond = envFond.checked;
  stage._scene.background = ENV.fond ? fondVu : null;
  rendre();
});
if (envRot) envRot.addEventListener('input', () => {
  ENV.rotation = THREE.MathUtils.degToRad(+envRot.value);
  const sc = stage._scene;
  if (sc.environmentRotation) sc.environmentRotation.y = ENV.rotation;
  if (sc.backgroundRotation) sc.backgroundRotation.y = ENV.rotation;
  if (envRotV) envRotV.textContent = envRot.value + '°';
  rendre();
});
if (envInt) envInt.addEventListener('input', () => {
  ENV.intensite = +envInt.value / 100;
  stage._scene.environmentIntensity = ENV.intensite;
  if (envIntV) envIntV.textContent = envInt.value + ' %';
  rendre();
});
if (envImp && envFile) {
  envImp.addEventListener('click', () => envFile.click());
  envFile.addEventListener('change', () => {
    const f = envFile.files && envFile.files[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    tl.load(url, t => {
      t.mapping = THREE.EquirectangularReflectionMapping;
      t.colorSpace = THREE.SRGBColorSpace;
      appliquerEnv(t);
      URL.revokeObjectURL(url);
      if (envNom) envNom.textContent = f.name + ' — panoramique équirectangulaire 2:1';
    });
    envFile.value = '';
  });
}

appliquerEnv(PRESETS[ENV.nom]());

const btnAdd = document.getElementById('add');
if (btnAdd) btnAdd.addEventListener('click', () => ajouterCouche());

/* deux calques de départ : l'impression, puis la dorure par-dessus. */
const c1 = ajouterCouche({ nom: 'Impression', brillance: 0.12, eclat: 0.02 });
tl.load('patron-texture.png', t => {
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  c1.tex = t; c1.texNom = 'patron-texture.png';
  majMateriau(c1); dessinerListe(); majOrdre();
});
ajouterCouche({ nom: 'Dorure', couleur: '#d9a94a', brillance: 0.82, metal: 1, eclat: 1 });
couches[1].masque = 'blanc';
majMateriau(couches[1]);

setTexture(true);
dessinerListe();

window.fold = fold;
window.setTexture = setTexture;
window.couches = couches;

/* --- partage : état commun servi par server.js ------------------------- */
const vue = new URLSearchParams(location.search).get('v') || 'duoartes';
const qs = '?v=' + encodeURIComponent(vue);

function lireEtat() {
  return {
    pliage: +sl.value,
    fond: fondEl ? fondEl.value : '#c39a6b',
    grade: { ...GRADE },
    env: { nom: ENV.nom, intensite: ENV.intensite, rotation: ENV.rotation, fond: ENV.fond },
    couches: couches.map(c => ({
      nom: c.nom, couleur: c.couleur, brillance: c.brillance, metal: c.metal,
      opacite: c.opacite, eclat: c.eclat, masque: c.masque, rot: c.rot,
      miroir: c.miroir, visible: c.visible, texUrl: c.texUrl || null, texNom: c.texNom
    }))
  };
}

function appliquerEtat(e) {
  if (!e) return;
  if (e.pliage != null) { sl.value = e.pliage; lbl.textContent = e.pliage + ' %'; fold(e.pliage / 100); }
  if (e.fond && fondEl) { fondEl.value = e.fond; matFond.color.set(e.fond); matFond.needsUpdate = true; }
  if (e.grade) {
    Object.assign(GRADE, e.grade);
    for (const id of ['expo', 'satur']) {
      const el = document.getElementById(id), vu = document.getElementById(id + 'v');
      if (el) { el.value = Math.round(GRADE[id] * 100); if (vu) vu.textContent = el.value + ' %'; }
    }
    appliquerGrade();
  }
  if (e.env) {
    ENV.intensite = e.env.intensite ?? ENV.intensite;
    ENV.rotation = e.env.rotation ?? 0;
    ENV.fond = e.env.fond !== false;
    if (e.env.nom && PRESETS[e.env.nom]) { ENV.nom = e.env.nom; if (envSel) envSel.value = ENV.nom; appliquerEnv(PRESETS[ENV.nom]()); }
    if (envInt) { envInt.value = Math.round(ENV.intensite * 100); envIntV.textContent = envInt.value + ' %'; }
    if (envRot) { envRot.value = Math.round(THREE.MathUtils.radToDeg(ENV.rotation)); envRotV.textContent = envRot.value + '°'; }
    if (envFond) envFond.checked = ENV.fond;
    stage._scene.environmentIntensity = ENV.intensite;
    stage._scene.background = ENV.fond ? fondVu : null;
  }
  if (Array.isArray(e.couches)) {
    [...couches].forEach(supprimer);
    for (const d of e.couches) {
      const c = ajouterCouche(d);
      Object.assign(c, { nom: d.nom, masque: d.masque || 'alpha', visible: d.visible !== false, texUrl: d.texUrl, texNom: d.texNom || '' });
      if (d.texUrl) tl.load(d.texUrl, t => {
        t.colorSpace = c.masque === 'blanc' ? THREE.NoColorSpace : THREE.SRGBColorSpace;
        t.anisotropy = 8;
        c.tex = t; majMateriau(c); dessinerListe(); majOrdre();
      });
      majMateriau(c);
    }
    dessinerListe(); majOrdre();
  }
  rendre();
}

/* --- mur de boîtes ----------------------------------------------------- */
const FACES_MUR = [
  ['pAvant', 'Avant'], ['pArriere', 'Arrière'], ['pDroite', 'Droite'],
  ['pGauche', 'Gauche'], ['couvG', 'Couvercle'], ['fondD', 'Dessous']
];
const MUR = { n: 9, faceA: 'pAvant', faceB: '', actif: false };
try { Object.assign(MUR, JSON.parse(localStorage.getItem('pp-mur') || '{}')); } catch (e) {}
const sauverMur = () => { try { localStorage.setItem('pp-mur', JSON.stringify(MUR)); } catch (e) {} };

let mur = null;
const murBtn = document.getElementById('mur');
const murInfo = document.getElementById('murinfo');

/* La caisse fermée est clonée telle quelle : les clones partagent géométries
   et matériaux, donc un changement de calque se voit sur tout le mur. */
function construireMur() {
  const tSauv = +sl.value / 100;
  fold(1);
  root.updateWorldMatrix(true, true);

  const cles = [MUR.faceA, MUR.faceB].filter(k => k && meshes[k]);
  if (!cles.length) cles.push('pAvant');
  /* angle de rotation qui amène la face choisie vers l'avant (+Z) */
  const angles = cles.map(k => {
    const n = new THREE.Vector3(0, 0, 1).transformDirection(meshes[k].matrixWorld);
    return -Math.atan2(n.x, n.z);
  });

  const sonde = root.clone(true);
  const bb = new THREE.Box3().setFromObject(sonde);
  const t = bb.getSize(new THREE.Vector3()), c = bb.getCenter(new THREE.Vector3());
  const cell = Math.max(t.x, t.z) * 1.02, etage = t.y * 1.005;

  let rangs = 3;
  while (Math.ceil(MUR.n / rangs) > rangs * 2) rangs++;
  const cols = Math.ceil(MUR.n / rangs);

  /* L'alternance se fait colonne par colonne : chaque colonne garde une seule
     empreinte, le mur reste jointif et les deux faces se lisent en bandes. */
  const largeur = a => Math.abs(Math.cos(a)) * t.x + Math.abs(Math.sin(a)) * t.z;
  const profond = a => Math.abs(Math.cos(a)) * t.z + Math.abs(Math.sin(a)) * t.x;
  const xs = [];
  let total = 0;
  for (let col = 0; col < cols; col++) {
    const a = angles[col % angles.length];
    xs.push(total + largeur(a) / 2);
    total += largeur(a) * 1.004;
  }
  const profMax = Math.max(...angles.map(profond));

  const g = new THREE.Group();
  for (let i = 0; i < MUR.n; i++) {
    const col = Math.floor(i / rangs), rang = i % rangs;
    const a = angles[col % angles.length];
    const piv = new THREE.Group();
    piv.rotation.y = a;
    const b = i === 0 ? sonde : root.clone(true);
    b.position.sub(c);
    piv.add(b);
    /* faces avant alignées sur un même plan, quelle que soit l'orientation */
    piv.position.set(xs[col] - total / 2, rang * etage, (profMax - profond(a)) / -2);
    g.add(piv);
  }
  fold(tSauv);
  if (murInfo) murInfo.textContent = MUR.n + ' boîtes — ' + rangs + ' étages × ' + cols +
    ' colonnes, face' + (cles.length > 1 ? 's ' : ' ') +
    cles.map(k => (FACES_MUR.find(f => f[0] === k) || [, k])[1]).join(' / ');
  return g;
}

function afficherMur(on, refaire) {
  MUR.actif = on;
  sauverMur();
  if (murBtn) {
    murBtn.textContent = on ? 'Revenir au patron' : 'Wall';
    murBtn.style.background = on ? '#8a5a2b' : '';
  }
  if (on) {
    if (!mur || refaire) mur = construireMur();
    stage.setObject(mur);
  } else {
    stage.setObject(root);
  }
  rendre();
}

if (murBtn) murBtn.addEventListener('click', () => afficherMur(!MUR.actif, true));

/* Les clones figent la visibilité des calques : dès qu'un calque apparaît ou
   disparaît (image chargée, calque masqué…), le mur est reconstruit. */
let murEnAttente = false;
surMajOrdre = () => {
  if (!MUR.actif || murEnAttente) return;
  murEnAttente = true;
  requestAnimationFrame(() => {
    murEnAttente = false;
    if (MUR.actif) afficherMur(true, true);
  });
};

const murN = document.getElementById('murn'), murNV = document.getElementById('murnv');
if (murN) {
  murN.value = MUR.n;
  if (murNV) murNV.textContent = MUR.n;
  murN.addEventListener('input', () => {
    MUR.n = +murN.value;
    if (murNV) murNV.textContent = murN.value;
    sauverMur();
    if (MUR.actif) afficherMur(true, true);
  });
}
for (const [id, cle, vide] of [['murfa', 'faceA', null], ['murfb', 'faceB', '— aucune —']]) {
  const el = document.getElementById(id);
  if (!el) continue;
  if (vide) {
    const o = document.createElement('option');
    o.value = ''; o.textContent = vide; o.selected = !MUR[cle];
    el.append(o);
  }
  for (const [k, nom] of FACES_MUR) {
    const o = document.createElement('option');
    o.value = k; o.textContent = nom; o.selected = MUR[cle] === k;
    el.append(o);
  }
  el.addEventListener('change', () => {
    MUR[cle] = el.value;
    sauverMur();
    if (MUR.actif) afficherMur(true, true);
  });
}

/* au chargement, on laisse les textures de départ arriver avant de cloner :
   les clones figent l'état des calques au moment du clonage. */
if (MUR.actif) setTimeout(() => afficherMur(true, true), 700);

const partEl = document.getElementById('part');
const SERVI = location.protocol.startsWith('http');

/* --- snapshots : état complet + miniature du rendu --------------------- */
const snapsEl = document.getElementById('snaps');
const snapAdd = document.getElementById('snapadd');
const snapEtat = document.getElementById('snapetat');
const CLE = 'patron-plie-snaps-' + vue;
let snaps = [];
let apiOk = true;

/* La toile WebGL garde sa dernière image (preserveDrawingBuffer) : on la
   redessine en petit avec le même étalonnage qu'à l'écran. */
function miniature() {
  const src = stage._renderer && stage._renderer.domElement;
  if (!src) return null;
  rendre();
  const L = 264, H = Math.max(1, Math.round(L * src.height / src.width));
  const c = document.createElement('canvas');
  c.width = L; c.height = H;
  const x = c.getContext('2d');
  x.fillStyle = '#efe9df'; x.fillRect(0, 0, L, H);
  x.filter = 'saturate(' + GRADE.satur + ') contrast(1.05)';
  x.drawImage(src, 0, 0, L, H);
  return c.toDataURL('image/jpeg', 0.82);
}

const heure = d => new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
const signature = l => l.map(s => s.id + ':' + (s.nom || '')).join('|');
const sauverLocal = () => { try { localStorage.setItem(CLE, JSON.stringify(snaps)); } catch (e) {} };
const chargerLocal = () => {
  try { snaps = JSON.parse(localStorage.getItem(CLE) || '[]'); } catch (e) { snaps = []; }
  dessinerSnaps();
};

function dessinerSnaps() {
  if (!snapsEl) return;
  snapsEl.textContent = '';
  if (!snaps.length) {
    const v = document.createElement('span');
    v.className = 'vide';
    v.textContent = 'Aucun snapshot — règle la boîte, puis « + Snapshot ».';
    snapsEl.append(v);
    return;
  }
  for (const s of snaps) {
    const b = document.createElement('div');
    b.className = 'snap';
    const img = document.createElement('img');
    img.src = s.vignette || '';
    img.alt = s.nom || 'snapshot';
    img.title = 'Rouvrir ce snapshot';
    img.addEventListener('click', () => {
      appliquerEtat(s.etat);
      if (snapEtat) snapEtat.textContent = '« ' + (s.nom || heure(s.date)) + ' » rouvert';
    });
    const nom = document.createElement('input');
    nom.className = 'nom';
    nom.value = s.nom || heure(s.date);
    nom.addEventListener('change', () => {
      s.nom = nom.value;
      if (SERVI) fetch('/api/snaps' + qs + '&id=' + s.id, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nom: s.nom })
      }).catch(() => {});
      else sauverLocal();
    });
    const del = document.createElement('button');
    del.type = 'button'; del.className = 'del'; del.textContent = '✕';
    del.title = 'Supprimer ce snapshot';
    del.addEventListener('click', () => {
      snaps = snaps.filter(x => x !== s);
      dessinerSnaps();
      if (SERVI) fetch('/api/snaps' + qs + '&id=' + s.id, { method: 'DELETE' }).catch(() => {});
      else sauverLocal();
    });
    b.append(img, nom, del);
    snapsEl.append(b);
  }
}

function prendreSnap() {
  const s = { id: 'l' + Date.now().toString(36), nom: '', date: Date.now(),
              vignette: miniature(), etat: lireEtat() };
  snaps = [...snaps, s];
  dessinerSnaps();
  if (snapsEl) snapsEl.scrollLeft = snapsEl.scrollWidth;
  if (SERVI && apiOk) fetch('/api/snaps' + qs, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ etat: s.etat, vignette: s.vignette, nom: s.nom })
  }).then(r => { if (!r.ok) throw 0; return r.json(); })
    .then(() => syncSnaps())
    .catch(() => { apiOk = false; sauverLocal(); });
  else sauverLocal();
}

/* Servie en http mais sans l'API (aperçu, hébergement statique) : on retombe
   sur le localStorage au lieu d'une barre muette. */
function syncSnaps() {
  if (!SERVI || !apiOk) return Promise.resolve();
  return fetch('/api/snaps' + qs, { cache: 'no-store' })
    .then(r => { if (!r.ok) throw 0; return r.json(); })
    .then(l => {
      /* on ne redessine que si la liste a bougé : sinon la synchro écraserait
         un nom en cours de frappe à chaque tour. */
      if (!Array.isArray(l) || signature(l) === signature(snaps)) return;
      snaps = l;
      dessinerSnaps();
    }).catch(() => { apiOk = false; chargerLocal(); });
}

if (snapAdd) snapAdd.addEventListener('click', prendreSnap);

if (!SERVI) {
  if (partEl) partEl.closest('.bloc-part')?.remove();
  chargerLocal();
} else {
  const diff = document.getElementById('diffuser');
  const suiv = document.getElementById('suivre');
  const rec = document.getElementById('recharger');
  let dernierMaj = 0, dernierPousse = '';

  const pousser = (mot) => fetch('/api/state' + qs, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(lireEtat())
  }).then(r => r.json()).then(d => {
    dernierMaj = d.maj || Date.now();
    if (partMsg) partMsg.textContent = mot + ' — ' + heure(dernierMaj);
  }).catch(() => { if (partMsg) partMsg.textContent = 'échec de l’enregistrement'; });

  const tirer = (force) => fetch('/api/state' + qs, { cache: 'no-store' })
    .then(r => { if (!r.ok) throw 0; return r.json(); }).then(e => {
      if (!e) return null;
      if (!force && !(e.maj > dernierMaj)) return null;
      dernierMaj = e.maj || Date.now();
      appliquerEtat(e);
      return e;
    }).catch(() => null);

  tirer(true);
  dessinerSnaps();
  syncSnaps();

  if (partEl) partEl.addEventListener('click', () => pousser('vue enregistrée'));
  if (rec) rec.addEventListener('click', () => tirer(true).then(e => {
    if (partMsg) partMsg.textContent = e ? 'vue rechargée' : 'aucune vue enregistrée';
  }));

  for (const el of [diff, suiv]) {
    if (!el) continue;
    el.checked = localStorage.getItem('pp-' + el.id) === '1';
    el.addEventListener('change', () => {
      localStorage.setItem('pp-' + el.id, el.checked ? '1' : '0');
      /* diffuser et suivre s'excluent : sinon les deux pages se renvoient
         leur état en boucle. */
      if (el.checked && el === diff && suiv) { suiv.checked = false; localStorage.setItem('pp-suivre', '0'); }
      if (el.checked && el === suiv && diff) { diff.checked = false; localStorage.setItem('pp-diffuser', '0'); }
    });
  }

  /* Synchro automatique : la liste des snapshots tout le temps, la vue en
     cours dans un seul sens à la fois. */
  setInterval(() => {
    syncSnaps();
    if (diff && diff.checked) {
      const s = JSON.stringify(lireEtat());
      if (s !== dernierPousse) { dernierPousse = s; pousser('vue diffusée'); }
    } else if (suiv && suiv.checked) {
      tirer(false).then(e => { if (e && partMsg) partMsg.textContent = 'vue reçue — ' + heure(dernierMaj); });
    }
  }, 2500);
}
