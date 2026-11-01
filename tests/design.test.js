import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = join(RACINE, "public");

const EXTENSIONS = new Set([".css", ".js", ".html", ".webmanifest"]);

async function fichiersPublics(dossier = PUBLIC, resultat = []) {
  for (const entree of await readdir(dossier, { withFileTypes: true })) {
    const absolu = join(dossier, entree.name);
    if (entree.isDirectory()) {
      if (entree.name === "vendor") continue;
      await fichiersPublics(absolu, resultat);
    } else if (EXTENSIONS.has(extname(entree.name))) {
      resultat.push({ chemin: absolu.replace(PUBLIC, "public"), texte: await readFile(absolu, "utf8") });
    }
  }
  return resultat;
}

const MOTS_DEFENDUS = [
  "révolutionner",
  "revolutionner",
  "libérer le potentiel",
  "sans effort",
  "surpuissant",
  "réinventer",
  "nouvelle génération",
  "de pointe",
  "unleash",
  "supercharge",
  "seamless",
  "effortless",
  "cutting-edge",
  "game-changing",
  "next-level",
  "robust",
  "powerful"
];

const GRADIENTS_INTERDITS = ["#4f46e5", "#6366f1", "#7c3aed", "#8b5cf6", "#9333ea", "#a855f7", "#6d28d9", "#5b21b6"];

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2190}-\u{21FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{1F000}-\u{1F0FF}]/u;

test("aucun dégradé dans l'interface", async () => {
  for (const { chemin, texte } of await fichiersPublics()) {
    assert.equal(/linear-gradient|radial-gradient|conic-gradient/i.test(texte), false, `dégradé dans ${chemin}`);
  }
});

test("aucun texte en dégradé", async () => {
  for (const { chemin, texte } of await fichiersPublics()) {
    assert.equal(/background-clip:\s*text|-webkit-background-clip:\s*text/i.test(texte), false, `texte en dégradé dans ${chemin}`);
  }
});

test("aucune teinte indigo ou violette", async () => {
  for (const { chemin, texte } of await fichiersPublics()) {
    const minuscule = texte.toLowerCase();
    for (const teinte of GRADIENTS_INTERDITS) {
      assert.equal(minuscule.includes(teinte), false, `${teinte} présent dans ${chemin}`);
    }
  }
});

test("aucune ombre sur ce qui ne flotte pas", async () => {
  for (const { chemin, texte } of await fichiersPublics()) {
    if (!chemin.endsWith(".css")) continue;
    const occurrences = [...texte.matchAll(/box-shadow:\s*([^;]+);/g)].map((m) => m[1].trim());
    for (const valeur of occurrences) {
      assert.match(valeur, /var\(--ombre-flottant\)|none/, `ombre posée dans ${chemin} : ${valeur}`);
    }
  }
});

test("aucun emoji d'interface", async () => {
  for (const { chemin, texte } of await fichiersPublics()) {
    assert.equal(EMOJI.test(texte), false, `emoji dans ${chemin}`);
  }
});

test("aucun tiret cadratin dans la copie", async () => {
  for (const { chemin, texte } of await fichiersPublics()) {
    assert.equal(texte.includes("\u2014"), false, `tiret cadratin dans ${chemin}`);
    assert.equal(texte.includes("\u2013"), false, `tiret demi-cadratin dans ${chemin}`);
  }
});

test("aucun mot de bateleur dans la copie", async () => {
  for (const { chemin, texte } of await fichiersPublics()) {
    const minuscule = texte.toLowerCase();
    for (const mot of MOTS_DEFENDUS) {
      assert.equal(minuscule.includes(mot), false, `« ${mot} » dans ${chemin}`);
    }
  }
});

test("les survols changent la couleur, jamais la taille ni la position", async () => {
  for (const { chemin, texte } of await fichiersPublics()) {
    if (!chemin.endsWith(".css")) continue;
    for (const bloc of texte.matchAll(/:hover[^{]*\{([^}]*)\}/g)) {
      const corps = bloc[1];
      assert.equal(/transform|scale\(|translateY|box-shadow|filter:/.test(corps), false, `survol animé dans ${chemin} : ${corps.trim()}`);
    }
  }
});

test("les transitions restent courtes", async () => {
  for (const { chemin, texte } of await fichiersPublics()) {
    if (!chemin.endsWith(".css")) continue;
    for (const bloc of texte.matchAll(/transition:\s*([^;]+);/g)) {
      const valeur = bloc[1];
      const durees = [...valeur.matchAll(/(\d*\.?\d+)m?s\b/g)].map((m) => m[0]);
      for (const duree of durees) {
        const ms = duree.endsWith("ms") ? parseFloat(duree) : parseFloat(duree) * 1000;
        assert.ok(ms <= 300, `transition de ${duree} dans ${chemin}`);
      }
      assert.equal(/var\(--duree-survol\)|var\(--duree-entree\)|\d/.test(valeur), true);
    }
  }
});

test("aucune police hors de l'échelle prévue", async () => {
  const echelle = [12, 13, 14, 15, 16, 20, 24, 30, 32, 40, 48];
  for (const { chemin, texte } of await fichiersPublics()) {
    if (!chemin.endsWith(".css")) continue;
    for (const bloc of texte.matchAll(/font-size:\s*(\d+)px/g)) {
      const taille = Number(bloc[1]);
      assert.ok(echelle.includes(taille), `taille ${taille}px hors échelle dans ${chemin}`);
      assert.ok(taille >= 12, `taille ${taille}px sous 12 pixels dans ${chemin}`);
    }
  }
});

test("les titres restent sous 56 pixels", async () => {
  for (const { chemin, texte } of await fichiersPublics()) {
    if (!chemin.endsWith(".css")) continue;
    for (const bloc of texte.matchAll(/h1\s*\{[^}]*font-size:\s*(\d+)px/g)) {
      assert.ok(Number(bloc[1]) <= 56, `titre de ${bloc[1]}px dans ${chemin}`);
    }
  }
});

test("les espacements sont des multiples de 4 pixels", async () => {
  for (const { chemin, texte } of await fichiersPublics()) {
    if (!chemin.endsWith(".css")) continue;
    for (const bloc of texte.matchAll(/(?:padding|margin|gap):\s*([^;]+);/g)) {
      for (const valeur of bloc[1].matchAll(/(-?\d+)px/g)) {
        const pixels = Number(valeur[1]);
        // Le retrait de 1 pixel est la technique d'occultation accessible,
        // pas un espacement de mise en page.
        if (Math.abs(pixels) === 1) continue;
        assert.equal(pixels % 4, 0, `espacement de ${pixels}px dans ${chemin}`);
      }
    }
  }
});

test("un seul rayon d'angle est utilisé", async () => {
  for (const { chemin, texte } of await fichiersPublics()) {
    if (!chemin.endsWith(".css")) continue;
    for (const bloc of texte.matchAll(/border-radius:\s*([^;]+);/g)) {
      const valeur = bloc[1].trim();
      assert.match(valeur, /var\(--rayon(?:-petit)?\)|999px|50%|0/, `rayon en dur dans ${chemin} : ${valeur}`);
    }
  }
});

test("aucun script ne vient d'un réseau tiers", async () => {
  for (const { chemin, texte } of await fichiersPublics()) {
    const distant = /<script[^>]+src="(https?:)?\/\//i.test(texte) || /from\s+["']https?:\/\//.test(texte);
    assert.equal(distant, false, `script distant dans ${chemin}`);
  }
});

test("aucun TODO ni placeholder dans un fichier livré", async () => {
  for (const { chemin, texte } of await fichiersPublics()) {
    assert.equal(/\bTODO\b|\bFIXME\b|lorem ipsum|à compléter plus tard|placeholder ici/i.test(texte), false, `reste à faire dans ${chemin}`);
  }
});

test("chaque image porte un texte de remplacement", async () => {
  for (const { chemin, texte } of await fichiersPublics()) {
    if (!chemin.endsWith(".js")) continue;
    for (const bloc of texte.matchAll(/h\("img",\s*\{([^}]*)\}/g)) {
      assert.match(bloc[1], /alt:/, `image sans alt dans ${chemin}`);
    }
  }
});
