/**
 * Lecteur unique, adapté au type de source : direct (HLS) ou vidéo à la demande.
 *
 * Pour le direct, le lecteur se comporte comme un téléviseur : numéro de
 * chaîne, passage à la précédente et à la suivante, liste de zapping
 * consultable pendant la lecture, son mémorisé, mode plein écran au clavier.
 *
 * Un plafond d'attente, puis un message français qui propose une issue.
 */

import { h, vider, icone } from "./dom.js";
import * as progression from "./progression.js";
import * as zapping from "./zapping.js";

let hlsCharge = null;

function chargerHls() {
  if (window.Hls) return Promise.resolve(window.Hls);
  if (hlsCharge) return hlsCharge;
  hlsCharge = new Promise((resoudre, rejeter) => {
    const script = document.createElement("script");
    script.src = "/vendor/hls.js?v=3.20.0";
    script.onload = () => (window.Hls ? resoudre(window.Hls) : rejeter(new Error("hls.js absent")));
    script.onerror = () => rejeter(new Error("hls.js illisible"));
    document.head.append(script);
  });
  return hlsCharge;
}

/** Bouton de la barre : icône seule, libellé lu par les lecteurs d'écran. */
function boutonBarre(nomIcone, libelle, action, actif = false) {
  return h(
    "button",
    {
      class: "lecteur__bouton",
      type: "button",
      title: libelle,
      "aria-label": libelle,
      "aria-pressed": actif ? "true" : null,
      onclick: action
    },
    icone(nomIcone, 20)
  );
}

/** Construit le panneau de zapping : recherche, numéros, chaîne courante. */
function construirePanneau(liste, obtenirIndex, choisir, fermerPanneau, options = {}) {
  const champ = h("input", {
    type: "search",
    placeholder: "Nom ou catégorie",
    "aria-label": "Chercher une chaîne dans la liste",
    class: "lecteur__recherche"
  });
  const items = h("ul", { class: "lecteur__liste" });
  const compte = h("p", { class: "lecteur__compte", role: "status" });

  function dessiner(filtre = "") {
    vider(items);
    const terme = filtre.trim().toLowerCase();
    const retenues = liste
      .map((chaine, position) => ({ chaine, position }))
      .filter(({ chaine }) => !terme || `${chaine.nom} ${chaine.categorie ?? ""}`.toLowerCase().includes(terme));
    for (const { chaine, position } of retenues) {
      const courante = position === obtenirIndex();
      items.append(
        h(
          "li",
          {},
          h(
            "button",
            {
              type: "button",
              class: `lecteur__item${courante ? " lecteur__item--courante" : ""}`,
              "aria-current": courante ? "true" : null,
              onclick: () => choisir(position)
            },
            h("span", { class: "lecteur__numero" }, String(position + 1)),
            h("span", { class: "lecteur__item-corps" }, h("span", { class: "lecteur__item-nom" }, chaine.nom), h("span", { class: "lecteur__item-sous" }, chaine.categorie ?? "")),
            courante ? h("span", { class: "lecteur__item-etat" }, "En cours") : null
          )
        )
      );
    }
    if (!retenues.length) {
      items.append(h("li", { class: "lecteur__item-sous" }, "Aucune chaîne ne correspond à cette recherche."));
    }
    compte.textContent = `${retenues.length} chaîne(s) sur ${liste.length}`;
    if (options.tronquee && !terme) {
      compte.textContent = `${liste.length} chaînes affichées sur ${options.totalListe ?? liste.length} : la liste est plafonnée. Filtrez par catégorie ou par pays pour zapper dans un ensemble complet.`;
    }
  }

  champ.addEventListener("input", () => dessiner(champ.value));
  dessiner();

  const panneau = h(
    "aside",
    { class: "lecteur__panneau", hidden: true, "aria-label": "Liste des chaînes" },
    h(
      "div",
      { class: "lecteur__panneau-entete" },
      h("h2", {}, "Chaînes"),
      h("button", { class: "lecteur__bouton", type: "button", "aria-label": "Fermer la liste", onclick: fermerPanneau }, icone("fermer", 20))
    ),
    champ,
    compte,
    items
  );

  return { panneau, champ, dessiner };
}

/**
 * Ouvre le lecteur.
 * options : titre, url, type ("direct" | "vod"), famille, id, reprise,
 * attenteSecondes, liste (zapping), index, onFermer.
 */
export function ouvrir(options) {
  const attente = Math.max(5, Number(options.attenteSecondes) || 10) * 1000;
  const estDirect = options.type === "direct";
  const liste = Array.isArray(options.liste) && options.liste.length ? options.liste : [];
  let index = Number.isInteger(options.index) && options.index >= 0 ? options.index : liste.findIndex((c) => c.id === options.id);
  if (index < 0) index = 0;

  const video = h("video", { playsinline: true, preload: "metadata" });
  if (!estDirect) video.setAttribute("controls", "");
  video.volume = zapping.volume();
  video.muted = zapping.sonCoupe();

  const annonce = h("p", { class: "visuellement-cache", "aria-live": "polite" });
  const indications = h("div", { class: "lecteur__indications", "aria-hidden": "true" });
  const message = h("div", { class: "lecteur__message" });
  const numero = h("span", { class: "lecteur__chaine-numero" });
  const nom = h("span", { class: "lecteur__chaine-nom" });
  const categorie = h("span", { class: "lecteur__chaine-categorie" });
  const identite = h("div", { class: "lecteur__identite" }, numero, h("span", {}, nom, categorie));
  const scene = h("div", { class: "lecteur__scene" }, video, indications, message, annonce);

  const boutonSon = boutonBarre(video.muted ? "muet" : "son", video.muted ? "Rétablir le son" : "Couper le son", () => basculerSon());
  const boutonListe = liste.length ? boutonBarre("liste", "Liste des chaînes", () => basculerPanneau()) : null;
  const boutonPrecedent = liste.length > 1 ? boutonBarre("haut", "Chaîne précédente", () => choisir(index - 1)) : null;
  const boutonSuivant = liste.length > 1 ? boutonBarre("bas", "Chaîne suivante", () => choisir(index + 1)) : null;
  const boutonPlein = boutonBarre("plein", "Plein écran", () => basculerPleinEcran());
  const boutonFermer = boutonBarre("fermer", "Fermer le lecteur", () => fermer());

  const racine = h(
    "div",
    { class: "lecteur", role: "dialog", "aria-modal": "true", "aria-label": estDirect ? "Lecteur de télévision" : "Lecteur vidéo", tabindex: "-1" },
    h(
      "div",
      { class: "lecteur__barre" },
      identite,
      h("div", { class: "lecteur__commandes" }, boutonPrecedent, boutonSuivant, boutonListe, boutonSon, boutonPlein, boutonFermer)
    ),
    scene
  );

  let hls = null;
  let minuteur = null;
  let derniereSauvegarde = 0;
  let ferme = false;
  let saisie = "";
  let minuteurSaisie = null;
  const infosListe = { tronquee: options.tronquee === true, totalListe: Number(options.totalListe) || liste.length };
  let panneau = null;

  function majIdentite() {
    const courante = liste[index];
    const titre = courante?.nom ?? options.titre ?? "";
    numero.textContent = liste.length ? `${index + 1} / ${liste.length}` : "";
    nom.textContent = titre;
    categorie.textContent = courante?.categorie ? ` · ${courante.categorie}` : "";
    document.title = `${titre} · StreamTV`;
  }

  function annoncer(suffixe = "") {
    const courante = liste[index];
    annonce.textContent = liste.length
      ? `Chaîne ${index + 1} sur ${liste.length} : ${courante?.nom ?? ""}${suffixe ? `. ${suffixe}` : ""}`
      : `${options.titre ?? ""}. ${suffixe}`;
  }

  function indiquer(texte) {
    indications.textContent = texte;
    indications.classList.add("visible");
    clearTimeout(indiquer.minuteur);
    indiquer.minuteur = setTimeout(() => indications.classList.remove("visible"), 2400);
  }

  function afficherMessage(titre, texte, actions) {
    vider(message).append(h("h2", {}, titre), h("p", {}, texte), h("div", { class: "lecteur__actions" }, actions));
    message.hidden = false;
    annoncer(texte);
  }

  function masquerMessage() {
    message.hidden = true;
    vider(message);
  }

  function detruireFlux() {
    clearTimeout(minuteur);
    if (hls) {
      hls.destroy();
      hls = null;
    }
    video.removeAttribute("src");
    video.load();
  }

  function echec(raison) {
    detruireFlux();
    const actions = [h("button", { class: "bouton bouton--principal", type: "button", onclick: () => demarrer() }, "Réessayer")];
    if (liste.length > 1) {
      actions.push(h("button", { class: "bouton", type: "button", onclick: () => choisir(index + 1) }, "Chaîne suivante"));
      actions.push(h("button", { class: "bouton", type: "button", onclick: () => ouvrirPanneau() }, "Voir la liste"));
    }
    if (Array.isArray(options.sources) && options.sources.length > 1) {
      actions.push(
        h(
          "button",
          {
            class: "bouton",
            type: "button",
            onclick: () => {
              const autre = options.sources.find((s) => s.url !== options.url) ?? options.sources[0];
              options.url = autre.url;
              nom.textContent = `${options.titre} (${autre.nom ?? "autre source"})`;
              demarrer();
            }
          },
          "Choisir une autre source"
        )
      );
    }
    actions.push(h("button", { class: "bouton", type: "button", onclick: () => fermer() }, "Revenir au catalogue"));
    afficherMessage("La lecture n'a pas démarré", raison, actions);
  }

  function armerPlafond() {
    clearTimeout(minuteur);
    minuteur = setTimeout(() => {
      if (video.readyState >= 2) return;
      echec(`Aucune image après ${Math.round(attente / 1000)} secondes. La chaîne ne répond pas : passez à une autre, ou réessayez plus tard.`);
    }, attente);
  }

  async function demarrer() {
    masquerMessage();
    detruireFlux();
    armerPlafond();
    majIdentite();

    if (estDirect) {
      const natif = video.canPlayType("application/vnd.apple.mpegurl");
      if (natif) {
        video.src = options.url;
        video.play().catch(() => {});
        return;
      }
      try {
        const Hls = await chargerHls();
        if (Hls.isSupported()) {
          hls = new Hls({ enableWorker: false, lowLatencyMode: false });
          hls.loadSource(options.url);
          hls.attachMedia(video);
          hls.on(Hls.Events.ERROR, (_evenement, donnees) => {
            if (donnees.fatal) echec("Le flux s'est interrompu. La chaîne est peut-être hors ligne : passez à la suivante avec la flèche du bas.");
          });
          video.play().catch(() => {});
          return;
        }
      } catch {
        echec("Le module de lecture du direct n'a pas pu être chargé. Rechargez la page, puis réessayez.");
        return;
      }
      echec("Ce navigateur ne sait pas lire le direct en HLS. Essayez un autre navigateur, ou une chaîne dont le flux est en MP4.");
      return;
    }

    video.src = options.url;
    if (Number.isFinite(options.reprise) && options.reprise > 10) {
      video.addEventListener("loadedmetadata", () => { video.currentTime = options.reprise; }, { once: true });
    }
    video.play().catch(() => {});
  }

  function choisir(nouvelIndex) {
    if (!liste.length) return;
    index = ((nouvelIndex % liste.length) + liste.length) % liste.length;
    const courante = liste[index];
    options.url = courante.url;
    options.id = courante.id;
    options.titre = courante.nom;
    options.type = "direct";
    zapping.memoriserChaine(courante);
    masquerMessage();
    detruireFlux();
    majIdentite();
    demarrer();
    annoncer();
    if (panneau?.dessiner) panneau.dessiner(panneau.champ.value);
  }

  function basculerSon() {
    video.muted = !video.muted;
    zapping.memoSonCoupe(video.muted);
    boutonSon.replaceChildren(icone(video.muted ? "muet" : "son", 20));
    boutonSon.setAttribute("aria-label", video.muted ? "Rétablir le son" : "Couper le son");
    boutonSon.setAttribute("title", video.muted ? "Rétablir le son" : "Couper le son");
    indiquer(video.muted ? "Son coupé" : "Son rétabli");
  }

  function basculerPleinEcran() {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
      return;
    }
    if (racine.requestFullscreen) racine.requestFullscreen().catch(() => indiquer("Le plein écran est refusé par le navigateur."));
  }

  function ouvrirPanneau() {
    if (!panneau) return;
    panneau.panneau.hidden = false;
    panneau.dessiner(panneau.champ.value);
    panneau.champ.focus();
  }

  function fermerPanneau() {
    if (!panneau) return;
    panneau.panneau.hidden = true;
    racine.focus();
  }

  function basculerPanneau() {
    if (!panneau) return;
    if (panneau.panneau.hidden) ouvrirPanneau();
    else fermerPanneau();
  }

  /** Numérotation directe : taper 12 puis attendre saute à la chaîne 12. */
  function saisirChiffre(chiffre) {
    if (!liste.length) return;
    saisie += chiffre;
    indiquer(`Chaîne ${saisie}`);
    clearTimeout(minuteurSaisie);
    minuteurSaisie = setTimeout(() => {
      const cible = Number.parseInt(saisie, 10);
      saisie = "";
      if (Number.isInteger(cible) && cible >= 1 && cible <= liste.length) choisir(cible - 1);
      else indiquer(`Aucune chaîne numéro ${cible}`);
    }, 1200);
  }

  function enregistrerPosition(force = false) {
    if (estDirect || !options.famille || !options.id) return;
    const maintenant = Date.now();
    if (!force && maintenant - derniereSauvegarde < 5000) return;
    derniereSauvegarde = maintenant;
    progression.enregistrer(options.famille, options.id, video.currentTime, video.duration);
  }

  function surTouche(evenement) {
    if (evenement.key === "Escape") {
      if (panneau && !panneau.panneau.hidden) {
        fermerPanneau();
        return;
      }
      fermer();
      return;
    }
    const touche = evenement.key.toLowerCase();
    if (touche === "m") {
      basculerSon();
      return;
    }
    if (touche === "f") {
      basculerPleinEcran();
      return;
    }
    if (touche === "l" && panneau) {
      basculerPanneau();
      return;
    }
    if (!estDirect || !liste.length) return;
    if (evenement.key === "ArrowUp") {
      evenement.preventDefault();
      choisir(index - 1);
    } else if (evenement.key === "ArrowDown") {
      evenement.preventDefault();
      choisir(index + 1);
    } else if (/^[0-9]$/.test(evenement.key)) {
      saisirChiffre(evenement.key);
    }
  }

  video.addEventListener("playing", () => {
    clearTimeout(minuteur);
    masquerMessage();
    if (liste.length) {
      const premiere = !indiquer.dejaVu;
      indiquer.dejaVu = true;
      if (premiere) indiquer("Flèches haut et bas : changer de chaîne. L : liste. F : plein écran. M : son.");
    }
  });
  video.addEventListener("error", () => echec("La vidéo n'a pas pu être lue. Essayez une autre chaîne, ou réessayez dans un instant."));
  video.addEventListener("volumechange", () => {
    if (!video.muted) zapping.memoVolume(video.volume);
  });
  video.addEventListener("timeupdate", () => enregistrerPosition(false));
  video.addEventListener("pause", () => enregistrerPosition(true));
  video.addEventListener("ended", () => {
    enregistrerPosition(true);
    if (!estDirect) progression.effacer(options.famille, options.id);
  });

  const overflowInitial = document.body.style.overflow ?? "";
  document.body.style.overflow = "hidden";

  function fermer() {
    if (ferme) return;
    ferme = true;
    enregistrerPosition(true);
    detruireFlux();
    document.removeEventListener("keydown", surTouche);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    document.body.style.overflow = overflowInitial;
    racine.remove();
    options.onFermer?.();
  }

  if (liste.length) {
    const fabrique = construirePanneau(liste, () => index, choisir, () => fermerPanneau(), infosListe);
    panneau = fabrique;
    racine.append(fabrique.panneau);
    if (!estDirect) fabrique.panneau.hidden = true;
    zapping.memoriserChaine(liste[index]);
  }

  document.addEventListener("keydown", surTouche);
  document.body.append(racine);
  majIdentite();
  annoncer();
  racine.focus();
  demarrer();

  return { fermer, demarrer, racine, choisir };
}

/**
 * Ouvre le lecteur pour une chaîne. `options.liste` est la liste de zapping
 * complète ; `options.index` sa position dans cette liste.
 */
export function regarderChaine(chaine, options = {}) {
  const liste = Array.isArray(options.liste) && options.liste.length ? options.liste : [{ id: chaine.id, nom: chaine.nom, url: chaine.url, categorie: chaine.categorie }];
  const index = liste.findIndex((c) => c.id === chaine.id);
  if (index < 0 && !chaine.url) {
    return null;
  }
  return ouvrir({
    titre: chaine.nom,
    url: chaine.url,
    type: "direct",
    famille: "chaines",
    id: chaine.id,
    attenteSecondes: options.attenteSecondes,
    liste,
    index: index < 0 ? 0 : index,
    tronquee: options.tronquee,
    totalListe: options.totalListe,
    sources: [{ nom: chaine.nom, url: chaine.url }],
    onFermer: options.onFermer
  });
}

/** Ouvre le lecteur pour un film ou un épisode. */
export function regarderVod({ titre, url, famille, id, reprise, attenteSecondes, onFermer }) {
  return ouvrir({
    titre,
    url,
    type: "vod",
    famille,
    id,
    reprise,
    attenteSecondes,
    sources: [{ nom: "source principale", url }],
    onFermer
  });
}

