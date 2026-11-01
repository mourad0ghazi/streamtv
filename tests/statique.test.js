import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const executer = promisify(execFile);
const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = join(RACINE, "_site");

const existe = async (chemin) => {
  try {
    await access(join(SITE, chemin));
    return true;
  } catch {
    return false;
  }
};

before(async () => {
  await executer(process.execPath, [join("scripts", "construire-statique.mjs")], { cwd: RACINE });
});

test("la construction statique produit une page d'accueil", async () => {
  assert.equal(await existe("index.html"), true);
  const html = await readFile(join(SITE, "index.html"), "utf8");
  assert.match(html, /STREAMTV_STATIQUE/);
  assert.match(html, /app\.js\?v=3\.18\.0/);
});

test("la démonstration publiée inclut les animés et les films", async () => {
  const donnees = JSON.parse(await readFile(join(SITE, "statique", "donnees.json"), "utf8"));
  assert.ok(donnees.chaines.length > 1000);
  assert.ok(donnees.anime.length >= 3);
  assert.ok(donnees.films.length >= 3);
  for (const film of donnees.films) assert.ok(film.licence.length > 3);
});

test("la démonstration ne publie pas la console", async () => {
  assert.equal(await existe("console.html"), false);
  assert.equal(await existe("js/admin/console.js"), false);
});

test("la démonstration embarque les feuilles et les vues", async () => {
  for (const fichier of ["css/base.css", "js/app.js", "js/vues/films.js", "sw.js", "manifeste.webmanifest"]) {
    assert.equal(await existe(fichier), true, `${fichier} absent de la démonstration`);
  }
});

test("la démonstration annonce son état de lecture seule", async () => {
  const api = await readFile(join(SITE, "js", "api.js"), "utf8");
  assert.match(api, /STREAMTV_STATIQUE/);
  assert.match(api, /lecture seule/i);
});

test("la démonstration porte un fichier .nojekyll pour GitHub Pages", async () => {
  assert.equal(await existe(".nojekyll"), true);
});
