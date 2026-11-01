/**
 * Vue Animé : rangées, filtres en haut de page, fiche détaillée.
 * Une rangée vide n'est jamais rendue : le serveur ne la renvoie pas et la vue
 * vérifie une seconde fois avant de créer le bloc.
 */

import { h, vider } from "../dom.js";
import { obtenir } from "../api.js";
import { carteContenu, rangee, attente, etatVide, etatErreur } from "../composants.js";

const LIBELLES = {
  genre: "Genre",
  annee: "Année",
  langue: "Langue",
  statut: "Statut"
};

function selecteur(cle, valeurs, etat, aller) {
  const options = [
    h("option", { value: "" }, `Tous les ${LIBELLES[cle].toLowerCase()}s`),
    ...valeurs.map((v) => h("option", { value: String(v), selected: String(etat[cle] ?? "") === String(v) ? true : null }, String(v)))
  ];
  return h(
    "div",
    { class: "champ" },
    h("label", { for: `filtre-${cle}` }, LIBELLES[cle]),
    h("select", { id: `filtre-${cle}`, onchange: (e) => aller({ [cle]: e.target.value }) }, options)
  );
}

export async function rendre(racine, etat, app) {
  vider(racine).append(attente("Chargement des animés"));
  const parametres = new URLSearchParams();
  for (const cle of ["genre", "annee", "langue", "statut"]) {
    if (etat[cle]) parametres.set(cle, etat[cle]);
  }

  let donnees;
  try {
    donnees = await obtenir(`/api/anime?${parametres.toString()}`);
  } catch (erreur) {
    vider(racine).append(etatErreur(erreur.message, () => rendre(racine, etat, app)));
    return;
  }

  const aller = (changements) => app.aller("/anime", { ...etat, ...changements });
  const facettes = donnees.facettes ?? { genres: [], annees: [], langues: [], statuts: [] };
  const filtresActifs = Object.entries(etat).some(([cle, valeur]) => ["genre", "annee", "langue", "statut"].includes(cle) && valeur);

  const entete = h(
    "div",
    { class: "page__entete" },
    h(
      "div",
      {},
      h("h1", {}, "Animé"),
      h("p", { class: "page__chapeau" }, `${donnees.total} titres au catalogue, ${donnees.rangees.length} rangées affichées.`)
    )
  );

  const filtres = h(
    "div",
    { class: "filtres" },
    selecteur("genre", facettes.genres, etat, aller),
    selecteur("annee", facettes.annees, etat, aller),
    selecteur("langue", facettes.langues, etat, aller),
    selecteur("statut", facettes.statuts, etat, aller),
    h("button", { class: "bouton", type: "button", onclick: () => app.aller("/anime", {}) }, "Réinitialiser")
  );

  vider(racine).append(entete, filtres);

  if (!donnees.contenus.length) {
    racine.append(
      etatVide({
        titre: filtresActifs ? "Aucun animé ne correspond à ces filtres" : "Aucun animé au catalogue",
        texte: filtresActifs
          ? "Réinitialise les filtres pour revoir toutes les rangées."
          : "Le catalogue d'animés se remplit dès qu'une source sous licence est branchée dans la console.",
        action: filtresActifs ? () => app.aller("/anime", {}) : null,
        libelleAction: "Réinitialiser les filtres"
      })
    );
    return;
  }

  const bloc = h("div", {});
  for (const rangee_ of donnees.rangees) {
    if (!rangee_.contenus.length) continue;
    const section = rangee(
      rangee_.titre,
      rangee_.contenus,
      (a) => carteContenu({ titre: a.titre, sous: `${a.annee} · ${a.genreSousTitre ?? (a.genres ?? []).join(", ")}`, affiche: a.affiche, lien: `/anime/${a.id}` })
    );
    if (section) bloc.append(section);
  }
  racine.append(bloc);
}
