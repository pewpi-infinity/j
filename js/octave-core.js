// js/octave-core.js

(function () {
  const MAX_TOKENS_PER_DAY = 48;
  const BASE_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
  const STORAGE_KEY = "octave_wallet_v1";

  const els = {};

  function $(id) {
    return document.getElementById(id);
  }

  function log(type, text) {
    const line = document.createElement("div");
    line.className = "console-line " + type;
    line.innerHTML = text;
    els.console.appendChild(line);
    els.console.scrollTop = els.console.scrollHeight;
  }

  const Wallet = {
    state: null,

    load() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          this.state = parsed;
          return;
        }
      } catch (e) {
        console.warn("wallet parse error", e);
      }

      // default wallet
      const now = Date.now();
      const today = new Date().toISOString().slice(0, 10);
      this.state = {
        balance: 10,
        lastEarnedAt: 0,
        earnedToday: 0,
        day: today,
      };
      this.save();
    },

    save() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
      } catch (e) {
        console.warn("wallet save error", e);
      }
    },

    normalizeDay() {
      const today = new Date().toISOString().slice(0, 10);
      if (this.state.day !== today) {
        this.state.day = today;
        this.state.earnedToday = 0;
        this.save();
      }
    },

    canEarnBase() {
      this.normalizeDay();
      const now = Date.now();
      if (this.state.earnedToday >= MAX_TOKENS_PER_DAY) return false;
      const elapsed = now - (this.state.lastEarnedAt || 0);
      return elapsed >= BASE_INTERVAL_MS;
    },

    earnBaseToken(reason) {
      if (!this.canEarnBase()) return false;
      const now = Date.now();
      this.state.balance += 1;
      this.state.earnedToday += 1;
      this.state.lastEarnedAt = now;
      this.save();
      UI.updateTokenCount();
      UI.walletGlow();
      log(
        "system",
        `[system] Earned <token>+1 INF</token> from base time (${reason}).`
      );
      return true;
    },

    awardTaskTokens(amount, reason) {
      // For later: big jumps for real work.
      this.normalizeDay();
      const remaining = MAX_TOKENS_PER_DAY - this.state.earnedToday;
      if (remaining <= 0) {
        log("system", "[system] Daily token cap reached. No further awards today.");
        return 0;
      }
      const grant = Math.min(amount, remaining);
      if (grant <= 0) return 0;

      this.state.balance += grant;
      this.state.earnedToday += grant;
      this.state.lastEarnedAt = Date.now();
      this.save();
      UI.updateTokenCount();
      UI.walletGlow();
      log(
        "system",
        `[system] Task reward <token>+${grant} INF</token> — ${reason} (daily cap: ${MAX_TOKENS_PER_DAY}).`
      );
      return grant;
    },
  };

  const TokenEngine = {
    timerId: null,

    init() {
      Wallet.load();
      UI.updateTokenCount();
      this.checkNow("boot");
      // check once per minute
      this.timerId = setInterval(() => this.checkNow("heartbeat"), 60_000);
      log("system", "[system] Token engine loaded. Baseline: 1 INF per 30 minutes, max 48/day.");
    },

    checkNow(reason) {
      Wallet.earnBaseToken(reason);
    },
  };

  const UI = {
    mode: "conversate",
    colorMode: "infinity",

    init() {
      els.console = $("console");
      els.modeLabel = $("modeLabel");
      els.input = $("input");
      els.postBtn = $("postBtn");
      els.walletBtn = $("walletBtn");
      els.tokenCount = $("tokenCount");

      // Mode buttons
      document.querySelectorAll("[data-mode-btn]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const mode = btn.getAttribute("data-mode-btn");
          this.setMode(mode);
        });
      });

      // Color mode toggles
      document.querySelectorAll("[data-color-mode]").forEach((pill) => {
        pill.addEventListener("click", () => {
          const mode = pill.getAttribute("data-color-mode");
          this.setColorMode(mode);
        });
      });

      // Post button + Enter key
      els.postBtn.addEventListener("click", () => this.submitInput());
      els.input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          this.submitInput();
        }
      });

      // First lines
      log(
        "system",
        "[system] Infinity Octave Terminal ready. Type to converse, encode, retrieve, build or post."
      );
      log(
        "system",
        "[system] Tokens accrue from time and tasks — not spam. Think of it as pay for thinking, not typing."
      );
    },

    setMode(mode) {
      this.mode = mode;
      els.modeLabel.textContent =
        mode === "conversate"
          ? "Conversate"
          : mode === "secret"
          ? "Secret Encode"
          : mode === "retrieve"
          ? "Retrieve"
          : mode === "builder"
          ? "Builder"
          : "Post";

      document.querySelectorAll("[data-mode-btn]").forEach((btn) => {
        const m = btn.getAttribute("data-mode-btn");
        btn.classList.toggle("active", m === mode);
      });

      log("system", `[system] Mode switched to ${this.mode}.`);
    },

    setColorMode(mode) {
      this.colorMode = mode;
      document.querySelectorAll("[data-color-mode]").forEach((pill) => {
        const m = pill.getAttribute("data-color-mode");
        pill.classList.toggle("active", m === mode);
      });

      if (mode === "plain") {
        els.console.style.filter = "none";
      } else {
        els.console.style.filter = "drop-shadow(0 0 14px rgba(41,217,255,0.65))";
      }

      log("system", `[system] Color mode set to ${mode}.`);
    },

    submitInput() {
      const text = (els.input.value || "").trim();
      if (!text) return;

      log("you", `[you] ${text}`);
      els.input.value = "";

      // register "activity" but NOT automatic tokens
      this.handleAI(text);
    },

    handleAI(text) {
      let reply;

      if (this.mode === "secret") {
        reply = this.handleSecret(text);
      } else if (this.mode === "retrieve") {
        reply = this.handleRetrieve(text);
      } else if (this.mode === "builder") {
        reply = this.handleBuilder(text);
      } else if (this.mode === "post") {
        reply = this.handlePost(text);
      } else {
        reply = this.handleConversate(text);
      }

      log("ai", `<span class="ai-tag">[ai]</span> Echo: ${reply}`);
    },

    handleConversate(text) {
      return text;
    },

    handleSecret(text) {
      const reversed = text.split("").reverse().join("");
      return `encoded(${reversed})`;
    },

    handleRetrieve(text) {
      return `retrieving memory stub for: "${text}" (future: hook into Octave log index)`;
    },

    handleBuilder(text) {
      return `builder mode heard: "${text}". Future: this text spawns mini-apps, scripts and blueprints.`;
    },

    handlePost(text) {
      return `post draft: "${text}". Future: syncs with Infinity marketplace / social posting lanes.`;
    },

    updateTokenCount() {
      if (!els.tokenCount) return;
      els.tokenCount.textContent = Wallet.state.balance.toString();
    },

    walletGlow() {
      if (!els.walletBtn) return;
      els.walletBtn.classList.add("wallet-glow");
      setTimeout(() => {
        els.walletBtn.classList.remove("wallet-glow");
      }, 1800);
    },
  };

  document.addEventListener("DOMContentLoaded", () => {
    UI.init();
    TokenEngine.init();
  });
})();
/* === C5: SELF-EXPANDING SCRIPT ENGINE ======================= */

if (!window.OctaveScriptSpace) {
    window.OctaveScriptSpace = [];
}

let ChapterSize = 50;
let ChapterLog = [];
let ChapterNumber = 1;

function writeToScriptSpace(mode, text) {
    const entry = {
        ts: Date.now(),
        mode: mode,
        text: text
    };

    ChapterLog.push(entry);
    OctaveScriptSpace.push(entry);

    // Auto-chaptering for infinite memory without slowdown
    if (ChapterLog.length >= ChapterSize) {
        OctaveScriptSpace.push({
            chapter: ChapterNumber,
            summary: `Completed chapter ${ChapterNumber} (${ChapterSize} entries)`
        });

        ChapterLog = [];
        ChapterNumber++;

        Wallet.awardTaskTokens(1, "memory chapter written");
    }
}

// Hook conversational posts
function logUser(text) {
    writeToScriptSpace("user", text);
}

function logAI(text) {
    writeToScriptSpace("ai", text);
}

// Retrieve engine
function retrieveMemory(filter = {}) {
    return OctaveScriptSpace.filter(entry => {
        if (filter.mode && entry.mode !== filter.mode) return false;
        if (filter.keyword && !entry.text?.includes(filter.keyword)) return false;
        if (filter.after && entry.ts < filter.after) return false;
        return true;
    });
}

// Save/restore (local only, per your design)
function saveMemory() {
    localStorage.setItem("octave_memory", JSON.stringify(OctaveScriptSpace));
}

function loadMemory() {
    let stored = localStorage.getItem("octave_memory");
    if (stored) {
        OctaveScriptSpace = JSON.parse(stored);
    }
}

window.addEventListener("beforeunload", saveMemory);
window.addEventListener("load", loadMemory);

/* === END C5 ================================================= */

