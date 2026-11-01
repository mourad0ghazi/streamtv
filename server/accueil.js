/**
 * Composition de l'accueil : une liste ordonnée de sections, chacune avec son
 * type, son titre et son nombre de cartes.
 *
 * L'accueil n'est pas codé en dur dans la vue : la console écrit cette liste,
 * la page la lit. Une section vide ne s'affiche pas, et une section dont le
 * type ne peut rien montrer (un genre qui n'existe pas, par exemple) est
 * signalée à la console au lieu de laisser un trou sur la page.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { DOSSIER_DONNEES, ecrireAtomique } from "./magasin.js";
import { creerSuivi } from "./suivi-fichier.js";

export const FICHIER = join(DOSSIER_DONNEES, "accueil.json");
const PERSISTER = process.env.STREAMTV_TESTS !== "1";
const PLAFOND_SECTIONS = 14;

/**
 * Types de section. `champs` dit à la console quoi demander, `famille` dit à la
 * vue d'où viennent les cartes, et `client` signale les sections qui se
 * remplissent avec les données de l'appareil (reprise, favoris, direct).
 */
export const TYPES = [
  { cle: "entrees", libelle: "Les trois entrées", champs: [], famille: null, client: false, doc: "accueil-type-entrees" },
  { cle: "direct", libelle: "Dernière chaîne regardée", champs: [], famille: "chaines", client: true, doc: "accueil-type-direct" },
  { cle: "reprise", libelle: "Reprendre la lecture", champs: ["limite"], famille: "films", client: true, doc: "accueil-type-reprise" },
  { cle: "favoris", libelle: "Favoris", champs: ["limite"], famille: null, client: true, doc: "accueil-type-favoris" },
  { cle: "films-recents", libelle: "Films ajoutés récemment", champs: ["limite"], famille: "films", client: false, doc: "accueil-type-films-recents" },
  { cle: "films-genre", libelle: "Films d'un genre", champs: ["genre", "limite"], famille: "films", client: false, doc: "accueil-type-films-genre" },
  { cle: "anime-rangee", libelle: "Rangée d'animés", champs: ["rangee", "limite"], famille: "anime", client: false, doc: "accueil-type-anime-rangee" },
  { cle: "categories-chaines", libelle: "Catégories de chaînes", champs: ["limite"], famille: "chaines", client: false, doc: "accueil-type-categories" },
  { cle: "texte", libelle: "Bloc de texte", champs: ["texte"], famille: null, client: false, doc: "accueil-type-texte" }
];

export const SECTIONS_DEFAUT = [
  { id: "entrees", type: "entrees", titre: "Chaînes, animés et films dans un seul catalogue", visible: true },
  { id: "direct", type: "direct", titre: "Reprendre le direct", visible: true },
  { id: "films-recents", type: "films-recents", titre: "Ajoutés récemment", limite: 12, visible: true },
  { id: "reprise", type: "reprise", titre: "Reprendre la lecture", limite: 12, visible: true },
  { id: "anime-rangee", type: "anime-rangee", titre: "Animation à voir", rangee: "Classiques", limite: 12, visible: true }
];

let courant = null;
const aChange = creerSuivi(FICHIER);

export function typeDe(cle) {
  return TYPES.find((t) => t.cle === cle) ?? null;
}

/** Titre par défaut d'une section : le libellé de son type, sauf pour les entrées. */
export function titreParDefaut(type) {
  if (type === "entrees") return "Chaînes, animés et films dans un seul catalogue";
  return typeDe(type)?.libelle ?? "Section";
}

export function defauts() {
  return SECTIONS_DEFAUT.map((s) => ({ ...s }));
}

/** Valide une section complète. Renvoie {ok, section} ou {ok:false, message}. */
export function verifierSection(brut, ids = []) {
  if (!brut || typeof brut !== "object") return { ok: false, message: "Une section est attendue sous forme d'objet." };
  const type = typeDe(brut.type);
  if (!type) return { ok: false, message: "Ce type de section n'existe pas." };

  const id = typeof brut.id === "string" && /^[a-z0-9-]{3,40}$/.test(brut.id) ? brut.id : null;
  if (!id) return { ok: false, message: "L'identifiant de section doit compter de 3 à 40 caractères parmi a-z, 0-9 et tiret." };
  if (ids.includes(id)) return { ok: false, message: "Deux sections ne peuvent pas porter le même identifiant." };

  const titre = typeof brut.titre === "string" ? brut.titre.trim() : "";
  if (titre.length < 2 || titre.length > 60) return { ok: false, message: "Le titre d'une section doit compter de 2 à 60 caractères." };

  const section = { id, type: type.cle, titre, visible: brut.visible !== false };

  if (type.champs.includes("limite")) {
    const limite = brut.limite ?? 12;
    if (!Number.isInteger(limite) || limite < 4 || limite > 24) {
      return { ok: false, message: "Le nombre de cartes doit être un entier de 4 à 24." };
    }
    section.limite = limite;
  }
  if (type.champs.includes("genre")) {
    const genre = typeof brut.genre === "string" ? brut.genre.trim() : "";
    if (genre.length < 2 || genre.length > 40) return { ok: false, message: "Le genre doit compter de 2 à 40 caractères." };
    section.genre = genre;
  }
  if (type.champs.includes("rangee")) {
    const rangee = typeof brut.rangee === "string" ? brut.rangee.trim() : "";
    if (rangee.length < 2 || rangee.length > 40) return { ok: false, message: "Le nom de la rangée doit compter de 2 à 40 caractères." };
    section.rangee = rangee;
  }
  if (type.champs.includes("texte")) {
    const texte = typeof brut.texte === "string" ? brut.texte.trim() : "";
    if (texte.length < 10 || texte.length > 280) return { ok: false, message: "Le texte doit compter de 10 à 280 caractères." };
    section.texte = texte;
  }
  return { ok: true, section };
}

export async function charger() {
  if (courant) return courant;
  let enregistre = null;
  try {
    enregistre = JSON.parse(await readFile(FICHIER, "utf8"));
  } catch (erreur) {
    if (erreur.code !== "ENOENT") throw erreur;
  }
  courant = defauts();
  if (Array.isArray(enregistre?.sections)) {
    const vues = [];
    const retenues = [];
    for (const brute of enregistre.sections.slice(0, PLAFOND_SECTIONS)) {
      const resultat = verifierSection(brute, vues);
      if (resultat.ok) {
        retenues.push(resultat.section);
        vues.push(resultat.section.id);
      }
    }
    // Un fichier vide ou entièrement invalide ne doit pas laisser une page nue.
    if (retenues.length) courant = retenues;
  }
  return courant;
}

export function valeurs() {
  return (courant ?? defauts()).map((s) => ({ ...s }));
}

async function enregistrer(sections, options) {
  courant = sections;
  if (options.persister !== false && PERSISTER) await ecrireAtomique(FICHIER, { version: 1, sections });
  return valeurs();
}

export async function remplacer(sections, options = {}) {
  await charger();
  if (!Array.isArray(sections)) return { ok: false, message: "La liste des sections est attendue." };
  if (!sections.length) return { ok: false, message: "L'accueil doit garder au moins une section : la première porte le titre du site." };
  if (sections.length > PLAFOND_SECTIONS) return { ok: false, message: `L'accueil ne peut pas compter plus de ${PLAFOND_SECTIONS} sections.` };
  const vues = [];
  const retenues = [];
  for (const brute of sections) {
    const resultat = verifierSection(brute, vues);
    if (!resultat.ok) return { ok: false, message: `${brute?.titre ?? "Une section"} : ${resultat.message}` };
    retenues.push(resultat.section);
    vues.push(resultat.section.id);
  }
  return { ok: true, sections: await enregistrer(retenues, options) };
}

export async function ajouter(brut, options = {}) {
  await charger();
  if (courant.length >= PLAFOND_SECTIONS) return { ok: false, message: `L'accueil ne peut pas compter plus de ${PLAFOND_SECTIONS} sections.` };
  const id = typeof brut?.id === "string" && brut.id ? brut.id : `section-${courant.length + 1}`;
  const candidat = {
    ...brut,
    id,
    titre: brut?.titre ?? titreParDefaut(brut?.type),
    visible: brut?.visible !== false
  };
  const resultat = verifierSection(candidat, courant.map((s) => s.id));
  if (!resultat.ok) return resultat;
  const sections = [...courant, resultat.section];
  return { ok: true, section: resultat.section, sections: await enregistrer(sections, options) };
}

export async function modifier(id, changements = {}, options = {}) {
  await charger();
  const index = courant.findIndex((s) => s.id === id);
  if (index < 0) return { ok: false, message: "Cette section n'existe pas." };
  const fusion = { ...courant[index], ...changements, id };
  const resultat = verifierSection(fusion, courant.filter((s) => s.id !== id).map((s) => s.id));
  if (!resultat.ok) return resultat;
  const sections = courant.map((s, i) => (i === index ? resultat.section : s));
  return { ok: true, section: resultat.section, sections: await enregistrer(sections, options) };
}

/** Déplace une section d'un cran. Aux extrémités, la liste revient inchangée. */
export async function deplacer(id, sens, options = {}) {
  await charger();
  const index = courant.findIndex((s) => s.id === id);
  if (index < 0) return { ok: false, message: "Cette section n'existe pas." };
  if (!["haut", "bas"].includes(sens)) return { ok: false, message: "Le sens vaut haut ou bas." };
  const cible = sens === "haut" ? index - 1 : index + 1;
  if (cible < 0 || cible >= courant.length) return { ok: true, sections: valeurs(), deplace: false };
  const sections = [...courant];
  [sections[index], sections[cible]] = [sections[cible], sections[index]];
  return { ok: true, deplace: true, sections: await enregistrer(sections, options) };
}

export async function supprimer(id, options = {}) {
  await charger();
  if (courant.length <= 1) return { ok: false, message: "L'accueil doit garder au moins une section." };
  if (!courant.some((s) => s.id === id)) return { ok: false, message: "Cette section n'existe pas." };
  return { ok: true, sections: await enregistrer(courant.filter((s) => s.id !== id), options) };
}

/** Recharge le fichier si un autre processus l'a écrit. */
export async function rafraichir() {
  // En test, l'état vit en mémoire et n'est jamais écrit : relire le fichier
  // ramènerait les valeurs de l'installation, pas celles du test.
  if (process.env.STREAMTV_TESTS === "1") return charger();
  if (await aChange()) courant = null;
  return charger();
}

export function reinitialiser() {
  courant = null;
}
