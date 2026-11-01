/**
 * Remontée des incidents côté navigateur.
 *
 * Une erreur de script, une promesse rejetée, et le serveur reçoit une ligne :
 * message, page, début de pile. Rien de personnel, aucun identifiant, et trois
 * envois au plus par visite pour ne pas transformer une boucle en déluge.
 *
 * L'envoi est silencieux : si le serveur ne répond pas, le visiteur ne voit
 * rien et la page continue de fonctionner.
 */

import { envoyer } from "./api.js";

const PLAFOND_ENVOIS = 3;
let envois = 0;

function signaler(message, pile) {
  if (envois >= PLAFOND_ENVOIS) return;
  if (typeof message !== "string" || message.trim().length < 3) return;
  envois += 1;
  const corps = {
    message: message.trim().slice(0, 300),
    page: `${window.location.pathname}${window.location.search}`.slice(0, 160),
    pile: typeof pile === "string" ? pile.slice(0, 600) : "",
    agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 160) : ""
  };
  envoyer("/api/incidents", corps).catch(() => {});
}

export function installerIncidents() {
  if (typeof window === "undefined" || window.STREAMTV_STATIQUE === true) return;
  if (window.__streamtvIncidents) return;
  window.__streamtvIncidents = true;

  window.addEventListener("error", (evenement) => {
    const message = evenement?.message || evenement?.error?.message;
    signaler(message, evenement?.error?.stack);
  });
  window.addEventListener("unhandledrejection", (evenement) => {
    const raison = evenement?.reason;
    signaler(raison?.message ?? String(raison ?? "Promesse rejetée sans message"), raison?.stack);
  });
}
