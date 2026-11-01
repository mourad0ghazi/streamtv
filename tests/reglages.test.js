import { test } from "node:test";
import assert from "node:assert/strict";

import * as reglages from "../server/reglages.js";

test("les valeurs par défaut couvrent tous les réglages décrits", () => {
  const defauts = reglages.defauts();
  assert.equal(Object.keys(defauts).length, reglages.DESCRIPTION.length);
  assert.equal(defauts.plafond_cartes, 24);
  assert.equal(defauts.plafond_signalements, 1000);
});

test("chaque réglage porte une ancre de documentation", () => {
  for (const description of reglages.DESCRIPTION) {
    assert.match(description.doc, /^reglage-[a-z-]+$/, `ancre manquante pour ${description.cle}`);
    assert.ok(description.effet.length > 10, `effet manquant pour ${description.cle}`);
    assert.ok(description.risque.length > 10, `risque manquant pour ${description.cle}`);
  }
});

test("un plafond de cartes hors bornes est refusé par le serveur", async () => {
  const resultat = await reglages.modifier({ plafond_cartes: 500 });
  assert.equal(resultat.applique, false);
  assert.match(resultat.refuses.plafond_cartes, /comprise entre/i);
});

test("un réglage booléen refuse une chaîne", async () => {
  const resultat = await reglages.modifier({ bandeau_demo: "oui" });
  assert.equal(resultat.applique, false);
  assert.match(resultat.refuses.bandeau_demo, /vrai ou faux/i);
});

test("un réglage inconnu est refusé", async () => {
  const resultat = await reglages.modifier({ reglage_invente: 1 });
  assert.equal(resultat.applique, false);
  assert.match(resultat.refuses.reglage_invente, /n'existe pas/i);
});

test("un chemin de console devinable est refusé", async () => {
  const resultat = await reglages.modifier({ chemin_console: "/admin" });
  assert.equal(resultat.applique, false);
});

test("un réglage valide est appliqué et relu", async () => {
  const resultat = await reglages.modifier({ rangees_genre_max: 6 });
  assert.equal(resultat.applique, true);
  assert.equal(reglages.valeur("rangees_genre_max"), 6);
  await reglages.modifier({ rangees_genre_max: reglages.defauts().rangees_genre_max });
});

test("un lot contenant une valeur refusée n'applique rien", async () => {
  const avant = reglages.valeur("duree_session_minutes");
  const resultat = await reglages.modifier({ duree_session_minutes: 45, plafond_cartes: 1000 });
  assert.equal(resultat.applique, false);
  assert.equal(reglages.valeur("duree_session_minutes"), avant);
});
