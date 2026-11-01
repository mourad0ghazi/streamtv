/**
 * Composition de l'accueil : l'ordre, les titres, les filtres, la visibilité.
 *
 * Chaque section est une ligne qu'on monte, qu'on descend, qu'on masque ou
 * qu'on retire. Rien ne s'applique sans passer par le serveur, qui revalide et
 * peut refuser : une section sans titre lisible ne part pas.
 */

import { h, vider, notifier } from "../dom.js";
import { obtenir, envoyer } from "../api.js";

function libelleType(types, cle) {
  return types.find((t) => t.cle === cle)?.libelle ?? cle;
}

function champsSection(section, type) {
  const champs = [];
  if ((type?.champs ?? []).includes("limite")) {
    champs.push(h("input", { type: "number", min: "4", max: "24", value: String(section.limite ?? 12), "data-champ": "limite", "aria-label": "Nombre de cartes" }));
  }
  if ((type?.champs ?? []).includes("genre")) {
    champs.push(h("input", { type: "text", value: section.genre ?? "", maxlength: "40", "data-champ": "genre", placeholder: "Genre", "aria-label": "Genre" }));
  }
  if ((type?.champs ?? []).includes("rangee")) {
    champs.push(h("input", { type: "text", value: section.rangee ?? "", maxlength: "40", "data-champ": "rangee", placeholder: "Nom de la rangée", "aria-label": "Rangée" }));
  }
  if ((type?.champs ?? []).includes("texte")) {
    champs.push(h("textarea", { rows: "2", maxlength: "280", "data-champ": "texte", "aria-label": "Texte" }, section.texte ?? ""));
  }
  return champs;
}

function lireChamps(ligne) {
  const valeurs = {};
  for (const controle of ligne.querySelectorAll("[data-champ]")) {
    const cle = controle.getAttribute("data-champ");
    valeurs[cle] = cle === "limite" ? Number.parseInt(controle.value, 10) : controle.value;
  }
  return valeurs;
}

export async function panneauAccueil({ recharger }) {
  const { sections, types } = await obtenir("/api/admin/accueil");
  const message = h("p", { class: "aide-message", role: "status" });

  async function poster(corps, succes) {
    message.textContent = "";
    try {
      await envoyer("/api/admin/accueil", corps);
      notifier(succes);
      await recharger();
    } catch (erreur) {
      message.textContent = erreur.message;
    }
  }

  const lignes = sections.map((section, index) => {
    const type = types.find((t) => t.cle === section.type);
    const titre = h("input", { type: "text", value: section.titre, maxlength: "60", "data-champ": "titre", "aria-label": "Titre de la section" });
    const visible = h("input", { type: "checkbox", checked: section.visible !== false, "aria-label": "Section visible" });

    return h(
      "li",
      { class: "section-ligne" },
      h(
        "div",
        { class: "section-ligne__ordre" },
        h(
          "button",
          { class: "bouton bouton--petit", type: "button", disabled: index === 0, onclick: () => poster({ deplacer: { id: section.id, sens: "haut" } }, "Section remontée.") },
          "Monter"
        ),
        h(
          "button",
          { class: "bouton bouton--petit", type: "button", disabled: index === sections.length - 1, onclick: () => poster({ deplacer: { id: section.id, sens: "bas" } }, "Section descendue.") },
          "Descendre"
        )
      ),
      h(
        "div",
        { class: "section-ligne__corps" },
        h("span", { class: "etiquette" }, libelleType(types, section.type)),
        titre,
        h("div", { class: "section-ligne__champs" }, ...champsSection(section, type)),
        h("label", { class: "section-ligne__visible" }, visible, " Visible")
      ),
      h(
        "div",
        { class: "section-ligne__actions" },
        h(
          "button",
          {
            class: "bouton bouton--petit",
            type: "button",
            onclick: () => poster({ modifier: { id: section.id, champs: { ...lireChamps(ligne), visible: visible.checked } } }, "Section mise à jour.")
          },
          "Mettre à jour"
        ),
        h(
          "button",
          {
            class: "bouton bouton--petit bouton--danger",
            type: "button",
            disabled: sections.length <= 1,
            onclick: () => poster({ supprimer: section.id }, "Section retirée.")
          },
          "Retirer"
        )
      )
    );
  });

  /* Formulaire d'ajout */
  const typeAjout = h(
    "select",
    { id: "ajout-type" },
    ...types.map((t) => h("option", { value: t.cle }, t.libelle))
  );
  const titreAjout = h("input", { type: "text", id: "ajout-titre", maxlength: "60", placeholder: "Titre de la section" });
  const genreAjout = h("input", { type: "text", id: "ajout-genre", maxlength: "40", placeholder: "Genre (films d'un genre)" });
  const rangeeAjout = h("input", { type: "text", id: "ajout-rangee", maxlength: "40", placeholder: "Nom de la rangée (animés)" });
  const texteAjout = h("input", { type: "text", id: "ajout-texte", maxlength: "280", placeholder: "Texte du bloc" });
  const limiteAjout = h("input", { type: "number", id: "ajout-limite", min: "4", max: "24", value: "12" });

  const ajout = h(
    "form",
    { class: "formulaire" },
    h("div", { class: "champ" }, h("label", { for: "ajout-type" }, "Type de section"), typeAjout),
    h("div", { class: "champ" }, h("label", { for: "ajout-titre" }, "Titre"), titreAjout),
    h("div", { class: "champ" }, h("label", { for: "ajout-limite" }, "Nombre de cartes"), limiteAjout),
    h("div", { class: "champ" }, h("label", { for: "ajout-genre" }, "Genre (facultatif)"), genreAjout),
    h("div", { class: "champ" }, h("label", { for: "ajout-rangee" }, "Rangée (facultatif)"), rangeeAjout),
    h("div", { class: "champ" }, h("label", { for: "ajout-texte" }, "Texte (facultatif)"), texteAjout),
    h(
      "div",
      { class: "formulaire__actions" },
      h("button", { class: "bouton bouton--principal", type: "submit" }, "Ajouter la section")
    )
  );

  ajout.addEventListener("submit", async (evenement) => {
    evenement.preventDefault();
    const corps = { type: typeAjout.value, titre: titreAjout.value, limite: Number.parseInt(limiteAjout.value, 10) || 12 };
    if (genreAjout.value.trim()) corps.genre = genreAjout.value.trim();
    if (rangeeAjout.value.trim()) corps.rangee = rangeeAjout.value.trim();
    if (texteAjout.value.trim()) corps.texte = texteAjout.value.trim();
    message.textContent = "";
    try {
      await envoyer("/api/admin/accueil", { ajouter: corps });
      notifier("Section ajoutée à l'accueil.");
      await recharger();
    } catch (erreur) {
      message.textContent = erreur.message;
    }
  });

  return h(
    "div",
    { class: "panneau-empile" },
    h(
      "section",
      { class: "bloc" },
      h("h2", {}, "Sections de l'accueil"),
      h("p", { class: "champ__aide" }, "L'ordre de cette liste est l'ordre de la page. Une section masquée reste configurée mais ne s'affiche pas."),
      h("ol", { class: "sections" }, ...lignes),
      message
    ),
    h("section", { class: "bloc" }, h("h2", {}, "Ajouter une section"), ajout),
    h(
      "section",
      { class: "bloc" },
      h("h2", {}, "Voir le résultat"),
      h("p", { class: "champ__aide" }, "L'accueil public applique cette composition au chargement suivant."),
      h("a", { class: "bouton", href: "/", target: "_blank", rel: "noreferrer" }, "Ouvrir l'accueil")
    )
  );
}
