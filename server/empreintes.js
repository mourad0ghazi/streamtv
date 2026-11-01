/**
 * Empreintes de mots de passe, en un seul endroit.
 *
 * scrypt pour les mots de passe, SHA-256 pour les jetons : deux besoins, deux
 * fonctions, aucune dépendance. Le module est séparé pour que `auth.js` et
 * `comptes.js` partagent exactement le même algorithme, sans s'importer l'un
 * l'autre.
 */

import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export function nouveauSel() {
  return randomBytes(16).toString("hex");
}

export function hacher(motDePasse, sel) {
  return scryptSync(String(motDePasse), String(sel), 64).toString("hex");
}

/** Comparaison à temps constant : la durée ne dépend pas du préfixe commun. */
export function comparer(empreinteA, empreinteB) {
  const a = Buffer.from(String(empreinteA));
  const b = Buffer.from(String(empreinteB));
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function empreinte(valeur) {
  return createHash("sha256").update(String(valeur)).digest("hex");
}

export function jeton() {
  return randomBytes(32).toString("hex");
}
