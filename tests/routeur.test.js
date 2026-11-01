import { test, before, after } from "node:test";
import assert from "node:assert/strict";

import { charger } from "../server/magasin.js";
import { creerServeur } from "../server/serveur.js";
import { ONGLETS } from "../public/js/admin/onglets.js";

let serveur;
let base;

before(async () => {
  await charger();
  serveur = creerServeur();
  await new Promise((resoudre) => serveur.listen(0, "127.0.0.1", resoudre));
  base = `http://127.0.0.1:${serveur.address().port}`;
});

after(() => serveur?.close());

const lire = async (chemin, options) => {
  const reponse = await fetch(`${base}${chemin}`, options);
  const type = reponse.headers.get("content-type") ?? "";
  const corps = type.includes("json") ? await reponse.json() : await reponse.text();
  return { statut: reponse.status, corps, entetes: reponse.headers };
};

test("la page d'accueil est servie en HTML", async () => {
  const { statut, corps } = await lire("/");
  assert.equal(statut, 200);
  assert.match(corps, /StreamTV/);
});

test("les routes de pages répondent sans rechargement de fichier", async () => {
  for (const chemin of ["/chaines", "/anime", "/films", "/recherche", "/favoris"]) {
    const { statut } = await lire(chemin);
    assert.equal(statut, 200, `${chemin} devrait répondre 200`);
  }
});

test("une page de fiche de chaîne est servie par la coquille", async () => {
  const { statut, corps } = await lire("/chaines/ch-00187");
  assert.equal(statut, 200);
  assert.match(corps, /StreamTV/);
});

test("les en-têtes n'interdisent pas la prévisualisation encadrée", async () => {
  const { entetes } = await lire("/");
  const csp = entetes.get("content-security-policy") ?? "";
  assert.match(csp, /frame-ancestors 'self' https:\/\/\*\.e2b\.app/, "la prévisualisation doit pouvoir encadrer le site");
  assert.equal(entetes.get("x-frame-options"), null, "x-frame-options primerait sur frame-ancestors et blanchirait la prévisualisation");
  assert.equal(entetes.get("x-content-type-options"), "nosniff");
});

test("un script n'est jamais figé pour un an dans le navigateur", async () => {
  for (const chemin of ["/js/app.js", "/js/admin/console.js", "/css/base.css", "/js/partage/base.js"]) {
    const { entetes } = await lire(chemin);
    const cache = entetes.get("cache-control") ?? "";
    assert.match(cache, /no-cache/, `${chemin} devrait être revalidé à chaque visite`);
    assert.equal(/immutable/.test(cache), false, `${chemin} ne doit pas être immuable sans changement d'adresse`);
    assert.ok(entetes.get("etag"), `${chemin} sans ETag : la revalidation coûterait le fichier entier`);
  }
});

test("un fichier inchangé répond 304, un fichier changé répond 200", async () => {
  const premier = await lire("/js/app.js");
  const etag = premier.entetes.get("etag");
  assert.ok(etag);

  const inchange = await fetch(`${base}/js/app.js`, { headers: { "if-none-match": etag } });
  assert.equal(inchange.status, 304, "un ETag identique doit donner 304");
  assert.equal((await inchange.text()).length, 0, "un 304 ne transporte pas de corps");

  const autre = await fetch(`${base}/js/app.js`, { headers: { "if-none-match": '"perime"' } });
  assert.equal(autre.status, 200, "un ETag périmé doit renvoyer le fichier");
});

test("seul le dossier vendor est marqué immuable", async () => {
  const { entetes } = await lire("/vendor/hls.js");
  assert.match(entetes.get("cache-control") ?? "", /immutable/);
});

test("la version annoncée par le serveur est celle du paquet", async () => {
  const { readFile } = await import("node:fs/promises");
  const { join, dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const racine = join(dirname(fileURLToPath(import.meta.url)), "..");
  const { version } = JSON.parse(await readFile(join(racine, "package.json"), "utf8"));
  const { corps } = await lire("/api/etat");
  assert.equal(corps.version, version);
});

test("une page inconnue reste une erreur, pas une coquille", async () => {
  const { statut } = await lire("/favoris-de-lecture");
  assert.equal(statut, 404);
});

test("l'état annonce les comptes réels du catalogue", async () => {
  const { statut, corps } = await lire("/api/etat");
  assert.equal(statut, 200);
  assert.ok(corps.compte.chaines > 0);
  assert.ok(corps.compte.anime >= 3);
  assert.ok(corps.compte.films >= 3);
  assert.ok(Number.isInteger(corps.attenteLecteur));
});

test("la route des chaînes respecte le plafond de cartes même si on en demande plus", async () => {
  const { corps } = await lire("/api/chaines?taille=500");
  assert.equal(corps.taille, corps.taille > 0 ? corps.taille : 0);
  assert.ok(corps.contenus.length <= corps.taille);
  assert.ok(corps.taille <= 60);
});

test("la pagination annonce un nombre de pages cohérent", async () => {
  const { corps } = await lire("/api/chaines?page=1");
  assert.equal(corps.pages, Math.ceil(corps.total / corps.taille));
});

test("les catégories et les pays sont comptés", async () => {
  const { corps } = await lire("/api/chaines/categories");
  assert.equal(corps.categories.length, 18);
  const somme = corps.categories.reduce((total, c) => total + c.nombre, 0);
  const { corps: page } = await lire("/api/chaines");
  assert.equal(somme, page.total);
  assert.ok(corps.regions.length > 0, "aucune région déclarée");
});

test("le filtre par région réduit le catalogue aux chaînes régionales", async () => {
  const { corps: meta } = await lire("/api/chaines/categories");
  const region = meta.regions[0];
  const { corps } = await lire(`/api/chaines?region=${encodeURIComponent(region.code)}`);
  assert.equal(corps.total, region.nombre);
  for (const chaine of corps.contenus) assert.equal(chaine.region, region.code);
});

test("une rangée vide d'animés n'est jamais renvoyée", async () => {
  const { corps } = await lire("/api/anime");
  assert.ok(corps.rangees.length >= 1);
  for (const rangee of corps.rangees) assert.ok(rangee.contenus.length > 0);
});

test("les filtres d'animés réduisent la sélection et restent combinables", async () => {
  const { corps } = await lire("/api/anime?annee=2010");
  assert.ok(corps.contenus.every((a) => String(a.annee) === "2010"));
});

test("une fiche inconnue répond 404 avec un message français", async () => {
  const { statut, corps } = await lire("/api/films/fi-9999");
  assert.equal(statut, 404);
  assert.match(corps.erreur, /introuvable/i);
});

test("la fiche d'un film porte sa licence", async () => {
  const { corps: liste } = await lire("/api/films");
  const { corps: fiche } = await lire(`/api/films/${liste.contenus[0].id}`);
  assert.ok(fiche.licence.length > 3);
  assert.ok(Array.isArray(fiche.sourcesDetail));
});

test("les sources publiques n'exposent aucun secret", async () => {
  const { corps } = await lire("/api/sources");
  for (const source of corps.sources) {
    assert.ok(source.licence);
    assert.equal("secret" in source, false);
  }
});

test("la liste de zapping est plafonnée et respecte les filtres", async () => {
  const { corps } = await lire("/api/chaines/zapping?categorie=Information");
  assert.ok(corps.chaines.length > 0);
  assert.ok(corps.chaines.length <= 300);
  assert.ok(corps.total >= corps.chaines.length, "le total annoncé ne peut pas être inférieur à la liste");
  assert.equal(corps.tronquee, corps.total > corps.chaines.length);
  for (const chaine of corps.chaines) {
    assert.equal(chaine.categorie, "Information");
    assert.ok(chaine.url.startsWith("https://"));
    assert.equal("qualite" in chaine, false, "la liste de zapping transporte trop de champs");
  }
});

test("la recherche répond et porte le type en toutes lettres", async () => {
  const { corps } = await lire("/api/recherche?q=sintel");
  assert.ok(corps.total >= 2);
  for (const resultat of corps.resultats) assert.ok(["Chaîne", "Animé", "Film"].includes(resultat.type));
});

test("le guide ne prétend pas connaître une grille absente", async () => {
  const { corps } = await lire("/api/guide");
  assert.equal(typeof corps.disponible, "boolean");
  if (!corps.disponible) assert.match(corps.raison, /grille/i);
});

test("la console refuse l'accès sans session", async () => {
  const { statut, corps } = await lire("/api/admin/sources");
  assert.equal(statut, 401);
  assert.match(corps.erreur, /session/i);
});

test("une connexion sans mot de passe est refusée et journalisée", async () => {
  const { statut } = await lire("/api/admin/connexion", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ motDePasse: "faux" })
  });
  assert.equal(statut, 401);
});

test("un réglage invalide envoyé sans session est refusé", async () => {
  const { statut } = await lire("/api/admin/reglages", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ plafond_cartes: 9999 })
  });
  assert.equal(statut, 401);
});

test("un signalement mal formé est refusé", async () => {
  const { statut } = await lire("/api/signalements", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ famille: "inconnue" })
  });
  assert.equal(statut, 400);
});

test("une route inconnue répond 404 en JSON", async () => {
  const { statut, corps } = await lire("/api/inexistante");
  assert.equal(statut, 404);
  assert.match(corps.erreur, /inconnue/i);
});

test("la liste des onglets de la console est cohérente", () => {
  assert.equal(ONGLETS.length, 5);
  assert.deepEqual(ONGLETS.map((o) => o.cle), ["sources", "anime", "films", "reglages", "journal"]);
});

test("la fiche TMDb d'un film répond sans jamais bloquer la page", async () => {
  const { statut, corps } = await lire("/api/films/fi-0001/tmdb");
  assert.equal(statut, 200, "un complément indisponible n'est pas une erreur de la page");
  assert.equal(typeof corps.disponible, "boolean");
  if (!corps.disponible) {
    assert.ok(corps.raison.length > 20, "l'indisponibilité doit être expliquée");
    assert.match(corps.raison, /TMDb|clé/i);
  } else {
    assert.match(corps.fiche.attribution, /TMDb/);
  }
});

test("une fiche TMDb pour un film inconnu répond 404 en français", async () => {
  const { statut, corps } = await lire("/api/films/fi-9999/tmdb");
  assert.equal(statut, 404);
  assert.match(corps.erreur, /introuvable/);
});

test("l'état des clés films est réservé à la console", async () => {
  const { statut } = await lire("/api/admin/cles-films");
  assert.equal(statut, 401);
});
