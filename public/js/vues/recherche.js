/**
 * Recherche globale : chaînes, animés et films dans une seule liste.
 * Chaque résultat porte son type en toutes lettres, jamais par la couleur.
 */

import { h, vider } from "../dom.js";
import { obtenir } from "../api.js";
import { attente, etatErreur, etatVide } from "../composants.js";

export async function rendre(racine, etat, app) {
  const terme = etat.q ?? "";
  const entete = h(
    "div",
    { class: "page__entete" },
    h("div", {}, h("h1", {}, "Recherche"), h("p", { class: "page__chapeau" }, "Chaînes, animés et films, sans distinction de casse ni d'accent."))
  );

  if (!terme.trim()) {
    vider(racine).append(
      entete,
      etatVide({
        titre: "Cherchez une chaîne, un animé ou un film",
        texte: "Tapez au moins deux lettres dans le champ de recherche en haut de page. La recherche couvre les trois familles à la fois.",
        action: null,
        libelleAction: ""
      })
    );
    return;
  }

  vider(racine).append(entete, attente("Recherche en cours"));
  let donnees;
  try {
    donnees = await obtenir(`/api/recherche?q=${encodeURIComponent(terme)}`);
  } catch (erreur) {
    vider(racine).append(entete, etatErreur(erreur.message, () => rendre(racine, etat, app)));
    return;
  }

  if (!donnees.total) {
    vider(racine).append(
      entete,
      etatVide({
        titre: `Aucun résultat pour « ${terme} »`,
        texte: "Vérifiez l'orthographe, ou essayez un terme plus court : « sintel », « sport », « maroc ».",
        action: () => app.aller("/chaines", {}),
        libelleAction: "Voir toutes les chaînes"
      })
    );
    return;
  }

  const liste = h(
    "div",
    { class: "resultats" },
    donnees.resultats.map((r) =>
      h(
        "a",
        { class: "resultat", href: r.lien, "data-lien": "" },
        h("span", { class: "resultat__type" }, r.type),
        h("span", {}, h("span", { class: "resultat__titre" }, r.titre), h("span", { class: "resultat__sous" }, r.sousTitre ?? "")),
        h("span", { class: "resultat__sous" }, "Ouvrir")
      )
    )
  );

  vider(racine).append(entete, h("p", { class: "page__chapeau" }, `${donnees.total} résultat(s) pour « ${terme} »`), liste);
}
