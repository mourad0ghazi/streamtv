/**
 * Films ajoutés par la console à partir de TMDb.
 *
 * Le catalogue livré ne bouge pas : ces films vivent dans un fichier séparé,
 * `data/films-ajoutes.json`, et sont fusionnés à la lecture. Un film ajouté
 * porte son identifiant TMDb, ce qui permet au fournisseur de lecture de le
 * servir, et il ne prétend aucune licence : ses droits sont ceux du flux tiers,
 * attestés par l'administrateur, pas par ce fichier.
 *
 * Conséquence assumée : on ne peut pas ajouter un film avant d'avoir attesté
 * des droits. Sans cette règle, le site afficherait des affiches et des fiches
 * pour des œuvres dont personne n'aurait dit qu'elles sont diffusables.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { DOSSIER_DONNEES, ecrireAtomique } from "./magasin.js";
import * as tmdb from "./tmdb.js";
import * as lecture from "./lecture.js";

export const FICHIER = join(DOSSIER_DONNEES, "films-ajoutes.json");
const PERSISTER = process.env.STREAMTV_TESTS !== "1";
const PLAFOND = 200;

let etat = null;

async function chargerEtat() {
  if (etat) return etat;
  try {
    const bloc = JSON.parse(await readFile(FICHIER, "utf8"));
    etat = { version: 1, films: Array.isArray(bloc.films) ? bloc.films : [] };
  } catch (erreur) {
    if (erreur.code !== "ENOENT") throw erreur;
    etat = { version: 1, films: [] };
  }
  return etat;
}

/** Films ajoutés, prêts à être fusionnés avec le catalogue. */
export async function lister() {
  await chargerEtat();
  return etat.films.map((film) => ({ ...film }));
}

export async function parId(id) {
  await chargerEtat();
  const film = etat.films.find((f) => f.id === id);
  return film ? { ...film } : null;
}

function identifiant(films, tmdbId) {
  if (films.some((f) => f.tmdbId === tmdbId)) return null;
  const numero = films.length + 1;
  let id = `fa-${String(numero).padStart(4, "0")}`;
  while (films.some((f) => f.id === id)) id = `fa-${String(Number(id.slice(3)) + 1).padStart(4, "0")}`;
  return id;
}

/**
 * Ajoute un film par son identifiant TMDb. Le film est décrit par TMDb, jamais
 * inventé : si TMDb ne répond pas, rien n'est ajouté et le message dit pourquoi.
 */
export async function ajouter({ tmdbId }, options = {}) {
  await chargerEtat();
  const numero = Number.parseInt(String(tmdbId), 10);
  if (!Number.isInteger(numero) || numero <= 0) {
    return { ok: false, message: "L'identifiant TMDb doit être un nombre entier positif, par exemple 597." };
  }
  if (etat.films.length >= PLAFOND) {
    return { ok: false, message: `Le plafond de ${PLAFOND} films ajoutés est atteint.` };
  }
  if (etat.films.some((f) => f.tmdbId === numero)) {
    return { ok: false, message: "Ce film TMDb est déjà dans la liste." };
  }

  const attestation = await lecture.statut();
  if (!attestation.atteste) {
    return {
      ok: false,
      message: "Attestez d'abord vos droits de diffusion dans l'onglet Lecture : un film ajouté n'a pas de licence propre, il vit du flux du fournisseur."
    };
  }

  const fiche = options.fiche ?? (await tmdb.parId(numero, options));
  if (!fiche.disponible) return { ok: false, message: fiche.raison };
  const d = fiche.fiche;
  if (!d?.titre) return { ok: false, message: "TMDb a répondu sans titre exploitable : le film n'est pas ajouté." };

  const id = identifiant(etat.films, numero);
  const film = {
    id,
    tmdbId: numero,
    titre: d.titre,
    titreOriginal: d.titreOriginal ?? null,
    annee: d.annee ?? null,
    duree: d.dureeMinutes ?? null,
    genres: Array.isArray(d.genres) ? d.genres : [],
    synopsis: d.resume ?? null,
    affiche: null,
    langue: d.langue ?? null,
    licence: null,
    sources: [],
    origine: "TMDb",
    droits: "flux fournisseur tiers, attestation administrateur",
    ajoute: new Date().toISOString()
  };
  etat.films.push(film);
  if (options.persister !== false && PERSISTER) await ecrireAtomique(FICHIER, etat);
  return { ok: true, film: { ...film }, films: await lister() };
}

export async function supprimer(id, options = {}) {
  await chargerEtat();
  const avant = etat.films.length;
  etat.films = etat.films.filter((f) => f.id !== id);
  if (etat.films.length === avant) return { ok: false, message: "Ce film ajouté n'existe pas." };
  if (options.persister !== false && PERSISTER) await ecrireAtomique(FICHIER, etat);
  return { ok: true, films: await lister() };
}

/** Fusionne catalogue et films ajoutés, sans doublon d'identifiant. */
export async function fusionner(films) {
  const ajoutes = await lister();
  const vus = new Set(films.map((f) => f.id));
  return [...films, ...ajoutes.filter((f) => !vus.has(f.id))];
}

export function reinitialiser() {
  etat = null;
}
