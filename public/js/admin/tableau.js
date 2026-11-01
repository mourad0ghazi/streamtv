/**
 * Tableau de bord : ce qu'un administrateur doit voir en ouvrant la console.
 *
 * Quatre blocs seulement, chacun avec une décision à prendre : les chiffres du
 * catalogue, la santé du site, l'activité récente, et ce qui casse côté
 * visiteurs. Aucun graphique décoratif : des nombres, des états, des liens.
 */

import { h } from "../dom.js";
import { obtenir } from "../api.js";
import { quand, nombre, gravite } from "./format.js";

function tuile(libelle, valeur, detail, lien) {
  const corps = h(
    "div",
    { class: "tuile" },
    h("span", { class: "tuile__libelle" }, libelle),
    h("strong", { class: "tuile__valeur" }, nombre(valeur)),
    detail ? h("span", { class: "tuile__detail" }, detail) : null
  );
  return lien ? h("a", { class: "tuile-lien", href: lien, "data-lien": "" }, corps) : corps;
}

function sante(lignes) {
  return h(
    "section",
    { class: "bloc" },
    h("h2", {}, "Santé du site"),
    h(
      "ul",
      { class: "sante" },
      ...lignes.map((ligne) =>
        h(
          "li",
          { class: "sante__ligne" },
          h("span", { class: `pastille pastille--${ligne.etat}`, "aria-hidden": "true" }),
          h("span", { class: "sante__libelle" }, ligne.libelle),
          h("span", { class: "sante__detail" }, ligne.detail),
          h("span", { class: "etiquette" }, gravite(ligne.etat))
        )
      )
    )
  );
}

function activite(entrees) {
  if (!entrees.length) return h("section", { class: "bloc" }, h("h2", {}, "Activité récente"), h("p", { class: "champ__aide" }, "Le journal est vide : aucune action n'a encore été enregistrée."));
  return h(
    "section",
    { class: "bloc" },
    h("h2", {}, "Activité récente"),
    h(
      "ul",
      { class: "flux" },
      ...entrees.slice(0, 8).map((entree) =>
        h(
          "li",
          { class: "flux__ligne" },
          h("span", { class: "flux__code" }, entree.code),
          h("span", { class: "flux__action" }, entree.action),
          h("span", { class: "flux__auteur" }, entree.auteur ?? ""),
          h("span", { class: "flux__date" }, quand(entree.date))
        )
      )
    )
  );
}

function incidents(lignes, total) {
  return h(
    "section",
    { class: "bloc" },
    h("h2", {}, "Incidents côté navigateur"),
    h("p", { class: "champ__aide" }, `${nombre(total)} signalement(s) reçus, regroupés par message et par page.`),
    lignes.length
      ? h(
          "ul",
          { class: "flux" },
          ...lignes.map((incident) =>
            h(
              "li",
              { class: "flux__ligne" },
              h("span", { class: "flux__code" }, `${incident.occurrences}×`),
              h("span", { class: "flux__action" }, incident.message),
              h("span", { class: "flux__auteur" }, incident.page),
              h("span", { class: "flux__date" }, quand(incident.derniere))
            )
          )
        )
      : h("p", { class: "champ__aide" }, "Aucun incident signalé : rien à corriger de ce côté.")
  );
}

export async function panneauTableau({ aller }) {
  const donnees = await obtenir("/api/admin/tableau-de-bord");

  return h(
    "div",
    { class: "panneau-empile" },
    h(
      "div",
      { class: "tuiles" },
      tuile("Chaînes", donnees.comptes.chaines, `${donnees.sources.total} sources déclarées`),
      tuile("Animés", donnees.comptes.anime, "rangées et épisodes"),
      tuile("Films", donnees.comptes.films, "catalogue et ajouts TMDb"),
      tuile("Sections d'accueil", donnees.comptes.sections, `${donnees.accueil.filter((s) => s.visible !== false).length} visibles`),
      tuile("Incidents", donnees.incidentsTotal, `${donnees.incidents.length} signature(s)`),
      tuile("Comptes", donnees.utilisateurs.length, "propriétaire compris")
    ),
    h(
      "div",
      { class: "console-deux-colonnes" },
      h("div", {}, sante(donnees.sante), incidents(donnees.incidents, donnees.incidentsTotal)),
      h(
        "div",
        {},
        activite(donnees.journal),
        h(
          "section",
          { class: "bloc" },
          h("h2", {}, "Raccourcis"),
          h(
            "div",
            { class: "raccourcis" },
            h("button", { class: "bouton", type: "button", onclick: () => aller("accueil") }, "Composer l'accueil"),
            h("button", { class: "bouton", type: "button", onclick: () => aller("apparence") }, "Changer l'apparence"),
            h("button", { class: "bouton", type: "button", onclick: () => aller("lecture") }, "Régler la diffusion"),
            h("button", { class: "bouton", type: "button", onclick: () => aller("assistant") }, "Demander un diagnostic"),
            h("a", { class: "bouton", href: "/", target: "_blank", rel: "noreferrer" }, "Voir le site")
          )
        ),
        h(
          "section",
          { class: "bloc" },
          h("h2", {}, "Diffusion"),
          h(
            "p",
            { class: "champ__aide" },
            donnees.lecture.actif
              ? `Fournisseur ${donnees.lecture.nom} ouvert${donnees.lecture.atteste ? ", droits attestés" : ", sans attestation"}. Clé ${donnees.lecture.clePresente ? "présente" : "absente"}.`
              : "Les films sont lus avec les fichiers du catalogue. Aucun flux tiers n'est diffusé."
          ),
          donnees.lecture.blocage ? h("p", { class: "aide-message" }, donnees.lecture.blocage) : null
        )
      )
    )
  );
}
