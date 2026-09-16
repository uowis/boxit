# Héberger la visionneuse pour le client

## Ce que fait le serveur (`server.js`)
- sert `patron-plie.html` et ses fichiers ;
- reçoit chaque image de calque (`POST /api/upload`) et la garde dans `media/` → elle survit au rechargement et le client la voit aussi ;
- garde un état partagé par lien : `GET/PUT /api/state?v=<nom>` écrit `etats/<nom>.json`.

Dans le panneau, **Partage client → Enregistrer cette vue** pousse la vue courante (pliage, calques, images, studio, étalonnage) ; **Recharger la vue** reprend la dernière enregistrée. Le lien `?v=client-x` donne une vue séparée par projet ou par client.

## En local
```bash
npm install
npm start          # → http://localhost:3000
```

## Lien permanent : Render (solution retenue)

Le dépôt contient déjà `render.yaml`, donc tout est préréglé — build, start, disque persistant.

1. **Dépôt GitHub** : pousse ce dossier tel quel (le `.gitignore` exclut `node_modules/`, `media/`, `etats/`).
2. **render.com** → *New* → **Blueprint** → choisis le dépôt. Render lit `render.yaml` et crée le service avec le disque monté sur `/var/data`.
   - En passant par *New → Web Service* à la main : Runtime **Node**, Build `npm install`, Start `npm start`, puis onglet *Disks* → mount path `/var/data`, 1 Go, et variable d'env `DATA_DIR=/var/data`.
3. Premier déploiement ≈ 2 min → URL du type `https://patron-plie.onrender.com`.
4. Ouvre-la, règle tes calques, **Enregistrer cette vue**, et envoie le lien au client : `https://…onrender.com/?v=client-x`.

Mise à jour : un `git push` redéploie tout seul ; les images et les vues restent, elles sont sur le disque.

### Points d'attention
- Le plan **Starter** (7 $/mois) est nécessaire : un disque persistant n'est pas possible sur le plan gratuit, et le plan gratuit met le service en veille (~30 s de réveil au premier chargement).
- `DATA_DIR` non défini = stockage dans le dossier du projet : parfait en local, effacé à chaque déploiement sur Render.
- Aucune authentification : qui a l'URL a la main sur la vue. Si besoin, un Basic Auth de 5 lignes devant `express.static` suffit — dis-le et je l'ajoute.
- Vercel / Netlify ne conviennent pas : système de fichiers en lecture seule, les images uploadées disparaîtraient (il faudrait Cloudinary ou S3).
