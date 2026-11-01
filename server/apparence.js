/**
 * Apparence du site : couleur d'accent, thème, densité, rayon, largeur,
 * nombre d'affiches par rangée, animations.
 *
 * Le serveur produit une feuille de style réduite à des variables : le CSS du
 * site ne connaît que `--accent`, `--rayon`, `--largeur-contenu` et compagnie.
 * Aucune valeur libre n'entre dans la page, seulement des couleurs validées et
 * des entiers bornés, ce qui exclut toute injection.
 *
 * Le contraste est vérifié, pas supposé : un accent illisible sur le fond est
 * refusé avec sa mesure, et la couleur de texte posée sur l'accent est calculée
 * pour rester lisible.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { DOSSIER_DONNEES, ecrireAtomique } from "./magasin.js";
import { creerSuivi } from "./suivi-fichier.js";

export const FICHIER = join(DOSSIER_DONNEES, "apparence.json");
const PERSISTER = process.env.STREAMTV_TESTS !== "1";

/** Palettes de base. Le thème clair n'est pas une inversion : c'est une palette. */
export const PALETTES = {
  sombre: {
    fond: "#0d1013",
    surface: "#14181c",
    "surface-haute": "#191f24",
    bordure: "#262e35",
    "bordure-forte": "#35404a",
    texte: "#e9eef2",
    "texte-secondaire": "#9aa8b2",
    "texte-faible": "#74838e"
  },
  clair: {
    fond: "#f4f5f6",
    surface: "#ffffff",
    "surface-haute": "#eceef0",
    bordure: "#d8dde1",
    "bordure-forte": "#aeb8c0",
    texte: "#12171b",
    "texte-secondaire": "#46545e",
    "texte-faible": "#5f6e78"
  }
};

export const DESCRIPTION = [
  {
    cle: "nom_site",
    libelle: "Nom du site",
    type: "texte",
    defaut: "StreamTV",
    doc: "apparence-nom",
    effet: "Titre affiché dans l'onglet du navigateur et dans l'en-tête.",
    verifier(v) {
      if (typeof v !== "string") return "Le nom du site est attendu sous forme de texte.";
      const propre = v.trim();
      if (propre.length < 2 || propre.length > 40) return "Le nom du site doit compter de 2 à 40 caractères.";
      return null;
    }
  },
  {
    cle: "accent",
    libelle: "Couleur d'accent",
    type: "couleur",
    defaut: "#e0821f",
    doc: "apparence-accent",
    effet: "Boutons principaux, liens actifs, sélection. Une seule couleur pour tout le site.",
    verifier(v) {
      if (typeof v !== "string" || !/^#[0-9a-f]{6}$/i.test(v)) return "La couleur doit s'écrire #rrggbb, par exemple #e0821f.";
      return null;
    }
  },
  {
    cle: "theme",
    libelle: "Thème",
    type: "choix",
    valeurs: ["sombre", "clair"],
    defaut: "sombre",
    doc: "apparence-theme",
    effet: "Palette de fond, de surfaces et de texte. Le thème clair est une palette complète, pas une inversion.",
    verifier(v) {
      return ["sombre", "clair"].includes(v) ? null : "Le thème vaut sombre ou clair.";
    }
  },
  {
    cle: "densite",
    libelle: "Densité",
    type: "choix",
    valeurs: ["compacte", "confort", "ample"],
    defaut: "confort",
    doc: "apparence-densite",
    effet: "Espacement vertical des sections et des grilles.",
    verifier(v) {
      return ["compacte", "confort", "ample"].includes(v) ? null : "La densité vaut compacte, confort ou ample.";
    }
  },
  {
    cle: "rayon",
    libelle: "Rayon des angles",
    type: "entier",
    defaut: 8,
    min: 0,
    max: 16,
    doc: "apparence-rayon",
    effet: "Arrondi des cartes, des boutons et des champs, en pixels.",
    verifier(v) {
      return Number.isInteger(v) && v >= 0 && v <= 16 ? null : "Le rayon doit être un entier de 0 à 16 pixels.";
    }
  },
  {
    cle: "largeur",
    libelle: "Largeur du contenu",
    type: "entier",
    defaut: 1200,
    min: 1080,
    max: 1600,
    doc: "apparence-largeur",
    effet: "Largeur maximale du contenu, en pixels.",
    verifier(v) {
      if (!Number.isInteger(v) || v < 1080 || v > 1600) return "La largeur doit être un entier de 1080 à 1600 pixels.";
      if (v % 8 !== 0) return "La largeur doit être un multiple de 8 pixels.";
      return null;
    }
  },
  {
    cle: "affiches_par_rangee",
    libelle: "Affiches par rangée",
    type: "entier",
    defaut: 6,
    min: 3,
    max: 8,
    doc: "apparence-affiches",
    effet: "Nombre d'affiches visibles côte à côte sur un grand écran. Le téléphone garde trois colonnes.",
    verifier(v) {
      return Number.isInteger(v) && v >= 3 && v <= 8 ? null : "Le nombre d'affiches doit être un entier de 3 à 8.";
    }
  },
  {
    cle: "animations",
    libelle: "Animations",
    type: "booleen",
    defaut: true,
    doc: "apparence-animations",
    effet: "Transitions et entrées. Désactivées, le site reste utilisable et immobile.",
    verifier(v) {
      return typeof v === "boolean" ? null : "Les animations valent vrai ou faux.";
    }
  }
];

let courant = null;
const aChange = creerSuivi(FICHIER);

export function defauts() {
  return Object.fromEntries(DESCRIPTION.map((d) => [d.cle, d.defaut]));
}

export async function charger() {
  if (courant) return courant;
  let enregistres = {};
  try {
    enregistres = JSON.parse(await readFile(FICHIER, "utf8"));
  } catch (erreur) {
    if (erreur.code !== "ENOENT") throw erreur;
  }
  courant = { ...defauts() };
  for (const d of DESCRIPTION) {
    if (Object.hasOwn(enregistres, d.cle) && d.verifier(enregistres[d.cle]) === null) {
      courant[d.cle] = enregistres[d.cle];
    }
  }
  return courant;
}

export function valeurs() {
  return { ...(courant ?? defauts()) };
}

export function valeur(cle) {
  return courant?.[cle] ?? defauts()[cle];
}

/** Luminance relative WCAG, pour mesurer un contraste au lieu de l'espérer. */
function luminance(hex) {
  const canaux = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = canaux.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Rapport de contraste entre deux couleurs #rrggbb, de 1 à 21. */
export function contraste(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  return Math.round(((Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)) * 100) / 100;
}

/** Texte posé sur l'accent : le noir ou le blanc, selon ce qui se lit le mieux. */
export function texteSur(couleur) {
  const sombre = contraste(couleur, "#0d1013");
  const clair = contraste(couleur, "#ffffff");
  return clair >= sombre ? "#ffffff" : "#0d1013";
}

/**
 * Valide un lot. Le contraste de l'accent sur le fond du thème choisi est
 * mesuré : sous 3 pour 1, la couleur est refusée et le message donne la mesure.
 */
export async function modifier(changements = {}, options = {}) {
  await charger();
  const acceptes = {};
  const refuses = {};
  for (const [cle, v] of Object.entries(changements)) {
    const d = DESCRIPTION.find((x) => x.cle === cle);
    if (!d) {
      refuses[cle] = "Ce réglage d'apparence n'existe pas.";
      continue;
    }
    const probleme = d.verifier(v);
    if (probleme) {
      refuses[cle] = probleme;
      continue;
    }
    acceptes[cle] = typeof v === "string" && d.type === "texte" ? v.trim() : v;
  }

  const suite = { ...courant, ...acceptes };
  if (Object.hasOwn(acceptes, "accent") || Object.hasOwn(acceptes, "theme")) {
    const rapport = contraste(suite.accent, PALETTES[suite.theme].fond);
    if (rapport < 3) {
      refuses.accent = `Cette couleur ne se détache pas assez du fond : contraste de ${String(rapport).replace(".", ",")} pour 1, il en faut 3.`;
      delete acceptes.accent;
    }
  }
  if (Object.keys(refuses).length) return { acceptes: {}, refuses, applique: false };
  courant = { ...courant, ...acceptes };
  if (options.persister !== false && PERSISTER) await ecrireAtomique(FICHIER, courant);
  return { acceptes, refuses, applique: true };
}

/** Recharge le fichier si un autre processus l'a écrit. */
export async function rafraichir() {
  // En test, l'état vit en mémoire et n'est jamais écrit : relire le fichier
  // ramènerait les valeurs de l'installation, pas celles du test.
  if (process.env.STREAMTV_TESTS === "1") return charger();
  if (await aChange()) courant = null;
  return charger();
}

export function reinitialiser() {
  courant = null;
}

/**
 * Feuille de style du site : uniquement des variables, construites à partir de
 * valeurs validées. `afficheLargeur` découle de la largeur du contenu et du
 * nombre d'affiches, sans quoi les deux réglages se contrediraient.
 */
export async function feuille() {
  await charger();
  const palette = PALETTES[courant.theme];
  const lignes = [
    ":root{",
    `--accent:${courant.accent};`,
    `--accent-clair:${courant.accent};`,
    `--accent-texte:${texteSur(courant.accent)};`,
    `--rayon:${courant.rayon}px;`,
    `--rayon-petit:${Math.max(0, Math.min(courant.rayon, 4))}px;`,
    `--largeur-contenu:${courant.largeur}px;`,
    `--affiche-largeur:${largeurAffiche(courant.largeur, courant.affiches_par_rangee)}px;`,
    `--densite-section:${courant.densite === "compacte" ? "16px" : courant.densite === "ample" ? "48px" : "32px"};`,
    ...Object.entries(palette).map(([nom, valeur]) => `--${nom}:${valeur};`),
    "}"
  ];
  if (!courant.animations) lignes.push("*,*::before,*::after{transition-duration:0ms !important;animation-duration:0ms !important;}");
  return lignes.join("");
}

/** Largeur d'une affiche, gaps compris, entre 140 et 280 pixels. */
export function largeurAffiche(largeurContenu, affiches) {
  const gaps = (affiches - 1) * 16;
  const brut = Math.floor((largeurContenu - gaps) / affiches);
  return Math.max(140, Math.min(280, brut));
}

/** Ce que la console montre : les valeurs, plus les mesures de contraste. */
export async function etat() {
  await charger();
  const palette = PALETTES[courant.theme];
  return {
    valeurs: valeurs(),
    description: DESCRIPTION,
    contrasteAccentFond: contraste(courant.accent, palette.fond),
    contrasteAccentTexte: contraste(courant.accent, texteSur(courant.accent)),
    largeurAffiche: largeurAffiche(courant.largeur, courant.affiches_par_rangee)
  };
}
