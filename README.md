# StreamTV

Catalogue vidéo web en français, à trois entrées : **chaînes en direct**, **animé**
et **films**. Même navigation, même recherche, mêmes favoris, un seul accent de
couleur. Node.js natif, zéro dépendance d'exécution, aucun CDN.

## Démarrer

```bash
npm start                 # http://127.0.0.1:3000
npm test                  # 379 tests, lanceur intégré de Node
npm run versionner        # remet la version dans les adresses des modules
npm run versionner:check  # échoue si une adresse ou le service worker a dérivé
npm run controle:lignes   # échoue si un fichier de code dépasse 900 lignes
node scripts/verify.js --base http://127.0.0.1:3000
```

Au premier démarrage, le serveur crée `data/secret.json` avec le mot de passe par
défaut `streamtv` et affiche l'adresse de la console, le code de vérification, et
un avertissement tant que le mot de passe par défaut n'est pas changé.

## Les trois entrées

| Route       | Contenu                                                       |
| ----------- | ------------------------------------------------------------- |
| `/chaines`  | 8 199 chaînes, 18 catégories, 179 pays, filtre par région       |
| `/anime`    | rangées d'animés, filtres partageables par URL, fiches         |
| `/films`    | rangées de films, bouton unique de lecture, reprise à la seconde |
| `/recherche`| les trois familles à la fois, type écrit en toutes lettres     |
| `/favoris`  | liste locale, sans compte                                      |

La console n'est pas à `/admin` : son adresse est le réglage `chemin_console`,
par défaut `/console-f3a91c`. Quatre barrières la protègent : chemin privé, mot
de passe (scrypt), verrou d'appareil, code de vérification affiché sur la sortie
du serveur et renouvelé toutes les dix minutes.

## D'où viennent les contenus

Aucune donnée n'est inventée pour remplir une rangée.

- **Chaînes** : index public [iptv-org](https://github.com/iptv-org/iptv), publié
  sous licence Unlicense (domaine public), relevé du 1er novembre 2026.
  8 199 chaînes retenues sur 179 pays. Le relevé n'est pas versionné : voir la
  section « Reconstruire le catalogue ».
- **Films** : quatre films ouverts du Blender Institute (Sintel, Big Buck Bunny,
  Elephants Dream, Tears of Steel), sous Creative Commons Attribution, licence
  indiquée sur chaque fiche.
- **Animé** : les trois œuvres d'animation ouvertes, présentées comme séries
  d'un ou deux épisodes, avec leur licence.

**Ce qu'il faut savoir sur les chaînes.** L'index iptv-org est du domaine public,
mais il référence des flux servis par des tiers : StreamTV ne vérifie pas que
chaque flux est bien l'émission officielle du diffuseur. Chaque fiche affiche
donc la source et la licence de la source, avec la mention « flux servi par un
tiers, non vérifié par StreamTV ». L'import écarte automatiquement trois cas :
les chaînes de la liste de blocage amont (NSFW et retraits), les flux qui
imposent un référent ou un agent navigateur (contournement qui signale un relais
non officiel), et les flux qui ne sont pas en HTTPS.

Pour un catalogue cent pour cent vérifié, désactivez la source concernée dans la
console et n'importez que les diffuseurs que vous avez contrôlés un par un.

## Reconstruire le catalogue

```bash
# 1. télécharger le relevé amont (jamais versionné, voir .gitignore)
curl -L -o amont.tar.gz https://codeload.github.com/iptv-org/iptv/tar.gz/refs/heads/master
curl -L -o api.tar.gz  https://codeload.github.com/iptv-org/api/tar.gz/refs/heads/gh-pages
mkdir -p amont/iptv-org && tar xzf api.tar.gz -C amont/iptv-org --strip-components=1

# 2. produire data/sources.json, data/channels.json et data/playlists.json
node scripts/importer.mjs --amont amont/iptv-org

#    variante équilibrée : un maximum par pays
node scripts/importer.mjs --amont amont/iptv-org --plafond-pays 30 --max 1475

#    variante qui accepte les flux HTTP (voir l'avertissement ci-dessous)
node scripts/importer.mjs --amont amont/iptv-org --autoriser-http

# 3. regénérer les affiches de démonstration si besoin
node scripts/affiches.mjs
```

Le tourniquet par pays garantit qu'aucun pays ne remplit le catalogue à lui seul
quand un plafond est demandé. Chaque chaîne produite porte son pays, sa langue,
sa source, son adresse, et sa subdivision quand sa zone de diffusion en déclare
une.

**HTTPS seulement, par défaut.** 8 199 des 9 593 chaînes exploitables passent le
filtre HTTPS. Les 1 381 autres ne sont diffusées qu'en HTTP : un navigateur les
bloque comme contenu mixte dès que le site est servi en HTTPS, donc elles
n'entrent pas. L'option `--autoriser-http` les ajoute, mais elles ne liront que
sur un site servi en HTTP, par exemple en local. C'est le cas de 2M, Al Maghribia
et Arryadia, qui n'existent qu'en HTTP dans l'index : le Maroc passe de 9 à 6
chaînes selon ce choix.

**Les 515 playlists fournies.** `data/playlists-declarees.txt` contient la liste
remise par le porteur du projet : 240 playlists de pays et 275 de subdivisions.
L'import mesure, pour chacune, combien de chaînes du catalogue elle contient et
écrit le résultat dans `data/playlists.json`. 272 playlists fournissent des
contenus ; les 243 autres sont vides dans ce relevé, et l'onglet Sources de la
console les liste nommément plutôt que de les passer sous silence. Le détail par
pays est visible dans la console, le détail complet est dans le fichier.

## Publier la démonstration statique

```bash
npm run statique                 # construit _site/
node scripts/construire-statique.mjs --servir   # puis http://127.0.0.1:3001
```

`_site/` contient une version en lecture seule : mêmes données, même interface,
sans console ni import, avec un bandeau de démonstration sur chaque page. Le
fichier `.nojekyll` évite le traitement Jekyll de GitHub Pages. Publier consiste
à pousser le contenu de `_site/` sur la branche servie par GitHub Pages, puis à
rouvrir chaque page à l'adresse publiée.

## Organisation

```
server/       serveur HTTP, routeur, magasin, import, sonde, audit, auth, réglages
public/       interface : coquille, vues, console, styles, service worker
public/js/partage/catalogue.js
              calcul de catalogue partagé par le serveur et la version statique
data/         catalogues, sources, guide éventuel
docs/         ADMINISTRATION.md
scripts/      import, version, contrôle de longueur, vérification, statique
tests/        379 tests, lanceur intégré de Node
```

Le fichier `public/js/partage/catalogue.js` contient la seule pagination, le seul
filtrage et la seule recherche du projet : le serveur et la démonstration
statique l'appellent tous les deux.

## Documentation

- `docs/ADMINISTRATION.md` : rôles, onglets, réglages, sources, codes d'audit,
  procédures et pièges. La console y renvoie depuis chaque onglet.
- `DESIGN_RULES.md` : les règles de design tenues par `tests/design.test.js`.
- `CHANGELOG.md` : ce qui change, ce qui casse, comment migrer.
