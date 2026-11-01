# Journal des versions

## 3.21.0, 1er novembre 2026

### Ce qui change

- **Console sans mot de passe**, sur décision du porteur : nouveau réglage
  `console_sans_mot_de_passe`, activé sur cette installation. Sur le port
  d'administration (3002), la console s'ouvre directement, sans formulaire ni
  code, et affiche un bandeau « Accès libre » dans chaque onglet.
- **Portée limitée.** Le réglage ne vaut que pour la surface d'administration :
  si le site était lancé sur le même réglage activé, la console servie avec le
  catalogue répondrait toujours 401. C'est testé explicitement, parce que
  l'inverse exposerait la porte la plus publique.
- **Journal.** La première ouverture en accès libre écrit une entrée A01 avec
  `acces: "libre"` : la trace existe, elle n'est pas noyée dans le silence.
- **Dix réglages** au lieu de neuf.
- **Configuration protégée des tests.** `npm test` pose `STREAMTV_TESTS=1` et
  n'écrit plus `data/reglages.json` : lancer les tests ne referme plus la
  console que le porteur a ouverte.

### Ce qui casse

- `GET /api/etat` annonce `3.21.0`.
- La réponse de `GET /api/admin/session` porte un champ `accesLibre` quand le
  réglage est actif ; `connecte` y vaut alors `true` sans identifiant.

### Chiffres de cette version

- 466 tests, tous passants, lanceur `node --test`.

## 3.20.0, 1er novembre 2026

### Ce qui change

- **Connexion qui aboutit dans un cadre.** Le mot de passe était accepté, la
  session créée, puis oubliée : le cookie `SameSite=Strict` n'est jamais renvoyé
  quand la page vit dans un cadre d'un autre domaine, ce qui est le cas de
  l'aperçu. Le jeton de session est désormais aussi renvoyé dans le corps de la
  réponse, gardé par la page et présenté dans un en-tête `authorization`. Le
  cookie reste utilisé hors cadre, et reste `HttpOnly`. Le verrou d'appareil
  suit le même chemin (`x-stv-appareil`).
- **Stockage tolérant.** `localStorage` refusé dans un cadre tiers, ou absent :
  le jeton vit en mémoire, la connexion aboutit quand même.
- **Session morte effacée.** Un 401 sur une route d'administration vide le
  stockage du jeton, au lieu de le renvoyer indéfiniment.

### Ce qui casse

- La réponse de `POST /api/admin/connexion` contient deux champs de plus,
  `jeton` et `jetonAppareil`. Aucun client existant ne les lisait.
- `GET /api/etat` annonce `3.20.0`.

### Chiffres de cette version

- 459 tests, tous passants, lanceur `node --test`.

## 3.19.0, 1er novembre 2026

### Ce qui change

- **Connexion à la console par le mot de passe seul.** Le code de vérification
  devient le réglage `code_verification`, désactivé par défaut. Actif, il fait
  réapparaître son champ dans le formulaire ; inactif, le champ n'existe plus.
  Le mot de passe reste obligatoire dans les deux cas.
- **Port d'administration.** `npm run admin` sert la console seule sur le port
  3002, sans aucune page du catalogue ; sa racine mène au chemin privé de la
  console. Verrou d'appareil et code partagés avec le site, sessions séparées.
- **Publication depuis GitHub Pages.** `npm run publier` construit `docs/` sous
  la base `/streamtv/` et `scripts/verifier-publication.mjs` contrôle l'adresse
  publiée. Toute l'interface passe par `public/js/partage/base.js`.
- **Cache corrigé.** Le serveur marquait `/js/` et `/css/` comme `immutable`
  pour un an. Un fichier corrigé sans changement d'adresse restait donc absent
  chez un visiteur déjà venu : c'est exactement ce qui faisait réapparaître
  l'ancien formulaire de connexion. Scripts, styles et affiches passent en
  `no-cache` avec ETag et réponse 304 ; seul `/vendor/` reste immuable.
- **Version unique.** La version du paquet n'est plus recopiée dans le routeur :
  elle y est lue, et un test compare `/api/etat` à `package.json`.

### Ce qui casse

- `GET /api/etat` annonce désormais `3.19.0`.
- Le formulaire de connexion ne contient plus de champ `code` tant que le
  réglage ne le demande pas ; un script qui remplissait ce champ doit d'abord
  activer `code_verification`.
- Les scripts et les styles ne sont plus servis `immutable`. Qui comptait sur un
  cache d'un an pour une raison quelconque perd ce gain, et gagne des
  corrections qui arrivent vraiment.

### Chiffres de cette version

- 455 tests, tous passants, lanceur `node --test`.
- 8 199 chaînes, 3 animés, 4 films, 180 sources, 515 playlists déclarées.
- Neuf réglages, 105 fichiers sous 900 lignes, 28 modules versionnés.

## 3.18.0, 1er novembre 2026

Le site passe d'un catalogue de chaînes à un catalogue à trois entrées.

### Ce qui change

- **Connexion à la console** : le mot de passe seul suffit. Le code de
  vérification sur un nouvel appareil devient un réglage, `code_verification`,
  désactivé par défaut ; quand il est actif, le champ correspondant réapparaît
  dans le formulaire, sinon il n'y figure plus. Le mot de passe reste
  obligatoire dans les deux cas, et le verrou d'appareil continue d'enregistrer
  les machines déjà vues.

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
- **Publication depuis GitHub** : `npm run publier` construit le site dans
  `docs/`, que GitHub Pages sert tel quel (branche `arena/4716de68-streamtv`,
  dossier `/docs`). Le dépôt de projet vivant sous `/streamtv/`, une base de
  publication traverse désormais toute l'interface :
  `public/js/partage/base.js` préfixe les liens, les feuilles et les modules, le
  routeur retire la base avant de comparer, le service worker déduit la sienne
  de sa propre adresse. Sans quoi le site s'afficherait parfaitement à la racine
  et donnerait des pages blanches en ligne. Chaque route a son dossier pour
  qu'un accès direct réponde 200, et `scripts/verifier-publication.mjs` contrôle
  l'adresse publiée en treize points.
- **Réglages** : ils passent de huit à neuf. Toute documentation citant huit
  est fausse.
- **Port d'administration** : `npm run admin` démarre le serveur sur le port
  3002 avec une surface dédiée. Elle sert la console, ses ressources et l'API,
  jamais une page du catalogue ; sa racine renvoie vers le chemin privé de la
  console. Les quatre barrières restent entières (chemin privé, mot de passe,
  verrou d'appareil, code de vérification) : le port ne les remplace pas. Le
  verrou d'appareil et le code sont partagés entre les deux surfaces, les
  sessions ne le sont pas (une par processus). `PORT_ADMIN` change le port,
  `STREAMTV_HOTE=127.0.0.1` limite l'écoute à la machine.
- **Documentation de la console** : les onglets renvoyaient vers
  `/docs/ADMINISTRATION.md`, qui répondait 404. Le fichier est désormais servi
  en `text/markdown` sur les deux surfaces.
- **Service worker** : `public/sw.js` existait et préchargeait tout, mais aucun
  code ne l'enregistrait : le mode hors ligne et l'installation ne prenaient
  jamais effet. L'enregistrement vit dans `app.js`, hors ligne d'en-tête, et son
  échec n'empêche pas le site de s'afficher.
- **Prévisualisation encadrée** : `x-frame-options: SAMEORIGIN` blanchissait le
  site dans la console d'aperçu. La politique de sécurité nomme désormais les
  cadres autorisés (`frame-ancestors`), réglables par `STREAMTV_CADRES`.
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

- 406 tests, tous passants, lanceur `node --test`.
- 8 199 chaînes, 18 catégories, 179 pays, 180 sources déclarées, 515 playlists déclarées.
- 3 animés, 4 films, tous sous licence affichée.
