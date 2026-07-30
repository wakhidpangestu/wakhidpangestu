// generate-dashboard.mjs
// Fetches this user's public repos, aggregates language bytes across them,
// classifies languages into Frontend / Backend / Mobile / Other, and renders
// two SVG dashboards (dark.svg + light.svg) that auto-switch on GitHub via
// the <picture prefers-color-scheme> trick in README.md.
//
// Run with: GH_USERNAME=wakhidpangestu node scripts/generate-dashboard.mjs
// GITHUB_TOKEN is optional locally but required in Actions (rate limits).

const USERNAME = process.env.GH_USERNAME || "wakhidpangestu";
const TOKEN = process.env.GITHUB_TOKEN || "";

const headers = {
  Accept: "application/vnd.github+json",
  "User-Agent": "profile-readme-dashboard",
  ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
};

// --- language -> category map -------------------------------------------
const CATEGORY_MAP = {
  JavaScript: "Frontend",
  TypeScript: "Frontend",
  HTML: "Frontend",
  CSS: "Frontend",
  SCSS: "Frontend",
  Vue: "Frontend",
  Svelte: "Frontend",
  EJS: "Frontend",

  PHP: "Backend",
  Java: "Backend",
  Python: "Backend",
  Go: "Backend",
  Ruby: "Backend",
  "C#": "Backend",
  Rust: "Backend",
  "PLpgSQL": "Backend",
  SQL: "Backend",

  Dart: "Mobile",
  Swift: "Mobile",
  Kotlin: "Mobile",
  "Objective-C": "Mobile",
};

const CATEGORY_COLOR = {
  Frontend: ["#38bdf8", "#22d3ee"], // blue -> teal gradient
  Backend: ["#818cf8", "#6366f1"], // indigo
  Mobile: ["#34d399", "#10b981"], // emerald
  Other: ["#94a3b8", "#64748b"], // slate
};

async function fetchJSON(url) {
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`GitHub API ${res.status} for ${url}: ${await res.text()}`);
  }
  return res.json();
}

async function getAllRepos(username) {
  let page = 1;
  const repos = [];
  while (true) {
    const batch = await fetchJSON(
      `https://api.github.com/users/${username}/repos?per_page=100&page=${page}&type=owner`
    );
    repos.push(...batch);
    if (batch.length < 100) break;
    page += 1;
  }
  return repos.filter((r) => !r.fork);
}

async function aggregateLanguages(repos) {
  const totals = {};
  for (const repo of repos) {
    try {
      const langs = await fetchJSON(repo.languages_url);
      for (const [lang, bytes] of Object.entries(langs)) {
        totals[lang] = (totals[lang] || 0) + bytes;
      }
    } catch (e) {
      console.warn(`skip ${repo.name}: ${e.message}`);
    }
  }
  return totals;
}

function classify(totals) {
  const categoryTotals = { Frontend: 0, Backend: 0, Mobile: 0, Other: 0 };
  const grandTotal = Object.values(totals).reduce((a, b) => a + b, 0) || 1;

  for (const [lang, bytes] of Object.entries(totals)) {
    const cat = CATEGORY_MAP[lang] || "Other";
    categoryTotals[cat] += bytes;
  }

  const categoryPct = Object.fromEntries(
    Object.entries(categoryTotals).map(([k, v]) => [k, (v / grandTotal) * 100])
  );

  const topLanguages = Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([lang, bytes]) => ({
      lang,
      pct: (bytes / grandTotal) * 100,
      category: CATEGORY_MAP[lang] || "Other",
    }));

  return { categoryPct, topLanguages };
}

function roleLabel(categoryPct) {
  const fe = categoryPct.Frontend;
  const be = categoryPct.Backend;
  const diff = fe - be;
  if (Math.abs(diff) < 15) return "Fullstack Developer";
  return diff > 0 ? "Frontend-leaning Developer" : "Backend-leaning Developer";
}

// --- SVG rendering ---------------------------------------------------------
function bar(x, y, width, height, pct, colors, rx = 6) {
  const filled = Math.max(2, (width * pct) / 100);
  const gradId = `grad-${x}-${y}`;
  return `
    <defs>
      <linearGradient id="${gradId}" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${colors[0]}"/>
        <stop offset="100%" stop-color="${colors[1]}"/>
      </linearGradient>
    </defs>
    <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${rx}" fill="var(--track)"/>
    <rect x="${x}" y="${y}" width="${filled}" height="${height}" rx="${rx}" fill="url(#${gradId})"/>
  `;
}

function renderSVG({ categoryPct, topLanguages }, theme) {
  const isDark = theme === "dark";
  const bg = isDark ? "#07091a" : "#f6f8fc";
  const cardBorder = isDark ? "#1c2140" : "#e2e8f0";
  const text = isDark ? "#e6e9f5" : "#0f172a";
  const subtext = isDark ? "#8b90b0" : "#64748b";
  const track = isDark ? "#151833" : "#e5e9f5";

  const width = 760;
  const rowH = 34;
  const catRows = ["Frontend", "Backend", "Mobile"];
  const langRows = topLanguages;
  const height = 150 + catRows.length * rowH + langRows.length * rowH + 40;

  const role = roleLabel(categoryPct);

  let y = 108;
  let catSVG = "";
  for (const cat of catRows) {
    const pct = categoryPct[cat] || 0;
    catSVG += `
      <text x="40" y="${y - 8}" font-size="13" fill="${text}" font-family="'SF Pro Display','Segoe UI',sans-serif" font-weight="600">${cat}</text>
      <text x="${width - 40}" y="${y - 8}" font-size="13" fill="${subtext}" font-family="'SF Pro Display','Segoe UI',sans-serif" text-anchor="end">${pct.toFixed(1)}%</text>
      ${bar(40, y, width - 80, 10, pct, CATEGORY_COLOR[cat])}
    `;
    y += rowH;
  }

  y += 20;
  let langSVG = `<text x="40" y="${y}" font-size="14" fill="${text}" font-family="'SF Pro Display','Segoe UI',sans-serif" font-weight="700">Top Languages</text>`;
  y += 26;
  for (const row of langRows) {
    const colors = CATEGORY_COLOR[row.category] || CATEGORY_COLOR.Other;
    langSVG += `
      <text x="40" y="${y - 8}" font-size="12" fill="${text}" font-family="'SF Pro Display','Segoe UI',sans-serif">${row.lang}</text>
      <text x="${width - 40}" y="${y - 8}" font-size="12" fill="${subtext}" font-family="'SF Pro Display','Segoe UI',sans-serif" text-anchor="end">${row.pct.toFixed(1)}%</text>
      ${bar(40, y, width - 80, 8, row.pct, colors, 4)}
    `;
    y += rowH;
  }

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <style>
    :root { --track: ${track}; }
  </style>
  <rect x="0" y="0" width="${width}" height="${height}" rx="18" fill="${bg}" stroke="${cardBorder}" stroke-width="1"/>
  <text x="40" y="46" font-size="20" font-weight="700" fill="${text}" font-family="'SF Pro Display','Segoe UI',sans-serif">Tech Stack Dashboard</text>
  <text x="40" y="70" font-size="13" fill="${subtext}" font-family="'SF Pro Display','Segoe UI',sans-serif">Auto-generated from public repositories · classified as ${role}</text>
  ${catSVG}
  ${langSVG}
</svg>`;
}

async function main() {
  let stats;
  if (process.env.SAMPLE === "1") {
    // Fallback data so the dashboard renders even before the first
    // authenticated Actions run (unauthenticated API calls are rate-limited).
    stats = classify({
      TypeScript: 420000,
      JavaScript: 180000,
      CSS: 60000,
      HTML: 30000,
      PHP: 140000,
      Java: 90000,
      Dart: 40000,
    });
  } else {
    console.log(`Fetching repos for ${USERNAME}...`);
    const repos = await getAllRepos(USERNAME);
    console.log(`Found ${repos.length} non-fork repos. Aggregating languages...`);
    const totals = await aggregateLanguages(repos);
    stats = classify(totals);
  }

  const dark = renderSVG(stats, "dark");
  const light = renderSVG(stats, "light");

  const fs = await import("fs");
  fs.mkdirSync("assets", { recursive: true });
  fs.writeFileSync("assets/dashboard-dark.svg", dark);
  fs.writeFileSync("assets/dashboard-light.svg", light);

  console.log("Done. Written assets/dashboard-dark.svg and assets/dashboard-light.svg");
  console.log(JSON.stringify(stats, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
