/**
 * Surface d'administration : un port dédié à la console.
 *
 * Ce que ces tests protègent : la console s'ouvre depuis sa propre adresse,
 * elle n'y est pas moins protégée qu'ailleurs, et le port d'administration ne
 * devient pas une deuxième copie du catalogue.
 */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";

import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { charger } from "../server/magasin.js";
import { creerServeur } from "../server/serveur.js";
import * as reglages from "../server/reglages.js";

let administration;
let site;
let baseAdmin;
let baseSite;
let cheminConsole;
let cookieSession = null;
const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");

before(async () => {
  await charger();
  await reglages.charger();
  // Les tests partent d'une console fermée, quel que soit le réglage de
  // l'installation ; les tests d'accès libre l'ouvrent explicitement.
  await reglages.modifier({ console_sans_mot_de_passe: false }, { persister: false });
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

test("le client garde le jeton hors des cookies et l'envoie en en-tête", async () => {
  const source = await (await demander(baseAdmin, "/js/api.js")).text();
  assert.match(source, /authorization = `Bearer \$\{jeton\}`/, "l'en-tête authorization doit être posé");
  assert.match(source, /x-stv-appareil/, "le verrou d'appareil doit suivre le même chemin");
  assert.match(source, /sessionStorage/, "le jeton doit survivre à un rechargement d'onglet");
  assert.match(source, /oublierSession/, "une session expirée doit être effacée du stockage");

  const console_ = await (await demander(baseAdmin, "/js/admin/console.js")).text();
  assert.match(console_, /memoriserSession\(reponse\)/, "la console doit garder le jeton de la réponse");
  assert.match(console_, /oublierSession\(\)/, "la déconnexion doit effacer le jeton");
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

test("le jeton de session fonctionne aussi dans un en-tête, sans cookie", async () => {
  const connexion = await fetch(`${baseAdmin}/api/admin/connexion`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ motDePasse: "streamtv" })
  });
  assert.equal(connexion.status, 200);
  const { jeton } = await connexion.json();
  assert.ok(jeton && jeton.length >= 32, "le jeton doit être renvoyé dans le corps, pour un cadre tiers");

  // Sans cookie, avec l'en-tête seul : c'est le cas d'une console affichée
  // dans un cadre venu d'un autre domaine.
  const session = await fetch(`${baseAdmin}/api/admin/session`, { headers: { authorization: `Bearer ${jeton}` } });
  assert.equal((await session.json()).connecte, true);

  const sources = await fetch(`${baseAdmin}/api/admin/sources`, { headers: { authorization: `Bearer ${jeton}` } });
  assert.equal(sources.status, 200);

  const sansRien = await fetch(`${baseAdmin}/api/admin/sources`);
  assert.equal(sansRien.status, 401, "sans jeton ni cookie, l'accès reste fermé");

  const faux = await fetch(`${baseAdmin}/api/admin/sources`, { headers: { authorization: "Bearer jeton-invente" } });
  assert.equal(faux.status, 401, "un jeton inventé ne vaut rien");
});

test("la déconnexion invalide le jeton, même porté en en-tête", async () => {
  const connexion = await fetch(`${baseAdmin}/api/admin/connexion`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ motDePasse: "streamtv" })
  });
  const { jeton } = await connexion.json();

  const sortie = await fetch(`${baseAdmin}/api/admin/deconnexion`, {
    method: "POST",
    headers: { authorization: `Bearer ${jeton}`, "content-type": "application/json" },
    body: "{}"
  });
  assert.equal(sortie.status, 200);

  const apres = await fetch(`${baseAdmin}/api/admin/session`, { headers: { authorization: `Bearer ${jeton}` } });
  assert.equal((await apres.json()).connecte, false, "un jeton déconnecté ne doit plus rien ouvrir");
});

test("un stockage refusé n'empêche pas de se connecter", async () => {
  const source = await (await demander(baseAdmin, "/js/api.js")).text();
  assert.match(source, /function essayer\(action\)/, "les accès au stockage doivent être protégés");
  assert.match(source, /catch \{\s*return null;\s*\}/, "un refus de stockage doit être absorbé");
  assert.match(source, /jetonMemoire/, "le jeton doit vivre en mémoire même sans stockage");
  assert.match(source, /globalThis\[type\]\?\.setItem/, "l'écriture doit tolérer un stockage absent");
});

/* ------------------------------------------------------------------ */
/* Accès libre, limité à la surface d'administration                  */
/* ------------------------------------------------------------------ */

test("sans le réglage, le port d'administration exige toujours une session", async () => {
  await reglages.modifier({ console_sans_mot_de_passe: false }, { persister: false });
  const reponse = await demander(baseAdmin, "/api/admin/sources");
  assert.equal(reponse.status, 401);
  const session = await demander(baseAdmin, "/api/admin/session");
  assert.equal((await session.json()).connecte, false);
});

test("avec le réglage, le port d'administration s'ouvre sans mot de passe", async () => {
  await reglages.modifier({ console_sans_mot_de_passe: true }, { persister: false });
  try {
    const session = await demander(baseAdmin, "/api/admin/session");
    const etat = await session.json();
    assert.equal(etat.connecte, true);
    assert.equal(etat.accesLibre, true);
    assert.equal(etat.role, "administrateur");
    assert.ok(etat.permissions.includes("sources.ecrire"));

    for (const chemin of ["/api/admin/sources", "/api/admin/reglages", "/api/admin/statistiques", "/api/admin/audit"]) {
      const reponse = await demander(baseAdmin, chemin);
      assert.equal(reponse.status, 200, `${chemin} devrait être ouvert en accès libre`);
    }

    const connexion = await demander(baseAdmin, "/api/admin/connexion", { method: "POST", body: "{}" });
    assert.equal(connexion.status, 200, "la connexion doit aboutir sans mot de passe");
    assert.equal((await connexion.json()).accesLibre, true);
  } finally {
    await reglages.modifier({ console_sans_mot_de_passe: false }, { persister: false });
  }
});

test("l'accès libre ne s'applique jamais au site public", async () => {
  await reglages.modifier({ console_sans_mot_de_passe: true }, { persister: false });
  try {
    const session = await demander(baseSite, "/api/admin/session");
    assert.equal((await session.json()).connecte, false, "le site public ne doit pas hériter de l'accès libre");
    assert.equal((await demander(baseSite, "/api/admin/sources")).status, 401);
    assert.equal((await demander(baseSite, "/api/admin/reglages")).status, 401);
    assert.equal((await demander(baseSite, "/api/admin/statistiques")).status, 401);
  } finally {
    await reglages.modifier({ console_sans_mot_de_passe: false }, { persister: false });
  }
});

test("l'accès libre est journalisé une fois, et la console l'annonce", async () => {
  const journal = await readFile(join(RACINE, "server", "audit.js"), "utf8");
  assert.match(journal, /export async function journaliser/);

  const routeur = await readFile(join(RACINE, "server", "routeur.js"), "utf8");
  assert.match(routeur, /accesLibreJournalise/, "l'ouverture doit laisser une trace");
  assert.match(routeur, /acces: "libre"/);

  const console_ = await (await demander(baseAdmin, "/js/admin/console.js")).text();
  assert.match(console_, /Accès libre/, "la console doit afficher un bandeau");
  assert.match(console_, /session\.accesLibre/);
});

test("le réglage est décrit au serveur et se ferme depuis la console", async () => {
  const { DESCRIPTION } = await import("../server/reglages.js");
  const description = DESCRIPTION.find((d) => d.cle === "console_sans_mot_de_passe");
  assert.ok(description, "le réglage doit exister");
  assert.equal(description.type, "booleen");
  assert.equal(description.doc, "reglage-console-sans-mot-de-passe");
  assert.match(description.risque, /port d'administration/);

  const refus = await reglages.modifier({ console_sans_mot_de_passe: "oui" }, { persister: false });
  assert.equal(refus.applique, false, "une valeur non booléenne doit être refusée");
  assert.match(refus.refuses.console_sans_mot_de_passe, /vrai ou faux/);
});

test("la console voit l'état des clés films, sans jamais leur valeur", async () => {
  await reglages.modifier({ console_sans_mot_de_passe: true }, { persister: false });
  try {
    const reponse = await demander(baseAdmin, "/api/admin/cles-films");
    assert.equal(reponse.status, 200);
    const corps = await reponse.json();
    assert.equal(typeof corps.cles.tmdb, "number");
    assert.equal(typeof corps.cles.disponible, "boolean");
    assert.ok(corps.cles.tmdb >= 0);
    assert.match(corps.attribution, /TMDb/);
    assert.equal(typeof corps.cache.entrees, "number");

    const texte = JSON.stringify(corps);
    const { cleListe } = await import("../server/cles-films.js");
    const premiere = await cleListe("tmdb", 0);
    if (premiere) assert.equal(texte.includes(premiere), false, "une clé ne doit jamais sortir du serveur");
  } finally {
    await reglages.modifier({ console_sans_mot_de_passe: false }, { persister: false });
  }
});
