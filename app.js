const form = document.getElementById("analyze-form");
const usernameInput = document.getElementById("username-input");
const compareUsernameInput = document.getElementById("compare-username-input");
const analyzeButton = document.getElementById("analyze-button");
const statusLine = document.getElementById("status-line");
const profileCard = document.getElementById("profile-card");
const summaryOutput = document.getElementById("summary-output");
const scoreboard = document.getElementById("scoreboard");
const comparisonOutput = document.getElementById("comparison-output");
const repoGrid = document.getElementById("repo-grid");
const repoCardTemplate = document.getElementById("repo-card-template");
let currentComparison = null;

const PHRASES = {
  protoss: [
    "theory",
    "research",
    "alignment",
    "architecture",
    "framework",
    "strategic",
    "cognitive",
    "abstraction",
    "evaluation",
    "methodology",
    "taxonomy",
    "safety",
    "invariants",
    "robustness",
  ],
  terran: [
    "api",
    "cli",
    "test",
    "tests",
    "src",
    "main.py",
    "package.json",
    "requirements.txt",
    "build",
    "component",
    "run",
    "examples",
    "lib",
  ],
  zerg: [
    "vision",
    "roadmap",
    "future",
    "prototype",
    "concept",
    "experimental",
    "tbd",
    "placeholder",
    "coming soon",
    "early stage",
  ],
};

const LAYER_COPY = {
  protoss: "Strategic framing, thesis work, research language, manifesto energy.",
  terran: "Executable mechanism, code shape, tests, components, actual moving parts.",
  zerg: "Sketches, placeholders, broad dreams, or prototypes not yet carrying their own weight.",
};

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const username = usernameInput.value.trim();
  const compareUsername = compareUsernameInput.value.trim();
  if (!username) {
    return;
  }
  await runAnalysis(username, compareUsername);
});

async function runAnalysis(username, compareUsername = "") {
  const modeLabel = compareUsername ? `${username} and ${compareUsername}` : username;
  setLoadingState(true, `Pulling public GitHub data for ${modeLabel}...`);
  clearOutputs();

  try {
    const primaryReport = await loadUserReport(username);
    const comparisonReport = compareUsername ? await loadUserReport(compareUsername) : null;
    currentComparison = { primary: primaryReport, secondary: comparisonReport };

    renderProfile(primaryReport.profile, primaryReport);
    renderSummary(primaryReport, comparisonReport);
    renderScoreboard(primaryReport);
    renderUserComparison(primaryReport, comparisonReport);
    renderRepos(primaryReport.repos);

    statusLine.textContent = comparisonReport
      ? `Read complete for ${username} versus ${compareUsername}.`
      : `Read complete for ${username}.`;
  } catch (error) {
    console.error(error);
    currentComparison = null;
    statusLine.textContent = "Analysis failed.";
    summaryOutput.classList.remove("empty");
    summaryOutput.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
  } finally {
    setLoadingState(false);
  }
}

async function loadUserReport(username) {
  const profile = await fetchJson(`https://api.github.com/users/${username}`);
  const repos = await fetchJson(
    `https://api.github.com/users/${username}/repos?per_page=100&sort=updated`,
  );

  if (!Array.isArray(repos) || repos.length === 0) {
    throw new Error(`${username} has no public repos. BWGA needs at least one public project to form a read.`);
  }

  statusLine.textContent = `Inspecting ${repos.length} public repos for ${username}...`;

  const enriched = await Promise.all(
    repos.map(async (repo) => {
      const [tree, readme] = await Promise.all([
        fetchRepoTree(repo.full_name),
        fetchReadme(repo.full_name),
      ]);
      return analyzeRepo(repo, tree, readme);
    }),
  );

  return buildReport(profile, enriched);
}

function setLoadingState(isLoading, message = "Ready.") {
  analyzeButton.disabled = isLoading;
  analyzeButton.textContent = isLoading ? "Thinking..." : "Materialise";
  statusLine.textContent = message;
}

function clearOutputs() {
  currentComparison = null;
  profileCard.className = "profile-card empty";
  profileCard.innerHTML = "<p>Loading profile sketch...</p>";
  summaryOutput.className = "summary-output empty";
  summaryOutput.innerHTML = "<p>Composing synthesis...</p>";
  scoreboard.className = "scoreboard empty";
  scoreboard.innerHTML = "<p>Calculating signal mix...</p>";
  comparisonOutput.className = "comparison-output empty";
  comparisonOutput.innerHTML = "<p>Preparing profile comparison...</p>";
  repoGrid.className = "repo-grid empty";
  repoGrid.innerHTML = "<p>Reading repositories...</p>";
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
    },
  });
  if (!response.ok) {
    throw new Error(`GitHub request failed: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

async function fetchRepoTree(fullName) {
  try {
    const branch = await fetchJson(`https://api.github.com/repos/${fullName}`);
    const tree = await fetchJson(
      `https://api.github.com/repos/${fullName}/git/trees/${branch.default_branch}?recursive=1`,
    );
    return Array.isArray(tree.tree) ? tree.tree : [];
  } catch (_error) {
    return [];
  }
}

async function fetchReadme(fullName) {
  try {
    const payload = await fetchJson(`https://api.github.com/repos/${fullName}/readme`);
    if (!payload.content) {
      return "";
    }
    return decodeBase64(payload.content);
  } catch (_error) {
    return "";
  }
}

function decodeBase64(content) {
  const normalized = content.replace(/\n/g, "");
  return decodeURIComponent(
    Array.prototype.map
      .call(atob(normalized), (char) => `%${char.charCodeAt(0).toString(16).padStart(2, "0")}`)
      .join(""),
  );
}

function analyzeRepo(repo, tree, readme) {
  const paths = tree.map((item) => item.path.toLowerCase());
  const text = [repo.name, repo.description || "", readme].join("\n").toLowerCase();
  const fileCount = tree.filter((item) => item.type === "blob").length;
  const codeFiles = paths.filter((path) => /\.(py|ts|tsx|js|jsx|rs|go|java|mo|cpp|c|rb)$/i.test(path)).length;
  const testFiles = paths.filter((path) => /(^|\/)(test|tests)\b/.test(path)).length;
  const hasReadme = readme.trim().length > 0;
  const hasPackage = paths.some((path) => path.endsWith("package.json"));
  const hasRequirements = paths.some((path) => path.endsWith("requirements.txt"));
  const hasMain = paths.some((path) => /(^|\/)(main\.py|main\.ts|main\.js|app\.py|app\.ts|app\.tsx)$/.test(path));
  const placeholderFiles = tree.filter((item) => item.type === "blob" && item.size <= 1).length;

  const scores = { protoss: 0, terran: 0, zerg: 0 };

  scores.protoss += phraseHits(text, PHRASES.protoss) * 1.4;
  scores.terran += phraseHits(text, PHRASES.terran) * 1.1;
  scores.zerg += phraseHits(text, PHRASES.zerg) * 1.3;

  if (hasReadme) scores.protoss += 1.2;
  if (readme.length > 1800) scores.protoss += 1.8;
  if (/(roadmap|vision|design principles|overview)/i.test(readme)) scores.protoss += 1.6;
  if (/(tests?|quickstart|python api|usage|run the demo|install)/i.test(readme)) scores.terran += 1.8;
  if (/(status\s*\n*\s*prototype|early prototype|tbd|future versions)/i.test(readme)) scores.zerg += 1.8;

  scores.terran += Math.min(codeFiles * 0.45, 5);
  scores.terran += Math.min(testFiles * 1.3, 3.5);
  if (hasPackage) scores.terran += 1.2;
  if (hasRequirements) scores.terran += 1.2;
  if (hasMain) scores.terran += 1.1;

  if (fileCount <= 3) scores.zerg += 2.5;
  if (codeFiles === 0) scores.zerg += 1.4;
  if (placeholderFiles >= 3) scores.zerg += 3.2;
  if (repo.size <= 12) scores.zerg += 2.2;

  if (repo.stargazers_count > 0) scores.terran += 0.6;
  if (repo.forks_count > 0) scores.terran += 0.4;

  const dominantLayer = Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0];
  const usefulness = computeUsefulness(scores, fileCount, codeFiles, testFiles, placeholderFiles);
  const workhorse = computeWorkhorseRating(scores, fileCount, codeFiles, testFiles, placeholderFiles);
  const verdict = buildRepoVerdict(repo, dominantLayer, usefulness, {
    fileCount,
    codeFiles,
    testFiles,
    placeholderFiles,
    workhorse,
  });

  return {
    repo,
    readme,
    tree,
    fileCount,
    codeFiles,
    testFiles,
    placeholderFiles,
    scores,
    dominantLayer,
    usefulness,
    workhorse,
    verdict,
  };
}

function phraseHits(text, phrases) {
  return phrases.reduce((count, phrase) => count + (text.includes(phrase) ? 1 : 0), 0);
}

function computeUsefulness(scores, fileCount, codeFiles, testFiles, placeholderFiles) {
  const raw =
    scores.terran * 1.6 +
    Math.min(fileCount, 25) * 0.06 +
    codeFiles * 0.3 +
    testFiles * 0.7 -
    placeholderFiles * 0.6 -
    scores.zerg * 0.75;
  return clamp(Math.round(raw * 10), 0, 100);
}

function computeWorkhorseRating(scores, fileCount, codeFiles, testFiles, placeholderFiles) {
  const raw =
    codeFiles * 0.55 +
    testFiles * 1.4 +
    Math.min(fileCount, 40) * 0.08 +
    scores.terran * 0.9 -
    scores.zerg * 0.65 -
    placeholderFiles * 0.6;
  const rating = clamp(Math.round(raw / 2.6), 0, 5);
  const labels = [
    "No workhorse signal",
    "Light workhorse",
    "Emerging workhorse",
    "Capable workhorse",
    "Strong workhorse",
    "True workhorse",
  ];
  return {
    value: rating,
    label: labels[rating],
  };
}

function buildRepoVerdict(repo, layer, usefulness, stats) {
  if (layer === "terran" && usefulness >= 65 && stats.workhorse.value >= 3) {
    return "This one has real mechanism. It looks reusable, inspectable, and worth stealing ideas from directly.";
  }
  if (stats.workhorse.value >= 3 && usefulness >= 52) {
    return "This is carrying more work than posture. Even when the framing runs hot, there is enough mechanism here to lean on.";
  }
  if (layer === "protoss" && usefulness >= 45) {
    return "This repo is more thesis than tool, but the thesis is sharp enough to guide a build.";
  }
  if (layer === "zerg") {
    return "This reads like sketch energy: promising as concept art for a system, weak as a software base right now.";
  }
  if (stats.testFiles > 0 || stats.codeFiles > 8) {
    return "There is enough implementation here to matter, even if the framing runs ahead of the finish.";
  }
  return "Interesting signals, but not yet sturdy enough to trust without rebuilding the core yourself.";
}

function buildReport(profile, repos) {
  const totals = repos.reduce(
    (acc, item) => {
      acc.protoss += item.scores.protoss;
      acc.terran += item.scores.terran;
      acc.zerg += item.scores.zerg;
      return acc;
    },
    { protoss: 0, terran: 0, zerg: 0 },
  );

  const sorted = [...repos].sort((a, b) => b.usefulness - a.usefulness);
  const strongest = sorted[0];
  const mostStrategic = [...repos].sort((a, b) => b.scores.protoss - a.scores.protoss)[0];
  const sketchiest = [...repos].sort((a, b) => b.scores.zerg - a.scores.zerg)[0];
  const workhorse = [...repos].sort(
    (a, b) => b.workhorse.value - a.workhorse.value || b.usefulness - a.usefulness,
  )[0];
  const themes = inferThemes(repos, profile);
  const profileType = inferProfileType(repos, totals);
  const confidence = inferConfidence(repos, totals);
  const workhorseRating = inferOverallWorkhorse(repos, workhorse);

  return {
    profile,
    repos: sorted,
    totals,
    strongest,
    mostStrategic,
    sketchiest,
    workhorse,
    themes,
    profileType,
    confidence,
    workhorseRating,
  };
}

function inferOverallWorkhorse(repos, strongestWorkhorse) {
  const durableRepos = repos.filter((item) => item.workhorse.value >= 2).length;
  const sturdyRepos = repos.filter((item) => item.workhorse.value >= 3).length;
  const topScore = strongestWorkhorse?.workhorse?.value || 0;
  const value = clamp(topScore + sturdyRepos - 1 + (durableRepos >= 3 ? 1 : 0), 0, 5);
  const labels = [
    "Mostly conceptual",
    "Light operator",
    "Selective builder",
    "Solid workhorse",
    "Heavy workhorse",
    "Relentless workhorse",
  ];
  return {
    value,
    label: labels[value],
    note:
      value <= 1
        ? "The public surface carries more framing than repeated implementation weight."
        : value <= 3
          ? "There is some genuine mechanism here, but it is concentrated rather than broad."
          : "Multiple repos are carrying enough mechanism that the public surface looks operational, not decorative.",
  };
}

function inferProfileType(repos, totals) {
  const terranAnchors = repos.filter((item) => item.workhorse.value >= 3 || item.usefulness >= 60).length;
  const protossWeight = totals.protoss;
  const terranWeight = totals.terran;
  const zergWeight = totals.zerg;

  if (terranAnchors <= 1 && protossWeight >= terranWeight * 1.12) {
    return "strategist-researcher with a few concrete mechanisms";
  }
  if (terranAnchors >= 3 && terranWeight >= protossWeight * 0.92) {
    return "builder with a real mechanism bench";
  }
  if (zergWeight > terranWeight && terranAnchors === 0) {
    return "concept sprinter whose public repos stay ahead of implementation";
  }
  if (protossWeight > terranWeight) {
    return "strategist leaning toward implementation, but not builder-first";
  }
  return "hybrid operator with both framing and mechanism in public";
}

function inferConfidence(repos, totals) {
  const executableDepth = repos.filter((item) => item.codeFiles >= 6 || item.workhorse.value >= 2).length;
  const totalFiles = repos.reduce((sum, item) => sum + item.fileCount, 0);
  const topGap = repos[0] ? repos[0].usefulness - (repos[1]?.usefulness || 0) : 0;
  const thinSurface = totalFiles < 60 || executableDepth <= 1;

  if (thinSurface && topGap >= 18) {
    return {
      label: "Low confidence",
      note: "One repo is doing most of the evidentiary work, so the synthesis should stay skeptical.",
    };
  }
  if (executableDepth >= 3 && totals.terran + totals.protoss > totals.zerg * 1.6) {
    return {
      label: "High confidence",
      note: "The public repo surface is broad enough that the pattern looks stable rather than accidental.",
    };
  }
  return {
    label: "Medium confidence",
    note: "There is enough public surface to form a read, but a few repos are still carrying more narrative than mechanism.",
  };
}

function inferThemes(repos, profile) {
  const corpus = repos
    .map((item) => `${item.repo.name} ${item.repo.description || ""} ${item.readme}`)
    .join(" ")
    .toLowerCase();

  const themes = [];
  if (/(alignment|safety|adversarial|evaluation|vulnerab)/.test(corpus) || /(safety|adversarial)/.test(profile.bio || "")) {
    themes.push("LLM safety and adversarial failure analysis");
  }
  if (/(abstraction|protoss|terran|zerg|translation|intent)/.test(corpus)) {
    themes.push("instruction abstraction and translation layers for agents");
  }
  if (/(agent|spawn|swarm|distributed|field)/.test(corpus)) {
    themes.push("distributed agent systems and orchestration experiments");
  }
  if (themes.length === 0) {
    themes.push("a loose cluster of experiments without a strong repeated thesis yet");
  }
  return themes;
}

function renderProfile(profile, report) {
  profileCard.className = "profile-card";
  const tags = [];
  if (profile.location) tags.push(profile.location);
  if (profile.public_repos != null) tags.push(`${profile.public_repos} public repos`);
  if (report?.themes?.length) tags.push(report.themes[0]);

  profileCard.innerHTML = `
    <img src="${profile.avatar_url}" alt="${escapeHtml(profile.login)} avatar" />
    <h3>${escapeHtml(profile.name || profile.login)}</h3>
    <p>${escapeHtml(profile.bio || "No public bio.")}</p>
    <div class="tag-row">
      ${tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}
    </div>
  `;
}

function renderSummary(report, comparisonReport = null) {
  summaryOutput.className = "summary-output";
  const strongestMechanism =
    report.strongest && report.strongest.usefulness >= 40
      ? report.strongest.repo.name
      : "none of the repos cleanly";
  const comparisonLine = comparisonReport
    ? `${report.profile.login} versus ${comparisonReport.profile.login} reads less like a repo fight and more like a contrast in public operating style.`
    : null;
  const paragraphs = [
    `${report.profile.login} reads more like ${report.profileType} than a straightforward builder. The dominant public themes are ${report.themes.join(" and ")}.`,
    `Best public mechanism: ${strongestMechanism}. Overall profile type: ${report.profileType}. Confidence: ${report.confidence.label}, because ${report.confidence.note.toLowerCase()}`,
    `The most useful public repo is ${report.strongest.repo.name}, because it carries the highest ratio of executable surface to aspiration. The most thesis-heavy repo is ${report.mostStrategic.repo.name}, which does more worldview-setting than direct shipping.`,
    `Overall workhorse rating: ${report.workhorseRating.value}/5, ${report.workhorseRating.label.toLowerCase()}. The anchor repo for that read is ${report.workhorse.repo.name}.`,
    `The sketchiest surface is ${report.sketchiest.repo.name}. That does not make it worthless; it usually means the repo is acting as a seed crystal for a future system rather than a system you can trust today.`,
    `For BWGA-style tooling, the sweet spot is to borrow framing from the strategic repos, mechanism from the executable ones, and stay alert when a single repo is flattering the whole profile.`,
  ];
  if (comparisonLine) {
    paragraphs.splice(1, 0, comparisonLine);
  }
  summaryOutput.innerHTML = paragraphs.map((text) => `<p>${escapeHtml(text)}</p>`).join("");
}

function renderScoreboard(report) {
  scoreboard.className = "scoreboard";
  scoreboard.innerHTML = ["protoss", "terran", "zerg"]
    .map((layer) => {
      const value = Math.round(report.totals[layer]);
      return `
        <div class="score-pill ${layer}">
          <strong>${layer}</strong>
          <span>${value}</span>
          <small>${escapeHtml(LAYER_COPY[layer])}</small>
        </div>
      `;
    })
    .join("");
}

function renderRepos(repos) {
  repoGrid.className = "repo-grid";
  repoGrid.innerHTML = "";
  repos.forEach((item) => {
    const node = repoCardTemplate.content.firstElementChild.cloneNode(true);
    const link = node.querySelector(".repo-link");
    const badge = node.querySelector(".repo-badge");
    const description = node.querySelector(".repo-description");
    const stats = node.querySelector(".repo-stats");
    const scores = node.querySelector(".repo-scores");
    const verdict = node.querySelector(".repo-verdict");

    link.href = item.repo.html_url;
    link.textContent = item.repo.name;
    badge.textContent = item.dominantLayer;
    badge.classList.add(item.dominantLayer);
    description.textContent = item.repo.description || "No description provided.";
    stats.innerHTML = [
      `${item.repo.language || "Mixed"} language`,
      `${item.fileCount} files`,
      `${item.codeFiles} code files`,
      `${item.testFiles} test files`,
      `${item.usefulness}/100 useful`,
    ]
      .map((text) => `<span class="stat">${escapeHtml(text)}</span>`)
      .join("");
    scores.innerHTML = Object.entries(item.scores)
      .map(
        ([layer, value]) =>
          `<span class="score-chip"><strong>${escapeHtml(layer)}</strong>${Math.round(value)}</span>`,
      )
      .join("");
    verdict.textContent = item.verdict;

    repoGrid.appendChild(node);
  });
}

function renderUserComparison(primaryReport, comparisonReport) {
  if (!comparisonReport) {
    comparisonOutput.className = "comparison-output empty";
    comparisonOutput.innerHTML = "<p>Add a second username to compare two profiles.</p>";
    return;
  }

  comparisonOutput.className = "comparison-output";
  const call = buildUserComparisonCall(primaryReport, comparisonReport);

  comparisonOutput.innerHTML = `
    <div class="comparison-grid">
      ${renderComparisonCard(primaryReport, "Left")}
      ${renderComparisonCard(comparisonReport, "Right")}
    </div>
    <div class="comparison-call">
      <h3>Comparative read</h3>
      <p>${escapeHtml(call)}</p>
    </div>
  `;
}

function renderComparisonCard(report, side) {
  const metrics = [
    `${report.profile.public_repos ?? report.repos.length} public repos`,
    `${report.workhorseRating.value}/5 workhorse`,
    `${report.confidence.label}`,
    `${report.strongest.repo.name} best mechanism`,
    `${report.mostStrategic.repo.name} thesis anchor`,
  ];

  return `
    <article class="comparison-card">
      <h3>${escapeHtml(side)}: ${escapeHtml(report.profile.login)}</h3>
      <p>${escapeHtml(report.profileType)}. ${escapeHtml(report.workhorseRating.note)}</p>
      <div class="comparison-metrics">
        ${metrics.map((metric) => `<span class="stat${metric.includes("workhorse") ? " workhorse" : ""}">${escapeHtml(metric)}</span>`).join("")}
      </div>
      <p>${escapeHtml(`Themes: ${report.themes.join(" and ")}.`)}</p>
    </article>
  `;
}

function buildUserComparisonCall(left, right) {
  const moreMechanical = left.totals.terran >= right.totals.terran ? left : right;
  const moreStrategic = left.totals.protoss >= right.totals.protoss ? left : right;
  const sturdier = left.workhorseRating.value >= right.workhorseRating.value ? left : right;

  return `${moreMechanical.profile.login} shows the stronger public mechanism surface, ${moreStrategic.profile.login} carries more thesis energy, and ${sturdier.profile.login} looks more like the person you would trust to keep shipping when the work stops being glamorous.`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
