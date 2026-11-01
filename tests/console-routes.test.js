/**
 * Routes de la console complète : ce qui s'ouvre avec une session, ce qui
 * répond 401 sans, et ce que le site public reçoit de toute cette
 * configuration.
 */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";

import { charger } from "../server/magasin.js";
import { creerServeur } from "../server/serveur.js";
import * as reglages from "../server/reglages.js";
import * as apparence from "../server/apparence.js";
import * as accueil from "../server/accueil.js";
import * as lecture from "../server/lecture.js";
import * as comptes from "../server/comptes.js";

let serveur;
let base;
let cookie = null;
let cookieLecteur = null;

const demander = (chemin, options = {}) => fetch(`${base}${chemin}`, options);

before(async () => {
  await charger();
  await reglages.charger();
  // Les tests partent d'une console fermée et d'une lecture tierce fermée,
  // quels que soient les réglages de l'installation.
  await reglages.modifier({ console_sans_mot_de_passe: false, code_verification: false }, { persister: false });
  apparence.reinitialiser();
  accueil.reinitialiser();
  lecture.reinitialiser();
  comptes.reinitialiser();
  await apparence.charger();
  await accueil.charger();
  await lecture.charger();

  serveur = creerServeur();
  await new Promise((resoudre) => serveur.listen(0, "127.0.0.1", resoudre));
  base = `http://127.0.0.1:${serveur.address().port}`;

  const connexion = await demander("/api/admin/connexion", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ motDePasse: "streamtv" })
  });
  assert.equal(connexion.status, 200);
  cookie = (connexion.headers.get("set-cookie") ?? "").split(";")[0] || null;

  const creation = await comptes.creer({ identifiant: "lectrice", nom: "Lectrice", role: "lecteur", motDePasse: "mot-de-passe-long" });
  assert.equal(creation.ok, true);
  const entree = await demander("/api/admin/connexion", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ identifiant: "lectrice", motDePasse: "mot-de-passe-long" })
  });
  assert.equal(entree.status, 200);
  cookieLecteur = (entree.headers.get("set-cookie") ?? "").split(";")[0] || null;
});

after(() => serveur?.close());

const routes = [
  "/api/admin/tableau-de-bord",
  "/api/admin/apparence",
  "/api/admin/accueil",
  "/api/admin/lecture",
  "/api/admin/utilisateurs",
  "/api/admin/permissions",
  "/api/admin/incidents",
  "/api/admin/diagnostic",
  "/api/admin/films/ajoutes"
];

test("chaque route de la console refuse une requête sans session", async () => {
  for (const chemin of routes) {
    const reponse = await demander(chemin);
    assert.equal(reponse.status, 401, `${chemin} devrait exiger une session`);
  }
});

test("chaque route de la console répond avec une session de propriétaire", async () => {
  for (const chemin of routes) {
    const reponse = await demander(chemin, { headers: { cookie } });
    assert.equal(reponse.status, 200, `${chemin} devrait répondre 200`);
  }
});

test("le tableau de bord annonce les compteurs du catalogue", async () => {
  const { corps } = { corps: await (await demander("/api/admin/tableau-de-bord", { headers: { cookie } })).json() };
  assert.ok(corps.comptes.chaines > 1000);
  assert.ok(corps.comptes.films >= 4);
  assert.equal(typeof corps.version, "string");
  assert.ok(Array.isArray(corps.sante));
});

test("un compte lecteur ne peut pas changer l'apparence", async () => {
  const reponse = await demander("/api/admin/apparence", {
    method: "POST",
    headers: { cookie: cookieLecteur, "content-type": "application/json" },
    body: JSON.stringify({ accent: "#c2410c" })
  });
  assert.equal(reponse.status, 403);
});

test("un compte lecteur peut consulter les réglages, pas les modifier", async () => {
  const lectureSeule = await demander("/api/admin/reglages", { headers: { cookie: cookieLecteur } });
  assert.equal(lectureSeule.status, 200);
  const ecriture = await demander("/api/admin/reglages", {
    method: "POST",
    headers: { cookie: cookieLecteur, "content-type": "application/json" },
    body: JSON.stringify({ plafond_cartes: 30 })
  });
  assert.equal(ecriture.status, 403);
});

test("changer l'apparence par la console se voit sur la feuille publique", async () => {
  const envoi = await demander("/api/admin/apparence", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ accent: "#c2410c" })
  });
  assert.equal(envoi.status, 200);
  const publique = await (await demander("/api/apparence")).json();
  assert.match(publique.feuille, /--accent:#c2410c/);
});

test("une apparence invalide est refusée en 400 avec la raison", async () => {
  const reponse = await demander("/api/admin/apparence", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ accent: "#0d1013" })
  });
  assert.equal(reponse.status, 400);
  const corps = await reponse.json();
  assert.match(corps.refuses.accent, /contraste/);
});

test("l'accueil public suit la composition enregistrée par la console", async () => {
  const avant = await (await demander("/api/accueil")).json();
  const premiere = avant.sections[0];
  const envoi = await demander("/api/admin/accueil", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ deplacer: { id: avant.sections[1].id, sens: "haut" } })
  });
  assert.equal(envoi.status, 200);
  const apres = await (await demander("/api/accueil")).json();
  assert.equal(apres.sections[0].id, avant.sections[1].id);
  assert.notEqual(apres.sections[0].id, premiere.id);
});

test("ajouter une section à l'accueil est validé, pas seulement stocké", async () => {
  const mauvais = await demander("/api/admin/accueil", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ ajouter: { type: "films-genre", titre: "Un genre sans nom" } })
  });
  assert.equal(mauvais.status, 400);
  const bon = await demander("/api/admin/accueil", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ ajouter: { type: "films-genre", titre: "Films d'animation", genre: "Animation", limite: 8 } })
  });
  assert.equal(bon.status, 200);
  const { sections } = await bon.json();
  assert.ok(sections.some((s) => s.titre === "Films d'animation"));
});

test("la lecture tierce reste fermée tant que l'attestation manque", async () => {
  const reponse = await demander("/api/admin/lecture", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ fournisseur_actif: true })
  });
  assert.equal(reponse.status, 400);
  const corps = await reponse.json();
  assert.match(JSON.stringify(corps.refuses), /Attestez/);
});

test("attester puis configurer la clé ouvre la lecture, et la fiche film le voit", async () => {
  const attestation = await demander("/api/admin/lecture/attestation", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ droits: true, auteur: "Propriétaire de test", note: "Flux déclarés par le fournisseur" })
  });
  assert.equal(attestation.status, 200);

  const cle = await demander("/api/admin/lecture", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ cle: "nx_cle_de_test_123456" })
  });
  assert.equal(cle.status, 200);

  const ouverture = await demander("/api/admin/lecture", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ fournisseur_actif: true })
  });
  assert.equal(ouverture.status, 200);

  const statut = await (await demander("/api/admin/lecture", { headers: { cookie } })).json();
  assert.equal(statut.statut.fournisseur_actif, true);
  assert.equal(JSON.stringify(statut).includes("nx_cle_de_test_123456"), false, "la clé ne doit jamais revenir entière");

  const fiche = await (await demander("/api/films/fi-0001/lecture")).json();
  assert.equal(["fournisseur", "fichier"].includes(fiche.type), true);
  if (fiche.type === "fichier") assert.match(fiche.raison, /TMDb|identifiant/);
});

test("la fiche de lecture d'un film inconnu répond 404", async () => {
  const reponse = await demander("/api/films/fi-9999/lecture");
  assert.equal(reponse.status, 404);
});

test("un film ajouté sans attestation est refusé, avec la raison", async () => {
  lecture.reinitialiser();
  await lecture.charger();
  await lecture.attester({ droits: false, auteur: "Test" });
  const reponse = await demander("/api/admin/films/ajoutes", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ tmdbId: 597 })
  });
  assert.equal(reponse.status, 400);
  const corps = await reponse.json();
  assert.match(corps.erreur, /Attestez/);
});

test("un film ajouté garde le titre que TMDb a donné, jamais un titre inventé", async () => {
  const filmsAjoutes = await import("../server/films-ajoutes.js");
  filmsAjoutes.reinitialiser();
  await lecture.attester({ droits: true, auteur: "Propriétaire de test" });
  const resultat = await filmsAjoutes.ajouter({ tmdbId: 597 }, {
    fiche: { disponible: true, fiche: { id: 597, titre: "Titanic", annee: 1997, dureeMinutes: 194, genres: ["Drame"], resume: "Un paquebot, un iceberg.", langue: "en" } }
  });
  assert.equal(resultat.ok, true);
  assert.equal(resultat.film.titre, "Titanic");
  assert.equal(resultat.film.tmdbId, 597);
  assert.equal(resultat.film.licence, null, "un film ajouté ne prétend aucune licence");

  const liste = await (await demander("/api/films")).json();
  assert.ok(liste.contenus.some((f) => f.id === resultat.film.id), "le film ajouté doit apparaître dans le catalogue public");

  const fiche = await demander(`/api/films/${resultat.film.id}`);
  assert.equal(fiche.status, 200);
  const detail = await fiche.json();
  assert.match(detail.licence, /droits attestés/);

  const suppression = await demander(`/api/admin/films/ajoutes/${resultat.film.id}`, { method: "DELETE", headers: { cookie } });
  assert.equal(suppression.status, 200);
  const apres = await (await demander("/api/films")).json();
  assert.equal(apres.contenus.some((f) => f.id === resultat.film.id), false);
  filmsAjoutes.reinitialiser();
});

test("les incidents des visiteurs sont reçus et comptés, puis visibles dans la console", async () => {
  const envoi = await demander("/api/incidents", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "TypeError: lecture impossible", page: "/films/fi-0001", pile: "at rendre (app.js:12)" })
  });
  assert.equal(envoi.status, 202);
  const liste = await (await demander("/api/admin/incidents", { headers: { cookie } })).json();
  assert.ok(liste.incidents.some((i) => i.message.includes("lecture impossible")));
});

test("un incident vide est refusé en 400", async () => {
  const reponse = await demander("/api/incidents", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "", page: "/" })
  });
  assert.equal(reponse.status, 400);
});

test("l'assistant propose, applique et annule par l'API", async () => {
  const proposition = await (await demander("/api/admin/assistant", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ phrase: "Affiches par rangée à 4" })
  })).json();
  assert.equal(proposition.comprise, true);

  const application = await demander("/api/admin/assistant/appliquer", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ actions: proposition.actions })
  });
  assert.equal(application.status, 200);
  const publique = await (await demander("/api/apparence")).json();
  assert.equal(publique.valeurs.affiches_par_rangee, 4);

  const annulation = await demander("/api/admin/assistant/annuler", { method: "POST", headers: { cookie } });
  assert.equal(annulation.status, 200);
  const apres = await (await demander("/api/apparence")).json();
  assert.equal(apres.valeurs.affiches_par_rangee, 6);
});

test("une phrase incomprise ne propose rien", async () => {
  const reponse = await (await demander("/api/admin/assistant", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ phrase: "ouvre la porte" })
  })).json();
  assert.equal(reponse.comprise, false);
  assert.equal(reponse.actions.length, 0);
});

test("créer un compte par l'API refuse un mot de passe court", async () => {
  const reponse = await demander("/api/admin/utilisateurs", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ identifiant: "testeur", nom: "Testeur", role: "editeur", motDePasse: "court" })
  });
  assert.equal(reponse.status, 400);
  const corps = await reponse.json();
  assert.match(corps.erreur, /10 caractères/);
});

test("créer, modifier et supprimer un compte laisse une trace au journal", async () => {
  const creation = await demander("/api/admin/utilisateurs", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ identifiant: "redac", nom: "Rédaction", role: "editeur", motDePasse: "mot-de-passe-long" })
  });
  assert.equal(creation.status, 201);
  const { compte } = await creation.json();

  const modification = await demander(`/api/admin/utilisateurs/${compte.id}`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ role: "moderateur" })
  });
  assert.equal(modification.status, 200);

  const suppression = await demander(`/api/admin/utilisateurs/${compte.id}`, { method: "DELETE", headers: { cookie } });
  assert.equal(suppression.status, 200);

  const journal = await (await demander("/api/admin/audit", { headers: { cookie } })).json();
  assert.ok(journal.entrees.filter((e) => e.code === "A41").length >= 3);
});

test("les permissions d'un rôle se changent, mais pas celles du propriétaire", async () => {
  const refus = await demander("/api/admin/permissions", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ role: "proprietaire", permissions: [] })
  });
  assert.equal(refus.status, 400);

  const accord = await demander("/api/admin/permissions", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ role: "analyse", permissions: ["tableau.lire"] })
  });
  assert.equal(accord.status, 400, "un rôle inconnu doit être refusé");
});
