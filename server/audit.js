/**
 * Journal d'audit.
 *
 * Chaque action sensible reçoit un code stable, documenté dans
 * docs/ADMINISTRATION.md. Un code publié ne change jamais de sens et ne se
 * renumérote jamais ; la documentation s'y réfère.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { DOSSIER_DONNEES, ecrireAtomique } from "./magasin.js";

export const FICHIER = join(DOSSIER_DONNEES, "audit.json");

/** Catalogue des codes. Il fait foi pour le code comme pour la documentation. */
export const CODES = {
  A01: "Connexion réussie à la console",
  A02: "Échec de connexion à la console",
  A10: "Activation ou désactivation d'une source",
  A11: "Modification de la licence d'une source",
  A12: "Import manuel déclenché, avec son résultat",
  A20: "Modification d'un réglage, avec ancienne et nouvelle valeur",
  A30: "Retrait automatique d'un contenu au plafond de signalements",
  A40: "Création ou modification d'un rôle et de ses permissions"
};

const TAILLE_MAX = 500;
let entrees = null;

async function charger() {
  if (entrees) return entrees;
  try {
    const bloc = JSON.parse(await readFile(FICHIER, "utf8"));
    entrees = Array.isArray(bloc.entrees) ? bloc.entrees : [];
  } catch (erreur) {
    if (erreur.code !== "ENOENT") throw erreur;
    entrees = [];
  }
  return entrees;
}

/**
 * Ajoute une entrée. `auteur` est le nom du rôle connecté ; aucune donnée
 * personnelle de visiteur n'entre ici, les visiteurs n'ont pas de compte.
 */
export async function journaliser(code, detail, auteur = "systeme") {
  if (!CODES[code]) throw new Error(`Code d'audit inconnu : ${code}`);
  await charger();
  entrees.push({
    code,
    action: CODES[code],
    date: new Date().toISOString(),
    auteur,
    detail: detail ?? {}
  });
  if (entrees.length > TAILLE_MAX) entrees = entrees.slice(entrees.length - TAILLE_MAX);
  await ecrireAtomique(FICHIER, { version: 1, entrees });
  return entrees[entrees.length - 1];
}

/** Les dernières entrées, la plus récente en tête. */
export async function lire(limite = 100) {
  await charger();
  return [...entrees].reverse().slice(0, Math.max(1, limite));
}

/** Réservé aux tests : vide le journal en mémoire. */
export function reinitialiser() {
  entrees = null;
}
