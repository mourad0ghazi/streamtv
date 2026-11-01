/**
 * Console d'administration : connexion, onglets, panneaux.
 * Chaque onglet porte un lien visible vers sa section de
 * docs/ADMINISTRATION.md ; le test de cohérence vérifie la cible.
 */

import { h, vider, notifier } from "../dom.js";
import { obtenir, envoyer, ErreurApi } from "../api.js";
import { ONGLETS, ROLES } from "./onglets.js";
import { panneauSources } from "./sources.js";
import { panneauStatistiques } from "./statistiques.js";
import { panneauReglages } from "./reglages.js";
import { panneauJournal } from "./audit.js";

const RACINE = document.getElementById("console");

function lienDocumentation(ancre) {
  return h(
    "a",
    { class: "lien", href: `/docs/ADMINISTRATION.md#${ancre}`, target: "_blank", rel: "noreferrer" },
    "Documentation de cet onglet"
  );
}

/* ------------------------------------------------------------------ */
/* Connexion                                                           */
/* ------------------------------------------------------------------ */

function formulaireConnexion(message) {
  const motDePasse = h("input", { type: "password", id: "mot-de-passe", autocomplete: "current-password", required: true });
  const code = h("input", { type: "text", id: "code", inputmode: "numeric", autocomplete: "one-time-code", maxlength: 6, placeholder: "123456" });
  const aide = h("p", { class: "aide-message", role: "alert" });
  const bouton = h("button", { class: "bouton bouton--principal", type: "submit" }, "Entrer dans la console");

  const formulaire = h(
    "form",
    { class: "etat", style: "max-width: 480px" },
    h("h1", {}, "Console d'administration"),
    h("p", {}, "Renseignez le mot de passe. Sur un appareil non reconnu, le code de vérification affiché par le serveur est aussi demandé."),
    h("div", { class: "champ" }, h("label", { for: "mot-de-passe" }, "Mot de passe"), motDePasse),
    h(
      "div",
      { class: "champ" },
      h("label", { for: "code" }, "Code de vérification (nouvel appareil)"),
      code,
      h("span", { class: "champ__aide" }, "Six chiffres, affichés sur la sortie du serveur ; ils changent toutes les dix minutes.")
    ),
    message ? h("p", { class: "champ__aide" }, message) : null,
    aide,
    h("div", {}, bouton)
  );

  formulaire.addEventListener("submit", async (evenement) => {
    evenement.preventDefault();
    bouton.disabled = true;
    aide.textContent = "";
    try {
      await envoyer("/api/admin/connexion", { motDePasse: motDePasse.value, code: code.value.trim() });
      motDePasse.value = "";
      await demarrer();
    } catch (erreur) {
      aide.textContent = erreur.message;
    } finally {
      bouton.disabled = false;
    }
  });

  return formulaire;
}

/* ------------------------------------------------------------------ */
/* Coquille de la console                                              */
/* ------------------------------------------------------------------ */

let ongletCourant = "sources";
let session = null;

function barreOnglets() {
  return h(
    "div",
    { class: "onglets", role: "tablist", "aria-label": "Onglets de la console" },
    ONGLETS.map((onglet) =>
      h(
        "button",
        {
          type: "button",
          role: "tab",
          "aria-selected": onglet.cle === ongletCourant ? "true" : "false",
          onclick: () => {
            ongletCourant = onglet.cle;
            afficher();
          }
        },
        onglet.libelle
      )
    )
  );
}

async function panneauDemande(onglet) {
  if (onglet.cle === "sources") return panneauSources();
  if (onglet.cle === "anime") return panneauStatistiques("anime");
  if (onglet.cle === "films") return panneauStatistiques("films");
  if (onglet.cle === "reglages") return panneauReglages();
  return panneauJournal();
}

async function afficher() {
  const onglet = ONGLETS.find((o) => o.cle === ongletCourant) ?? ONGLETS[0];
  vider(RACINE);

  const entete = h(
    "div",
    { class: "page__entete" },
    h(
      "div",
      {},
      h("h1", {}, "Console"),
      h("p", { class: "page__chapeau" }, `Connecté en tant que ${ROLES[session.role] ?? session.role}. Session de ${session.dureeMinutes ?? 60} minutes.`)
    ),
    h(
      "button",
      {
        class: "bouton",
        type: "button",
        onclick: async () => {
          await envoyer("/api/admin/deconnexion", {}).catch(() => {});
          await demarrer();
        }
      },
      "Se déconnecter"
    )
  );

  const zone = h("div", { class: "panneau", role: "tabpanel" }, h("p", { class: "attente" }, "Chargement de l'onglet"));
  RACINE.append(h("div", { class: "console" }, entete, barreOnglets(), h("div", { class: "panneau" }, lienDocumentation(onglet.doc)), zone));

  try {
    const contenu = await panneauDemande(onglet);
    vider(zone).append(contenu);
  } catch (erreur) {
    vider(zone).append(h("p", { class: "aide-message", role: "alert" }, erreur.message));
  }
}

async function demarrer() {
  vider(RACINE).append(h("p", { class: "attente" }, "Vérification de la session"));
  let etat;
  try {
    etat = await obtenir("/api/admin/session");
  } catch (erreur) {
    vider(RACINE).append(formulaireConnexion(erreur instanceof ErreurApi ? erreur.message : null));
    return;
  }
  if (!etat.connecte) {
    session = null;
    vider(RACINE).append(
      h(
        "div",
        { class: "console" },
        formulaireConnexion(etat.motDePasseParDefaut ? "Le mot de passe par défaut est encore actif. Changez-le depuis l'onglet Réglages dès la première connexion." : null)
      )
    );
    return;
  }
  session = { role: etat.role, dureeMinutes: etat.dureeMinutes, motDePasseParDefaut: etat.motDePasseParDefaut };
  await afficher();
  if (etat.motDePasseParDefaut) {
    notifier("Le mot de passe par défaut est actif : changez-le dans l'onglet Réglages.");
  }
}

demarrer();
