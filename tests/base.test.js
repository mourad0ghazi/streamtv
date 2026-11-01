import { test } from "node:test";
import assert from "node:assert/strict";

import * as base from "../public/js/partage/base.js";
import { prefixerHtml, pagePour, manifestePour } from "../scripts/construire-statique.mjs";

/* ---------------------------------------------------------------- */
/* Base de publication                                               */
/* ---------------------------------------------------------------- */

test("la base se normalise sans barre superflue", () => {
  assert.equal(base.normaliserBase("/streamtv/"), "/streamtv");
  assert.equal(base.normaliserBase("streamtv"), "/streamtv");
  assert.equal(base.normaliserBase("/"), "");
  assert.equal(base.normaliserBase(""), "");
  assert.equal(base.normaliserBase(undefined), "");
  assert.equal(base.normaliserBase("  /streamtv//  "), "/streamtv");
});

test("sans base, aucune adresse ne bouge", () => {
  delete globalThis.STREAMTV_BASE;
  assert.equal(base.base(), "");
  assert.equal(base.avecBase("/chaines"), "/chaines");
  assert.equal(base.sansBase("/chaines/ch-1"), "/chaines/ch-1");
});

test("avec base, une adresse interne est préfixée une seule fois", () => {
  globalThis.STREAMTV_BASE = "/streamtv";
  assert.equal(base.avecBase("/chaines"), "/streamtv/chaines");
  assert.equal(base.avecBase("/streamtv/chaines"), "/streamtv/chaines");
  assert.equal(base.avecBase("/"), "/streamtv/");
  delete globalThis.STREAMTV_BASE;
});

test("les adresses qui ne sont pas internes restent intactes", () => {
  globalThis.STREAMTV_BASE = "/streamtv";
  for (const adresse of ["https://exemple.fr/a", "//cdn.exemple.fr/a.js", "#page", "image.png", ""]) {
    assert.equal(base.avecBase(adresse), adresse);
  }
  delete globalThis.STREAMTV_BASE;
});

test("sansBase retrouve le chemin du routeur, barre finale comprise", () => {
  globalThis.STREAMTV_BASE = "/streamtv";
  assert.equal(base.sansBase("/streamtv/chaines/"), "/chaines");
  assert.equal(base.sansBase("/streamtv/chaines/ch-00187"), "/chaines/ch-00187");
  assert.equal(base.sansBase("/streamtv/"), "/");
  assert.equal(base.sansBase("/streamtv"), "/");
  assert.equal(base.sansBase("/chaines"), "/chaines", "une adresse hors base ne doit pas être tronquée");
  delete globalThis.STREAMTV_BASE;
});

test("sansBase ne confond pas un dépôt voisin avec la base", () => {
  globalThis.STREAMTV_BASE = "/streamtv";
  assert.equal(base.sansBase("/streamtv2/chaines"), "/streamtv2/chaines");
  delete globalThis.STREAMTV_BASE;
});

test("cheminCourant lit l'adresse de la page en retirant la base", () => {
  const avant = globalThis.window;
  globalThis.window = { location: { pathname: "/streamtv/films/" } };
  globalThis.STREAMTV_BASE = "/streamtv";
  assert.equal(base.cheminCourant(), "/films");
  globalThis.window = avant;
  delete globalThis.STREAMTV_BASE;
});

/* ---------------------------------------------------------------- */
/* Fabrication des nœuds                                             */
/* ---------------------------------------------------------------- */

test("h() préfixe les liens et les images par la base", async () => {
  const { monter, Noeud, parBalise } = await import("./aide/dom-factice.js");
  const { h } = await import("../public/js/dom.js");
  globalThis.STREAMTV_BASE = "/streamtv";
  const racine = monter(new Noeud("div"));
  racine.append(
    h("a", { href: "/chaines", "data-lien": "" }, "Chaînes"),
    h("img", { src: "/affiches/a.jpg", alt: "" }),
    h("a", { href: "https://exemple.fr" }, "Dehors"),
    h("a", { href: "#page" }, "Ancre")
  );
  const liens = parBalise(racine, "a").map((a) => a.getAttribute("href"));
  assert.deepEqual(liens, ["/streamtv/chaines", "https://exemple.fr", "#page"]);
  assert.equal(parBalise(racine, "img")[0].getAttribute("src"), "/streamtv/affiches/a.jpg");
  delete globalThis.STREAMTV_BASE;
});

test("sans base, h() laisse les adresses telles quelles", async () => {
  const { monter, Noeud, parBalise } = await import("./aide/dom-factice.js");
  const { h } = await import("../public/js/dom.js");
  delete globalThis.STREAMTV_BASE;
  const racine = monter(new Noeud("div"));
  racine.append(h("a", { href: "/chaines" }, "Chaînes"));
  assert.equal(parBalise(racine, "a")[0].getAttribute("href"), "/chaines");
});

/* ---------------------------------------------------------------- */
/* Construction statique                                             */
/* ---------------------------------------------------------------- */

const PAGE = `<link rel="stylesheet" href="/css/base.css?v=3.18.0" />
    <a class="visuellement-cache" href="#page">Aller au contenu</a>
    <script type="module" src="/js/app.js?v=3.18.0"></script>`;

test("la page publiée sous une base voit ses adresses préfixées", () => {
  const publiee = prefixerHtml(PAGE, "/streamtv");
  assert.match(publiee, /href="\/streamtv\/css\/base\.css\?v=3\.18\.0"/);
  assert.match(publiee, /src="\/streamtv\/js\/app\.js\?v=3\.18\.0"/);
  assert.match(publiee, /href="#page"/, "une ancre ne doit pas être préfixée");
});

test("à la racine, la page publiée ne bouge pas", () => {
  assert.equal(prefixerHtml(PAGE, ""), PAGE);
});

test("la page publiée porte la base et le mode démonstration", () => {
  const publiee = pagePour(PAGE, "/streamtv");
  assert.match(publiee, /window\.STREAMTV_STATIQUE = true/);
  assert.match(publiee, /window\.STREAMTV_BASE = "\/streamtv"/);
  assert.ok(publiee.indexOf("STREAMTV_BASE") < publiee.indexOf('<script type="module"'), "la base doit être connue avant le module");
});

test("le manifeste publié pointe vers la base", () => {
  const source = JSON.stringify({ start_url: "/", scope: "/", icons: [{ src: "/icone.svg", sizes: "any" }] });
  const manifeste = JSON.parse(manifestePour(source, "/streamtv"));
  assert.equal(manifeste.start_url, "/streamtv/");
  assert.equal(manifeste.scope, "/streamtv/");
  assert.equal(manifeste.icons[0].src, "/streamtv/icone.svg");
});
