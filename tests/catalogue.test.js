import { test } from "node:test";
import assert from "node:assert/strict";

import * as catalogue from "../public/js/partage/catalogue.js";

const chaines = [
  { id: "ch-1", nom: "Médi 1 TV", categorie: "Information", pays: "MA", region: "MA-01" },
  { id: "ch-2", nom: "2M", categorie: "Généraliste", pays: "MA" },
  { id: "ch-3", nom: "France 24", categorie: "Information", pays: "FR" },
  { id: "ch-4", nom: "Al Aoula", categorie: "Généraliste", pays: "MA" }
];

test("la pagination ne dépasse jamais le plafond de cartes", () => {
  const page = catalogue.paginer(Array.from({ length: 100 }, (_, i) => i), 1, 999, 24);
  assert.equal(page.taille, 24);
  assert.equal(page.contenus.length, 24);
  assert.equal(page.pages, 5);
});

test("une page au-delà de la dernière retombe sur la dernière page", () => {
  const page = catalogue.paginer(Array.from({ length: 30 }, (_, i) => i), 99, 24, 24);
  assert.equal(page.page, 2);
  assert.equal(page.contenus.length, 6);
});

test("le filtre des chaînes ignore la casse et les accents", () => {
  const trouvees = catalogue.filtrerChaines(chaines, { q: "medi" });
  assert.equal(trouvees.length, 1);
  assert.equal(trouvees[0].id, "ch-1");
});

test("le filtre des chaînes combine catégorie et pays", () => {
  const trouvees = catalogue.filtrerChaines(chaines, { categorie: "Information", pays: "MA" });
  assert.deepEqual(trouvees.map((c) => c.id), ["ch-1"]);
});

test("les catégories sont comptées et triées à la française", () => {
  const categories = catalogue.categoriesDe(chaines);
  const information = categories.find((c) => c.nom === "Information");
  assert.equal(information.nombre, 2);
  assert.deepEqual(categories.map((c) => c.nom), ["Généraliste", "Information"]);
});

test("une rangée d'animés vide n'est pas renvoyée", () => {
  const contenus = [
    { id: "an-1", titre: "A", annee: 2006, format: "film", statut: "termine" },
    { id: "an-2", titre: "B", annee: 2010, format: "serie", statut: "termine" }
  ];
  const rangees = catalogue.rangeesAnime(contenus, 24);
  assert.deepEqual(rangees.map((r) => r.titre), ["Classiques", "Films d'animation"]);
  assert.ok(!rangees.some((r) => r.titre === "Simulcast de la saison"));
});

test("le simulcast apparaît dès qu'un animé est en cours", () => {
  const contenus = [{ id: "an-1", titre: "A", annee: 2026, format: "serie", statut: "en-cours" }];
  const rangees = catalogue.rangeesAnime(contenus, 24);
  assert.equal(rangees[0].titre, "Simulcast de la saison");
});

test("les rangées de films sont plafonnées par genre", () => {
  const films = Array.from({ length: 12 }, (_, i) => ({
    id: `fi-${i}`,
    titre: `Film ${i}`,
    genres: ["Aventure", "Comédie"],
    ajoute_le: `2026-10-${String(i + 1).padStart(2, "0")}`
  }));
  const { rangees, rangeesGenre } = catalogue.rangeesFilms(films, 24, 1);
  assert.equal(rangees.length, 1);
  assert.equal(rangeesGenre.length, 1);
  assert.equal(rangeesGenre[0].titre, "Aventure");
});

test("les films récents sont triés du plus récent au plus ancien", () => {
  const films = [
    { id: "a", titre: "A", genres: [], ajoute_le: "2026-10-01" },
    { id: "b", titre: "B", genres: [], ajoute_le: "2026-11-01" }
  ];
  const { rangees } = catalogue.rangeesFilms(films, 24, 4);
  assert.equal(rangees[0].contenus[0].id, "b");
});

test("la recherche porte son type en toutes lettres", () => {
  const resultat = catalogue.rechercher(
    {
      chaines,
      anime: [{ id: "an-1", titre: "Sintel", genres: ["Aventure"], annee: 2010 }],
      films: [{ id: "fi-1", titre: "Sintel", genres: ["Fantastique"], annee: 2010 }]
    },
    "sintel",
    24
  );
  assert.equal(resultat.total, 2);
  assert.deepEqual(resultat.resultats.map((r) => r.type), ["Animé", "Film"]);
});

test("la recherche vide ne renvoie rien et ne lève pas", () => {
  const resultat = catalogue.rechercher({ chaines, anime: [], films: [] }, "   ", 24);
  assert.equal(resultat.total, 0);
  assert.deepEqual(resultat.resultats, []);
});

test("la recherche est plafonnée par le plafond de cartes", () => {
  const beaucoup = Array.from({ length: 40 }, (_, i) => ({ id: `ch-${i}`, nom: `Sintel ${i}`, categorie: "Cinéma", pays: "FR" }));
  const resultat = catalogue.rechercher({ chaines: beaucoup, anime: [], films: [] }, "sintel", 24);
  assert.equal(resultat.total, 40);
  assert.equal(resultat.resultats.length, 24);
});

test("le filtre des chaînes accepte une région", () => {
  const trouvees = catalogue.filtrerChaines(chaines, { region: "MA-01" });
  assert.deepEqual(trouvees.map((c) => c.id), ["ch-1"]);
});

test("les régions sont comptées et laissées de côté quand elles sont absentes", () => {
  const regions = catalogue.regionsDe(chaines);
  assert.deepEqual(regions, [{ code: "MA-01", nombre: 1 }]);
});

test("la liste de zapping est réduite aux champs utiles et plafonnée", () => {
  const liste = catalogue.listeZapping(chaines, {}, 2);
  assert.equal(liste.chaines.length, 2);
  assert.deepEqual(Object.keys(liste.chaines[0]).sort(), ["categorie", "id", "logo", "nom", "pays", "url"]);
});

test("la liste de zapping annonce le total réel du filtre et sa troncature", () => {
  const coupee = catalogue.listeZapping(chaines, {}, 2);
  assert.equal(coupee.total, chaines.length);
  assert.equal(coupee.tronquee, true);

  const entiere = catalogue.listeZapping(chaines, {}, 300);
  assert.equal(entiere.total, chaines.length);
  assert.equal(entiere.tronquee, false);
});

test("la liste de zapping applique les mêmes filtres que le catalogue", () => {
  const liste = catalogue.listeZapping(chaines, { categorie: "Information" }, 300);
  assert.deepEqual(liste.chaines.map((c) => c.id), ["ch-3", "ch-1"]);
  assert.equal(liste.total, 2);
});
