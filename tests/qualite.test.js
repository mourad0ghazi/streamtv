import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const executer = promisify(execFile);
const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");

async function lancer(script, arguments_ = []) {
  try {
    const { stdout } = await executer(process.execPath, [join("scripts", script), ...arguments_], { cwd: RACINE });
    return { code: 0, sortie: stdout };
  } catch (erreur) {
    return { code: erreur.code ?? 1, sortie: `${erreur.stdout ?? ""}${erreur.stderr ?? ""}` };
  }
}

test("aucun fichier de code ne dépasse 900 lignes", async () => {
  const resultat = await lancer("controle-lignes.js");
  assert.equal(resultat.code, 0, resultat.sortie);
  assert.match(resultat.sortie, /aucun au-delà de 900 lignes/);
});

test("chaque module porte la version dans son adresse", async () => {
  const resultat = await lancer("versionner.js", ["--verifier"]);
  assert.equal(resultat.code, 0, resultat.sortie);
  assert.match(resultat.sortie, /conformes/);
});

test("le paquet ne déclare aucune dépendance d'exécution", async () => {
  const { readFile } = await import("node:fs/promises");
  const paquet = JSON.parse(await readFile(join(RACINE, "package.json"), "utf8"));
  assert.equal(paquet.type, "module");
  assert.equal(paquet.dependencies, undefined, "aucun paquet ne doit être installé pour faire tourner le site");
  assert.equal(paquet.peerDependencies, undefined);
  assert.equal(paquet.optionalDependencies, undefined);
});

/**
 * Un seul outil de mise en place est toléré, et il ne doit jamais être chargé
 * par le site : `freekeys` sert une fois, à écrire les clés d'API films dans
 * data/. À l'exécution, le serveur lit un fichier, pas un paquet.
 */
test("le seul paquet de développement est un outil de mise en place, jamais importé par le site", async () => {
  const { readFile, readdir } = await import("node:fs/promises");
  const paquet = JSON.parse(await readFile(join(RACINE, "package.json"), "utf8"));
  const outils = Object.keys(paquet.devDependencies ?? {});
  assert.deepEqual(outils, ["freekeys"], "un autre paquet de développement doit être justifié ici");

  for (const dossier of ["server", "public"]) {
    const fichiers = [];
    const parcourir = async (chemin) => {
      for (const entree of await readdir(chemin, { withFileTypes: true })) {
        const absolu = join(chemin, entree.name);
        if (entree.isDirectory()) await parcourir(absolu);
        else if (entree.name.endsWith(".js")) fichiers.push(absolu);
      }
    };
    await parcourir(join(RACINE, dossier));
    for (const fichier of fichiers) {
      const source = await readFile(fichier, "utf8");
      assert.equal(/from\s+["']freekeys["']|require\(["']freekeys["']\)/.test(source), false, `${fichier} importe freekeys à l'exécution`);
    }
  }
});

test("aucun fichier livré ne charge un script depuis un réseau tiers", async () => {
  const { readdir, readFile } = await import("node:fs/promises");
  const chercher = async (dossier) => {
    const resultat = [];
    for (const entree of await readdir(dossier, { withFileTypes: true })) {
      const absolu = join(dossier, entree.name);
      if (entree.isDirectory()) resultat.push(...(await chercher(absolu)));
      else if (/\.(js|html)$/.test(entree.name)) resultat.push(absolu);
    }
    return resultat;
  };
  for (const fichier of await chercher(join(RACINE, "public"))) {
    const contenu = await readFile(fichier, "utf8");
    assert.equal(/<script[^>]+src="https?:/.test(contenu), false, `script distant dans ${fichier}`);
  }
});
