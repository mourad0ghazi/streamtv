/**
 * DOM minimal pour exercer les vues hors navigateur.
 *
 * Il ne simule pas la mise en page : il permet seulement d'exécuter le rendu
 * et de lire l'arbre produit. Aucune dépendance, conformément à la règle des
 * zéro paquet.
 */

class Noeud {
  constructor(nom) {
    this.nom = nom;
    this.enfants = [];
    this.attributs = new Map();
    this.ecouteurs = new Map();
    this.className = "";
    this.style = {};
    this.dataset = {};
    this.textContent = "";
    this.innerHTML = "";
    this.parent = null;
  }

  append(...elements) {
    for (const element of elements.flat(Infinity)) {
      const noeud = element instanceof Noeud ? element : new Noeud("#texte");
      if (!(element instanceof Noeud)) noeud.textContent = String(element);
      noeud.parent = this;
      this.enfants.push(noeud);
    }
  }

  appendChild(element) {
    this.append(element);
    return element;
  }

  get firstChild() {
    return this.enfants[0] ?? null;
  }

  removeChild(element) {
    this.enfants = this.enfants.filter((e) => e !== element);
    return element;
  }

  remove() {
    this.parent?.removeChild(this);
  }

  replaceChildren(...elements) {
    this.enfants = [];
    this.append(...elements);
  }

  get classList() {
    const noeud = this;
    const liste = () => (noeud.className ?? "").split(/\s+/).filter(Boolean);
    return {
      add: (classe) => {
        if (!liste().includes(classe)) noeud.className = [...liste(), classe].join(" ");
      },
      remove: (classe) => {
        noeud.className = liste().filter((c) => c !== classe).join(" ");
      },
      contains: (classe) => liste().includes(classe)
    };
  }

  /* `hidden` est reflété par l'attribut, comme dans un vrai navigateur. */
  get hidden() {
    return this.attributs.has("hidden");
  }

  set hidden(valeur) {
    if (valeur) this.setAttribute("hidden", "");
    else this.attributs.delete("hidden");
  }

  setAttribute(cle, valeur) {
    this.attributs.set(cle, String(valeur));
    if (cle === "class") this.className = String(valeur);
    if (cle === "id") this.id = String(valeur);
  }

  getAttribute(cle) {
    return this.attributs.get(cle) ?? null;
  }

  hasAttribute(cle) {
    return this.attributs.has(cle);
  }

  removeAttribute(cle) {
    this.attributs.delete(cle);
  }

  addEventListener(type, rappel) {
    if (!this.ecouteurs.has(type)) this.ecouteurs.set(type, []);
    this.ecouteurs.get(type).push(rappel);
  }

  removeEventListener(type, rappel) {
    const liste = this.ecouteurs.get(type) ?? [];
    this.ecouteurs.set(type, liste.filter((r) => r !== rappel));
  }

  declencher(type, evenement = {}) {
    for (const rappel of this.ecouteurs.get(type) ?? []) rappel({ ...evenement, target: evenement.target ?? this });
  }

  closest(selecteur) {
    const classe = selecteur.replace(/^\./, "").replace(/\[.*$/, "");
    let courant = this;
    while (courant) {
      if ((courant.className ?? "").split(/\s+/).includes(classe)) return courant;
      courant = courant.parent;
    }
    return null;
  }

  querySelector() {
    return null;
  }

  querySelectorAll() {
    return [];
  }

  focus() {}

  /* Doublures d'éléments média : le lecteur appelle ces méthodes. */
  play() {
    return Promise.resolve();
  }

  load() {}

  canPlayType() {
    return "probably";
  }

  requestFullscreen() {
    return Promise.resolve();
  }
}

const racineDocument = new Noeud("#document");

const ecouteursDocument = new Map();

globalThis.Node = Noeud;
globalThis.document = {
  createElement: (nom) => new Noeud(nom),
  createElementNS: (_ns, nom) => new Noeud(nom),
  createTextNode: (texte) => {
    const noeud = new Noeud("#texte");
    noeud.textContent = String(texte);
    return noeud;
  },
  getElementById: (id) => {
    const chercher = (noeud) => {
      if (noeud.id === id) return noeud;
      for (const enfant of noeud.enfants) {
        const trouve = chercher(enfant);
        if (trouve) return trouve;
      }
      return null;
    };
    return chercher(racineDocument) ?? new Noeud("div");
  },
  querySelectorAll: () => [],
  addEventListener: (type, rappel) => {
    if (!ecouteursDocument.has(type)) ecouteursDocument.set(type, []);
    ecouteursDocument.get(type).push(rappel);
  },
  removeEventListener: (type, rappel) => {
    const liste = ecouteursDocument.get(type) ?? [];
    ecouteursDocument.set(type, liste.filter((r) => r !== rappel));
  },
  body: new Noeud("body"),
  head: new Noeud("head"),
  title: ""
};

const stockage = new Map();
globalThis.localStorage = {
  getItem: (cle) => (stockage.has(cle) ? stockage.get(cle) : null),
  setItem: (cle, valeur) => stockage.set(cle, String(valeur)),
  removeItem: (cle) => stockage.delete(cle),
  clear: () => stockage.clear()
};

globalThis.window = {
  location: { origin: "http://localhost", pathname: "/", search: "" },
  history: { pushState: () => {}, replaceState: () => {} },
  addEventListener: () => {},
  scrollTo: () => {}
};

/** Déclenche un événement clavier sur le document simulé. */
export function toucheDocument(touche) {
  const evenement = { key: touche, preventDefault: () => {} };
  for (const rappel of ecouteursDocument.get("keydown") ?? []) rappel(evenement);
}

/** Place un nœud à la racine du document simulé, pour que getElementById le trouve. */
export function monter(noeud) {
  racineDocument.append(noeud);
  return noeud;
}

/** Parcourt l'arbre et renvoie tous les nœuds dont le nom ou la classe correspond. */
export function collecter(racine, predicat) {
  const trouve = [];
  const visiter = (noeud) => {
    if (predicat(noeud)) trouve.push(noeud);
    for (const enfant of noeud.enfants) visiter(enfant);
  };
  visiter(racine);
  return trouve;
}

export function parClasse(racine, classe) {
  return collecter(racine, (n) => (n.className ?? "").split(/\s+/).includes(classe));
}

export function parBalise(racine, balise) {
  return collecter(racine, (n) => n.nom === balise);
}

/** Texte visible, enfant par enfant, dans l'ordre du document. */
export function texte(racine) {
  const morceaux = [];
  const visiter = (noeud) => {
    if (noeud.nom === "#texte") morceaux.push(noeud.textContent);
    else if (noeud.textContent) morceaux.push(noeud.textContent);
    for (const enfant of noeud.enfants) visiter(enfant);
  };
  visiter(racine);
  return morceaux.join(" ").replace(/\s+/g, " ").trim();
}

export { Noeud };
