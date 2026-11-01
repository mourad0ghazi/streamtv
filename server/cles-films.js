/**
 * Clés d'API des films : TMDb pour les fiches, OMDb en secours.
 *
 * Ordre de priorité, du plus sûr au plus fragile :
 *   1. une variable d'environnement (`TMDB_API_KEY`, `OMDB_API_KEY`) : la clé
 *      personnelle du porteur, celle qui ne dépend de personne ;
 *   2. `data/cles-api.json`, produit par `node scripts/obtenir-cles.mjs` à
 *      partir du paquet de développement `freekeys`.
 *
 * Le site n'importe jamais `freekeys` à l'exécution : c'est un outil de mise en
 * place. Les clés publiques qu'il fournit sont partagées, donc limitées en débit
 * et révocables ; d'où la rotation, et l'envie de passer à une clé personnelle.
 */

import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const DOSSIER_DONNEES = join(dirname(fileURLToPath(import.meta.url)), "..", "data");
export const FICHIER = join(DOSSIER_DONNEES, "cles-api.json");

let charge = null;

const depuisEnvironnement = () => ({
  tmdb: (process.env.TMDB_API_KEY ?? "").trim(),
  omdb: (process.env.OMDB_API_KEY ?? "").trim()
});

async function lireFichier() {
  try {
    const bloc = JSON.parse(await readFile(FICHIER, "utf8"));
    return {
      tmdb: (Array.isArray(bloc.tmdb) ? bloc.tmdb : []).filter((c) => typeof c === "string" && c.length >= 8),
      omdb: (Array.isArray(bloc.omdb) ? bloc.omdb : []).filter((c) => typeof c === "string" && c.length >= 6),
      origine: bloc.origine ?? "fichier local",
      avertissement: bloc.avertissement ?? "",
      date: bloc.date ?? null
    };
  } catch {
    return { tmdb: [], omdb: [], origine: null, avertissement: "", date: null };
  }
}

/** Charge une fois les clés, environnement d'abord. */
export async function charger() {
  if (charge) return charge;
  const fichier = await lireFichier();
  const env = depuisEnvironnement();
  charge = {
    tmdb: [...new Set([env.tmdb, ...fichier.tmdb].filter(Boolean))],
    omdb: [...new Set([env.omdb, ...fichier.omdb].filter(Boolean))],
    personnelle: Boolean(env.tmdb || env.omdb),
    origine: env.tmdb || env.omdb ? "variable d'environnement" : fichier.origine,
    avertissement: fichier.avertissement,
    date: fichier.date
  };
  return charge;
}

/** État des clés, sans jamais révéler leur valeur. */
export async function statut() {
  const cles = await charger();
  return {
    tmdb: cles.tmdb.length,
    omdb: cles.omdb.length,
    disponible: cles.tmdb.length > 0,
    personnelle: cles.personnelle,
    origine: cles.origine,
    date: cles.date,
    avertissement: cles.avertissement,
    fichier: FICHIER
  };
}

/**
 * Renvoie la clé à essayer. `position` permet de passer à la suivante quand
 * TMDb répond 401 (clé révoquée) ou 429 (quota de la clé partagée épuisé).
 */
export async function cleListe(service = "tmdb", position = 0) {
  const cles = await charger();
  const liste = cles[service] ?? [];
  if (!liste.length) return null;
  return liste[position % liste.length];
}

/** Nombre de clés disponibles pour un service. */
export async function nombre(service = "tmdb") {
  const cles = await charger();
  return (cles[service] ?? []).length;
}

/** Réservé aux tests. */
export function reinitialiser() {
  charge = null;
}
