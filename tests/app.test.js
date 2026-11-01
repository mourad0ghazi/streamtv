import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { Noeud, monter, parBalise, parClasse, texte } from "./aide/dom-factice.js";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = async (nom) => JSON.parse(await readFile(join(RACINE, "data", nom), "utf8"));
const [channels, anime, films, sources] = await Promise.all([
  lire("channels.json"), lire("anime.json"), lire("films.json"), lire("sources.json")
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

const application = monter(Object.assign(new Noeud("div"), { id: "application" }));
const page = monter(Object.assign(new Noeud("main"), { id: "page" }));

await import("../public/js/app.js");
await new Promise((resoudre) => setTimeout(resoudre, 60));

test("la coquille monte un en-tête avec les trois entrées et les favoris", () => {
  const entetes = parBalise(application, "header");
  assert.equal(entetes.length, 1);
  const liens = parBalise(entetes[0], "a").map((a) => a.getAttribute("href"));
  for (const route of ["/chaines", "/anime", "/films", "/favoris"]) assert.ok(liens.includes(route), `${route} absent de la navigation`);
});

test("aucune entrée de navigation n'est marquée courante sur l'accueil", () => {
  const actifs = parBalise(application, "a").filter((a) => a.getAttribute("aria-current") === "page");
  assert.equal(actifs.length, 0);
});

test("la page d'accueil présente les trois entrées du catalogue", () => {
  const entrees = parClasse(page, "entree").map((e) => texte(e));
  assert.equal(entrees.length, 3);
  assert.ok(entrees[0].includes("Chaînes"));
  assert.ok(entrees[1].includes("Animé"));
  assert.ok(entrees[2].includes("Films"));
});

test("l'accueil annonce les comptes réels du catalogue", () => {
  const contenu = texte(page);
  assert.match(contenu, /8199 chaînes/);
  assert.match(contenu, /3 titres/);
  assert.match(contenu, /4 films/);
});

test("la recherche de l'en-tête est présente et accessible", () => {
  const champs = parBalise(application, "input").filter((i) => i.getAttribute("type") === "search");
  assert.equal(champs.length, 1);
  assert.ok(champs[0].getAttribute("aria-label"));
});

test("sur la page des chaînes, la navigation marque l'entrée courante", async () => {
  for (const racine of [application, page]) {
    while (racine.firstChild) racine.removeChild(racine.firstChild);
  }
  globalThis.window.location.pathname = "/chaines";
  await import("../public/js/app.js?route=chaines");
  await new Promise((resoudre) => setTimeout(resoudre, 60));

  const actifs = parBalise(application, "a").filter((a) => a.getAttribute("aria-current") === "page");
  assert.equal(actifs.length, 1);
  assert.equal(actifs[0].getAttribute("href"), "/chaines");
  assert.ok(parClasse(page, "carte").length > 0, "la vue Chaînes n'a pas rendu ses cartes");
});
