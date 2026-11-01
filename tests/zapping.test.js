import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { Noeud, parClasse, parBalise, texte, toucheDocument } from "./aide/dom-factice.js";
import * as zapping from "../public/js/zapping.js";

const A = { id: "ch-1", nom: "2M Monde", categorie: "Généraliste", url: "https://exemple.test/a.m3u8", logo: "" };
const B = { id: "ch-2", nom: "Chada TV", categorie: "Divertissement", url: "https://exemple.test/b.m3u8", logo: "" };
const C = { id: "ch-3", nom: "Medi1TV", categorie: "Information", url: "https://exemple.test/c.m3u8", logo: "" };

beforeEach(() => {
  localStorage.clear();
});

/* ---------------------------------------------------------------- */
/* État local                                                        */
/* ---------------------------------------------------------------- */

test("la dernière chaîne regardée est retenue et relue", () => {
  zapping.memoriserChaine(A);
  const derniere = zapping.derniereChaine();
  assert.equal(derniere.id, "ch-1");
  assert.equal(derniere.nom, "2M Monde");
  assert.equal(derniere.url, "https://exemple.test/a.m3u8");
});

test("les chaînes récentes sont ordonnées de la plus récente à la plus ancienne", () => {
  zapping.memoriserChaine(A);
  zapping.memoriserChaine(B);
  zapping.memoriserChaine(C);
  assert.deepEqual(zapping.recentes().map((c) => c.id), ["ch-3", "ch-2", "ch-1"]);
});

test("revoir une chaîne ne la duplique pas dans les récentes", () => {
  zapping.memoriserChaine(A);
  zapping.memoriserChaine(B);
  zapping.memoriserChaine(A);
  assert.deepEqual(zapping.recentes().map((c) => c.id), ["ch-1", "ch-2"]);
});

test("les récentes sont plafonnées à douze chaînes", () => {
  for (let i = 0; i < 20; i += 1) {
    zapping.memoriserChaine({ id: `ch-${i}`, nom: `Chaîne ${i}`, categorie: "", url: "https://exemple.test/x.m3u8" });
  }
  const recentes = zapping.recentes();
  assert.equal(recentes.length, zapping.RECENTES_MAX);
  assert.equal(recentes[0].id, "ch-19");
});

test("oublier une chaîne la retire des récentes et met la suivante en tête", () => {
  zapping.memoriserChaine(A);
  zapping.memoriserChaine(B);
  zapping.oublierChaine("ch-2");
  assert.deepEqual(zapping.recentes().map((c) => c.id), ["ch-1"]);
  assert.equal(zapping.derniereChaine().id, "ch-1");
});

test("un stockage corrompu ne fait pas planter la lecture", () => {
  localStorage.setItem(zapping.CLE, "{ pas du json");
  assert.equal(zapping.derniereChaine(), null);
  assert.deepEqual(zapping.recentes(), []);
  assert.equal(zapping.volume(), 1);
});

test("le volume est mémorisé et borné", () => {
  zapping.memoVolume(0.35);
  assert.equal(zapping.volume(), 0.35);
  zapping.memoVolume(4);
  assert.equal(zapping.volume(), 1);
  zapping.memoVolume(-2);
  assert.equal(zapping.volume(), 0);
});

test("la coupure du son est mémorisée", () => {
  assert.equal(zapping.sonCoupe(), false);
  zapping.memoSonCoupe(true);
  assert.equal(zapping.sonCoupe(), true);
  zapping.memoSonCoupe(false);
  assert.equal(zapping.sonCoupe(), false);
});

test("le numéro d'une chaîne part de un, et zéro hors de la liste", () => {
  const liste = [A, B, C];
  assert.equal(zapping.numeroDansListe(liste, "ch-1"), 1);
  assert.equal(zapping.numeroDansListe(liste, "ch-3"), 3);
  assert.equal(zapping.numeroDansListe(liste, "ch-9"), 0);
  assert.equal(zapping.numeroDansListe([], "ch-1"), 0);
});

test("le zapping boucle dans les deux sens", () => {
  const liste = [A, B, C];
  assert.equal(zapping.voisin(liste, 0, -1), 2);
  assert.equal(zapping.voisin(liste, 2, 1), 0);
  assert.equal(zapping.voisin(liste, 1, 1), 2);
  assert.equal(zapping.voisin([], 0, 1), -1);
});

/* ---------------------------------------------------------------- */
/* Lecteur                                                           */
/* ---------------------------------------------------------------- */

const { regarderChaine } = await import("../public/js/lecteur.js");

const liste = [A, B, C].map((c) => ({ ...c, pays: "MA" }));

function ouvrirLecteur() {
  return regarderChaine(liste[0], { liste, index: 0, attenteSecondes: 5 });
}

test("le lecteur affiche le numéro de chaîne et le nom", () => {
  const lecteur = ouvrirLecteur();
  const barre = parClasse(lecteur.racine, "lecteur__barre")[0];
  const contenu = texte(barre);
  assert.match(contenu, /1 \/ 3/);
  assert.match(contenu, /2M Monde/);
  lecteur.fermer();
});

test("la liste de zapping est présente et masquée au départ", () => {
  const lecteur = ouvrirLecteur();
  const panneau = parClasse(lecteur.racine, "lecteur__panneau")[0];
  assert.ok(panneau);
  assert.equal(panneau.getAttribute("hidden"), "");
  const items = parClasse(lecteur.racine, "lecteur__item");
  assert.equal(items.length, 3);
  lecteur.fermer();
});

test("une liste plafonnée le dit dans le panneau au lieu de faire croire au total", () => {
  const lecteur = regarderChaine(liste[0], { liste, index: 0, attenteSecondes: 5, tronquee: true, totalListe: 135 });
  toucheDocument("l");
  const compte = texte(parClasse(lecteur.racine, "lecteur__compte")[0]);
  assert.match(compte, /3 chaînes affichées sur 135/);
  assert.match(compte, /plafonnée/);
  lecteur.fermer();
});

test("une liste complète n'annonce aucune troncature", () => {
  const lecteur = ouvrirLecteur();
  toucheDocument("l");
  const compte = texte(parClasse(lecteur.racine, "lecteur__compte")[0]);
  assert.equal(compte, "3 chaîne(s) sur 3");
  lecteur.fermer();
});

test("la flèche du bas passe à la chaîne suivante et l'annonce", () => {
  const lecteur = ouvrirLecteur();
  toucheDocument("ArrowDown");
  const barre = texte(parClasse(lecteur.racine, "lecteur__barre")[0]);
  assert.match(barre, /2 \/ 3/);
  assert.match(barre, /Chada TV/);
  const annonce = parClasse(lecteur.racine, "visuellement-cache")[0];
  assert.match(texte(annonce), /Chaîne 2 sur 3/);
  lecteur.fermer();
});

test("la flèche du haut depuis la première chaîne boucle sur la dernière", () => {
  const lecteur = ouvrirLecteur();
  toucheDocument("ArrowUp");
  assert.match(texte(parClasse(lecteur.racine, "lecteur__barre")[0]), /3 \/ 3/);
  lecteur.fermer();
});

test("la touche L ouvre et referme la liste", () => {
  const lecteur = ouvrirLecteur();
  const panneau = parClasse(lecteur.racine, "lecteur__panneau")[0];
  toucheDocument("l");
  assert.equal(panneau.hasAttribute("hidden"), false);
  toucheDocument("l");
  assert.equal(panneau.hasAttribute("hidden"), true);
  lecteur.fermer();
});

test("la touche M coupe le son et l'état du bouton suit", () => {
  const lecteur = ouvrirLecteur();
  toucheDocument("m");
  assert.equal(zapping.sonCoupe(), true);
  const boutons = parClasse(lecteur.racine, "lecteur__bouton");
  const son = boutons.find((b) => /son/i.test(b.getAttribute("aria-label") ?? ""));
  assert.match(son.getAttribute("aria-label"), /Rétablir/);
  lecteur.fermer();
});

test("un clic dans la liste change de chaîne", () => {
  const lecteur = ouvrirLecteur();
  toucheDocument("l");
  const items = parClasse(lecteur.racine, "lecteur__item");
  items[2].declencher("click", { target: items[2] });
  assert.match(texte(parClasse(lecteur.racine, "lecteur__barre")[0]), /3 \/ 3/);
  lecteur.fermer();
});

test("la recherche de la liste filtre les chaînes", () => {
  const lecteur = ouvrirLecteur();
  toucheDocument("l");
  const champ = parBalise(lecteur.racine, "input")[0];
  champ.value = "medi";
  champ.declencher("input", { target: champ });
  const items = parClasse(lecteur.racine, "lecteur__item");
  assert.equal(items.length, 1);
  assert.match(texte(items[0]), /Medi1TV/);
  lecteur.fermer();
});

test("fermer le lecteur retire l'écran et libère le défilement", () => {
  const lecteur = ouvrirLecteur();
  assert.ok(parClasse(document.body, "lecteur").length > 0);
  lecteur.fermer();
  assert.equal(parClasse(document.body, "lecteur").length, 0);
  assert.equal(document.body.style.overflow, "");
});

test("le lecteur retient la chaîne regardée", () => {
  const lecteur = ouvrirLecteur();
  toucheDocument("ArrowDown");
  assert.equal(zapping.derniereChaine().id, "ch-2");
  lecteur.fermer();
});
