/* ============================================================
   HanziNA — Unified Environment Configuration Loader
   Reads environment variables from .env, process.env, or window.__ENV__
   ============================================================ */
(function (global) {
  "use strict";

  // Default configuration — client-side defaults with override support
  var defaultEnv = {
    SUPABASE_URL: "https://swnzwsohgpjlceplnfcg.supabase.co",
    SUPABASE_ANON_KEY: "sb_publishable_ejODqwhAMKFrgXlvXMY-Ag_YWKaip6g",
    SUPABASE_TABLE: "reading_sessions",
    OPENAI_API_KEY: "",
    OPENAI_MODEL: "gpt-4o-mini"
  };

  /**
   * Parse a plain-text .env file into key-value pairs
   */
  function parseEnvText(text) {
    var res = {};
    if (!text || typeof text !== "string") return res;
    var lines = text.split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line || line.charAt(0) === "#") continue;
      var eqIdx = line.indexOf("=");
      if (eqIdx !== -1) {
        var key = line.slice(0, eqIdx).trim();
        var val = line.slice(eqIdx + 1).trim();
        // Strip enclosing double or single quotes
        if (
          (val.charAt(0) === '"' && val.charAt(val.length - 1) === '"') ||
          (val.charAt(0) === "'" && val.charAt(val.length - 1) === "'")
        ) {
          val = val.slice(1, -1);
        }
        res[key] = val;
      }
    }
    return res;
  }

  var envPromise = null;

  /**
   * Attempt to load .env from filesystem, server, or candidate paths, merging with defaults
   */
  async function loadEnv() {
    if (envPromise) return envPromise;

    envPromise = (async function () {
      var merged = Object.assign({}, defaultEnv, global.__ENV__ || {});

      try {
        if (typeof localStorage !== "undefined") {
          var lsSbUrl = localStorage.getItem("hanzina_supabase_url");
          var lsSbKey = localStorage.getItem("hanzina_supabase_key");
          var lsOaiKey = localStorage.getItem("hanzina_openai_key");
          if (lsSbUrl) merged.SUPABASE_URL = lsSbUrl;
          if (lsSbKey) merged.SUPABASE_ANON_KEY = lsSbKey;
          if (lsOaiKey) merged.OPENAI_API_KEY = lsOaiKey;
        }
      } catch (e) {}

      if (typeof process !== "undefined" && process.env) {
        Object.assign(merged, process.env);
      }

      // If running in Node.js environment
      if (typeof require === "function") {
        try {
          var fs = require("fs");
          var path = require("path");
          var nodePaths = [
            path.resolve(process.cwd(), ".env"),
            path.resolve(process.cwd(), "workspace/.env"),
            path.resolve(__dirname, ".env"),
            path.resolve(__dirname, "../.env")
          ];
          for (var j = 0; j < nodePaths.length; j++) {
            if (fs.existsSync(nodePaths[j])) {
              var fText = fs.readFileSync(nodePaths[j], "utf8");
              var fParsed = parseEnvText(fText);
              Object.assign(merged, fParsed);
              break;
            }
          }
        } catch (e) { }
      }

      // If running in browser environment (only fetch if running over HTTP/HTTPS; file:// origin is null and blocked by CORS)
      var isFileProtocol = typeof window !== "undefined" && window.location && window.location.protocol === "file:";
      if (!isFileProtocol && typeof fetch === "function") {
        var candidatePaths = ["./.env", "../.env", "/.env"];
        for (var i = 0; i < candidatePaths.length; i++) {
          try {
            var res = await fetch(candidatePaths[i], { cache: "no-store" });
            if (res.ok) {
              var text = await res.text();
              var parsed = parseEnvText(text);
              Object.assign(merged, parsed);
              break;
            }
          } catch (e) {
            // Skip unreadable path (e.g. CORS or 404)
          }
        }
      } else if (isFileProtocol) {
        console.info("[HanziNA] Running via file:// protocol. Using embedded environment defaults.");
      }

      global.__ENV__ = merged;
      return merged;
    })();

    return envPromise;
  }

  // Pre-initialize environment
  global.__ENV__ = Object.assign({}, defaultEnv, global.__ENV__ || {});
  loadEnv();

  var api = {
    loadEnv: loadEnv,
    get: function (key, fallback) {
      var e = global.__ENV__ || defaultEnv;
      return e[key] !== undefined ? e[key] : (fallback || "");
    }
  };

  global.HanziNAEnv = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
