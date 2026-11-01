/**
 * Comptes de la console : plusieurs personnes, un rôle chacune, des
 * permissions qui se donnent et se retirent à l'unité.
 *
 * Le propriétaire n'est pas un compte comme les autres : c'est le mot de passe
 * unique de `data/secret.json`, celui qui existait avant les comptes. Il garde
 * toutes les permissions et ne peut être ni supprimé ni désactivé. Les autres
 * comptes vivent dans `data/comptes.json`, jamais versionné, avec un sel et une
 * empreinte scrypt, jamais le mot de passe.
 *
 * Aucune fonction ne renvoie un hash : la console ne peut pas les afficher.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { DOSSIER_DONNEES, ecrireAtomique } from "./magasin.js";
import { creerSuivi } from "./suivi-fichier.js";
import * as permissions from "./permissions.js";
import { comparer, hacher, nouveauSel } from "./empreintes.js";

export const FICHIER = join(DOSSIER_DONNEES, "comptes.json");
const PERSISTER = process.env.STREAMTV_TESTS !== "1";
const PLAFOND_COMPTES = 50;

let etat = null;
const aChange = creerSuivi(FICHIER);

export const PROPRIETAIRE = Object.freeze({
  id: "proprietaire",
  identifiant: "proprietaire",
  nom: "Propriétaire de la console",
  role: "proprietaire",
  actif: true,
  virtuel: true,
  accorde: [],
  refuse: [],
  cree: null,
  connexion: null
});

function normaliserIdentifiant(valeur) {
  return String(valeur ?? "").trim().toLowerCase();
}

function propre(compte) {
  const { sel, hash, ...reste } = compte;
  return {
    ...reste,
    permissions: permissions.effectives(compte)
  };
}

/** Charge le fichier ; un fichier absent donne une liste vide, pas une erreur. */
export async function charger() {
  if (etat) return etat;
  try {
    const bloc = JSON.parse(await readFile(FICHIER, "utf8"));
    etat = { version: 1, comptes: Array.isArray(bloc.comptes) ? bloc.comptes : [] };
  } catch (erreur) {
    if (erreur.code !== "ENOENT") throw erreur;
    etat = { version: 1, comptes: [] };
  }
  return etat;
}

async function enregistrer() {
  if (PERSISTER) await ecrireAtomique(FICHIER, etat);
}

/** Liste sans secret, propriétaire en tête. */
export async function lister() {
  await rafraichir();
  return [
    { ...PROPRIETAIRE, permissions: permissions.permissionsRole("proprietaire") },
    ...etat.comptes.map(propre)
  ];
}

export async function parId(id) {
  await charger();
  if (id === "proprietaire") return { ...PROPRIETAIRE, permissions: permissions.permissionsRole("proprietaire") };
  const compte = etat.comptes.find((c) => c.id === id);
  return compte ? propre(compte) : null;
}

/** Le compte complet, avec sel et hash : usage interne au serveur seulement. */
async function brut(identifiant) {
  await charger();
  return etat.comptes.find((c) => c.identifiant === normaliserIdentifiant(identifiant)) ?? null;
}

function verifierCommun({ identifiant, nom, role, motDePasse, obligatoire }) {
  if (!/^[a-z0-9-]{3,24}$/.test(normaliserIdentifiant(identifiant))) {
    return "L'identifiant doit compter de 3 à 24 caractères parmi a-z, 0-9 et tiret.";
  }
  if (typeof nom !== "string" || nom.trim().length < 2 || nom.trim().length > 60) {
    return "Le nom doit compter de 2 à 60 caractères.";
  }
  if (!permissions.roleConnu(role)) return "Ce rôle n'existe pas.";
  if (role === "proprietaire") {
    return "Le rôle propriétaire est réservé au mot de passe de la console : il ne se crée pas.";
  }
  if (obligatoire || motDePasse !== undefined) {
    if (typeof motDePasse !== "string" || motDePasse.length < 10) {
      return "Le mot de passe doit compter au moins 10 caractères.";
    }
    if (motDePasse.length > 200) return "Le mot de passe ne peut pas dépasser 200 caractères.";
  }
  return null;
}

function verifierSurcharges(accorde, refuse) {
  for (const [nom, liste] of [["accordées", accorde], ["refusées", refuse]]) {
    if (!Array.isArray(liste)) return `La liste des permissions ${nom} est attendue.`;
    const inconnues = liste.filter((cle) => !permissions.permissionConnue(cle));
    if (inconnues.length) return `Permission inconnue : ${inconnues.join(", ")}.`;
  }
  return null;
}

/** Crée un compte. Refuse les doublons, les rôles inconnus et les secrets courts. */
export async function creer({ identifiant, nom, role, motDePasse, accorde = [], refuse = [] }) {
  await charger();
  if (etat.comptes.length >= PLAFOND_COMPTES) {
    return { ok: false, message: `Le plafond de ${PLAFOND_COMPTES} comptes est atteint.` };
  }
  const probleme = verifierCommun({ identifiant, nom, role, motDePasse, obligatoire: true });
  if (probleme) return { ok: false, message: probleme };
  const surcharges = verifierSurcharges(accorde, refuse);
  if (surcharges) return { ok: false, message: surcharges };
  if (await brut(identifiant)) return { ok: false, message: "Cet identifiant est déjà pris." };

  const sel = nouveauSel();
  const compte = {
    id: `cpt-${randomBytes(4).toString("hex")}`,
    identifiant: normaliserIdentifiant(identifiant),
    nom: nom.trim(),
    role,
    accorde: [...new Set(accorde)],
    refuse: [...new Set(refuse)],
    sel,
    hash: hacher(motDePasse, sel),
    actif: true,
    cree: new Date().toISOString(),
    connexion: null
  };
  etat.comptes.push(compte);
  await enregistrer();
  return { ok: true, compte: propre(compte) };
}

/** Modifie un compte existant. Aucun champ absent ne change. */
export async function modifier(id, changements = {}) {
  await charger();
  const compte = etat.comptes.find((c) => c.id === id);
  if (!compte) return { ok: false, message: "Ce compte n'existe pas." };

  if (changements.nom !== undefined || changements.role !== undefined) {
    const probleme = verifierCommun({
      identifiant: compte.identifiant,
      nom: changements.nom ?? compte.nom,
      role: changements.role ?? compte.role,
      obligatoire: false
    });
    if (probleme) return { ok: false, message: probleme };
  }
  if (changements.motDePasse !== undefined) {
    if (typeof changements.motDePasse !== "string" || changements.motDePasse.length < 10) {
      return { ok: false, message: "Le mot de passe doit compter au moins 10 caractères." };
    }
  }
  if (changements.accorde !== undefined || changements.refuse !== undefined) {
    const surcharges = verifierSurcharges(changements.accorde ?? compte.accorde, changements.refuse ?? compte.refuse);
    if (surcharges) return { ok: false, message: surcharges };
    if (changements.accorde) compte.accorde = [...new Set(changements.accorde)];
    if (changements.refuse) compte.refuse = [...new Set(changements.refuse)];
  }
  if (changements.actif !== undefined) {
    if (typeof changements.actif !== "boolean") return { ok: false, message: "Le champ actif attend vrai ou faux." };
    compte.actif = changements.actif;
  }
  if (changements.nom !== undefined) compte.nom = changements.nom.trim();
  if (changements.role !== undefined) compte.role = changements.role;
  if (changements.motDePasse !== undefined) {
    compte.sel = nouveauSel();
    compte.hash = hacher(changements.motDePasse, compte.sel);
  }
  compte.modifie = new Date().toISOString();
  await enregistrer();
  return { ok: true, compte: propre(compte) };
}

export async function supprimer(id) {
  await charger();
  if (id === "proprietaire") {
    return { ok: false, message: "Le propriétaire ne se supprime pas : c'est le mot de passe de la console." };
  }
  const avant = etat.comptes.length;
  etat.comptes = etat.comptes.filter((c) => c.id !== id);
  if (etat.comptes.length === avant) return { ok: false, message: "Ce compte n'existe pas." };
  await enregistrer();
  return { ok: true };
}

/**
 * Vérifie un couple identifiant / mot de passe. Un compte désactivé est refusé
 * même avec le bon mot de passe, et le message ne dit pas lequel des deux est
 * faux : ce serait une aide pour deviner les identifiants.
 */
export async function verifier({ identifiant, motDePasse }) {
  await rafraichir();
  const compte = await brut(identifiant);
  if (!compte) return { ok: false, raison: "identifiants" };
  if (!comparer(hacher(String(motDePasse ?? ""), compte.sel), compte.hash)) {
    return { ok: false, raison: "identifiants" };
  }
  if (compte.actif === false) return { ok: false, raison: "desactive" };
  compte.connexion = new Date().toISOString();
  await enregistrer();
  return { ok: true, compte: propre(compte) };
}

/** Recharge le fichier si un autre processus l'a écrit. */
export async function rafraichir() {
  // En test, l'état vit en mémoire et n'est jamais écrit : relire le fichier
  // ramènerait les valeurs de l'installation, pas celles du test.
  if (process.env.STREAMTV_TESTS === "1") return charger();
  if (await aChange()) etat = null;
  return charger();
}

export function reinitialiser() {
  etat = null;
}
