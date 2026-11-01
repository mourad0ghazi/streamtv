/**
 * Apparence du site : les jetons que le serveur accepte, et rien d'autre.
 *
 * Le panneau ne construit pas de CSS : il envoie des valeurs, le serveur les
 * valide et fabrique la feuille. Un refus s'affiche sous le champ concerné,
 * avec la mesure quand il y en a une (contraste, largeur, rayon).
 */

import { h, vider, notifier } from "../dom.js";
import { obtenir, envoyer } from "../api.js";

function champ(description, valeur) {
  const id = `apparence-${description.cle}`;
  let controle;
  if (description.type === "couleur") {
    controle = h("input", { type: "color", id, value: valeur });
  } else if (description.type === "choix") {
    controle = h(
      "select",
      { id },
      ...description.valeurs.map((option) => h("option", { value: option, selected: option === valeur ? true : null }, option))
    );
  } else if (description.type === "booleen") {
    controle = h("input", { type: "checkbox", id, checked: valeur === true });
  } else if (description.type === "entier") {
    controle = h("input", { type: "number", id, value: String(valeur), min: description.min, max: description.max, step: "1" });
  } else {
    controle = h("input", { type: "text", id, value: String(valeur ?? ""), maxlength: "40" });
  }

  return h(
    "div",
    { class: "champ" },
    h("label", { for: id }, description.libelle),
    description.type === "booleen" ? h("div", { class: "champ__case" }, controle, h("span", {}, description.effet)) : controle,
    description.type !== "booleen" ? h("span", { class: "champ__aide" }, description.effet) : null,
    h("span", { class: "champ__erreur", "data-erreur": description.cle })
  );
}

function lireValeur(description, valeur) {
  if (description.type === "booleen") return valeur === true;
  if (description.type === "entier") return Number.parseInt(valeur, 10);
  return String(valeur);
}

export async function panneauApparence() {
  const etat = await obtenir("/api/admin/apparence");
  const formulaire = h("form", { class: "formulaire" });

  for (const description of etat.description) {
    formulaire.append(champ(description, etat.valeurs[description.cle]));
  }

  const mesures = h(
    "ul",
    { class: "mesures" },
    h("li", {}, `Contraste de l'accent sur le fond : ${String(etat.contrasteAccentFond).replace(".", ",")} pour 1 (minimum 3).`),
    h("li", {}, `Contraste du texte posé sur l'accent : ${String(etat.contrasteAccentTexte).replace(".", ",")} pour 1.`),
    h("li", {}, `Largeur calculée d'une affiche : ${etat.largeurAffiche} pixels.`)
  );

  const message = h("p", { class: "aide-message", role: "status" });
  const bouton = h("button", { class: "bouton bouton--principal", type: "submit" }, "Enregistrer l'apparence");

  formulaire.addEventListener("submit", async (evenement) => {
    evenement.preventDefault();
    for (const zone of formulaire.querySelectorAll("[data-erreur]")) zone.textContent = "";
    message.textContent = "";
    bouton.disabled = true;
    const changements = {};
    for (const description of etat.description) {
      const controle = formulaire.querySelector(`#apparence-${description.cle}`);
      const valeur = description.type === "booleen" ? controle.checked : controle.value;
      const lue = lireValeur(description, valeur);
      if (lue !== etat.valeurs[description.cle]) changements[description.cle] = lue;
    }
    if (!Object.keys(changements).length) {
      message.textContent = "Aucun changement à enregistrer.";
      bouton.disabled = false;
      return;
    }
    try {
      const reponse = await envoyer("/api/admin/apparence", changements);
      notifier("Apparence enregistrée : le site public l'applique au chargement suivant.");
      vider(message).append("Apparence enregistrée.");
      etat.valeurs = reponse.valeurs;
      etat.contrasteAccentFond = reponse.contrasteAccentFond;
      etat.contrasteAccentTexte = reponse.contrasteAccentTexte;
      etat.largeurAffiche = reponse.largeurAffiche;
      vider(mesures).append(
        h("li", {}, `Contraste de l'accent sur le fond : ${String(reponse.contrasteAccentFond).replace(".", ",")} pour 1 (minimum 3).`),
        h("li", {}, `Contraste du texte posé sur l'accent : ${String(reponse.contrasteAccentTexte).replace(".", ",")} pour 1.`),
        h("li", {}, `Largeur calculée d'une affiche : ${reponse.largeurAffiche} pixels.`)
      );
    } catch (erreur) {
      const refuses = erreur.refuses ?? null;
      if (refuses && typeof refuses === "object") {
        for (const [cle, texte] of Object.entries(refuses)) {
          const zone = formulaire.querySelector(`[data-erreur="${cle}"]`);
          if (zone) zone.textContent = texte;
        }
        message.textContent = "Certaines valeurs sont refusées : corrigez-les, puis réessayez.";
      } else {
        message.textContent = erreur.message;
      }
    } finally {
      bouton.disabled = false;
    }
  });

  formulaire.append(h("div", { class: "formulaire__actions" }, bouton));

  return h(
    "div",
    { class: "panneau-empile" },
    h(
      "section",
      { class: "bloc" },
      h("h2", {}, "Jetons du site"),
      h("p", { class: "champ__aide" }, "Ces valeurs deviennent des variables CSS servies à part, à l'adresse /apparence.css. Le site public les applique sans rechargement de code."),
      formulaire
    ),
    h("section", { class: "bloc" }, h("h2", {}, "Mesures"), mesures, message)
  );
}
