/**
 * Relais de flux : signer, reconnaître, refuser, réécrire, transmettre.
 *
 * Ce que ces tests protègent : le relais ne devient pas un proxy ouvert, il ne
 * touche pas au réseau local, il ne charge pas une vidéo en mémoire, et une
 * playlist HLS ressort avec tous ses segments ramenés vers le site.
 */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { Writable } from "node:stream";

import * as proxy from "../server/proxy-flux.js";
import * as lecture from "../server/lecture.js";
import { charger } from "../server/magasin.js";

before(async () => {
  await charger();
  lecture.reinitialiser();
  await lecture.charger();
});

/* ------------------------------------------------------------------ */
/* Adresses                                                           */
/* ------------------------------------------------------------------ */

test("les adresses privées et réservées sont reconnues", () => {
  for (const ip of ["127.0.0.1", "10.1.2.3", "172.20.0.1", "192.168.1.10", "169.254.169.254", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"]) {
    assert.equal(proxy.adresseInterne(ip), true, `${ip} devrait être refusée`);
  }
  for (const ip of ["8.8.8.8", "1.1.1.1", "203.0.113.10", "2001:4860:4860::8888"]) {
    assert.equal(proxy.adresseInterne(ip), false, `${ip} devrait être acceptée`);
  }
});

test("le contrôle de cible refuse tout ce qui n'est pas un flux public", () => {
  assert.match(proxy.cibleAcceptable("file:///etc/passwd"), /http et https/);
  assert.match(proxy.cibleAcceptable("javascript:alert(1)"), /http et https/);
  assert.match(proxy.cibleAcceptable("http://localhost:8080/live.m3u8"), /réseau local/);
  assert.match(proxy.cibleAcceptable("http://127.0.0.1/live.m3u8"), /réseau local/);
  assert.match(proxy.cibleAcceptable("https://user:pass@exemple.test/live.m3u8"), /identifiant/);
  assert.match(proxy.cibleAcceptable("http://192.168.0.10/live.m3u8"), /réseau local/);
  assert.equal(proxy.cibleAcceptable("https://exemple.test/live.m3u8"), null);
  assert.equal(proxy.cibleAcceptable("http://exemple.test:8080/live.m3u8"), null);
});

/* ------------------------------------------------------------------ */
/* Jetons                                                             */
/* ------------------------------------------------------------------ */

test("un jeton signé se vérifie et rend son adresse", async () => {
  const url = "https://exemple.test/live/segment1.ts";
  const jeton = await proxy.signer(url, 2);
  const lu = await proxy.verifier(jeton);
  assert.equal(lu.url, url);
  assert.equal(lu.profondeur, 2);
});

test("un jeton modifié est refusé", async () => {
  const jeton = await proxy.signer("https://exemple.test/a.ts", 0);
  const [charge, profondeur, signature] = jeton.split(".");
  const falsifie = `${Buffer.from("https://ailleurs.test/b.ts").toString("base64url")}.${profondeur}.${signature}`;
  assert.equal(await proxy.verifier(falsifie), null);
  assert.equal(await proxy.verifier(`${charge}.1.${signature}`), null, "la profondeur entre dans la signature");
});

test("un jeton trop profond ou illisible est refusé", async () => {
  assert.equal(await proxy.verifier((await proxy.signer("https://exemple.test/a.ts", 9))), null);
  assert.equal(await proxy.verifier("n-importe-quoi"), null);
  assert.equal(await proxy.verifier(""), null);
  assert.equal(await proxy.verifier(null), null);
});

/* ------------------------------------------------------------------ */
/* Réécriture HLS                                                     */
/* ------------------------------------------------------------------ */

const signerFictif = (url) => `/flux?t=${encodeURIComponent(url)}`;

test("une playlist de segments est entièrement ramenée vers le relais", () => {
  const playlist = [
    "#EXTM3U",
    "#EXT-X-VERSION:3",
    "#EXT-X-TARGETDURATION:6",
    "#EXTINF:6.0,",
    "segment1.ts",
    "#EXTINF:6.0,",
    "https://cdn.exemple.test/live/segment2.ts"
  ].join("\n");
  const sortie = proxy.reecrirePlaylist(playlist, "https://exemple.test/live/index.m3u8", signerFictif);
  assert.match(sortie, /#EXTM3U/);
  assert.match(sortie, /#EXTINF:6\.0,/);
  assert.match(sortie, /\/flux\?t=https%3A%2F%2Fexemple\.test%2Flive%2Fsegment1\.ts/);
  assert.match(sortie, /\/flux\?t=https%3A%2F%2Fcdn\.exemple\.test%2Flive%2Fsegment2\.ts/);
  assert.equal(/(^|\n)segment1\.ts(\n|$)/.test(sortie), false, "le segment relatif ne doit pas rester nu");
});

test("une playlist maîtresse voit ses variantes et leurs sous-playlists relayées", () => {
  const maitresse = [
    "#EXTM3U",
    '#EXT-X-STREAM-INF:BANDWIDTH=1200000,RESOLUTION=1280x720',
    "720p/index.m3u8",
    '#EXT-X-STREAM-INF:BANDWIDTH=400000,RESOLUTION=640x360',
    "/live/360p/index.m3u8"
  ].join("\n");
  const sortie = proxy.reecrirePlaylist(maitresse, "https://exemple.test/live/master.m3u8", signerFictif);
  assert.match(sortie, /\/flux\?t=https%3A%2F%2Fexemple\.test%2Flive%2F720p%2Findex\.m3u8/);
  assert.match(sortie, /\/flux\?t=https%3A%2F%2Fexemple\.test%2Flive%2F360p%2Findex\.m3u8/);
});

test("les clés de chiffrement et les init maps passent aussi par le relais", () => {
  const playlist = [
    "#EXTM3U",
    '#EXT-X-KEY:METHOD=AES-128,URI="https://cles.exemple.test/k1"',
    '#EXT-X-MAP:URI="init.mp4"',
    "#EXTINF:4.0,",
    "s1.m4s"
  ].join("\n");
  const sortie = proxy.reecrirePlaylist(playlist, "https://exemple.test/live/index.m3u8", signerFictif);
  assert.match(sortie, /URI="\/flux\?t=https%3A%2F%2Fcles\.exemple\.test%2Fk1"/);
  assert.match(sortie, /URI="\/flux\?t=https%3A%2F%2Fexemple\.test%2Flive%2Finit\.mp4"/);
  assert.match(sortie, /#EXT-X-KEY:METHOD=AES-128/);
});

test("les autres balises et les lignes vides sont conservées", () => {
  const playlist = "#EXTM3U\n\n#EXT-X-ENDLIST\n";
  const sortie = proxy.reecrirePlaylist(playlist, "https://exemple.test/a.m3u8", signerFictif);
  assert.equal(sortie, "#EXTM3U\n\n#EXT-X-ENDLIST\n");
});

test("une adresse non résoluble n'est jamais réécrite en douce", () => {
  assert.equal(proxy.resoudre("javascript:alert(1)", "https://exemple.test/"), null);
  assert.equal(proxy.resoudre("//cdn.exemple.test/x.ts", "https://exemple.test/"), "https://cdn.exemple.test/x.ts");
});

/* ------------------------------------------------------------------ */
/* Catalogue                                                          */
/* ------------------------------------------------------------------ */

test("le relais reconnaît les adresses du catalogue et rien d'autre", async () => {
  const { contenus } = await import("../server/magasin.js");
  const premiere = contenus("chaines")[0];
  assert.equal(proxy.duCatalogue(premiere.url), true);
  assert.equal(proxy.duCatalogue("https://exemple.test/pas-dans-le-catalogue.m3u8"), false);
});

/* ------------------------------------------------------------------ */
/* Transmission                                                       */
/* ------------------------------------------------------------------ */

/** Réponse minimale pour les cas où le relais répond en un bloc. */
function reponseFactice() {
  return {
    code: null,
    entetes: null,
    corps: "",
    writeHead(code, entetes) {
      this.code = code;
      this.entetes = entetes;
    },
    end(corps) {
      this.corps = corps ?? "";
    },
    on() {}
  };
}

/** Réponse flux, pour les cas où le relais transmet un corps binaire. */
function reponseFlux() {
  const morceaux = [];
  const flux = new Writable({
    write(morceau, _encodage, suite) {
      morceaux.push(morceau);
      suite();
    }
  });
  flux.code = null;
  flux.entetes = null;
  flux.writeHead = function (code, entetes) {
    flux.code = code;
    flux.entetes = entetes;
    return flux;
  };
  flux.corps = () => Buffer.concat(morceaux).toString("utf8");
  flux.fin = () =>
    flux.writableFinished ? Promise.resolve() : new Promise((resoudre) => flux.once("finish", resoudre));
  return flux;
}

let origine;
let baseOrigine;

before(async () => {
  origine = createServer((requete, reponse) => {
    if (requete.url === "/live/index.m3u8") {
      reponse.writeHead(200, { "content-type": "application/vnd.apple.mpegurl" });
      return reponse.end("#EXTM3U\n#EXTINF:6.0,\nseg1.ts\n");
    }
    if (requete.url === "/live/seg1.ts") {
      if (requete.headers.range === "bytes=0-3") {
        reponse.writeHead(206, { "content-type": "video/mp2t", "content-range": "bytes 0-3/1000", "content-length": "4" });
        return reponse.end(Buffer.from([0x47, 0x40, 0x11, 0x10]));
      }
      reponse.writeHead(200, { "content-type": "video/mp2t" });
      return reponse.end("segment-entier");
    }
    if (requete.url === "/redirection") {
      reponse.writeHead(302, { location: "/live/index.m3u8" });
      return reponse.end();
    }
    if (requete.url === "/absent") {
      reponse.writeHead(404, { "content-type": "text/html" });
      return reponse.end("<html>introuvable</html>");
    }
    reponse.writeHead(200, { "content-type": "video/mp2t" });
    return reponse.end("ok");
  });
  await new Promise((resoudre) => origine.listen(0, "127.0.0.1", resoudre));
  baseOrigine = `http://127.0.0.1:${origine.address().port}`;
});

after(async () => {
  origine.closeAllConnections?.();
  await new Promise((resoudre) => origine.close(resoudre));
});

test("une playlist est relayée, ses segments ramenés vers /flux", async () => {
  const reponse = reponseFactice();
  await proxy.relayer({ cible: `${baseOrigine}/live/index.m3u8`, methode: "GET", entetes: {}, reponse, options: { boucleLocale: true } });
  assert.equal(reponse.code, 200);
  assert.match(reponse.entetes["content-type"], /mpegurl/);
  assert.match(reponse.corps, /\/flux\?t=/);
  assert.equal(reponse.corps.includes("seg1.ts\n"), false, "le segment ne doit plus être une adresse nue");
});

test("un segment est transmis tel quel, avec son code 206 et son Range", async () => {
  const reponse = reponseFlux();
  await proxy.relayer({
    cible: `${baseOrigine}/live/seg1.ts`,
    methode: "GET",
    entetes: { range: "bytes=0-3" },
    reponse,
    options: { boucleLocale: true }
  });
  await reponse.fin();
  assert.equal(reponse.code, 206);
  assert.equal(reponse.entetes["content-range"], "bytes 0-3/1000");
  assert.equal(reponse.entetes["accept-ranges"], "bytes");
  assert.equal(reponse.corps(), Buffer.from([0x47, 0x40, 0x11, 0x10]).toString("utf8"));
});

test("une redirection est suivie et contrôlée", async () => {
  const reponse = reponseFactice();
  await proxy.relayer({ cible: `${baseOrigine}/redirection`, methode: "GET", entetes: {}, reponse, options: { boucleLocale: true } });
  assert.equal(reponse.code, 200);
  assert.match(reponse.corps, /\/flux\?t=/);
});

test("un flux absent est annoncé, pas remplacé par du HTML", async () => {
  const reponse = reponseFactice();
  await proxy.relayer({ cible: `${baseOrigine}/absent`, methode: "GET", entetes: {}, reponse, options: { boucleLocale: true } });
  assert.equal(reponse.code, 404);
  assert.match(reponse.corps, /plus diffusée/);
});

test("une origine injoignable donne un message, pas une erreur interne", async () => {
  const reponse = reponseFactice();
  await proxy.relayer({ cible: "http://127.0.0.1:1/live.m3u8", methode: "GET", entetes: {}, reponse, options: { boucleLocale: true } });
  assert.equal(reponse.code, 502);
  assert.match(reponse.corps, /injoignable/);
});

test("un HEAD ne transmet aucun corps", async () => {
  const reponse = reponseFactice();
  await proxy.relayer({ cible: `${baseOrigine}/live/seg1.ts`, methode: "HEAD", entetes: {}, reponse, options: { boucleLocale: true } });
  assert.equal(reponse.code, 200);
  assert.equal(reponse.corps, "");
});

/* ------------------------------------------------------------------ */
/* Entrée publique /flux                                               */
/* ------------------------------------------------------------------ */

/** Requête minimale : la méthode et les en-têtes suffisent au relais. */
function requeteBrute(methode = "GET", entetes = {}) {
  return { method: methode, headers: entetes };
}

function rechercheDe(adresse) {
  return new URL(adresse, "http://localhost").searchParams;
}

test("le relais est fermé par défaut : /flux répond 503", async () => {
  const reponse = reponseFactice();
  await proxy.traiter({ requete: requeteBrute(), reponse, recherche: rechercheDe("/flux?url=https://exemple.test/a.m3u8") });
  assert.equal(reponse.code, 503);
  assert.match(reponse.corps, /fermé/);
});

test("un réglage de relais invalide est refusé, avec son message", async () => {
  const tropCourt = await lecture.modifier({ proxy_agent: "VLC" });
  assert.equal(tropCourt.applique, false);
  assert.match(tropCourt.refuses.proxy_agent, /5 à 120/);
  const mauvaisReferer = await lecture.modifier({ proxy_referer: "celui-du-voisin" });
  assert.equal(mauvaisReferer.applique, false);
  assert.match(mauvaisReferer.refuses.proxy_referer, /origine ou aucun/);
  const pasUnBooleen = await lecture.modifier({ proxy_actif: "oui" });
  assert.equal(pasUnBooleen.applique, false);
  assert.match(pasUnBooleen.refuses.proxy_actif, /vrai ou faux/);
});

test("une fois ouvert, /flux exige une adresse ou un jeton", async () => {
  const ouvert = await lecture.modifier({ proxy_actif: true });
  assert.equal(ouvert.applique, true);
  const sansRien = reponseFactice();
  await proxy.traiter({ requete: requeteBrute(), reponse: sansRien, recherche: rechercheDe("/flux") });
  assert.equal(sansRien.code, 400);
  assert.match(sansRien.corps, /url ou t/);
});

test("/flux refuse une adresse absente du catalogue", async () => {
  const reponse = reponseFactice();
  await proxy.traiter({
    requete: requeteBrute(),
    reponse,
    recherche: rechercheDe(`/flux?url=${encodeURIComponent("https://exemple.test/inconnue.m3u8")}`)
  });
  assert.equal(reponse.code, 403);
  assert.match(reponse.corps, /catalogue/);
});

test("/flux refuse un jeton falsifié", async () => {
  const reponse = reponseFactice();
  await proxy.traiter({ requete: requeteBrute(), reponse, recherche: rechercheDe("/flux?t=abc.0.def") });
  assert.equal(reponse.code, 403);
  assert.match(reponse.corps, /jeton/);
});

test("/flux refuse tout ce qui n'est ni GET ni HEAD", async () => {
  const reponse = reponseFactice();
  await proxy.traiter({ requete: requeteBrute("POST"), reponse, recherche: rechercheDe("/flux?url=https://exemple.test/a.m3u8") });
  assert.equal(reponse.code, 405);
});

test("un jeton signé par le serveur ouvre un segment, même hors catalogue", async () => {
  const jeton = await proxy.signer("http://127.0.0.1:9/segment.ts", 1);
  const reponse = reponseFactice();
  await proxy.traiter({ requete: requeteBrute(), reponse, recherche: rechercheDe(`/flux?t=${encodeURIComponent(jeton)}`) });
  // Le jeton est valide, mais l'adresse locale reste refusée par le contrôle.
  assert.equal(reponse.code, 403);
  assert.match(reponse.corps, /réseau local/);
});

test("l'état public annonce le relais quand il est ouvert", async () => {
  const etat = await lecture.statut();
  assert.equal(etat.proxy_actif, true);
  assert.equal(etat.proxy_agent, "VLC/3.0.20 LibVLC/3.0.20");
  await lecture.modifier({ proxy_actif: false });
  assert.equal((await lecture.statut()).proxy_actif, false);
});
