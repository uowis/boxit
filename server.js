/* Petit serveur de partage pour le patron plié.
   - sert la page et ses fichiers
   - reçoit les images de calques et les garde sur le disque
   - garde un état partagé par lien (?v=nom) : tout le monde voit la même vue

   Lancement :  npm install && npm start     →  http://localhost:3000
*/
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const RACINE = __dirname;
/* Sur Render, un disque persistant est monté sur DATA_DIR : les images et les
   vues doivent y vivre, sinon chaque redéploiement les effacerait. */
const DONNEES = process.env.DATA_DIR || RACINE;
const MEDIA = path.join(DONNEES, 'media');
const ETATS = path.join(DONNEES, 'etats');
for (const d of [MEDIA, ETATS]) fs.mkdirSync(d, { recursive: true });

const app = express();
app.use(express.json({ limit: '2mb' }));

const stockage = multer.diskStorage({
  destination: MEDIA,
  filename: (req, f, cb) => {
    const ext = path.extname(f.originalname) || '.png';
    const base = path.basename(f.originalname, ext).replace(/[^a-z0-9_-]+/gi, '-');
    cb(null, Date.now().toString(36) + '-' + base + ext);
  }
});
const upload = multer({ storage: stockage, limits: { fileSize: 40 * 1024 * 1024 } });

/* image d'un calque → URL permanente */
app.post('/api/upload', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ erreur: 'pas de fichier' });
  res.json({ url: '/media/' + req.file.filename, nom: req.file.originalname });
});

const fichierEtat = v => path.join(ETATS, (v || 'duoartes').replace(/[^a-z0-9_-]+/gi, '-') + '.json');
const fichierSnaps = v => path.join(ETATS, (v || 'duoartes').replace(/[^a-z0-9_-]+/gi, '-') + '-snaps.json');
const lireJson = (f, defaut) => fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : defaut;

app.get('/api/state', (req, res) => {
  const f = fichierEtat(req.query.v);
  if (!fs.existsSync(f)) return res.json(null);
  res.type('json').send(fs.readFileSync(f, 'utf8'));
});

app.put('/api/state', (req, res) => {
  const d = { ...req.body, maj: Date.now() };
  fs.writeFileSync(fichierEtat(req.query.v), JSON.stringify(d, null, 1));
  res.json({ ok: true, maj: d.maj });
});

/* --- snapshots : état complet + vignette du rendu ---------------------- */
app.get('/api/snaps', (req, res) => {
  res.json(lireJson(fichierSnaps(req.query.v), []));
});

app.post('/api/snaps', (req, res) => {
  const { etat, vignette, nom } = req.body || {};
  if (!etat) return res.status(400).json({ erreur: 'pas d\'état' });
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  let url = null;
  const m = /^data:image\/(png|jpeg);base64,(.+)$/.exec(vignette || '');
  if (m) {
    const nomFichier = 'snap-' + id + (m[1] === 'png' ? '.png' : '.jpg');
    fs.writeFileSync(path.join(MEDIA, nomFichier), Buffer.from(m[2], 'base64'));
    url = '/media/' + nomFichier;
  }
  const liste = lireJson(fichierSnaps(req.query.v), []);
  const snap = { id, nom: nom || '', date: Date.now(), vignette: url, etat };
  liste.push(snap);
  fs.writeFileSync(fichierSnaps(req.query.v), JSON.stringify(liste, null, 1));
  res.json(snap);
});

app.patch('/api/snaps', (req, res) => {
  const liste = lireJson(fichierSnaps(req.query.v), []);
  const s = liste.find(x => x.id === req.query.id);
  if (!s) return res.status(404).json({ erreur: 'inconnu' });
  if (typeof req.body.nom === 'string') s.nom = req.body.nom;
  fs.writeFileSync(fichierSnaps(req.query.v), JSON.stringify(liste, null, 1));
  res.json(s);
});

app.delete('/api/snaps', (req, res) => {
  const liste = lireJson(fichierSnaps(req.query.v), []);
  const i = liste.findIndex(x => x.id === req.query.id);
  if (i >= 0) {
    const v = liste[i].vignette;
    if (v) { try { fs.unlinkSync(path.join(MEDIA, path.basename(v))); } catch (e) {} }
    liste.splice(i, 1);
    fs.writeFileSync(fichierSnaps(req.query.v), JSON.stringify(liste, null, 1));
  }
  res.json({ ok: true });
});

app.use('/media', express.static(MEDIA, { maxAge: '365d', immutable: true }));
app.use(express.static(RACINE, { index: 'patron-plie.html' }));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log('patron plié → http://localhost:' + port));
