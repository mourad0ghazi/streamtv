import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { DESCRIPTION } from "../server/reglages.js";
import { CODES } from "../server/audit.js";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = async (nom) => JSON.parse(await readFile(join(RACINE, "data", nom), "utf8"));

const [channels, anime, films, sources, doc] = await Promise.all([
  lire("channels.json"),
  lire("anime.json"),
  lire("films.json"),
  lire("sources.json"),
  readFile(join(RACINE, "docs", "ADMINISTRATION.md"), "utf8")
]);

const existea = async (chemin) => {
  try {
    await access(join(RACINE, chemin));
    return true;
  } catch {
    return false;
  }
};

/* ---------------------------------------------------------------- */
/* Une vérification par catégorie : 18 tests                        */
/* ---------------------------------------------------------------- */

const categories = [...new Set(channels.contenus.map((c) => c.categorie))].sort();

for (const categorie of [
  "Affaires",
  "Animation",
  "Cinéma",
  "Cuisine",
  "Culture",
  "Divertissement",
  "Documentaire",
  "Généraliste",
  "Information",
  "Jeunesse",
  "Musique",
  "Religion",
  "Science",
  "Sport",
  "Style de vie",
  "Séries",
  "Voyage",
  "Éducation"
]) {
  test(`la catégorie ${categorie} existe et ses chaînes sont complètes`, () => {
    const membres = channels.contenus.filter((c) => c.categorie === categorie);
    assert.ok(membres.length > 0, `catégorie ${categorie} vide`);
    for (const chaine of membres) {
      assert.match(chaine.id, /^ch-\d{4}$/);
      assert.ok(chaine.nom.length > 0);
      assert.match(chaine.pays, /^[A-Z]{2}$/);
      assert.ok(chaine.url.startsWith("https://"));
    }
  });
}

test("le catalogue ne contient aucune catégorie hors des dix-huit", () => {
  const connues = new Set([
    "Affaires", "Animation", "Cinéma", "Cuisine", "Culture", "Divertissement", "Documentaire",
    "Généraliste", "Information", "Jeunesse", "Musique", "Religion", "Science", "Sport",
    "Style de vie", "Séries", "Voyage", "Éducation"
  ]);
  assert.equal(categories.length, 18);
  for (const categorie of categories) assert.ok(connues.has(categorie), `catégorie inattendue : ${categorie}`);
});

/* ---------------------------------------------------------------- */
/* Une vérification par source : licence et dix champs              */
/* ---------------------------------------------------------------- */

for (const source of sources.sources) {
  test(`la source ${source.id} est complète et licite`, () => {
    for (const champ of ["id", "nom", "type", "contenu", "url", "licence", "pays", "langue", "actif", "priorite"]) {
      assert.ok(champ in source, `champ ${champ} absent`);
    }
    assert.ok(String(source.licence).length > 10, "licence trop courte pour être vérifiable");
    assert.ok(["direct", "vod"].includes(source.type));
    assert.ok(["chaine", "anime", "film"].includes(source.contenu));
    assert.ok(Number.isInteger(source.priorite) && source.priorite >= 1 && source.priorite <= 10);
    assert.ok(source.url.startsWith("https://"));
  });
}

test("chaque source active fournit au moins un contenu", () => {
  const fournisseurs = new Set(channels.contenus.map((c) => c.source));
  const orphelines = sources.sources.filter((s) => s.actif && s.contenu === "chaine" && !fournisseurs.has(s.id));
  assert.equal(orphelines.length, 0, `${orphelines.length} sources sans contenu`);
});

/* ---------------------------------------------------------------- */
/* Fiches                                                           */
/* ---------------------------------------------------------------- */

for (const film of films.contenus) {
  test(`le film ${film.id} est complet`, async () => {
    assert.ok(film.titre.length > 0);
    assert.ok(film.duree > 0);
    assert.match(String(film.annee), /^\d{4}$/);
    assert.ok(film.genres.length > 0);
    assert.ok(String(film.licence).length > 3);
    assert.ok(film.url.startsWith("https://"));
    assert.ok(film.affiche.startsWith("/affiches/"));
    assert.equal(await existea(`public${film.affiche}`), true, `affiche absente : ${film.affiche}`);
  });
}

for (const serie of anime.contenus) {
  test(`l'animé ${serie.id} est complet`, async () => {
    assert.ok(serie.titre.length > 0);
    assert.ok(serie.episodes.length >= 1);
    assert.ok(String(serie.licence).length > 3);
    for (const episode of serie.episodes) {
      assert.ok(episode.duree > 0);
      assert.ok(episode.url.startsWith("https://"));
    }
    assert.equal(await existea(`public${serie.affiche}`), true, `affiche absente : ${serie.affiche}`);
  });
}

/* ---------------------------------------------------------------- */
/* Réglages et codes                                                */
/* ---------------------------------------------------------------- */

for (const description of DESCRIPTION) {
  test(`la valeur par défaut de ${description.cle} passe son propre contrôle`, () => {
    assert.equal(description.verifier(description.defaut), null);
  });
}

for (const [code, action] of Object.entries(CODES)) {
  test(`le code d'audit ${code} est stable et documenté`, () => {
    assert.match(code, /^A\d{2}$/);
    assert.ok(action.length > 10);
    assert.ok(doc.includes(`| ${code} `), `code ${code} absent du tableau de la documentation`);
  });
}
