/**
 * Console : cohérence de l'interface avec le serveur.
 *
 * Ces tests ne pilotent pas un navigateur ; ils vérifient ce qui casse
 * silencieusement : un panneau qui n'exporte plus sa fonction, un onglet visible
 * sans permission, une feuille oubliée dans la page, un verbe HTTP écrasé.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");

const PANNEAUX = {
  "tableau.js": "panneauTableau",
  "apparence.js": "panneauApparence",
  "lecture.js": "panneauLecture",
  "accueil-console.js": "panneauAccueil",
  "utilisateurs.js": "panneauUtilisateurs",
  "permissions.js": "panneauPermissions",
  "assistant.js": "panneauAssistant"
};

test("chaque panneau de la console exporte sa fonction", async () => {
  for (const [fichier, nom] of Object.entries(PANNEAUX)) {
    const module = await import(`../public/js/admin/${fichier}`);
    assert.equal(typeof module[nom], "function", `${fichier} doit exporter ${nom}`);
  }
});

test("les onglets visibles suivent les permissions de la session", async () => {
  const { ongletsVisibles } = await import("../public/js/admin/onglets.js");
  const lecteur = ongletsVisibles(["sources.lire", "reglages.lire", "audit.lire", "statistiques.lire"]);
  assert.deepEqual(lecteur.map((o) => o.cle), ["sources", "journal", "statistiques", "reglages"]);
  assert.equal(lecteur.some((o) => o.cle === "utilisateurs"), false);
  assert.equal(lecteur.some((o) => o.cle === "assistant"), false);

  const proprietaire = ongletsVisibles(["tableau.lire", "accueil.lire", "lecture.lire", "ia.utiliser"]);
  assert.deepEqual(proprietaire.map((o) => o.cle), ["tableau", "accueil", "lecture", "assistant"]);
});

test("la page de console charge sa feuille et son module avec la version", async () => {
  const page = await readFile(join(RACINE, "public", "console.html"), "utf8");
  assert.match(page, /\/css\/console\.css\?v=\d+\.\d+\.\d+/);
  assert.match(page, /\/js\/admin\/console\.js\?v=\d+\.\d+\.\d+/);
});

test("la console déclare le verbe DELETE au lieu de le réécrire en POST", async () => {
  const api = await readFile(join(RACINE, "public", "js", "api.js"), "utf8");
  assert.match(api, /export const supprimer = \(chemin, options\) => demander\(chemin, \{ \.\.\.options, methode: "DELETE" \}\)/);
  const utilisateurs = await readFile(join(RACINE, "public", "js", "admin", "utilisateurs.js"), "utf8");
  assert.match(utilisateurs, /supprimer\(`\/api\/admin\/utilisateurs\/\$\{compte\.id\}`\)/);
  assert.equal(/envoyer\([^)]*methode: "DELETE"/.test(utilisateurs), false);
});

test("le site n'impose rien en démonstration statique", async () => {
  const module = await import("../public/js/apparence-client.js");
  const ancien = globalThis.STREAMTV_STATIQUE;
  globalThis.STREAMTV_STATIQUE = true;
  try {
    assert.equal(module.appliquerApparence({ version: "3.23.0" }), null);
  } finally {
    globalThis.STREAMTV_STATIQUE = ancien;
  }
});
