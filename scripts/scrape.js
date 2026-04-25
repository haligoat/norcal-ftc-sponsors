/**
 * NorCal FTC Sponsor Scraper
 * Fetches all teams from USCANO region and collects sponsor data
 * from the FIRST Inspires events website.
 *
 * Usage:
 *   node scripts/scrape.js
 *   node scripts/scrape.js --region USCASO   (different region)
 *   node scripts/scrape.js --season 2024     (different season year)
 *   node scripts/scrape.js --top 50          (only top N teams by OPR)
 *
 * Output: data/sponsors.json + data/sponsors.csv
 */

const https = require("https");
const fs = require("fs");
const path = require("path");

// ── Config ────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = (flag, def) => {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : def;
};

const REGION = getArg("--region", "USCANO");
const SEASON = getArg("--season", "2025");
const TOP_N = parseInt(getArg("--top", "0"), 10); // 0 = all teams
const CONCURRENCY = 8; // parallel fetches
const DELAY_MS = 200; // polite delay between batches
const BASE = "https://ftc-events.firstinspires.org";

// ── Helpers ───────────────────────────────────────────────────────────────────
function get(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "User-Agent": "NorCal-FTC-Scraper/1.0" } }, (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve(data));
      })
      .on("error", reject);
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseSponsors(html) {
  const match = html.match(/<b><em>2025 Sponsors:\s*<\/em><\/b>\s*([^<\n]+)/i);
  if (!match) return [];
  return cleanSponsors(match[1]);
}

function cleanSponsors(raw) {
  return raw
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .replace(/Family\/Community/gi, "")
    .replace(/Family\/Friends/gi, "")
    .replace(/Family and Community/gi, "")
    .trim()
    .split(/[/&]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 2);
}

function parseName(html) {
  const m = html.match(/Team \d+ - (.+?) \(20\d\d\)/);
  return m ? m[1].trim() : "Unknown";
}

function parseCity(html) {
  const m = html.match(/maps\.google\.com\/\?q=([^"]+)/);
  return m ? decodeURIComponent(m[1].replace(/\+/g, " ")).trim() : "";
}

function parseWebsite(html) {
  const m = html.match(/On The Web.*?<(https?:\/\/[^\s>]+)>/);
  return m ? m[1] : null;
}

function parseRookie(html) {
  const m = html.match(/Rookie Year:\s*(\d{4})/);
  return m ? parseInt(m[1], 10) : null;
}

// ── Step 1: Fetch all teams in region ─────────────────────────────────────────
async function fetchTeamList() {
  console.log(`\n📡 Fetching team list for ${REGION} (season ${SEASON})...`);
  const url = `${BASE}/${SEASON}/region/${REGION}`;
  const html = await get(url);

  // Extract team numbers from table links
  const re = /\/team\/(\d+)/g;
  const seen = new Set();
  let m;
  while ((m = re.exec(html)) !== null) {
    seen.add(m[1]);
  }

  const teams = [...seen];
  console.log(`✅ Found ${teams.length} teams`);
  return teams;
}

// ── Step 2: Fetch OPR rankings from ftcstats (optional, best-effort) ──────────
async function fetchRankings() {
  const regionSlug = REGION === "USCANO" ? "california_northern" : REGION.toLowerCase();
  const url = `http://www.ftcstats.org/${SEASON}/${regionSlug}.html`;
  console.log(`\n📊 Fetching OPR rankings...`);
  try {
    // ftcstats is http — node https won't work, use http
    const html = await new Promise((resolve, reject) => {
      require("http")
        .get(url, { headers: { "User-Agent": "NorCal-FTC-Scraper/1.0" } }, (res) => {
          let d = "";
          res.on("data", (c) => (d += c));
          res.on("end", () => resolve(d));
        })
        .on("error", reject);
    });

    // Parse rank table: | Rank | teamNumber | teamName | OPR ...
    const rankMap = {};
    const rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) || [];
    for (const row of rows) {
      const cells = (row.match(/<td[^>]*>([\s\S]*?)<\/td>/g) || []).map((c) =>
        c.replace(/<[^>]+>/g, "").trim()
      );
      if (cells.length >= 4 && /^\d+$/.test(cells[0])) {
        const rank = parseInt(cells[0], 10);
        const numMatch = row.match(/\/team\/(\d+)/);
        if (numMatch) {
          rankMap[numMatch[1]] = { rank, opr: parseFloat(cells[3]) || 0 };
        }
      }
    }
    console.log(`✅ Got OPR data for ${Object.keys(rankMap).length} teams`);
    return rankMap;
  } catch (e) {
    console.warn(`⚠️  Could not fetch OPR rankings: ${e.message}`);
    return {};
  }
}

// ── Step 3: Fetch individual team pages in parallel batches ───────────────────
async function fetchTeamData(teamIds, rankings) {
  const results = [];
  let done = 0;

  for (let i = 0; i < teamIds.length; i += CONCURRENCY) {
    const batch = teamIds.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(
      batch.map(async (id) => {
        const url = `${BASE}/${SEASON}/team/${id}`;
        const html = await get(url);
        return {
          id,
          name: parseName(html),
          city: parseCity(html),
          website: parseWebsite(html),
          rookieYear: parseRookie(html),
          sponsors: parseSponsors(html),
          rank: rankings[id]?.rank ?? null,
          opr: rankings[id]?.opr ?? null,
          profileUrl: url,
        };
      })
    );

    for (const s of settled) {
      if (s.status === "fulfilled") results.push(s.value);
      else console.warn(`  ⚠️  Failed team in batch: ${s.reason?.message}`);
    }

    done += batch.length;
    process.stdout.write(`\r  ⏳ ${done}/${teamIds.length} teams fetched...`);
    if (i + CONCURRENCY < teamIds.length) await sleep(DELAY_MS);
  }

  console.log(`\n✅ Fetched data for ${results.length} teams`);
  return results;
}

// ── Step 4: Write outputs ──────────────────────────────────────────────────────
function writeOutputs(teams) {
  const outDir = path.join(__dirname, "../docs/data");
  fs.mkdirSync(outDir, { recursive: true });

  // Sort: ranked teams first, then unranked alphabetically
  teams.sort((a, b) => {
    if (a.rank && b.rank) return a.rank - b.rank;
    if (a.rank) return -1;
    if (b.rank) return 1;
    return a.name.localeCompare(b.name);
  });

  // JSON
  const jsonOut = {
    meta: {
      region: REGION,
      season: SEASON,
      generatedAt: new Date().toISOString(),
      totalTeams: teams.length,
      teamsWithSponsors: teams.filter((t) => t.sponsors.length > 0).length,
    },
    teams,
  };
  fs.writeFileSync(path.join(outDir, "sponsors.json"), JSON.stringify(jsonOut, null, 2));

  // CSV
  const csvRows = [
    ["rank", "id", "name", "city", "rookieYear", "opr", "sponsors", "website", "profileUrl"],
    ...teams.map((t) => [
      t.rank ?? "",
      t.id,
      `"${t.name.replace(/"/g, '""')}"`,
      `"${t.city}"`,
      t.rookieYear ?? "",
      t.opr ?? "",
      `"${t.sponsors.join(" | ").replace(/"/g, '""')}"`,
      t.website ?? "",
      t.profileUrl,
    ]),
  ];
  fs.writeFileSync(path.join(outDir, "sponsors.csv"), csvRows.map((r) => r.join(",")).join("\n"));

  // Sponsor frequency analysis
  const freq = {};
  for (const t of teams) {
    for (const s of t.sponsors) {
      const key = s.toLowerCase().trim();
      freq[key] = (freq[key] || { name: s, count: 0, teams: [] });
      freq[key].count++;
      freq[key].teams.push({ id: t.id, name: t.name });
    }
  }
  const topSponsors = Object.values(freq)
    .sort((a, b) => b.count - a.count)
    .slice(0, 50);
  fs.writeFileSync(
    path.join(outDir, "sponsor_frequency.json"),
    JSON.stringify(topSponsors, null, 2)
  );

  console.log(`\n📁 Output files written to data/`);
  console.log(`   → docs/data/sponsors.json`);
  console.log(`   → docs/data/sponsors.csv`);
  console.log(`   → docs/data/sponsor_frequency.json`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  console.log("🤖 NorCal FTC Sponsor Scraper");
  console.log("================================");

  try {
    let teamIds = await fetchTeamList();
    const rankings = await fetchRankings();

    // If --top N, filter to only ranked teams sorted by rank
    if (TOP_N > 0) {
      const ranked = teamIds
        .filter((id) => rankings[id]?.rank)
        .sort((a, b) => rankings[a].rank - rankings[b].rank)
        .slice(0, TOP_N);
      console.log(`\n🎯 Filtering to top ${TOP_N} ranked teams (${ranked.length} found)`);
      teamIds = ranked;
    }

    console.log(`\n🔍 Fetching individual team pages (${teamIds.length} teams)...`);
    const teams = await fetchTeamData(teamIds, rankings);

    writeOutputs(teams);

    // Print summary
    console.log("\n📊 Quick Summary:");
    console.log(`   Total teams scraped: ${teams.length}`);
    console.log(`   Teams with sponsors: ${teams.filter((t) => t.sponsors.length > 0).length}`);
    const allSponsors = teams.flatMap((t) => t.sponsors);
    const unique = new Set(allSponsors.map((s) => s.toLowerCase())).size;
    console.log(`   Unique sponsors: ${unique}`);
    console.log(`   Total sponsor mentions: ${allSponsors.length}`);
  } catch (err) {
    console.error("\n❌ Fatal error:", err.message);
    process.exit(1);
  }
})();
