# StreamTV

Catalogue vidéo web en français, à trois entrées : **chaînes en direct**, **animé**
et **films**. Même navigation, même recherche, mêmes favoris, un seul accent de
couleur. Node.js natif, zéro dépendance d'exécution, aucun CDN.

## Démarrer

```bash
npm start                 # http://127.0.0.1:3000   le site
npm run admin             # http://127.0.0.1:3002   l'administration seule
npm test                  # 490 tests, lanceur intégré de Node
npm run versionner        # remet la version dans les adresses des modules
npm run versionner:check  # échoue si une adresse ou le service worker a dérivé
npm run controle:lignes   # échoue si un fichier de code dépasse 900 lignes
node scripts/verify.js --base http://127.0.0.1:3000

npm run cles              # clés d'API films (TMDb/OMDb) dans data/cles-api.json
npm run publier           # publie la démonstration dans docs/, pour GitHub Pages
node scripts/verifier-publication.mjs  # contrôle l'adresse publiée
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

## Regarder la télévision

Un clic sur une chaîne l'ouvre directement en lecture ; la ligne de description
de la carte mène à sa fiche, où la licence est affichée.

Le lecteur se conduit comme un téléviseur :

| Touche | Effet |
| ------ | ----- |
| Flèche du bas, flèche du haut | chaîne suivante, chaîne précédente (la liste boucle) |
| Chiffres, puis 1,2 seconde | numéro de chaîne dans la liste courante |
| `L` | ouvrir ou fermer la liste des chaînes, avec sa recherche |
| `M` | couper ou rétablir le son |
| `F` | plein écran |
| `Échap` | fermer la liste, puis le lecteur |

La liste de zapping reprend les filtres de la page en cours : dans une
catégorie, on zappe dans la catégorie ; sur un pays, dans le pays. Elle est
plafonnée à 300 chaînes et servie par `/api/chaines/zapping`. Quand le filtre
dépasse ce plafond, la liste l'écrit noir sur blanc (« 300 chaînes affichées sur
1 012 ») au lieu de laisser croire qu'elle est complète.

Le son, la dernière chaîne regardée et les douze dernières chaînes restent en
mémoire locale (`streamtv.zapping.v1`), sans compte et sans envoi réseau. La page
des chaînes rouvre sur un bandeau « Reprendre » et une rangée « Récemment
regardées ». Quand une chaîne ne répond pas, le lecteur propose de réessayer,
de passer à la suivante, d'ouvrir la liste, ou de revenir au catalogue.

**Sur le téléphone.** Le site s'installe comme application : `public/sw.js`
précharge la coquille et tous les modules, sert le réseau d'abord et retombe sur
le cache quand la connexion manque. Les appels `/api/` ne sont jamais mis en
cache : un catalogue périmé vaut moins qu'une erreur franche. L'enregistrement se
fait depuis `app.js`, donc sans script en ligne, et son échec est silencieux :
un navigateur qui refuse le service worker affiche quand même le site.

La console n'est pas à `/admin` : son adresse est le réglage `chemin_console`,
par défaut `/console-f3a91c`. Trois barrières la protègent toujours : chemin
privé, mot de passe (scrypt), verrou d'appareil. La quatrième, le code de
vérification affiché sur la sortie du serveur, est **désactivée par défaut** :
le mot de passe seul ouvre la console. Le réglage `code_verification` la remet
en service, ce qui est recommandé dès que la console est joignable depuis
Internet ; le champ n'apparaît alors dans le formulaire que si le serveur le
demande.

**Un port pour l'administration, sans mot de passe si vous le décidez.**
`npm run admin` démarre une surface dédiée sur le port 3002, et le réglage
`console_sans_mot_de_passe` (activé sur cette installation) l'ouvre directement :
la console s'affiche sans formulaire, avec un bandeau « Accès libre » en haut.
Ce réglage ne vaut **que** pour ce port : la console servie avec le catalogue
garde son mot de passe, même réglage activé. Pour refermer le port aux autres
machines : `STREAMTV_HOTE=127.0.0.1 npm run admin`. Elle sert la console, ses ressources et l'API, jamais une page
du catalogue : demander `/chaines` y répond 404 avec un lien vers la console. La
racine du port renvoie vers l'adresse privée de la console, ce qui ne dit rien
de plus à qui a déjà trouvé le port. Les deux surfaces partagent le secret, donc
le verrou d'appareil et le code de vérification, mais **pas les sessions** :
une connexion ouverte sur 3002 n'ouvre pas 3000, et réciproquement. Pour
interdire l'accès depuis les autres machines, démarrez avec
`STREAMTV_HOTE=127.0.0.1 npm run admin` ; `PORT_ADMIN` change le port.

## D'où viennent les contenus

Aucune donnée n'est inventée pour remplir une rangée.

- **Chaînes** : index public [iptv-org](https://github.com/iptv-org/iptv), publié
  sous licence Unlicense (domaine public), relevé du 1er novembre 2026.
  8 199 chaînes retenues sur 179 pays. Le relevé n'est pas versionné : voir la
  section « Reconstruire le catalogue ».
- **Compléments TMDb** (facultatif) : avec une clé d'API, chaque fiche de film
  affiche en plus la note de la communauté, la durée officielle et un résumé
  français, dans un bloc attribué. Sans clé, la fiche s'affiche seule : rien
  n'est inventé. Voir `docs/ADMINISTRATION.md`, section « Les clés d'API des
  films ».
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
npm run statique        # construit _site/, base vide, pour voir en local
npm run statique:servir # puis http://127.0.0.1:3001
npm run publier         # construit docs/, base /streamtv, prêt pour GitHub Pages
node scripts/verifier-publication.mjs   # contrôle l'adresse publiée
```

`_site/` et `docs/` contiennent la même chose : une version en lecture seule,
mêmes données, même interface, sans console ni import, avec un bandeau de
démonstration. Le premier sert aux essais ; le second est ce que GitHub Pages
sert tel quel.

**GitHub Pages, une fois pour toutes.** Dans le dépôt, **Settings → Pages**,
puis **Source : Deploy from a branch**, **Branch :
`arena/4716de68-streamtv`**, **dossier `/docs`**, enfin **Save**. Le site
apparaît à `https://mourad0ghazi.github.io/streamtv/`. Ensuite, chaque
`npm run publier` suivi d'un `git push` met le site à jour : il n'y a ni serveur
à maintenir, ni jeton à fournir, ni dossier compilé à téléverser à la main.

Tant que ces quatre clics ne sont pas faits, l'adresse répond « There isn't a
GitHub Pages site here » : ce n'est pas le site qui est cassé, c'est Pages qui
est éteint. Le pas à pas, la variante GitHub Actions et les contrôles sont dans
[PUBLIER.md](PUBLIER.md).

L'adresse dépend du type de dépôt :

| Dépôt | Adresse | Base |
| ----- | ------- | ---- |
| de projet, `streamtv` | `https://<compte>.github.io/streamtv/` | `/streamtv` |
| de compte, `<compte>.github.io` | `https://<compte>.github.io/` | vide |

C'est cette base que `npm run publier` inscrit. Un dépôt de projet vit sous un
sous-chemin : toutes les adresses internes passent par
`public/js/partage/base.js`, qui reçoit la base dans la page publiée
(`window.STREAMTV_BASE`), préfixe les liens créés par `h()`, préfixe les
feuilles et les modules, et retire la base avant que le routeur ne compare le
chemin. Le service worker déduit la sienne de sa propre adresse et précharge la
liste dessous. Sans cela, le même code fonctionnerait à la racine et donnerait
des pages blanches sous `/streamtv/`.

Chaque route a aussi son dossier (`docs/chaines/index.html`, etc.) pour qu'un
accès direct réponde 200 ; une fiche de chaîne tombe sur `404.html`, qui est la
même coquille, et s'ouvre quand même. `tests/publication.test.js` compare
`docs/` à `public/` fichier par fichier : un module oublié à la publication
fait échouer `npm test`.

## Organisation

```
server/       serveur HTTP (site et administration), routeur, magasin, import, sonde, audit, auth, réglages
public/       interface : coquille, vues, console, styles, service worker
public/js/partage/catalogue.js
              calcul de catalogue partagé par le serveur et la version statique
data/         catalogues, sources, guide éventuel
docs/         ADMINISTRATION.md
scripts/      import, version, contrôle de longueur, vérification, statique
tests/        490 tests, lanceur intégré de Node
```

Le fichier `public/js/partage/catalogue.js` contient la seule pagination, le seul
filtrage et la seule recherche du projet : le serveur et la démonstration
statique l'appellent tous les deux.

## Documentation

- `docs/ADMINISTRATION.md` : rôles, onglets, réglages, sources, codes d'audit,
  procédures et pièges. La console y renvoie depuis chaque onglet.
- `DESIGN_RULES.md` : les règles de design tenues par `tests/design.test.js`.
- `CHANGELOG.md` : ce qui change, ce qui casse, comment migrer.
