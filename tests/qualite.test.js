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
  assert.equal(paquet.dependencies, undefined);
  assert.equal(paquet.devDependencies, undefined);
  assert.equal(paquet.peerDependencies, undefined);
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
