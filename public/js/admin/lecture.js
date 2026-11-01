/**
 * Lecture et diffusion : le fournisseur de flux, sa clé, l'attestation de
 * droits, et les préférences du lecteur du site.
 *
 * L'ordre du panneau suit l'ordre des décisions : d'abord les droits (sans eux,
 * rien ne s'ouvre), puis l'adresse et la clé, puis l'ouverture, puis les
 * préférences. La console n'invente jamais une adresse : elle affiche celle que
 * le serveur construirait.
 */

import { h, vider, notifier } from "../dom.js";
import { obtenir, envoyer } from "../api.js";
import { quand } from "./format.js";

function champ(etiquette, controle, aide) {
  return h("div", { class: "champ" }, h("label", { for: controle.id }, etiquette), controle, aide ? h("span", { class: "champ__aide" }, aide) : null);
}

function attestation(statut) {
  const a = statut.attestation ?? { droits: false, auteur: "", date: null, note: "" };
  const droits = h("input", { type: "checkbox", id: "attestation-droits", checked: a.droits === true });
  const auteur = h("input", { type: "text", id: "attestation-auteur", value: a.auteur ?? "", maxlength: "60", placeholder: "Votre nom" });
  const note = h("input", { type: "text", id: "attestation-note", value: a.note ?? "", maxlength: "240", placeholder: "Sur quoi porte l'autorisation" });
  const message = h("p", { class: "aide-message", role: "status" });
  const bouton = h("button", { class: "bouton", type: "button" }, "Enregistrer l'attestation");

  bouton.addEventListener("click", async () => {
    bouton.disabled = true;
    message.textContent = "";
    try {
      const reponse = await envoyer("/api/admin/lecture/attestation", {
        droits: droits.checked,
        auteur: auteur.value,
        note: note.value
      });
      statut.attestation = reponse.attestation;
      message.textContent = reponse.attestation.droits
        ? `Attestation enregistrée au nom de ${reponse.attestation.auteur}, le ${new Date(reponse.attestation.date).toLocaleDateString("fr-FR")}.`
        : "Attestation retirée : la lecture tierce est refermée.";
      notifier("Attestation enregistrée.");
    } catch (erreur) {
      message.textContent = erreur.message;
    } finally {
      bouton.disabled = false;
    }
  });

  return h(
    "section",
    { class: "bloc" },
    h("h2", {}, "Attestation de droits"),
    h(
      "p",
      { class: "champ__aide" },
      "Un flux tiers n'est pas un contenu du catalogue : ses droits ne sont pas vérifiés par le site. Sans attestation nommée et datée, la lecture par fournisseur reste fermée, et aucun film ne peut être ajouté."
    ),
    a.droits
      ? h("p", { class: "etiquette" }, `Attesté par ${a.auteur} ${a.date ? quand(a.date) : ""}`)
      : h("p", { class: "etiquette etiquette--alerte" }, "Aucune attestation enregistrée"),
    h("div", { class: "champ__case" }, droits, h("span", {}, "J'atteste disposer du droit de diffuser ces flux, ou que le fournisseur le garantit.")),
    champ("Nom de la personne qui atteste", auteur),
    champ("Précision (facultative)", note),
    h("div", {}, bouton),
    message
  );
}

export async function panneauLecture() {
  const { statut, description } = await obtenir("/api/admin/lecture");

  const nom = h("input", { type: "text", id: "fournisseur-nom", value: statut.fournisseur_nom, maxlength: "40" });
  const base = h("input", { type: "text", id: "fournisseur-base", value: statut.fournisseur_base, maxlength: "200" });
  const modele = h("input", { type: "text", id: "fournisseur-modele", value: statut.fournisseur_modele, maxlength: "200" });
  const cle = h("input", {
    type: "password",
    id: "fournisseur-cle",
    autocomplete: "off",
    placeholder: statut.clePresente ? `clé enregistrée : ${statut.cleExtrait}` : "aucune clé enregistrée",
    maxlength: "200"
  });
  const qualite = h(
    "select",
    { id: "qualite" },
    ...description.find((d) => d.cle === "qualite_max").valeurs.map((v) => h("option", { value: v, selected: v === statut.qualite_max ? true : null }, v === "auto" ? "automatique" : `${v} pixels`))
  );
  const reprise = h("input", { type: "checkbox", id: "reprise", checked: statut.reprise_auto === true });
  const muet = h("input", { type: "checkbox", id: "muet", checked: statut.demarrage_muet === true });
  const ouvert = h("input", { type: "checkbox", id: "fournisseur-actif", checked: statut.fournisseur_actif === true });

  // Relais des flux : le serveur va chercher la chaîne à la place du navigateur.
  const relais = h("input", { type: "checkbox", id: "proxy-actif", checked: statut.proxy_actif === true });
  const agent = h("input", { type: "text", id: "proxy-agent", value: statut.proxy_agent ?? "", maxlength: "120" });
  const referer = h(
    "select",
    { id: "proxy-referer" },
    ...["origine", "aucun"].map((v) =>
      h("option", { value: v, selected: v === statut.proxy_referer ? true : null }, v === "origine" ? "le domaine du flux" : "aucun Referer")
    )
  );

  const message = h("p", { class: "aide-message", role: "status" });
  const bouton = h("button", { class: "bouton bouton--principal", type: "submit" }, "Enregistrer la configuration");

  const formulaire = h(
    "form",
    { class: "formulaire" },
    h(
      "div",
      { class: "champ__case" },
      ouvert,
      h("span", {}, "Ouvrir la lecture par le fournisseur (exige l'attestation et une clé)")
    ),
    champ("Nom du fournisseur", nom, "Affiché sur la fiche du film, pour que le visiteur sache d'où vient le flux."),
    champ("Adresse du fournisseur", base, "HTTPS seulement. HTTP n'est accepté que pour un miroir local d'essai."),
    champ("Chemin du cadre", modele, "Doit contenir {tmdbId}. {cle} est remplacé par la clé, côté serveur."),
    champ("Clé du fournisseur", cle, "Jamais réaffichée : laissez vide pour la conserver, saisissez une valeur pour la remplacer."),
    h(
      "div",
      { class: "champ__case" },
      relais,
      h("span", {}, "Relayer les chaînes par le serveur (règle le blocage CORS, le contenu mixte et le User-Agent)")
    ),
    champ("User-Agent envoyé au diffuseur", agent, "Certains serveurs refusent les navigateurs et acceptent les lecteurs."),
    champ("Referer envoyé au diffuseur", referer, "Certains serveurs refusent une requête sans Referer."),
    champ("Qualité maximale des fichiers du catalogue", qualite, "Le fournisseur tiers choisit la sienne."),
    h("div", { class: "champ__case" }, reprise, h("span", {}, "Reprise automatique à la seconde, depuis l'appareil du visiteur")),
    h("div", { class: "champ__case" }, muet, h("span", {}, "Démarrer sans son")),
    message,
    h("div", { class: "formulaire__actions" }, bouton)
  );

  formulaire.addEventListener("submit", async (evenement) => {
    evenement.preventDefault();
    bouton.disabled = true;
    message.textContent = "";
    const changements = {
      fournisseur_nom: nom.value,
      fournisseur_base: base.value,
      fournisseur_modele: modele.value,
      qualite_max: qualite.value,
      reprise_auto: reprise.checked,
      demarrage_muet: muet.checked,
      fournisseur_actif: ouvert.checked,
      proxy_actif: relais.checked,
      proxy_agent: agent.value,
      proxy_referer: referer.value
    };
    if (cle.value.trim()) changements.cle = cle.value.trim();
    try {
      const reponse = await envoyer("/api/admin/lecture", changements);
      cle.value = "";
      cle.placeholder = reponse.statut.clePresente ? `clé enregistrée : ${reponse.statut.cleExtrait}` : "aucune clé enregistrée";
      notifier("Configuration de lecture enregistrée.");
      message.textContent = [
        reponse.statut.fournisseur_actif
          ? `Lecture ouverte par ${reponse.statut.fournisseur_nom}.`
          : "Configuration enregistrée : la lecture tierce reste fermée.",
        reponse.statut.proxy_actif
          ? "Relais ouvert : les chaînes passent par ce serveur, la bande passante est la sienne."
          : "Relais fermé : le navigateur s'adresse directement aux diffuseurs."
      ].join(" ");
      vider(zoneAvertissements).append(...avertissements(reponse.statut));
    } catch (erreur) {
      const refuses = erreur.refuses;
      message.textContent = refuses && typeof refuses === "object"
        ? Object.values(refuses).join(" ")
        : erreur.message;
    } finally {
      bouton.disabled = false;
    }
  });

  const zoneAvertissements = h("section", { class: "bloc" }, h("h2", {}, "À savoir avant d'ouvrir"), ...avertissements(statut));

  return h(
    "div",
    { class: "panneau-empile" },
    attestation(statut),
    h("section", { class: "bloc" }, h("h2", {}, "Fournisseur"), formulaire),
    zoneAvertissements,
    h(
      "section",
      { class: "bloc" },
      h("h2", {}, "État actuel"),
      h(
        "ul",
        { class: "mesures" },
        h("li", {}, `Lecture tierce : ${statut.fournisseur_actif ? "ouverte" : "fermée"}`),
        h("li", {}, `Clé : ${statut.clePresente ? `présente (${statut.cleExtrait})` : "absente"}`),
        h("li", {}, `Attestation : ${statut.atteste ? "enregistrée" : "absente"}`),
        h("li", {}, `Relais des flux : ${statut.proxy_actif ? "ouvert" : "fermé"}`),
        h("li", {}, `User-Agent du relais : ${statut.proxy_agent}`),
        h("li", {}, `Blocage éventuel : ${statut.blocage ?? "aucun"}`)
      )
    )
  );
}

function avertissements(statut) {
  return [
    h("p", { class: "champ__aide" }, statut.attribution),
    h("ul", { class: "mesures" }, ...(statut.avertissements ?? []).map((texte) => h("li", {}, texte)))
  ];
}
