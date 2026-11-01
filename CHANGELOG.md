# Journal des versions

## 3.18.0, 1er novembre 2026

Le site passe d'un catalogue de chaînes à un catalogue à trois entrées.

### Ce qui change

- **Animé** : nouvelle route `/anime`, trois rangées (« Simulcast de la saison »,
  « Classiques », « Films d'animation »), quatre filtres combinables dans l'URL
  (genre, année, langue, statut), fiche avec liste d'épisodes et reprise de
  lecture par épisode. Une rangée vide n'est jamais rendue.
- **Films** : nouvelle route `/films`, rangées « Ajoutés récemment », « Par
  genre » et « À reprendre », fiche avec un bouton unique qui devient
  « Reprendre à 12:34 » quand une position existe. Progression enregistrée à la
  seconde, localement.
- **Coquille commune** : navigation unique vers les trois familles sans
  rechargement de page, recherche globale plafonnée qui couvre les trois
  familles et écrit le type de chaque résultat en toutes lettres, favoris
  communs stockés localement.
- **Expérience télé** : un clic sur une chaîne l'ouvre en lecture. Le lecteur
  affiche le numéro de chaîne, passe à la précédente ou à la suivante en boucle
  aux flèches, ouvre une liste de zapping recherchable avec `L`, coupe le son
  avec `M`, passe en plein écran avec `F`, et accepte la saisie d'un numéro de
  chaîne. La liste reprend les filtres de la page et se plafonne à 300 chaînes.
  Au-delà de 300 chaînes dans le filtre courant, le panneau annonce le total
  réel et sa troncature plutôt que de faire passer la borne pour un catalogue
  entier.
  Le son, la dernière chaîne et les douze dernières restent en mémoire locale ;
  la page des chaînes rouvre sur un bandeau « Reprendre » et une rangée
  « Récemment regardées ». La fiche d'une chaîne liste les autres chaînes de sa
  catégorie, prêtes à regarder.
- **Guide de zapping** : quand aucune source ne publie de grille, le bloc dit
  précisément ce qui manque au lieu de disparaître ou d'afficher des
  programmes inventés.
- **Tri des chaînes** : la ponctuation de tête ne décide plus du rang, et les
  chiffres se comparent comme des nombres ; la première page commence par les
  noms numérotés au lieu de « ¡OPA! ».
- **Console** : deux onglets de plus (Animé, Films) avec leurs compteurs, onglet
  Sources étendu (état de sonde, priorité, licence éditable, import manuel), et
  un onglet Journal qui affiche le catalogue des codes d'audit.
- **Catalogue élargi** : les 515 playlists fournies par le porteur (240 pays,
  275 subdivisions) sont déclarées dans `data/playlists-declarees.txt`. Le
  catalogue couvre leur union : 8 199 chaînes, 179 pays, 256 chaînes régionales,
  18 catégories. 243 playlists sont vides dans le relevé courant et sont
  listées nommément dans `data/playlists.json` et dans la console.
- **Filtre par région** sur la page Chaînes, pour atteindre les chaînes des
  playlists de subdivisions.
- **Import** : une source sans licence est refusée avec un message français qui
  dit ce qui manque. Les doublons sont arbitrés par priorité et journalisés. Les
  entrées M3U qui imposent un référent ou un agent navigateur sont écartées.
- **Documentation** : `docs/ADMINISTRATION.md` couvre les sept matières
  attendues, avec une section par onglet et par réglage. Un test vérifie la
  correspondance dans les deux sens.
- **Page Favoris** : `/favoris` était connue de la coquille et de la
  navigation, mais absente des pages rendues par le serveur ; le lien menait à
  un 404. La route est servie, deux tests la couvrent.
- **Design** : jeu de jetons complet, un seul accent, aucune ombre hors éléments
  flottants, un test qui refuse dégradés, emoji d'interface, tirets cadratins,
  mots de bateleur, tailles hors échelle et espacements non multiples de 4.

### Ce qui casse

- `GET /api/anime` et `GET /api/films` renvoient désormais un objet
  `{ total, contenus, facettes, rangees }` et non plus une simple liste. Les
  clients qui lisaient un tableau doivent lire `.contenus`.
- `server/texte.js` disparaît : la normalisation vit dans
  `public/js/partage/catalogue.js`, utilisée par le serveur et par la version
  statique.
- La pagination n'existe plus dans `server/magasin.js` : elle est dans le module
  partagé, pour qu'il n'y en ait qu'une.
- Le nombre de réglages passe de zéro à huit. Toute documentation citant un
  autre nombre est fausse.

### Migration d'un catalogue existant

1. Sauvegardez `data/` en entier.
2. Gardez `data/channels.json` tel quel : le format n'a pas changé.
3. Recopiez `data/playlists-declarees.txt` et relancez l'import : il produit
   `data/playlists.json`, la couverture playlist par playlist.
4. Créez `data/anime.json` et `data/films.json` avec l'enveloppe
   `{ "version": 1, "date": "...", "contenus": [] }`. Un fichier absent est lu
   comme un catalogue vide, pas comme une erreur.
5. Ajoutez à `data/sources.json` les sources de vidéo à la demande, avec les dix
   champs et une licence. Sans licence, l'import refuse la source.
6. Lancez `npm run versionner`, puis `npm test`, puis
   `node scripts/verify.js --base http://127.0.0.1:3000`.

### Chiffres de cette version

- 411 tests, tous passants, lanceur `node --test`.
- 8 199 chaînes, 18 catégories, 179 pays, 180 sources déclarées, 515 playlists déclarées.
- 3 animés, 4 films, tous sous licence affichée.
