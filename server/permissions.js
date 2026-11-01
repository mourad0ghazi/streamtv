/**
 * Permissions de la console : une liste fermée, des rôles nommés, et des
 * surcharges par compte.
 *
 * Trois niveaux, dans cet ordre : le rôle donne un socle, `accorde` ajoute une
 * permission précise, `refuse` en retire une. Le serveur ne se fie jamais à
 * l'interface : il recalcule les permissions effectives à chaque requête.
 *
 * Le fichier `data/permissions.json` peut changer le socle d'un rôle. Deux
 * garde-fous empêchent de se verrouiller dehors : le propriétaire garde
 * toujours tout, et `utilisateurs.ecrire` ne peut pas sortir du rôle
 * administrateur.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { DOSSIER_DONNEES, ecrireAtomique } from "./magasin.js";

export const FICHIER = join(DOSSIER_DONNEES, "permissions.json");
const PERSISTER = process.env.STREAMTV_TESTS !== "1";

/** Catalogue des permissions. `groupe` sert à ranger la matrice dans la console. */
export const PERMISSIONS = [
  { cle: "tableau.lire", libelle: "Voir le tableau de bord", groupe: "Pilotage" },
  { cle: "catalogue.lire", libelle: "Consulter le catalogue", groupe: "Catalogue" },
  { cle: "catalogue.ecrire", libelle: "Modifier une fiche du catalogue", groupe: "Catalogue" },
  { cle: "catalogue.publier", libelle: "Publier la version statique", groupe: "Catalogue" },
  { cle: "sources.lire", libelle: "Consulter les sources", groupe: "Sources et import" },
  { cle: "sources.ecrire", libelle: "Modifier une source et sa licence", groupe: "Sources et import" },
  { cle: "import.lancer", libelle: "Lancer un import", groupe: "Sources et import" },
  { cle: "lecture.lire", libelle: "Consulter la configuration de lecture", groupe: "Lecture" },
  { cle: "lecture.ecrire", libelle: "Configurer le fournisseur et le lecteur", groupe: "Lecture" },
  { cle: "affichage.lire", libelle: "Consulter l'apparence", groupe: "Apparence et accueil" },
  { cle: "affichage.ecrire", libelle: "Changer l'apparence du site", groupe: "Apparence et accueil" },
  { cle: "accueil.lire", libelle: "Consulter la composition de l'accueil", groupe: "Apparence et accueil" },
  { cle: "accueil.ecrire", libelle: "Composer l'accueil", groupe: "Apparence et accueil" },
  { cle: "utilisateurs.lire", libelle: "Voir les comptes", groupe: "Utilisateurs" },
  { cle: "utilisateurs.ecrire", libelle: "Créer, modifier et supprimer un compte", groupe: "Utilisateurs" },
  { cle: "roles.ecrire", libelle: "Changer les permissions d'un rôle", groupe: "Utilisateurs" },
  { cle: "reglages.lire", libelle: "Consulter les réglages", groupe: "Exploitation" },
  { cle: "reglages.ecrire", libelle: "Changer les réglages", groupe: "Exploitation" },
  { cle: "audit.lire", libelle: "Lire le journal d'audit", groupe: "Exploitation" },
  { cle: "statistiques.lire", libelle: "Voir les statistiques", groupe: "Exploitation" },
  { cle: "incidents.lire", libelle: "Voir les incidents remontés par les visiteurs", groupe: "Exploitation" },
  { cle: "ia.utiliser", libelle: "Interroger l'assistant et appliquer ses corrections", groupe: "Exploitation" }
];

export const GROUPES = ["Pilotage", "Catalogue", "Sources et import", "Lecture", "Apparence et accueil", "Utilisateurs", "Exploitation"];

const TOUTES = PERMISSIONS.map((p) => p.cle);

/**
 * Socles par rôle. Le propriétaire n'a pas de liste : il a tout, toujours, et
 * le fichier de surcharges ne peut rien lui retirer.
 */
export const ROLES = {
  proprietaire: {
    libelle: "Propriétaire",
    resume: "Tout, sans exception. Seul rôle qui change les permissions des autres rôles.",
    permissions: TOUTES
  },
  administrateur: {
    libelle: "Administrateur",
    resume: "Toute l'exploitation du site, y compris les comptes.",
    permissions: TOUTES.filter((cle) => cle !== "roles.ecrire")
  },
  editeur: {
    libelle: "Éditeur",
    resume: "Le catalogue, l'accueil et l'apparence, sans toucher aux comptes.",
    permissions: [
      "tableau.lire", "catalogue.lire", "catalogue.ecrire", "catalogue.publier",
      "sources.lire", "lecture.lire", "affichage.lire", "affichage.ecrire",
      "accueil.lire", "accueil.ecrire", "audit.lire", "statistiques.lire",
      "incidents.lire", "ia.utiliser"
    ]
  },
  moderateur: {
    libelle: "Modérateur",
    resume: "Les sources, leur licence, et le suivi des incidents.",
    permissions: [
      "tableau.lire", "catalogue.lire", "catalogue.ecrire", "sources.lire",
      "sources.ecrire", "import.lancer", "audit.lire", "statistiques.lire",
      "incidents.lire"
    ]
  },
  analyste: {
    libelle: "Analyste",
    resume: "Lecture seule : chiffres, journal, incidents, diagnostic.",
    permissions: [
      "tableau.lire", "catalogue.lire", "sources.lire", "lecture.lire",
      "affichage.lire", "accueil.lire", "reglages.lire", "audit.lire",
      "statistiques.lire", "incidents.lire", "ia.utiliser"
    ]
  },
  lecteur: {
    libelle: "Lecteur",
    resume: "Le minimum : les sources, les réglages, le journal et les chiffres.",
    permissions: ["sources.lire", "reglages.lire", "audit.lire", "statistiques.lire"]
  }
};

/** Socle effectif après surcharges écrites par le propriétaire. */
let surcharges = {};

export function permissionsConnues() {
  return [...TOUTES];
}

export function permissionConnue(cle) {
  return TOUTES.includes(cle);
}

export function roleConnu(role) {
  return Object.hasOwn(ROLES, role);
}

export function listeRoles() {
  return Object.entries(ROLES).map(([cle, role]) => ({
    cle,
    libelle: role.libelle,
    resume: role.resume,
    permissions: permissionsRole(cle)
  }));
}

/** Socle d'un rôle, surcharges comprises. Le propriétaire garde tout. */
export function permissionsRole(role) {
  if (role === "proprietaire") return [...TOUTES];
  if (!roleConnu(role)) return [];
  const socle = surcharges[role] ?? ROLES[role].permissions;
  return socle.filter((cle) => TOUTES.includes(cle));
}

/** Permissions effectives d'un compte : socle, ajouts, retraits. */
export function effectives({ role, accorde = [], refuse = [] } = {}) {
  if (role === "proprietaire") return [...TOUTES];
  const ensemble = new Set(permissionsRole(role));
  for (const cle of accorde) if (TOUTES.includes(cle)) ensemble.add(cle);
  for (const cle of refuse) ensemble.delete(cle);
  return [...ensemble];
}

export function autorise(compte, cle) {
  if (!compte) return false;
  if (!TOUTES.includes(cle)) return false;
  return effectives(compte).includes(cle);
}

/** Charge les surcharges de rôles. Un fichier illisible est ignoré, pas fatal. */
export async function charger() {
  try {
    const bloc = JSON.parse(await readFile(FICHIER, "utf8"));
    const brut = bloc?.roles ?? {};
    surcharges = {};
    for (const [role, liste] of Object.entries(brut)) {
      if (!roleConnu(role) || role === "proprietaire") continue;
      if (!Array.isArray(liste)) continue;
      surcharges[role] = liste.filter((cle) => TOUTES.includes(cle));
    }
  } catch (erreur) {
    if (erreur.code !== "ENOENT") throw erreur;
    surcharges = {};
  }
  return surcharges;
}

/**
 * Change le socle d'un rôle. Refus explicites : propriétaire verrouillé, et
 * `utilisateurs.ecrire` qui ne peut pas quitter l'administrateur, sans quoi
 * une manipulation malheureuse laisserait le site sans personne pour gérer
 * les comptes.
 */
export async function changerRole(role, permissions) {
  if (!roleConnu(role)) return { ok: false, message: "Ce rôle n'existe pas." };
  if (role === "proprietaire") {
    return { ok: false, message: "Le propriétaire garde toutes les permissions : elles ne se retirent pas." };
  }
  if (!Array.isArray(permissions)) {
    return { ok: false, message: "La liste des permissions est attendue." };
  }
  const inconnues = permissions.filter((cle) => !TOUTES.includes(cle));
  if (inconnues.length) {
    return { ok: false, message: `Permission inconnue : ${inconnues.join(", ")}.` };
  }
  if (role === "administrateur" && !permissions.includes("utilisateurs.ecrire")) {
    return { ok: false, message: "L'administrateur doit garder « utilisateurs.ecrire » : sinon, plus personne ne gère les comptes." };
  }
  surcharges[role] = [...new Set(permissions)];
  if (PERSISTER) await ecrireAtomique(FICHIER, { version: 1, roles: surcharges });
  return { ok: true, role, permissions: permissionsRole(role) };
}

/** Remet les socles par défaut ; réservé aux tests et à la réinitialisation. */
export function reinitialiser() {
  surcharges = {};
}
