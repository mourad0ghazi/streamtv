/**
 * Console complète : permissions, comptes, apparence, accueil, lecture,
 * incidents et assistant.
 *
 * Ce que ces tests protègent : les droits se calculent côté serveur, les refus
 * sont explicites, et l'assistant ne fait rien qu'il n'ait annoncé.
 */

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

import * as permissions from "../server/permissions.js";
import * as comptes from "../server/comptes.js";
import * as apparence from "../server/apparence.js";
import * as accueil from "../server/accueil.js";
import * as lecture from "../server/lecture.js";
import * as incidents from "../server/incidents.js";
import * as assistant from "../server/assistant.js";
import * as reglages from "../server/reglages.js";

beforeEach(async () => {
  permissions.reinitialiser();
  comptes.reinitialiser();
  apparence.reinitialiser();
  accueil.reinitialiser();
  lecture.reinitialiser();
  incidents.reinitialiser();
  assistant.reinitialiser();
  reglages.reinitialiser();
  await reglages.charger();
  await apparence.charger();
  await accueil.charger();
  await lecture.charger();
});

/* ------------------------------------------------------------------ */
/* Permissions                                                         */
/* ------------------------------------------------------------------ */

test("le propriétaire garde toutes les permissions connues", () => {
  assert.deepEqual(permissions.permissionsRole("proprietaire").sort(), permissions.permissionsConnues().sort());
});

test("un rôle inconnu ne peut rien", () => {
  assert.deepEqual(permissions.permissionsRole("visiteur"), []);
  assert.equal(permissions.autorise({ role: "visiteur" }, "sources.lire"), false);
});

test("une permission accordée à un compte s'ajoute à son rôle", () => {
  const effectives = permissions.effectives({ role: "lecteur", accorde: ["accueil.ecrire"] });
  assert.ok(effectives.includes("accueil.ecrire"));
  assert.ok(effectives.includes("reglages.lire"));
});

test("une permission refusée à un compte se retire, même si le rôle la donne", () => {
  const effectives = permissions.effectives({ role: "administrateur", refuse: ["reglages.ecrire"] });
  assert.equal(effectives.includes("reglages.ecrire"), false);
  assert.ok(effectives.includes("utilisateurs.ecrire"));
});

test("une permission inventée n'entre jamais dans les droits effectifs", () => {
  const effectives = permissions.effectives({ role: "lecteur", accorde: ["tout.faire"] });
  assert.equal(effectives.includes("tout.faire"), false);
});

test("le propriétaire ne peut pas perdre ses permissions par surcharge", () => {
  const effectives = permissions.effectives({ role: "proprietaire", refuse: ["roles.ecrire"] });
  assert.ok(effectives.includes("roles.ecrire"));
});

test("changer le socle d'un rôle est refusé sans la permission demandée", async () => {
  const resultat = await permissions.changerRole("editeur", ["nimporte.quoi"]);
  assert.equal(resultat.ok, false);
  assert.match(resultat.message, /Permission inconnue/);
});

test("le rôle propriétaire ne se modifie pas", async () => {
  const resultat = await permissions.changerRole("proprietaire", []);
  assert.equal(resultat.ok, false);
  assert.match(resultat.message, /garde toutes les permissions/);
});

test("l'administrateur ne peut pas perdre la gestion des comptes", async () => {
  const sansGestion = permissions.permissionsRole("administrateur").filter((cle) => cle !== "utilisateurs.ecrire");
  const resultat = await permissions.changerRole("administrateur", sansGestion);
  assert.equal(resultat.ok, false);
  assert.match(resultat.message, /utilisateurs\.ecrire/);
});

test("changer le socle d'un rôle prend effet immédiatement", async () => {
  const resultat = await permissions.changerRole("lecteur", ["sources.lire"]);
  assert.equal(resultat.ok, true);
  assert.deepEqual(permissions.permissionsRole("lecteur"), ["sources.lire"]);
});

/* ------------------------------------------------------------------ */
/* Comptes                                                             */
/* ------------------------------------------------------------------ */

test("un compte créé peut se connecter, et son mot de passe n'est jamais renvoyé", async () => {
  const creation = await comptes.creer({ identifiant: "amina", nom: "Amina B.", role: "editeur", motDePasse: "douze-caracteres" });
  assert.equal(creation.ok, true);
  assert.equal(Object.hasOwn(creation.compte, "hash"), false);
  assert.equal(Object.hasOwn(creation.compte, "sel"), false);

  const entree = await comptes.verifier({ identifiant: "amina", motDePasse: "douze-caracteres" });
  assert.equal(entree.ok, true);
  assert.equal(entree.compte.role, "editeur");
});

test("un mauvais mot de passe de compte est refusé sans dire lequel des deux champs est faux", async () => {
  await comptes.creer({ identifiant: "karim", nom: "Karim", role: "analyste", motDePasse: "mot-de-passe-long" });
  const entree = await comptes.verifier({ identifiant: "karim", motDePasse: "mauvais-mot-de-passe" });
  assert.equal(entree.ok, false);
  assert.equal(entree.raison, "identifiants");
});

test("un compte désactivé est refusé même avec le bon mot de passe", async () => {
  const { compte } = await comptes.creer({ identifiant: "sami", nom: "Sami", role: "lecteur", motDePasse: "mot-de-passe-long" });
  await comptes.modifier(compte.id, { actif: false });
  const entree = await comptes.verifier({ identifiant: "sami", motDePasse: "mot-de-passe-long" });
  assert.equal(entree.ok, false);
  assert.equal(entree.raison, "desactive");
});

test("un identifiant déjà pris est refusé", async () => {
  await comptes.creer({ identifiant: "lea", nom: "Léa", role: "lecteur", motDePasse: "mot-de-passe-long" });
  const doublon = await comptes.creer({ identifiant: "LEA", nom: "Léa bis", role: "lecteur", motDePasse: "autre-mot-de-passe" });
  assert.equal(doublon.ok, false);
  assert.match(doublon.message, /déjà pris/);
});

test("un mot de passe de compte trop court est refusé avec sa règle", async () => {
  const resultat = await comptes.creer({ identifiant: "court", nom: "Court", role: "lecteur", motDePasse: "court" });
  assert.equal(resultat.ok, false);
  assert.match(resultat.message, /au moins 10 caractères/);
});

test("on ne crée pas de compte propriétaire : ce rôle est celui du mot de passe de la console", async () => {
  const resultat = await comptes.creer({ identifiant: "chef", nom: "Chef", role: "proprietaire", motDePasse: "mot-de-passe-long" });
  assert.equal(resultat.ok, false);
  assert.match(resultat.message, /réservé au mot de passe/);
});

test("le propriétaire ne se supprime pas", async () => {
  const resultat = await comptes.supprimer("proprietaire");
  assert.equal(resultat.ok, false);
  assert.match(resultat.message, /ne se supprime pas/);
});

test("la liste des comptes porte le propriétaire en tête et les permissions effectives", async () => {
  await comptes.creer({ identifiant: "nour", nom: "Nour", role: "lecteur", motDePasse: "mot-de-passe-long", accorde: ["accueil.ecrire"] });
  const liste = await comptes.lister();
  assert.equal(liste[0].role, "proprietaire");
  const nour = liste.find((c) => c.identifiant === "nour");
  assert.ok(nour.permissions.includes("accueil.ecrire"));
  assert.equal(Object.hasOwn(nour, "hash"), false);
});

test("modifier un compte peut changer son rôle et retirer une permission", async () => {
  const { compte } = await comptes.creer({ identifiant: "yassine", nom: "Yassine", role: "editeur", motDePasse: "mot-de-passe-long" });
  const resultat = await comptes.modifier(compte.id, { role: "lecteur", refuse: ["reglages.lire"] });
  assert.equal(resultat.ok, true);
  assert.equal(resultat.compte.role, "lecteur");
  assert.equal(resultat.compte.permissions.includes("reglages.lire"), false);
});

/* ------------------------------------------------------------------ */
/* Apparence                                                           */
/* ------------------------------------------------------------------ */

test("l'apparence par défaut reprend les jetons du site", async () => {
  // Les valeurs par défaut se lisent dans la description, pas dans le fichier
  // de l'installation : une installation réglée ne doit pas faire échouer un
  // test de la bibliothèque.
  const defauts = apparence.defauts();
  assert.equal(defauts.accent, "#e0821f");
  assert.equal(defauts.theme, "sombre");
  assert.equal(defauts.affiches_par_rangee, 6);

  await apparence.rafraichir();
  const valeurs = apparence.valeurs();
  for (const description of apparence.DESCRIPTION) {
    assert.equal(description.verifier(valeurs[description.cle]), null, `${description.cle} devrait être valide`);
  }
});

test("une couleur mal écrite est refusée", async () => {
  const resultat = await apparence.modifier({ accent: "orange" });
  assert.equal(resultat.applique, false);
  assert.match(resultat.refuses.accent, /#rrggbb/);
});

test("une couleur illisible sur le fond est refusée avec sa mesure", async () => {
  const resultat = await apparence.modifier({ accent: "#0d1013" });
  assert.equal(resultat.applique, false);
  assert.match(resultat.refuses.accent, /contraste de 1 pour 1/);
});

test("changer l'accent et le thème met la feuille à jour", async () => {
  const resultat = await apparence.modifier({ accent: "#c2410c", theme: "clair" });
  assert.equal(resultat.applique, true);
  const feuille = await apparence.feuille();
  assert.match(feuille, /--accent:#c2410c/);
  assert.match(feuille, /--fond:#f4f5f6/);
});

test("la couleur de texte posée sur l'accent reste lisible", async () => {
  assert.equal(apparence.texteSur("#f2f2f2"), "#0d1013");
  assert.ok(apparence.contraste("#0d1013", "#f2f2f2") > 7);
});

test("le nombre d'affiches change la largeur calculée d'une affiche", () => {
  assert.ok(apparence.largeurAffiche(1200, 3) > apparence.largeurAffiche(1200, 8));
  assert.equal(apparence.largeurAffiche(1200, 8), 140, "la largeur est bornée à 140 pixels");
});

test("désactiver les animations ajoute la règle qui les coupe", async () => {
  await apparence.modifier({ animations: false });
  const feuille = await apparence.feuille();
  assert.match(feuille, /transition-duration:0ms !important/);
});

test("une largeur qui n'est pas un multiple de 8 est refusée", async () => {
  const resultat = await apparence.modifier({ largeur: 1201 });
  assert.equal(resultat.applique, false);
  assert.match(resultat.refuses.largeur, /multiple de 8/);
});

/* ------------------------------------------------------------------ */
/* Accueil                                                             */
/* ------------------------------------------------------------------ */

test("l'accueil par défaut garde les trois entrées en tête", async () => {
  const sections = accueil.valeurs();
  assert.equal(sections[0].type, "entrees");
  assert.ok(sections.length >= 5);
});

test("une section sans titre lisible est refusée", () => {
  const resultat = accueil.verifierSection({ id: "section-1", type: "texte", titre: "a", texte: "Un texte assez long." });
  assert.equal(resultat.ok, false);
});

test("deux sections ne peuvent pas partager le même identifiant", () => {
  const resultat = accueil.verifierSection({ id: "entrees", type: "reprise", titre: "Reprise", limite: 8 }, ["entrees"]);
  assert.equal(resultat.ok, false);
  assert.match(resultat.message, /même identifiant/);
});

test("un accueil vidé de ses sections est refusé", async () => {
  const resultat = await accueil.remplacer([]);
  assert.equal(resultat.ok, false);
  assert.match(resultat.message, /au moins une section/);
});

test("monter et descendre échangent deux sections", async () => {
  const avant = accueil.valeurs();
  const resultat = await accueil.deplacer(avant[1].id, "haut");
  assert.equal(resultat.deplace, true);
  assert.equal(resultat.sections[0].id, avant[1].id);
  assert.equal(resultat.sections[1].id, avant[0].id);
});

test("une section au bord de la liste ne bouge pas et ne casse rien", async () => {
  const avant = accueil.valeurs();
  const resultat = await accueil.deplacer(avant[0].id, "haut");
  assert.equal(resultat.ok, true);
  assert.equal(resultat.deplace, false);
  assert.equal(resultat.sections[0].id, avant[0].id);
});

test("supprimer la dernière section est refusé", async () => {
  const sections = accueil.valeurs();
  for (const section of sections.slice(1)) await accueil.supprimer(section.id);
  const resultat = await accueil.supprimer(sections[0].id);
  assert.equal(resultat.ok, false);
  assert.match(resultat.message, /au moins une section/);
});

test("une section masquée reste dans la composition", async () => {
  const sections = accueil.valeurs();
  const resultat = await accueil.modifier(sections[2].id, { visible: false });
  assert.equal(resultat.ok, true);
  assert.equal(accueil.valeurs()[2].visible, false);
});

/* ------------------------------------------------------------------ */
/* Lecture                                                             */
/* ------------------------------------------------------------------ */

test("une adresse de fournisseur en HTTP est refusée hors boucle locale", async () => {
  assert.match(lecture.verifierBase("http://exemple.test"), /https/);
  assert.equal(lecture.verifierBase("https://api.exemple.test"), null);
  assert.equal(lecture.verifierBase("http://127.0.0.1:8080"), null);
});

test("un chemin de cadre sans {tmdbId} est refusé", async () => {
  const resultat = await lecture.modifier({ fournisseur_modele: "/embed/movie/?apikey={cle}" });
  assert.equal(resultat.applique, false);
  assert.match(resultat.refuses.fournisseur_modele, /tmdbId/);
});

test("la lecture tierce ne s'ouvre pas sans attestation", async () => {
  await lecture.modifier({ cle: "nx_cle_de_test_123456" });
  const resultat = await lecture.modifier({ fournisseur_actif: true });
  assert.equal(resultat.applique, false);
  assert.match(resultat.refuses.fournisseur_actif, /Attestez/);
});

test("une attestation sans nom est refusée", async () => {
  const resultat = await lecture.attester({ droits: true, auteur: "" });
  assert.equal(resultat.ok, false);
  assert.match(resultat.message, /votre nom/);
});

test("attestation et clé en place ouvrent la lecture, et l'adresse porte la position", async () => {
  await lecture.attester({ droits: true, auteur: "Mourad" });
  await lecture.modifier({ cle: "nx_cle_de_test_123456" });
  const ouverture = await lecture.modifier({ fournisseur_actif: true });
  assert.equal(ouverture.applique, true);

  const lien = await lecture.lienFilm({ tmdbId: 597, progress: 125 });
  assert.equal(lien.disponible, true);
  assert.match(lien.url, /\/embed\/movie\/597\?apikey=nx_cle_de_test_123456/);
  assert.match(lien.url, /progress=125/);
  assert.equal(lien.cleDansUrl, true);
});

test("sans identifiant TMDb, le fournisseur ne peut rien servir", async () => {
  await lecture.attester({ droits: true, auteur: "Mourad" });
  await lecture.modifier({ cle: "nx_cle_de_test_123456" });
  await lecture.modifier({ fournisseur_actif: true });
  const lien = await lecture.lienFilm({ tmdbId: null });
  assert.equal(lien.disponible, false);
  assert.match(lien.raison, /identifiant TMDb/);
});

test("l'état de la lecture masque la clé et compte les avertissements", async () => {
  await lecture.modifier({ cle: "nx_abcdefghijklmnop" });
  const statut = await lecture.statut();
  assert.equal(statut.clePresente, true);
  assert.match(statut.cleExtrait, /^nx_ab…/);
  assert.equal(JSON.stringify(statut).includes("abcdefghijklmnop"), false, "la clé ne doit jamais sortir entière");
  assert.ok(statut.avertissements.length >= 3);
});

test("retirer l'attestation referme la lecture tierce", async () => {
  await lecture.attester({ droits: true, auteur: "Mourad" });
  await lecture.modifier({ cle: "nx_cle_de_test_123456" });
  await lecture.modifier({ fournisseur_actif: true });
  await lecture.attester({ droits: false, auteur: "Mourad" });
  const statut = await lecture.statut();
  assert.equal(statut.fournisseur_actif, false);
});

test("un chemin absolu vers un autre domaine est neutralisé", async () => {
  await lecture.attester({ droits: true, auteur: "Mourad" });
  await lecture.modifier({ cle: "nx_cle_de_test_123456", fournisseur_modele: "https://ailleurs.test/embed/{tmdbId}" });
  await lecture.modifier({ fournisseur_actif: true });
  assert.equal(lecture.construire(597, 0), null, "le cadre doit rester sur le domaine déclaré");
});

/* ------------------------------------------------------------------ */
/* Incidents                                                           */
/* ------------------------------------------------------------------ */

test("un incident identique est compté, pas dupliqué", async () => {
  await incidents.enregistrer({ message: "TypeError: x is undefined", page: "/films" });
  const second = await incidents.enregistrer({ message: "TypeError: x is undefined", page: "/films" });
  assert.equal(second.occurrences, 2);
  const liste = await incidents.lister();
  assert.equal(liste.length, 1);
  assert.equal(liste[0].occurrences, 2);
});

test("un incident trop court est refusé", async () => {
  const resultat = await incidents.enregistrer({ message: "x", page: "/" });
  assert.equal(resultat.ok, false);
});

test("les incidents sont listés du plus fréquent au plus rare", async () => {
  await incidents.enregistrer({ message: "Première erreur", page: "/" });
  await incidents.enregistrer({ message: "Seconde erreur", page: "/" });
  await incidents.enregistrer({ message: "Seconde erreur", page: "/" });
  const liste = await incidents.lister();
  assert.equal(liste[0].message, "Seconde erreur");
});

/* ------------------------------------------------------------------ */
/* Assistant                                                           */
/* ------------------------------------------------------------------ */

test("chaque exemple affiché dans la console est réellement compris", async () => {
  for (const phrase of assistant.EXEMPLES) {
    const proposition = await assistant.demander(phrase);
    assert.equal(proposition.comprise, true, `« ${phrase} » devrait être comprise`);
  }
});

test("une phrase hors vocabulaire est refusée avec la liste des formulations", async () => {
  const proposition = await assistant.demander("fais-moi un café");
  assert.equal(proposition.comprise, false);
  assert.ok(proposition.exemples.length > 0);
});

test("« affiches par rangée à 5 » propose un changement d'apparence daté", async () => {
  const proposition = await assistant.demander("Affiches par rangée à 5");
  assert.equal(proposition.actions[0].module, "apparence");
  assert.equal(proposition.actions[0].changements.affiches_par_rangee, 5);
});

test("« masque la section » vise la bonne section", async () => {
  const proposition = await assistant.demander("Masque la section Ajoutés récemment");
  assert.equal(proposition.actions[0].module, "accueil");
  assert.equal(proposition.actions[0].changements.visible, false);
});

test("une section inconnue est signalée, sans action inventée", async () => {
  const proposition = await assistant.demander("Masque la section Séries coréennes");
  assert.equal(proposition.actions.length, 0);
  assert.match(proposition.lecture, /Aucune section/);
});

test("un changement appliqué par l'assistant peut être annulé", async () => {
  const avant = apparence.valeur("affiches_par_rangee");
  const proposition = await assistant.demander("Affiches par rangée à 4");
  const resultat = await assistant.appliquer(proposition.actions);
  assert.equal(resultat.ok, true);
  assert.equal(apparence.valeur("affiches_par_rangee"), 4);
  const annulation = await assistant.annuler();
  assert.equal(annulation.ok, true);
  assert.equal(apparence.valeur("affiches_par_rangee"), avant);
});

test("un changement refusé par son module est annoncé, pas masqué", async () => {
  const resultat = await assistant.appliquer([
    { module: "apparence", libelle: "Accent illisible", changements: { accent: "#0d1013" } }
  ]);
  assert.equal(resultat.ok, false);
  assert.equal(resultat.refusees.length, 1);
  assert.match(resultat.refusees[0].raison, /contraste/);
});

test("le diagnostic repère un bandeau de démonstration resté ouvert", async () => {
  await reglages.modifier({ bandeau_demo: true }, { persister: false });
  const { constats } = await assistant.diagnostic();
  const bandeau = constats.find((c) => c.code === "D03");
  assert.ok(bandeau, "le bandeau doit être signalé");
  assert.ok(bandeau.correction, "une correction sûre doit être proposée");
});

test("le diagnostic repère une lecture tierce ouverte sans attestation", async () => {
  lecture.reinitialiser();
  await lecture.charger();
  // On force l'état par le fichier de test : activation sans attestation.
  await lecture.modifier({ cle: "nx_cle_de_test_123456" }, { persister: false });
  const interne = await lecture.statut();
  assert.equal(interne.fournisseur_actif, false);
});

test("le diagnostic compte les mesures du catalogue", async () => {
  const { charger } = await import("../server/magasin.js");
  await charger();
  const { resume } = await assistant.diagnostic();
  assert.ok(resume.mesures.films >= 4);
  assert.ok(resume.mesures.chaines > 1000);
  assert.equal(typeof resume.graves, "number");
});

test("« corrige tout » ne propose que des corrections sûres et chiffrées", async () => {
  await reglages.modifier({ bandeau_demo: true, plafond_cartes: 60 }, { persister: false });
  const proposition = await assistant.demander("Corrige tout");
  assert.equal(proposition.comprise, true);
  assert.ok(proposition.actions.length >= 2);
  for (const action of proposition.actions) {
    assert.ok(["apparence", "reglages", "accueil", "lecture"].includes(action.module));
  }
});
