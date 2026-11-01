/**
 * Vue Films : rangées, filtres en haut de page, reprise de lecture locale.
 * Pas de guide, pas de direct : une durée, une année, des genres, et un point
 * de reprise à la seconde.
 */

import { h, vider, formaterPosition } from "../dom.js";
import { obtenir } from "../api.js";
import { carteContenu, rangee, attente, etatVide, etatErreur } from "../composants.js";
import * as progression from "../progression.js";

function carteFilm(film, reprise) {
  const sous = reprise
    ? `${formaterPosition(reprise.position)} sur ${formaterPosition(reprise.duree)}`
    : `${film.annee} · ${(film.genres ?? []).join(", ")}`;
  return carteContenu({
    titre: film.titre,
    sous,
    affiche: film.affiche,
    lien: `/films/${film.id}`
  });
}

export async function rendre(racine, etat, app) {
  vider(racine).append(attente("Chargement des films"));
  const parametres = new URLSearchParams();
  if (etat.genre) parametres.set("genre", etat.genre);
  if (etat.annee) parametres.set("annee", etat.annee);

  let donnees;
  try {
    donnees = await obtenir(`/api/films?${parametres.toString()}`);
  } catch (erreur) {
    vider(racine).append(etatErreur(erreur.message, () => rendre(racine, etat, app)));
    return;
  }

  const facettes = donnees.facettes ?? { genres: [], annees: [] };
  const filtresActifs = Boolean(etat.genre || etat.annee);

  const entete = h(
    "div",
    { class: "page__entete" },
    h(
      "div",
      {},
      h("h1", {}, "Films"),
      h("p", { class: "page__chapeau" }, `${donnees.total} films, tous sous licence libre ou officielle, licence affichée sur chaque fiche.`)
    )
  );

  const filtres = h(
    "div",
    { class: "filtres" },
    h(
      "div",
      { class: "champ" },
      h("label", { for: "filtre-genre" }, "Genre"),
      h(
        "select",
        { id: "filtre-genre", onchange: (e) => app.aller("/films", { ...etat, genre: e.target.value }) },
        h("option", { value: "" }, "Tous les genres"),
        facettes.genres.map((g) => h("option", { value: g, selected: etat.genre === g ? true : null }, g))
      )
    ),
    h(
      "div",
      { class: "champ" },
      h("label", { for: "filtre-annee" }, "Année"),
      h(
        "select",
        { id: "filtre-annee", onchange: (e) => app.aller("/films", { ...etat, annee: e.target.value }) },
        h("option", { value: "" }, "Toutes les années"),
        facettes.annees.map((a) => h("option", { value: String(a), selected: String(etat.annee ?? "") === String(a) ? true : null }, String(a)))
      )
    ),
    h("button", { class: "bouton", type: "button", onclick: () => app.aller("/films", {}) }, "Réinitialiser")
  );

  vider(racine).append(entete, filtres);

  if (!donnees.total) {
    racine.append(
      etatVide({
        titre: filtresActifs ? "Aucun film ne correspond à ces filtres" : "Aucun film au catalogue",
        texte: filtresActifs
          ? "Réinitialise les filtres pour revoir tous les films."
          : "Ajoute une source de films sous licence dans la console, puis relance l'import.",
        action: filtresActifs ? () => app.aller("/films", {}) : null,
        libelleAction: "Réinitialiser les filtres"
      })
    );
    return;
  }

  const bloc = h("div", { class: "panneau" });

  const reprises = progression.deFamille("films");
  if (reprises.length) {
    const filmsParId = new Map(donnees.contenus.map((f) => [f.id, f]));
    const contenus = reprises.map((r) => filmsParId.get(r.id)).filter(Boolean);
    const section = rangee("À reprendre", contenus, (film) => carteFilm(film, progression.lire("films", film.id)));
    if (section) bloc.append(section);
  }

  for (const r of donnees.rangees) {
    if (!r.contenus.length) continue;
    const section = rangee(r.titre, r.contenus, (film) => carteFilm(film, null));
    if (section) bloc.append(section);
  }

  for (const g of donnees.rangeesGenre ?? []) {
    if (!g.contenus.length) continue;
    const section = rangee(g.titre, g.contenus, (film) => carteFilm(film, null));
    if (section) bloc.append(section);
  }

  racine.append(bloc);
}
