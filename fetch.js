import fs from "fs";

const API_URL =
  "https://feeds.incrowdsports.com/provider/euroleague-feeds/v2/competitions/E/seasons/E2025/games?teamCode=ZAL";

const MONTHS_LT = [
  "sausio", "vasario", "kovo", "balandžio", "gegužės", "birželio",
  "liepos", "rugpjūčio", "rugsėjo", "spalio", "lapkričio", "gruodžio"
];

function formatLithuanian(isoDate) {
  const d = new Date(isoDate);

  // Paimam datos dalis Vilniaus laiku
  const parts = new Intl.DateTimeFormat("lt-LT", {
    timeZone: "Europe/Vilnius",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(d);

  const get = (type) => parts.find((p) => p.type === type)?.value;
  const day = Number(get("day"));
  const month = Number(get("month"));
  const year = Number(get("year"));
  const hour = get("hour");
  const minute = get("minute");

  const monthName = MONTHS_LT[month - 1];
  const monthNameCapitalized = monthName.charAt(0).toUpperCase() + monthName.slice(1);

  return {
    dateText: `${monthNameCapitalized} ${day}d.`,     // "Balandžio 17d."
    timeText: `${hour}:${minute}`,                      // "20:00" (Vilniaus laiku)
    full: `${monthNameCapitalized} ${day}d., ${hour}:${minute}`, // "Balandžio 17d., 20:00"
    year
  };
}

async function getNextGame() {
  const res = await fetch(API_URL, {
    headers: {
      "Accept": "application/json",
      "User-Agent":
        "Mozilla/5.0 (compatible; ZalgirisNextGameBot/1.0; +https://github.com/miciulissarunas/zalgiris-games2)"
    }
  });

  console.log("HTTP status:", res.status);

  if (!res.ok) {
    throw new Error(`API grąžino HTTP ${res.status}`);
  }

  const body = await res.json();
  const games = Array.isArray(body.data) ? body.data : [];

  fs.writeFileSync(
    "debug-games.json",
    JSON.stringify(games.slice(0, 5), null, 2),
    "utf8"
  );

  if (!games.length) {
    throw new Error("API grąžino tuščią sąrašą.");
  }

  const now = Date.now();

  const upcoming = games
    .filter((g) => {
      const t = new Date(g.date).getTime();
      return (
        g.status !== "result" &&
        Number.isFinite(t) &&
        t >= now - 5 * 60 * 1000
      );
    })
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  if (!upcoming.length) {
    throw new Error("Nerastos būsimos Euroleague Žalgirio rungtynės.");
  }

  const g = upcoming[0];
  const matchDate = new Date(g.date);
  const fmt = formatLithuanian(g.date);

  const nextGame = {
    league: "Euroleague",
    round: g.round?.round ?? null,
    phase: g.phaseType?.name ?? null,
    dateText: fmt.dateText,      // "Balandžio 17d."
    timeText: fmt.timeText,      // "20:00"
    dateTimeText: fmt.full,      // "Balandžio 17d., 20:00"
    year: fmt.year,
    iso: matchDate.toISOString(),
    timestamp: matchDate.getTime(),
    home: g.home?.club?.name ?? g.home?.name ?? null,
    away: g.away?.club?.name ?? g.away?.name ?? null,
    matchup:
      (g.home?.club?.name ?? g.home?.name ?? "?") +
      " v " +
      (g.away?.club?.name ?? g.away?.name ?? "?"),
    venue: g.venue?.name ?? null,
    code: g.code ?? null,
    status: g.status ?? null
  };

  fs.writeFileSync("next-game.json", JSON.stringify(nextGame, null, 2), "utf8");

  console.log("Artimiausios Euroleague Žalgirio rungtynės:");
  console.log(JSON.stringify(nextGame, null, 2));
}

getNextGame().catch((err) => {
  console.error("Klaida:", err.message);
  process.exit(1);
});
