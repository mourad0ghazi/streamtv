/**
 * Sondes de sources.
 *
 * Une sonde mesure la joignabilité, le temps de réponse et le taux d'échec.
 * Elle informe l'administrateur ; elle ne désactive jamais une source à sa
 * place : c'est une décision humaine, prise dans la console.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { DOSSIER_DONNEES, ecrireAtomique } from "./magasin.js";

export const FICHIER = join(DOSSIER_DONNEES, "sondes.json");
const HISTORIQUE = 10;
const SEUIL_LENT_MS = 2500;

let mesures = null;

async function charger() {
  if (mesures) return mesures;
  try {
    const bloc = JSON.parse(await readFile(FICHIER, "utf8"));
    mesures = bloc.sources ?? {};
  } catch (erreur) {
    if (erreur.code !== "ENOENT") throw erreur;
    mesures = {};
  }
  return mesures;
}

/** Sonde une adresse : renvoie {ok, ms, erreur}. */
export async function sonder(url, options = {}) {
  const recuperer = options.recuperer ?? recupererParDefaut;
  const delai = options.delai ?? 8000;
  const debut = Date.now();
  try {
    await recuperer(url, delai);
    return { ok: true, ms: Date.now() - debut, erreur: null };
  } catch (erreur) {
    return { ok: false, ms: Date.now() - debut, erreur: erreur?.message ?? "échec" };
  }
}

async function recupererParDefaut(url, delai) {
  const controleur = new AbortController();
  const minuteur = setTimeout(() => controleur.abort(), delai);
  try {
    const reponse = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controleur.signal,
      headers: { "user-agent": "StreamTV-sonde/3.18" }
    });
    if (!reponse.ok) throw new Error(`réponse ${reponse.status}`);
    return await reponse.text();
  } finally {
    clearTimeout(minuteur);
  }
}

/**
 * Déduit l'état affiché à partir de l'historique des mesures.
 * saine : aucun échec et réponse rapide.
 * instable : quelques échecs, ou réponse lente.
 * hors service : la dernière mesure a échoué, ou la moitié au moins du lot.
 */
export function etatDepuis(historique) {
  const lot = Array.isArray(historique) ? historique.filter((m) => typeof m?.ok === "boolean") : [];
  if (!lot.length) return { etat: "inconnu", tauxEchec: null, dernierMs: null };
  const echecs = lot.filter((m) => !m.ok).length;
  const tauxEchec = echecs / lot.length;
  const dernier = lot[lot.length - 1];
  const dernierMs = dernier.ms ?? null;
  if (!dernier.ok || tauxEchec >= 0.5) return { etat: "hors-service", tauxEchec, dernierMs };
  if (echecs > 0 || (dernierMs ?? 0) > SEUIL_LENT_MS) return { etat: "instable", tauxEchec, dernierMs };
  return { etat: "saine", tauxEchec, dernierMs };
}

/** Sonde une source et enregistre la mesure. */
export async function sonderSource(source, options = {}) {
  await charger();
  const resultat = await sonder(source.url, options);
  const historique = mesures[source.id] ?? [];
  historique.push({ date: new Date().toISOString(), ok: resultat.ok, ms: resultat.ms, erreur: resultat.erreur });
  mesures[source.id] = historique.slice(-HISTORIQUE);
  const etat = etatDepuis(mesures[source.id]);
  return { id: source.id, ...resultat, ...etat };
}

/** Sonde toutes les sources données, puis enregistre le fichier. */
export async function sonderTout(sources, options = {}) {
  await charger();
  const resultats = [];
  for (const source of sources) {
    resultats.push(await sonderSource(source, options));
  }
  await ecrireAtomique(FICHIER, { version: 1, date: new Date().toISOString(), sources: mesures });
  return resultats;
}

/** État mémorisé de chaque source, sans nouvelle mesure. */
export async function etats() {
  await charger();
  return Object.fromEntries(
    Object.entries(mesures).map(([id, historique]) => {
      const dernier = historique[historique.length - 1] ?? null;
      return [id, { ...etatDepuis(historique), date: dernier?.date ?? null }];
    })
  );
}

/** Réservé aux tests. */
export function reinitialiser() {
  mesures = null;
}
