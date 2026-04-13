import { chromium } from "playwright";
import fs from "fs";

const URL = "https://betsapi.com/basketball/t/45051/zalgiris";

// BetsAPI rodo datas kaip MM/DD HH:mm, todėl pridedam einamuosius metus.
function parseMatchDate(dateText) {
  // Pvz. "04/14 17:30"
  const match = dateText.match(/^(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})$/);
  if (!match) return null;

  const [, mm, dd, hh, min] = match;
  const now = new Date();
  const year = now.getFullYear();

  // Naudojam local time
  const date = new Date(year, Number(mm) - 1, Number(dd), Number(hh), Number(min), 0);

  // Jei data jau labai praeityje, gal puslapis rodo kitų metų sezoną
  if (date.getTime() < now.getTime() - 1000 * 60 * 60 * 24 * 30) {
    return new Date(year + 1, Number(mm) - 1, Number(dd), Number(hh), Number(min), 0);
  }

  return date;
}

function normalizeSpaces(str) {
  return str.replace(/\s+/g, " ").trim();
}

async function getNextGame() {
  const browser = await chromium.launch({
    headless: true
  });

  const page = await browser.newPage({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
    locale: "en-US",
    timezoneId: "Europe/Vilnius"
  });

  try {
    await page.goto(URL, {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });

    // Palaukiam, kol lentelė atsiras
    await page.waitForSelector("table", { timeout: 30000 });

    // Nedidelė pauzė, jei duomenys užsikrauna po JS
    await page.waitForTimeout(2500);

    const rows = await page.$$eval("table tr", (trs) =>
      trs.map((tr) => {
        const cells = Array.from(tr.querySelectorAll("td")).map((td) =>
          td.textContent?.replace(/\s+/g, " ").trim() || ""
        );

        return {
          cells,
          raw: tr.textContent?.replace(/\s+/g, " ").trim() || ""
        };
      })
    );

    // Debugui, jei reikės pasižiūrėti ką realiai surinko
    fs.writeFileSync("debug-rows.json", JSON.stringify(rows, null, 2), "utf8");

    const games = [];

    for (const row of rows) {
      const text = normalizeSpaces(row.raw);

      // Ieškom eilučių, kur yra data ir Žalgiris
      const dateMatch = text.match(/\b\d{2}\/\d{2}\s+\d{2}:\d{2}\b/);
      if (!dateMatch) continue;
      if (!/zalgiris/i.test(text)) continue;

      const dateText = dateMatch[0];
      const matchDate = parseMatchDate(dateText);
      if (!matchDate) continue;

      // Pabandome ištraukti lygą ir rungtynių tekstą
      // Pvz. "Euroleague 04/17 19:00 38 Zalgiris v Paris View"
      // arba "Lithuania LKL 04/14 17:30 - Jonava v Zalgiris View"
      const cleaned = text
        .replace(dateText, "||DATE||")
        .replace(/\bView\b/gi, "")
        .replace(/\s+/g, " ")
        .trim();

      const parts = cleaned.split("||DATE||").map((s) => s.trim());

      let league = "";
      let matchup = "";

      if (parts.length >= 2) {
        league = parts[0]
          .replace(/\bFixtures\b/gi, "")
          .replace(/\bLeague\b/gi, "")
          .trim();

        matchup = parts[1]
          .replace(/^\d+\s+/, "") // pašalina round numerį pvz. 38
          .trim();
      }

      // Ieškom "Team A v Team B"
      const matchupMatch = matchup.match(
        /([A-Za-zÀ-ÿ0-9 .'\-]+)\s+v\s+([A-Za-zÀ-ÿ0-9 .'\-]+)$/i
      );

      let home = null;
      let away = null;

      if (matchupMatch) {
        home = normalizeSpaces(matchupMatch[1]);
        away = normalizeSpaces(matchupMatch[2]);
      }

      games.push({
        league,
        dateText,
        timestamp: matchDate.getTime(),
        iso: matchDate.toISOString(),
        home,
        away,
        matchup: home && away ? `${home} v ${away}` : matchup || text
      });
    }

    const now = Date.now();
    const upcoming = games
      .filter((g) => g.timestamp >= now)
      .sort((a, b) => a.timestamp - b.timestamp);

    if (!upcoming.length) {
      throw new Error("Nepavyko rasti būsimų Žalgirio rungtynių.");
    }

    const nextGame = upcoming[0];

    fs.writeFileSync("next-game.json", JSON.stringify(nextGame, null, 2), "utf8");

    console.log("Artimiausios Žalgirio rungtynės:");
    console.log(JSON.stringify(nextGame, null, 2));
  } finally {
    await browser.close();
  }
}

getNextGame().catch((err) => {
  console.error("Klaida:", err.message);
  process.exit(1);
});
