import { test, before, after } from "node:test";
import assert from "node:assert/strict";

import { charger } from "../server/magasin.js";
import { creerServeur } from "../server/serveur.js";
import * as auth from "../server/auth.js";
import * as reglages from "../server/reglages.js";
import * as audit from "../server/audit.js";

let serveur;
let base;
let cookie = "";

before(async () => {
  await charger();
  await reglages.charger();
  await auth.initialiser();
  serveur = creerServeur();
  await new Promise((resoudre) => serveur.listen(0, "127.0.0.1", resoudre));
  base = `http://127.0.0.1:${serveur.address().port}`;
});

after(() => serveur?.close());

async function demander(chemin, options = {}) {
  const reponse = await fetch(`${base}${chemin}`, {
    ...options,
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...(options.headers ?? {}) }
  });
  const type = reponse.headers.get("content-type") ?? "";
  const corps = type.includes("json") ? await reponse.json() : await reponse.text();
  const setCookie = reponse.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  return { statut: reponse.status, corps };
}

test("la connexion échoue sans le code de vérification", async () => {
  const { statut } = await demander("/api/admin/connexion", {
    method: "POST",
    body: JSON.stringify({ motDePasse: auth.MOT_DE_PASSE_PAR_DEFAUT, code: "000000" })
  });
  assert.equal(statut, 401);
});

test("la connexion avec mot de passe et code ouvre une session", async () => {
  const { statut, corps } = await demander("/api/admin/connexion", {
    method: "POST",
    body: JSON.stringify({ motDePasse: auth.MOT_DE_PASSE_PAR_DEFAUT, code: auth.codeVerification() })
  });
  assert.equal(statut, 200);
  assert.equal(corps.role, "administrateur");
  assert.ok(cookie.startsWith("stv_session="));
});

test("la session ouverte donne accès à la liste des sources", async () => {
  const { statut, corps } = await demander("/api/admin/sources");
  assert.equal(statut, 200);
  assert.ok(corps.sources.length > 0);
  assert.ok("sonde" in corps.sources[0]);
});

test("la session ouverte donne accès aux réglages et à leur description", async () => {
  const { statut, corps } = await demander("/api/admin/reglages");
  assert.equal(statut, 200);
  assert.equal(corps.description.length, 8);
  assert.ok(corps.valeurs.plafond_cartes > 0);
});

test("un réglage invalide envoyé directement à l'API est rejeté", async () => {
  const { statut, corps } = await demander("/api/admin/reglages", {
    method: "POST",
    body: JSON.stringify({ plafond_cartes: 999 })
  });
  assert.equal(statut, 400);
  assert.match(corps.refuses.plafond_cartes, /comprise entre/i);
});

test("un réglage valide est accepté et journalisé sous A20", async () => {
  const avant = reglages.valeur("duree_session_minutes");
  const { statut } = await demander("/api/admin/reglages", {
    method: "POST",
    body: JSON.stringify({ duree_session_minutes: avant })
  });
  assert.equal(statut, 200);
  const { corps } = await demander("/api/admin/audit");
  assert.ok(corps.entrees.some((e) => e.code === "A20" && e.detail.reglage === "duree_session_minutes"));
});

test("modifier une licence la journalise sous A11", async () => {
  const { corps: liste } = await demander("/api/admin/sources");
  const source = liste.sources.find((s) => s.contenu === "chaine");
  const { statut } = await demander(`/api/admin/sources/${encodeURIComponent(source.id)}`, {
    method: "POST",
    body: JSON.stringify({ licence: source.licence })
  });
  assert.equal(statut, 200);
  const { corps } = await demander("/api/admin/audit");
  assert.ok(corps.entrees.some((e) => e.code === "A11" && e.detail.source === source.id));
});

test("une licence vide envoyée à l'API est refusée", async () => {
  const { corps: liste } = await demander("/api/admin/sources");
  const source = liste.sources[0];
  const { statut, corps } = await demander(`/api/admin/sources/${encodeURIComponent(source.id)}`, {
    method: "POST",
    body: JSON.stringify({ licence: "" })
  });
  assert.equal(statut, 400);
  assert.match(corps.erreur, /licence/i);
});

test("une priorité hors bornes est refusée", async () => {
  const { corps: liste } = await demander("/api/admin/sources");
  const source = liste.sources[0];
  const { statut } = await demander(`/api/admin/sources/${encodeURIComponent(source.id)}`, {
    method: "POST",
    body: JSON.stringify({ priorite: 42 })
  });
  assert.equal(statut, 400);
});

test("les statistiques comptent les contenus incomplets", async () => {
  const { statut, corps } = await demander("/api/admin/statistiques");
  assert.equal(statut, 200);
  assert.equal(corps.anime.sansLicence, 0);
  assert.equal(corps.films.sansAffiche, 0);
  assert.equal(corps.chaines.total, 1475);
});

test("le journal expose le catalogue complet des codes", async () => {
  const { corps } = await demander("/api/admin/audit");
  assert.deepEqual(Object.keys(corps.codes), Object.keys(audit.CODES));
});

test("la déconnexion ferme la session", async () => {
  const { statut } = await demander("/api/admin/deconnexion", { method: "POST", body: "{}" });
  assert.equal(statut, 200);
  cookie = "";
  const { statut: refus } = await demander("/api/admin/sources");
  assert.equal(refus, 401);
});
