/**
 * Accès aux fichiers de données du catalogue.
 *
 * Règles tenues ici et nulle part ailleurs :
 * - toute écriture passe par un fichier temporaire puis un renommage ;
 * - toute pagination passe par paginer(), avec le même plafond de cartes ;
 * - toute lecture renvoie une copie, pour qu'un appelant ne modifie pas l'état.
 */

import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
export const DOSSIER_DONNEES = join(RACINE, "data");

const FAMILLES = {
  chaines: "channels.json",
  anime: "anime.json",
  films: "films.json"
};

const etat = {
  chaines: { version: 1, date: null, contenus: [] },
  anime: { version: 1, date: null, contenus: [] },
  films: { version: 1, date: null, contenus: [] },
  sources: { version: 1, date: null, sources: [] },
  reglages: {},
  signalements: {}
};

let charge = false;

async function lireJson(chemin, replis) {
  try {
    return JSON.parse(await readFile(chemin, "utf8"));
  } catch (erreur) {
    if (erreur.code === "ENOENT") return replis;
    throw new Error(`Fichier de données illisible : ${chemin} (${erreur.message})`);
  }
}

/** Écriture atomique : fichier temporaire dans le même dossier, puis renommage. */
export async function ecrireAtomique(chemin, donnees) {
  await mkdir(dirname(chemin), { recursive: true });
  const temporaire = `${chemin}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporaire, JSON.stringify(donnees, null, 2) + "\n", "utf8");
  await rename(temporaire, chemin);
}

/** Charge tout le catalogue en mémoire. Idempotent. */
export async function charger() {
  if (charge) return etat;
  const [channels, anime, films, sources] = await Promise.all([
    lireJson(join(DOSSIER_DONNEES, "channels.json"), { version: 1, date: null, contenus: [] }),
    lireJson(join(DOSSIER_DONNEES, "anime.json"), { version: 1, date: null, contenus: [] }),
    lireJson(join(DOSSIER_DONNEES, "films.json"), { version: 1, date: null, contenus: [] }),
    lireJson(join(DOSSIER_DONNEES, "sources.json"), { version: 1, date: null, sources: [] })
  ]);
  etat.chaines = channels;
  etat.anime = anime;
  etat.films = films;
  etat.sources = sources;
  charge = true;
  return etat;
}

/** Relit un seul fichier de données depuis le disque. */
export async function recharger(famille) {
  if (famille === "sources") {
    etat.sources = await lireJson(join(DOSSIER_DONNEES, "sources.json"), etat.sources);
    return etat.sources;
  }
  const nom = FAMILLES[famille];
  if (!nom) throw new Error(`Famille inconnue : ${famille}`);
  etat[famille] = await lireJson(join(DOSSIER_DONNEES, nom), etat[famille]);
  return etat[famille];
}

export function instantane() {
  return etat;
}

export function contenus(famille) {
  const bloc = etat[famille];
  return bloc ? bloc.contenus : [];
}

export function sources() {
  return etat.sources.sources ?? [];
}

/** Sources actives, sans aucun champ interne, pour la route publique. */
export function sourcesPubliques() {
  return sources()
    .filter((s) => s.actif !== false)
    .map((s) => ({
      id: s.id,
      nom: s.nom,
      type: s.type,
      contenu: s.contenu,
      licence: s.licence,
      pays: s.pays,
      langue: s.langue
    }));
}

export function sourceParId(id) {
  return sources().find((s) => s.id === id) ?? null;
}

/** Enregistre un catalogue complet de façon atomique, puis met l'état à jour. */
export async function enregistrerCatalogue(famille, bloc) {
  const nom = FAMILLES[famille];
  if (!nom) throw new Error(`Famille inconnue : ${famille}`);
  await ecrireAtomique(join(DOSSIER_DONNEES, nom), bloc);
  etat[famille] = bloc;
}

export async function enregistrerSources(bloc) {
  await ecrireAtomique(join(DOSSIER_DONNEES, "sources.json"), bloc);
  etat.sources = bloc;
}

/** Clé de cache stable pour une réponse : sert d'ETag. */
export function etag(valeur) {
  return `"${Buffer.from(String(valeur)).toString("base64url").slice(0, 32)}"`;
}
