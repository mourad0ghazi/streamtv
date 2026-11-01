/**
 * Onglet Sources : état des sondes, priorité, activation, licence éditable,
 * import manuel avec retour d'état.
 */

import { h, notifier } from "../dom.js";
import { obtenir, envoyer } from "../api.js";

const ETATS = {
  saine: "Saine",
  instable: "Instable",
  "hors-service": "Hors service",
  inconnu: "Jamais sondée"
};

function ligneSource(source, rafraichir) {
  const licence = h("input", { type: "text", value: source.licence ?? "", "aria-label": `Licence de ${source.nom}`, size: 40 });
  const priorite = h("input", { type: "number", min: "1", max: "10", value: String(source.priorite), "aria-label": `Priorité de ${source.nom}` });
  const actif = h("input", { type: "checkbox", checked: source.actif ? true : null, "aria-label": `Activer ${source.nom}` });
  const etatSonde = source.sonde?.etat ?? "inconnu";
  const taux = typeof source.sonde?.tauxEchec === "number" ? `${Math.round(source.sonde.tauxEchec * 100)} % d'échec` : "aucune mesure";
  const retour = h("span", { class: "champ__aide" });

  const enregistrer = async () => {
    try {
      await envoyer(`/api/admin/sources/${encodeURIComponent(source.id)}`, {
        licence: licence.value,
        priorite: Number.parseInt(priorite.value, 10),
        actif: actif.checked
      });
      retour.textContent = "Enregistré.";
      notifier(`Source ${source.nom} mise à jour.`);
    } catch (erreur) {
      retour.textContent = erreur.message;
    }
  };

  const importer = async () => {
    retour.textContent = "Import en cours";
    try {
      const resultat = await envoyer("/api/admin/import", { id: source.id });
      const r = resultat.resultats?.[0];
      retour.textContent = r ? r.message : "Import terminé.";
      notifier(r ? r.message : "Import terminé.");
    } catch (erreur) {
      retour.textContent = erreur.message;
    }
  };

  return h(
    "tr",
    {},
    h("td", {}, source.nom, h("div", { class: "champ__aide" }, `${source.type} · ${source.contenu} · ${source.contenus ?? 0} contenus`)),
    h("td", {}, licence, retour),
    h("td", {}, priorite),
    h("td", {}, actif),
    h("td", {}, ETATS[etatSonde] ?? etatSonde, h("div", { class: "champ__aide" }, taux)),
    h(
      "td",
      {},
      h("button", { class: "bouton", type: "button", onclick: enregistrer }, "Enregistrer"),
      h("button", { class: "bouton bouton--discret", type: "button", onclick: importer }, "Importer")
    )
  );
}

export async function panneauSources() {
  const donnees = await obtenir("/api/admin/sources");
  const sources = donnees.sources ?? [];
  const tableau = h("tbody", {}, sources.slice(0, 200).map((s) => ligneSource(s, () => {})));

  const sonder = h(
    "button",
    {
      class: "bouton",
      type: "button",
      onclick: async (evenement) => {
        evenement.target.disabled = true;
        evenement.target.textContent = "Sondage en cours";
        try {
          const resultat = await envoyer("/api/admin/sonder", {});
          const saines = resultat.resultats.filter((r) => r.ok).length;
          notifier(`${saines} source(s) joignable(s) sur ${resultat.resultats.length}.`);
        } catch (erreur) {
          notifier(erreur.message);
        } finally {
          evenement.target.disabled = false;
          evenement.target.textContent = "Sonder toutes les sources";
        }
      }
    },
    "Sonder toutes les sources"
  );

  return h(
    "div",
    { class: "panneau" },
    h(
      "div",
      { class: "page__entete" },
      h("div", {}, h("h2", {}, `${sources.length} sources`), h("p", { class: "page__chapeau" }, "Une source sans licence est refusée à l'import. La priorité 1 l'emporte sur la 10 en cas de doublon.")),
      sonder
    ),
    h(
      "table",
      { class: "tableau" },
      h(
        "thead",
        {},
        h("tr", {}, ["Source", "Licence", "Priorité", "Active", "Sonde", "Actions"].map((t) => h("th", {}, t)))
      ),
      tableau
    ),
    sources.length > 200
      ? h("p", { class: "page__chapeau" }, `Les ${sources.length - 200} autres sources sont gérées par l'import. Le tableau s'arrête à 200 lignes pour rester lisible.`)
      : null
  );
}

