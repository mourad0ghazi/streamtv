/**
 * Onglets Animé et Films : compteurs par source, contenus incomplets,
 * derniers ajouts.
 */

import { h } from "../dom.js";
import { obtenir } from "../api.js";

function compteur(valeur, libelle) {
  return h("div", { class: "compteur" }, h("div", { class: "compteur__valeur" }, String(valeur)), h("div", { class: "compteur__libelle" }, libelle));
}

export async function panneauStatistiques(famille) {
  const donnees = await obtenir("/api/admin/statistiques");
  const bloc = donnees[famille];
  const libelle = famille === "anime" ? "Animé" : "Films";

  const lignes = Object.entries(bloc.parSource ?? {}).map(([source, nombre]) =>
    h("tr", {}, h("td", {}, source), h("td", {}, String(nombre)))
  );

  const incomplets = [
    bloc.sansAffiche ? `${bloc.sansAffiche} sans affiche` : null,
    bloc.sansEpisode ? `${bloc.sansEpisode} sans épisode` : null,
    bloc.sansLicence ? `${bloc.sansLicence} sans licence` : null
  ].filter(Boolean);

  return h(
    "div",
    { class: "panneau" },
    h("h2", {}, libelle),
    h(
      "div",
      { class: "compteurs" },
      compteur(bloc.total, "contenus"),
      compteur(Object.keys(bloc.parSource ?? {}).length, "sources"),
      compteur(bloc.sansAffiche ?? 0, "sans affiche"),
      compteur(bloc.sansLicence ?? 0, "sans licence")
    ),
    incomplets.length
      ? h("p", { class: "page__chapeau" }, `À compléter : ${incomplets.join(", ")}.`)
      : h("p", { class: "page__chapeau" }, "Aucun contenu incomplet : chaque titre a une affiche et une licence."),
    bloc.derniers?.length
      ? h(
          "div",
          {},
          h("h3", {}, "Derniers ajouts"),
          h("ul", {}, bloc.derniers.map((d) => h("li", { class: "resultat__sous" }, d.titre)))
        )
      : null,
    h(
      "table",
      { class: "tableau" },
      h("thead", {}, h("tr", {}, h("th", {}, "Source"), h("th", {}, "Contenus"))),
      h("tbody", {}, lignes.length ? lignes : h("tr", {}, h("td", {}, "Aucune source"), h("td", {}, "0")))
    )
  );
}
