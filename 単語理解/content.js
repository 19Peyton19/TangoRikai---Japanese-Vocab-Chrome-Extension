// content.js — 単語理解 v3.2
(function () {
  if (window.__tankogokaiLoaded) return;
  window.__tankogokaiLoaded = true;

  const JAPANESE_REGEX = /[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf\u3400-\u4dbf]/;

  let triggerBtn = null;
  let panel = null;
  let currentText = "";
  let selectionRect = null;

  let activeTab = "homophones";
  let tabCache = {};
  let viewStack = [];
  let isDragging = false;
  let dragOffsetX = 0, dragOffsetY = 0;

  // ── Audio ───────────────────────────────────────────────────────
  function speakJapanese(text) {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "ja-JP";
    utter.rate = 0.85;
    window.speechSynthesis.speak(utter);
  }

  // ── Trigger ─────────────────────────────────────────────────────
  function createTriggerBtn() {
    const btn = document.createElement("div");
    btn.id = "nl-trigger";
    btn.innerHTML = `<span class="nl-kanji">検索</span>`;
    btn.addEventListener("click", e => {
      e.stopPropagation();
      btn.style.opacity = "0";
      btn.style.pointerEvents = "none";
      openPanel(currentText, selectionRect);
    });
    document.body.appendChild(btn);
    return btn;
  }

  function showTrigger(rect, text) {
    currentText = text; selectionRect = rect;
    if (!triggerBtn) triggerBtn = createTriggerBtn();
    const sx = window.scrollX, sy = window.scrollY;
    let left = rect.left + sx + rect.width / 2 - 31;
    let top  = rect.top  + sy - 42;
    left = Math.max(8, Math.min(left, window.innerWidth - 70));
    if (top < sy + 8) top = rect.bottom + sy + 8;
    triggerBtn.style.left = left + "px";
    triggerBtn.style.top  = top  + "px";
    triggerBtn.classList.add("nl-visible");
  }

  function hideTrigger() {
    if (!triggerBtn) return;
    triggerBtn.classList.remove("nl-visible");
    triggerBtn.style.opacity = "";
    triggerBtn.style.pointerEvents = "";
  }

  // ── Panel ────────────────────────────────────────────────────────
  function createPanel() {
    const el = document.createElement("div");
    el.id = "nl-panel";
    el.innerHTML = `
      <div class="nl-panel-header" id="nl-drag-handle">
        <button class="nl-close" title="Close">✕</button>
        <div class="nl-brand">単語理解</div>
        <a class="nl-jisho-link" id="nl-jisho-link" href="#" target="_blank" title="Open in Jisho">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
            <polyline points="15 3 21 3 21 9"/>
            <line x1="10" y1="14" x2="21" y2="3"/>
          </svg>
        </a>
      </div>
      <div class="nl-panel-body">

        <div id="nl-results-view">
          <!-- Word info layer -->
          <div id="nl-word-info">
              <div class="nl-word-block">
                <div class="nl-selected-word" id="nl-selected-word"></div>
                <div class="nl-reading" id="nl-reading"></div>
                <div class="nl-word-btns-row">
                  <button class="nl-speak-btn" id="nl-speak-btn" title="Play pronunciation">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                      <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
                      <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
                    </svg>
                  </button>
                  <button class="nl-sentences-btn" id="nl-sentences-btn" title="Example sentences">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>
                      <line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/>
                      <line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
                    </svg>
                  </button>
                  <div class="nl-bunpro-wrap">
                    <button class="nl-bunpro-btn" id="nl-bunpro-btn" title="Add to Bunpro reviews">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="12" y1="8" x2="12" y2="16"/>
                        <line x1="8" y1="12" x2="16" y2="12"/>
                      </svg>
                    </button>
                    <div class="nl-bunpro-tooltip">Add to Bunpro<br><span>Must be logged in at bunpro.jp</span></div>
                  </div>
                </div>
                <div class="nl-word-meta" id="nl-word-meta"></div>
                <div class="nl-conjugation" id="nl-conjugation" style="display:none"></div>
                <div class="nl-word-type" id="nl-word-type"></div>
                <div class="nl-meaning" id="nl-meaning"></div>
              </div>
            <div class="nl-tabs">
              <button class="nl-tab active" data-tab="homophones">同音<span>Homophones</span></button>
              <button class="nl-tab" data-tab="synonyms">類義<span>Synonyms</span></button>
              <button class="nl-tab" data-tab="kanji">漢字<span>Kanji</span></button>
            </div>
            <div class="nl-tab-content">
              <div class="nl-state nl-loading" id="nl-loading"><div class="nl-spinner"></div><span>Searching…</span></div>
              <div class="nl-state nl-error" id="nl-error" style="display:none"></div>
              <div id="nl-words-list"></div>
              <div id="nl-kanji-list"></div>
            </div>
          </div>

          <!-- Sentences sub-view (replaces word-info) -->
          <div id="nl-sentences-view" style="display:none">
            <div class="nl-detail-header">
              <button class="nl-back-btn" id="nl-sentences-back-btn">← Back</button>
            </div>
            <div id="nl-sentences-body" class="nl-detail-content">
              <div class="nl-state nl-loading" id="nl-sentences-loading"><div class="nl-spinner"></div><span>Loading sentences…</span></div>
            </div>
          </div>
        </div>

        <div id="nl-word-detail-view" style="display:none">
          <div class="nl-detail-header">
            <button class="nl-back-btn" id="nl-word-back-btn">← 戻る Back</button>
          </div>
          <div class="nl-detail-loading" id="nl-word-detail-loading"><div class="nl-spinner"></div><span>Loading…</span></div>
          <div id="nl-word-detail-body"></div>
        </div>

        <div id="nl-kanji-detail-view" style="display:none">
          <div class="nl-detail-header">
            <button class="nl-back-btn" id="nl-kanji-back-btn">← 戻る Back</button>
          </div>
          <div id="nl-kanji-detail-body"></div>
        </div>

      </div>
      <div class="nl-resize-handle" id="nl-resize-handle"></div>
    `;

    // Close
    el.querySelector(".nl-close").addEventListener("click", closePanel);

    // Speak
    el.querySelector("#nl-speak-btn").addEventListener("click", e => {
      e.stopPropagation();
      const reading = el.querySelector("#nl-reading").textContent;
      const word    = el.querySelector("#nl-selected-word").textContent;
      speakJapanese(reading || word);
      el.querySelector("#nl-speak-btn").classList.add("nl-speaking");
      setTimeout(() => el.querySelector("#nl-speak-btn")?.classList.remove("nl-speaking"), 1200);
    });

    // Sentences button
    el.querySelector("#nl-sentences-btn").addEventListener("click", e => {
      e.stopPropagation();
      const word = el.querySelector("#nl-selected-word").textContent;
      openSentencesView(word);
    });

    // Bunpro button
    el.querySelector("#nl-bunpro-btn").addEventListener("click", e => {
      e.stopPropagation();
      const word = el.querySelector("#nl-selected-word").textContent;
      addToBunpro(word, el.querySelector("#nl-bunpro-btn"));
    });

    // Sentences back
    el.querySelector("#nl-sentences-back-btn").addEventListener("click", () => {
      el.querySelector("#nl-sentences-view").style.display = "none";
      el.querySelector("#nl-word-info").style.display = "";
    });

    // Back buttons
    el.querySelector("#nl-word-back-btn").addEventListener("click", popView);
    el.querySelector("#nl-kanji-back-btn").addEventListener("click", popView);

    // Tabs
    el.querySelectorAll(".nl-tab").forEach(tab =>
      tab.addEventListener("click", () => switchTab(tab.dataset.tab))
    );

    // ── Drag ────────────────────────────────────────────────────
    const handle = el.querySelector("#nl-drag-handle");
    handle.addEventListener("mousedown", e => {
      if (e.target.classList.contains("nl-close") || e.target.closest("#nl-jisho-link")) return;
      isDragging = true;
      const rect = el.getBoundingClientRect();
      dragOffsetX = e.clientX - rect.left;
      dragOffsetY = e.clientY - rect.top;
      el.style.transition = "none";
      e.preventDefault();
    });

    // ── Resize ──────────────────────────────────────────────────
    const resizeHandle = el.querySelector("#nl-resize-handle");
    let isResizing = false, resizeStartX, resizeStartY, resizeStartW, resizeStartH;

    resizeHandle.addEventListener("mousedown", e => {
      isResizing = true;
      resizeStartX = e.clientX;
      resizeStartY = e.clientY;
      resizeStartW = el.offsetWidth;
      resizeStartH = el.offsetHeight;
      el.style.transition = "none";
      e.preventDefault();
      e.stopPropagation();
    });

    document.addEventListener("mousemove", e => {
      if (isDragging) {
        let x = e.clientX - dragOffsetX + window.scrollX;
        let y = e.clientY - dragOffsetY + window.scrollY;
        x = Math.max(0, Math.min(x, document.documentElement.scrollWidth - el.offsetWidth));
        y = Math.max(0, y);
        el.style.left = x + "px";
        el.style.top  = y + "px";
      }
      if (isResizing) {
        const newW = Math.max(100, resizeStartW + (e.clientX - resizeStartX));
        const newH = Math.max(100, resizeStartH + (e.clientY - resizeStartY));
        const headerH = el.querySelector(".nl-panel-header").offsetHeight;
        el.style.width    = newW + "px";
        el.style.height   = newH + "px";
        el.style.maxHeight = newH + "px";
        el.querySelector(".nl-panel-body").style.height    = (newH - headerH) + "px";
        el.querySelector(".nl-panel-body").style.maxHeight = (newH - headerH) + "px";
      }
    });

    document.addEventListener("mouseup", () => {
      isDragging = false;
      isResizing = false;
    });

    document.body.appendChild(el);
    return el;
  }

  function positionPanel(rect) {
    const sx = window.scrollX, sy = window.scrollY;
    const w = 340, gap = 12;
    let left = rect.left + sx + rect.width / 2 - w / 2;
    let top  = rect.bottom + sy + gap;
    left = Math.max(8, Math.min(left, window.innerWidth + sx - w - 8));
    if (top + 520 > sy + window.innerHeight) top = rect.top + sy - 520 - gap;
    if (top < sy + 8) top = sy + 8;
    panel.style.left = left + "px";
    panel.style.top  = top  + "px";
  }

  // ── View stack ──────────────────────────────────────────────────
  function showView(name) {
    panel.querySelector("#nl-results-view").style.display      = name === "results"      ? "" : "none";
    panel.querySelector("#nl-word-detail-view").style.display  = name === "word-detail"  ? "" : "none";
    panel.querySelector("#nl-kanji-detail-view").style.display = name === "kanji-detail" ? "" : "none";
  }
  function pushView(name) { viewStack.push(name); showView(name); }
  function popView() {
    viewStack.pop();
    const current = viewStack[viewStack.length - 1] || "results";
    showView(current);
    // Restore Jisho link to the main searched word when going back to results
    if (current === "results" && panel) {
      const word = panel.querySelector("#nl-selected-word")?.textContent;
      const jishoLink = panel.querySelector("#nl-jisho-link");
      if (jishoLink && word) jishoLink.href = `https://jisho.org/search/${encodeURIComponent(word)}`;
    }
  }

  // ── Open / Update / Close ───────────────────────────────────────
  function openPanel(text, rect) {
    hideTrigger();
    if (!panel) panel = createPanel();

    const alreadyOpen = panel.classList.contains("nl-open");

    // Reset state
    tabCache = {}; activeTab = "homophones"; viewStack = ["results"];
    panel.querySelector("#nl-sentences-view").style.display = "none";
    panel.querySelector("#nl-word-info").style.display = "";
    panel.querySelector("#nl-selected-word").textContent = text;
    const jishoLink = panel.querySelector("#nl-jisho-link");
    if (jishoLink) jishoLink.href = `https://jisho.org/search/${encodeURIComponent(text)}`;
    panel.querySelector("#nl-reading").textContent = "";
    panel.querySelector("#nl-word-meta").innerHTML = "";
    panel.querySelector("#nl-word-type").textContent = "";
    panel.querySelector("#nl-conjugation").style.display = "none";
    panel.querySelector("#nl-meaning").textContent = "";
    panel.querySelector("#nl-words-list").innerHTML = "";
    panel.querySelector("#nl-kanji-list").innerHTML = "";
    panel.querySelector("#nl-error").style.display = "none";
    panel.querySelector("#nl-loading").style.display = "flex";
    panel.querySelectorAll(".nl-tab").forEach(t =>
      t.classList.toggle("active", t.dataset.tab === "homophones")
    );
    showView("results");

    // Only reposition if not already open (let the user keep their dragged position)
    if (!alreadyOpen) {
      panel.style.transition = "";
      positionPanel(rect);
    }
    panel.classList.add("nl-open");

    sendMessage({ type: "ANALYZE_JAPANESE", text }, response => {
      if (!panel) return;
      panel.querySelector("#nl-loading").style.display = "none";
      if (!response?.success) { showError(response?.error || "Error"); return; }
      const d = response.data;
      panel.querySelector("#nl-reading").textContent = d.reading;
      panel.querySelector("#nl-word-type").textContent = d.wordType || "";
      panel.querySelector("#nl-meaning").textContent = d.meaning;

      // Conjugation info
      const conjEl = panel.querySelector("#nl-conjugation");
      if (d.conjugation) {
        conjEl.innerHTML = `
          <span class="nl-conj-type">${d.conjugation}</span>
          <span class="nl-conj-sep">of</span>
          <span class="nl-conj-base">${d.baseWord || d.reading}</span>
        `;
        conjEl.style.display = "flex";
        // Override meaning to show base meaning
        panel.querySelector("#nl-meaning").textContent = d.baseMeaning || d.meaning;
      } else {
        conjEl.style.display = "none";
      }
      renderWordMeta(panel.querySelector("#nl-word-meta"), d.isCommon, d.jlpt);
      tabCache.homophones = d.relatedWords;
      renderWordList(d.relatedWords);
    });
  }

  function closePanel() { panel?.classList.remove("nl-open"); }

  // ── Tabs ────────────────────────────────────────────────────────
  function switchTab(tab) {
    if (tab === activeTab && tabCache[tab] !== undefined) return;
    activeTab = tab;
    panel.querySelectorAll(".nl-tab").forEach(t =>
      t.classList.toggle("active", t.dataset.tab === tab)
    );
    if (tabCache[tab] !== undefined) {
      tab === "kanji" ? renderKanjiList(tabCache[tab]) : renderWordList(tabCache[tab]);
      return;
    }
    panel.querySelector("#nl-words-list").innerHTML = "";
    panel.querySelector("#nl-kanji-list").innerHTML = "";
    panel.querySelector("#nl-loading").style.display = "flex";
    panel.querySelector("#nl-error").style.display = "none";

    const text = panel.querySelector("#nl-selected-word").textContent;

    if (tab === "synonyms") {
      sendMessage({ type: "GET_SYNONYMS", text }, r => {
        panel.querySelector("#nl-loading").style.display = "none";
        if (!r?.success) { showError(r?.error); return; }
        tabCache.synonyms = r.data.words;
        if (activeTab === "synonyms") renderWordList(r.data.words);
      });
    } else if (tab === "kanji") {
      sendMessage({ type: "GET_KANJI", text }, r => {
        panel.querySelector("#nl-loading").style.display = "none";
        if (!r?.success) { showError(r?.error); return; }
        tabCache.kanji = r.data.kanji;
        if (activeTab === "kanji") renderKanjiList(r.data.kanji);
      });
    }
  }

  // ── Renderers ───────────────────────────────────────────────────
  function renderWordMeta(el, isCommon, jlpt) {
    el.innerHTML = "";
    if (isCommon) { const b = document.createElement("span"); b.className = "nl-badge nl-badge-common"; b.textContent = "common"; el.appendChild(b); }
    if (jlpt)     { const b = document.createElement("span"); b.className = "nl-badge nl-badge-jlpt";   b.textContent = jlpt.toUpperCase(); el.appendChild(b); }
  }

  function renderWordList(words) {
    panel.querySelector("#nl-loading").style.display = "none";
    panel.querySelector("#nl-kanji-list").innerHTML = "";
    const list = panel.querySelector("#nl-words-list");
    list.innerHTML = "";
    if (!words || words.length === 0) { list.innerHTML = `<div class="nl-empty">No results found.</div>`; return; }
    words.forEach((w, i) => {
      const card = document.createElement("div");
      card.className = "nl-word-card";
      card.style.animationDelay = `${i * 50}ms`;
      card.innerHTML = `
        <div class="nl-card-left">
          <div class="nl-card-word">${w.word}</div>
          <div class="nl-card-reading">${w.reading}</div>
        </div>
        <div class="nl-card-right">
          <div class="nl-card-meaning">${w.meaning}</div>
          <div class="nl-card-meta">
            ${w.isCommon ? `<span class="nl-badge nl-badge-common">common</span>` : ""}
            ${w.jlpt ? `<span class="nl-badge nl-badge-jlpt">${w.jlpt.toUpperCase()}</span>` : ""}
          </div>
        </div>
        <div class="nl-card-arrow">›</div>
      `;
      card.addEventListener("click", () => openWordDetail(w.word));
      list.appendChild(card);
    });
  }

  function renderKanjiList(kanjiData) {
    panel.querySelector("#nl-loading").style.display = "none";
    panel.querySelector("#nl-words-list").innerHTML = "";
    const list = panel.querySelector("#nl-kanji-list");
    list.innerHTML = "";
    if (!kanjiData || kanjiData.length === 0) { list.innerHTML = `<div class="nl-empty">No kanji found.</div>`; return; }
    kanjiData.forEach((k, i) => {
      const card = document.createElement("div");
      card.className = "nl-kanji-card nl-kanji-card-clickable";
      card.style.animationDelay = `${i * 60}ms`;
      card.innerHTML = `
        <div class="nl-kanji-char">${k.char}</div>
        <div class="nl-kanji-info">
          <div class="nl-kanji-meanings">${k.meanings.join(", ")}</div>
          <div class="nl-kanji-readings">
            ${k.onyomi.length  ? `<span><span class="nl-reading-type">音</span>${k.onyomi.join("、")}</span>`  : ""}
            ${k.kunyomi.length ? `<span><span class="nl-reading-type">訓</span>${k.kunyomi.join("、")}</span>` : ""}
          </div>
          <div class="nl-kanji-stats">
            ${k.stroke_count ? `<span>${k.stroke_count} strokes</span>` : ""}
            ${k.jlpt  ? `<span class="nl-badge nl-badge-jlpt">${("jlpt" + k.jlpt).toUpperCase()}</span>` : ""}
            ${k.grade ? `<span class="nl-badge nl-badge-grade">Grade ${k.grade}</span>` : ""}
          </div>
        </div>
        <div class="nl-card-arrow">›</div>
      `;
      card.addEventListener("click", () => openKanjiDetail(k));
      list.appendChild(card);
    });
  }

  // ── Word detail ─────────────────────────────────────────────────
  function openWordDetail(word) {
    pushView("word-detail");
    panel.querySelector("#nl-word-detail-body").innerHTML = "";
    panel.querySelector("#nl-word-detail-loading").style.display = "flex";
    const jishoLink = panel.querySelector("#nl-jisho-link");
    if (jishoLink) jishoLink.href = `https://jisho.org/search/${encodeURIComponent(word)}`;
    sendMessage({ type: "GET_WORD_DETAIL", word }, r => {
      if (!panel) return;
      panel.querySelector("#nl-word-detail-loading").style.display = "none";
      if (!r?.success) { panel.querySelector("#nl-word-detail-body").innerHTML = `<div class="nl-state nl-error">⚠️ ${r?.error || "Error"}</div>`; return; }
      renderWordDetail(r.data);
    });
  }

  function renderWordDetail(data) {
    const body = panel.querySelector("#nl-word-detail-body");
    const commonBadge = data.isCommon ? `<span class="nl-badge nl-badge-common">common</span>` : "";
    const jlptBadge   = data.jlpt     ? `<span class="nl-badge nl-badge-jlpt">${data.jlpt.toUpperCase()}</span>` : "";
    const sensesHTML = data.senses.map((s, i) => `
      <div class="nl-sense">
        ${s.partsOfSpeech.length ? `<div class="nl-pos">${s.partsOfSpeech.join(", ")}</div>` : ""}
        <div class="nl-sense-num">${i + 1}. ${s.definitions.join("; ")}</div>
        ${s.info.length ? `<div class="nl-sense-info">${s.info.join(", ")}</div>` : ""}
      </div>`).join("");
    const formsHTML = data.otherForms.length ? `
      <div class="nl-section-title">Other forms</div>
      <div class="nl-other-forms">${data.otherForms.map(f => `<span class="nl-form">${f.word}<small>${f.reading}</small></span>`).join("")}</div>` : "";
    const sentencesHTML = data.sentences.length ? `
      <div class="nl-section-title">Example sentences</div>
      ${data.sentences.map(s => `
        <div class="nl-sentence">
          <div class="nl-sentence-jp">${s.japanese}</div>
          <button class="nl-show-translation">Show translation</button>
          <div class="nl-sentence-en" style="display:none">${s.english}</div>
        </div>`).join("")}` : "";

    body.innerHTML = `
      <div class="nl-detail-word-block">
        <div class="nl-detail-word-row">
          <div class="nl-detail-word">${data.word}</div>
          <button class="nl-speak-btn nl-speak-detail" title="Play pronunciation">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
            </svg>
          </button>
          <div class="nl-bunpro-wrap">
            <button class="nl-bunpro-btn nl-bunpro-detail" title="Add to Bunpro reviews">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="16"/>
                <line x1="8" y1="12" x2="16" y2="12"/>
              </svg>
            </button>
            <div class="nl-bunpro-tooltip">Add to Bunpro<br><span>Must be logged in at bunpro.jp</span></div>
          </div>
        </div>
        <div class="nl-detail-reading">${data.reading}</div>
        <div class="nl-detail-badges">${commonBadge}${jlptBadge}</div>
      </div>
      <div class="nl-detail-content">
        <div class="nl-section-title">Meanings</div>
        ${sensesHTML}${formsHTML}${sentencesHTML}
      </div>
    `;
    body.querySelector(".nl-speak-detail").addEventListener("click", () => speakJapanese(data.reading || data.word));
    body.querySelector(".nl-bunpro-detail").addEventListener("click", e => {
      addToBunpro(data.word, e.currentTarget);
    });

    // Translation toggles
    body.querySelectorAll(".nl-show-translation").forEach(btn => {
      btn.addEventListener("click", () => {
        const enEl = btn.nextElementSibling;
        const visible = enEl.style.display !== "none";
        enEl.style.display = visible ? "none" : "";
        btn.textContent = visible ? "Show translation" : "Hide translation";
      });
    });
  }

  // ── Kanji detail ────────────────────────────────────────────────
  function openKanjiDetail(k) {
    pushView("kanji-detail");
    const body = panel.querySelector("#nl-kanji-detail-body");
    const jishoLink = panel.querySelector("#nl-jisho-link");
    if (jishoLink) jishoLink.href = `https://jisho.org/search/${encodeURIComponent(k.char)}%23kanji`;
    body.innerHTML = `
      <div class="nl-kanji-hero">
        <div class="nl-kanji-hero-char">${k.char}</div>
        <div class="nl-kanji-hero-info">
          <div class="nl-kanji-meanings">${k.meanings.join(", ")}</div>
          <div class="nl-kanji-readings">
            ${k.onyomi.length  ? `<span><span class="nl-reading-type">音</span>${k.onyomi.join("、")}</span>`  : ""}
            ${k.kunyomi.length ? `<span><span class="nl-reading-type">訓</span>${k.kunyomi.join("、")}</span>` : ""}
          </div>
          <div class="nl-kanji-stats">
            ${k.stroke_count ? `<span>${k.stroke_count} strokes</span>` : ""}
            ${k.jlpt  ? `<span class="nl-badge nl-badge-jlpt">${("jlpt" + k.jlpt).toUpperCase()}</span>` : ""}
            ${k.grade ? `<span class="nl-badge nl-badge-grade">Grade ${k.grade}</span>` : ""}
          </div>
        </div>
      </div>
      <div class="nl-section-title" style="padding: 0 12px; margin-top: 10px;">Words containing ${k.char}</div>
      <div id="nl-kanji-words-list" class="nl-kanji-words-list">
        <div class="nl-state nl-loading"><div class="nl-spinner"></div><span>Loading words…</span></div>
      </div>
    `;
    sendMessage({ type: "GET_KANJI_WORDS", kanji: k.char }, r => {
      const list = panel.querySelector("#nl-kanji-words-list");
      if (!list) return;
      if (!r?.success || !r.data.words.length) { list.innerHTML = `<div class="nl-empty">No words found.</div>`; return; }
      list.innerHTML = "";
      r.data.words.forEach((w, i) => {
        const card = document.createElement("div");
        card.className = "nl-word-card";
        card.style.animationDelay = `${i * 40}ms`;
        card.innerHTML = `
          <div class="nl-card-left">
            <div class="nl-card-word">${w.word}</div>
            <div class="nl-card-reading">${w.reading}</div>
          </div>
          <div class="nl-card-right">
            <div class="nl-card-meaning">${w.meaning}</div>
            <div class="nl-card-meta">
              ${w.isCommon ? `<span class="nl-badge nl-badge-common">common</span>` : ""}
              ${w.jlpt ? `<span class="nl-badge nl-badge-jlpt">${w.jlpt.toUpperCase()}</span>` : ""}
            </div>
          </div>
          <div class="nl-card-arrow">›</div>
        `;
        card.addEventListener("click", () => openWordDetail(w.word));
        list.appendChild(card);
      });
    });
  }

  // ── Main word sentences view ────────────────────────────────────
  function openSentencesView(word) {
    const sv = panel.querySelector("#nl-sentences-view");
    const wi = panel.querySelector("#nl-word-info");
    const body = panel.querySelector("#nl-sentences-body");

    wi.style.display = "none";
    sv.style.display = "";
    body.innerHTML = `<div class="nl-state nl-loading" id="nl-sentences-loading"><div class="nl-spinner"></div><span>Loading sentences…</span></div>`;

    sendMessage({ type: "GET_WORD_DETAIL", word }, r => {
      if (!panel) return;
      if (!r?.success) {
        body.innerHTML = `<div class="nl-state nl-error">⚠️ ${r?.error || "Error loading sentences"}</div>`;
        return;
      }
      const sentences = r.data.sentences || [];
      if (sentences.length === 0) {
        body.innerHTML = `<div class="nl-empty">No example sentences found.</div>`;
        return;
      }
      body.innerHTML = sentences.map(s => `
        <div class="nl-sentence">
          <div class="nl-sentence-jp">${s.japanese}</div>
          <button class="nl-show-translation">Show translation</button>
          <div class="nl-sentence-en" style="display:none">${s.english}</div>
        </div>
      `).join("");
      body.querySelectorAll(".nl-show-translation").forEach(btn => {
        btn.addEventListener("click", () => {
          const enEl = btn.nextElementSibling;
          const visible = enEl.style.display !== "none";
          enEl.style.display = visible ? "none" : "";
          btn.textContent = visible ? "Show translation" : "Hide translation";
        });
      });
    });
  }

  function showError(msg) {
    panel.querySelector("#nl-loading").style.display = "none";
    const el = panel.querySelector("#nl-error");
    el.innerHTML = `<span>⚠️ ${msg || "Something went wrong."}</span>`;
    el.style.display = "flex";
  }

  // ── Bunpro ──────────────────────────────────────────────────────
  function addToBunpro(word, btn) {
    if (!word) return;
    const original = btn.innerHTML;
    btn.disabled = true;
    btn.classList.add("nl-bunpro-loading");
    btn.innerHTML = `<div class="nl-spinner" style="width:14px;height:14px;border-width:2px"></div>`;

    sendMessage({ type: "ADD_TO_BUNPRO", word }, r => {
      btn.disabled = false;
      btn.classList.remove("nl-bunpro-loading");
      if (r?.success) {
        btn.classList.add("nl-bunpro-success");
        btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
        setTimeout(() => {
          btn.classList.remove("nl-bunpro-success");
          btn.innerHTML = original;
        }, 2500);
      } else {
        const msg = r?.error || "Error";
        btn.classList.add("nl-bunpro-error");
        btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
        setTimeout(() => {
          btn.classList.remove("nl-bunpro-error");
          btn.innerHTML = original;
        }, 2500);

        if (msg === "NOT_LOGGED_IN") {
          showBunproToast("Please log in to Bunpro first", "login");
        } else if (msg.includes("not found in Bunpro")) {
          showBunproToast(`This word isn't in Bunpro's vocabulary list yet`, "notfound");
        } else if (msg.includes("401") || msg.includes("403") || msg.includes("Unauthorized")) {
          showBunproToast("Bunpro authentication failed — try logging in again", "login");
        } else if (msg.includes("Bunpro add failed")) {
          showBunproToast("Bunpro couldn't add this word — it may already be in your reviews", "info");
        } else {
          showBunproToast(`Bunpro error: ${msg}`, "error");
        }
      }
    });
  }

  function showBunproTokenPrompt() {
    showBunproToast("Please log in to Bunpro first", "login");
  }

  function showBunproToast(message, type) {
    // Remove any existing toast
    document.getElementById("nl-bunpro-toast")?.remove();

    const icons = {
      login:    `<svg class="nl-toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
      notfound: `<svg class="nl-toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="11" y1="16" x2="11.01" y2="16"/></svg>`,
      info:     `<svg class="nl-toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
      error:    `<svg class="nl-toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`
    };

    const actionHtml = type === "login"
      ? `<a href="https://bunpro.jp/login" target="_blank" class="nl-toast-action">Log in →</a>`
      : "";

    const toast = document.createElement("div");
    toast.id = "nl-bunpro-toast";
    toast.dataset.type = type;
    toast.innerHTML = `${icons[type] || icons.error}<span class="nl-toast-msg">${message}</span>${actionHtml}`;
    document.body.appendChild(toast);

    if (actionHtml) {
      toast.querySelector(".nl-toast-action").addEventListener("click", () => toast.remove());
    }
    setTimeout(() => { toast.style.opacity = "0"; setTimeout(() => toast.remove(), 300); }, 4500);
  }

  // sendMessage with automatic service-worker wake-up retry.
  // MV3 service workers go inactive after ~30s of idle. When that happens,
  // sendMessage throws "Could not establish connection" or fires cb with
  // lastError set. We retry once after a short delay to give the SW time
  // to restart.
  function sendMessage(msg, cb, _retried) {
    try {
      chrome.runtime.sendMessage(msg, response => {
        if (chrome.runtime.lastError) {
          const err = chrome.runtime.lastError.message || "";
          const isDeadWorker =
            err.includes("Could not establish connection") ||
            err.includes("The message port closed") ||
            err.includes("Extension context invalidated");
          if (isDeadWorker && !_retried) {
            // Wait 150ms for the service worker to spin back up, then retry once
            setTimeout(() => sendMessage(msg, cb, true), 150);
          } else {
            cb({ success: false, error: err });
          }
          return;
        }
        cb(response);
      });
    } catch (e) {
      if (!_retried) {
        setTimeout(() => sendMessage(msg, cb, true), 150);
      } else {
        cb({ success: false, error: e.message });
      }
    }
  }

  // ── Runtime message listener (for keyboard shortcut) ───────────
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "SHORTCUT_OPEN") {
      const sel  = window.getSelection();
      const text = sel?.toString().trim();
      if (!text || !JAPANESE_REGEX.test(text) || text.length > 20) return;
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      // Convert viewport rect to document coords for positionPanel
      const docRect = {
        left: rect.left, right: rect.right,
        top: rect.top, bottom: rect.bottom,
        width: rect.width, height: rect.height
      };
      openPanel(text, docRect);
    }
  });

  // ── Selection detection ─────────────────────────────────────────
  document.addEventListener("mouseup", e => {
    // Don't process selections made inside the panel
    if (panel?.contains(e.target)) return;
    setTimeout(() => {
      const sel  = window.getSelection();
      const text = sel?.toString().trim();
      if (!text || !JAPANESE_REGEX.test(text) || text.length > 20) { hideTrigger(); return; }
      showTrigger(sel.getRangeAt(0).getBoundingClientRect(), text);
    }, 10);
  });

  // Only hide the trigger on outside clicks — never close the panel
  document.addEventListener("mousedown", e => {
    if (triggerBtn?.contains(e.target) || panel?.contains(e.target)) return;
    hideTrigger();
  });
})();
