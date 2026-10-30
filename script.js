// =====================================================================
// MN CAF 2026 site
// =====================================================================

const DATA_FILE = "Data/CAF Action Steps - CAF Action Steps.csv";

// One color per goal, in the order the goals first appear in the CSV.
// Each color is used for the goal's tab, treemap tile, and card tints.
// Keep them dark enough for white text (the tab and tile text is white).

const GOAL_COLORS = [
  "#332288", // 1st goal in the file
  "#117733", // 2nd
  "#44AA99", // 3rd
  "#1E87BB", // 4th
  "#EA9927", // 5th
  "#CC6677", // 6th
  "#882255", // 7th
];

// Shown in the tooltip when hovering a treemap tile.
// Same order as the goals (goal 1 first, goal 7 last).
const GOAL_DESCRIPTIONS = [
  "Connect and serve all people through a safe, equitable, and sustainable transportation system.",
  "Manage landscapes to absorb and store more carbon, reduce emissions, and sustain healthy and resilient lands and waters.",
  "Ensure all Minnesota communities are prepared for, can respond to, and can recover from present and future climate impacts, including extreme weather.",
  "Implement Minnesota’s 100% carbon-free electricity by 2040 law and set a course for long-term, sustainable use of clean energy in the state.",
  "Protect health and advance equity in a changing climate.",
  "Build a thriving carbon-neutral economy that produces goods and services with environmental benefits and equitably provides family-sustaining job opportunities.",
  "Build and maintain healthy, comfortable, safe, efficient, and resilient buildings and homes that cost less to operate, pollute very little, and support grid stability."
];

// The two tags on each action step. "column" is the CSV column (1 = tagged, 0 = not).
// "help" is the hover text on the matching filter pill. Tag colors are set in style.css.
const TAGS = {
  adaptation: {
    column: "Adaptation",
    label: "Adaptation",
    help: "Adaptation: Taking action to prepare for and adjust to both the current and projected impacts from climate change. For both natural and built systems, humans may intervene to help adjustment."
  },
  mitigation: {
    column: "Mitigation",
    label: "Mitigation",
    help: "Mitigation: A human intervention to reduce emissions or enhance the removal of a greenhouse gas from the atmosphere"
  }
};

// ---------- State ----------

const state = {
  view: "home",          // "home" or "goal-1" ... "goal-7"
  query: "",             // lowercase search text (empty when no active search)
  display: "",           // search text as typed, for showing back to the user
  filter: "all",         // "all", "adaptation", or "mitigation"
  showResults: false,    // true while the results view should be on screen
  pendingTarget: null,   // element id to scroll to after a result is clicked
  expandedGroups: new Set()
};

let goals = [];
let searchIndex = [];
let lastShown = null;

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------- Load the data ----------

d3.csv(DATA_FILE).then(data => {
  checkTagColumns(data);
  goals = buildGoals(data);
  buildNav();
  buildGoalViews();
  applyFilterToPanels();
  buildSearchIndex();
  setupSearch();
  watchTreemap();
  window.addEventListener("hashchange", () => {
    state.showResults = false;
    renderView();
  });
  renderView();
}).catch(showLoadError);

function showNotice(message) {
  document.querySelector(".main").prepend(el("div", "banner error", message));
}

function showLoadError(err) {
  console.error(err);
  showNotice(`Couldn't load "${DATA_FILE}". Check that the file name matches exactly and that the page is open through Live Server.`);
  const loading = document.querySelector(".loading");
  if (loading) loading.remove();
}

function checkTagColumns(data) {
  const missing = Object.values(TAGS).map(t => t.column).filter(c => !data.columns.includes(c));
  if (missing.length) {
    showNotice(`The data file has no "${missing.join('" or "')}" column, so those tags and the filter won't work. Check the column names.`);
  }
}

// ---------- Small helpers ----------

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// A span whose text can be highlighted by the search (keeps the original in data-text)
function label(text) {
  const span = el("span", "label", text);
  span.dataset.text = text;
  return span;
}

function plural(n, one, many) {
  return n === 1 ? one : (many || one + "s");
}

function isOne(value) {
  return String(value == null ? "" : value).trim() === "1";
}

// The summary line under each goal title. When a filter is on, it says so at the end.
function metaText(nInit, nSub, nSteps) {
  const base = `${nInit} ${plural(nInit, "initiative")}, ${nSub} ${plural(nSub, "sub-initiative")}, ${nSteps} action ${plural(nSteps, "step")}`;
  return state.filter === "all" ? base : `${base}, within ${TAGS[state.filter].label} filter`;
}

// The little Adaptation / Mitigation pills for an item that has adaptation and mitigation flags
function makeTags(item) {
  const wrap = el("span", "tags");
  Object.keys(TAGS).forEach(key => {
    if (item[key]) {
      wrap.append(el("span", "tag tag-" + key, TAGS[key].label));
    }
  });
  return wrap;
}

// ---------- Turn the flat CSV into goals > initiatives > sub-initiatives > steps ----------

// Compares text the way people count: "7.1.1.2" comes before "7.1.1.10"
function naturalCompare(a, b) {
  return String(a || "").localeCompare(String(b || ""), undefined, { numeric: true });
}

function buildGoals(rawData) {
  // Goals keep the order they appear in the CSV (that order also sets their colors).
  // Within each goal, initiatives, sub-initiatives and action steps are put in number order,
  // so the site shows them correctly even if the CSV was sorted as text.
  const goalOrder = new Map();
  rawData.forEach(d => {
    if (!goalOrder.has(d["Goal Full"])) goalOrder.set(d["Goal Full"], goalOrder.size);
  });
  const data = rawData.slice().sort((a, b) =>
    goalOrder.get(a["Goal Full"]) - goalOrder.get(b["Goal Full"])
    || naturalCompare(a["Initiative Full"], b["Initiative Full"])
    || naturalCompare(a["Sub-Initiative Full"], b["Sub-Initiative Full"])
    || naturalCompare(a["Action Step Full"], b["Action Step Full"])
  );

  return Array.from(d3.group(data, d => d["Goal Full"]), ([goalFull, goalRows], i) => ({
    index: i,
    id: "goal-" + (i + 1),
    key: "g" + i,
    full: goalFull,
    short: goalRows[0]["Goal Short Name"],
    color: GOAL_COLORS[i % GOAL_COLORS.length],
    description: GOAL_DESCRIPTIONS[i] || "",
    count: goalRows.length,
    initiatives: Array.from(d3.group(goalRows, d => d["Initiative Full"]), ([initFull, initRows], j) => ({
      key: `g${i}-i${j}`,
      full: initFull,
      count: initRows.length,
      subs: Array.from(d3.group(initRows, d => d["Sub-Initiative Full"]), ([subFull, subRows], k) => ({
        key: `g${i}-i${j}-s${k}`,
        full: subFull,
        steps: subRows.map((row, m) => {
          const step = { key: `g${i}-i${j}-s${k}-a${m}`, text: row["Action Step Full"] };
          Object.keys(TAGS).forEach(tagKey => { step[tagKey] = isOne(row[TAGS[tagKey].column]); });
          return step;
        })
      }))
    }))
  }));
}

// ---------- Left tabs ----------

function buildNav() {
  const nav = document.getElementById("nav");
  const items = [{ id: "home", label: "Home", color: null }].concat(
    goals.map(g => ({ id: g.id, label: g.full, color: g.color }))
  );

  items.forEach(item => {
    const btn = el("button", "nav-item");
    btn.type = "button";
    btn.id = "tab-" + item.id;
    btn.dataset.view = item.id;
    btn.setAttribute("role", "tab");
    btn.setAttribute("aria-controls", "view-" + item.id);
    if (item.color) btn.style.setProperty("--goal", item.color);

    btn.append(el("span", "chip"), el("span", "nav-label", item.label));
    const badge = el("span", "nav-badge");
    badge.hidden = true;
    btn.append(badge);

    btn.addEventListener("click", () => {
      state.showResults = false;
      goTo(item.id);
    });
    nav.append(btn);
  });

  nav.addEventListener("keydown", onNavKeydown);
}

function onNavKeydown(e) {
  const tabs = Array.from(document.querySelectorAll(".nav-item"));
  const i = tabs.indexOf(document.activeElement);
  if (i === -1) return;

  let next = null;
  if (e.key === "ArrowDown" || e.key === "ArrowRight") next = tabs[(i + 1) % tabs.length];
  else if (e.key === "ArrowUp" || e.key === "ArrowLeft") next = tabs[(i - 1 + tabs.length) % tabs.length];
  else if (e.key === "Home") next = tabs[0];
  else if (e.key === "End") next = tabs[tabs.length - 1];

  if (next) {
    e.preventDefault();
    next.focus();
    next.click();
  }
}

// ---------- Routing (the tab lives in the URL: #home, #goal-3, ...) ----------

function currentViewId() {
  const hash = location.hash.slice(1);
  return (hash === "home" || goals.some(g => g.id === hash)) ? hash : "home";
}

function goTo(id) {
  if (location.hash.slice(1) === id) renderView();
  else location.hash = id;
}

// ---------- Home treemap ----------

function drawTreemap() {
  const host = document.getElementById("treemap");
  const w = host.clientWidth;
  const h = host.clientHeight;
  if (!w || !h || !goals.length) return;

  const root = d3.hierarchy({ children: goals.map(g => ({ goal: g, value: g.count })) })
    .sum(d => d.value)
    .sort((a, b) => b.value - a.value);

  d3.treemap().size([w, h]).paddingInner(4).round(true)(root);

  hideTooltip();
  host.replaceChildren();
  root.leaves().forEach(leaf => {
    const g = leaf.data.goal;
    const tile = el("button", "tile");
    tile.type = "button";
    tile.style.setProperty("--goal", g.color);
    tile.style.left = (leaf.x0 / w * 100) + "%";
    tile.style.top = (leaf.y0 / h * 100) + "%";
    tile.style.width = ((leaf.x1 - leaf.x0) / w * 100) + "%";
    tile.style.height = ((leaf.y1 - leaf.y0) / h * 100) + "%";
    tile.setAttribute("aria-label",
      `${g.full}. ${g.description} ${g.count} action ${plural(g.count, "step")}.`);
    tile.append(
      el("span", "tile-name", g.short),
      el("span", "tile-count", `${g.count} action ${plural(g.count, "step")}`)
    );
    tile.addEventListener("click", () => {
      hideTooltip();
      state.showResults = false;
      goTo(g.id);
    });

    // Tooltip: follows the pointer on hover, sits beside the tile on keyboard focus
    tile.addEventListener("mouseenter", e => showTooltip(g, e.clientX, e.clientY));
    tile.addEventListener("mousemove", e => showTooltip(g, e.clientX, e.clientY));
    tile.addEventListener("mouseleave", hideTooltip);
    tile.addEventListener("focus", () => {
      const rect = tile.getBoundingClientRect();
      showTooltip(g, rect.left + 12, rect.top + rect.height / 2);
    });
    tile.addEventListener("blur", hideTooltip);

    host.append(tile);
  });
}

// ---------- Treemap tooltip ----------

function showTooltip(g, x, y) {
  const tip = document.getElementById("tooltip");
  if (tip.dataset.goal !== g.id) {
    tip.replaceChildren(el("strong", null, g.full), el("span", null, g.description));
    tip.style.setProperty("--goal", g.color);
    tip.dataset.goal = g.id;
  }
  tip.hidden = false;

  // Place it just below and right of the pointer, flipping if it would leave the screen
  const margin = 8;
  const w = tip.offsetWidth;
  const h = tip.offsetHeight;
  let left = x + 16;
  let top = y + 18;
  if (left + w > window.innerWidth - margin) left = Math.max(margin, x - w - 16);
  if (top + h > window.innerHeight - margin) top = Math.max(margin, y - h - 14);
  tip.style.left = left + "px";
  tip.style.top = top + "px";
}

function hideTooltip() {
  const tip = document.getElementById("tooltip");
  tip.hidden = true;
  delete tip.dataset.goal;
}

// Redraw when the treemap's size changes (window resize, or it becomes visible)
function watchTreemap() {
  const host = document.getElementById("treemap");
  let lastW = 0;
  let lastH = 0;
  new ResizeObserver(() => {
    if (host.clientWidth !== lastW || host.clientHeight !== lastH) {
      lastW = host.clientWidth;
      lastH = host.clientHeight;
      drawTreemap();
    }
  }).observe(host);
}

// ---------- Goal panels: initiative cards > sub-initiative rows > action steps ----------

function buildGoalViews() {
  const host = document.getElementById("goal-views");

  goals.forEach(g => {
    const section = el("section", "view goal-view");
    section.id = "view-" + g.id;
    section.hidden = true;
    section.setAttribute("role", "tabpanel");
    section.setAttribute("aria-labelledby", "tab-" + g.id);
    section.style.setProperty("--goal", g.color);

    // Heading
    const head = el("header", "goal-head");
    const h2 = el("h2");
    h2.id = g.key;
    h2.append(label(g.full));
    const nSub = d3.sum(g.initiatives, init => init.subs.length);
    head.append(h2, el("p", "goal-meta", metaText(g.initiatives.length, nSub, g.count)));
    section.append(head);

    // Expand / collapse buttons
    const toolbar = el("div", "toolbar");
    const expand = el("button", "btn", "Expand all");
    const collapse = el("button", "btn", "Collapse all");
    expand.type = "button";
    collapse.type = "button";
    expand.addEventListener("click", () => section.querySelectorAll("details").forEach(d => { d.open = true; }));
    collapse.addEventListener("click", () => section.querySelectorAll("details").forEach(d => { d.open = false; }));
    toolbar.append(expand, collapse);
    section.append(toolbar);

    // Initiative cards
    g.initiatives.forEach(init => {
      const card = el("details", "card");
      const summary = el("summary");
      summary.id = init.key;
      summary.append(label(init.full), el("span", "count", `${init.count} ${plural(init.count, "step")}`));
      card.append(summary);

      // Sub-initiative rows (separated by dividers, not nested boxes)
      init.subs.forEach(sub => {
        const row = el("details", "sub");
        const rowSummary = el("summary");
        rowSummary.id = sub.key;
        rowSummary.append(label(sub.full), el("span", "count", `${sub.steps.length} ${plural(sub.steps.length, "step")}`));
        row.append(rowSummary);

        // Action steps: a table-like list, each row with its Adaptation / Mitigation tags
        const list = el("ul", "steps");
        sub.steps.forEach(step => {
          const li = el("li");
          li.id = step.key;
          li.dataset.tags = Object.keys(TAGS).filter(k => step[k]).join(" ");

          const text = el("span", "step-text", step.text);
          text.dataset.text = step.text;
          li.append(text, makeTags(step));
          list.append(li);
        });
        row.append(list);
        card.append(row);
      });

      section.append(card);
    });

    host.append(section);
  });
}

// ---------- Filter: Adaptation / Mitigation ----------

function isSearching() {
  return state.query !== "" || state.filter !== "all";
}

// Show only the action steps that pass the filter. Rows and cards left empty are hidden,
// the step counts are updated, and the row striping is redone for the visible rows.
function applyFilterToPanels() {
  goals.forEach(g => {
    const panel = document.getElementById("view-" + g.id);
    let nInit = 0;
    let nSub = 0;
    let nSteps = 0;

    panel.querySelectorAll(".card").forEach(card => {
      let cardSteps = 0;
      let cardSubs = 0;

      card.querySelectorAll(":scope > .sub").forEach(row => {
        let rowSteps = 0;

        row.querySelectorAll(":scope > .steps > li").forEach(li => {
          const tags = (li.dataset.tags || "").split(" ");
          const show = state.filter === "all" || tags.includes(state.filter);
          li.hidden = !show;
          li.classList.remove("first", "alt");
          if (show) {
            if (rowSteps === 0) li.classList.add("first");
            if (rowSteps % 2 === 1) li.classList.add("alt");
            rowSteps++;
          }
        });

        row.hidden = rowSteps === 0;
        row.querySelector(":scope > summary > .count").textContent = `${rowSteps} ${plural(rowSteps, "step")}`;
        if (rowSteps > 0) {
          cardSubs++;
          cardSteps += rowSteps;
        }
      });

      card.hidden = cardSteps === 0;
      card.querySelector(":scope > summary > .count").textContent = `${cardSteps} ${plural(cardSteps, "step")}`;
      if (cardSteps > 0) {
        nInit++;
        nSub += cardSubs;
        nSteps += cardSteps;
      }
    });

    panel.querySelector(".goal-meta").textContent = metaText(nInit, nSub, nSteps);
  });
}

// ---------- Search ----------

// One entry for every searchable piece of text
function buildSearchIndex() {
  searchIndex = [];
  goals.forEach((g, gi) => {
    searchIndex.push({ goal: gi, key: g.key, type: "goal", text: g.full, where: "Goal" });
    g.initiatives.forEach(init => {
      searchIndex.push({ goal: gi, key: init.key, type: "initiative", text: init.full, where: "Initiative" });
      init.subs.forEach(sub => {
        searchIndex.push({ goal: gi, key: sub.key, type: "sub", text: sub.full, where: "Sub-initiative in " + init.full });
        sub.steps.forEach(step => {
          const item = { goal: gi, key: step.key, type: "step", text: step.text, where: "Action step in " + sub.full };
          Object.keys(TAGS).forEach(k => { item[k] = step[k]; });
          searchIndex.push(item);
        });
      });
    });
  });
  searchIndex.forEach(item => { item.lower = item.text.toLowerCase(); });
}

// Everything that matches the typed text and the filter.
// With a filter on, only action steps are listed (headings don't carry tags).
function currentHits() {
  const q = state.query;
  return searchIndex.filter(item => {
    if (state.filter !== "all" && !(item.type === "step" && item[state.filter])) return false;
    return !q || item.lower.includes(q);
  });
}

function setupSearch() {
  const input = document.getElementById("search");
  input.addEventListener("input", onSearchChange);
  input.addEventListener("keydown", e => {
    if (e.key === "Escape") clearSearch();
  });
  document.querySelectorAll('input[name="filter"]').forEach(radio => {
    radio.addEventListener("change", onSearchChange);
  });

  // Hovering (or tabbing to) a filter pill shows what Adaptation / Mitigation mean, instantly
  Object.keys(TAGS).forEach(key => {
    const pill = document.querySelector(".seg-" + key);
    if (!pill) return;
    const input = pill.querySelector("input");
    input.setAttribute("aria-description", TAGS[key].help);
    pill.addEventListener("mouseenter", () => showPillTip(pill, key));
    pill.addEventListener("mouseleave", hideTooltip);
    input.addEventListener("focus", () => showPillTip(pill, key));
    input.addEventListener("blur", hideTooltip);
  });
}

// Shows the shared tooltip just below a filter pill
function showPillTip(pill, key) {
  const tip = document.getElementById("tooltip");
  const tag = TAGS[key];
  tip.replaceChildren(
    el("strong", null, tag.label),
    el("span", null, tag.help.replace(/^[^:]+:\s*/, ""))
  );
  // A lightened version of the tag color, so the accent bar shows up on the dark tooltip
  tip.style.setProperty("--goal", `color-mix(in srgb, var(--${key}) 55%, #fff)`);
  tip.dataset.goal = "pill-" + key;
  tip.hidden = false;

  const rect = pill.getBoundingClientRect();
  const margin = 8;
  const w = tip.offsetWidth;
  const h = tip.offsetHeight;
  const left = Math.min(Math.max(margin, rect.left), window.innerWidth - w - margin);
  let top = rect.bottom + 8;
  if (top + h > window.innerHeight - margin) top = Math.max(margin, rect.top - h - 8);
  tip.style.left = left + "px";
  tip.style.top = top + "px";
}

function selectedFilter() {
  const checked = document.querySelector('input[name="filter"]:checked');
  return checked ? checked.value : "all";
}

function onSearchChange() {
  const typed = document.getElementById("search").value.trim();
  state.display = typed;
  state.query = typed.length >= 2 ? typed.toLowerCase() : "";
  state.filter = selectedFilter();
  state.showResults = isSearching();
  state.expandedGroups.clear();
  applyFilterToPanels();
  applyHighlights();
  renderView();
}

function clearSearch() {
  document.getElementById("search").value = "";
  document.querySelector('input[name="filter"][value="all"]').checked = true;
  onSearchChange();
}

// Wrap each occurrence of the query in <mark>. Works from the saved original text,
// so highlights never pile up as you type.
function highlight(node, query) {
  const text = node.dataset.text;
  node.textContent = "";
  if (!query) {
    node.textContent = text;
    return;
  }
  const lower = text.toLowerCase();
  let pos = 0;
  let idx;
  while ((idx = lower.indexOf(query, pos)) !== -1) {
    node.append(text.slice(pos, idx));
    const mark = document.createElement("mark");
    mark.textContent = text.slice(idx, idx + query.length);
    node.append(mark);
    pos = idx + query.length;
  }
  node.append(text.slice(pos));
}

// Highlight in every goal panel, and open only the sections that contain a visible match
function applyHighlights() {
  const q = state.query;

  document.querySelectorAll(".goal-view [data-text]").forEach(node => highlight(node, q));

  document.querySelectorAll(".goal-view details").forEach(d => {
    if (!q) {
      d.open = false;
      return;
    }
    const own = d.querySelector(":scope > summary > [data-text]");
    const matchBelow = Array.from(d.querySelectorAll("[data-text]"))
      .some(node => node !== own
        && !node.closest("li[hidden], details[hidden]")
        && node.dataset.text.toLowerCase().includes(q));
    d.open = matchBelow;
  });
}

// ---------- Drawing the current view ----------

function renderView() {
  if (!goals.length) return;

  state.view = currentViewId();
  const hits = isSearching() ? currentHits() : [];
  const showingResults = isSearching() && state.showResults;

  document.getElementById("view-results").hidden = !showingResults;
  document.getElementById("view-home").hidden = showingResults || state.view !== "home";
  goals.forEach(g => {
    document.getElementById("view-" + g.id).hidden = showingResults || state.view !== g.id;
  });

  updateNav(hits, showingResults);
  updateBanner(hits, showingResults);
  if (showingResults) renderResults(hits);

  const shown = showingResults ? "results" : state.view;
  if (shown !== lastShown) {
    window.scrollTo(0, 0);
    lastShown = shown;
  }
  if (shown === "home") drawTreemap();

  scrollToPendingTarget();
}

function updateNav(hits, showingResults) {
  const counts = new Map();
  hits.forEach(h => counts.set(h.goal, (counts.get(h.goal) || 0) + 1));

  document.querySelectorAll(".nav-item").forEach(btn => {
    const id = btn.dataset.view;
    btn.setAttribute("aria-selected", String(!showingResults && id === state.view));
    btn.tabIndex = id === state.view ? 0 : -1;

    const badge = btn.querySelector(".nav-badge");
    const gi = goals.findIndex(g => g.id === id);
    const n = gi >= 0 ? (counts.get(gi) || 0) : 0;
    badge.hidden = !(isSearching() && n > 0);
    badge.textContent = n;
    badge.title = `${n} ${plural(n, "match", "matches")}`;
  });
}

// "12 matches for “transit”", "187 Adaptation action steps", or both combined
function summarize(n) {
  const filterName = state.filter === "all" ? "" : TAGS[state.filter].label;
  if (state.query) {
    const base = n === 0
      ? `No matches for “${state.display}”`
      : `${n} ${plural(n, "match", "matches")} for “${state.display}”`;
    return filterName ? `${base} among ${filterName} action steps` : base;
  }
  return `${n} ${filterName} action ${plural(n, "step")}`;
}

function updateBanner(hits, showingResults) {
  const banner = document.getElementById("search-banner");
  banner.replaceChildren();

  // No banner on the results view itself, or on Home (the goal pages are where it helps)
  if (!isSearching() || showingResults || state.view === "home") {
    banner.hidden = true;
    return;
  }

  banner.hidden = false;
  const back = el("button", "btn", "Back to results");
  const clear = el("button", "btn", "Clear search");
  back.type = "button";
  clear.type = "button";
  back.addEventListener("click", () => {
    state.showResults = true;
    renderView();
  });
  clear.addEventListener("click", clearSearch);

  let message;
  if (state.filter !== "all") {
    const n = hits.length;
    const matching = state.query ? ` matching “${state.display}”` : "";
    const how = state.query ? "highlighted" : "shown";
    message = `Results filtered to ${n} ${TAGS[state.filter].label} action ${plural(n, "step")}${matching}, ${how} in each goal.`;
  } else {
    message = `${summarize(hits.length)}, highlighted in each goal.`;
  }
  banner.append(el("span", "banner-text", message), back, clear);
}

// ---------- Search results view ----------

const HITS_PER_GROUP = 20;

function renderResults(hits) {
  const host = document.getElementById("view-results");
  host.replaceChildren();

  host.append(el("h2", "results-title", summarize(hits.length)));

  if (hits.length === 0) {
    host.append(el("p", "muted", "Try a shorter word, check the spelling, or change the filter."));
    return;
  }

  goals.forEach((g, gi) => {
    const group = hits.filter(h => h.goal === gi);
    if (!group.length) return;

    const section = el("section", "hit-group");
    section.style.setProperty("--goal", g.color);

    const h3 = el("h3");
    h3.append(
      el("span", "chip"),
      el("span", "label", g.full),
      el("span", "count", `${group.length} ${plural(group.length, "match", "matches")}`)
    );
    section.append(h3);

    const limit = state.expandedGroups.has(gi) ? group.length : HITS_PER_GROUP;
    group.slice(0, limit).forEach(hit => {
      const btn = el("button", "hit");
      btn.type = "button";
      const text = el("span", "hit-text");
      text.dataset.text = hit.text;
      highlight(text, state.query);
      btn.append(el("span", "hit-where", hit.where), text);
      if (hit.type === "step") btn.append(makeTags(hit));
      btn.addEventListener("click", () => openHit(hit));
      section.append(btn);
    });

    if (group.length > limit) {
      const more = el("button", "btn", `Show all ${group.length} matches`);
      more.type = "button";
      more.addEventListener("click", () => {
        state.expandedGroups.add(gi);
        renderView();
      });
      section.append(more);
    }

    host.append(section);
  });
}

// Clicking a result: go to that goal's tab, open the right section, scroll to it
function openHit(hit) {
  state.showResults = false;
  state.pendingTarget = hit.key;
  goTo(goals[hit.goal].id);
}

function scrollToPendingTarget() {
  if (!state.pendingTarget) return;
  const target = document.getElementById(state.pendingTarget);
  state.pendingTarget = null;
  if (!target) return;

  // Open every section that contains the target (but not the target itself)
  const holder = target.tagName === "SUMMARY" ? target.parentElement : target;
  let parent = holder.parentElement.closest("details");
  while (parent) {
    parent.open = true;
    parent = parent.parentElement.closest("details");
  }

  target.scrollIntoView({ block: "center", behavior: reduceMotion ? "auto" : "smooth" });
  target.classList.add("flash");
  setTimeout(() => target.classList.remove("flash"), 1800);
}