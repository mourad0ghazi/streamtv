/**
 * Source de vérité unique des réglages.
 *
 * Chaque réglage y est décrit une fois : type, valeur par défaut, bornes, et
 * l'ancre de sa section dans docs/ADMINISTRATION.md. Le serveur valide toute
 * valeur reçue avec cette description ; l'interface ne fait qu'afficher.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { DOSSIER_DONNEES, ecrireAtomique } from "./magasin.js";

export const FICHIER = join(DOSSIER_DONNEES, "reglages.json");

/**
 * Les neuf réglages du site. `verifier` renvoie null si la valeur convient,
 * sinon un message français qui dit ce qui ne va pas.
 */
export const DESCRIPTION = [
  {
    cle: "chemin_console",
    libelle: "Chemin de la console",
    type: "texte",
    defaut: "/console-f3a91c",
    doc: "reglage-chemin-console",
    effet: "Adresse à laquelle la console d'administration répond.",
    risque: "Un chemin devinable facilite les tentatives d'accès.",
    verifier(v) {
      if (typeof v !== "string" || !/^\/[a-z0-9-]{6,40}$/.test(v)) {
        return "Le chemin doit commencer par une barre oblique et contenir de 6 à 40 caractères parmi a-z, 0-9 et tiret.";
      }
      return null;
    }
  },
  {
    cle: "plafond_cartes",
    libelle: "Plafond de cartes par page",
    type: "entier",
    defaut: 24,
    min: 8,
    max: 60,
    doc: "reglage-plafond-cartes",
    effet: "Nombre maximal de cartes affichées en même temps, pour les trois familles.",
    risque: "Trop haut, la page ralentit sur téléphone ; trop bas, la pagination se multiplie.",
    verifier(v) {
      return entierEntre(v, 8, 60);
    }
  },
  {
    cle: "duree_session_minutes",
    libelle: "Durée d'une session de console",
    type: "entier",
    defaut: 60,
    min: 5,
    max: 1440,
    doc: "reglage-duree-session",
    effet: "Au-delà, l'administrateur doit se reconnecter.",
    risque: "Trop longue, un poste laissé ouvert reste accessible ; trop courte, la saisie se perd.",
    verifier(v) {
      return entierEntre(v, 5, 1440);
    }
  },
  {
    cle: "plafond_signalements",
    libelle: "Plafond de signalements",
    type: "entier",
    defaut: 1000,
    min: 10,
    max: 100000,
    doc: "reglage-plafond-signalements",
    effet: "Atteint, le contenu est retiré du catalogue et l'action est journalisée (A30).",
    risque: "Trop haut, un contenu problématique reste en ligne ; trop bas, un contenu est retiré à tort.",
    verifier(v) {
      return entierEntre(v, 10, 100000);
    }
  },
  {
    cle: "intervalle_sonde_minutes",
    libelle: "Intervalle des sondes",
    type: "entier",
    defaut: 30,
    min: 5,
    max: 1440,
    doc: "reglage-intervalle-sonde",
    effet: "Fréquence à laquelle l'état des sources est remesuré automatiquement.",
    risque: "Trop court, le serveur interroge les sources sans répit ; trop long, l'état affiché vieillit.",
    verifier(v) {
      return entierEntre(v, 5, 1440);
    }
  },
  {
    cle: "rangees_genre_max",
    libelle: "Nombre maximal de rangées par genre",
    type: "entier",
    defaut: 4,
    min: 1,
    max: 12,
    doc: "reglage-rangees-genre",
    effet: "Plafonne les rangées « Par genre » de la page Films.",
    risque: "Trop haut, la page Films devient une liste interminable.",
    verifier(v) {
      return entierEntre(v, 1, 12);
    }
  },
  {
    cle: "bandeau_demo",
    libelle: "Bandeau de démonstration",
    type: "booleen",
    defaut: false,
    doc: "reglage-bandeau-demo",
    effet: "Affiche le bandeau de lecture seule sur chaque page.",
    risque: "Activé sur le site réel, il annonce à tort une lecture seule.",
    verifier(v) {
      return typeof v === "boolean" ? null : "La valeur doit être vrai ou faux.";
    }
  },
  {
    cle: "code_verification",
    libelle: "Code de vérification sur un nouvel appareil",
    type: "booleen",
    defaut: false,
    doc: "reglage-code-verification",
    effet: "Désactivé, le mot de passe suffit à entrer dans la console.",
    risque: "Activé, un appareil inconnu doit aussi recopier le code affiché par le serveur : c'est une barrière de plus contre un mot de passe éventé, mais il faut être devant la sortie du serveur.",
    verifier(v) {
      return typeof v === "boolean" ? null : "La valeur doit être vrai ou faux.";
    }
  },
  {
    cle: "attente_lecteur_secondes",
    libelle: "Attente maximale du lecteur",
    type: "entier",
    defaut: 10,
    min: 5,
    max: 60,
    doc: "reglage-attente-lecteur",
    effet: "Au-delà, le lecteur abandonne et propose une issue en français.",
    risque: "Trop long, l'écran reste noir ; trop court, une source lente est abandonnée à tort.",
    verifier(v) {
      return entierEntre(v, 5, 60);
    }
  }
];

function entierEntre(valeur, min, max) {
  if (!Number.isInteger(valeur)) return "La valeur doit être un nombre entier.";
  if (valeur < min || valeur > max) return `La valeur doit être comprise entre ${min} et ${max}.`;
  return null;
}

let courant = null;

/** Valeurs par défaut, dans l'ordre de la description. */
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
  return { ...courant };
}

export function valeur(cle) {
  return courant?.[cle] ?? defauts()[cle];
}

/**
 * Valide et enregistre un lot de réglages. Renvoie les valeurs refusées avec
 * leur message : le serveur ne se fie jamais à l'interface.
 */
export async function modifier(changements) {
  await charger();
  const acceptes = {};
  const refuses = {};
  for (const [cle, v] of Object.entries(changements ?? {})) {
    const d = DESCRIPTION.find((x) => x.cle === cle);
    if (!d) {
      refuses[cle] = "Ce réglage n'existe pas.";
      continue;
    }
    const probleme = d.verifier(v);
    if (probleme) {
      refuses[cle] = probleme;
      continue;
    }
    acceptes[cle] = v;
  }
  if (Object.keys(refuses).length) return { acceptes: {}, refuses, applique: false };
  courant = { ...courant, ...acceptes };
  await ecrireAtomique(FICHIER, courant);
  return { acceptes, refuses, applique: true };
}

/** Remet l'état mémoire à zéro ; réservé aux tests. */
export function reinitialiser() {
  courant = null;
}
