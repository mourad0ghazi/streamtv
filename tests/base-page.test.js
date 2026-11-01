/**
 * Le site publié sous une base (`/streamtv/` sur GitHub Pages) doit se comporter
 * comme à la racine : la page demandée s'ouvre, les liens portent la base, et
 * une adresse reçue avec sa barre finale ne casse pas le routeur.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { Noeud, monter, parBalise } from "./aide/dom-factice.js";

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
globalThis.STREAMTV_BASE = "/streamtv";
globalThis.window.location.pathname = "/streamtv/chaines/";
globalThis.fetch = async () => ({ ok: true, status: 200, headers: new Map([["content-type", "application/json"]]), json: async () => instantane });

const application = monter(Object.assign(new Noeud("div"), { id: "application" }));
monter(Object.assign(new Noeud("main"), { id: "page" }));

await import("../public/js/app.js");
await new Promise((resoudre) => setTimeout(resoudre, 80));

test("une adresse préfixée et terminée par une barre ouvre la bonne page", () => {
  const zone = document.getElementById("page");
  assert.equal(zone.getAttribute("data-page"), "chaines");
});

test("les liens de la navigation portent la base de publication", () => {
  const liens = parBalise(application, "a").map((a) => a.getAttribute("href"));
  for (const route of ["/streamtv/chaines", "/streamtv/anime", "/streamtv/films", "/streamtv/favoris"]) {
    assert.ok(liens.includes(route), `${route} absent de la navigation publiée`);
  }
  assert.equal(liens.includes("/chaines"), false, "un lien nu casserait sous /streamtv/");
});
