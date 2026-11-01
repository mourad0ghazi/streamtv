import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";

import { ecrireAtomique, charger, DOSSIER_DONNEES, sources, contenus } from "../server/magasin.js";

const brouillon = join(DOSSIER_DONNEES, "essai-atomique.json");

test("une écriture atomique laisse un fichier complet et aucun temporaire", async () => {
  await ecrireAtomique(brouillon, { version: 1, contenus: [{ id: "a" }] });
  const relu = JSON.parse(await readFile(brouillon, "utf8"));
  assert.deepEqual(relu.contenus, [{ id: "a" }]);
  const restes = (await readdir(DOSSIER_DONNEES)).filter((nom) => nom.startsWith("essai-atomique") && nom.endsWith(".tmp"));
  assert.deepEqual(restes, []);
});

test("une écriture interrompue laisse le catalogue précédent intact", async () => {
  await ecrireAtomique(brouillon, { version: 1, contenus: [{ id: "avant" }] });
  const circulaire = { version: 1 };
  circulaire.soi = circulaire;
  await assert.rejects(() => ecrireAtomique(brouillon, circulaire));
  const relu = JSON.parse(await readFile(brouillon, "utf8"));
  assert.deepEqual(relu.contenus, [{ id: "avant" }]);
  await rm(brouillon, { force: true });
});

test("un fichier temporaire abandonné n'est jamais lu comme catalogue", async () => {
  await writeFile(join(DOSSIER_DONNEES, "channels.json.999.tmp"), "{ pas du json", "utf8");
  const etat = await charger();
  assert.ok(Array.isArray(etat.chaines.contenus));
  assert.ok(etat.chaines.contenus.length > 0);
  await rm(join(DOSSIER_DONNEES, "channels.json.999.tmp"), { force: true });
});

test("le catalogue livré respecte l'enveloppe attendue", async () => {
  await charger();
  const bloc = await charger();
  assert.equal(bloc.chaines.version, 1);
  assert.ok(bloc.chaines.date);
  assert.ok(contenus("chaines").length > 0);
});

test("chaque source porte les dix champs du modèle et une licence", async () => {
  await charger();
  const champs = ["id", "nom", "type", "contenu", "url", "licence", "pays", "langue", "actif", "priorite"];
  for (const source of sources()) {
    for (const champ of champs) {
      assert.ok(champ in source, `champ ${champ} absent de ${source.id}`);
    }
    assert.ok(String(source.licence).length > 5, `licence vide sur ${source.id}`);
  }
});

test("chaque chaîne renvoie à une source déclarée", async () => {
  await charger();
  const ids = new Set(sources().map((s) => s.id));
  const orphelines = contenus("chaines").filter((c) => !ids.has(c.source));
  assert.equal(orphelines.length, 0, `${orphelines.length} chaînes sans source déclarée`);
});

test("chaque film et chaque animé porte une licence vérifiable", async () => {
  await charger();
  for (const film of contenus("films")) {
    assert.ok(String(film.licence ?? "").length > 3, `licence absente sur ${film.id}`);
  }
  for (const anime of contenus("anime")) {
    assert.ok(String(anime.licence ?? "").length > 3, `licence absente sur ${anime.id}`);
  }
});
