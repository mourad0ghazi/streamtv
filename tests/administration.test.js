/**
 * Surface d'administration : un port dédié à la console.
 *
 * Ce que ces tests protègent : la console s'ouvre depuis sa propre adresse,
 * elle n'y est pas moins protégée qu'ailleurs, et le port d'administration ne
 * devient pas une deuxième copie du catalogue.
 */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";

import { charger } from "../server/magasin.js";
import { creerServeur } from "../server/serveur.js";
import * as reglages from "../server/reglages.js";

let administration;
let site;
let baseAdmin;
let baseSite;
let cheminConsole;
let cookieSession = null;

before(async () => {
  await charger();
  await reglages.charger();
  cheminConsole = reglages.valeur("chemin_console");

  administration = creerServeur({ surface: "administration" });
  await new Promise((resoudre) => administration.listen(0, "127.0.0.1", resoudre));
  baseAdmin = `http://127.0.0.1:${administration.address().port}`;

  site = creerServeur();
  await new Promise((resoudre) => site.listen(0, "127.0.0.1", resoudre));
  baseSite = `http://127.0.0.1:${site.address().port}`;
});

after(() => {
  administration?.close();
  site?.close();
});

const demander = (base, chemin, options = {}) => fetch(`${base}${chemin}`, { redirect: "manual", ...options });

test("la racine du port d'administration mène à la console privée", async () => {
  const reponse = await demander(baseAdmin, "/");
  assert.equal(reponse.status, 302);
  assert.equal(reponse.headers.get("location"), cheminConsole);
  assert.equal(reponse.headers.get("cache-control"), "no-store");
});

test("la console est servie à son adresse privée sur ce port", async () => {
  const reponse = await demander(baseAdmin, cheminConsole);
  assert.equal(reponse.status, 200);
  const html = await reponse.text();
  assert.match(html, /console/);
  assert.match(html, /js\/admin\/console\.js/);
});

test("l'adresse privée reste inconnue à la racine du site", async () => {
  const reponse = await demander(baseSite, "/");
  const html = await reponse.text();
  assert.equal(html.includes(cheminConsole), false, "le site public ne doit pas citer l'adresse de la console");
});

test("le port d'administration ne sert aucune page du catalogue", async () => {
  for (const chemin of ["/chaines", "/anime", "/films", "/recherche", "/favoris", "/chaines/ch-00187"]) {
    const reponse = await demander(baseAdmin, chemin);
    assert.equal(reponse.status, 404, `${chemin} ne devrait pas exister sur le port d'administration`);
  }
});

test("la page d'erreur du port d'administration est en français et mène à la console", async () => {
  const reponse = await demander(baseAdmin, "/chaines");
  const html = await reponse.text();
  assert.match(html, /Ce port sert l'administration/);
  assert.ok(html.includes(`href="${cheminConsole}"`), "la page doit mener à la console");
});

test("les ressources de la console sont servies sur ce port", async () => {
  for (const chemin of ["/js/admin/console.js", "/js/api.js", "/css/base.css", "/icone.svg"]) {
    const reponse = await demander(baseAdmin, chemin);
    assert.equal(reponse.status, 200, `${chemin} absent du port d'administration`);
  }
});

test("la documentation citée par les onglets de la console est servie", async () => {
  const reponse = await demander(baseAdmin, "/docs/ADMINISTRATION.md");
  assert.equal(reponse.status, 200);
  assert.match(reponse.headers.get("content-type") ?? "", /text\/markdown/);
  assert.match(await reponse.text(), /ADMINISTRATION|Administration/);
});

test("l'API répond sur les deux ports, et la console reste fermée sans session", async () => {
  for (const base of [baseAdmin, baseSite]) {
    const etat = await demander(base, "/api/etat");
    assert.equal(etat.status, 200);
    const session = await demander(base, "/api/admin/session");
    assert.equal(session.status, 200);
    assert.equal((await session.json()).connecte, false, "aucune session ne doit exister sans mot de passe et sans code");

    const protege = await demander(base, "/api/admin/sources");
    assert.equal(protege.status, 401, "une route d'administration doit refuser l'accès sans session");
  }
});

test("une tentative de connexion avec le mauvais mot de passe est refusée sur le port d'administration", async () => {
  const reponse = await demander(baseAdmin, "/api/admin/connexion", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ motDePasse: "ce-n-est-pas-le-mot-de-passe", code: "000000" })
  });
  assert.ok(reponse.status === 401 || reponse.status === 403, `attendu 401 ou 403, reçu ${reponse.status}`);
  const corps = await reponse.json();
  assert.ok(corps.erreur?.length > 10, "le refus doit être expliqué en français");
});

test("le formulaire de connexion ne demande que le mot de passe quand le code n'est pas requis", async () => {
  const reponse = await demander(baseAdmin, "/api/admin/session");
  const etat = await reponse.json();
  assert.equal(etat.codeRequis, false, "le code doit être facultatif par défaut");

  const page = await (await demander(baseAdmin, cheminConsole)).text();
  const source = await (await demander(baseAdmin, "/js/admin/console.js")).text();
  assert.match(source, /etat\.codeRequis === true/, "le formulaire doit suivre le réglage du serveur");
  assert.match(source, /Renseignez le mot de passe pour entrer\./);
  assert.ok(page.includes("/js/admin/console.js"), "la console doit charger son module");
});

test("le mot de passe seul ouvre la session, et les réglages annoncent le code facultatif", async () => {
  const connexion = await fetch(`${baseAdmin}/api/admin/connexion`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ motDePasse: "streamtv" })
  });
  assert.equal(connexion.status, 200, "le mot de passe seul doit suffire quand le code est désactivé");
  cookieSession = (connexion.headers.get("set-cookie") ?? "").split(";")[0] || null;
  assert.ok(cookieSession?.startsWith("stv_session="));

  const reponse = await demander(baseAdmin, "/api/admin/reglages", { headers: { cookie: cookieSession } });
  assert.equal(reponse.status, 200);
  const { corps } = { corps: await reponse.json() };
  assert.equal(corps.valeurs.code_verification, false);
  const description = corps.description.find((d) => d.cle === "code_verification");
  assert.ok(description, "le réglage doit être décrit au serveur");
  assert.equal(description.type, "booleen");
  assert.equal(description.doc, "reglage-code-verification");

  const ferme = await demander(baseAdmin, "/api/admin/reglages");
  assert.equal(ferme.status, 401, "sans cookie, les réglages restent fermés");
});

test("le site complet reste la surface par défaut de creerServeur", async () => {
  const reponse = await demander(baseSite, "/chaines");
  assert.equal(reponse.status, 200);
  const racine = await demander(baseSite, "/");
  assert.equal(racine.status, 200, "la racine du site ne redirige pas");
});
