/**
 * Permissions : la matrice des rôles et des capacités.
 *
 * Une case cochée dit qu'un rôle peut faire une chose. Le propriétaire garde
 * tout et sa colonne n'est pas modifiable ; l'administrateur garde la gestion
 * des comptes, sans quoi plus personne ne pourrait en créer.
 *
 * Sans la permission `roles.ecrire`, la matrice s'affiche en lecture seule : le
 * serveur refuserait l'enregistrement, autant le dire avant le clic.
 */

import { h, vider, notifier } from "../dom.js";
import { obtenir, envoyer } from "../api.js";

export async function panneauPermissions({ session, recharger }) {
  const donnees = await obtenir("/api/admin/permissions");
  const modifiable = (session.permissions ?? []).includes("roles.ecrire");
  const rolesModifiables = donnees.roles.filter((r) => r.cle !== "proprietaire");
  const message = h("p", { class: "aide-message", role: "status" });

  const cases = new Map();
  const lignes = [];
  for (const groupe of donnees.groupes) {
    const permissions = donnees.catalogue.filter((p) => p.groupe === groupe);
    if (!permissions.length) continue;
    lignes.push(
      h("tr", { class: "tableau__groupe" }, h("th", { colspan: String(rolesModifiables.length + 1) }, groupe))
    );
    for (const permission of permissions) {
      const cellules = rolesModifiables.map((role) => {
        const coche = role.permissions.includes(permission.cle);
        const controle = h("input", {
          type: "checkbox",
          checked: coche,
          disabled: !modifiable || (role.cle === "administrateur" && permission.cle === "utilisateurs.ecrire"),
          "aria-label": `${permission.libelle} pour ${role.libelle}`
        });
        cases.set(`${role.cle}|${permission.cle}`, controle);
        return h("td", {}, controle);
      });
      lignes.push(
        h(
          "tr",
          {},
          h("th", { scope: "row" }, h("strong", {}, permission.libelle), h("span", { class: "champ__aide" }, permission.cle)),
          ...cellules
        )
      );
    }
  }

  const bouton = h(
    "button",
    {
      class: "bouton bouton--principal",
      type: "button",
      disabled: !modifiable,
      onclick: async () => {
        message.textContent = "";
        bouton.disabled = true;
        const resultats = [];
        for (const role of rolesModifiables) {
          const permissions = donnees.catalogue
            .map((p) => p.cle)
            .filter((cle) => cases.get(`${role.cle}|${cle}`)?.checked);
          try {
            await envoyer("/api/admin/permissions", { role: role.cle, permissions });
            resultats.push(role.libelle);
          } catch (erreur) {
            message.textContent = `${role.libelle} : ${erreur.message}`;
          }
        }
        if (resultats.length && !message.textContent) {
          notifier(`Permissions enregistrées pour ${resultats.join(", ")}.`);
          message.textContent = `Permissions enregistrées pour ${resultats.join(", ")}.`;
          await recharger();
        }
        bouton.disabled = !modifiable;
      }
    },
    "Enregistrer les permissions"
  );

  return h(
    "div",
    { class: "panneau-empile" },
    h(
      "section",
      { class: "bloc" },
      h("h2", {}, "Matrice des rôles"),
      h(
        "p",
        { class: "champ__aide" },
        modifiable
          ? "Une case cochée autorise le rôle. Le changement s'applique aux connexions suivantes et aux sessions dont le rôle est concerné."
          : "Votre compte peut consulter la matrice mais pas la modifier : il manque la permission roles.ecrire."
      ),
      h(
        "div",
        { class: "tableau-defilant" },
        h(
          "table",
          { class: "tableau tableau--matrice" },
          h("thead", {}, h("tr", {}, h("th", {}, "Permission"), ...rolesModifiables.map((role) => h("th", {}, role.libelle)))),
          h("tbody", {}, ...lignes)
        )
      ),
      message,
      h("div", { class: "formulaire__actions" }, bouton)
    ),
    h(
      "section",
      { class: "bloc" },
      h("h2", {}, "Ce que chaque rôle peut faire"),
      h(
        "ul",
        { class: "mesures" },
        ...donnees.roles.map((role) =>
          h("li", {}, h("strong", {}, role.libelle), ` : ${role.permissions.length} permission(s). ${role.resume ?? ""}`)
        )
      )
    )
  );
}
