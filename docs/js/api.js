/**
 * Appels au serveur. Chaque appel a un plafond d'attente et renvoie un message
 * français en cas d'échec : l'interface n'a jamais à deviner ce qui s'est passé.
 *
 * En démonstration statique (window.STREAMTV_STATIQUE), les mêmes routes sont
 * calculées sur place par le module partagé, à partir d'un instantané des
 * données. Un seul calcul de catalogue, deux façons de le servir.
 */

import * as catalogue from "./partage/catalogue.js";
import { avecBase } from "./partage/base.js";

const DELAI_MS = 12000;

/**
 * Jeton de session de la console, gardé hors des cookies.
 *
 * Un cookie `SameSite=Strict` n'est pas renvoyé quand la page vit dans un cadre
 * d'un autre domaine : la console redemandait alors le mot de passe en boucle.
 * Le jeton vit donc en mémoire et dans `sessionStorage` (donc effacé à la
 * fermeture de l'onglet), et repart dans un en-tête `authorization`. Le cookie
 * reste posé en parallèle : hors cadre, c'est lui qui sert, et il est HttpOnly.
 */
const CLE_JETON = "streamtv.session.v1";
const CLE_APPAREIL = "streamtv.appareil.v1";
let jetonMemoire = null;

/**
 * Stockage tolérant. Un navigateur peut refuser `localStorage` dans un cadre
 * tiers, ou lever à la première lecture : ce n'est pas une raison pour empêcher
 * une connexion. En cas de refus, le jeton ne vit qu'en mémoire, et la page
 * redemandera le mot de passe après rechargement, rien de plus.
 */
function essayer(action) {
  try {
    return action();
  } catch {
    return null;
  }
}

function lireStockage(cle) {
  for (const type of ["sessionStorage", "localStorage"]) {
    const valeur = essayer(() => globalThis[type]?.getItem(cle));
    if (valeur) return valeur;
  }
  return null;
}

function ecrireStockage(cle, valeur, persistant) {
  const zones = persistant ? ["localStorage", "sessionStorage"] : ["sessionStorage", "localStorage"];
  for (const type of zones) essayer(() => globalThis[type]?.setItem(cle, valeur));
}

function effacerStockage(cle) {
  for (const type of ["sessionStorage", "localStorage"]) essayer(() => globalThis[type]?.removeItem(cle));
}

/** À appeler après une connexion réussie. */
export function memoriserSession({ jeton, jetonAppareil } = {}) {
  if (jeton) {
    jetonMemoire = jeton;
    ecrireStockage(CLE_JETON, jeton, false);
  }
  if (jetonAppareil) ecrireStockage(CLE_APPAREIL, jetonAppareil, true);
}

/** À appeler à la déconnexion, et quand le serveur dit que la session est morte. */
export function oublierSession() {
  jetonMemoire = null;
  effacerStockage(CLE_JETON);
}

export function jetonCourant() {
  return jetonMemoire ?? lireStockage(CLE_JETON);
}

function jetonAppareil() {
  return lireStockage(CLE_APPAREIL);
}

/** En-têtes d'authentification, seulement quand un jeton existe. */
function entetesAuth() {
  const entetes = {};
  const jeton = jetonCourant();
  if (jeton) entetes.authorization = `Bearer ${jeton}`;
  const appareil = jetonAppareil();
  if (appareil) entetes["x-stv-appareil"] = appareil;
  return entetes;
}

export class ErreurApi extends Error {
  constructor(message, code) {
    super(message);
    this.name = "ErreurApi";
    this.code = code;
  }
}

let statique = null;

async function chargerStatique() {
  if (statique) return statique;
  const controleur = new AbortController();
  const minuteur = setTimeout(() => controleur.abort(), DELAI_MS);
  try {
    const reponse = await fetch(avecBase("/statique/donnees.json"), { signal: controleur.signal });
    if (!reponse.ok) throw new Error(String(reponse.status));
    statique = await reponse.json();
    return statique;
  } catch {
    throw new ErreurApi("Les données de la démonstration n'ont pas pu être chargées. Rechargez la page.", 0);
  } finally {
    clearTimeout(minuteur);
  }
}

function licenceDes(item, donnees) {
  if (item.licence) return item.licence;
  const ids = item.sources ?? (item.source ? [item.source] : []);
  for (const id of ids) {
    const source = donnees.sources.find((s) => s.id === id);
    if (source?.licence) return source.licence;
  }
  return "Licence non renseignée";
}

/** Reproduit les réponses de l'API à partir de l'instantané statique. */
function repondreStatique(cheminComplet, donnees) {
  const url = new URL(cheminComplet, window.location.origin);
  const chemin = url.pathname;
  const q = Object.fromEntries(url.searchParams.entries());
  const plafond = donnees.plafondCartes ?? 24;

  if (chemin === "/api/etat") {
    return {
      version: "3.18.0",
      date: donnees.date,
      plafondCartes: plafond,
      attenteLecteur: donnees.attenteLecteur ?? 10,
      bandeauDemo: true,
      compte: { chaines: donnees.chaines.length, anime: donnees.anime.length, films: donnees.films.length }
    };
  }
  if (chemin === "/api/chaines") {
    return catalogue.paginer(catalogue.filtrerChaines(donnees.chaines, q), q.page, q.taille, plafond);
  }
  if (chemin === "/api/chaines/zapping") {
    return catalogue.listeZapping(donnees.chaines, q, 300);
  }
  if (chemin === "/api/chaines/categories") {
    return {
      categories: catalogue.categoriesDe(donnees.chaines),
      pays: catalogue.paysDe(donnees.chaines),
      regions: catalogue.regionsDe(donnees.chaines)
    };
  }
  if (chemin.startsWith("/api/chaines/")) {
    const chaine = donnees.chaines.find((c) => c.id === chemin.slice("/api/chaines/".length));
    if (!chaine) throw new ErreurApi("Chaîne introuvable.", 404);
    const source = donnees.sources.find((s) => s.id === chaine.source);
    return { ...chaine, licence: licenceDes(chaine, donnees), nomSource: source?.nom ?? null };
  }
  if (chemin.startsWith("/api/films/") && chemin.endsWith("/lecture")) {
    const film = donnees.films.find((f) => f.id === chemin.slice("/api/films/".length, -"/lecture".length));
    if (!film) throw new ErreurApi("Film introuvable.", 404);
    return {
      type: "fichier",
      disponible: Boolean(film.url),
      url: film.url ?? null,
      raison: "La démonstration statique lit les fichiers du catalogue : elle n'a pas de fournisseur tiers."
    };
  }
  if (chemin === "/api/apparence") {
    return { feuille: "", valeurs: null };
  }
  if (chemin === "/api/accueil") {
    return { sections: donnees.sections ?? [] };
  }
  if (chemin.startsWith("/api/films/") && chemin.endsWith("/tmdb")) {
    // La démonstration statique n'a pas de serveur : elle ne peut ni garder des
    // clés ni appeler TMDb. Elle le dit, plutôt que de faire semblant.
    return {
      disponible: false,
      raison: "La démonstration statique n'appelle pas TMDb : sans serveur, elle n'a nulle part où garder une clé."
    };
  }
  if (chemin === "/api/anime") {
    const retenus = catalogue.filtrerAnime(donnees.anime, q);
    return {
      total: retenus.length,
      contenus: retenus,
      facettes: catalogue.facettesAnime(donnees.anime),
      rangees: catalogue.rangeesAnime(retenus, plafond)
    };
  }
  if (chemin.startsWith("/api/anime/")) {
    const serie = donnees.anime.find((a) => a.id === chemin.slice("/api/anime/".length));
    if (!serie) throw new ErreurApi("Animé introuvable.", 404);
    return {
      ...serie,
      licence: licenceDes(serie, donnees),
      sourcesDetail: (serie.sources ?? []).map((id) => {
        const source = donnees.sources.find((s) => s.id === id);
        return { id, nom: source?.nom ?? id, licence: source?.licence ?? "Licence non renseignée" };
      })
    };
  }
  if (chemin === "/api/films") {
    const retenus = catalogue.filtrerFilms(donnees.films, q);
    return {
      total: retenus.length,
      contenus: retenus,
      facettes: catalogue.facettesFilms(donnees.films),
      ...catalogue.rangeesFilms(retenus, plafond, 4)
    };
  }
  if (chemin.startsWith("/api/films/")) {
    const film = donnees.films.find((f) => f.id === chemin.slice("/api/films/".length));
    if (!film) throw new ErreurApi("Film introuvable.", 404);
    return {
      ...film,
      licence: licenceDes(film, donnees),
      sourcesDetail: (film.sources ?? []).map((id) => {
        const source = donnees.sources.find((s) => s.id === id);
        return { id, nom: source?.nom ?? id, licence: source?.licence ?? "Licence non renseignée" };
      })
    };
  }
  if (chemin === "/api/recherche") {
    return catalogue.rechercher({ chaines: donnees.chaines, anime: donnees.anime, films: donnees.films }, q.q ?? "", plafond);
  }
  if (chemin === "/api/sources") {
    return { sources: donnees.sources.map((s) => ({ id: s.id, nom: s.nom, licence: s.licence, contenu: s.contenu })) };
  }
  if (chemin === "/api/guide") {
    return { disponible: false, heure: new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }), raison: "La démonstration statique ne diffuse pas de grille de programmes." };
  }
  throw new ErreurApi("La démonstration statique ne propose pas cette action.", 404);
}

async function demander(chemin, options = {}) {
  if (typeof window !== "undefined" && window.STREAMTV_STATIQUE) {
    if (options.methode && options.methode !== "GET") {
      throw new ErreurApi("La démonstration statique est en lecture seule : cette action n'y est pas disponible.", 403);
    }
    return repondreStatique(chemin, await chargerStatique());
  }

  const controleur = new AbortController();
  const minuteur = setTimeout(() => controleur.abort(), options.delai ?? DELAI_MS);
  try {
    const entetes = { ...entetesAuth(), ...(options.entetes ?? {}) };
    if (options.corps) entetes["content-type"] = "application/json";
    const reponse = await fetch(chemin, {
      method: options.methode ?? "GET",
      headers: entetes,
      body: options.corps ? JSON.stringify(options.corps) : undefined,
      credentials: "same-origin",
      signal: controleur.signal
    });
    const type = reponse.headers.get("content-type") ?? "";
    const charge = type.includes("application/json") ? await reponse.json() : await reponse.text();
    // Une session expirée ne doit pas rester dans le stockage : sinon chaque
    // appel suivant repart avec un jeton mort et la console boucle.
    if (reponse.status === 401 && chemin.startsWith("/api/admin/") && !chemin.endsWith("/connexion")) oublierSession();
    if (!reponse.ok) {
      const message = typeof charge === "object" && charge?.erreur ? charge.erreur : `Le serveur a répondu ${reponse.status}.`;
      throw new ErreurApi(message, reponse.status);
    }
    return charge;
  } catch (erreur) {
    if (erreur.name === "AbortError") {
      throw new ErreurApi("Le serveur n'a pas répondu dans le délai prévu. Vérifiez votre connexion, puis réessayez.", 0);
    }
    if (erreur instanceof ErreurApi) throw erreur;
    throw new ErreurApi("Le serveur est injoignable. Vérifiez qu'il tourne, puis réessayez.", 0);
  } finally {
    clearTimeout(minuteur);
  }
}

export const obtenir = (chemin, options) => demander(chemin, options);
export const envoyer = (chemin, corps, options) => demander(chemin, { ...options, methode: "POST", corps });
export const supprimer = (chemin, options) => demander(chemin, { ...options, methode: "DELETE" });
