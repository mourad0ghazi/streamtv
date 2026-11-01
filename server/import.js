/**
 * Import des sources.
 *
 * Trois règles tenues ici :
 * - une source sans licence identifiée est refusée, avec un message français ;
 * - un même identifiant de contenu venant de deux sources est arbitré par la
 *   priorité (1 = haute), et l'arbitrage est journalisé ;
 * - l'écriture du catalogue est atomique : jamais de catalogue partiel.
 */

import { sources as toutesLesSources, enregistrerCatalogue, sourceParId } from "./magasin.js";

const CHAMPS_OBLIGATOIRES = ["id", "nom", "type", "contenu", "url", "licence", "pays", "langue", "actif", "priorite"];
const TYPES = ["direct", "vod"];
const FAMILLES = ["chaine", "anime", "film"];
const LICENCES_VIDES = ["", "n/a", "na", "inconnue", "inconnu", "aucune", "a verifier", "à vérifier", "todo"];

/** Renvoie null si la licence est exploitable, sinon le message français à afficher. */
export function verifierLicence(licence) {
  const valeur = String(licence ?? "").trim();
  if (!valeur) {
    return "Licence absente : renseignez la licence de la source (par exemple « CC BY 3.0 » ou « diffusion publique officielle, vérifiée le 2026-11-01 »), puis relancez l'import.";
  }
  if (LICENCES_VIDES.includes(valeur.toLowerCase())) {
    return `Licence « ${valeur} » refusée : une licence inconnue ou à vérifier ne permet pas d'importer. Indiquez la licence exacte et sa date de vérification.`;
  }
  if (valeur.length < 6) {
    return `Licence « ${valeur} » trop courte pour être vérifiable : indiquez la licence exacte et sa date de vérification.`;
  }
  return null;
}

/** Contrôle d'une source complète : dix champs, valeurs autorisées, licence. */
export function analyserSource(source) {
  const manquants = CHAMPS_OBLIGATOIRES.filter((champ) => !(champ in (source ?? {})));
  if (manquants.length) {
    return { accepte: false, message: `Source incomplète : les champs ${manquants.join(", ")} manquent.`, manquants };
  }
  const problemeLicence = verifierLicence(source.licence);
  if (problemeLicence) return { accepte: false, message: problemeLicence, manquants: ["licence"] };
  if (!TYPES.includes(source.type)) {
    return { accepte: false, message: `Type « ${source.type} » refusé : attendu direct ou vod.` };
  }
  if (!FAMILLES.includes(source.contenu)) {
    return { accepte: false, message: `Contenu « ${source.contenu} » refusé : attendu chaine, anime ou film.` };
  }
  if (!Number.isInteger(source.priorite) || source.priorite < 1 || source.priorite > 10) {
    return { accepte: false, message: "La priorité doit être un entier de 1 (haute) à 10 (basse)." };
  }
  if (typeof source.url !== "string" || !/^https:\/\/[^ ]+$/.test(source.url)) {
    return { accepte: false, message: "L'adresse de la source doit commencer par https://." };
  }
  return { accepte: true, message: "Source conforme." };
}

/**
 * Lit une liste M3U. Les entrées qui imposent un référent ou un agent
 * navigateur sont écartées : ce contournement signale un relais non officiel.
 */
export function lireM3u(texte) {
  const lignes = String(texte).split(/\r?\n/);
  const elements = [];
  let courant = null;
  let contournement = false;
  for (const brute of lignes) {
    const ligne = brute.trim();
    if (!ligne) continue;
    if (ligne.startsWith("#EXTINF")) {
      const morceau = ligne.split(",");
      courant = { nom: (morceau[morceau.length - 1] ?? "").trim(), url: null };
      contournement = false;
      continue;
    }
    if (ligne.startsWith("#EXTVLCOPT")) {
      contournement = true;
      continue;
    }
    if (ligne.startsWith("#")) continue;
    if (courant && /^https?:\/\//.test(ligne)) {
      if (!contournement) {
        courant.url = ligne;
        elements.push(courant);
      }
      courant = null;
    }
  }
  return elements;
}

function identifiant(nom, prefixe) {
  const base = String(nom)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return `${prefixe}-${base || "sans-nom"}`;
}

/**
 * Importe une source. `recuperer(url)` est injectable : les tests n'ont pas
 * besoin d'un réseau, et le serveur garde la maîtrise des délais.
 */
export async function importerSource(source, options = {}) {
  const analyse = analyserSource(source);
  if (!analyse.accepte) return { accepte: false, message: analyse.message, ajoutes: 0, doublons: [] };

  const budget = Number.isInteger(options.budgetTentatives) ? options.budgetTentatives : 2;
  const recuperer = options.recuperer ?? recupererParDefaut;
  let texte = null;
  let derniereErreur = null;
  for (let tentative = 1; tentative <= Math.max(1, budget); tentative += 1) {
    try {
      texte = await recuperer(source.url);
      break;
    } catch (erreur) {
      derniereErreur = erreur;
    }
  }
  if (texte === null) {
    return {
      accepte: false,
      message: `Source injoignable après ${budget} tentative(s) : ${derniereErreur?.message ?? "aucune réponse"}. L'import des autres sources continue.`,
      ajoutes: 0,
      doublons: []
    };
  }

  const elements = source.type === "direct" ? lireM3u(texte) : lireM3u(texte);
  const contenus = elements.map((element, index) => ({
    id: identifiant(element.nom, source.contenu === "chaine" ? "ch" : source.contenu === "anime" ? "an" : "fi") + `-${index + 1}`,
    nom: element.nom,
    titre: element.nom,
    categorie: source.categorie ?? "Généraliste",
    pays: source.pays,
    langue: source.langue,
    logo: "",
    source: source.id,
    url: element.url,
    licence: source.licence
  }));

  return {
    accepte: true,
    message: `${contenus.length} contenu(s) lus depuis ${source.nom}.`,
    ajoutes: contenus.length,
    doublons: [],
    contenus
  };
}

async function recupererParDefaut(url) {
  const controleur = new AbortController();
  const minuteur = setTimeout(() => controleur.abort(), 20000);
  try {
    const reponse = await fetch(url, { signal: controleur.signal, redirect: "follow" });
    if (!reponse.ok) throw new Error(`réponse ${reponse.status}`);
    return await reponse.text();
  } finally {
    clearTimeout(minuteur);
  }
}

/**
 * Fusionne deux catalogues. À identifiant égal, la source la plus prioritaire
 * l'emporte ; l'arbitrage est renvoyé pour être journalisé, jamais silencieux.
 */
export function fusionnerCatalogue(existants, nouveaux, prioriteDe) {
  const parid = new Map(existants.map((c) => [c.id, c]));
  const doublons = [];
  const ajoutes = [];
  for (const nouveau of nouveaux) {
    const ancien = parid.get(nouveau.id);
    if (!ancien) {
      parid.set(nouveau.id, nouveau);
      ajoutes.push(nouveau);
      continue;
    }
    const pAncien = prioriteDe(ancien.source);
    const pNouveau = prioriteDe(nouveau.source);
    const gagnant = pNouveau < pAncien ? nouveau : ancien;
    doublons.push({
      id: nouveau.id,
      garde: gagnant.source,
      ecarte: gagnant === nouveau ? ancien.source : nouveau.source,
      prioriteGardee: Math.min(pAncien, pNouveau)
    });
    parid.set(nouveau.id, gagnant);
  }
  return { contenus: [...parid.values()], doublons, ajoutes };
}

function prioriteSource(id) {
  const s = sourceParId(id) ?? toutesLesSources().find((x) => x.id === id);
  return Number.isInteger(s?.priorite) ? s.priorite : 10;
}

/**
 * Import complet d'une liste de sources, incrémental : une source en échec
 * n'empêche pas les suivantes.
 */
export async function importerSources(sources, options = {}) {
  const familles = { chaine: [], anime: [], film: [] };
  const resultats = [];
  for (const source of sources) {
    const resultat = await importerSource({ ...source, priorite: source.priorite ?? 5 }, options);
    resultats.push({ source: source.id, ...resultat });
    if (resultat.accepte && Array.isArray(resultat.contenus)) {
      familles[source.contenu].push(...resultat.contenus);
    }
  }
  return { resultats };
}

/** Écrit un catalogue complet de façon atomique. */
export async function ecrireCatalogue(famille, contenus, version = 1) {
  await enregistrerCatalogue(famille, {
    version,
    date: new Date().toISOString(),
    contenus
  });
}
