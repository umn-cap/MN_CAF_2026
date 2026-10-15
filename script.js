d3.csv("CAF Action Steps - CAF Action Steps.csv").then(data => {
  drawChart(data);
  buildOutline(data);
  setupSearch();
});

// ---------- Tabs ----------
document.querySelectorAll(".tab").forEach(button => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".panel").forEach(p => p.hidden = true);
    button.classList.add("active");
    document.getElementById(button.dataset.target).hidden = false;
  });
});

// ---------- Bar chart ----------
function drawChart(data) {
  const counts = Array.from(
    d3.rollup(data, rows => rows.length, d => d["Goal Short Name"]),
    ([goal, n]) => ({ goal, n })
  ).sort((a, b) => b.n - a.n);

  const width = 700;
  const barHeight = 36;
  const margin = { top: 10, right: 40, bottom: 10, left: 260 };
  const height = counts.length * barHeight + margin.top + margin.bottom;

  const x = d3.scaleLinear()
    .domain([0, d3.max(counts, d => d.n)])
    .range([margin.left, width - margin.right]);

  const y = d3.scaleBand()
    .domain(counts.map(d => d.goal))
    .range([margin.top, height - margin.bottom])
    .padding(0.2);

  const svg = d3.select("#chart")
    .append("svg")
    .attr("viewBox", [0, 0, width, height])
    .attr("width", "100%");

  svg.selectAll("rect")
    .data(counts)
    .join("rect")
    .attr("x", x(0))
    .attr("y", d => y(d.goal))
    .attr("width", d => x(d.n) - x(0))
    .attr("height", y.bandwidth())
    .attr("fill", "#2a7f62");

  svg.selectAll(".label")
    .data(counts)
    .join("text")
    .attr("class", "label")
    .attr("x", margin.left - 8)
    .attr("y", d => y(d.goal) + y.bandwidth() / 2)
    .attr("dy", "0.35em")
    .attr("text-anchor", "end")
    .attr("font-size", 14)
    .text(d => d.goal);

  svg.selectAll(".value")
    .data(counts)
    .join("text")
    .attr("class", "value")
    .attr("x", d => x(d.n) + 6)
    .attr("y", d => y(d.goal) + y.bandwidth() / 2)
    .attr("dy", "0.35em")
    .attr("font-size", 14)
    .text(d => d.n);
}

// ---------- Collapsible outline ----------
function buildOutline(data) {
  const nested = d3.group(
    data,
    d => d["Goal Full"],
    d => d["Initiative Full"],
    d => d["Sub-Initiative Full"]
  );

  const container = d3.select("#outline");

  for (const [goal, initiatives] of nested) {
    const goalEl = container.append("details").attr("class", "level-goal");
    goalEl.append("summary").attr("data-text", goal).text(goal);

    for (const [initiative, subs] of initiatives) {
      const initEl = goalEl.append("details").attr("class", "level-initiative");
      initEl.append("summary").attr("data-text", initiative).text(initiative);

      for (const [sub, steps] of subs) {
        const subEl = initEl.append("details").attr("class", "level-sub");
        subEl.append("summary").attr("data-text", sub).text(sub);

        const list = subEl.append("ul");
        steps.forEach(row => {
          const step = row["Action Step Full"];
          list.append("li").attr("data-text", step).text(step);
        });
      }
    }
  }
}

// ---------- Search + highlight ----------
function highlight(el, query) {
  const text = el.dataset.text;
  el.textContent = "";
  if (!query) {
    el.textContent = text;
    return;
  }
  const lower = text.toLowerCase();
  let pos = 0;
  let idx;
  while ((idx = lower.indexOf(query, pos)) !== -1) {
    el.append(text.slice(pos, idx));
    const mark = document.createElement("mark");
    mark.textContent = text.slice(idx, idx + query.length);
    el.append(mark);
    pos = idx + query.length;
  }
  el.append(text.slice(pos));
}

function setupSearch() {
  const input = document.getElementById("search");
  const message = document.getElementById("search-count");
  const outline = document.getElementById("outline");

  input.addEventListener("input", () => {
    const query = input.value.trim().toLowerCase();
    const labels = Array.from(outline.querySelectorAll("[data-text]"));
    const sections = Array.from(outline.querySelectorAll("details"));
    const items = Array.from(outline.querySelectorAll("li"));

    // Empty search: remove highlights, show everything, collapse
    if (query === "") {
      labels.forEach(el => highlight(el, ""));
      items.forEach(li => li.hidden = false);
      sections.forEach(d => { d.hidden = false; d.open = false; });
      message.textContent = "";
      return;
    }

    const matches = el => el.dataset.text.toLowerCase().includes(query);
    const ownSummary = d => d.querySelector(":scope > summary");

    // True if any section containing this element has a heading that matches
    const ancestorMatches = el => {
      let parent = el.parentElement.closest("details");
      while (parent) {
        if (matches(ownSummary(parent))) return true;
        parent = parent.parentElement.closest("details");
      }
      return false;
    };

    // Highlight the term everywhere it appears
    labels.forEach(el => highlight(el, query));

    // Action steps: show if they match, or if a heading above them matches
    items.forEach(li => {
      li.hidden = !(matches(li) || ancestorMatches(li));
    });

    // Sections: show if their heading matches, something below matches,
    // or a heading above matches. Open only when something below matches.
    sections.forEach(d => {
      const own = ownSummary(d);
      const below = Array.from(d.querySelectorAll("[data-text]")).filter(el => el !== own);
      const matchBelow = below.some(matches);
      d.hidden = !(matches(own) || matchBelow || ancestorMatches(d));
      d.open = matchBelow;
    });

    const count = labels.filter(matches).length;
    message.textContent = count + (count === 1 ? " match" : " matches");
  });
}

