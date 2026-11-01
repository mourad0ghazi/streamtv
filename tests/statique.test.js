import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFile, access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
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
  const { version } = JSON.parse(await readFile(join(RACINE, "package.json"), "utf8"));
  assert.ok(html.includes(`app.js?v=${version}`), "le module publié ne porte pas la version du paquet");
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

test("chaque route a son dossier, pour un accès direct sans passer par la 404", async () => {
  for (const route of ["chaines", "anime", "films", "recherche", "favoris"]) {
    assert.equal(await existe(`${route}/index.html`), true, `${route}/index.html manque`);
  }
});

test("la démonstration se publie sous /streamtv/ pour GitHub Pages", async () => {
  const dossier = await mkdtemp(join(tmpdir(), "streamtv-base-"));
  try {
    await executer(process.execPath, [join("scripts", "construire-statique.mjs"), "--base", "/streamtv", "--sortie", dossier], { cwd: RACINE });

    const html = await readFile(join(dossier, "index.html"), "utf8");
    const { version } = JSON.parse(await readFile(join(RACINE, "package.json"), "utf8"));
    assert.ok(html.includes(`href="/streamtv/css/base.css?v=${version}"`));
    assert.ok(html.includes(`src="/streamtv/js/app.js?v=${version}"`));
    assert.match(html, /window\.STREAMTV_BASE = "\/streamtv"/);
    assert.equal(/href="\/(?!streamtv|#)/.test(html), false, "une adresse absolue est restée hors base");

    const manifeste = JSON.parse(await readFile(join(dossier, "manifeste.webmanifest"), "utf8"));
    assert.equal(manifeste.start_url, "/streamtv/");
    assert.equal(manifeste.scope, "/streamtv/");

    for (const fichier of ["404.html", "chaines/index.html", "js/zapping.js", "statique/donnees.json", ".nojekyll"]) {
      await access(join(dossier, fichier));
    }

    // Aucune adresse de la page ne doit mener à un 404 une fois publiée.
    const adresses = [...html.matchAll(/(?:href|src)="(\/[^"]*)"/g)].map((m) => m[1].split("?")[0].split("#")[0]);
    assert.ok(adresses.length >= 6, "la page publiée ne référence presque rien");
    for (const adresse of adresses) {
      assert.ok(adresse.startsWith("/streamtv/"), `${adresse} sort de la base`);
      const relatif = adresse.slice("/streamtv/".length) || "index.html";
      await access(join(dossier, relatif.endsWith("/") ? `${relatif}index.html` : relatif));
    }
  } finally {
    await rm(dossier, { recursive: true, force: true });
  }
});

test("le serveur d'aperçu renvoie la racine vers la base, sans boucle", async () => {
  const { servir } = await import("../scripts/construire-statique.mjs");
  const serveur = servir(0, join(RACINE, "docs"), "/streamtv");
  await new Promise((resoudre) => serveur.once("listening", resoudre));
  const port = serveur.address().port;
  const base = `http://127.0.0.1:${port}`;
  try {
    const racine = await fetch(`${base}/`, { redirect: "manual" });
    assert.equal(racine.status, 302);
    assert.equal(racine.headers.get("location"), "/streamtv/");

    const sansBarre = await fetch(`${base}/streamtv`, { redirect: "manual" });
    assert.equal(sansBarre.status, 302);

    const accueil = await fetch(`${base}/streamtv/`, { redirect: "manual" });
    assert.equal(accueil.status, 200, "la base avec sa barre ne doit pas rediriger");
    const html = await accueil.text();
    assert.match(html, /STREAMTV_BASE = "\/streamtv"/);

    const page = await fetch(`${base}/streamtv/chaines/`);
    assert.equal(page.status, 200);
  } finally {
    await new Promise((resoudre) => serveur.close(resoudre));
  }
});
