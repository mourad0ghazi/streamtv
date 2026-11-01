#!/usr/bin/env node
/**
 * Port d'administration de StreamTV.
 *
 * Le site et la console partagent le même code, le même secret et les mêmes
 * données ; ce qui change ici, c'est la surface : uniquement la console, ses
 * ressources et l'API. Aucune page du catalogue n'est servie, et la racine
 * renvoie vers l'adresse privée de la console, puisqu'un port dédié n'est pas
 * une adresse publique.
 *
 * Usage :
 *   node server/administration.js                 port 3002
 *   PORT_ADMIN=4000 node server/administration.js
 *   STREAMTV_HOTE=127.0.0.1 node server/administration.js   (interdit hors machine)
 */

import { fileURLToPath } from "node:url";

import { demarrer } from "./serveur.js";

const port = Number(process.env.PORT_ADMIN) || 3002;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const serveur = await demarrer({ surface: "administration", port });
  const arreter = () => {
    serveur.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on("SIGTERM", arreter);
  process.on("SIGINT", arreter);
}

export const demarrerAdministration = (options = {}) =>
  demarrer({ surface: "administration", port, ...options });
