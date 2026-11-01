# Mettre StreamTV en ligne depuis GitHub

Le site publié est un dossier de fichiers, `docs/`, déjà poussé sur la branche
`arena/4716de68-streamtv`. Il ne manque qu'une autorisation : GitHub Pages est
éteint sur ce dépôt. Tant qu'il est éteint, l'adresse répond « There isn't a
GitHub Pages site here ».

## Ce que j'ai vérifié, et qui explique le 404

| Contrôle | Résultat |
| -------- | -------- |
| `https://mourad0ghazi.github.io/streamtv/` | 404, « There isn't a GitHub Pages site here » |
| `docs/` sur la branche | complet : `index.html`, `404.html`, `.nojekyll`, `statique/`, `js/`, `css/` |
| La page publiée | porte `window.STREAMTV_BASE = "/streamtv"` et les bonnes adresses |
| Le site servi sous `/streamtv/` en local | 13 contrôles sur 13 réussis |

Ce n'est donc ni un fichier manquant, ni une adresse cassée : Pages est
simplement inactif. Et je ne peux pas l'activer : la connexion GitHub dont je
dispose porte sur le contenu du dépôt, pas sur ses réglages. GitHub répond
`403 Resource not accessible by integration` à toute tentative.

## Les quatre clics, une seule fois

1. Ouvrez **https://github.com/mourad0ghazi/streamtv/settings/pages**
2. **Source** : choisissez `Deploy from a branch`. Ne choisissez pas
   `GitHub Actions` : cela exigerait un fichier de workflow que ma connexion
   n'a pas le droit d'écrire.
3. **Branch** : `arena/4716de68-streamtv`, **dossier** : `/docs`
4. **Save**

Le bandeau devient « Your site is live at https://mourad0ghazi.github.io/streamtv/ »
en une à deux minutes. Si le sélecteur de branche n'affiche pas la branche,
rechargez la page : il liste les branches au chargement.

## Vérifier que c'est bien en ligne

```bash
node scripts/verifier-publication.mjs
```

Treize contrôles : page d'accueil, base de publication, styles, modules,
catalogue, manifeste, service worker, route directe. En cas d'échec, le script
dit lequel et rappelle la marche à suivre.

## Mettre à jour le site ensuite

```bash
npm run publier     # reconstruit docs/
git add docs && git commit -m "Mise à jour du site publié"
git push
```

GitHub Pages republie à la poussée. `npm test` compare `docs/` à `public/`
fichier par fichier : un module oublié fait échouer les tests avant la poussée.

## Si vous préférez la voie GitHub Actions

Créez vous-même `.github/workflows/pages.yml` dans l'interface GitHub avec le
contenu ci-dessous, puis réglez **Settings → Pages → Source : GitHub Actions**.
Ma connexion ne peut pas écrire ce fichier, mais la vôtre, si.

```yaml
name: Publier la démonstration
on:
  push:
    branches: [arena/4716de68-streamtv]
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: true
jobs:
  construire:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: node scripts/versionner.js --verifier
      - run: npm test
      - run: |
          depot="${GITHUB_REPOSITORY#*/}"
          if [ "$depot" = "${GITHUB_REPOSITORY_OWNER}.github.io" ]; then base=""; else base="/$depot"; fi
          node scripts/construire-statique.mjs --base "$base"
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: _site
  deployer:
    needs: construire
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deploiement.outputs.page_url }}
    steps:
      - id: deploiement
        uses: actions/deploy-pages@v4
```

## En attendant, le site tourne déjà ici

Deux aperçus vivent dans cet atelier :

- **serveur complet**, port 3000 : tout, y compris la console `/console-f3a91c` ;
- **version publiée**, port 3001 : exactement ce que GitHub servira, sous
  `/streamtv/`, sans console et en lecture seule.
