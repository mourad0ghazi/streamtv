/**
 * Tableau de bord : les chiffres qui disent si le site va bien, en un appel.
 *
 * Rien n'est calculé deux fois : le tableau lit le magasin, les sondes, le
 * journal, les incidents, les comptes et la configuration. Une mesure absente
 * est annoncée comme absente, jamais remplacée par un zéro flatteur.
 */

import { contenus, sources, instantane } from "./magasin.js";
import * as sonde from "./sonde.js";
import * as audit from "./audit.js";
import * as incidents from "./incidents.js";
import * as comptes from "./comptes.js";
import * as reglages from "./reglages.js";
import * as apparence from "./apparence.js";
import * as accueil from "./accueil.js";
import * as lecture from "./lecture.js";
import * as clesFilms from "./cles-films.js";
import * as tmdb from "./tmdb.js";

/** Répartition des licences déclarées dans le catalogue. */
function licences() {
  const compte = {};
  for (const famille of ["films", "anime"]) {
    for (const c of contenus(famille)) {
      const cle = c.licence ? String(c.licence) : (c.sources ?? []).length ? "source déclarée" : "aucune";
      compte[cle] = (compte[cle] ?? 0) + 1;
    }
  }
  return compte;
}

function genres(famille) {
  const compte = {};
  for (const c of contenus(famille)) {
    for (const genre of c.genres ?? []) compte[genre] = (compte[genre] ?? 0) + 1;
  }
  return Object.entries(compte).sort((a, b) => b[1] - a[1]).map(([nom, nombre]) => ({ nom, nombre }));
}

/** Santé des sources : combien répondent, combien échouent, combien sont muettes. */
function santeSources(etats) {
  const liste = sources();
  const resume = { total: liste.length, actives: 0, saines: 0, enEchec: 0, inconnues: 0, desactivees: 0 };
  for (const source of liste) {
    if (source.actif === false) {
      resume.desactivees += 1;
      continue;
    }
    resume.actives += 1;
    const etat = etats[source.id]?.etat;
    if (etat === "ok") resume.saines += 1;
    else if (etat === "echec") resume.enEchec += 1;
    else resume.inconnues += 1;
  }
  return resume;
}

export async function tableauDeBord(options = {}) {
  await reglages.charger();
  await apparence.charger();
  await accueil.charger();
  await lecture.charger();
  const etats = await sonde.etats();
  const listeIncidents = await incidents.lister({ limite: 6 });
  const journal = await audit.lire(12);
  const listeComptes = await comptes.lister();
  const sections = accueil.valeurs();
  const etatLecture = await lecture.statut();
  const listeCles = await clesFilms.statut();

  const films = contenus("films");
  const anime = contenus("anime");
  const chaines = contenus("chaines");

  const sante = [
    {
      cle: "catalogue",
      libelle: "Catalogue",
      etat: films.length + anime.length + chaines.length > 0 ? "ok" : "echec",
      detail: `${chaines.length} chaînes, ${anime.length} animés, ${films.length} films`
    },
    {
      cle: "sources",
      libelle: "Sources",
      etat: santeSources(etats).enEchec > 0 ? "avertissement" : santeSources(etats).total ? "ok" : "echec",
      detail: `${santeSources(etats).saines} saines sur ${santeSources(etats).actives} actives`
    },
    {
      cle: "licences",
      libelle: "Licences",
      etat: licences().aucune ? "avertissement" : "ok",
      detail: licences().aucune ? `${licences().aucune} contenu(s) sans licence` : "toutes déclarées"
    },
    {
      cle: "lecture",
      libelle: "Lecture",
      etat: etatLecture.fournisseur_actif ? (etatLecture.blocage ? "avertissement" : "ok") : "info",
      detail: etatLecture.fournisseur_actif
        ? `${etatLecture.fournisseur_nom}, clé ${etatLecture.clePresente ? "présente" : "absente"}`
        : "fichiers du catalogue seulement"
    },
    {
      cle: "incidents",
      libelle: "Incidents",
      etat: listeIncidents.some((i) => i.occurrences >= 3) ? "avertissement" : "ok",
      detail: `${await incidents.total()} signalement(s), ${listeIncidents.length} signature(s)`
    },
    {
      cle: "cles",
      libelle: "Clés films",
      etat: listeCles.disponible ? "ok" : "info",
      detail: listeCles.disponible ? `${listeCles.tmdb} TMDb, ${listeCles.omdb} OMDb` : "aucune clé"
    },
    {
      cle: "console",
      libelle: "Console",
      etat: reglages.valeur("console_sans_mot_de_passe") ? "avertissement" : "ok",
      detail: reglages.valeur("console_sans_mot_de_passe")
        ? "accès libre sur le port d'administration"
        : `${listeComptes.length} compte(s), mot de passe exigé`
    }
  ];

  return {
    releve: new Date().toISOString(),
    version: options.version ?? null,
    date: instantane().chaines?.date ?? null,
    comptes: {
      chaines: chaines.length,
      anime: anime.length,
      films: films.length,
      sources: sources().length,
      sections: sections.length
    },
    licences: licences(),
    genres: { films: genres("films").slice(0, 6), anime: genres("anime").slice(0, 6) },
    sources: santeSources(etats),
    sante,
    journal,
    incidents: listeIncidents,
    incidentsTotal: await incidents.total(),
    utilisateurs: listeComptes.map((c) => ({ id: c.id, nom: c.nom, role: c.role, actif: c.actif, connexion: c.connexion })),
    lecture: {
      actif: etatLecture.fournisseur_actif,
      nom: etatLecture.fournisseur_nom,
      atteste: etatLecture.atteste,
      clePresente: etatLecture.clePresente,
      blocage: etatLecture.blocage
    },
    apparence: { accent: apparence.valeur("accent"), theme: apparence.valeur("theme"), densite: apparence.valeur("densite") },
    accueil: sections.map((s) => ({ id: s.id, titre: s.titre, type: s.type, visible: s.visible })),
    cles: { disponible: listeCles.disponible, tmdb: listeCles.tmdb, omdb: listeCles.omdb, origine: listeCles.origine },
    cacheFilms: await tmdb.etatCache()
  };
}
