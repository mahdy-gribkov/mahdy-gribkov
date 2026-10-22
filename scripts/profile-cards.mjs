// Generates the profile's stats + top-languages cards as committed SVGs.
//
// Why this exists: the README previously pulled these cards from a live third-party
// service (github-readme-stats-sigma-five.vercel.app) whose token died, so the cards
// broke after a few months and showed "Something went wrong". This generator renders
// the same information from the GitHub GraphQL API using ONLY the built-in Actions
// GITHUB_TOKEN (no PAT to expire) and writes static SVGs that are committed to the
// repo. The README references those files, so it can never depend on a live service
// at read time again. A failed run is loud in the Actions tab, not a broken image.
//
// Brand: Mahdy personal theme. Accent #d4943a on background #0c0b0e, text #e0c9a6.

import { writeFileSync, mkdirSync } from "node:fs";

const LOGIN = process.env.PROFILE_LOGIN || "medy-gribkov";
const TOKEN = process.env.GITHUB_TOKEN;
if (!TOKEN) {
  console.error("Missing GITHUB_TOKEN. In Actions this is provided automatically; set it locally to preview.");
  process.exit(1);
}

// Brand tokens (single source for both cards).
const C = {
  bg: "#0c0b0e",
  accent: "#d4943a",
  text: "#e0c9a6",
  muted: "#8a7f6f",
  border: "rgba(212,148,58,0.28)",
};
const FONT = "'Segoe UI', Ubuntu, system-ui, sans-serif";

// Markup/data languages that dominate byte counts from templates and vendored files
// and misrepresent the actual stack. Hidden so the card shows real programming langs.
const HIDDEN_LANGS = new Set(["HTML", "CSS", "SCSS", "Less"]);
const LANG_LIMIT = 6;

async function gql(query, variables) {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`GitHub GraphQL ${res.status}: ${await res.text()}`);
  const json = await res.json();
  if (json.errors) throw new Error(`GitHub GraphQL errors: ${JSON.stringify(json.errors)}`);
  return json.data;
}

async function fetchProfile() {
  const data = await gql(
    `query($login:String!){
      user(login:$login){
        followers{ totalCount }
        repositories(first:100, ownerAffiliations:OWNER, isFork:false){
          totalCount
          nodes{
            stargazerCount
            languages(first:10, orderBy:{field:SIZE, direction:DESC}){
              edges{ size node{ name color } }
            }
          }
        }
        contributionsCollection{
          totalCommitContributions
          totalPullRequestContributions
          contributionCalendar{
            weeks{ contributionDays{ contributionCount date } }
          }
        }
      }
    }`,
    { login: LOGIN }
  );
  const u = data.user;
  const repos = u.repositories.nodes;
  const stars = repos.reduce((s, r) => s + r.stargazerCount, 0);

  const bytes = new Map();
  const colors = new Map();
  for (const r of repos) {
    for (const e of r.languages.edges) {
      const name = e.node.name;
      if (HIDDEN_LANGS.has(name)) continue;
      bytes.set(name, (bytes.get(name) || 0) + e.size);
      colors.set(name, e.node.color || C.accent);
    }
  }
  const ranked = [...bytes.entries()].sort((a, b) => b[1] - a[1]).slice(0, LANG_LIMIT);
  const total = ranked.reduce((s, [, v]) => s + v, 0) || 1;
  const languages = ranked.map(([name, size]) => ({
    name,
    color: colors.get(name),
    pct: (100 * size) / total,
  }));

  const weeks = u.contributionsCollection.contributionCalendar.weeks.map((w) =>
    w.contributionDays.map((d) => d.contributionCount)
  );

  return {
    stars,
    repos: u.repositories.totalCount,
    followers: u.followers.totalCount,
    commits: u.contributionsCollection.totalCommitContributions,
    prs: u.contributionsCollection.totalPullRequestContributions,
    languages,
    weeks,
  };
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function statsCard(p) {
  const rows = [
    ["Total stars earned", p.stars],
    ["Commits (past year)", p.commits],
    ["Total PRs", p.prs],
    ["Public repositories", p.repos],
    ["Followers", p.followers],
  ];
  const W = 480;
  const H = 60 + rows.length * 34 + 20;
  const items = rows
    .map(([label, value], i) => {
      const y = 78 + i * 34;
      return `
    <text x="30" y="${y}" fill="${C.text}" font-size="15">${esc(label)}</text>
    <text x="${W - 30}" y="${y}" fill="${C.accent}" font-size="15" font-weight="700" text-anchor="end">${esc(value)}</text>`;
    })
    .join("");
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="GitHub statistics">
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="14" fill="${C.bg}" stroke="${C.border}"/>
  <text x="30" y="42" fill="${C.accent}" font-size="19" font-weight="700" font-family="${FONT}">Mahdy Lorens Gribkov's GitHub Stats</text>
  <g font-family="${FONT}">${items}
  </g>
</svg>`;
}

function langsCard(p) {
  const W = 360;
  const rowH = 30;
  const H = 60 + p.languages.length * rowH + 16;
  const barX = 150;
  const barW = W - barX - 60;
  const rows = p.languages
    .map((l, i) => {
      const y = 70 + i * rowH;
      const w = Math.max(4, (barW * l.pct) / 100);
      return `
    <text x="26" y="${y + 4}" fill="${C.text}" font-size="13">${esc(l.name)}</text>
    <rect x="${barX}" y="${y - 9}" width="${barW}" height="8" rx="4" fill="rgba(224,201,166,0.12)"/>
    <rect x="${barX}" y="${y - 9}" width="${w.toFixed(1)}" height="8" rx="4" fill="${l.color}"/>
    <text x="${W - 24}" y="${y + 4}" fill="${C.muted}" font-size="12" text-anchor="end">${l.pct.toFixed(1)}%</text>`;
    })
    .join("");
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Most used languages">
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="14" fill="${C.bg}" stroke="${C.border}"/>
  <text x="26" y="40" fill="${C.accent}" font-size="17" font-weight="700" font-family="${FONT}">Most Used Languages</text>
  <g font-family="${FONT}">${rows}
  </g>
</svg>`;
}

// Contribution heatmap in the brand's amber intensity ramp (faint to peak), the same
// data GitHub draws natively, rendered on-brand as a committed static SVG.
function graphCard(p) {
  const CELL = 11, GAP = 3, STEP = CELL + GAP;
  const padX = 22, padTop = 46, padBottom = 16;
  const cols = p.weeks.length;
  const W = padX * 2 + cols * STEP - GAP;
  const H = padTop + 7 * STEP - GAP + padBottom;
  const max = Math.max(1, ...p.weeks.flat());
  const ramp = ["rgba(224,201,166,0.10)", "#4d3a18", "#856429", "#bd8b38", "#d4943a"];
  const level = (c) => (c === 0 ? 0 : Math.min(4, 1 + Math.floor(((c / max) * 3.999))));
  let cells = "";
  p.weeks.forEach((week, x) => {
    week.forEach((count, y) => {
      cells += `<rect x="${padX + x * STEP}" y="${padTop + y * STEP}" width="${CELL}" height="${CELL}" rx="2" fill="${ramp[level(count)]}"/>`;
    });
  });
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Contribution graph">
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="14" fill="${C.bg}" stroke="${C.border}"/>
  <text x="${padX}" y="30" fill="${C.accent}" font-size="17" font-weight="700" font-family="${FONT}">Contribution Graph</text>
  ${cells}
</svg>`;
}

// --- Cross-account activity -----------------------------------------------------
// GitHub credits each commit to the ONE account whose verified email authored it, and
// there is no native way to merge accounts' graphs. So this card counts the REAL
// cross-account activity from actual commits (search/commits, default branch,
// graph-independent), summed by AUTHOR EMAIL across the tokens for the accounts I
// control. The employer account (Cyvore) is never tokened: only its PUBLIC contribution
// total is read. Commits and public contributions are labeled distinctly, never merged
// into one figure. The numbers are whatever is true each run, never hardcoded.
const ACTIVITY_YEAR = Number(process.env.ACTIVITY_YEAR) || new Date().getUTCFullYear();
const ACTIVITY_FROM = `${ACTIVITY_YEAR}-01-01`;
const ACTIVITY_TO = `${ACTIVITY_YEAR}-12-31`;

// My authoring emails, grouped by the account label shown on the card.
const OWN_AUTHOR_EMAILS = [
  { label: "SporeSec", email: "sporesec@gmail.com" },
  { label: "Personal", email: "mahdy34552@gmail.com" },
  { label: "Personal", email: "101642367+medy-gribkov@users.noreply.github.com" },
  // The old address authored the deploy account's commits; that account was deleted 2026-10-21, its commits still count.
  { label: "Old address", email: "medygribkov@gmail.com" },
];

// Tokens for accounts I control, used only to COUNT my own commits (private included).
// Absent ones are skipped. Never a Cyvore token. No deploy-account token: that account was deleted 2026-10-21.
const SEARCH_TOKENS = [TOKEN, process.env.PAT_MEDY, process.env.PAT_SPORESEC]
  .filter(Boolean)
  .filter((t, i, arr) => arr.indexOf(t) === i);

// Employer account: PUBLIC contribution total only, never tokened, nothing written to it.
const CYVORE_LOGIN = process.env.CYVORE_LOGIN || "medyg-cyvore";

async function searchCommitCount(email, token) {
  const q = `author-email:${email} author-date:${ACTIVITY_FROM}..${ACTIVITY_TO}`;
  const res = await fetch(`https://api.github.com/search/commits?q=${encodeURIComponent(q)}&per_page=1`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
  });
  if (!res.ok) throw new Error(`GitHub search/commits ${res.status} for ${email}: ${await res.text()}`);
  return (await res.json()).total_count ?? 0;
}

async function fetchActivity() {
  // Count each email under every available token and take the max: one author email is
  // one commit, so this never double-counts, and the broadest-coverage token wins. It is
  // conservative (an email split across tokens may slightly under-count, never over).
  const perLabel = new Map();
  for (const { label, email } of OWN_AUTHOR_EMAILS) {
    let best = 0;
    for (const token of SEARCH_TOKENS) {
      try {
        best = Math.max(best, await searchCommitCount(email, token));
      } catch (err) {
        console.error(`  warn: count failed for ${email}: ${err.message}`);
      }
    }
    perLabel.set(label, (perLabel.get(label) || 0) + best);
  }
  const ownTotal = [...perLabel.values()].reduce((sum, n) => sum + n, 0);

  // Cyvore PUBLIC contribution total. Any token reads a public profile; this creates no
  // Cyvore credential and touches nothing on Cyvore.
  let cyvore = 0;
  try {
    const data = await gql(
      `query($l:String!){ user(login:$l){ contributionsCollection(from:"${ACTIVITY_FROM}T00:00:00Z", to:"${ACTIVITY_TO}T23:59:59Z"){ contributionCalendar{ totalContributions } } } }`,
      { l: CYVORE_LOGIN }
    );
    cyvore = data.user?.contributionsCollection?.contributionCalendar?.totalContributions ?? 0;
  } catch (err) {
    console.error(`  warn: Cyvore public read failed: ${err.message}`);
  }

  return { year: ACTIVITY_YEAR, perLabel, ownTotal, cyvore };
}

function activityCard(a) {
  const rows = [...a.perLabel.entries()]
    .filter(([, n]) => n > 0)
    .sort((x, y) => y[1] - x[1])
    .map(([label, n]) => [`${label} commits`, n]);
  rows.push(["Cyvore (public contributions)", a.cyvore]);

  const W = 480;
  const rowStart = 118;
  const H = rowStart + rows.length * 34 + 28;
  const num = (v) => v.toLocaleString("en-US");
  const items = rows
    .map(([label, value], i) => {
      const y = rowStart + i * 34;
      return `
    <text x="30" y="${y}" fill="${C.text}" font-size="15">${esc(label)}</text>
    <text x="${W - 30}" y="${y}" fill="${C.accent}" font-size="15" font-weight="700" text-anchor="end">${esc(num(value))}</text>`;
    })
    .join("");
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Activity across all my GitHub accounts">
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="14" fill="${C.bg}" stroke="${C.border}"/>
  <text x="30" y="40" fill="${C.accent}" font-size="19" font-weight="700" font-family="${FONT}">Activity Across All My Accounts</text>
  <text x="30" y="80" fill="${C.text}" font-size="30" font-weight="700" font-family="${FONT}">${esc(num(a.ownTotal))}<tspan font-size="15" font-weight="400" fill="${C.muted}"> commits in ${a.year}</tspan></text>
  <g font-family="${FONT}">${items}
  </g>
  <text x="30" y="${H - 12}" fill="${C.muted}" font-size="11" font-family="${FONT}">Real commits summed by author email across my SporeSec and personal accounts and my old address. Cyvore shown as its public contribution count.</text>
</svg>`;
}

const p = await fetchProfile();
const a = await fetchActivity();
mkdirSync("dist", { recursive: true });
writeFileSync("dist/github-stats.svg", statsCard(p));
writeFileSync("dist/github-langs.svg", langsCard(p));
writeFileSync("dist/github-graph.svg", graphCard(p));
writeFileSync("dist/github-activity.svg", activityCard(a));
console.log("Wrote dist/github-stats.svg, dist/github-langs.svg, dist/github-graph.svg, dist/github-activity.svg");
console.log(`stars=${p.stars} commits=${p.commits} prs=${p.prs} repos=${p.repos} followers=${p.followers}`);
console.log("langs:", p.languages.map((l) => `${l.name} ${l.pct.toFixed(1)}%`).join(", "));
console.log(`activity ${a.year}: own commits=${a.ownTotal} (${[...a.perLabel].map(([k, v]) => `${k}=${v}`).join(", ")}), cyvore public=${a.cyvore}`);
