# Règles de design

Ces règles valent contraintes. Elles sont vérifiées par `tests/design.test.js` :
un fichier qui les enfreint fait échouer la suite, il ne suffit pas de les
relire. Le but n'est pas d'éviter une liste, c'est de faire un choix réfléchi
partout où le réflexe serait de décorer.

## Couleur

- Un seul accent, `--accent: #e0821f`. Le reste est neutre, d'une seule famille
  de gris, à température froide (`--fond`, `--surface`, `--bordure`).
- Une seconde couleur ne sert qu'à porter un sens : `--danger` pour une erreur,
  `--succes` pour une confirmation. Jamais pour la variété.
- Interdits : les dégradés bleu vers violet et indigo vers violacé, le texte en
  dégradé, une teinte propre à une catégorie ou à une fonction.
- L'accent reste sous 10 pour cent de la surface visible : une page qui paraît
  colorée a trop d'accent.

## Profondeur

- Aucune ombre sur ce qui ne flotte pas. Une seule ombre existe,
  `--ombre-flottant`, réservée aux éléments qui recouvrent la page : la
  notification.
- On sépare par l'espace d'abord, par un cran de fond ensuite, par une bordure
  d'un pixel en dernier recours.
- Un seul rayon, `--rayon: 8px`, plus `--rayon-petit: 4px` pour le focus.

## Typographie

- Une seule famille de police, système ; une monospace pour les nombres et les
  codes.
- Échelle réelle : 12, 13, 14, 15, 16, 20, 24, 30, 32, 40 pixels. Rien sous
  12 pixels.
- Titres et boutons en casse phrase. Les majuscules ne servent qu'aux très
  petits libellés, avec de l'espacement entre les lettres.
- Corps de texte aligné à gauche, largeur plafonnée à 68 caractères.
- Interdits dans la copie : le tiret cadratin, les mots de bateleur, les
  promesses sans chiffre. On écrit ce que le produit fait.

## Espacement et proportions

- Tout espacement est un multiple de 4, par les jetons `--e1` à `--e9`.
  Seule exception : le retrait d'occlusion de 1 pixel des textes lus par un
  lecteur d'écran.
- Contenu sur 1 200 pixels au plus, marges de section de 48 à 96 pixels.
- Un titre principal de 40 pixels sur ordinateur, 30 sur téléphone. Jamais 72.
- Boutons de 36 à 44 pixels de haut, à la mesure du libellé, jamais pleine
  largeur sur ordinateur.

## Mouvement

- Les survols changent une couleur de fond ou de bordure, en 140 millisecondes.
  Rien ne se soulève, rien ne s'agrandit, rien ne brille.
- On n'anime que l'opacité et la transformation, 220 millisecondes au plus.
- `prefers-reduced-motion` coupe tout mouvement non essentiel.

## Icônes et états

- Un seul jeu d'icônes, tracés à la main, un seul poids de trait (1,75),
  monochrome, à la taille du texte voisin. Aucune icône dans un carré, un cercle
  ou une pastille teintée. Aucun emoji d'interface.
- Aucun contrôle superposé à une affiche : un programme reste lisible sans
  survol.
- Chaque attente a un plafond, chaque état vide une phrase qui dit quoi faire,
  chaque erreur un message qui dit ce qui s'est passé et l'issue proposée.

## Structure

- Pas de badge au-dessus du titre principal, pas d'ordre de page modèle
  (titre, logos, trois atouts, témoignage, tarifs). On ne construit que les
  sections dont ce produit a besoin.
- Une rangée vide n'est pas rendue du tout : ni bloc, ni titre orphelin.
- HTML sémantique : `header`, `nav`, `main`, `section`, `button`, `a`. Une `div`
  cliquable est un bug.
- Le focus est visible, l'ordre de tabulation suit l'ordre visuel, chaque image
  porte un `alt` utile.

## Comment vérifier

```bash
npm test   # tests/design.test.js et tests/gabarit.test.js font partie de la suite
```

Le test de gabarit calcule la largeur réelle d'une affiche à 375 pixels :
trois colonnes, 106,33 pixels chacune. Il échoue si la grille se resserre mal.
