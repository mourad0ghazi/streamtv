/**
 * Apparence côté visiteur : une feuille de variables produite par le serveur.
 *
 * La page ne reçoit jamais de CSS libre : le serveur n'envoie que des jetons
 * validés, sous forme de feuille de style servie à sa propre adresse. Le
 * navigateur la charge comme n'importe quel autre style, ce qui respecte la
 * politique de sécurité et évite tout style en ligne.
 *
 * En démonstration statique, il n'y a pas de serveur : le site garde les jetons
 * livrés avec lui, et rien ne casse.
 */

const LIEN_ID = "apparence-jetons";

export function appliquerApparence({ version = "" } = {}) {
  if (typeof document === "undefined") return null;
  if (globalThis.STREAMTV_STATIQUE) return null;
  const existant = document.getElementById(LIEN_ID);
  if (existant) return existant;
  const lien = document.createElement("link");
  lien.id = LIEN_ID;
  lien.rel = "stylesheet";
  lien.href = version ? `/apparence.css?v=${encodeURIComponent(version)}` : "/apparence.css";
  document.head.append(lien);
  return lien;
}
