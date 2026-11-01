/**
 * Le dossier publié (`docs/`) est celui que GitHub Pages sert tel quel. S'il
 * prend du retard sur `public/`, le site en ligne montre une vieille version :
 * ces tests comparent les deux, et refusent une base oubliée.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const DOCS = join(RACINE, "docs");
const PUBLIC = join(RACINE, "public");

const version = JSON.parse(await readFile(join(RACINE, "package.json"), "utf8")).version;

async function fichiers(dossier) {
  const trouves = [];
  for (const entree of await readdir(dossier, { withFileTypes: true })) {
    const absolu = join(dossier, entree.name);
    if (entree.isDirectory()) trouves.push(...(await fichiers(absolu)));
    else trouves.push(relative(RACINE, absolu).split("\\").join("/"));
  }
  return trouves;
}

test("la page publiée porte la base du dépôt et la version du paquet", async () => {
  const html = await readFile(join(DOCS, "index.html"), "utf8");
  assert.match(html, /window\.STREAMTV_STATIQUE = true/);
  assert.match(html, /window\.STREAMTV_BASE = "\/streamtv"/);
  assert.ok(html.includes(`src="/streamtv/js/app.js?v=${version}"`), "le module publié ne porte pas la version du paquet");
  assert.ok(html.includes(`href="/streamtv/css/base.css?v=${version}"`));
});

test("chaque module et chaque feuille de public/ est publié à l'identique", async () => {
  const sources = (await fichiers(PUBLIC)).filter(
    (f) => (f.endsWith(".js") || f.endsWith(".css")) && !f.includes("/js/admin/")
  );
  assert.ok(sources.length > 20);
  for (const source of sources) {
    const copie = join(RACINE, source.replace("public/", "docs/"));
    assert.equal(await stat(copie).then(() => true, () => false), true, `${source} absent du dossier publié`);
    const [a, b] = await Promise.all([readFile(join(RACINE, source)), readFile(copie)]);
    assert.deepEqual(b, a, `${source} diffère de sa copie publiée : relancez npm run publier`);
  }
});

test("la démonstration publiée ne contient ni console ni module d'administration", async () => {
  const publies = await fichiers(DOCS);
  assert.equal(publies.some((f) => f.includes("js/admin/")), false);
  assert.equal(publies.some((f) => f.endsWith("console.html")), false);
});

test("le dossier publié garde la documentation d'administration", async () => {
  assert.equal(await stat(join(DOCS, "ADMINISTRATION.md")).then(() => true, () => false), true);
});
