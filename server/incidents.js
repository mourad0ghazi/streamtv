/**
 * Incidents remontés par les navigateurs : erreurs de script, promesses
 * rejetées, écrans restés vides.
 *
 * Un même défaut vu cent fois reste un défaut : les incidents sont regroupés
 * par signature (message et page), avec un compteur et deux dates. Le fichier
 * est borné, du plus fréquent au plus rare, pour qu'un visiteur en boucle ne
 * puisse ni remplir le disque ni chasser les autres incidents.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { DOSSIER_DONNEES, ecrireAtomique } from "./magasin.js";
import { creerSuivi } from "./suivi-fichier.js";

export const FICHIER = join(DOSSIER_DONNEES, "incidents.json");
const PERSISTER = process.env.STREAMTV_TESTS !== "1";
const PLAFOND = 200;
const TAILLE_MESSAGE = 300;
const TAILLE_PILE = 600;

let etat = null;
const aChange = creerSuivi(FICHIER);

function nettoyer(valeur, taille) {
  return String(valeur ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, taille);
}

function signature({ message, page }) {
  return `${message}\u0000${page}`;
}

async function charger() {
  if (etat) return etat;
  try {
    const bloc = JSON.parse(await readFile(FICHIER, "utf8"));
    etat = { version: 1, incidents: Array.isArray(bloc.incidents) ? bloc.incidents : [] };
  } catch (erreur) {
    if (erreur.code !== "ENOENT") throw erreur;
    etat = { version: 1, incidents: [] };
  }
  return etat;
}

async function sauvegarder() {
  // Le plus fréquent d'abord, puis le plus récent : les deux tris se voient.
  etat.incidents.sort((a, b) => b.occurrences - a.occurrences || String(b.derniere).localeCompare(String(a.derniere)));
  etat.incidents = etat.incidents.slice(0, PLAFOND);
  if (PERSISTER) await ecrireAtomique(FICHIER, etat);
}

/**
 * Enregistre un incident. Renvoie {ok} ou {ok:false, message} : le navigateur
 * n'a pas à deviner pourquoi son signalement a été refusé.
 */
export async function enregistrer(brut = {}, options = {}) {
  await charger();
  const message = nettoyer(brut.message, TAILLE_MESSAGE);
  const page = nettoyer(brut.page, 160) || "/";
  if (message.length < 3) return { ok: false, message: "Le message de l'incident est trop court." };

  const cle = signature({ message, page });
  const existant = etat.incidents.find((i) => i.signature === cle);
  const maintenant = new Date().toISOString();
  if (existant) {
    existant.occurrences += 1;
    existant.derniere = maintenant;
    if (brut.pile) existant.pile = nettoyer(brut.pile, TAILLE_PILE);
  } else {
    etat.incidents.push({
      signature: cle,
      message,
      page,
      pile: nettoyer(brut.pile, TAILLE_PILE),
      agent: nettoyer(brut.agent, 160),
      occurrences: 1,
      premiere: maintenant,
      derniere: maintenant
    });
  }
  if (options.persister !== false) await sauvegarder();
  return { ok: true, occurrences: existant ? existant.occurrences : 1 };
}

/** Liste sans la signature interne, la plus fréquente d'abord. */
export async function lister({ limite = 50 } = {}) {
  await charger();
  return etat.incidents.slice(0, Math.max(1, Math.min(Number(limite) || 50, PLAFOND)))
    .map(({ signature: _signature, ...reste }) => ({ ...reste }));
}

export async function total() {
  await charger();
  return etat.incidents.reduce((somme, i) => somme + i.occurrences, 0);
}

export async function vider(options = {}) {
  await charger();
  etat.incidents = [];
  if (options.persister !== false) await sauvegarder();
  return { ok: true };
}

/**
 * Recharge si un autre processus a écrit : le site enregistre les incidents,
 * la console les lit depuis un autre processus.
 */
export async function rafraichir() {
  if (process.env.STREAMTV_TESTS === "1") return charger();
  if (await aChange()) etat = null;
  return charger();
}

export function reinitialiser() {
  etat = null;
}
