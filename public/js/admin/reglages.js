/**
 * Onglet Réglages : formulaire engendré par la description du serveur.
 * Le navigateur n'invente aucun contrôle ; le serveur revalide chaque valeur.
 */

import { h, notifier } from "../dom.js";
import { obtenir, envoyer } from "../api.js";

function controle(description, valeur) {
  if (description.type === "booleen") {
    const input = h("input", { type: "checkbox", id: `reglage-${description.cle}`, checked: valeur ? true : null });
    return input;
  }
  const type = description.type === "entier" ? "number" : "text";
  const attributs = { type, id: `reglage-${description.cle}`, value: String(valeur ?? "") };
  if (description.type === "entier") {
    attributs.min = String(description.min);
    attributs.max = String(description.max);
  }
  return h("input", attributs);
}

export async function panneauReglages() {
  const donnees = await obtenir("/api/admin/reglages");
  const champs = [];

  const formulaire = h("form", { class: "panneau" });
  for (const description of donnees.description) {
    const champ = controle(description, donnees.valeurs[description.cle]);
    champs.push({ description, champ });
    formulaire.append(
      h(
        "div",
        { class: "champ" },
        h("label", { for: `reglage-${description.cle}` }, description.libelle),
        champ,
        h("span", { class: "champ__aide" }, `${description.effet} ${description.risque}`),
        h("span", { class: "champ__aide" }, `Documentation : ${description.doc}`)
      )
    );
  }

  const retour = h("p", { class: "champ__aide", role: "status" });
  formulaire.append(
    retour,
    h(
      "div",
      {},
      h(
        "button",
        {
          class: "bouton bouton--principal",
          type: "submit"
        },
        "Enregistrer les réglages"
      )
    )
  );

  formulaire.addEventListener("submit", async (evenement) => {
    evenement.preventDefault();
    const valeurs = {};
    for (const { description, champ } of champs) {
      valeurs[description.cle] = description.type === "booleen" ? champ.checked : description.type === "entier" ? Number.parseInt(champ.value, 10) : champ.value;
    }
    try {
      await envoyer("/api/admin/reglages", valeurs);
      retour.textContent = "Réglages enregistrés.";
      notifier("Réglages enregistrés.");
    } catch (erreur) {
      retour.textContent = erreur.message;
    }
  });

  /* Changement de mot de passe : même écran, action distincte. */
  const ancien = h("input", { type: "password", id: "ancien-mot-de-passe", autocomplete: "current-password" });
  const nouveau = h("input", { type: "password", id: "nouveau-mot-de-passe", autocomplete: "new-password" });
  const retourMotDePasse = h("p", { class: "champ__aide", role: "status" });
  const blocMotDePasse = h(
    "form",
    { class: "etat" },
    h("h3", {}, "Changer le mot de passe de la console"),
    h("p", {}, "Huit caractères au minimum. Le mot de passe par défaut est refusé."),
    h("div", { class: "champ" }, h("label", { for: "ancien-mot-de-passe" }, "Mot de passe actuel"), ancien),
    h("div", { class: "champ" }, h("label", { for: "nouveau-mot-de-passe" }, "Nouveau mot de passe"), nouveau),
    retourMotDePasse,
    h("div", {}, h("button", { class: "bouton", type: "submit" }, "Changer le mot de passe"))
  );
  blocMotDePasse.addEventListener("submit", async (evenement) => {
    evenement.preventDefault();
    try {
      const resultat = await envoyer("/api/admin/motdepasse", { ancien: ancien.value, nouveau: nouveau.value });
      retourMotDePasse.textContent = resultat.message;
      ancien.value = "";
      nouveau.value = "";
    } catch (erreur) {
      retourMotDePasse.textContent = erreur.message;
    }
  });

  const conteneur = h("div", { class: "panneau" }, h("h2", {}, "Réglages du site"), formulaire, blocMotDePasse);
  return conteneur;
}

