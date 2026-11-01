#!/usr/bin/env node
/**
 * Contrôle de l'adresse publiée sur GitHub Pages.
 *
 * Une fois Pages activé, ce script vérifie que le site répond, que les feuilles
 * et les modules sont bien sous la base, et que la page d'accueil est bien la
 * coquille en lecture seule. Il ne modifie rien.
 *
 * Usage :
 *   node scripts/verifier-publication.mjs
 *   node scripts/verifier-publication.mjs --base https://mourad0ghazi.github.io/streamtv
 */

import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const DELAI = 12000;

const base = (() => {
  const argus = process.argv.slice(2);
  const i = argus.findIndex((a) => a === "--base" || a.startsWith("--base="));
  if (i < 0) return "https://mourad0ghazi.github.io/streamtv";
  const valeur = argus[i].includes("=") ? argus[i].split("=").slice(1).join("=") : argus[i + 1];
  return (valeur ?? "").replace(/\/+$/, "");
})();

const version = JSON.parse(await readFile(join(RACINE, "package.json"), "utf8")).version;

async function demander(chemin) {
  const controleur = new AbortController();
  const minuteur = setTimeout(() => controleur.abort(), DELAI);
  try {
    const reponse = await fetch(`${base}${chemin}`, { signal: controleur.signal, redirect: "follow" });
    return { statut: reponse.status, type: reponse.headers.get("content-type") ?? "", corps: await reponse.text() };
  } catch (erreur) {
    return { statut: 0, type: "", corps: "", erreur: erreur.name === "AbortError" ? "délai dépassé" : erreur.message };
  } finally {
    clearTimeout(minuteur);
  }
}

const resultats = [];
function noter(nom, reussi, detail = "") {
  resultats.push({ nom, reussi, detail });
}

const accueil = await demander("/");
noter("la page d'accueil répond", accueil.statut === 200, accueil.statut ? `HTTP ${accueil.statut}` : accueil.erreur ?? "");
noter("la page d'accueil est du HTML", accueil.type.includes("text/html"), accueil.type);
noter("la page d'accueil est la démonstration", accueil.corps.includes("STREAMTV_STATIQUE"), "drapeau absent");
noter("la base de publication est inscrite", accueil.corps.includes(`STREAMTV_BASE = "${new URL(base).pathname.replace(/\/$/, "")}"`));

for (const [nom, chemin, marque] of [
  ["les styles publiés", `/css/base.css?v=${version}`, "--accent"],
  ["le module principal", `/js/app.js?v=${version}`, "function rendrePage"],
  ["le module de zapping", `/js/zapping.js?v=${version}`, "zapping"],
  ["le catalogue statique", "/statique/donnees.json", "chaines"],
  ["le manifeste", "/manifeste.webmanifest", "start_url"],
  ["le service worker", "/sw.js", "PRECACHE"]
]) {
  const { statut, corps, erreur } = await demander(chemin);
  noter(nom, statut === 200 && corps.includes(marque), statut ? `HTTP ${statut}` : erreur ?? "");
}

const page = await demander("/chaines/");
noter("une route directe répond 200", page.statut === 200, `HTTP ${page.statut}`);

const donnees = (await demander("/statique/donnees.json")).corps;
try {
  const bloc = JSON.parse(donnees);
  noter("le catalogue publié contient des chaînes", (bloc.chaines ?? []).length > 1000, `${(bloc.chaines ?? []).length} chaînes`);
  noter("les films publiés portent une licence", (bloc.films ?? []).every((f) => (f.licence ?? "").length > 3));
} catch {
  noter("le catalogue publié est lisible", false, "JSON invalide");
}

let echecs = 0;
for (const { nom, reussi, detail } of resultats) {
  if (!reussi) echecs += 1;
  console.log(`${reussi ? "  ok  " : "  échec"} ${nom}${detail && !reussi ? ` (${detail})` : ""}`);
}
const reussites = resultats.length - echecs;
console.log(`\n${reussites} vérification(s) réussie(s), ${echecs} échec(s) sur ${base}.`);
if (echecs) {
  console.log("Si tout échoue, Pages n'est probablement pas encore activé : Settings → Pages → Deploy from a branch, dossier /docs.");
  process.exitCode = 1;
}
