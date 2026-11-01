/**
 * Lecteur unique, adapté au type de source : direct (HLS) ou vidéo à la demande.
 *
 * Un plafond d'attente, puis un message français qui propose une issue :
 * réessayer, choisir une autre source, revenir en arrière. Mode TV pour le
 * direct : plein écran, zapping au clavier, indications brèves qui s'effacent.
 */

import { h, vider, icone, notifier } from "./dom.js";
import * as progression from "./progression.js";

let hlsCharge = null;

function chargerHls() {
  if (window.Hls) return Promise.resolve(window.Hls);
  if (hlsCharge) return hlsCharge;
  hlsCharge = new Promise((resoudre, rejeter) => {
    const script = document.createElement("script");
    script.src = "/vendor/hls.js?v=3.18.0";
    script.onload = () => (window.Hls ? resoudre(window.Hls) : rejeter(new Error("hls.js absent")));
    script.onerror = () => rejeter(new Error("hls.js illisible"));
    document.head.append(script);
  });
  return hlsCharge;
}

/**
 * Ouvre le lecteur. `options` :
 * - titre, url, type ("direct" | "vod"), famille, id
 * - attenteSecondes : plafond d'attente
 * - reprise : position à reprendre, pour la vidéo à la demande
 * - sources : autres sources proposées en cas d'échec
 * - zapping : liste ordonnée pour le mode TV (direct seulement)
 */
export function ouvrir(options) {
  const attente = Math.max(5, Number(options.attenteSecondes) || 10) * 1000;
  let indexZapping = Number.isInteger(options.indexZapping) ? options.indexZapping : -1;
  const zapping = Array.isArray(options.zapping) ? options.zapping : [];

  const video = h("video", { playsinline: true, controls: true, preload: "metadata" });
  const message = h("div", { class: "lecteur__message" });
  const indications = h("div", { class: "lecteur__indications", "aria-live": "polite" });
  const titre = h("div", { class: "lecteur__titre" }, options.titre ?? "");
  const boutonFermer = h(
    "button",
    { class: "bouton bouton--discret", type: "button", onclick: fermer, "aria-label": "Fermer le lecteur" },
    icone("fermer"),
    "Fermer"
  );
  const scene = h("div", { class: "lecteur__scene" }, video, indications, message);
  const racine = h(
    "div",
    { class: "lecteur", role: "dialog", "aria-modal": "true", "aria-label": `Lecteur : ${options.titre ?? ""}` },
    h("div", { class: "lecteur__barre" }, titre, boutonFermer),
    scene
  );

  let hls = null;
  let minuteur = null;
  let derniereSauvegarde = 0;
  let ferme = false;
  let modeTv = false;

  function afficherMessage(titreMessage, texte, actions) {
    vider(message).append(
      h("h3", {}, titreMessage),
      h("p", {}, texte),
      h("div", { class: "lecteur__actions" }, actions)
    );
    message.hidden = false;
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
    const actions = [
      h("button", { class: "bouton bouton--principal", type: "button", onclick: () => demarrer() }, "Réessayer"),
      h("button", { class: "bouton", type: "button", onclick: fermer }, "Revenir au catalogue")
    ];
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
              options.titre = `${options.titre} (${autre.nom ?? "autre source"})`;
              titre.textContent = options.titre;
              demarrer();
            }
          },
          "Choisir une autre source"
        )
      );
    }
    afficherMessage("La lecture n'a pas démarré", raison, actions);
  }

  function armerPlafond() {
    clearTimeout(minuteur);
    minuteur = setTimeout(() => {
      if (video.readyState >= 2) return;
      echec(
        `Aucune image après ${Math.round(attente / 1000)} secondes. La source ne répond pas : essayez une autre source ou revenez au catalogue.`
      );
    }, attente);
  }

  async function demarrer() {
    masquerMessage();
    detruireFlux();
    armerPlafond();
    const estDirect = options.type === "direct";

    if (estDirect) {
      const native = video.canPlayType("application/vnd.apple.mpegurl");
      if (native) {
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
            if (donnees.fatal) echec("Le flux s'est interrompu. La chaîne est peut-être hors ligne : essayez une autre chaîne ou réessayez plus tard.");
          });
          video.play().catch(() => {});
          return;
        }
      } catch {
        echec("Le module de lecture du direct n'a pas pu être chargé. Rechargez la page, puis réessayez.");
        return;
      }
    }

    video.src = options.url;
    if (Number.isFinite(options.reprise) && options.reprise > 10) {
      video.addEventListener(
        "loadedmetadata",
        () => {
          video.currentTime = options.reprise;
        },
        { once: true }
      );
    }
    video.play().catch(() => {});
  }

  function enregistrerPosition(force = false) {
    if (options.type !== "vod" || !options.famille || !options.id) return;
    const maintenant = Date.now();
    if (!force && maintenant - derniereSauvegarde < 5000) return;
    derniereSauvegarde = maintenant;
    progression.enregistrer(options.famille, options.id, video.currentTime, video.duration);
  }

  function indiquer(texte) {
    indications.textContent = texte;
    indications.classList.add("visible");
    clearTimeout(indiquer.minuteur);
    indiquer.minuteur = setTimeout(() => indications.classList.remove("visible"), 1800);
  }

  function zapper(pas) {
    if (!zapping.length) return;
    indexZapping = (indexZapping + pas + zapping.length) % zapping.length;
    const suivant = zapping[indexZapping];
    options.url = suivant.url;
    options.type = suivant.type ?? "direct";
    options.titre = suivant.titre;
    options.id = suivant.id ?? options.id;
    titre.textContent = suivant.titre;
    indiquer(suivant.titre);
    demarrer();
  }

  function basculerTv() {
    modeTv = !modeTv;
    if (modeTv && racine.requestFullscreen) racine.requestFullscreen().catch(() => {});
    if (!modeTv && document.fullscreenElement) document.exitFullscreen().catch(() => {});
    indiquer(modeTv ? "Mode TV. Flèches haut et bas pour changer de chaîne." : "Mode TV quitté.");
  }

  function surTouche(evenement) {
    if (evenement.key === "Escape") {
      fermer();
      return;
    }
    if (options.type !== "direct") return;
    if (evenement.key === "ArrowUp") {
      evenement.preventDefault();
      zapper(-1);
    } else if (evenement.key === "ArrowDown") {
      evenement.preventDefault();
      zapper(1);
    } else if (evenement.key.toLowerCase() === "f") {
      basculerTv();
    }
  }

  video.addEventListener("playing", () => {
    clearTimeout(minuteur);
    masquerMessage();
    if (!modeTv && options.type === "direct" && zapping.length) {
      indiquer("Flèches haut et bas pour changer de chaîne, F pour le mode TV.");
    }
  });
  video.addEventListener("error", () => {
    echec("Le fichier vidéo n'a pas pu être lu. Vérifiez la source, puis réessayez.");
  });
  video.addEventListener("timeupdate", () => enregistrerPosition(false));
  video.addEventListener("pause", () => enregistrerPosition(true));
  video.addEventListener("ended", () => {
    enregistrerPosition(true);
    if (options.type === "vod") progression.effacer(options.famille, options.id);
  });

  function fermer() {
    if (ferme) return;
    ferme = true;
    enregistrerPosition(true);
    detruireFlux();
    document.removeEventListener("keydown", surTouche);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    racine.remove();
    options.onFermer?.();
  }

  document.addEventListener("keydown", surTouche);
  document.body.append(racine);
  document.body.style.overflow = "hidden";
  racine.addEventListener("remove", () => {
    document.body.style.overflow = "";
  });

  demarrer();
  return { fermer, demarrer, racine };
}

/** Ouvre le lecteur pour une chaîne, avec le zapping de la liste fournie. */
export function regarderChaine(chaine, liste, attenteSecondes) {
  const ordonnees = liste.map((c) => ({ id: c.id, titre: c.nom, url: c.url, type: "direct" }));
  const index = ordonnees.findIndex((c) => c.id === chaine.id);
  if (chaine.url && index === -1) {
    notifier("Cette chaîne n'a pas d'adresse de flux exploitable.");
    return null;
  }
  return ouvrir({
    titre: chaine.nom,
    url: ordonnees[index]?.url ?? chaine.url,
    type: "direct",
    famille: "chaines",
    id: chaine.id,
    attenteSecondes,
    zapping: ordonnees,
    indexZapping: index,
    sources: [{ nom: chaine.nom, url: chaine.url }]
  });
}

/** Ouvre le lecteur pour un film ou un épisode. */
export function regarderVod({ titre, url, famille, id, reprise, attenteSecondes }) {
  return ouvrir({
    titre,
    url,
    type: "vod",
    famille,
    id,
    reprise,
    attenteSecondes,
    sources: [{ nom: "source principale", url }]
  });
}

