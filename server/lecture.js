/**
 * Lecture : le fournisseur d'embarquement et les préférences du lecteur.
 *
 * Le site peut lire un film de deux façons : le fichier du catalogue, servi par
 * le site lui-même, ou un flux tiers embarqué dans un cadre, désigné par un
 * identifiant TMDb. Le second n'est jamais actif par défaut, parce qu'un flux
 * tiers n'est pas un contenu dont le site peut prouver la licence : la console
 * exige donc une attestation de droits, nommée et datée, avant d'ouvrir la
 * lecture.
 *
 * La clé du fournisseur ne sort jamais par une route de lecture : elle est
 * masquée dans l'état, et n'apparaît que dans l'adresse du cadre, où le
 * fournisseur l'exige. La console le dit explicitement.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { DOSSIER_DONNEES, ecrireAtomique } from "./magasin.js";
import { creerSuivi } from "./suivi-fichier.js";

export const FICHIER = join(DOSSIER_DONNEES, "lecture.json");
const PERSISTER = process.env.STREAMTV_TESTS !== "1";

export const ATTRIBUTION =
  "Flux fourni par un service tiers, embarqué à la demande. StreamTV ne l'héberge pas et n'en garantit ni la disponibilité ni les droits.";

export const DESCRIPTION = [
  {
    cle: "fournisseur_actif",
    libelle: "Lecture par fournisseur tiers",
    type: "booleen",
    defaut: false,
    doc: "lecture-fournisseur",
    effet: "Ouvre le bouton Regarder des films sur le flux du fournisseur. Sans attestation, l'activation est refusée.",
    verifier(v) {
      return typeof v === "boolean" ? null : "L'activation vaut vrai ou faux.";
    }
  },
  {
    cle: "fournisseur_nom",
    libelle: "Nom du fournisseur",
    type: "texte",
    defaut: "NexStream",
    doc: "lecture-nom",
    effet: "Nom affiché dans la console et sur la fiche, pour que le visiteur sache d'où vient le flux.",
    verifier(v) {
      if (typeof v !== "string") return "Le nom du fournisseur est attendu sous forme de texte.";
      const propre = v.trim();
      return propre.length >= 2 && propre.length <= 40 ? null : "Le nom doit compter de 2 à 40 caractères.";
    }
  },
  {
    cle: "fournisseur_base",
    libelle: "Adresse du fournisseur",
    type: "texte",
    defaut: "https://api.codespecters.com",
    doc: "lecture-base",
    effet: "Origine des cadres de lecture. HTTPS obligatoire, sauf pour un miroir local d'essai.",
    verifier(v) {
      const probleme = verifierBase(v);
      return probleme;
    }
  },
  {
    cle: "fournisseur_modele",
    libelle: "Chemin du cadre",
    type: "texte",
    defaut: "/embed/movie/{tmdbId}?apikey={cle}",
    doc: "lecture-modele",
    effet: "Chemin du cadre, avec {tmdbId} et {cle} remplacés par le serveur. La position de reprise est ajoutée ensuite.",
    verifier(v) {
      if (typeof v !== "string") return "Le chemin du cadre est attendu sous forme de texte.";
      if (!v.includes("{tmdbId}")) return "Le chemin doit contenir {tmdbId} : sans lui, il ne désigne aucun film.";
      if (v.length > 200) return "Le chemin ne peut pas dépasser 200 caractères.";
      if (!v.startsWith("/") && !/^https:\/\//i.test(v)) return "Le chemin doit commencer par une barre oblique ou par https://.";
      return null;
    }
  },
  {
    cle: "qualite_max",
    libelle: "Qualité maximale",
    type: "choix",
    valeurs: ["auto", "1080", "720", "480"],
    defaut: "auto",
    doc: "lecture-qualite",
    effet: "Plafond demandé au lecteur du site pour les fichiers du catalogue. Le fournisseur tiers choisit la sienne.",
    verifier(v) {
      return ["auto", "1080", "720", "480"].includes(v) ? null : "La qualité vaut auto, 1080, 720 ou 480.";
    }
  },
  {
    cle: "reprise_auto",
    libelle: "Reprise automatique",
    type: "booleen",
    defaut: true,
    doc: "lecture-reprise",
    effet: "Le lecteur repart de la dernière position enregistrée sur l'appareil, à la seconde.",
    verifier(v) {
      return typeof v === "boolean" ? null : "La reprise automatique vaut vrai ou faux.";
    }
  },
  {
    cle: "demarrage_muet",
    libelle: "Démarrage sans son",
    type: "booleen",
    defaut: false,
    doc: "lecture-muet",
    effet: "Le lecteur commence muet, le visiteur remonte le son quand il veut.",
    verifier(v) {
      return typeof v === "boolean" ? null : "Le démarrage sans son vaut vrai ou faux.";
    }
  }
];

let courant = null;
const aChange = creerSuivi(FICHIER);

export function defauts() {
  return {
    ...Object.fromEntries(DESCRIPTION.map((d) => [d.cle, d.defaut])),
    cle: "",
    attestation: { droits: false, auteur: "", date: null, note: "" }
  };
}

/** Une base valide : HTTPS, ou HTTP réservé à la boucle locale pour les essais. */
export function verifierBase(valeur) {
  if (typeof valeur !== "string" || !valeur.trim()) return "L'adresse du fournisseur est attendue.";
  let url;
  try {
    url = new URL(valeur.trim());
  } catch {
    return "L'adresse du fournisseur n'est pas une adresse valide.";
  }
  const local = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) {
    return "L'adresse doit commencer par https://. HTTP n'est accepté que pour un miroir sur la boucle locale.";
  }
  if (url.username || url.password) return "L'adresse ne doit porter ni identifiant ni mot de passe.";
  return null;
}

export async function charger() {
  if (courant) return courant;
  let enregistre = {};
  try {
    enregistre = JSON.parse(await readFile(FICHIER, "utf8"));
  } catch (erreur) {
    if (erreur.code !== "ENOENT") throw erreur;
  }
  courant = defauts();
  for (const d of DESCRIPTION) {
    if (Object.hasOwn(enregistre, d.cle) && d.verifier(enregistre[d.cle]) === null) courant[d.cle] = enregistre[d.cle];
  }
  if (typeof enregistre.cle === "string" && enregistre.cle.length <= 200) courant.cle = enregistre.cle;
  const a = enregistre.attestation;
  if (a && typeof a === "object") {
    courant.attestation = {
      droits: a.droits === true,
      auteur: typeof a.auteur === "string" ? a.auteur.slice(0, 60) : "",
      date: typeof a.date === "string" ? a.date : null,
      note: typeof a.note === "string" ? a.note.slice(0, 240) : ""
    };
  }
  return courant;
}

/** Réglages sans le secret. `cle` est remplacée par son état et son extrait. */
export function valeurs() {
  const { cle, ...reste } = courant ?? defauts();
  return { ...reste, clePresente: Boolean(cle), cleExtrait: cle ? masquer(cle) : null };
}

export function masquer(cle) {
  if (!cle) return null;
  if (cle.length <= 8) return "…";
  return `${cle.slice(0, 5)}…${cle.slice(-3)}`;
}

export async function modifier(changements = {}, options = {}) {
  await charger();
  const acceptes = {};
  const refuses = {};
  for (const [cle, v] of Object.entries(changements)) {
    if (cle === "cle") {
      if (typeof v !== "string") {
        refuses.cle = "La clé est attendue sous forme de texte.";
        continue;
      }
      if (v.trim().length === 0) {
        acceptes.cle = "";
        continue;
      }
      if (v.trim().length < 8 || v.trim().length > 200) {
        refuses.cle = "La clé doit compter de 8 à 200 caractères.";
        continue;
      }
      acceptes.cle = v.trim();
      continue;
    }
    const d = DESCRIPTION.find((x) => x.cle === cle);
    if (!d) {
      refuses[cle] = "Ce réglage de lecture n'existe pas.";
      continue;
    }
    const probleme = d.verifier(v);
    if (probleme) {
      refuses[cle] = probleme;
      continue;
    }
    acceptes[cle] = typeof v === "string" ? v.trim() : v;
  }

  const suite = { ...courant, ...acceptes };
  if (acceptes.fournisseur_actif === true) {
    const blocage = blocageActivation(suite);
    if (blocage) {
      refuses.fournisseur_actif = blocage;
      delete acceptes.fournisseur_actif;
    }
  }
  if (Object.keys(refuses).length) return { acceptes: {}, refuses, applique: false };
  courant = { ...courant, ...acceptes };
  if (options.persister !== false && PERSISTER) await ecrireAtomique(FICHIER, courant);
  return { acceptes, refuses, applique: true };
}

/** Ce qui empêche d'ouvrir un flux tiers. Le message dit quoi faire. */
export function blocageActivation(etat) {
  if (!etat.attestation?.droits) {
    return "Attestez d'abord que vous avez le droit de diffuser ces flux : la case et votre nom sont exigés.";
  }
  if (!etat.cle) return "Renseignez la clé du fournisseur avant d'activer sa lecture.";
  const base = verifierBase(etat.fournisseur_base);
  if (base) return base;
  const modele = DESCRIPTION.find((d) => d.cle === "fournisseur_modele").verifier(etat.fournisseur_modele);
  if (modele) return modele;
  return null;
}

/**
 * Enregistre l'attestation de droits : qui l'affirme, quand, et sur quoi.
 * Sans nom, elle est refusée : une case cochée seule ne dit rien à personne.
 */
export async function attester({ droits, auteur, note = "" }, options = {}) {
  await charger();
  if (typeof auteur !== "string" || auteur.trim().length < 2) {
    return { ok: false, message: "Indiquez votre nom : une attestation anonyme ne vaut rien." };
  }
  if (auteur.trim().length > 60) return { ok: false, message: "Le nom ne peut pas dépasser 60 caractères." };
  if (typeof droits !== "boolean") return { ok: false, message: "La case des droits vaut vrai ou faux." };
  courant.attestation = {
    droits,
    auteur: auteur.trim(),
    date: new Date().toISOString(),
    note: typeof note === "string" ? note.trim().slice(0, 240) : ""
  };
  if (!droits && courant.fournisseur_actif) courant.fournisseur_actif = false;
  if (options.persister !== false && PERSISTER) await ecrireAtomique(FICHIER, courant);
  return { ok: true, attestation: { ...courant.attestation } };
}

/**
 * Construit l'adresse du cadre pour un film. Renvoie `disponible: false` avec
 * une raison en français quand la lecture tierce n'est pas ouverte : la fiche
 * sait alors qu'elle doit lire le fichier du catalogue.
 */
export async function lienFilm({ tmdbId, progress = 0 } = {}) {
  await charger();
  if (!courant.fournisseur_actif) return { disponible: false, raison: "La lecture par fournisseur tiers est fermée." };
  const blocage = blocageActivation(courant);
  if (blocage) return { disponible: false, raison: blocage };
  if (!Number.isInteger(tmdbId) || tmdbId <= 0) {
    return { disponible: false, raison: "Ce film n'a pas d'identifiant TMDb : le fournisseur ne peut pas le servir." };
  }
  const url = construire(tmdbId, progress);
  if (!url) return { disponible: false, raison: "L'adresse du fournisseur est incohérente : vérifiez son adresse et son chemin." };
  return {
    disponible: true,
    url,
    fournisseur: courant.fournisseur_nom,
    attribution: ATTRIBUTION,
    cleDansUrl: courant.fournisseur_modele.includes("{cle}")
  };
}

/** Remplacement des jetons, puis vérification stricte de l'adresse obtenue. */
export function construire(tmdbId, progress = 0) {
  const base = verifierBase(courant.fournisseur_base);
  if (base) return null;
  const chemin = courant.fournisseur_modele.replaceAll("{tmdbId}", String(tmdbId)).replaceAll("{cle}", encodeURIComponent(courant.cle));
  let url;
  try {
    url = new URL(chemin, courant.fournisseur_base);
  } catch {
    return null;
  }
  const origine = new URL(courant.fournisseur_base);
  if (url.protocol !== origine.protocol || url.hostname !== origine.hostname) return null;
  if (origine.protocol === "https:" && url.protocol !== "https:") return null;
  const position = Number.isInteger(progress) && progress > 0 ? Math.min(progress, 24 * 3600) : 0;
  if (position) url.searchParams.set("progress", String(position));
  return url.toString();
}

export async function statut() {
  await charger();
  const { cle, ...reste } = courant;
  const blocage = blocageActivation(courant);
  return {
    ...reste,
    clePresente: Boolean(cle),
    cleExtrait: cle ? masquer(cle) : null,
    atteste: courant.attestation.droits === true,
    blocage,
    attribution: ATTRIBUTION,
    avertissements: [
      "La clé apparaît dans l'adresse du cadre : elle est donc visible depuis le navigateur du visiteur.",
      "Le fournisseur peut imposer un domaine : un cadre servi depuis un autre domaine peut rester vide.",
      "Un flux tiers n'est pas un contenu du catalogue : sa disponibilité et ses droits ne sont pas garantis par le site."
    ]
  };
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
