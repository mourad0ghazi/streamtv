/**
 * Fiche TMDb d'un film : note de la communauté, durée officielle, genres et
 * résumé en français.
 *
 * Ce que ce module ne fait pas, volontairement :
 *   - il n'écrase jamais les données du catalogue (titre, synopsis, affiche) ;
 *     TMDb apporte un complément, affiché à part et attribué ;
 *   - il n'affiche pas les affiches TMDb : ce sont des visuels promotionnels,
 *     dont l'usage relève de leurs conditions, alors que nos affiches locales
 *     sont sous licence libre. La fiche garde donc son affiche d'origine ;
 *   - il n'invente rien : sans clé, sans réseau ou sans réponse exploitable, il
 *     dit pourquoi en français et l'interface n'ajoute aucun bloc.
 *
 * Les réponses sont mises en cache sur disque sept jours : une clé publique
 * partagée n'a pas à être sollicitée à chaque visite.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import * as cles from "./cles-films.js";

const DOSSIER_DONNEES = join(dirname(fileURLToPath(import.meta.url)), "..", "data");
export const CACHE = join(DOSSIER_DONNEES, "cache-films.json");

/**
 * Base de l'API. `TMDB_BASE` permet de la pointer ailleurs : un miroir, un
 * proxy d'entreprise, ou un serveur d'essai local pour éprouver toute la chaîne
 * sans dépendre du réseau. Par défaut, c'est bien TMDb.
 */
const BASE = (process.env.TMDB_BASE ?? "https://api.themoviedb.org/3").replace(/\/+$/, "");
const DUREE_CACHE_MS = 7 * 24 * 60 * 60 * 1000;
const DELAI_MS = 8000;
export const ATTRIBUTION = "Cette fiche utilise l'API TMDb. Ce produit n'est ni approuvé ni certifié par TMDb.";

let cache = null;
let ecriture = null;

async function chargerCache() {
  if (cache) return cache;
  try {
    cache = JSON.parse(await readFile(CACHE, "utf8"));
  } catch {
    cache = {};
  }
  if (!cache || typeof cache !== "object" || Array.isArray(cache)) cache = {};
  return cache;
}

async function enregistrerCache() {
  // Une seule écriture à la fois : deux fiches ouvertes ensemble ne doivent pas
  // se marcher dessus dans le fichier.
  if (ecriture) return ecriture;
  ecriture = (async () => {
    await mkdir(DOSSIER_DONNEES, { recursive: true });
    await writeFile(CACHE, JSON.stringify(cache, null, 1) + "\n", "utf8");
  })().finally(() => {
    ecriture = null;
  });
  return ecriture;
}

function cacheValide(entree) {
  if (!entree?.fiche) return false;
  const age = Date.now() - new Date(entree.releve ?? 0).getTime();
  return Number.isFinite(age) && age >= 0 && age < DUREE_CACHE_MS;
}

/** Nettoie et normalise ce que TMDb renvoie, sans rien compléter. */
export function normaliser(recherche, details, releve = new Date().toISOString()) {
  if (!details || typeof details !== "object" || !details.id) return null;
  const genres = Array.isArray(details.genres) ? details.genres.map((g) => g?.name).filter(Boolean) : [];
  const note = typeof details.vote_average === "number" && details.vote_count > 0 ? Math.round(details.vote_average * 10) / 10 : null;
  return {
    id: details.id,
    titre: details.title ?? recherche?.title ?? null,
    titreOriginal: details.original_title ?? null,
    annee: details.release_date ? Number(String(details.release_date).slice(0, 4)) : (recherche?.release_date ? Number(String(recherche.release_date).slice(0, 4)) : null),
    dureeMinutes: Number.isInteger(details.runtime) && details.runtime > 0 ? details.runtime : null,
    genres,
    note,
    votes: Number.isInteger(details.vote_count) ? details.vote_count : 0,
    resume: typeof details.overview === "string" && details.overview.trim() ? details.overview.trim() : null,
    langue: details.original_language ?? null,
    source: "TMDb",
    attribution: ATTRIBUTION,
    releve
  };
}

/**
 * Cherche puis détaille un film. `fetchImpl` est injectable : c'est ainsi que
 * les tests éprouvent la logique sans réseau.
 */
export async function interroger({ titre, annee }, { fetchImpl = globalThis.fetch, delai = DELAI_MS } = {}) {
  const total = await cles.nombre("tmdb");
  if (!total) {
    return {
      disponible: false,
      raison: "Aucune clé TMDb n'est configurée. Lancez `node scripts/obtenir-cles.mjs`, ou posez TMDB_API_KEY dans l'environnement."
    };
  }
  if (typeof fetchImpl !== "function") {
    return { disponible: false, raison: "Ce contexte n'a pas d'accès réseau : TMDb ne peut pas être interrogé." };
  }
  if (!titre) return { disponible: false, raison: "Ce film n'a pas de titre : TMDb ne peut pas être interrogé." };

  let dernierSouci = null;

  for (let tentative = 0; tentative < total; tentative += 1) {
    const apiKey = await cles.cleListe("tmdb", tentative);
    const controleur = new AbortController();
    const minuteur = setTimeout(() => controleur.abort(), delai);
    try {
      const recherche = await appeler(fetchImpl, `${BASE}/search/movie`, { api_key: apiKey, query: titre, year: annee ? String(annee) : "", language: "fr-FR" }, controleur.signal);
      const premier = Array.isArray(recherche?.results) ? recherche.results[0] : null;
      if (!premier?.id) {
        return { disponible: false, raison: `TMDb ne connaît pas « ${titre} ». La fiche du catalogue reste la seule source.` };
      }
      const details = await appeler(fetchImpl, `${BASE}/movie/${premier.id}`, { api_key: apiKey, language: "fr-FR" }, controleur.signal);
      const fiche = normaliser(premier, details);
      if (!fiche) return { disponible: false, raison: "TMDb a répondu, mais sans fiche exploitable." };
      return { disponible: true, fiche };
    } catch (erreur) {
      // Clé refusée ou quota épuisé : on passe à la suivante.
      if (erreur.code === 401 || erreur.code === 429) {
        dernierSouci = erreur.code === 401 ? "clé refusée" : "quota épuisé";
        continue;
      }
      if (erreur.name === "AbortError") {
        return { disponible: false, raison: `TMDb n'a pas répondu en ${Math.round(delai / 1000)} secondes. La fiche du catalogue reste affichée.` };
      }
      return { disponible: false, raison: "TMDb est injoignable depuis ce serveur. Vérifiez la connexion, puis réessayez." };
    } finally {
      clearTimeout(minuteur);
    }
  }

  return {
    disponible: false,
    raison: `Les ${total} clés TMDb ont été refusées (${dernierSouci ?? "refus"}). Ces clés publiques sont partagées : créez la vôtre et posez-la dans TMDB_API_KEY.`
  };
}

async function appeler(fetchImpl, url, parametres, signal) {
  const adresse = new URL(url);
  for (const [cle, valeur] of Object.entries(parametres)) {
    if (valeur !== "" && valeur !== null && valeur !== undefined) adresse.searchParams.set(cle, String(valeur));
  }
  const reponse = await fetchImpl(adresse.toString(), { signal, headers: { accept: "application/json" } });
  if (reponse.status === 401 || reponse.status === 429) {
    const erreur = new Error(`TMDb a répondu ${reponse.status}`);
    erreur.code = reponse.status;
    throw erreur;
  }
  if (!reponse.ok) throw new Error(`TMDb a répondu ${reponse.status}`);
  return reponse.json();
}

/** Fiche d'un film, depuis le cache si elle est fraîche. */
export async function ficheFilm(film, options = {}) {
  const id = film?.id;
  if (!id) return { disponible: false, raison: "Film sans identifiant." };

  const memoire = await chargerCache();
  if (cacheValide(memoire[id])) return { disponible: true, fiche: memoire[id].fiche, cache: true };

  const resultat = await interroger({ titre: film.titre, annee: film.annee }, options);
  if (resultat.disponible) {
    memoire[id] = { releve: resultat.fiche.releve, fiche: resultat.fiche };
    await enregistrerCache();
  }
  return resultat;
}

/** Nombre de fiches en cache et date du relevé le plus récent. */
export async function etatCache() {
  const memoire = await chargerCache();
  const dates = Object.values(memoire)
    .map((e) => e?.releve)
    .filter(Boolean)
    .sort();
  return { entrees: Object.keys(memoire).length, dernier: dates.at(-1) ?? null };
}

/** Réservé aux tests : vide le cache mémoire sans toucher au fichier. */
export function oublierCache() {
  cache = null;
}
