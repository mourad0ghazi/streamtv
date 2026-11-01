#!/usr/bin/env node
/**
 * Construction de la démonstration statique publiée sur GitHub Pages.
 *
 * La version publiée est en lecture seule : pas de console, pas d'import, pas
 * de sondes. Elle lisde les mêmes fichiers de données que le site dynamique et
 * affiche un bandeau qui dit qu'elle est une démonstration.
 *
 * Usage :
 *   node scripts/construire-statique.mjs            construit _site/
 *   node scripts/construire-statique.mjs --servir   construit puis sert _site/ sur le port 3001
 */

import { readFile, writeFile, mkdir, cp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const SORTIE = join(RACINE, "_site");
const PUBLIC = join(RACINE, "public");
const DONNEES = join(RACINE, "data");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json"
};

async function lireJson(nom, replis) {
  try {
    return JSON.parse(await readFile(join(DONNEES, nom), "utf8"));
  } catch {
    return replis;
  }
}

async function construire() {
  await rm(SORTIE, { recursive: true, force: true });
  await mkdir(SORTIE, { recursive: true });

  await cp(PUBLIC, SORTIE, {
    recursive: true,
    filter: (source) => !source.includes(`${join(PUBLIC, "js", "admin")}`) && !source.endsWith("console.html")
  });

  const [chaines, anime, films, sources] = await Promise.all([
    lireJson("channels.json", { contenus: [] }),
    lireJson("anime.json", { contenus: [] }),
    lireJson("films.json", { contenus: [] }),
    lireJson("sources.json", { sources: [] })
  ]);

  await mkdir(join(SORTIE, "statique"), { recursive: true });
  await writeFile(
    join(SORTIE, "statique", "donnees.json"),
    JSON.stringify(
      {
        date: new Date().toISOString(),
        plafondCartes: 24,
        attenteLecteur: 10,
        chaines: chaines.contenus ?? [],
        anime: anime.contenus ?? [],
        films: films.contenus ?? [],
        sources: (sources.sources ?? []).filter((s) => s.actif !== false).map((s) => ({ id: s.id, nom: s.nom, licence: s.licence, contenu: s.contenu }))
      },
      null,
      0
    ) + "\n"
  );

  const index = await readFile(join(SORTIE, "index.html"), "utf8");
  const marque = '<script type="module" src="/js/app.js';
  const injecte = index.replace(marque, '<script>window.STREAMTV_STATIQUE = true;</script>\n    ' + marque);
  await writeFile(join(SORTIE, "index.html"), injecte);
  await writeFile(join(SORTIE, "404.html"), injecte);
  await writeFile(join(SORTIE, ".nojekyll"), "");

  const octets = (await readFile(join(SORTIE, "statique", "donnees.json"))).length;
  console.log(`Démonstration construite dans _site/ : ${chaines.contenus?.length ?? 0} chaînes, ${anime.contenus?.length ?? 0} animés, ${films.contenus?.length ?? 0} films.`);
  console.log(`Données statiques : ${(octets / 1024).toFixed(0)} ko.`);
}

/** Petit serveur de vérification, pour contrôler _site/ avant publication. */
function servir(port = 3001) {
  const serveur = createServer(async (requete, reponse) => {
    const chemin = decodeURIComponent(new URL(requete.url, "http://localhost").pathname);
    const candidats = [join(SORTIE, chemin), join(SORTIE, chemin, "index.html"), join(SORTIE, "index.html")];
    for (const candidat of candidats) {
      try {
        const corps = await readFile(candidat);
        reponse.writeHead(200, { "content-type": TYPES[extname(candidat)] ?? "application/octet-stream" });
        return reponse.end(corps);
      } catch {
        /* essayer le candidat suivant */
      }
    }
    reponse.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    reponse.end("Introuvable");
  });
  serveur.listen(port, "0.0.0.0", () => console.log(`Démonstration statique : http://127.0.0.1:${port}`));
  return serveur;
}

await construire();
if (process.argv.includes("--servir")) servir(Number(process.env.PORT || 3001));
