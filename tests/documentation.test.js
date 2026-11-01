import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { ONGLETS } from "../public/js/admin/onglets.js";
import { DESCRIPTION } from "../server/reglages.js";
import { CODES } from "../server/audit.js";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const DOC = join(RACINE, "docs", "ADMINISTRATION.md");

const document_ = await readFile(DOC, "utf8");
const ancres = [...document_.matchAll(/\{#([a-z0-9-]+)\}/g)].map((m) => m[1]);

test("chaque onglet de la console est documenté", () => {
  for (const onglet of ONGLETS) {
    assert.ok(ancres.includes(onglet.doc), `onglet ${onglet.libelle} sans section {#${onglet.doc}}`);
  }
});

test("chaque section d'onglet documentée existe dans la console", () => {
  const documentes = ancres.filter((a) => a.startsWith("onglet-"));
  const attendus = ONGLETS.map((o) => o.doc);
  for (const ancre of documentes) {
    assert.ok(attendus.includes(ancre), `section {#${ancre}} sans onglet correspondant`);
  }
  assert.equal(documentes.length, attendus.length);
});

test("chaque réglage est documenté avec son ancre", () => {
  for (const description of DESCRIPTION) {
    assert.ok(ancres.includes(description.doc), `réglage ${description.cle} sans section {#${description.doc}}`);
    const position = document_.indexOf(`{#${description.doc}}`);
    const debut = document_.lastIndexOf("\n### ", position);
    const fin = document_.indexOf("\n### ", position);
    const section = document_.slice(debut, fin > 0 ? fin : undefined);
    assert.ok(section.includes(description.libelle), `le réglage ${description.cle} n'est pas nommé dans sa section`);
    assert.match(section, /Type\s*:/, `le réglage ${description.cle} n'annonce pas son type`);
  }
});

test("aucune section de réglage documentée n'est inventée", () => {
  const documentes = ancres.filter((a) => a.startsWith("reglage-"));
  const attendus = DESCRIPTION.map((d) => d.doc);
  assert.deepEqual([...documentes].sort(), [...attendus].sort());
});

test("chaque code d'audit figure dans le tableau de la documentation", () => {
  for (const code of Object.keys(CODES)) {
    assert.match(document_, new RegExp(`\\|\\s*${code}\\s*\\|`), `code ${code} absent de la documentation`);
  }
});

test("la documentation ne cite aucun code d'audit qui n'existe pas", () => {
  const cites = [...document_.matchAll(/\|\s*(A\d{2})\s*\|/g)].map((m) => m[1]);
  for (const code of cites) {
    assert.ok(Object.hasOwn(CODES, code), `code ${code} documenté mais absent du code`);
  }
});

test("la documentation couvre les sept matières attendues", () => {
  const titres = [...document_.matchAll(/^## (\d)\. /gm)].map((m) => m[1]);
  assert.deepEqual(titres, ["1", "2", "3", "4", "5", "6", "7"]);
});

test("la console porte un lien vers la documentation de chaque onglet", async () => {
  const console_ = await readFile(join(RACINE, "public", "js", "admin", "console.js"), "utf8");
  assert.match(console_, /docs\/ADMINISTRATION\.md#\$\{ancre\}/);
  assert.match(console_, /lienDocumentation\(onglet\.doc\)/);
});

test("toute ancre citée dans la console existe dans la documentation", () => {
  for (const onglet of ONGLETS) {
    assert.ok(document_.includes(`{#${onglet.doc}}`), `lien mort vers {#${onglet.doc}}`);
  }
});
