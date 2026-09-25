/* ============================================================
   HanziNA — Learner Controlled Chinese Representation System
   Modularized JS · Gemini-Style Material 3 Interface
   ============================================================ */
(function (global) {
  "use strict";

  /* ---------------- Core (pure) logic ---------------- */

  // CJK unified ideographs (+ extensions A, compatibility)
  var CJK_RE = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/;
  var CJK_GLOBAL_RE = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/g;

  // Accept full-width variants as well as ASCII punctuation
  function normalizeMapping(raw) {
    return raw
      .replace(/（/g, "(")
      .replace(/）/g, ")")
      .replace(/，/g, ",");
  }

  /**
   * Parse the mapping string into occurrence-ordered entries.
   * Format per entry: Hanzi(pinyin,english)
   * Returns { entries: [{hanzi,pinyin,english,index}], errors: [{index,token,message}] }
   */
  function parseMapping(raw) {
    var entries = [];
    var errors = [];
    var norm = normalizeMapping(raw);

    var ENTRY_RE = /([^\s()]+)\(([^()]*)\)/g;
    var cursor = 0;
    var position = 0;
    var m;

    function reportLeftover(fragment) {
      fragment.split(/\s+/).filter(function (t) { return t.length > 0; }).forEach(function (tok) {
        position++;
        errors.push({
          index: position, token: tok,
          message: "Entry " + position + " is malformed: \u201C" + tok + "\u201D. Expected format: Hanzi(pinyin,english)."
        });
      });
    }

    while ((m = ENTRY_RE.exec(norm)) !== null) {
      reportLeftover(norm.slice(cursor, m.index));
      cursor = ENTRY_RE.lastIndex;
      position++;
      var i = position;
      var hanzi = m[1];
      var parts = m[2].split(",");
      var pinyin = (parts.shift() || "").trim();
      var english = parts.join(",").trim();

      var token = m[0];
      if (!pinyin) {
        errors.push({
          index: i, token: token,
          message: "Entry " + i + " (\u201C" + hanzi + "\u201D) is missing its Pinyin."
        });
        continue;
      }
      if (!english) {
        errors.push({
          index: i, token: token,
          message: "Entry " + i + " (\u201C" + hanzi + "\u201D) is missing its English meaning."
        });
        continue;
      }
      if (!CJK_RE.test(hanzi)) {
        errors.push({
          index: i, token: token,
          message: "Entry " + i + " (\u201C" + hanzi + "\u201D) does not contain any Chinese character."
        });
        continue;
      }
      entries.push({ hanzi: hanzi, pinyin: pinyin, english: english, index: entries.length });
    }
    reportLeftover(norm.slice(cursor));

    return { entries: entries, errors: errors };
  }

  function extractHanzi(text) {
    return (text.match(CJK_GLOBAL_RE) || []).join("");
  }

  /**
   * Validate both inputs. Returns an array of human-readable error strings.
   * Empty array means everything is valid.
   */
  function validateInputs(textRaw, mappingRaw) {
    var errors = [];

    if (!textRaw || !textRaw.trim()) {
      errors.push("The Chinese text is empty. Paste the passage you want to learn.");
    }
    if (!mappingRaw || !mappingRaw.trim()) {
      errors.push("The word mapping is empty. Click '+' or 'Copy Prompt' to generate mappings.");
    }
    if (errors.length) return errors;

    var parsed = parseMapping(mappingRaw);
    parsed.errors.forEach(function (e) { errors.push(e.message); });
    if (!parsed.entries.length) return errors;

    var expected = extractHanzi(textRaw);
    var provided = parsed.entries.map(function (e) { return e.hanzi; }).join("");

    if (provided !== expected) {
      var msg = "The mapping does not match the Chinese text: the text contains " +
        expected.length + " Chinese character" + (expected.length === 1 ? "" : "s") +
        ", but the " + parsed.entries.length + " mapping entr" +
        (parsed.entries.length === 1 ? "y accounts" : "ies account") + " for " + provided.length + ".";
      var k = 0;
      while (k < Math.min(expected.length, provided.length) && expected[k] === provided[k]) k++;
      if (k < Math.max(expected.length, provided.length)) {
        msg += " The first mismatch is at character " + (k + 1) +
          " — text has \u201C" + (expected[k] || "∅") + "\u201D, mapping has \u201C" +
          (provided[k] || "∅") + "\u201D.";
      }
      msg += " Remember: one entry per occurrence, in exact order.";
      errors.push(msg);
    }
    return errors;
  }

  /**
   * Build sequence of words and punctuation
   */
  function buildSequence(text, entries) {
    var seq = [];
    var entryIdx = 0;
    var i = 0;
    while (i < text.length) {
      var ch = text[i];
      if (CJK_RE.test(ch)) {
        var entry = entries[entryIdx];
        seq.push({ type: "word", hanzi: entry.hanzi, pinyin: entry.pinyin, english: entry.english, entryIndex: entryIdx });
        i += entry.hanzi.length;
        entryIdx++;
      } else if (/\s/.test(ch)) {
        seq.push({ type: "space" });
        i++;
      } else {
        seq.push({ type: "punct", ch: ch });
        i++;
      }
    }
    return seq;
  }

  var core = {
    parseMapping: parseMapping,
    extractHanzi: extractHanzi,
    validateInputs: validateInputs,
    buildSequence: buildSequence
  };

  // Node export for testing
  if (typeof module !== "undefined" && module.exports) {
    module.exports = core;
  }

  /* ---------------- UI Layer (Browser Only) ---------------- */
  if (typeof document === "undefined") return;

  var $ = function (sel) { return document.querySelector(sel); };

  // 15 Validated CTAs (Interview Approved)
  var CTA_LIST = [
    "Welcome, {username}",
    "What Chinese passage are we unlocking today, {username}?",
    "Take the stage, {username}",
    "Ready when you are, {username}",
    "Unravel the characters, {username}",
    "One character at a time, {username}",
    "Where does your story begin today, {username}?",
    "Bring your characters to life, {username}",
    "Let's decode some Hanzi, {username}",
    "Your words, your pace, {username}",
    "Read on your own terms, {username}",
    "Step into the text, {username}",
    "What would you like to master today, {username}?",
    "Paste a passage, discover its meaning, {username}",
    "What are you waiting for, {username}"
  ];

  var EXAMPLE_TEXT = "太初有道，道与神同在，道就是神。";
  var EXAMPLE_MAPPING =
    "太初(tàichū,In the beginning) 有(yǒu,was) 道(dào,the Word) " +
    "道(dào,the Word) 与(yǔ,with) 神(shén,God) 同在(tóngzài,was) " +
    "道(dào,the Word) 就是(jiùshì,was) 神(shén,God)";



  var activePopup = null;
  var activeWord = null;
  var pinyinOn = true;
  var ctaIndex = 0;

  /* ----- User State & Dynamic Name ----- */
  function getUser() {
    var raw = localStorage.getItem("hanzina_user");
    if (raw) {
      try {
        var parsed = JSON.parse(raw);
        if (parsed && parsed.firstName && parsed.firstName !== "Victor") return parsed;
      } catch (e) {}
    }
    return { fullName: "Learner", firstName: "Learner" };
  }

  function saveUser(user) {
    localStorage.setItem("hanzina_user", JSON.stringify(user));
    renderUserUI();
    renderCTA();
  }

  function renderUserUI() {
    var user = getUser();
    var nameEl = $("#user-name-display");
    var avatarEl = $("#user-avatar");
    if (nameEl) nameEl.textContent = user.fullName || user.firstName;
    if (avatarEl) {
      var initial = (user.firstName || user.fullName || "V").charAt(0).toUpperCase();
      avatarEl.textContent = initial;
    }
  }

  /* ----- Dynamic CTA Renderer & Cycle on Load ----- */
  function renderCTA() {
    var user = getUser();
    var ctaEl = $("#landing-cta");
    if (!ctaEl) return;
    var template = CTA_LIST[ctaIndex % CTA_LIST.length];
    var rendered = template.replace(/\{username\}/gi, user.firstName || "Learner");
    ctaEl.textContent = rendered;
  }

  function cycleCTA() {
    var stored = null;
    try {
      stored = localStorage.getItem("hanzina_cta_index");
    } catch (e) {}
    var nextIndex = 0;
    if (stored !== null) {
      var parsed = parseInt(stored, 10);
      if (!isNaN(parsed)) {
        nextIndex = (parsed + 1) % CTA_LIST.length;
      }
    }
    ctaIndex = nextIndex;
    try {
      localStorage.setItem("hanzina_cta_index", String(ctaIndex));
    } catch (e) {}
    renderCTA();
  }

  /* ----- Sidebar Collapse State ----- */
  function initSidebar() {
    var sidebar = $("#sidebar");
    var isCollapsed = localStorage.getItem("hanzina_sidebar_collapsed") === "true";
    if (window.innerWidth <= 768) {
      isCollapsed = true;
    }
    applySidebarState(isCollapsed);

    var collapseBtn = $("#sidebar-collapse-btn");
    var expandBtn = $("#sidebar-expand-btn");

    if (collapseBtn) {
      collapseBtn.addEventListener("click", function () {
        applySidebarState(true);
      });
    }

    if (expandBtn) {
      expandBtn.addEventListener("click", function () {
        applySidebarState(false);
      });
    }
  }

  function applySidebarState(collapsed) {
    var sidebar = $("#sidebar");
    var main = $("#main-area");
    if (!sidebar) return;

    if (collapsed) {
      sidebar.classList.add("collapsed");
      if (main) main.classList.add("sidebar-collapsed");
    } else {
      sidebar.classList.remove("collapsed");
      if (main) main.classList.remove("sidebar-collapsed");
    }
    localStorage.setItem("hanzina_sidebar_collapsed", String(collapsed));
  }

  /* ----- History Management (localStorage) ----- */
  function getHistory() {
    var raw = localStorage.getItem("hanzina_history");
    if (raw) {
      try {
        var list = JSON.parse(raw);
        if (Array.isArray(list)) {
          var filtered = list.filter(function (h) {
            return h && h.id !== "seed-1" && h.id !== "seed-2";
          });
          if (filtered.length !== list.length) {
            localStorage.setItem("hanzina_history", JSON.stringify(filtered));
          }
          return filtered;
        }
      } catch (e) {}
    }
    return [];
  }

  function saveHistoryItem(text, mapping) {
    var list = getHistory();
    var preview = extractHanzi(text).slice(0, 16) || text.trim().slice(0, 16);
    var item = {
      id: "hist-" + Date.now(),
      title: preview + (text.length > 16 ? "…" : ""),
      text: text,
      mapping: mapping,
      charCount: extractHanzi(text).length,
      timestamp: Date.now()
    };
    // Prepend and limit to 30 items
    list = [item].concat(list.filter(function (h) {
      return h.text !== text;
    })).slice(0, 30);
    localStorage.setItem("hanzina_history", JSON.stringify(list));
    renderHistory();
  }

  function deleteHistoryItem(id, e) {
    if (e) e.stopPropagation();
    var list = getHistory().filter(function (h) { return h.id !== id; });
    localStorage.setItem("hanzina_history", JSON.stringify(list));
    renderHistory();
    toast("info", "Removed from history", "Session was deleted from recents.");
  }

  function loadHistoryItem(id) {
    var item = getHistory().find(function (h) { return h.id === id; });
    if (!item) return;

    $("#chinese-text").value = item.text;
    $("#mapping-input").value = item.mapping;
    updateCounters();
    openMappingDrawer();
    generateReading(false); // don't duplicate in history
    toast("success", "Loaded session", item.title);
  }

  function renderHistory(filterQuery) {
    var listEl = $("#recents-list");
    if (!listEl) return;
    listEl.innerHTML = "";

    var items = getHistory();
    if (filterQuery && filterQuery.trim()) {
      var q = filterQuery.trim().toLowerCase();
      items = items.filter(function (it) {
        return it.title.toLowerCase().indexOf(q) !== -1 || it.text.toLowerCase().indexOf(q) !== -1;
      });
    }

    if (!items.length) {
      var emptyLi = document.createElement("li");
      emptyLi.className = "recents-empty";
      emptyLi.textContent = "Nothing to see here";
      listEl.appendChild(emptyLi);
      return;
    }

    items.forEach(function (item) {
      var li = document.createElement("li");
      li.className = "recents-item";
      li.setAttribute("role", "button");
      li.setAttribute("tabindex", "0");

      var iconSpan = document.createElement("span");
      iconSpan.className = "material-symbols-outlined recents-icon";
      iconSpan.textContent = "chat_bubble_outline";

      var textSpan = document.createElement("span");
      textSpan.className = "recents-title";
      textSpan.textContent = item.title;

      var deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "recents-del-btn";
      deleteBtn.title = "Delete from history";
      deleteBtn.setAttribute("aria-label", "Delete " + item.title);
      deleteBtn.innerHTML = '<span class="material-symbols-outlined">delete</span>';

      deleteBtn.addEventListener("click", function (e) {
        deleteHistoryItem(item.id, e);
      });

      li.appendChild(iconSpan);
      li.appendChild(textSpan);
      li.appendChild(deleteBtn);

      li.addEventListener("click", function () {
        loadHistoryItem(item.id);
      });

      li.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          loadHistoryItem(item.id);
        }
      });

      listEl.appendChild(li);
    });
  }

  /* ----- Mapping Field Visibility & Layout Controls ----- */
  function showMappingField(shouldFocus) {
    var mappingCard = $("#mapping-card");
    var container = $("#input-container");
    var layout = $("#input-layout");
    var landingContent = $(".landing-content");
    var plusBtn = $("#toggle-mapping-btn");
    var plusIcon = $("#plus-icon");

    if (mappingCard) {
      mappingCard.hidden = false;
      mappingCard.classList.add("open");
    }
    if (container) container.classList.add("has-mapping");
    if (layout) layout.classList.add("has-mapping");
    if (landingContent) landingContent.classList.add("has-mapping");
    if (plusBtn) plusBtn.setAttribute("aria-expanded", "true");
    if (plusIcon) plusIcon.textContent = "remove";

    if (shouldFocus) {
      var mInput = $("#mapping-input");
      if (mInput) mInput.focus();
    }
    updateGenerateButtonState();
  }

  function hideMappingField() {
    var mappingCard = $("#mapping-card");
    var container = $("#input-container");
    var layout = $("#input-layout");
    var landingContent = $(".landing-content");
    var plusBtn = $("#toggle-mapping-btn");
    var plusIcon = $("#plus-icon");

    if (mappingCard) {
      mappingCard.hidden = true;
      mappingCard.classList.remove("open");
    }
    if (container) container.classList.remove("has-mapping");
    if (layout) layout.classList.remove("has-mapping");
    if (landingContent) landingContent.classList.remove("has-mapping");
    if (plusBtn) plusBtn.setAttribute("aria-expanded", "false");
    if (plusIcon) plusIcon.textContent = "add";

    updateGenerateButtonState();
  }

  function toggleMappingField() {
    var mappingCard = $("#mapping-card");
    if (!mappingCard) return;
    if (mappingCard.hidden) {
      showMappingField(true);
    } else {
      hideMappingField();
    }
  }

  // Compatibility aliases
  var openMappingDrawer = showMappingField;
  var closeMappingDrawer = hideMappingField;
  var toggleMappingDrawer = toggleMappingField;

  /* ----- Generate Button State (Disabled until mapping is pasted/entered) ----- */
  function updateGenerateButtonState() {
    var mappingInput = $("#mapping-input");
    var m = (mappingInput ? mappingInput.value : "").trim();
    var btn = $("#generate-btn");
    if (!btn) return;

    var hasMapping = m.length > 0;
    btn.disabled = !hasMapping;
    if (hasMapping) {
      btn.removeAttribute("disabled");
      btn.title = "Generate Reading Session";
      btn.setAttribute("aria-disabled", "false");
    } else {
      btn.setAttribute("disabled", "disabled");
      btn.title = "Paste word mapping to generate reading";
      btn.setAttribute("aria-disabled", "true");
    }
  }

  /* ----- Copy Prompt Feature (for Gemini/ChatGPT) ----- */
  function copyAIPrompt() {
    var text = ($("#chinese-text").value || "").trim();
    if (!text) {
      toast("info", "Please enter Chinese text first", "Paste or type your Chinese passage into the field before copying the prompt.");
      $("#chinese-text").focus();
      return;
    }

    var prompt =
      "Please generate the word mapping for the following Chinese text for the HanziNA reader.\n\n" +
      "STRICT FORMAT REQUIREMENTS:\n" +
      "- Output ONLY mapped lexical units/words in the exact format: Hanzi(pinyin,english)\n" +
      "- One entry per occurrence, in the EXACT sequence of the text.\n" +
      "- Preserve occurrence order.\n" +
      "- Separate entries with a single space.\n" +
      "- Do NOT include any introduction, explanations, markdown formatting (like ```), or conversational filler—only the raw mapped tokens.\n\n" +
      "Chinese text:\n" +
      text;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(prompt).then(function () {
        onPromptCopied();
      }).catch(function () {
        fallbackCopyText(prompt);
      });
    } else {
      fallbackCopyText(prompt);
    }
  }

  function fallbackCopyText(text) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
      onPromptCopied();
    } catch (e) {
      toast("error", "Copy failed", "Could not copy automatically. Please copy the text manually.");
    }
    ta.remove();
  }

  function onPromptCopied() {
    // When the prompt has been copied, reveal mapping field beside (desktop) or below (mobile)
    showMappingField(true);

    var copyBtn = $("#copy-prompt-btn");
    if (copyBtn) {
      copyBtn.classList.add("copied");
      setTimeout(function () {
        copyBtn.classList.remove("copied");
      }, 1600);
    }

    toast(
      "success",
      "AI Prompt Copied!",
      "Paste it into Gemini or ChatGPT to get the exact word mapping, then paste the result here."
    );
  }

  /* ----- Toasts (MD3 Floating Snackbar) ----- */
  function toast(type, title, message) {
    var root = $("#toast-root");
    if (!root) return;
    var el = document.createElement("div");
    el.className = "toast " + type;
    el.setAttribute("role", "status");
    var icon = type === "error" ? "error" : type === "success" ? "check_circle" : "info";
    el.innerHTML =
      '<div class="toast-icon"><span class="material-symbols-outlined">' + icon + '</span></div>' +
      '<div class="toast-body"><strong></strong><span></span></div>';
    el.querySelector("strong").textContent = title;
    el.querySelector("span").textContent = message;
    root.appendChild(el);
    setTimeout(function () {
      el.classList.add("out");
      setTimeout(function () { el.remove(); }, 320);
    }, 6000);
  }

  /* ----- Counters & Auto-expand ----- */
  function updateCounters() {
    var t = $("#chinese-text").value;
    var m = $("#mapping-input").value;

    var textCountEl = $("#text-count");
    if (textCountEl) {
      var cjkCount = (extractHanzi(t) || "").length;
      textCountEl.textContent = t.length ? (t.length + " chars" + (cjkCount ? " (" + cjkCount + " Hanzi)" : "")) : "0 characters";
    }

    if (m && m.trim()) {
      var parsed = parseMapping(m);
      $("#mapping-count").textContent =
        parsed.entries.length + " entr" + (parsed.entries.length === 1 ? "y" : "ies") +
        (parsed.errors.length ? " · " + parsed.errors.length + " issue" + (parsed.errors.length === 1 ? "" : "s") : "");
    } else {
      $("#mapping-count").textContent = "0 entries";
    }

    // Auto-resize search textarea
    var ta = $("#chinese-text");
    if (ta) {
      ta.style.height = "auto";
      var nextHeight = ta.value ? Math.min(Math.max(ta.scrollHeight, 24), 220) : 24;
      ta.style.height = nextHeight + "px";
    }

    updateGenerateButtonState();
  }

  /* ----- View Switching ----- */
  function showView(id) {
    ["#input-view", "#reading-view"].forEach(function (v) {
      var el = $(v);
      if (el) el.hidden = v !== id;
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* ----- Error Panel ----- */
  function showErrors(errors) {
    var panel = $("#error-panel");
    var list = $("#error-list");
    list.innerHTML = "";
    errors.forEach(function (e) {
      var li = document.createElement("li");
      li.textContent = e;
      list.appendChild(li);
    });
    panel.hidden = false;
    panel.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  /* ----- Reading Session Logic ----- */
  function closePopup() {
    if (activePopup) { activePopup.remove(); activePopup = null; }
    if (activeWord) {
      activeWord.classList.remove("active");
      activeWord.setAttribute("aria-pressed", "false");
      activeWord = null;
    }
  }

  function openPopup(btn, item) {
    closePopup();
    var popup = document.createElement("div");
    popup.className = "char-popup";
    popup.setAttribute("role", "tooltip");
    var py = document.createElement("span");
    py.className = "cp-py";
    py.textContent = item.pinyin;
    var en = document.createElement("span");
    en.className = "cp-en";
    en.textContent = item.english;
    popup.appendChild(py);
    popup.appendChild(en);

    var host = $("#passage");
    host.appendChild(popup);
    popup.style.left = (btn.offsetLeft + btn.offsetWidth / 2) + "px";
    popup.style.top = btn.offsetTop + "px";

    activePopup = popup;
    activeWord = btn;
    btn.classList.add("active");
    btn.setAttribute("aria-pressed", "true");
  }

  function renderPassage(seq) {
    var host = $("#passage");
    host.innerHTML = "";
    closePopup();
    host.classList.toggle("pinyin-off", !pinyinOn);

    seq.forEach(function (item) {
      if (item.type === "punct") {
        var p = document.createElement("span");
        p.className = "punct";
        p.textContent = item.ch;
        host.appendChild(p);
      } else if (item.type === "space") {
        var s = document.createElement("span");
        s.className = "punct space";
        s.textContent = " ";
        host.appendChild(s);
      } else {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "word";
        btn.dataset.entryIndex = item.entryIndex;
        btn.setAttribute("aria-pressed", "false");
        btn.setAttribute("aria-label", item.hanzi + " — click for Pinyin and English");

        var pyTop = document.createElement("span");
        pyTop.className = "py-top";
        pyTop.textContent = item.pinyin;
        pyTop.setAttribute("aria-hidden", "true");

        var hz = document.createElement("span");
        hz.className = "hz";
        hz.textContent = item.hanzi;

        btn.appendChild(pyTop);
        btn.appendChild(hz);

        btn.addEventListener("click", function () {
          if (activeWord === btn) {
            closePopup();
          } else {
            openPopup(btn, item);
          }
        });

        host.appendChild(btn);
      }
    });
  }

  function generateReading(shouldSave) {
    if (shouldSave === undefined) shouldSave = true;

    var text = $("#chinese-text").value;
    var mapping = $("#mapping-input").value;
    $("#error-panel").hidden = true;

    var errors = validateInputs(text, mapping);
    if (errors.length) {
      showErrors(errors);
      openMappingDrawer();
      toast("error", "Could not generate reading", errors.length + " issue" + (errors.length === 1 ? "" : "s") + " found. See error list below.");
      return;
    }

    var parsed = parseMapping(mapping);
    var seq = buildSequence(text, parsed.entries);
    renderPassage(seq);

    var previewEl = $("#reading-passage-preview");
    if (previewEl) {
      previewEl.textContent = text.slice(0, 10) + (text.length > 10 ? "…" : "");
    }

    showView("#reading-view");

    if (shouldSave) {
      saveHistoryItem(text, mapping);
    }

    toast("success", "Reading session ready",
      parsed.entries.length + " lexical unit" + (parsed.entries.length === 1 ? "" : "s") + " loaded.");
  }

  /* ----- Theme Toggle ----- */
  function initTheme() {
    var savedTheme = localStorage.getItem("hanzina-theme");
    var prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    var theme = savedTheme || (prefersDark ? "dark" : "dark"); // Dark by default like Gemini
    applyTheme(theme);

    var toggleBtn = $("#theme-toggle");
    if (toggleBtn) {
      toggleBtn.addEventListener("click", function () {
        var current = document.documentElement.getAttribute("data-theme") || "dark";
        var next = current === "dark" ? "light" : "dark";
        applyTheme(next);
        localStorage.setItem("hanzina-theme", next);
      });
    }
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    var icon = $("#theme-icon");
    if (icon) {
      icon.textContent = theme === "dark" ? "light_mode" : "dark_mode";
    }
  }

  /* ----- User Name Modal ----- */
  function initUserModal() {
    var modal = $("#name-modal");
    var profileCard = $("#user-profile-card");
    var cancelBtn = $("#name-modal-cancel");
    var saveBtn = $("#name-modal-save");
    var input = $("#username-input");

    if (profileCard && modal) {
      profileCard.addEventListener("click", function () {
        var user = getUser();
        if (input) input.value = user.fullName || user.firstName;
        modal.showModal();
      });
    }

    if (cancelBtn && modal) {
      cancelBtn.addEventListener("click", function () {
        modal.close();
      });
    }

    if (saveBtn && modal) {
      saveBtn.addEventListener("click", function () {
        var val = (input.value || "").trim();
        if (val) {
          var parts = val.split(/\s+/);
          var firstName = parts[0];
          saveUser({ fullName: val, firstName: firstName });
          toast("success", "Name updated", "Welcome, " + firstName + "!");
        }
        modal.close();
      });
    }

    if (input) {
      input.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          e.preventDefault();
          if (saveBtn) saveBtn.click();
        }
      });
    }

    // Prompt user on site load if username not saved
    var current = getUser();
    if (current.firstName === "Learner" && modal) {
      modal.showModal();
    }

    // Help Modal
    var helpModal = $("#help-modal");
    var chipHow = $("#chip-how-it-works");
    var helpClose = $("#help-modal-close");

    if (chipHow && helpModal) {
      chipHow.addEventListener("click", function () {
        helpModal.showModal();
      });
    }
    if (helpClose && helpModal) {
      helpClose.addEventListener("click", function () {
        helpModal.close();
      });
    }
  }

  /* ----- Wiring Everything on DOM Ready ----- */
  document.addEventListener("DOMContentLoaded", function () {
    initTheme();
    renderUserUI();
    cycleCTA();
    initSidebar();
    renderHistory();
    initUserModal();
    hideMappingField();
    updateGenerateButtonState();


    // Form submission
    $("#input-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var btn = $("#generate-btn");
      if (btn && btn.disabled) {
        var mappingVal = ($("#mapping-input").value || "").trim();
        if (!mappingVal) {
          showMappingField(true);
          toast("info", "Word mapping required", "Paste your word mapping first to generate the reading session.");
          return;
        }
      }
      generateReading(true);
    });

    // Enter key inside Chinese textarea submits if mapping is present or reveals mapping
    $("#chinese-text").addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        var mappingVal = ($("#mapping-input").value || "").trim();
        if (mappingVal) {
          generateReading(true);
        } else {
          showMappingField(true);
          toast("info", "Word mapping required", "Click 'Copy Prompt' to generate mappings with Gemini or ChatGPT, then paste here.");
        }
      }
    });

    // Input listeners
    $("#chinese-text").addEventListener("input", function () {
      updateCounters();
    });

    $("#mapping-input").addEventListener("input", function () {
      updateCounters();
      updateGenerateButtonState();
    });

    $("#mapping-input").addEventListener("paste", function () {
      setTimeout(function () {
        updateCounters();
        updateGenerateButtonState();
      }, 10);
    });

    // Toggle mapping field button ("+")
    $("#toggle-mapping-btn").addEventListener("click", toggleMappingField);

    // Copy Prompt button
    $("#copy-prompt-btn").addEventListener("click", copyAIPrompt);

    // Load Example button
    function loadExample() {
      $("#chinese-text").value = EXAMPLE_TEXT;
      $("#mapping-input").value = EXAMPLE_MAPPING;
      $("#error-panel").hidden = true;
      showMappingField(false);
      updateCounters();
      updateGenerateButtonState();
      toast("info", "Example Loaded", "太初有道 — John 1:1. Press Enter or click Generate!");
    }

    $("#example-btn").addEventListener("click", loadExample);
    var chipExample = $("#chip-example");
    if (chipExample) chipExample.addEventListener("click", loadExample);

    // Clear button
    $("#clear-btn").addEventListener("click", function () {
      $("#chinese-text").value = "";
      $("#mapping-input").value = "";
      $("#error-panel").hidden = true;
      hideMappingField();
      updateCounters();
      updateGenerateButtonState();
    });

    // New reading buttons
    function onNewReading() {
      $("#chinese-text").value = "";
      $("#mapping-input").value = "";
      $("#error-panel").hidden = true;
      hideMappingField();
      updateCounters();
      updateGenerateButtonState();
      showView("#input-view");
      cycleCTA();
      $("#chinese-text").focus();
    }

    var newChatBtn = $("#new-chat-btn");
    if (newChatBtn) newChatBtn.addEventListener("click", onNewReading);
    var topNewBtn = $("#top-new-reading-btn");
    if (topNewBtn) topNewBtn.addEventListener("click", onNewReading);

    // Back button in reading session
    $("#back-btn").addEventListener("click", function () {
      closePopup();
      showView("#input-view");
    });


    // Dismiss active popup when clicking outside
    document.addEventListener("click", function (e) {
      if (activePopup && !e.target.closest(".word")) closePopup();
    });

    // Search filter in history
    var searchInput = $("#history-search-input");
    if (searchInput) {
      searchInput.addEventListener("input", function () {
        renderHistory(this.value);
      });
    }

    updateCounters();
  });

})(typeof window !== "undefined" ? window : this);
