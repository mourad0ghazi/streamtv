import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { Noeud, parClasse, parBalise, texte } from "./aide/dom-factice.js";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = async (nom) => JSON.parse(await readFile(join(RACINE, "data", nom), "utf8"));

const [channels, anime, films, sources] = await Promise.all([
  lire("channels.json"),
  lire("anime.json"),
  lire("films.json"),
  lire("sources.json")
]);

const instantane = {
  date: new Date().toISOString(),
  plafondCartes: 24,
  attenteLecteur: 10,
  chaines: channels.contenus,
  anime: anime.contenus,
  films: films.contenus,
  sources: sources.sources.map((s) => ({ id: s.id, nom: s.nom, licence: s.licence, contenu: s.contenu }))
};

globalThis.window.STREAMTV_STATIQUE = true;
globalThis.fetch = async () => ({ ok: true, status: 200, headers: new Map([["content-type", "application/json"]]), json: async () => instantane });

const app = { aller: () => {}, attenteSecondes: 10 };

const vueChaines = await import("../public/js/vues/chaines.js");
const vueAnime = await import("../public/js/vues/anime.js");
const vueFilms = await import("../public/js/vues/films.js");
const vueFiche = await import("../public/js/vues/fiche.js");
const vueRecherche = await import("../public/js/vues/recherche.js");
const vueFavoris = await import("../public/js/vues/favoris-vue.js");
const progression = await import("../public/js/progression.js");

test("la vue Chaînes rend au plus le plafond de cartes", async () => {
  const racine = new Noeud("main");
  await vueChaines.rendre(racine, {}, app);
  const cartes = parClasse(racine, "carte");
  assert.ok(cartes.length > 0);
  assert.ok(cartes.length <= 24, `${cartes.length} cartes rendues`);
  assert.match(texte(racine), /Page 1 sur/);
});

test("la vue Chaînes affiche un état vide avec une issue quand rien ne correspond", async () => {
  const racine = new Noeud("main");
  await vueChaines.rendre(racine, { q: "zzzzzzzz" }, app);
  assert.match(texte(racine), /Aucune chaîne ne correspond/);
  assert.match(texte(racine), /Réinitialiser les filtres/);
});

test("la vue Animé ne rend aucune rangée vide", async () => {
  const racine = new Noeud("main");
  await vueAnime.rendre(racine, {}, app);
  const rangees = parClasse(racine, "rangee").map((r) => r.getAttribute("data-rangee"));
  assert.ok(rangees.includes("Classiques"));
  assert.equal(rangees.includes("Simulcast de la saison"), false);
});

test("la vue Animé expose les quatre filtres en haut de page", async () => {
  const racine = new Noeud("main");
  await vueAnime.rendre(racine, {}, app);
  const identifiants = parBalise(racine, "select").map((s) => s.getAttribute("id"));
  assert.deepEqual(identifiants.sort(), ["filtre-annee", "filtre-genre", "filtre-langue", "filtre-statut"]);
});

test("la vue Films range les nouveautés et les genres", async () => {
  const racine = new Noeud("main");
  await vueFilms.rendre(racine, {}, app);
  const rangees = parClasse(racine, "rangee").map((r) => r.getAttribute("data-rangee"));
  assert.ok(rangees.includes("Ajoutés récemment"));
  assert.ok(rangees.length >= 2);
});

test("la rangée À reprendre apparaît dès qu'une lecture est enregistrée", async () => {
  progression.enregistrer("films", "fi-0001", 120, 888);
  const racine = new Noeud("main");
  await vueFilms.rendre(racine, {}, app);
  const rangees = parClasse(racine, "rangee").map((r) => r.getAttribute("data-rangee"));
  assert.ok(rangees.includes("À reprendre"));
  progression.effacer("films", "fi-0001");
});

test("la fiche film ne propose qu'un bouton de lecture", async () => {
  const racine = new Noeud("main");
  await vueFiche.rendre(racine, "films", "fi-0001", app);
  const principaux = parClasse(racine, "bouton--principal");
  assert.equal(principaux.length, 1);
  assert.match(texte(principaux[0]), /Regarder/);
  assert.match(texte(racine), /CC BY 3.0/);
});

test("la fiche film propose de reprendre quand une position existe", async () => {
  progression.enregistrer("films", "fi-0001", 305, 888);
  const racine = new Noeud("main");
  await vueFiche.rendre(racine, "films", "fi-0001", app);
  assert.match(texte(racine), /Reprendre à 5:05/);
  progression.effacer("films", "fi-0001");
});

test("la fiche animé liste ses épisodes et leur durée", async () => {
  const racine = new Noeud("main");
  await vueFiche.rendre(racine, "anime", "an-0002", app);
  const episodes = parClasse(racine, "episode");
  assert.equal(episodes.length, 2);
  assert.match(texte(racine), /14 min 48 s/);
});

test("la fiche chaîne affiche la licence sans action", async () => {
  const chaine = channels.contenus[0];
  const racine = new Noeud("main");
  await vueFiche.rendre(racine, "chaines", chaine.id, app);
  assert.match(texte(racine), /Licence et source/);
  assert.ok(texte(racine).length > 50);
});

test("la recherche vide propose une issue en français", async () => {
  const racine = new Noeud("main");
  await vueRecherche.rendre(racine, {}, app);
  assert.match(texte(racine), /Cherchez une chaîne/);
});

test("la recherche sans résultat propose une autre piste", async () => {
  const racine = new Noeud("main");
  await vueRecherche.rendre(racine, { q: "zzzz" }, app);
  assert.match(texte(racine), /Aucun résultat/);
  assert.match(texte(racine), /Voir toutes les chaînes/);
});

test("les favoris vides expliquent comment en ajouter", async () => {
  localStorage.clear();
  const racine = new Noeud("main");
  vueFavoris.rendre(racine, {}, app);
  assert.match(texte(racine), /liste de favoris est vide/);
  assert.match(texte(racine), /Ajouter aux favoris/);
});

test("chaque résultat de recherche porte son type en toutes lettres", async () => {
  const racine = new Noeud("main");
  await vueRecherche.rendre(racine, { q: "sintel" }, app);
  const types = parClasse(racine, "resultat__type").map((t) => texte(t));
  assert.ok(types.includes("Animé"));
  assert.ok(types.includes("Film"));
});
