/**
 * Favoris : la même liste pour les trois familles, stockée localement.
 * L'état vide dit comment ajouter un favori, en français.
 */

import { h, vider } from "../dom.js";
import { etatVide } from "../composants.js";
import * as favoris from "../favoris.js";

const LIBELLES = { chaines: "Chaîne", anime: "Animé", films: "Film" };

export function rendre(racine, _etat, app) {
  const liste = favoris.liste();
  const entete = h(
    "div",
    { class: "page__entete" },
    h(
      "div",
      {},
      h("h1", {}, "Favoris"),
      h("p", { class: "page__chapeau" }, "Gardés sur cet appareil, sans compte et sans envoi réseau.")
    )
  );

  if (!liste.length) {
    vider(racine).append(
      entete,
      etatVide({
        titre: "Votre liste de favoris est vide",
        texte: "Ouvrez une fiche de chaîne, d'animé ou de film, puis choisissez « Ajouter aux favoris ». La liste reste sur cet appareil.",
        action: () => app.aller("/chaines", {}),
        libelleAction: "Parcourir les chaînes"
      })
    );
    return;
  }

  const lignes = liste.map((f) =>
    h(
      "div",
      { class: "resultat" },
      h("span", { class: "resultat__type" }, LIBELLES[f.famille] ?? "Contenu"),
      h("span", {}, h("a", { class: "resultat__titre", href: f.lien, "data-lien": "" }, f.titre)),
      h("button", {
        class: "bouton bouton--discret",
        type: "button",
        onclick: () => {
          favoris.basculer(f);
          rendre(racine, _etat, app);
        }
      }, "Retirer")
    )
  );

  vider(racine).append(entete, h("div", { class: "resultats" }, lignes));
}
