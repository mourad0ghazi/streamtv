import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const CSS = ["jetons.css", "base.css", "vues.css"];

async function fichiersCss() {
  const contenu = {};
  for (const nom of CSS) contenu[nom] = await readFile(join(RACINE, "public", "css", nom), "utf8");
  return contenu;
}

/** Valeur d'un jeton de la feuille jetons.css, en pixels. */
function jeton(css, nom) {
  const extraction = new RegExp(`--${nom}:\\s*(\\d+)px`).exec(css);
  assert.ok(extraction, `jeton --${nom} introuvable`);
  return Number(extraction[1]);
}

/** Contenu de la requête média téléphone, accolades équilibrées. */
function blocTelephone(css) {
  const debut = css.indexOf("@media (max-width: 640px)");
  assert.ok(debut >= 0, "requête média téléphone absente de vues.css");
  const ouvrante = css.indexOf("{", debut);
  let profondeur = 0;
  for (let i = ouvrante; i < css.length; i += 1) {
    if (css[i] === "{") profondeur += 1;
    if (css[i] === "}") {
      profondeur -= 1;
      if (profondeur === 0) return css.slice(ouvrante + 1, i);
    }
  }
  throw new Error("bloc téléphone non fermé");
}

test("la grille des affiches passe à trois colonnes sur téléphone", async () => {
  const css = await fichiersCss();
  const bloc = blocTelephone(css["vues.css"]);
  const regle = /\.grille\s*\{([\s\S]*?)\}/.exec(bloc);
  assert.ok(regle, "règle .grille absente du bloc téléphone");
  assert.match(regle[1], /grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
});

test("trois affiches tiennent dans 375 pixels de large", async () => {
  const css = await fichiersCss();
  const margePage = jeton(css["jetons.css"], "e4");
  const gouttiere = jeton(css["jetons.css"], "e3");
  const largeurEcran = 375;
  const utile = largeurEcran - 2 * margePage;
  const largeurAffiche = (utile - 2 * gouttiere) / 3;

  assert.ok(largeurAffiche >= 96, `affiche trop étroite : ${largeurAffiche.toFixed(1)} px`);
  assert.ok(largeurAffiche <= 130, `affiche trop large pour trois colonnes : ${largeurAffiche.toFixed(1)} px`);
  assert.equal(Number(largeurAffiche.toFixed(2)), 106.33);
});

test("la marge de page téléphone reste un multiple de 4 pixels", async () => {
  const css = await fichiersCss();
  assert.equal(jeton(css["jetons.css"], "e4") % 4, 0);
  assert.equal(jeton(css["jetons.css"], "e3") % 4, 0);
});

test("la grille de bureau reste fluide au-dessus de 640 pixels", async () => {
  const css = await fichiersCss();
  const regle = /^\.grille\s*\{([\s\S]*?)\}/m.exec(css["vues.css"]);
  assert.ok(regle);
  assert.match(regle[1], /repeat\(auto-fill,\s*minmax\(190px,\s*1fr\)\)/);
});

test("les cartes prennent le format de leur affiche", async () => {
  const css = await fichiersCss();
  assert.match(css["vues.css"], /\.carte__media\s*\{[^}]*aspect-ratio:\s*2\s*\/\s*3/);
});

test("les cartes de chaînes gardent un format large", async () => {
  const css = await fichiersCss();
  assert.match(css["vues.css"], /\.carte--chaine \.carte__media\s*\{[^}]*aspect-ratio:\s*16\s*\/\s*9/);
});
