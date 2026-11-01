import { test } from "node:test";
import assert from "node:assert/strict";

import * as auth from "../server/auth.js";

test("le mot de passe par défaut est signalé tant qu'il n'est pas changé", async () => {
  await auth.initialiser();
  assert.equal(auth.motDePasseParDefaut(), true);
});

test("un mot de passe faux est refusé", async () => {
  const resultat = await auth.connexion({ motDePasse: "faux", dureeMinutes: 30 });
  assert.equal(resultat.ok, false);
  assert.equal(resultat.raison, "mot-de-passe");
});

test("un nouvel appareil sans code de vérification est refusé", async () => {
  const resultat = await auth.connexion({ motDePasse: auth.MOT_DE_PASSE_PAR_DEFAUT, code: "000000", dureeMinutes: 30 });
  assert.equal(resultat.ok, false);
  assert.equal(resultat.raison, "code");
});

test("le bon mot de passe et le bon code ouvrent une session", async () => {
  const resultat = await auth.connexion({
    motDePasse: auth.MOT_DE_PASSE_PAR_DEFAUT,
    code: auth.codeVerification(),
    dureeMinutes: 30
  });
  assert.equal(resultat.ok, true);
  assert.ok(auth.verifierSession(resultat.jeton));
});

test("un appareil reconnu n'a plus besoin du code", async () => {
  const premier = await auth.connexion({
    motDePasse: auth.MOT_DE_PASSE_PAR_DEFAUT,
    code: auth.codeVerification(),
    dureeMinutes: 30
  });
  const second = await auth.connexion({
    motDePasse: auth.MOT_DE_PASSE_PAR_DEFAUT,
    jetonAppareil: premier.jetonAppareil,
    dureeMinutes: 30
  });
  assert.equal(second.ok, true);
  assert.equal(second.nouvelAppareil, false);
});

test("une session fermée ne vaut plus rien", async () => {
  const resultat = await auth.connexion({
    motDePasse: auth.MOT_DE_PASSE_PAR_DEFAUT,
    code: auth.codeVerification(),
    dureeMinutes: 30
  });
  auth.deconnexion(resultat.jeton);
  assert.equal(auth.verifierSession(resultat.jeton), null);
});

test("le code de vérification fait six chiffres", () => {
  assert.match(auth.codeVerification(), /^\d{6}$/);
});

test("un rôle sans permission listée ne peut rien faire", () => {
  assert.equal(auth.autoriser("inconnu", "sources.lire"), false);
  assert.deepEqual(auth.permissions("inconnu"), []);
});

test("le rôle lecteur n'écrit pas les réglages", () => {
  assert.equal(auth.autoriser("lecteur", "reglages.ecrire"), false);
  assert.equal(auth.autoriser("lecteur", "reglages.lire"), true);
});

test("l'administrateur dispose des permissions d'écriture", () => {
  assert.equal(auth.autoriser("administrateur", "sources.ecrire"), true);
  assert.equal(auth.autoriser("administrateur", "import.lancer"), true);
});

test("le mot de passe par défaut est refusé comme nouveau mot de passe", async () => {
  const resultat = await auth.changerMotDePasse(auth.MOT_DE_PASSE_PAR_DEFAUT, auth.MOT_DE_PASSE_PAR_DEFAUT);
  assert.equal(resultat.ok, false);
});

test("un nouveau mot de passe trop court est refusé", async () => {
  const resultat = await auth.changerMotDePasse(auth.MOT_DE_PASSE_PAR_DEFAUT, "court");
  assert.equal(resultat.ok, false);
  assert.match(resultat.message, /8 caractères/);
});
