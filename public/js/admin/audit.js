/**
 * Onglet Journal : entrées d'audit, du plus récent au plus ancien, et
 * catalogue des codes. Les codes affichés viennent du serveur, jamais d'une
 * liste recopiée dans l'interface.
 */

import { h } from "../dom.js";
import { obtenir } from "../api.js";

function ligneEntree(entree) {
  const date = new Date(entree.date).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "medium" });
  const detail = Object.entries(entree.detail ?? {})
    .map(([cle, valeur]) => `${cle}=${valeur}`)
    .join(" ");
  return h(
    "div",
    { class: "journal__ligne" },
    h("span", { class: "journal__code" }, entree.code),
    h("span", {}, `${date} · ${entree.auteur}`),
    h("span", {}, `${entree.action}${detail ? ` · ${detail}` : ""}`)
  );
}

export async function panneauJournal() {
  const donnees = await obtenir("/api/admin/audit");
  const entrees = donnees.entrees ?? [];

  return h(
    "div",
    { class: "panneau" },
    h("h2", {}, "Journal d'audit"),
    h("p", { class: "page__chapeau" }, `${entrees.length} entrée(s) conservées. Aucune donnée personnelle de visiteur n'y figure.`),
    h(
      "div",
      { class: "journal" },
      entrees.length ? entrees.map(ligneEntree) : h("div", { class: "journal__ligne" }, h("span", {}, "Aucune entrée pour l'instant."))
    ),
    h("h3", {}, "Catalogue des codes"),
    h(
      "table",
      { class: "tableau" },
      h("thead", {}, h("tr", {}, h("th", {}, "Code"), h("th", {}, "Action journalisée"))),
      h(
        "tbody",
        {},
        Object.entries(donnees.codes ?? {}).map(([code, action]) => h("tr", {}, h("td", {}, code), h("td", {}, action)))
      )
    )
  );
}
