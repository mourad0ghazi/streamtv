/**
 * Assistant : diagnostic et demandes en français.
 *
 * Deux blocs, deux usages. Le diagnostic lit l'état réel de l'installation et
 * propose, constat par constat, la correction sûre quand elle existe. La
 * demande en français passe par un moteur de règles local : il comprend un
 * vocabulaire fini, annonce ce qu'il a compris, montre les changements avant
 * de les appliquer, et refuse le reste sans rien inventer.
 *
 * Ce panneau le dit en clair au lieu de laisser croire à un modèle distant :
 * aucun réseau, aucune clé, aucune génération de texte libre.
 */

import { h, vider, notifier } from "../dom.js";
import { obtenir, envoyer } from "../api.js";
import { quand, gravite } from "./format.js";

function constatLigne(constat, { recharger }) {
  return h(
    "li",
    { class: `constat constat--${constat.gravite}` },
    h(
      "div",
      { class: "constat__entete" },
      h("span", { class: "etiquette" }, gravite(constat.gravite)),
      h("strong", {}, constat.titre),
      h("span", { class: "constat__code" }, constat.code)
    ),
    h("p", { class: "constat__detail" }, constat.detail),
    constat.correction
      ? h(
          "button",
          {
            class: "bouton bouton--petit",
            type: "button",
            onclick: async () => {
              try {
                const resultat = await envoyer("/api/admin/assistant/appliquer", { actions: [constat.correction] });
                notifier(resultat.refusees?.length ? resultat.refusees[0].raison : "Correction appliquée.");
                await recharger();
              } catch (erreur) {
                notifier(erreur.message);
              }
            }
          },
          constat.correction.libelle ?? "Appliquer la correction"
        )
      : h("span", { class: "champ__aide" }, "Pas de correction automatique : cette décision demande une source, un texte ou un nom.")
  );
}

function actionsProposees(proposition, { recharger }) {
  if (!proposition.actions?.length) return null;
  const resultat = h("p", { class: "aide-message", role: "status" });
  return h(
    "div",
    { class: "proposition" },
    h("h3", {}, "Changements proposés"),
    h(
      "ul",
      { class: "mesures" },
      ...proposition.actions.map((action) =>
        h("li", {}, h("span", { class: "etiquette" }, action.module), " ", action.libelle)
      )
    ),
    h(
      "button",
      {
        class: "bouton bouton--principal",
        type: "button",
        onclick: async (evenement) => {
          evenement.target.disabled = true;
          try {
            const reponse = await envoyer("/api/admin/assistant/appliquer", { actions: proposition.actions });
            const passees = reponse.appliquees?.length ?? 0;
            const refusees = reponse.refusees ?? [];
            resultat.textContent = refusees.length
              ? `${passees} changement(s) appliqué(s), ${refusees.length} refusé(s) : ${refusees.map((r) => `${r.libelle} (${r.raison})`).join(" ; ")}`
              : `${passees} changement(s) appliqué(s).`;
            notifier("Changements appliqués.");
            await recharger();
          } catch (erreur) {
            resultat.textContent = erreur.message;
            evenement.target.disabled = false;
          }
        }
      },
      "Appliquer ces changements"
    ),
    resultat
  );
}

export async function panneauAssistant(contexte) {
  const { recharger } = contexte;
  const diagnostic = await obtenir("/api/admin/diagnostic");
  const { resume, constats } = diagnostic;

  const resumeBloc = h(
    "ul",
    { class: "mesures" },
    h("li", {}, `${resume.graves} constat(s) grave(s), ${resume.avertissements} à surveiller, ${resume.infos} pour information.`),
    h("li", {}, `${resume.corregeables} correction(s) sûre(s) applicable(s) en un clic.`),
    h("li", {}, `Relevé ${quand(diagnostic.releve)} : ${resume.mesures.chaines} chaînes, ${resume.mesures.anime} animés, ${resume.mesures.films} films, ${resume.mesures.incidents} incident(s).`)
  );

  const listeConstats = h(
    "ul",
    { class: "constats" },
    ...(constats.length
      ? constats.map((constat) => constatLigne(constat, { recharger }))
      : [h("li", { class: "champ__aide" }, "Aucun constat : l'installation ne présente rien à corriger.")])
  );

  /* Demande en français */
  const phrase = h("input", { type: "text", id: "assistant-phrase", placeholder: "Affiches par rangée à 5", maxlength: "200" });
  const reponseZone = h("div", { class: "proposition" });
  const message = h("p", { class: "aide-message", role: "status" });

  async function demander(texte) {
    message.textContent = "";
    vider(reponseZone);
    try {
      const proposition = await envoyer("/api/admin/assistant", { phrase: texte });
      if (proposition.diagnostic) {
        message.textContent = "Diagnostic relancé : voir le bloc du haut, rechargé à l'instant.";
        await recharger();
        return;
      }
      reponseZone.append(
        h("h3", {}, proposition.comprise ? "Compris" : "Pas compris"),
        h("p", {}, proposition.lecture),
        proposition.comprise ? null : h("p", { class: "champ__aide" }, `Formulations reconnues : ${(proposition.exemples ?? []).join(" · ")}`),
        actionsProposees(proposition, { recharger })
      );
    } catch (erreur) {
      message.textContent = erreur.message;
    }
  }

  const formulaire = h(
    "form",
    { class: "formulaire" },
    h("div", { class: "champ" }, h("label", { for: "assistant-phrase" }, "Demander un changement"), phrase),
    h("div", { class: "formulaire__actions" }, h("button", { class: "bouton bouton--principal", type: "submit" }, "Demander")),
    message,
    reponseZone,
    h(
      "div",
      { class: "exemples" },
      ...diagnostic.exemples.map((exemple) =>
        h("button", { class: "bouton bouton--petit", type: "button", onclick: () => { phrase.value = exemple; demander(exemple); } }, exemple)
      )
    )
  );

  formulaire.addEventListener("submit", (evenement) => {
    evenement.preventDefault();
    demander(phrase.value);
  });

  const boutonTout = h(
    "button",
    {
      class: "bouton",
      type: "button",
      disabled: resume.corregeables === 0,
      onclick: async (evenement) => {
        evenement.target.disabled = true;
        try {
          const proposition = await envoyer("/api/admin/assistant", { phrase: "Corrige tout" });
          const resultat = await envoyer("/api/admin/assistant/appliquer", { actions: proposition.actions });
          notifier(`${resultat.appliquees.length} correction(s) appliquée(s).`);
          await recharger();
        } catch (erreur) {
          notifier(erreur.message);
          evenement.target.disabled = false;
        }
      }
    },
    "Appliquer toutes les corrections sûres"
  );

  return h(
    "div",
    { class: "panneau-empile" },
    h(
      "section",
      { class: "bloc" },
      h("h2", {}, "Diagnostic de l'installation"),
      resumeBloc,
      h("div", { class: "formulaire__actions" }, boutonTout, h("button", { class: "bouton bouton--petit", type: "button", onclick: () => recharger() }, "Relancer l'analyse")),
      listeConstats
    ),
    h(
      "section",
      { class: "bloc" },
      h("h2", {}, "Demander un changement"),
      h("p", { class: "champ__aide" }, "Le moteur comprend un vocabulaire fini, affiché sous le champ. Il montre les changements avant de les appliquer, et le dernier lot peut être annulé."),
      formulaire
    ),
    h(
      "section",
      { class: "bloc" },
      h("h2", {}, "Ce que cet assistant est, et ce qu'il n'est pas"),
      h(
        "ul",
        { class: "mesures" },
        h("li", {}, "Un moteur de règles local, exécuté par le serveur : aucun modèle distant, aucune clé d'API, aucun appel réseau."),
        h("li", {}, "Il lit des mesures réelles (catalogue, sources, incidents, configuration) et propose des corrections vérifiables."),
        h("li", {}, "Il ne rédige pas de texte libre, ne modifie pas de fichier de code et n'invente aucune donnée."),
        h("li", {}, "Chaque changement passe par le module compétent, qui peut le refuser ; tout est journalisé (A50, A51).")
      )
    )
  );
}
