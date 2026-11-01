/**
 * Formats de la console : dates lisibles, entiers, pourcentages.
 * Une seule écriture pour toute la console, pour que deux panneaux ne disent
 * pas la même date de deux façons.
 */

export function quand(iso) {
  if (!iso) return "jamais";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "date inconnue";
  const ecart = Date.now() - date.getTime();
  const minutes = Math.round(ecart / 60000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const heures = Math.round(minutes / 60);
  if (heures < 24) return `il y a ${heures} h`;
  const jours = Math.round(heures / 24);
  if (jours < 8) return `il y a ${jours} j`;
  return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

export function nombre(valeur) {
  return new Intl.NumberFormat("fr-FR").format(Number(valeur) || 0);
}

export function texteSansAccent(valeur) {
  return String(valeur ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Étiquette de gravité, telle que la console l'affiche. */
export function gravite(niveau) {
  return { grave: "À corriger", avertissement: "À surveiller", info: "Pour information", ok: "Sain", echec: "En échec" }[niveau] ?? niveau;
}
