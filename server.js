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

const fichierEtat = v => path.join(ETATS, (v || 'defaut').replace(/[^a-z0-9_-]+/gi, '-') + '.json');

app.get('/api/state', (req, res) => {
  const f = fichierEtat(req.query.v);
  if (!fs.existsSync(f)) return res.json(null);
  res.type('json').send(fs.readFileSync(f, 'utf8'));
});

app.put('/api/state', (req, res) => {
  fs.writeFileSync(fichierEtat(req.query.v), JSON.stringify(req.body, null, 1));
  res.json({ ok: true, maj: Date.now() });
});

app.use('/media', express.static(MEDIA, { maxAge: '365d', immutable: true }));
app.use(express.static(RACINE, { index: 'patron-plie.html' }));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log('patron plié → http://localhost:' + port));
