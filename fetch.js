import fs from "fs";

const API_URL =
  "https://feeds.incrowdsports.com/provider/euroleague-feeds/v2/competitions/E/seasons/E2025/games?teamCode=ZAL";

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

  // Debug — visada rašom, kad sekančiu kartu, jei kas, būtų ką žiūrėti
  fs.writeFileSync(
    "debug-games.json",
    JSON.stringify(games.slice(0, 5), null, 2),
    "utf8"
  );

  if (!games.length) {
    throw new Error("API grąžino tuščią sąrašą.");
  }

  const now = Date.now();

  // Tik dar nesužaistos (status !== 'result') ir ateityje
  const upcoming = games
    .filter((g) => {
      const t = new Date(g.date).getTime();
      return (
        g.status !== "result" &&
        Number.isFinite(t) &&
        t >= now - 5 * 60 * 1000 // 5 min buferis jei tik ką prasidėjo
      );
    })
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  if (!upcoming.length) {
    throw new Error("Nerastos būsimos Euroleague Žalgirio rungtynės.");
  }

  const g = upcoming[0];
  const matchDate = new Date(g.date);

  const nextGame = {
    league: "Euroleague",
    round: g.round?.round ?? null,
    phase: g.phaseType?.name ?? null,
    dateText: matchDate.toISOString(),
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
