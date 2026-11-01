# StreamTV

Catalogue vidéo web en français, à trois entrées : **chaînes en direct**, **animé**
et **films**. Même navigation, même recherche, mêmes favoris, un seul accent de
couleur. Node.js natif, zéro dépendance d'exécution, aucun CDN.

## Démarrer

```bash
npm start                 # http://127.0.0.1:3000
npm test                  # 368 tests, lanceur intégré de Node
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
| `/chaines`  | 1 475 chaînes, 18 catégories, pagination, guide de zapping     |
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
  sous licence Unlicense (domaine public), relevé le 1er novembre 2026. Le relevé
  n'est pas versionné : voir la section « Reconstruire le catalogue ».
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

# 2. produire data/sources.json et data/channels.json
node scripts/importer.mjs --amont amont/iptv-org --max 1475

# 3. regénérer les affiches de démonstration si besoin
node scripts/affiches.mjs
```

Le tourniquet par pays garantit qu'aucun pays ne remplit le catalogue à lui seul.
Chaque chaîne produite porte son pays, sa langue, sa source et son adresse.

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
tests/        368 tests, lanceur intégré de Node
```

Le fichier `public/js/partage/catalogue.js` contient la seule pagination, le seul
filtrage et la seule recherche du projet : le serveur et la démonstration
statique l'appellent tous les deux.

## Documentation

- `docs/ADMINISTRATION.md` : rôles, onglets, réglages, sources, codes d'audit,
  procédures et pièges. La console y renvoie depuis chaque onglet.
- `DESIGN_RULES.md` : les règles de design tenues par `tests/design.test.js`.
- `CHANGELOG.md` : ce qui change, ce qui casse, comment migrer.
