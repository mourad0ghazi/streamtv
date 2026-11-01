/**
 * Fiche TMDb d'un film.
 *
 * Ce que ces tests prouvent, sans réseau : la clé est lue à la bonne place, la
 * réponse de TMDb est normalisée sans invention, une clé refusée fait passer à
 * la suivante, une clé épuisée aussi, un serveur muet donne un message français,
 * et l'absence de clé n'appelle tout simplement rien.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import * as cles from "../server/cles-films.js";
import * as tmdb from "../server/tmdb.js";

/* ---------------------------------------------------------------- */
/* Clés                                                              */
/* ---------------------------------------------------------------- */

test("les clés sont lues depuis le fichier local ou l'environnement", async () => {
  cles.reinitialiser();
  const etat = await cles.statut();
  assert.ok(etat.tmdb > 0, "le fichier de clés doit fournir au moins une clé TMDb");
  assert.ok(etat.omdb > 0);
  assert.equal(etat.disponible, true);
  assert.equal(typeof etat.origine, "string");
});

test("une clé personnelle dans l'environnement passe devant le pool public", async () => {
  const avant = process.env.TMDB_API_KEY;
  process.env.TMDB_API_KEY = "cle-personnelle-de-test-123456";
  try {
    cles.reinitialiser();
    const etat = await cles.statut();
    assert.equal(etat.personnelle, true);
    assert.equal(etat.origine, "variable d'environnement");
    assert.equal(await cles.cleListe("tmdb", 0), "cle-personnelle-de-test-123456");
  } finally {
    if (avant === undefined) delete process.env.TMDB_API_KEY;
    else process.env.TMDB_API_KEY = avant;
    cles.reinitialiser();
  }
});

test("le statut ne révèle jamais la valeur d'une clé", async () => {
  cles.reinitialiser();
  const etat = await cles.statut();
  const texte = JSON.stringify(etat);
  const premiere = await cles.cleListe("tmdb", 0);
  assert.ok(premiere && premiere.length >= 8);
  assert.equal(texte.includes(premiere), false, "une clé ne doit jamais apparaître dans l'état exposé");
});

test("les clés tournent, pour survivre à une révocation", async () => {
  cles.reinitialiser();
  const total = await cles.nombre("tmdb");
  if (total < 2) return;
  const premiere = await cles.cleListe("tmdb", 0);
  const seconde = await cles.cleListe("tmdb", 1);
  assert.notEqual(premiere, seconde);
  assert.equal(await cles.cleListe("tmdb", total), premiere, "la rotation doit boucler");
});

/* ---------------------------------------------------------------- */
/* Normalisation                                                     */
/* ---------------------------------------------------------------- */

const RECHERCHE = { id: 45745, title: "Sintel", release_date: "2010-09-27" };
const DETAILS = {
  id: 45745,
  title: "Sintel",
  original_title: "Sintel",
  release_date: "2010-09-27",
  runtime: 15,
  genres: [{ id: 14, name: "Fantastique" }, { id: 12, name: "Aventure" }],
  vote_average: 6.987,
  vote_count: 130,
  overview: "Une jeune guerrière part à la recherche du dragon qu'elle a soigné enfant.",
  original_language: "en"
};

test("une réponse TMDb est normalisée, arrondie, sans rien inventer", () => {
  const fiche = tmdb.normaliser(RECHERCHE, DETAILS, "2026-11-01T10:00:00.000Z");
  assert.equal(fiche.titre, "Sintel");
  assert.equal(fiche.annee, 2010);
  assert.equal(fiche.dureeMinutes, 15);
  assert.equal(fiche.note, 7, "6,987 doit s'arrondir à 7");
  assert.equal(fiche.votes, 130);
  assert.deepEqual(fiche.genres, ["Fantastique", "Aventure"]);
  assert.match(fiche.resume, /jeune guerrière/);
  assert.equal(fiche.source, "TMDb");
  assert.match(fiche.attribution, /ni approuvé ni certifié par TMDb/);
});

test("un film sans note ni résumé ne fabrique pas de valeur", () => {
  const fiche = tmdb.normaliser(RECHERCHE, { ...DETAILS, vote_average: 0, vote_count: 0, overview: "", runtime: 0 });
  assert.equal(fiche.note, null);
  assert.equal(fiche.votes, 0);
  assert.equal(fiche.resume, null);
  assert.equal(fiche.dureeMinutes, null);
});

test("une réponse vide ne devient pas une fiche", () => {
  assert.equal(tmdb.normaliser(RECHERCHE, null), null);
  assert.equal(tmdb.normaliser(RECHERCHE, {}), null);
  assert.equal(tmdb.normaliser(RECHERCHE, { id: null }), null);
});

/* ---------------------------------------------------------------- */
/* Appels, avec un faux réseau                                       */
/* ---------------------------------------------------------------- */

function fauxFetch(reponses) {
  const appels = [];
  const impl = async (url) => {
    appels.push(url);
    const suivante = reponses.shift();
    if (!suivante) throw new Error("appel inattendu");
    if (suivante.erreur) throw suivante.erreur;
    return {
      ok: suivante.ok ?? true,
      status: suivante.status ?? 200,
      json: async () => suivante.corps
    };
  };
  impl.appels = appels;
  return impl;
}

test("une fiche complète est demandée puis renvoyée", async () => {
  const impl = fauxFetch([
    { corps: { results: [RECHERCHE] } },
    { corps: DETAILS }
  ]);
  const resultat = await tmdb.interroger({ titre: "Sintel", annee: 2010 }, { fetchImpl: impl });
  assert.equal(resultat.disponible, true);
  assert.equal(resultat.fiche.titre, "Sintel");
  assert.equal(impl.appels.length, 2);
  assert.match(impl.appels[0], /\/search\/movie\?/);
  assert.match(impl.appels[0], /language=fr-FR/, "le résumé doit être demandé en français");
  assert.match(impl.appels[0], /year=2010/);
  assert.match(impl.appels[1], /\/movie\/45745\?/);
});

test("une clé refusée fait passer à la suivante", async () => {
  const total = await cles.nombre("tmdb");
  if (total < 2) return;
  const impl = fauxFetch([
    { status: 401, corps: { status_message: "Invalid API key" } },
    { corps: { results: [RECHERCHE] } },
    { corps: DETAILS }
  ]);
  const resultat = await tmdb.interroger({ titre: "Sintel", annee: 2010 }, { fetchImpl: impl });
  assert.equal(resultat.disponible, true, "la deuxième clé doit prendre le relais");
  assert.equal(impl.appels.length, 3);
});

test("toutes les clés épuisées donnent un message qui dit quoi faire", async () => {
  const total = await cles.nombre("tmdb");
  const reponses = [];
  for (let i = 0; i < total; i += 1) reponses.push({ status: 429, corps: {} });
  const impl = fauxFetch(reponses);
  const resultat = await tmdb.interroger({ titre: "Sintel" }, { fetchImpl: impl });
  assert.equal(resultat.disponible, false);
  assert.match(resultat.raison, /429|quota|refus/i);
  assert.match(resultat.raison, /TMDB_API_KEY/, "le message doit indiquer la sortie");
});

test("un film inconnu de TMDb le dit, sans erreur", async () => {
  const impl = fauxFetch([{ corps: { results: [] } }]);
  const resultat = await tmdb.interroger({ titre: "Film qui n'existe pas" }, { fetchImpl: impl });
  assert.equal(resultat.disponible, false);
  assert.match(resultat.raison, /ne connaît pas/);
});

test("un serveur muet donne un message français, pas une exception", async () => {
  const impl = fauxFetch([{ erreur: new Error("ECONNREFUSED") }]);
  const resultat = await tmdb.interroger({ titre: "Sintel" }, { fetchImpl: impl });
  assert.equal(resultat.disponible, false);
  assert.match(resultat.raison, /injoignable/);
});

test("un dépassement de délai est annoncé avec sa durée", async () => {
  const impl = async () => {
    const erreur = new Error("aborted");
    erreur.name = "AbortError";
    throw erreur;
  };
  const resultat = await tmdb.interroger({ titre: "Sintel" }, { fetchImpl: impl, delai: 3000 });
  assert.equal(resultat.disponible, false);
  assert.match(resultat.raison, /3 secondes/);
});

test("sans clé TMDb, aucun appel réseau n'est tenté", async () => {
  const avant = { tmdb: process.env.TMDB_API_KEY };
  delete process.env.TMDB_API_KEY;
  const { rename } = await import("node:fs/promises");
  const sauvegarde = `${cles.FICHIER}.test`;
  await rename(cles.FICHIER, sauvegarde);
  try {
    cles.reinitialiser();
    const impl = fauxFetch([]);
    const resultat = await tmdb.interroger({ titre: "Sintel" }, { fetchImpl: impl });
    assert.equal(resultat.disponible, false);
    assert.match(resultat.raison, /Aucune clé TMDb/);
    assert.equal(impl.appels.length, 0, "sans clé, on ne dérange personne");
  } finally {
    await rename(sauvegarde, cles.FICHIER);
    if (avant.tmdb !== undefined) process.env.TMDB_API_KEY = avant.tmdb;
    cles.reinitialiser();
  }
});

/* ---------------------------------------------------------------- */
/* Cache                                                             */
/* ---------------------------------------------------------------- */

test("le cache évite de redemander la même fiche", async () => {
  tmdb.oublierCache();
  // Identifiant unique : une exécution précédente ne doit pas fournir la
  // réponse à la place du faux réseau.
  const film = { id: `fi-test-${Date.now()}`, titre: "Sintel", annee: 2010 };
  const premier = fauxFetch([{ corps: { results: [RECHERCHE] } }, { corps: DETAILS }]);
  const a = await tmdb.ficheFilm(film, { fetchImpl: premier });
  assert.equal(a.disponible, true);
  assert.notEqual(a.cache, true);

  const second = fauxFetch([]);
  const b = await tmdb.ficheFilm(film, { fetchImpl: second });
  assert.equal(b.disponible, true);
  assert.equal(b.cache, true, "la seconde lecture doit venir du cache");
  assert.equal(second.appels.length, 0);
});

test("l'état du cache se lit sans exposer son contenu", async () => {
  const etat = await tmdb.etatCache();
  assert.ok(Number.isInteger(etat.entrees));
  assert.equal(typeof etat, "object");
});

// Les tests n'ont pas à laisser leurs entrées de démonstration dans le cache
// réel : on les retire à la fin, comme on range après avoir bricolé.
test("le cache réel ne garde rien des essais", async () => {
  const { readFile, writeFile } = await import("node:fs/promises");
  try {
    const bloc = JSON.parse(await readFile(tmdb.CACHE, "utf8"));
    for (const cle of Object.keys(bloc)) {
      if (cle.startsWith("fi-test")) delete bloc[cle];
    }
    await writeFile(tmdb.CACHE, JSON.stringify(bloc, null, 1) + "\n", "utf8");
    const relu = JSON.parse(await readFile(tmdb.CACHE, "utf8"));
    assert.equal(Object.keys(relu).some((c) => c.startsWith("fi-test")), false);
  } catch (erreur) {
    if (erreur.code !== "ENOENT") throw erreur;
  }
});

/* ---------------------------------------------------------------- */
/* Affichage de la fiche, dans le DOM simulé                         */
/* ---------------------------------------------------------------- */

test("le bloc TMDb affiche la note, la durée, les genres et l'attribution", async () => {
  await import("./aide/dom-factice.js");
  const { blocTmdb } = await import("../public/js/vues/fiche.js");
  const { Noeud, texte, collecter } = await import("./aide/dom-factice.js");

  const bloc = blocTmdb({
    disponible: true,
    cache: true,
    fiche: {
      titre: "Sintel",
      annee: 2010,
      dureeMinutes: 15,
      genres: ["Fantastique", "Aventure"],
      note: 6.9,
      votes: 130,
      resume: "Une jeune guerrière part à la recherche du dragon.",
      attribution: "Cette fiche utilise l'API TMDb. Ce produit n'est ni approuvé ni certifié par TMDb.",
      releve: "2026-11-01T10:00:00.000Z"
    }
  });
  const contenu = texte(bloc);
  assert.match(contenu, /Fiche TMDb/);
  assert.match(contenu, /6,9 sur 10/);
  assert.match(contenu, /130 votes/);
  assert.match(contenu, /Fantastique, Aventure/);
  assert.match(contenu, /jeune guerrière/);
  assert.match(contenu, /ni approuvé ni certifié par TMDb/, "l'attribution est obligatoire");
  assert.match(contenu, /cache local/);
  assert.equal(bloc instanceof Noeud, true);
});

test("sans fiche TMDb, le bloc dit pourquoi au lieu de meubler", async () => {
  await import("./aide/dom-factice.js");
  const { blocTmdb } = await import("../public/js/vues/fiche.js");
  const { texte } = await import("./aide/dom-factice.js");

  const raison = "TMDb est injoignable depuis ce serveur.";
  const bloc = blocTmdb({ disponible: false, raison });
  const contenu = texte(bloc);
  assert.equal(contenu, raison, "seule la raison doit s'afficher, sans données inventées");
  assert.equal(/sur 10|vote/.test(contenu), false);
});
