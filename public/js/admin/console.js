/**
 * Console d'administration : connexion, navigation latérale, panneaux.
 *
 * La console ne décide d'aucun droit : elle masque les onglets que la session
 * ne peut pas ouvrir, et le serveur refuse de toute façon chaque route. Un
 * onglet caché n'est pas une sécurité, c'est une politesse.
 *
 * Chaque panneau reçoit `{ session, recharger, aller }` et rend un nœud. Le
 * panneau porte lui-même ses appels au serveur : un seul endroit à lire pour
 * comprendre ce qu'il fait.
 */

import { h, vider, notifier } from "../dom.js";
import { obtenir, envoyer, ErreurApi, memoriserSession, oublierSession } from "../api.js";
import { ONGLETS, ROLES, GROUPES, ongletsVisibles } from "./onglets.js";
import { panneauSources } from "./sources.js";
import { panneauStatistiques } from "./statistiques.js";
import { panneauReglages } from "./reglages.js";
import { panneauJournal } from "./audit.js";
import { panneauTableau } from "./tableau.js";
import { panneauApparence } from "./apparence.js";
import { panneauLecture } from "./lecture.js";
import { panneauAccueil } from "./accueil-console.js";
import { panneauUtilisateurs } from "./utilisateurs.js";
import { panneauPermissions } from "./permissions.js";
import { panneauAssistant } from "./assistant.js";

const RACINE = document.getElementById("console");
const ONGLET_DEFAUT = "tableau";

let session = null;
let ongletCourant = null;

function lienDocumentation(ancre) {
  return h(
    "a",
    { class: "lien console__doc", href: `/docs/ADMINISTRATION.md#${ancre}`, target: "_blank", rel: "noreferrer" },
    "Documentation de cet onglet"
  );
}

/* ------------------------------------------------------------------ */
/* Connexion                                                           */
/* ------------------------------------------------------------------ */

/**
 * Formulaire de connexion. L'identifiant est facultatif : vide, il désigne le
 * mot de passe de la console, celui du propriétaire. Un compte nommé prend le
 * même formulaire, sans changer de page.
 */
function formulaireConnexion(message, options = {}) {
  const codeRequis = options.codeRequis === true;
  const identifiant = h("input", { type: "text", id: "identifiant", autocomplete: "username", placeholder: "vide pour le propriétaire" });
  const motDePasse = h("input", { type: "password", id: "mot-de-passe", autocomplete: "current-password", required: true });
  const code = codeRequis
    ? h("input", { type: "text", id: "code", inputmode: "numeric", autocomplete: "one-time-code", maxlength: 6, placeholder: "123456" })
    : null;
  const aide = h("p", { class: "aide-message", role: "alert" });
  const bouton = h("button", { class: "bouton bouton--principal", type: "submit" }, "Entrer dans la console");

  const formulaire = h(
    "form",
    { class: "etat console__connexion" },
    h("h1", {}, "Console d'administration"),
    h(
      "p",
      {},
      codeRequis
        ? "Renseignez le mot de passe. Sur un appareil non reconnu, le code de vérification affiché par le serveur est aussi demandé."
        : "Renseignez le mot de passe pour entrer. Un identifiant n'est utile que pour un compte nommé."
    ),
    h("div", { class: "champ" }, h("label", { for: "identifiant" }, "Identifiant (facultatif)"), identifiant),
    h("div", { class: "champ" }, h("label", { for: "mot-de-passe" }, "Mot de passe"), motDePasse),
    codeRequis
      ? h(
          "div",
          { class: "champ" },
          h("label", { for: "code" }, "Code de vérification (nouvel appareil)"),
          code,
          h("span", { class: "champ__aide" }, "Six chiffres, affichés sur la sortie du serveur ; ils changent toutes les dix minutes.")
        )
      : null,
    message ? h("p", { class: "champ__aide" }, message) : null,
    aide,
    h("div", {}, bouton)
  );

  formulaire.addEventListener("submit", async (evenement) => {
    evenement.preventDefault();
    bouton.disabled = true;
    aide.textContent = "";
    try {
      const reponse = await envoyer("/api/admin/connexion", {
        identifiant: identifiant.value.trim(),
        motDePasse: motDePasse.value,
        code: code ? code.value.trim() : ""
      });
      // Le jeton reste hors du cookie : dans un cadre d'un autre domaine, le
      // cookie `SameSite=Strict` n'est jamais renvoyé et la console bouclait.
      memoriserSession(reponse);
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
/* Coquille                                                            */
/* ------------------------------------------------------------------ */

function navigation(visibles) {
  const groupes = GROUPES.map((groupe) => {
    const items = visibles.filter((o) => o.groupe === groupe);
    if (!items.length) return null;
    return h(
      "div",
      { class: "console-nav__groupe" },
      h("span", { class: "console-nav__titre" }, groupe),
      ...items.map((onglet) =>
        h(
          "button",
          {
            type: "button",
            class: `console-nav__item${onglet.cle === ongletCourant ? " console-nav__item--actif" : ""}`,
            "aria-current": onglet.cle === ongletCourant ? "page" : null,
            onclick: () => {
              ongletCourant = onglet.cle;
              afficher();
            }
          },
          onglet.libelle
        )
      )
    );
  });

  return h(
    "aside",
    { class: "console-nav", "aria-label": "Navigation de la console" },
    h("div", { class: "console-nav__marque" }, h("strong", {}, "StreamTV"), h("span", {}, "Console")),
    ...groupes,
    h(
      "div",
      { class: "console-nav__pied" },
      h("span", { class: "console-nav__role" }, ROLES[session.role]?.split(" :")[0] ?? session.role),
      h("span", { class: "console-nav__compte" }, session.compte?.nom ?? session.role),
      h(
        "button",
        {
          class: "bouton",
          type: "button",
          onclick: async () => {
            await envoyer("/api/admin/deconnexion", {}).catch(() => {});
            oublierSession();
            await demarrer();
          }
        },
        "Se déconnecter"
      )
    )
  );
}

function panneauDemande(onglet) {
  const contexte = { session, recharger: afficher, aller };
  if (onglet.cle === "tableau") return panneauTableau(contexte);
  if (onglet.cle === "accueil") return panneauAccueil(contexte);
  if (onglet.cle === "apparence") return panneauApparence(contexte);
  if (onglet.cle === "lecture") return panneauLecture(contexte);
  if (onglet.cle === "sources") return panneauSources();
  if (onglet.cle === "anime") return panneauStatistiques("anime");
  if (onglet.cle === "films") return panneauStatistiques("films");
  if (onglet.cle === "utilisateurs") return panneauUtilisateurs(contexte);
  if (onglet.cle === "permissions") return panneauPermissions(contexte);
  if (onglet.cle === "assistant") return panneauAssistant(contexte);
  if (onglet.cle === "reglages") return panneauReglages();
  return panneauJournal();
}

function aller(cle) {
  ongletCourant = cle;
  window.location.hash = `#${cle}`;
  return afficher();
}

async function afficher() {
  const visibles = ongletsVisibles(session.permissions ?? []);
  if (!visibles.length) {
    vider(RACINE).append(
      h(
        "div",
        { class: "console" },
        h("div", { class: "etat" }, h("h1", {}, "Aucun onglet accessible"), h("p", {}, "Ce compte n'a aucune permission. Demandez au propriétaire de vous en accorder une."))
      )
    );
    return;
  }
  const onglet = visibles.find((o) => o.cle === ongletCourant) ?? visibles[0];
  ongletCourant = onglet.cle;

  const zone = h("div", { class: "console-panneau", role: "tabpanel" }, h("p", { class: "attente" }, "Chargement de l'onglet"));

  vider(RACINE).append(
    h(
      "div",
      { class: "console-app" },
      session.accesLibre
        ? h(
            "div",
            { class: "bandeau-demo", role: "status" },
            h("strong", {}, "Accès libre"),
            " · cette console s'ouvre sans mot de passe. Réglage « Console sans mot de passe » pour la refermer."
          )
        : null,
      navigation(visibles),
      h(
        "main",
        { class: "console-main" },
        h(
          "header",
          { class: "console-entete" },
          h("div", {}, h("h1", {}, onglet.libelle), h("p", { class: "console-entete__sous" }, sousTitre(onglet))),
          h("div", { class: "console-entete__outils" }, lienDocumentation(onglet.doc))
        ),
        zone
      )
    )
  );

  try {
    const contenu = await panneauDemande(onglet);
    vider(zone).append(contenu);
  } catch (erreur) {
    vider(zone).append(h("p", { class: "aide-message", role: "alert" }, erreur.message));
  }
}

function sousTitre(onglet) {
  const sous = {
    tableau: "L'état du site en un écran : chiffres, santé, activité.",
    accueil: "L'ordre des sections, leurs titres et leur visibilité.",
    apparence: "Couleurs, thème, densité et largeur du site public.",
    lecture: "Fournisseur de flux, attestation de droits et préférences du lecteur.",
    utilisateurs: "Les comptes, leur rôle et leur état.",
    permissions: "Ce que chaque rôle peut faire, permission par permission.",
    assistant: "Diagnostic et changements demandés en français.",
    films: "Ajout de films par identifiant TMDb, et état des clés."
  };
  return sous[onglet.cle] ?? "Console d'administration du catalogue.";
}

async function demarrer() {
  vider(RACINE).append(h("p", { class: "attente" }, "Vérification de la session"));
  let etat;
  try {
    etat = await obtenir("/api/admin/session");
  } catch (erreur) {
    vider(RACINE).append(formulaireConnexion(erreur instanceof ErreurApi ? erreur.message : null, { codeRequis: false }));
    return;
  }
  if (!etat.connecte) {
    session = null;
    vider(RACINE).append(
      h(
        "div",
        { class: "console" },
        formulaireConnexion(
          etat.motDePasseParDefaut ? "Le mot de passe par défaut est encore actif. Changez-le depuis l'onglet Réglages dès la première connexion." : null,
          { codeRequis: etat.codeRequis === true }
        )
      )
    );
    return;
  }
  session = {
    role: etat.role,
    compte: etat.compte && typeof etat.compte === "object" ? etat.compte : null,
    permissions: etat.permissions ?? [],
    motDePasseParDefaut: etat.motDePasseParDefaut,
    accesLibre: etat.accesLibre === true
  };
  const demande = window.location.hash.replace("#", "");
  ongletCourant = ONGLETS.some((o) => o.cle === demande) ? demande : ONGLET_DEFAUT;
  await afficher();
  if (etat.motDePasseParDefaut) {
    notifier("Le mot de passe par défaut est actif : changez-le dans l'onglet Réglages.");
  }
}

window.addEventListener("hashchange", () => {
  const demande = window.location.hash.replace("#", "");
  if (!ONGLETS.some((o) => o.cle === demande) || !session) return;
  ongletCourant = demande;
  afficher();
});

demarrer();
