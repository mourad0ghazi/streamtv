/**
 * Comptes de la console : qui entre, avec quel rôle, et s'il est actif.
 *
 * Le propriétaire (le mot de passe de la console) est affiché en tête sans
 * bouton de suppression : il n'est pas un compte comme les autres. Les autres
 * lignes portent leur rôle, leur état, leur dernière connexion, et deux
 * actions : changer le rôle, désactiver, supprimer.
 */

import { h, vider, notifier } from "../dom.js";
import { obtenir, envoyer, supprimer } from "../api.js";
import { quand } from "./format.js";

function ligne(compte, roles, contexte) {
  const { recharger } = contexte;
  const virtuel = compte.virtuel === true;

  const selecteurRole = h(
    "select",
    { "aria-label": `Rôle de ${compte.nom}`, disabled: virtuel },
    ...roles
      .filter((role) => role.cle !== "proprietaire")
      .map((role) => h("option", { value: role.cle, selected: role.cle === compte.role ? true : null }, role.libelle))
  );

  async function modifier(corps, succes) {
    try {
      await envoyer(`/api/admin/utilisateurs/${compte.id}`, corps);
      notifier(succes);
      await recharger();
    } catch (erreur) {
      notifier(erreur.message);
    }
  }

  return h(
    "tr",
    {},
    h("td", {}, h("strong", {}, compte.nom), h("span", { class: "champ__aide" }, compte.identifiant)),
    h("td", {}, virtuel ? h("span", { class: "etiquette" }, "Propriétaire") : selecteurRole),
    h(
      "td",
      {},
      h("span", { class: `etiquette${compte.actif === false ? " etiquette--alerte" : ""}` }, compte.actif === false ? "Désactivé" : "Actif"),
      h("span", { class: "champ__aide" }, compte.connexion ? `vu ${quand(compte.connexion)}` : "jamais connecté")
    ),
    h("td", {}, String(compte.permissions?.length ?? 0)),
    h(
      "td",
      { class: "tableau__actions" },
      virtuel
        ? h("span", { class: "champ__aide" }, "Toujours actif")
        : h(
            "button",
            { class: "bouton bouton--petit", type: "button", onclick: () => modifier({ role: selecteurRole.value }, "Rôle mis à jour.") },
            "Appliquer le rôle"
          ),
      virtuel
        ? null
        : h(
            "button",
            {
              class: "bouton bouton--petit",
              type: "button",
              onclick: () => modifier({ actif: compte.actif === false }, compte.actif === false ? "Compte réactivé." : "Compte désactivé.")
            },
            compte.actif === false ? "Réactiver" : "Désactiver"
          ),
      virtuel
        ? null
        : h(
            "button",
            {
              class: "bouton bouton--petit bouton--danger",
              type: "button",
              onclick: async () => {
                try {
                  await supprimer(`/api/admin/utilisateurs/${compte.id}`);
                  notifier("Compte supprimé.");
                  await recharger();
                } catch (erreur) {
                  notifier(erreur.message);
                }
              }
            },
            "Supprimer"
          )
    )
  );
}

export async function panneauUtilisateurs(contexte) {
  const donnees = await obtenir("/api/admin/utilisateurs");
  const { recharger } = contexte;

  const identifiant = h("input", { type: "text", id: "compte-identifiant", maxlength: "24", placeholder: "amina" });
  const nom = h("input", { type: "text", id: "compte-nom", maxlength: "60", placeholder: "Amina B." });
  const role = h(
    "select",
    { id: "compte-role" },
    ...donnees.roles.filter((r) => r.cle !== "proprietaire").map((r) => h("option", { value: r.cle }, r.libelle))
  );
  const motDePasse = h("input", { type: "password", id: "compte-mdp", autocomplete: "new-password", placeholder: "au moins 10 caractères" });
  const message = h("p", { class: "aide-message", role: "status" });

  const formulaire = h(
    "form",
    { class: "formulaire" },
    h("div", { class: "champ" }, h("label", { for: "compte-identifiant" }, "Identifiant"), identifiant, h("span", { class: "champ__aide" }, "3 à 24 caractères parmi a-z, 0-9 et tiret.")),
    h("div", { class: "champ" }, h("label", { for: "compte-nom" }, "Nom affiché"), nom),
    h("div", { class: "champ" }, h("label", { for: "compte-role" }, "Rôle"), role, h("span", { class: "champ__aide" }, donnees.roles.find((r) => r.cle === role.value)?.resume ?? "")),
    h("div", { class: "champ" }, h("label", { for: "compte-mdp" }, "Mot de passe"), motDePasse),
    message,
    h("div", { class: "formulaire__actions" }, h("button", { class: "bouton bouton--principal", type: "submit" }, "Créer le compte"))
  );

  formulaire.addEventListener("submit", async (evenement) => {
    evenement.preventDefault();
    message.textContent = "";
    try {
      await envoyer("/api/admin/utilisateurs", {
        identifiant: identifiant.value.trim(),
        nom: nom.value.trim(),
        role: role.value,
        motDePasse: motDePasse.value
      });
      notifier("Compte créé.");
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
      h("h2", {}, "Comptes"),
      h("p", { class: "champ__aide" }, `${donnees.comptes.length} compte(s). Le propriétaire est le mot de passe de la console : il ne se supprime pas.`),
      h(
        "div",
        { class: "tableau-defilant" },
        h(
          "table",
          { class: "tableau" },
          h("thead", {}, h("tr", {}, h("th", {}, "Compte"), h("th", {}, "Rôle"), h("th", {}, "État"), h("th", {}, "Permissions"), h("th", {}, "Actions"))),
          h("tbody", {}, ...donnees.comptes.map((compte) => ligne(compte, donnees.roles, contexte)))
        )
      )
    ),
    h("section", { class: "bloc" }, h("h2", {}, "Créer un compte"), formulaire),
    h(
      "section",
      { class: "bloc" },
      h("h2", {}, "Rôles disponibles"),
      h(
        "ul",
        { class: "mesures" },
        ...donnees.roles.map((r) => h("li", {}, h("strong", {}, r.libelle), ` : ${r.resume}`))
      )
    )
  );
}
