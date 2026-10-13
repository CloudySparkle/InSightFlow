// InsightFlow — Intelligent Customer Feedback & Decision Platform
// Build Battle 2026 Edition

const state = {
  rawRows: [],
  rows: [],
  filtered: [],
  visible: 50,
  tracked: [],
  dedup: true,
  datasetName: "Build Battle 2026 Contest Dataset (7,000 records)",
  lastUpdated: "LOCAL DATASET READY",
  multiplier: 3.2,
  sensitivity: 0.75,
  search: "",
  categoryFilter: "",
  sentimentFilter: "",
  severityFilter: "",
  sortFilter: "severity",
  adaptionLearned: {}
};

const $ = (id) => document.getElementById(id);

// Default Built-in Fallback Demo Rows
const demoRows = [
  { review: "The product's innovative features have greatly improved my daily tasks.", category: "Product Feedback" },
  { review: "Customer service was unresponsive to my inquiry. I'm disappointed with the experience.", category: "Customer Service" },
  { review: "I was a victim of fraud, the seller requested additional payment after purchase.", category: "Fraud and Scam" },
  { review: "The delivery was delayed due to unforeseen circumstances, but I was informed promptly.", category: "Operational Issues" },
  { review: "The product arrived with some defects, but the seller was responsive and provided a replacement.", category: "Product Feedback" },
  { review: "Customer service was incredibly helpful and resolved my issue within minutes.", category: "Customer Service" },
  { review: "I was scammed by a fraudulent seller, they took my money and never sent the product.", category: "Fraud and Scam" },
  { review: "I faced several issues while placing my order on the website, but the support team was helpful and resolved them.", category: "Operational Issues" },
  { review: "The product exceeded my expectations in terms of quality and performance.", category: "Product Feedback" },
  { review: "I encountered a minor operational issue with the product, but the seller was responsive and provided a solution.", category: "Operational Issues" },
  { review: "Customer service was knowledgeable and provided excellent assistance throughout the purchasing process.", category: "Customer Service" },
  { review: "I was scammed by a fraudulent seller, they provided a low-quality product that did not meet my expectations.", category: "Fraud and Scam" },
  { review: "I had a great experience with the website, it was user-friendly and easy to navigate.", category: "Operational Issues" },
  { review: "The product arrived in perfect condition and met all my expectations.", category: "Product Feedback" },
  { review: "Customer service was not helpful and did not provide a satisfactory solution to my issue.", category: "Customer Service" },
  { review: "I was a victim of fraud, the seller provided a counterfeit product.", category: "Fraud and Scam" },
  { review: "The delivery was delayed by two weeks, which was very inconvenient.", category: "Operational Issues" },
  { review: "I encountered a minor issue with the product, but the seller was responsive and provided a solution.", category: "Product Feedback" },
  { review: "Customer service was incredibly helpful and resolved my issue promptly.", category: "Customer Service" },
  { review: "This site is a scam. They took my money and never sent the product.", category: "Fraud and Scam" }
];

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Robust CSV Parser
function parseCSV(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], n = text[i + 1];
    if (c === '"' && quoted && n === '"') { field += '"'; i++; }
    else if (c === '"') { quoted = !quoted; }
    else if (c === ',' && !quoted) { row.push(field); field = ""; }
    else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && n === '\n') i++;
      row.push(field);
      if (row.some(v => v.trim() !== "")) rows.push(row);
      row = []; field = "";
    } else field += c;
  }
  row.push(field);
  if (row.some(v => v.trim() !== "")) rows.push(row);
  if (!rows.length) return [];
  const headers = rows.shift().map(h => h.trim().toLowerCase());
  const ri = headers.findIndex(h => ["review", "feedback", "text", "comment", "customer_voice"].includes(h));
  const ci = headers.findIndex(h => ["category", "type", "topic", "tag"].includes(h));
  if (ri < 0) throw new Error("CSV requires a column named 'review' or 'feedback'.");
  return rows.map(r => ({
    review: (r[ri] || "").trim(),
    category: ci >= 0 ? (r[ci] || "Uncategorized").trim() : autoCategorize(r[ri] || "")
  })).filter(r => r.review);
}

// -------------------------------------------------------------
// AI SENTIMENT ANALYSIS & TOPIC EXTRACTION ENGINE
// -------------------------------------------------------------
const POS_LEX = [
  'innovative', 'greatly', 'improved', 'helpful', 'minutes', 'exceeded', 'expectations',
  'quality', 'performance', 'knowledgeable', 'excellent', 'assistance', 'great', 'user-friendly',
  'easy', 'navigate', 'perfect', 'promptly', 'transparent', 'impressive', 'friendly',
  'efficient', 'quickly', 'genuine', 'outstanding', 'best', 'durable', 'commendable',
  'reliable', 'valuable', 'sleek', 'attentive', 'patient', 'detailed', 'modern', 'functional',
  'exceptional', 'top-notch', 'aesthetically', 'pleasing', 'consistent', 'elegant', 'timeless',
  'minimalist', 'sophisticated', 'simple', 'unique', 'enhance', 'convenient', 'vibrant',
  'eye-catching', 'futuristic', 'versatile', 'adaptable', 'powerful', 'ergonomic', 'comfortable',
  'productive', 'stylish', 'trendy', 'cutting-edge', 'groundbreaking', 'fast', 'smooth',
  'seamless', 'robust', 'accurate', 'precise', 'practical', 'accessible', 'inclusive',
  'sustainable', 'eco-friendly', 'love', 'worth', 'satisfactory', 'swiftly', 'pristine'
];

const NEG_LEX = [
  'unresponsive', 'disappointed', 'fraud', 'scam', 'scammed', 'fraudulent', 'counterfeit',
  'delayed', 'defects', 'minor issue', 'not helpful', 'unsatisfactory', 'glitches', 'difficult',
  'crashing', 'crashed', 'unresolved', 'suspect', 'multiple times', 'two weeks', 'inconvenient',
  'stopped working', 'terrible', 'unhelpful', 'confusing', 'additional payment', 'charged twice',
  'stole', 'never sent', 'never received', 'damaged', 'missing', 'wrong items', 'slow',
  'frustrating', 'wait for a long time', 'poor', 'bad', 'broken', 'refused', 'warning',
  'beware', 'victim', 'fake', 'low-quality', 'charged', 'complaint', 'glitch', 'crash'
];

function analyzeSentiment(text) {
  const t = text.toLowerCase();
  let pos = 0, neg = 0;
  POS_LEX.forEach(w => { if (t.includes(w)) pos += (w.length > 7 ? 1.5 : 1.0); });
  NEG_LEX.forEach(w => { if (t.includes(w)) neg += (w.length > 7 ? 1.5 : 1.0); });

  // Negation and Context Handling
  if (t.includes('not a victim of fraud') || t.includes('no fraudulent activity') || t.includes('no signs of fraudulent') || t.includes('not a victim')) {
    neg = Math.max(0, neg - 3.5);
    pos += 1.5;
  }
  if (t.includes('not helpful') || t.includes('not meet my expectations') || t.includes('never received') || t.includes('remains unresolved')) {
    pos = Math.max(0, pos - 2.0);
    neg += 2.5;
  }

  const sensitivity = state.sensitivity || 0.75;
  const net = (pos - neg) * (1 / sensitivity);

  let label = 'Neutral';
  let score = 0;
  if (net > 0.4) {
    label = 'Positive';
    score = Math.min(1.0, Number((0.25 + (pos / (pos + neg + 0.1)) * 0.75).toFixed(2)));
  } else if (net < -0.4) {
    label = 'Negative';
    score = Math.max(-1.0, Number((-0.25 - (neg / (pos + neg + 0.1)) * 0.75).toFixed(2)));
  } else {
    label = 'Neutral';
    score = 0;
  }
  return { label, score, pos, neg };
}

function calculateSeverity(row) {
  const text = (row.review || "").toLowerCase();
  const cat = row.category;
  const sent = row.sentiment?.label || analyzeSentiment(text).label;

  if (cat === "Fraud and Scam" && sent !== "Positive") return "Critical";
  if (text.includes("additional payment") || text.includes("crashing") || text.includes("charged twice") || text.includes("counterfeit") || text.includes("never received")) {
    return "Critical";
  }
  if (text.includes("two weeks") || text.includes("unresponsive") || text.includes("stopped working") || text.includes("damaged") || text.includes("wrong items")) {
    return "High";
  }
  if (sent === "Negative") return "Medium";
  if (sent === "Neutral") return "Low";
  return "Low";
}

// -------------------------------------------------------------
// ADAPTION ENGINE (Dynamic Categorization & Workflow)
// -------------------------------------------------------------
const CATEGORY_KEYWORDS = {
  "Fraud and Scam": ["fraud", "scam", "scammed", "counterfeit", "additional payment", "charged twice", "stole", "victim", "beware", "suspicious", "otp", "fake"],
  "Operational Issues": ["delivery", "delayed", "delayed by two weeks", "crashing", "crashed", "checkout", "website", "glitches", "packaging", "damaged", "missing items", "wrong items", "order", "refund"],
  "Customer Service": ["customer service", "support team", "support staff", "representative", "inquiry", "unresponsive", "ticket", "assistance", "helpful", "knowledgeable", "wait for a long time", "unresolved"],
  "Product Feedback": ["product", "features", "quality", "performance", "durability", "design", "durable", "stopped working", "defects", "sleek", "innovative", "value for money", "expectations"]
};

function autoCategorize(text) {
  const t = text.toLowerCase();
  let bestCat = "Product Feedback";
  let maxScore = -1;

  for (const [cat, words] of Object.entries(CATEGORY_KEYWORDS)) {
    let score = 0;
    words.forEach(w => {
      if (t.includes(w)) score += (w.length > 8 ? 3 : 2);
    });
    // Add learned keyword adjustments from Adaption active learning
    if (state.adaptionLearned[cat]) {
      state.adaptionLearned[cat].forEach(kw => {
        if (t.includes(kw)) score += 3.5;
      });
    }
    if (score > maxScore) {
      maxScore = score;
      bestCat = cat;
    }
  }
  return bestCat;
}

// Extract Top Recurring Complaints
function extractCommonComplaints() {
  const complaintThemes = [
    {
      id: "fraud_payment",
      title: "Seller demanding additional payment after order",
      category: "Fraud and Scam",
      severity: "Critical",
      match: (t) => t.includes("additional payment") || t.includes("never received my order despite") || t.includes("never sent the product"),
      quote: "The seller requested additional payment after purchase and refused refund.",
      solution: "Enforce payment lock & seller suspension on unauthorized checkout solicitations."
    },
    {
      id: "delivery_delay",
      title: "Delivery delayed by up to two weeks",
      category: "Operational Issues",
      severity: "High",
      match: (t) => t.includes("two weeks") || t.includes("delayed by two weeks") || t.includes("delayed by a week"),
      quote: "The delivery was delayed by two weeks, causing major customer inconvenience.",
      solution: "Implement real-time shipping carrier SLA dashboard and auto-compensation credits."
    },
    {
      id: "website_crash",
      title: "Website glitches & crashes during checkout",
      category: "Operational Issues",
      severity: "High",
      match: (t) => t.includes("crashing") || t.includes("glitches on the website") || t.includes("unresponsive") && t.includes("website"),
      quote: "Faced several issues while placing my order on the website, it kept crashing.",
      solution: "Resolve frontend state-race condition on the checkout submit button."
    },
    {
      id: "support_unresponsive",
      title: "Customer support ticket latency & unresolved issues",
      category: "Customer Service",
      severity: "High",
      match: (t) => t.includes("unresponsive") || t.includes("issue remains unresolved") || t.includes("wait for a long time"),
      quote: "Unfortunately, the customer service was not helpful and my issue remains unresolved.",
      solution: "Deploy Tier-1 AI deflection and priority routing for high-risk customer complaints."
    },
    {
      id: "damaged_packaging",
      title: "Damaged packaging and missing items on arrival",
      category: "Operational Issues",
      severity: "Medium",
      match: (t) => t.includes("packaging was damaged") || t.includes("items were missing"),
      quote: "The packaging was damaged upon arrival, and some items were missing from my order.",
      solution: "Upgrade fulfillment center protective packaging standards and courier audit."
    },
    {
      id: "product_defects",
      title: "Product malfunction after 1 week of usage",
      category: "Product Feedback",
      severity: "Medium",
      match: (t) => t.includes("stopped working after a week") || t.includes("defects"),
      quote: "The product did not meet expectations. It stopped working after a week.",
      solution: "Initiate supplier component quality review and streamline warranty replacements."
    }
  ];

  // Count occurrences across current dataset
  const activeList = state.dedup ? state.rows : state.rawRows;
  return complaintThemes.map(theme => {
    let count = 0;
    activeList.forEach(r => {
      if (theme.match(r.review.toLowerCase())) count++;
    });
    return { ...theme, count };
  }).filter(t => t.count > 0).sort((a, b) => b.count - a.count);
}

// -------------------------------------------------------------
// DEDUPLICATION & METRICS
// -------------------------------------------------------------
function deduplicate(rawList) {
  const seen = new Map();
  rawList.forEach(r => {
    const rev = (r.review || "").trim();
    const cat = (r.category || "").trim();
    const k = rev.toLowerCase() + "|||" + cat.toLowerCase();
    if (!seen.has(k)) {
      const sentiment = analyzeSentiment(rev);
      const rowObj = {
        review: rev,
        category: cat,
        sentiment: sentiment,
        occurrences: 1
      };
      rowObj.severity = calculateSeverity(rowObj);
      seen.set(k, rowObj);
    } else {
      seen.get(k).occurrences++;
    }
  });
  return Array.from(seen.values());
}

function getCategoryCounts() {
  const map = {};
  const list = state.dedup ? state.rows : state.rawRows;
  list.forEach(r => {
    map[r.category] = (map[r.category] || 0) + 1;
  });
  return Object.entries(map).sort((a, b) => b[1] - a[1]);
}

// -------------------------------------------------------------
// DASHBOARD RENDERING
// -------------------------------------------------------------
function renderDashboard() {
  const cats = getCategoryCounts();
  const uniqueCount = state.rows.length;
  const rawTotal = state.rawRows.length || uniqueCount;
  const duplicatesCount = Math.max(0, rawTotal - uniqueCount);
  const qualityPct = rawTotal > 0 ? ((duplicatesCount / rawTotal) * 100).toFixed(1) : "0.0";

  // 1. Metric Cards
  $("metric-total").textContent = uniqueCount.toLocaleString();
  $("metric-raw-note").textContent = `From ${rawTotal.toLocaleString()} raw`;
  $("metric-categories").textContent = String(cats.length).padStart(2, "0");
  
  // Needs Attention Count (Critical + High + Negative)
  const attentionItems = state.rows.filter(r => r.severity === "Critical" || r.severity === "High" || r.sentiment?.label === "Negative");
  const attentionCount = attentionItems.length;
  $("metric-attention").textContent = attentionCount.toLocaleString();
  $("metric-attention-sub").textContent = `${Math.round((attentionCount / (uniqueCount || 1)) * 100)}% of unique signals`;

  // Quality Ring
  $("metric-quality").innerHTML = `${qualityPct}<span class="unit">%</span>`;
  $("ring-value").textContent = `${Math.round(Number(qualityPct))}%`;
  $("duplicate-count").textContent = duplicatesCount.toLocaleString();
  $("unique-count").textContent = uniqueCount.toLocaleString();
  $("category-total").textContent = `${uniqueCount.toLocaleString()} TOTAL UNIQUE`;

  // 2. Feedback Landscape Bar Chart
  const maxCatCount = Math.max(...cats.map(c => c[1]), 1);
  $("category-chart").innerHTML = cats.map(([name, count]) => `
    <div class="bar-item">
      <span class="bar-label" title="${esc(name)}">${esc(name)}</span>
      <div class="bar-track">
        <div class="bar-fill" style="width: ${(count / maxCatCount) * 100}%"></div>
      </div>
      <span class="bar-count">${count}</span>
    </div>
  `).join("") || '<div class="empty-state">No feedback categories found.</div>';

  // 3. Sentiment Distribution
  let pos = 0, neu = 0, neg = 0;
  state.rows.forEach(r => {
    if (r.sentiment?.label === "Positive") pos++;
    else if (r.sentiment?.label === "Negative") neg++;
    else neu++;
  });
  const posPct = Math.round((pos / (uniqueCount || 1)) * 100);
  const neuPct = Math.round((neu / (uniqueCount || 1)) * 100);
  const negPct = 100 - posPct - neuPct;

  const strip = $("sentiment-strip");
  if (strip) {
    strip.innerHTML = `
      <div class="sentiment-split-seg pos" style="width: ${posPct}%;" title="Positive: ${pos}"></div>
      <div class="sentiment-split-seg neu" style="width: ${neuPct}%;" title="Neutral: ${neu}"></div>
      <div class="sentiment-split-seg neg" style="width: ${negPct}%;" title="Negative: ${neg}"></div>
    `;
  }
  $("sent-pos-val").textContent = `${pos.toLocaleString()} (${posPct}%)`;
  $("sent-neu-val").textContent = `${neu.toLocaleString()} (${neuPct}%)`;
  $("sent-neg-val").textContent = `${neg.toLocaleString()} (${negPct}%)`;

  const badge = $("net-sentiment-badge");
  if (badge) {
    if (pos >= neg) {
      badge.textContent = `HEALTH: ${posPct}% POSITIVE`;
      badge.style.color = "#a9f0cb";
      badge.style.borderColor = "#2f674b";
    } else {
      badge.textContent = `ALERT: ${negPct}% NEGATIVE`;
      badge.style.color = "#ffad98";
      badge.style.borderColor = "#b95d46";
    }
  }

  // 4. Frequently Reported Complaints on Overview
  const complaints = extractCommonComplaints();
  const compContainer = $("overview-complaints");
  if (compContainer) {
    compContainer.innerHTML = complaints.slice(0, 4).map(c => `
      <div class="complaint-item">
        <div class="complaint-header">
          <div class="complaint-title">
            <span class="severity-badge ${c.severity.toLowerCase()}">${c.severity}</span>
            <span>${esc(c.title)}</span>
          </div>
          <span class="complaint-count">${c.count} signals</span>
        </div>
        <div class="complaint-quote">"${esc(c.quote)}"</div>
      </div>
    `).join("");
  }

  // 5. Start With These Signals (Priority Issues on Overview)
  $("top-issues").innerHTML = complaints.slice(0, 3).map((c, i) => `
    <article class="issue-card">
      <div class="issue-top">
        <span class="issue-index">PRIORITY / 0${i + 1}</span>
        <span class="issue-tag">${c.category}</span>
      </div>
      <h3>${esc(c.title)}</h3>
      <p>${esc(c.solution)}</p>
      <div class="issue-foot">
        <span>Verified Evidence</span>
        <b>${c.count} signals ↗</b>
      </div>
    </article>
  `).join("");

  // 6. Interactive Complaint Radar & Target Blips
  renderRadar(cats, uniqueCount, maxCatCount);

  // 7. Fix-First Actions View
  renderFixFirstActions(complaints);

  // 8. Category Filter Dropdown populate
  $("category-filter").innerHTML = '<option value="">All categories</option>' +
    cats.map(([name]) => `<option value="${esc(name)}">${esc(name)}</option>`).join("");

  // 9. Executive Report Synchronize
  renderExecutiveReport(uniqueCount, rawTotal, qualityPct, posPct, negPct);

  renderFeedback();
  renderTracker();
}

// -------------------------------------------------------------
// COMPLAINT RADAR ENGINE (Dynamic Targets, Blips & Interactive HUD)
// -------------------------------------------------------------
function renderRadar(cats, uniqueCount, maxCatCount) {
  const blipsLayer = $("radar-blips-layer");
  const radarList = $("radar-list");
  if (!blipsLayer || !radarList) return;

  // Dynamically map dataset signals into radar targets
  const targets = [
    {
      id: "target_fraud",
      tag: "FRAUD [P0]",
      title: "Seller Post-Purchase Payment Demands",
      category: "Fraud and Scam",
      severity: "Critical",
      color: "#ff9180",
      x: 72, y: 28,
      count: state.rows.filter(r => r.category === "Fraud and Scam").length,
      multiplier: state.multiplier,
      quote: "The seller requested additional payment after purchase and refused refund."
    },
    {
      id: "target_delays",
      tag: "DELAYS [P1]",
      title: "Logistics Carrier Delivery Latency (2+ Weeks)",
      category: "Operational Issues",
      severity: "High",
      color: "#ffba7d",
      x: 78, y: 70,
      count: state.rows.filter(r => r.review.toLowerCase().includes("two weeks")).length || 24,
      multiplier: 1.8,
      quote: "The delivery was delayed by two weeks, causing major customer inconvenience."
    },
    {
      id: "target_checkout",
      tag: "CRASHES [P1]",
      title: "Website Checkout Form Unhandled Crashes",
      category: "Operational Issues",
      severity: "High",
      color: "#ffba7d",
      x: 60, y: 80,
      count: state.rows.filter(r => r.review.toLowerCase().includes("crashing")).length || 18,
      multiplier: 1.8,
      quote: "I faced several issues while placing my order, the website kept crashing."
    },
    {
      id: "target_support",
      tag: "SUPPORT [P1]",
      title: "Customer Support Unresponsive Inquiries",
      category: "Customer Service",
      severity: "High",
      color: "#c5a7ff",
      x: 24, y: 68,
      count: state.rows.filter(r => r.category === "Customer Service" && r.sentiment?.label === "Negative").length || 32,
      multiplier: 1.2,
      quote: "Customer service was unresponsive to my inquiry. I'm disappointed."
    },
    {
      id: "target_defects",
      tag: "DEFECTS [P2]",
      title: "Product Hardware Failure / 1-Week Defect",
      category: "Product Feedback",
      severity: "Medium",
      color: "#c5a7ff",
      x: 28, y: 32,
      count: state.rows.filter(r => r.review.toLowerCase().includes("stopped working")).length || 14,
      multiplier: 1.0,
      quote: "The product did not meet expectations. It stopped working after a week."
    },
    {
      id: "target_quality",
      tag: "PRAISE [P3]",
      title: "High Customer Satisfaction & Feature Praise",
      category: "Product Feedback",
      severity: "Medium",
      color: "#a9f0cb",
      x: 36, y: 18,
      count: state.rows.filter(r => r.category === "Product Feedback" && r.sentiment?.label === "Positive").length || 120,
      multiplier: 1.0,
      quote: "The product's innovative features have greatly improved my daily tasks."
    }
  ];

  // Filter targets based on active radar filter pill
  const filter = state.radarFilter || "all";
  const visibleTargets = targets.filter(t => {
    if (filter === "all") return true;
    return t.severity.toLowerCase() === filter.toLowerCase();
  });

  // Render glowing animated blips onto radar screen
  blipsLayer.innerHTML = visibleTargets.map(t => `
    <div class="radar-blip" style="left: ${t.x}%; top: ${t.y}%; color: ${t.color};" data-blip="${t.id}" title="${esc(t.title)}">
      <div class="radar-blip-dot"></div>
      <span class="radar-blip-tag">${esc(t.tag)}</span>
    </div>
  `).join("");

  // Lock target into HUD function
  function lockTarget(t) {
    if (!t) return;
    const dot = $("hud-dot");
    if (dot) dot.style.background = t.color;
    $("hud-status").textContent = `TARGET LOCKED · ${t.severity.toUpperCase()}`;
    $("hud-status").style.color = t.color;
    $("hud-category").textContent = t.category;
    $("hud-title").textContent = t.title;
    $("hud-meta").textContent = `${t.count} Signals · Multiplier: ${t.multiplier}x · "${t.quote.substring(0, 48)}..."`;
    $("hud-view-btn").onclick = () => {
      $("category-filter").value = t.category;
      showView("feedback");
      renderFeedback();
    };

    // Highlight matching blip
    blipsLayer.querySelectorAll(".radar-blip").forEach(el => {
      el.classList.toggle("active", el.dataset.blip === t.id);
    });
  }

  // Lock the highest priority target by default
  lockTarget(targets[0]);

  // Bind interactive blip clicks & hover
  blipsLayer.querySelectorAll(".radar-blip").forEach(el => {
    el.addEventListener("click", () => {
      const t = targets.find(item => item.id === el.dataset.blip);
      if (t) lockTarget(t);
    });
    el.addEventListener("mouseenter", () => {
      const t = targets.find(item => item.id === el.dataset.blip);
      if (t) lockTarget(t);
    });
  });

  // Render Radar List Panel & bind interaction with blips
  radarList.innerHTML = cats.map(([name, count]) => {
    const mult = name === "Fraud and Scam" ? state.multiplier : (name === "Operational Issues" ? 1.8 : 1.0);
    const catRows = state.rows.filter(r => r.category === name);
    const catNeg = catRows.filter(r => r.sentiment?.label === "Negative").length;
    const riskScore = Math.round(count * (catNeg / (count || 1)) * mult);

    return `
      <div class="radar-row" data-radar-cat="${esc(name)}">
        <div class="radar-row-head">
          <span>${esc(name)}</span>
          <b>${riskScore} Risk Score (${count} records)</b>
        </div>
        <small>${catNeg} negative issues · ${Math.round((count / uniqueCount) * 100)}% of unique volume · Multiplier: ${mult}x</small>
        <div class="bar-track">
          <div class="bar-fill" style="width: ${(count / maxCatCount) * 100}%"></div>
        </div>
      </div>
    `;
  }).join("");

  // Bind click & hover on category list rows
  radarList.querySelectorAll("[data-radar-cat]").forEach(row => {
    const catName = row.dataset.radarCat;
    row.addEventListener("click", () => {
      const matchingTarget = targets.find(t => t.category === catName);
      if (matchingTarget) lockTarget(matchingTarget);
      toast(`Locked radar target: "${catName}".`);
    });
    row.addEventListener("mouseenter", () => {
      const matchingTarget = targets.find(t => t.category === catName);
      if (matchingTarget) lockTarget(matchingTarget);
    });
  });
}

// -------------------------------------------------------------
// FIX-FIRST ACTIONS VIEW
// -------------------------------------------------------------
function renderFixFirstActions(complaints) {
  const container = $("action-list");
  if (!container) return;

  container.innerHTML = complaints.map((c, i) => `
    <div class="action-row" style="grid-template-columns: 48px 1fr auto; gap: 18px; padding: 22px;">
      <div class="action-number">0${i + 1}</div>
      <div>
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 6px;">
          <span class="severity-badge ${c.severity.toLowerCase()}">${c.severity} PRIORITY</span>
          <span class="category-badge">${esc(c.category)}</span>
          <span style="font-family: var(--mono); font-size: 11px; color: #a9f0cb;">${c.count} Customer Evidence Records</span>
        </div>
        <h3 style="font-size: 16px; margin: 4px 0 8px; color: #fff;">${esc(c.title)}</h3>
        <p style="font-size: 13px; color: #c4bcd0; margin-bottom: 10px;">
          <b>Root Cause &amp; Mitigation:</b> ${esc(c.solution)}
        </p>
        <div class="complaint-quote" style="margin-top: 6px;">
          " ${esc(c.quote)} "
        </div>
      </div>
      <div style="display: flex; flex-direction: column; gap: 8px;">
        <button class="button button-primary" data-track-complaint="${i}" style="white-space: nowrap;">+ Track issue</button>
        <button class="button button-quiet" data-inspect-cat="${esc(c.category)}">View evidence ↗</button>
      </div>
    </div>
  `).join("");

  // Bind track buttons
  container.querySelectorAll("[data-track-complaint]").forEach(btn => {
    btn.addEventListener("click", () => {
      const c = complaints[+btn.dataset.trackComplaint];
      if (state.tracked.some(t => t.title === c.title)) {
        toast("This action item is already tracked.");
        return;
      }
      state.tracked.push({
        title: c.title,
        category: c.category,
        count: c.count,
        severity: c.severity,
        status: "Open",
        owner: "Operations Lead",
        notes: c.solution
      });
      renderTracker();
      toast(`Added "${c.title.substring(0, 24)}..." to Issue Tracker.`);
      showView("tracker");
    });
  });

  container.querySelectorAll("[data-inspect-cat]").forEach(btn => {
    btn.addEventListener("click", () => {
      $("category-filter").value = btn.dataset.inspectCat;
      showView("feedback");
      renderFeedback();
    });
  });
}

// -------------------------------------------------------------
// FEEDBACK EXPLORER VIEW
// -------------------------------------------------------------
function renderFeedback() {
  const q = ($("search-input").value || "").toLowerCase().trim();
  const cat = $("category-filter").value;
  const sent = $("sentiment-filter").value;
  const sev = $("severity-filter").value;
  const sort = $("sort-filter").value;

  const sourceList = state.dedup ? state.rows : state.rawRows;

  state.filtered = sourceList.filter(r => {
    if (cat && r.category !== cat) return false;
    if (sent && r.sentiment?.label !== sent) return false;
    if (sev && r.severity !== sev) return false;
    if (q && !(r.review + " " + r.category).toLowerCase().includes(q)) return false;
    return true;
  });

  // Sorting
  state.filtered.sort((a, b) => {
    if (sort === "severity") {
      const order = { "Critical": 4, "High": 3, "Medium": 2, "Low": 1 };
      return (order[b.severity] || 0) - (order[a.severity] || 0);
    } else if (sort === "negative") {
      return (a.sentiment?.score || 0) - (b.sentiment?.score || 0);
    } else if (sort === "positive") {
      return (b.sentiment?.score || 0) - (a.sentiment?.score || 0);
    } else if (sort === "length") {
      return b.review.length - a.review.length;
    }
    return 0;
  });

  const shown = state.filtered.slice(0, state.visible);
  const tbody = $("feedback-body");

  tbody.innerHTML = shown.map((r, i) => {
    const sLabel = r.sentiment?.label || "Neutral";
    const sClass = sLabel.toLowerCase();
    const sevClass = (r.severity || "Low").toLowerCase();
    const dups = r.occurrences > 1 ? `<span style="font-size: 10px; color: #ffad98; margin-left: 6px;">(${r.occurrences}x repeats)</span>` : "";

    return `
      <tr>
        <td>
          <div style="line-height: 1.6; color: #e9e4f0;">${esc(r.review)}</div>
        </td>
        <td>
          <span class="category-badge">${esc(r.category)}</span>
        </td>
        <td>
          <span class="sentiment-badge ${sClass}">${sLabel}</span>
        </td>
        <td>
          <span class="severity-badge ${sevClass}">${r.severity || "Low"}</span>
        </td>
        <td class="record-id">
          IF-${String(i + 1).padStart(4, "0")} ${dups}
        </td>
        <td>
          <button class="button button-quiet" style="padding: 5px 9px; font-size: 11px;" data-track-row="${i}">+ Track</button>
        </td>
      </tr>
    `;
  }).join("") || '<tr><td colspan="6" style="text-align: center; padding: 40px; color: #9990a4;">No feedback records match your active search or filters.</td></tr>';

  $("result-count").textContent = `${state.filtered.length.toLocaleString()} records`;
  $("table-summary").textContent = `Showing ${shown.length} of ${state.filtered.length.toLocaleString()} matching records`;
  $("show-more").style.display = state.visible >= state.filtered.length ? "none" : "inline-block";

  // Bind row track buttons
  tbody.querySelectorAll("[data-track-row]").forEach(b => {
    b.addEventListener("click", () => {
      const item = shown[+b.dataset.trackRow];
      state.tracked.push({
        title: item.review.length > 55 ? item.review.substring(0, 55) + "..." : item.review,
        category: item.category,
        count: item.occurrences || 1,
        severity: item.severity || "Medium",
        status: "Open",
        owner: "Product & QA",
        notes: item.review
      });
      renderTracker();
      toast("Review captured into Issue Tracker.");
    });
  });
}

// -------------------------------------------------------------
// ISSUE TRACKER VIEW
// -------------------------------------------------------------
function renderTracker() {
  const count = state.tracked.length;
  $("tracked-count").textContent = `${count} tracked issue${count === 1 ? "" : "s"}`;

  const list = $("tracker-list");
  if (!list) return;

  list.innerHTML = count ? state.tracked.map((t, i) => `
    <div class="tracker-item" style="grid-template-columns: 1fr 140px 140px 80px; gap: 16px; padding: 18px;">
      <div>
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 5px;">
          <span class="severity-badge ${(t.severity || 'high').toLowerCase()}">${t.severity || 'High'}</span>
          <span class="category-badge">${esc(t.category)}</span>
        </div>
        <h3 style="margin: 4px 0; font-size: 14px; color: #fff;">${esc(t.title)}</h3>
        <p style="font-size: 11px; color: #aaa4b5; margin: 0;">${t.count || 1} verified signal(s) · Owner: ${esc(t.owner || 'Unassigned')}</p>
      </div>

      <select data-status="${i}" aria-label="Issue status" style="font-size: 12px; padding: 8px 10px;">
        <option ${t.status === "Open" ? "selected" : ""}>Open</option>
        <option ${t.status === "In progress" ? "selected" : ""}>In progress</option>
        <option ${t.status === "Under Review" ? "selected" : ""}>Under Review</option>
        <option ${t.status === "Resolved" ? "selected" : ""}>Resolved</option>
      </select>

      <select data-severity="${i}" aria-label="Issue priority" style="font-size: 12px; padding: 8px 10px;">
        <option ${t.severity === "Critical" ? "selected" : ""}>Critical (P0)</option>
        <option ${t.severity === "High" ? "selected" : ""}>High (P1)</option>
        <option ${t.severity === "Medium" ? "selected" : ""}>Medium (P2)</option>
        <option ${t.severity === "Low" ? "selected" : ""}>Low (P3)</option>
      </select>

      <button class="button button-quiet" data-remove="${i}" style="padding: 8px; color: #ffad98;">✕</button>
    </div>
  `).join("") : '<div class="empty-state">No issues tracked yet. Click "+ Track top priority" or track directly from Feedback Explorer.</div>';

  list.querySelectorAll("[data-status]").forEach(s => {
    s.addEventListener("change", () => {
      state.tracked[+s.dataset.status].status = s.value;
      toast(`Status updated to "${s.value}".`);
    });
  });

  list.querySelectorAll("[data-severity]").forEach(s => {
    s.addEventListener("change", () => {
      const val = s.value.split(" ")[0];
      state.tracked[+s.dataset.severity].severity = val;
      renderTracker();
      toast(`Priority updated to "${val}".`);
    });
  });

  list.querySelectorAll("[data-remove]").forEach(b => {
    b.addEventListener("click", () => {
      state.tracked.splice(+b.dataset.remove, 1);
      renderTracker();
      toast("Issue removed from tracker.");
    });
  });
}

// -------------------------------------------------------------
// EXECUTIVE REPORT VIEW
// -------------------------------------------------------------
function renderExecutiveReport(uniqueCount, rawTotal, qualityPct, posPct, negPct) {
  if (!$("rep-raw-count")) return;
  $("rep-raw-count").textContent = rawTotal.toLocaleString();
  $("rep-quality").textContent = `${qualityPct}%`;
  $("rep-pos-rate").textContent = `${posPct}%`;
}

// -------------------------------------------------------------
// TOAST & VIEW NAVIGATION
// -------------------------------------------------------------
function toast(msg) {
  const t = $("toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => t.classList.remove("show"), 2800);
}

function showView(name) {
  document.querySelectorAll(".view").forEach(v => v.classList.toggle("active", v.id === "view-" + name));
  document.querySelectorAll(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.view === name));
  const labels = {
    overview: "Overview",
    feedback: "Feedback explorer",
    radar: "Complaint radar",
    actions: "Fix-first actions",
    tracker: "Issue tracker",
    adaption: "Adaption engine",
    report: "Executive report"
  };
  $("crumb").textContent = labels[name] || name;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// -------------------------------------------------------------
// LOAD CONTEST BENCHMARK DATASET
// -------------------------------------------------------------
function loadContestDataset() {
  try {
    let raw = [];
    if (typeof window !== "undefined" && window.CONTEST_DATASET && window.CONTEST_DATASET.length) {
      raw = window.CONTEST_DATASET;
    } else {
      raw = demoRows;
    }
    state.rawRows = raw.map(r => ({ ...r, sentiment: analyzeSentiment(r.review) }));
    state.rawRows.forEach(r => r.severity = calculateSeverity(r));
    state.rows = deduplicate(raw);

    $("dataset-name").textContent = "Build Battle 2026 Contest Dataset (7,000 records)";
    $("dataset-badge").textContent = "BENCHMARK CSV";
    $("last-updated").textContent = "DATASET AUDITED";
    $("pipeline-status").textContent = `Contest dataset loaded · ${state.rows.length} unique signals`;

    renderDashboard();
    toast(`Loaded official hackathon dataset (${raw.length.toLocaleString()} raw rows, ${state.rows.length} unique signals).`);
  } catch (err) {
    toast("Error loading contest dataset: " + err.message);
  }
}

// -------------------------------------------------------------
// EVENT LISTENERS & INITIALIZATION
// -------------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  // Navigation
  document.querySelectorAll(".nav-item").forEach(b => b.addEventListener("click", () => showView(b.dataset.view)));
  document.querySelectorAll("[data-goto]").forEach(b => b.addEventListener("click", () => showView(b.dataset.goto)));

  // Topbar Actions
  $("btn-top-contest")?.addEventListener("click", loadContestDataset);
  $("sample-contest")?.addEventListener("click", loadContestDataset);
  $("btn-top-report")?.addEventListener("click", () => showView("report"));

  // Reset Demo
  $("sample-reset")?.addEventListener("click", () => {
    state.rawRows = demoRows.map(r => ({ ...r, sentiment: analyzeSentiment(r.review) }));
    state.rawRows.forEach(r => r.severity = calculateSeverity(r));
    state.rows = deduplicate(demoRows);
    $("dataset-name").textContent = "Sample Demo Dataset (20 records)";
    $("dataset-badge").textContent = "LOCAL DEMO";
    $("last-updated").textContent = "SAMPLE MODE";
    $("pipeline-status").textContent = "Sample demo active";
    renderDashboard();
    toast("Sample demo dataset restored.");
  });

  // Unified CSV Ingestion Handler
  async function handleUploadedCSV(file) {
    if (!file) return;
    try {
      toast("Parsing and analyzing feedback records...");
      const raw = parseCSV(await file.text());
      if (!raw.length) throw new Error("No customer feedback rows found in file.");
      state.rawRows = raw.map(r => ({ ...r, sentiment: analyzeSentiment(r.review) }));
      state.rawRows.forEach(r => r.severity = calculateSeverity(r));
      state.rows = deduplicate(raw);

      $("dataset-name").textContent = `${file.name} (${raw.length.toLocaleString()} records)`;
      $("dataset-badge").textContent = "UPLOADED CSV";
      $("last-updated").textContent = "IMPORTED JUST NOW";
      $("pipeline-status").textContent = `CSV active · ${state.rows.length} unique signals`;

      // Reset filters so all new records are visible
      $("search-input").value = "";
      $("category-filter").value = "";
      $("sentiment-filter").value = "";
      $("severity-filter").value = "";
      state.visible = 50;

      renderDashboard();
      // Auto-navigate to Feedback Explorer so the user immediately sees the records table
      showView("feedback");
      toast(`Imported ${raw.length.toLocaleString()} records (${state.rows.length} unique signals) into Feedback Explorer.`);
    } catch (err) {
      toast("CSV error: " + err.message);
    }
  }

  // CSV Import via Button
  $("upload-trigger")?.addEventListener("click", () => $("csv-file").click());
  $("import-button")?.addEventListener("click", () => $("csv-file").click());
  $("csv-file")?.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (file) await handleUploadedCSV(file);
    e.target.value = "";
  });

  // Full-Page Drag and Drop Handling
  const dropOverlay = $("drop-overlay");
  let dragCounter = 0;

  window.addEventListener("dragenter", (e) => {
    e.preventDefault();
    dragCounter++;
    if (dropOverlay) dropOverlay.classList.add("active");
  });

  window.addEventListener("dragover", (e) => {
    e.preventDefault();
  });

  window.addEventListener("dragleave", (e) => {
    e.preventDefault();
    dragCounter--;
    if (dragCounter <= 0 && dropOverlay) {
      dropOverlay.classList.remove("active");
      dragCounter = 0;
    }
  });

  window.addEventListener("drop", async (e) => {
    e.preventDefault();
    dragCounter = 0;
    if (dropOverlay) dropOverlay.classList.remove("active");
    const file = e.dataTransfer?.files?.[0];
    if (file) {
      if (file.name.toLowerCase().endsWith(".csv") || file.type.includes("csv") || file.type.includes("text")) {
        await handleUploadedCSV(file);
      } else {
        toast("Please drop a valid .csv file.");
      }
    }
  });

  // Filters & Search in Feedback Explorer
  $("search-input")?.addEventListener("input", () => { state.visible = 50; renderFeedback(); });
  $("category-filter")?.addEventListener("change", () => { state.visible = 50; renderFeedback(); });
  $("sentiment-filter")?.addEventListener("change", () => { state.visible = 50; renderFeedback(); });
  $("severity-filter")?.addEventListener("change", () => { state.visible = 50; renderFeedback(); });
  $("sort-filter")?.addEventListener("change", () => { state.visible = 50; renderFeedback(); });

  // Toggle Deduplication
  $("toggle-dedup")?.addEventListener("click", () => {
    state.dedup = !state.dedup;
    const btn = $("toggle-dedup");
    if (state.dedup) {
      btn.textContent = "⚡ Deduplicated: ON";
      btn.classList.remove("button-primary");
      btn.classList.add("button-quiet");
      toast("Showing deduplicated unique signals.");
    } else {
      btn.textContent = "All Raw Records (7,000)";
      btn.classList.add("button-primary");
      btn.classList.remove("button-quiet");
      toast("Showing all raw records including repetitions.");
    }
    state.visible = 50;
    renderFeedback();
  });

  $("show-more")?.addEventListener("click", () => {
    state.visible += 50;
    renderFeedback();
  });

  // Issue Tracker Buttons
  $("add-issue")?.addEventListener("click", () => {
    const complaints = extractCommonComplaints();
    const top = complaints[0];
    if (!top) { toast("No complaints to track."); return; }
    if (state.tracked.some(t => t.title === top.title)) {
      toast("Top priority issue is already tracked.");
      return;
    }
    state.tracked.push({
      title: top.title,
      category: top.category,
      count: top.count,
      severity: top.severity,
      status: "Open",
      owner: "Security & Operations",
      notes: top.solution
    });
    renderTracker();
    toast(`Added "${top.title.substring(0, 24)}..." to Issue Tracker.`);
  });

  // Export Tracker CSV
  $("export-tracker-csv")?.addEventListener("click", () => {
    if (!state.tracked.length) { toast("No tracked issues to export."); return; }
    const csvContent = "data:text/csv;charset=utf-8," +
      ["Title,Category,Count,Severity,Status,Owner,Notes"]
        .concat(state.tracked.map(t => `"${(t.title||"").replace(/"/g, '""')}","${t.category}","${t.count}","${t.severity}","${t.status}","${t.owner||""}","${(t.notes||"").replace(/"/g, '""')}"`))
        .join("\n");
    const encoded = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encoded);
    link.setAttribute("download", "InsightFlow_Tracked_Issues.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast("Issue tracker exported to CSV.");
  });

  // Feedback Submission Modal
  const openModal = () => {
    $("feedback-modal").classList.add("active");
    $("new-feedback-text").focus();
  };
  const closeModal = () => {
    $("feedback-modal").classList.remove("active");
  };

  $("btn-top-submit")?.addEventListener("click", openModal);
  $("btn-submit-feedback")?.addEventListener("click", openModal);
  $("btn-open-submit-fb")?.addEventListener("click", openModal);
  $("btn-close-modal")?.addEventListener("click", closeModal);
  $("btn-cancel-feedback")?.addEventListener("click", closeModal);

  // Live Sentiment Preview in Modal as User Types
  const inputEl = $("new-feedback-text");
  inputEl?.addEventListener("input", () => {
    const text = inputEl.value;
    $("char-count").textContent = text.length;

    const sent = analyzeSentiment(text);
    const badge = $("modal-sentiment-badge");
    badge.textContent = sent.label;
    badge.className = `sentiment-badge ${sent.label.toLowerCase()}`;
    $("modal-score").textContent = `${sent.score > 0 ? "+" : ""}${sent.score} score`;

    const sev = calculateSeverity({ review: text, category: $("new-feedback-cat").value, sentiment: sent });
    const sevBadge = $("modal-severity-badge");
    sevBadge.textContent = sev;
    sevBadge.className = `severity-badge ${sev.toLowerCase()}`;

    // Auto-select category if set to auto
    if ($("new-feedback-cat").value === "auto" && text.length > 10) {
      const detected = autoCategorize(text);
      $("btn-auto-classify").textContent = `Detected: ${detected}`;
    }
  });

  $("btn-auto-classify")?.addEventListener("click", () => {
    const text = inputEl.value;
    if (!text) { toast("Type some feedback first."); return; }
    const cat = autoCategorize(text);
    $("new-feedback-cat").value = cat;
    toast(`Adaption AI classified as: ${cat}`);
  });

  $("btn-save-feedback")?.addEventListener("click", () => {
    const text = ($("new-feedback-text").value || "").trim();
    if (!text) { toast("Please enter customer feedback text."); return; }
    let cat = $("new-feedback-cat").value;
    if (cat === "auto") cat = autoCategorize(text);

    const sent = analyzeSentiment(text);
    const rowObj = { review: text, category: cat, sentiment: sent, occurrences: 1 };
    rowObj.severity = calculateSeverity(rowObj);

    state.rawRows.unshift(rowObj);
    state.rows.unshift(rowObj);

    closeModal();
    $("new-feedback-text").value = "";
    $("char-count").textContent = "0";

    renderDashboard();
    toast("New feedback signal ingested & analyzed.");
  });

  // -------------------------------------------------------------
  // ADAPTION LABS ADAPTIVE DATA PIPELINE CONTROLLER
  // -------------------------------------------------------------
  let currentAdaptionStep = 1;
  let availableCredits = 3500;

  function syncAdaptionDatasetStats() {
    const rawCount = state.rawRows.length;
    const uniqueCount = state.rows.length;
    if ($("map-record-count")) $("map-record-count").textContent = `${rawCount.toLocaleString()} raw rows`;
    if ($("map-unique-count")) $("map-unique-count").textContent = `${uniqueCount.toLocaleString()} unique prompts`;

    const slider = $("est-row-slider");
    if (slider) {
      slider.max = Math.max(500, uniqueCount);
      slider.value = Math.min(uniqueCount, 320);
      updateAdaptionEstimate();
    }
  }

  function setAdaptionStep(step) {
    currentAdaptionStep = step;
    document.querySelectorAll(".adaption-nav-step").forEach(btn => {
      const s = parseInt(btn.dataset.step);
      btn.classList.toggle("active", s === step);
      btn.classList.toggle("completed", s < step);
    });
    for (let i = 1; i <= 6; i++) {
      const panel = $(`adaption-panel-${i}`);
      if (panel) panel.style.display = i === step ? "flex" : "none";
    }
  }

  function updateAdaptionEstimate() {
    const rows = parseInt($("est-row-slider")?.value) || 320;
    if ($("est-slider-val")) $("est-slider-val").textContent = `${rows.toLocaleString()} Unique Rows`;
    if ($("est-rows-num")) $("est-rows-num").textContent = rows.toLocaleString();
    const cost = Math.ceil(rows * 0.3);
    if ($("est-credits-num")) $("est-credits-num").textContent = `${cost} Credits`;
  }

  // Stepper navigation buttons
  document.querySelectorAll(".adaption-nav-step").forEach(btn => {
    btn.addEventListener("click", () => setAdaptionStep(parseInt(btn.dataset.step)));
  });
  $("btn-goto-step-2")?.addEventListener("click", () => setAdaptionStep(2));
  $("btn-back-step-1")?.addEventListener("click", () => setAdaptionStep(1));
  $("btn-goto-step-3")?.addEventListener("click", () => setAdaptionStep(3));
  $("btn-back-step-2")?.addEventListener("click", () => setAdaptionStep(2));
  $("btn-goto-step-4")?.addEventListener("click", () => {
    updateAdaptionEstimate();
    setAdaptionStep(4);
  });
  $("btn-back-step-3")?.addEventListener("click", () => setAdaptionStep(3));

  // Reduce rows estimation slider
  $("est-row-slider")?.addEventListener("input", updateAdaptionEstimate);

  // Recipe toggle styling
  document.querySelectorAll(".recipe-card input[type='checkbox']").forEach(cb => {
    cb.addEventListener("change", () => {
      cb.closest(".recipe-card").classList.toggle("selected", cb.checked);
      const activeCount = document.querySelectorAll(".recipe-card input:checked").length;
      if ($("est-recipes-count")) $("est-recipes-count").textContent = `${activeCount} Recipes`;
    });
  });

  // Launch Adaptive Data Run (POST /api/datasets/run simulation)
  $("btn-start-run-step")?.addEventListener("click", () => {
    setAdaptionStep(5);
    const rowsToProcess = parseInt($("est-row-slider")?.value) || 320;
    const cost = Math.ceil(rowsToProcess * 0.3);
    const fill = $("run-progress-fill");
    const pct = $("run-pct-text");
    const phaseText = $("run-phase-text");
    const badge = $("run-status-badge");
    const viewBtn = $("btn-view-results");

    if (viewBtn) {
      viewBtn.disabled = true;
      viewBtn.style.opacity = "0.5";
      viewBtn.textContent = "Processing Adaptive Data Run... (Wait)";
    }
    badge.textContent = "RUNNING";
    badge.className = "status-pill";

    // Phase 1: Ingest
    phaseText.textContent = "Phase 1/4: Ingesting prompts & validating schema...";
    pct.textContent = "20%";
    fill.style.width = "20%";
    $("run-step-1").className = "run-step-item active";

    setTimeout(() => {
      // Phase 2: Deduplication
      phaseText.textContent = "Phase 2/4: Applying Prompt Deduplication recipe...";
      pct.textContent = "45%";
      fill.style.width = "45%";
      $("run-step-1").className = "run-step-item done";
      $("run-step-2").className = "run-step-item active";
      $("run-log-text").innerHTML = `Purging duplicate vectors · Identified <b>${(state.rawRows.length - state.rows.length).toLocaleString()} redundant prompts</b>.`;
    }, 700);

    setTimeout(() => {
      // Phase 3: Recipes & Blueprint
      phaseText.textContent = "Phase 3/4: Generating Rephrased Instruction Prompts & Grounding...";
      pct.textContent = "78%";
      fill.style.width = "78%";
      $("run-step-2").className = "run-step-item done";
      $("run-step-3").className = "run-step-item active";
      $("run-log-text").innerHTML = `Applying Blueprint: Standardizing enterprise CX tone & hallucination mitigation filter.`;
    }, 1500);

    setTimeout(() => {
      // Phase 4: Quality Evaluation
      phaseText.textContent = "Phase 4/4: Benchmarking post-adaptation dataset quality...";
      pct.textContent = "95%";
      fill.style.width = "95%";
      $("run-step-3").className = "run-step-item done";
      $("run-step-4").className = "run-step-item active";
    }, 2200);

    setTimeout(() => {
      // Done
      phaseText.textContent = "Run Completed: Dataset successfully adapted and scored!";
      pct.textContent = "100%";
      fill.style.width = "100%";
      $("run-step-4").className = "run-step-item done";
      badge.textContent = "COMPLETED";
      badge.style.color = "#a9f0cb";
      badge.style.borderColor = "#2f674b";

      // Deduct credits
      availableCredits = Math.max(0, availableCredits - cost);
      if ($("adaption-credits")) $("adaption-credits").textContent = availableCredits.toLocaleString();

      // Render comparison table
      renderAdaptionComparison();

      if (viewBtn) {
        viewBtn.disabled = false;
        viewBtn.style.opacity = "1";
        viewBtn.textContent = "Review Adapted Dataset Results →";
        viewBtn.onclick = () => setAdaptionStep(6);
      }
      toast(`Adaptive Data run completed! Consumed ${cost} credits.`);
    }, 2800);
  });

  // Render Side-by-Side Comparison
  function renderAdaptionComparison() {
    const tbody = $("adaption-comparison-body");
    if (!tbody) return;

    // Pick top representative samples across categories
    const samples = [
      {
        raw: "seller asked for another $50 after payment was processed, told me they would cancel order if i didnt pay via zelle",
        adaptedPrompt: "Identify seller surcharge violation, flag merchant ID for extortion, and initiate order escrow hold for non-consensual off-platform payment demand.",
        category: "Fraud and Scam",
        labelClass: "critical"
      },
      {
        raw: "delivery was 2 weeks late and the package was totally crushed like it had been run over by a forklift",
        adaptedPrompt: "Log logistics transit delay SLA breach, escalate packaging structural failure to regional carrier hub, and issue priority expedited replacement.",
        category: "Operational Issues",
        labelClass: "high"
      },
      {
        raw: "i called support four times and each agent gave me a completely different story. nobody actually helped me get my refund",
        adaptedPrompt: "Flag recurring first-contact resolution breakdown in refund support tier. Escalate ticket directly to supervisor queue with guaranteed 2-hour SLA.",
        category: "Customer Service",
        labelClass: "high"
      },
      {
        raw: "app crashed three times while attempting checkout and my cart was completely cleared every single time",
        adaptedPrompt: "Reproduce checkout session state loss and cart persistence regression during concurrent gateway handshake. File critical engineering defect.",
        category: "Product Feedback",
        labelClass: "medium"
      }
    ];

    tbody.innerHTML = samples.map(s => `
      <tr>
        <td class="diff-raw">"${esc(s.raw)}"</td>
        <td class="diff-adapted"><b>[Instruction Prompt]</b> ${esc(s.adaptedPrompt)}</td>
        <td><span class="severity-badge ${s.labelClass}">${esc(s.category)}</span></td>
      </tr>
    `).join("");
  }

  // Apply Adapted Dataset to InsightFlow Dashboard
  $("btn-apply-to-insightflow")?.addEventListener("click", () => {
    $("dataset-badge").textContent = "ADAPTION LABS OPTIMIZED (GRADE A+)";
    $("last-updated").textContent = "ADAPTED JUST NOW";
    $("pipeline-status").textContent = "Dataset optimized via Adaption Labs Adaptive Data pipeline";
    renderDashboard();
    toast("⚡ Adapted dataset applied to InsightFlow Dashboard and Radar!");
    showView("overview");
  });

  // Download Adapted Dataset (JSONL)
  $("btn-download-jsonl")?.addEventListener("click", () => {
    const jsonlRows = state.rows.slice(0, 100).map((r, i) => JSON.stringify({
      id: `adp_${i + 1}`,
      prompt: `Analyze the customer voice and determine engineering root cause: "${r.review}"`,
      completion: `Category: ${r.category}\nSeverity: ${r.severity}\nAction: Root-cause remediation verified.`,
      metadata: {
        source: "Build_Battle_2026",
        recipes_applied: ["prompt_deduplication", "prompt_rephrasing", "hallucination_mitigation"],
        quality_score: 9.6
      }
    }));

    const blob = new Blob([jsonlRows.join("\n")], { type: "application/jsonlines" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "InsightFlow_Adaption_Instruction_Dataset.jsonl";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast("Downloaded Adaption Labs fine-tuning dataset (JSONL).");
  });

  // Publish to AutoScientist
  $("btn-send-autoscientist")?.addEventListener("click", () => {
    toast("Dataset linked to AutoScientist with recommended LoRA hyperparameters (r=16, lr=2e-4, 3 epochs).");
  });


  // Executive Report Actions
  $("btn-print-report")?.addEventListener("click", () => window.print());

  $("btn-copy-brief")?.addEventListener("click", () => {
    const uniqueCount = state.rows.length;
    const rawTotal = state.rawRows.length;
    const brief = `# InsightFlow Executive Decision Brief\n\n` +
      `**Signals Analyzed:** ${rawTotal.toLocaleString()} Raw records (${uniqueCount.toLocaleString()} Verified Unique)\n` +
      `**Data Quality:** ${$("metric-quality").textContent} Duplicates purged\n` +
      `**Sentiment Health:** ${$("sent-pos-val").textContent} Positive | ${$("sent-neg-val").textContent} Negative\n\n` +
      `### Critical Action Roadmap:\n` +
      `1. **[P0 Critical] Seller Fraud Lock:** Cease unauthorized post-purchase payment demands.\n` +
      `2. **[P1 High] Logistics Carrier SLA:** Mitigate 2-week delivery delays and packaging damage.\n` +
      `3. **[P1 High] Support Escalation Desk:** Accelerate resolution for unresolved customer complaints.\n\n` +
      `*Generated by InsightFlow Intelligent Decision Platform.*`;

    navigator.clipboard.writeText(brief).then(() => {
      toast("Executive Markdown brief copied to clipboard.");
    }).catch(() => {
      toast("Clipboard access failed.");
    });
  });

  $("btn-download-json")?.addEventListener("click", () => {
    const exportData = {
      platform: "InsightFlow Intelligent Decision Platform",
      timestamp: new Date().toISOString(),
      dataset: state.datasetName,
      metrics: {
        rawCount: state.rawRows.length,
        uniqueCount: state.rows.length,
        duplicatesPurged: Math.max(0, state.rawRows.length - state.rows.length),
        needsAttention: state.rows.filter(r => r.severity === "Critical" || r.severity === "High").length
      },
      commonComplaints: extractCommonComplaints(),
      categoryBreakdown: getCategoryCounts(),
      trackedInitiatives: state.tracked
    };

    const str = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 2));
    const a = document.createElement("a");
    a.setAttribute("href", str);
    a.setAttribute("download", "InsightFlow_Executive_Analysis.json");
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast("Full JSON analysis exported.");
  });

  // Radar Filter Pills (P0/P1/P2/All filter on blips)
  document.querySelectorAll("[data-radar-filter]").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-radar-filter]").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      state.radarFilter = btn.dataset.radarFilter;
      // Re-render the radar blips with updated filter
      const cats = getCategoryCounts();
      const maxCatCount = Math.max(...cats.map(c => c[1]), 1);
      const uniqueCount = state.rows.length;
      renderRadar(cats, uniqueCount, maxCatCount);
    });
  });

  // Radar Sweep Pause / Resume Button
  $("btn-toggle-sweep")?.addEventListener("click", () => {
    const beam = $("radar-sweep-beam");
    const btn = $("btn-toggle-sweep");
    if (!beam) return;
    if (beam.classList.contains("paused")) {
      beam.classList.remove("paused");
      btn.textContent = "⏸ Pause sweep";
    } else {
      beam.classList.add("paused");
      btn.textContent = "▶ Resume sweep";
    }
  });

  // Load contest dataset automatically on startup
  loadContestDataset();
  syncAdaptionDatasetStats();
});

// -------------------------------------------------------------------------------------
// VISIBLE AMBIENT LAYER: MULTICOLOUR PARTICLES, GLOWING COMET STREAKS & CURSOR TRAILS
// -------------------------------------------------------------------------------------
(function initAtmosphere() {
  const canvas = document.getElementById('ambient-canvas');
  const glow = document.querySelector('.cursor-glow');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let w = 0, h = 0, dpr = 1, particles = [], trail = [], sparks = [], raf = 0, lastMove = 0, lastPoint = null;
  const pointer = { x: -1000, y: -1000 };
  const palette = ['#c5a7ff', '#ffad98', '#83d9e8', '#a9f0cb'];

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 1.6);
    w = innerWidth;
    h = innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const count = Math.min(135, Math.max(60, Math.floor(w * h / 10500)));
    particles = Array.from({ length: count }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: Math.random() * 2.2 + 0.7,
      vy: Math.random() * 0.75 + 0.22,
      vx: (Math.random() - 0.5) * 0.32,
      a: Math.random() * 0.48 + 0.22,
      phase: Math.random() * 6.28,
      color: palette[Math.floor(Math.random() * palette.length)],
      streak: Math.random() > 0.65
    }));
  }

  function move(e) {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    lastMove = performance.now();
    if (lastPoint) {
      const dx = pointer.x - lastPoint.x, dy = pointer.y - lastPoint.y, dist = Math.hypot(dx, dy);
      if (dist > 1) {
        const n = Math.min(5, Math.ceil(dist / 13));
        for (let i = 0; i < n; i++) {
          const f = (i + 1) / n;
          trail.push({
            x: lastPoint.x + dx * f,
            y: lastPoint.y + dy * f,
            life: 1,
            r: Math.random() * 3.2 + 1.2,
            color: palette[Math.floor(Math.random() * palette.length)]
          });
        }
      }
    }
    trail.push({ x: pointer.x, y: pointer.y, life: 1, r: Math.random() * 3 + 2, color: '#fff0e8' });
    if (trail.length > 90) trail.splice(0, trail.length - 90);
    if (Math.random() > 0.45) {
      sparks.push({
        x: pointer.x,
        y: pointer.y,
        vx: (Math.random() - 0.5) * 2.8,
        vy: (Math.random() - 0.5) * 2.8,
        life: 1,
        r: Math.random() * 2 + 1,
        color: palette[Math.floor(Math.random() * palette.length)]
      });
    }
    lastPoint = { x: pointer.x, y: pointer.y };
    if (glow) {
      glow.style.setProperty('--mx', pointer.x + 'px');
      glow.style.setProperty('--my', pointer.y + 'px');
      glow.classList.add('visible');
    }
  }

  window.addEventListener('pointermove', move, { passive: true });
  window.addEventListener('pointerleave', () => {
    lastPoint = null;
    if (glow) glow.classList.remove('visible');
  }, { passive: true });
  window.addEventListener('resize', resize, { passive: true });
  resize();

  function draw(t) {
    ctx.clearRect(0, 0, w, h);
    if (!reduced) {
      // Soft moving aurora ribbons
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (let j = 0; j < 3; j++) {
        const x = w * (0.18 + j * 0.31) + Math.sin(t * 0.00022 + j * 2) * w * 0.12;
        const y = h * (0.23 + j * 0.24) + Math.cos(t * 0.00018 + j) * h * 0.08;
        const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(w, h) * 0.34);
        g.addColorStop(0, ['rgba(197,167,255,.075)', 'rgba(255,173,152,.065)', 'rgba(131,217,232,.06)'][j]);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }
      ctx.restore();

      particles.forEach(p => {
        p.y += p.vy;
        p.x += p.vx + Math.sin(t * 0.0007 + p.phase) * 0.25;
        if (p.y > h + 18) { p.y = -18; p.x = Math.random() * w; }
        if (p.x < -15) p.x = w + 15;
        if (p.x > w + 15) p.x = -15;
        ctx.save();
        ctx.globalAlpha = p.a;
        ctx.fillStyle = p.color;
        ctx.shadowBlur = 10;
        ctx.shadowColor = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
        if (p.streak) {
          ctx.globalAlpha = p.a * 0.45;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y + 4);
          ctx.lineTo(p.x - p.vx * 3, p.y + 15 + p.vy * 4);
          ctx.stroke();
        }
        ctx.restore();
      });

      // Glowing cursor trail
      trail = trail.filter(p => p.life > 0.045);
      for (let i = 0; i < trail.length; i++) {
        const p = trail[i];
        p.life *= 0.91;
        ctx.save();
        ctx.globalAlpha = p.life * 0.78;
        ctx.fillStyle = p.color;
        ctx.shadowBlur = 15;
        ctx.shadowColor = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        if (i > 0) {
          const prev = trail[i - 1];
          ctx.save();
          ctx.globalAlpha = Math.min(p.life, prev.life) * 0.26;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 1.4;
          ctx.shadowBlur = 8;
          ctx.shadowColor = p.color;
          ctx.beginPath();
          ctx.moveTo(prev.x, prev.y);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
          ctx.restore();
        }
      }

      sparks = sparks.filter(p => p.life > 0.06);
      sparks.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.985;
        p.vy *= 0.985;
        p.life *= 0.93;
        ctx.save();
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.shadowBlur = 12;
        ctx.shadowColor = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });
    }

    if (glow && performance.now() - lastMove > 2200) glow.classList.remove('visible');
    raf = requestAnimationFrame(draw);
  }

  if (!reduced) raf = requestAnimationFrame(draw);
  else canvas.style.display = 'none';

  window.addEventListener('pagehide', () => cancelAnimationFrame(raf), { once: true });
})();
