import { test } from "node:test";
import assert from "node:assert/strict";

import { analyserSource, verifierLicence, lireM3u, importerSource, fusionnerCatalogue } from "../server/import.js";

const sourceValide = {
  id: "s1",
  nom: "Source de test",
  type: "direct",
  contenu: "chaine",
  url: "https://exemple.test/flux.m3u",
  licence: "Diffusion publique officielle, vérifiée le 2026-11-01",
  pays: "MA",
  langue: "fr",
  actif: true,
  priorite: 5
};

test("une source sans licence est refusée à l'import", async () => {
  const source = { ...sourceValide, licence: "" };
  const resultat = await importerSource(source);
  assert.equal(resultat.accepte, false);
  assert.match(resultat.message, /licence/i);
});

test("une licence « inconnue » est refusée avec un message qui dit quoi faire", () => {
  const message = verifierLicence("inconnue");
  assert.match(message, /licence/i);
  assert.match(message, /vérification/i);
});

test("une licence trop courte pour être vérifiable est refusée", () => {
  assert.match(verifierLicence("CC"), /trop courte/i);
});

test("une licence datée est acceptée", () => {
  assert.equal(verifierLicence("CC BY 3.0, vérifiée le 2026-11-01"), null);
});

test("une source conforme passe l'analyse des dix champs", () => {
  const analyse = analyserSource(sourceValide);
  assert.equal(analyse.accepte, true);
});

test("un champ manquant est nommé dans le refus", () => {
  const { pays, ...incomplete } = sourceValide;
  const analyse = analyserSource(incomplete);
  assert.equal(analyse.accepte, false);
  assert.match(analyse.message, /pays/);
});

test("une priorité hors bornes est refusée", () => {
  assert.equal(analyserSource({ ...sourceValide, priorite: 12 }).accepte, false);
});

test("une adresse qui n'est pas en https est refusée", () => {
  assert.equal(analyserSource({ ...sourceValide, url: "http://exemple.test/flux.m3u" }).accepte, false);
});

test("l'analyse d'une liste M3U écarte les flux qui imposent un référent", () => {
  const texte = [
    "#EXTM3U",
    '#EXTINF:-1 tvg-id="a",Chaîne officielle',
    "https://exemple.test/officielle.m3u8",
    '#EXTINF:-1 tvg-id="b",Relais avec contournement',
    "#EXTVLCOPT:http-referrer=https://exemple.test/",
    "https://exemple.test/relais.m3u8"
  ].join("\n");
  const elements = lireM3u(texte);
  assert.equal(elements.length, 1);
  assert.equal(elements[0].nom, "Chaîne officielle");
});

test("l'import lit une liste M3U fournie par un récupérateur injecté", async () => {
  const resultat = await importerSource(sourceValide, {
    recuperer: async () =>
      ["#EXTM3U", "#EXTINF:-1,Chaîne A", "https://exemple.test/a.m3u8", "#EXTINF:-1,Chaîne B", "https://exemple.test/b.m3u8"].join("\n")
  });
  assert.equal(resultat.accepte, true);
  assert.equal(resultat.ajoutes, 2);
  assert.equal(resultat.contenus[0].source, "s1");
});

test("une source injoignable consume son budget et n'interrompt pas l'import", async () => {
  let appels = 0;
  const resultat = await importerSource(sourceValide, {
    budgetTentatives: 2,
    recuperer: async () => {
      appels += 1;
      throw new Error("réseau indisponible");
    }
  });
  assert.equal(appels, 2);
  assert.equal(resultat.accepte, false);
  assert.match(resultat.message, /injoignable/i);
  assert.match(resultat.message, /autres sources/i);
});

test("un doublon entre deux sources est arbitré par la priorité et journalisé", () => {
  const ancien = { id: "ch-1", nom: "Ancienne", source: "basse" };
  const nouveau = { id: "ch-1", nom: "Nouvelle", source: "haute" };
  const resultat = fusionnerCatalogue([ancien], [nouveau], (id) => (id === "haute" ? 1 : 9));
  assert.equal(resultat.contenus.length, 1);
  assert.equal(resultat.contenus[0].nom, "Nouvelle");
  assert.equal(resultat.doublons.length, 1);
  assert.equal(resultat.doublons[0].garde, "haute");
  assert.equal(resultat.doublons[0].ecarte, "basse");
});

test("une source moins prioritaire ne remplace pas une source plus prioritaire", () => {
  const ancien = { id: "ch-1", nom: "Ancienne", source: "haute" };
  const nouveau = { id: "ch-1", nom: "Nouvelle", source: "basse" };
  const resultat = fusionnerCatalogue([ancien], [nouveau], (id) => (id === "haute" ? 1 : 9));
  assert.equal(resultat.contenus[0].nom, "Ancienne");
  assert.equal(resultat.doublons[0].ecarte, "basse");
});

test("les contenus sans doublon sont ajoutés", () => {
  const resultat = fusionnerCatalogue([], [{ id: "ch-1", nom: "A", source: "s" }], () => 5);
  assert.equal(resultat.ajoutes.length, 1);
  assert.equal(resultat.doublons.length, 0);
});
