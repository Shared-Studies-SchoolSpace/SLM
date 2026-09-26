/* ============================================================
   HanziNA — Supabase Integration Service
   Handles User Authentication (Signup with Email, Username, Password;
   Login with Username & Password) and Reading Sessions persistence.
   Reads credentials from .env.
   ============================================================ */
(function (global) {
  "use strict";

  var client = null;
  var config = {
    url: "",
    anonKey: "",
    table: "reading_sessions",
    profilesTable: "profiles"
  };
  var initialized = false;
  var initPromise = null;

  /**
   * Parse a plain-text .env file into key-value pairs
   */
  function parseEnvText(text) {
    var env = {};
    if (!text || typeof text !== "string") return env;
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
        env[key] = val;
      }
    }
    return env;
  }

  /**
   * Attempt to load .env by checking possible paths (relative to workspace and root)
   */
  async function loadEnv() {
    // 1. Check window.__ENV__ or global.__ENV__ if injected or pre-configured
    var globalEnv = (typeof window !== "undefined" && window.__ENV__) ||
                    (typeof global !== "undefined" && global.__ENV__);
    if (globalEnv && typeof globalEnv === "object") {
      return globalEnv;
    }

    // 2. Check process.env if running in Node / build environment
    if (typeof process !== "undefined" && process.env) {
      var nUrl = process.env.PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
      var nKey = process.env.PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;
      if (nUrl && nKey) {
        return {
          SUPABASE_URL: nUrl,
          SUPABASE_ANON_KEY: nKey,
          SUPABASE_TABLE: process.env.SUPABASE_TABLE || "reading_sessions"
        };
      }
    }

    // 3. Fetch from .env candidate paths in browser
    var candidatePaths = ["./.env", "../.env", "/.env"];
    for (var i = 0; i < candidatePaths.length; i++) {
      try {
        var res = await fetch(candidatePaths[i], { cache: "no-store" });
        if (res.ok) {
          var text = await res.text();
          var parsed = parseEnvText(text);
          var pUrl = parsed.PUBLIC_SUPABASE_URL || parsed.SUPABASE_URL || parsed.VITE_SUPABASE_URL || parsed.NEXT_PUBLIC_SUPABASE_URL;
          var pKey = parsed.PUBLIC_SUPABASE_ANON_KEY || parsed.SUPABASE_ANON_KEY || parsed.VITE_SUPABASE_ANON_KEY || parsed.NEXT_PUBLIC_SUPABASE_ANON_KEY || parsed.SUPABASE_KEY;
          if (pUrl && pKey) {
            return {
              SUPABASE_URL: pUrl,
              SUPABASE_ANON_KEY: pKey,
              SUPABASE_TABLE: parsed.SUPABASE_TABLE || "reading_sessions"
            };
          }
        }
      } catch (e) {
        // Silently skip unreadable paths (e.g. 404 or CORS)
      }
    }
    return {};
  }

  /**
   * Initialize Supabase client from loaded .env configuration
   * @param {Object} [overrideEnv] - Optional direct config override
   */
  async function init(overrideEnv) {
    if (initialized && !overrideEnv) return client;
    if (initPromise && !overrideEnv) return initPromise;

    initPromise = (async function () {
      var env = overrideEnv || (await loadEnv());
      config.url = env.PUBLIC_SUPABASE_URL || env.SUPABASE_URL || env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || "";
      config.anonKey = env.PUBLIC_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.SUPABASE_KEY || "";
      config.table = env.SUPABASE_TABLE || "reading_sessions";
      config.profilesTable = "profiles";

      var sbLib = (typeof window !== "undefined" && window.supabase) ||
                  (typeof global !== "undefined" && global.supabase);

      if (config.url && config.anonKey) {
        if (sbLib && typeof sbLib.createClient === "function") {
          try {
            client = sbLib.createClient(config.url, config.anonKey);
            initialized = true;
            console.info("[HanziNA] Supabase client initialized successfully.");
          } catch (err) {
            console.warn("[HanziNA] Failed to create Supabase client:", err);
          }
        } else {
          console.warn("[HanziNA] Supabase JS library (@supabase/supabase-js) not loaded yet.");
        }
      } else {
        console.info("[HanziNA] No Supabase credentials found in .env yet.");
      }
      return client;
    })();

    return initPromise;
  }

  function isConfigured() {
    return !!client;
  }

  /* ============================================================
     AUTHENTICATION METHODS
     ============================================================ */

  /**
   * Sign up with email, username, and password
   * @param {Object} params - { email, username, password }
   */
  async function signUp(params) {
    await init();
    if (!client) {
      return {
        success: false,
        error: "Supabase connection is not configured in .env. Please add PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_ANON_KEY."
      };
    }

    var email = (params.email || "").trim().toLowerCase();
    var username = (params.username || "").trim();
    var password = params.password || "";

    if (!email || email.indexOf("@") === -1) {
      return { success: false, error: "Please enter a valid email address." };
    }
    if (!username || username.length < 3) {
      return { success: false, error: "Username must be at least 3 characters long." };
    }
    if (!/^[a-zA-Z0-9_\-\.]+$/.test(username)) {
      return { success: false, error: "Username can only contain letters, numbers, underscores, hyphens, and periods." };
    }
    if (!password || password.length < 6) {
      return { success: false, error: "Password must be at least 6 characters long." };
    }

    try {
      // Check if username is already taken in profiles table
      var check = await client
        .from(config.profilesTable)
        .select("id")
        .ilike("username", username)
        .maybeSingle();

      if (check.data && check.data.id) {
        return { success: false, error: "Username '" + username + "' is already taken. Please choose another." };
      }

      // Sign up with Supabase Auth
      var authRes = await client.auth.signUp({
        email: email,
        password: password,
        options: {
          data: {
            username: username
          }
        }
      });

      if (authRes.error) {
        return { success: false, error: authRes.error.message };
      }

      var user = authRes.data.user;
      if (user && user.id) {
        // Record profile in profiles table
        var profileRow = {
          id: user.id,
          username: username,
          email: email,
          updated_at: new Date().toISOString()
        };
        var profRes = await client
          .from(config.profilesTable)
          .upsert(profileRow, { onConflict: "id" });

        if (profRes.error) {
          console.warn("[HanziNA] Profile upsert notice:", profRes.error.message);
        }

        return {
          success: true,
          user: user,
          session: authRes.data.session,
          profile: profileRow
        };
      }

      return { success: true, user: user, session: authRes.data.session };
    } catch (err) {
      console.warn("[HanziNA] SignUp exception:", err);
      return { success: false, error: err.message || "An unexpected error occurred during signup." };
    }
  }

  /**
   * Log in with username and password
   * @param {Object} params - { username, password }
   */
  async function signIn(params) {
    await init();
    if (!client) {
      return {
        success: false,
        error: "Supabase connection is not configured in .env. Please add PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_ANON_KEY."
      };
    }

    var loginInput = (params.username || "").trim();
    var password = params.password || "";

    if (!loginInput) {
      return { success: false, error: "Please enter your username." };
    }
    if (!password) {
      return { success: false, error: "Please enter your password." };
    }

    try {
      var targetEmail = "";
      var usernameStr = loginInput;

      if (loginInput.indexOf("@") !== -1) {
        // User typed their email directly
        targetEmail = loginInput.toLowerCase();
      } else {
        // Look up email associated with the username in profiles table
        var profRes = await client
          .from(config.profilesTable)
          .select("id, email, username")
          .ilike("username", loginInput)
          .maybeSingle();

        if (profRes.error) {
          console.warn("[HanziNA] Username lookup query error:", profRes.error.message);
        }

        if (!profRes.data || !profRes.data.email) {
          return { success: false, error: "No account found with username '" + loginInput + "'." };
        }
        targetEmail = profRes.data.email;
        usernameStr = profRes.data.username || loginInput;
      }

      // Authenticate with Supabase Auth
      var authRes = await client.auth.signInWithPassword({
        email: targetEmail,
        password: password
      });

      if (authRes.error) {
        return { success: false, error: authRes.error.message };
      }

      return {
        success: true,
        user: authRes.data.user,
        session: authRes.data.session,
        username: usernameStr
      };
    } catch (err) {
      console.warn("[HanziNA] SignIn exception:", err);
      return { success: false, error: err.message || "An unexpected error occurred during sign in." };
    }
  }

  /**
   * Sign out current user
   */
  async function signOut() {
    await init();
    if (client && client.auth) {
      try {
        await client.auth.signOut();
      } catch (e) {
        console.warn("[HanziNA] SignOut notice:", e);
      }
    }
    return { success: true };
  }

  /**
   * Get current authenticated user and profile
   */
  async function getCurrentUser() {
    await init();
    if (!client || !client.auth) return null;

    try {
      var res = await client.auth.getUser();
      if (!res.data || !res.data.user) return null;

      var user = res.data.user;
      var username = (user.user_metadata && user.user_metadata.username) || "";

      // Also query profiles for updated username
      var profRes = await client
        .from(config.profilesTable)
        .select("username")
        .eq("id", user.id)
        .maybeSingle();

      if (profRes.data && profRes.data.username) {
        username = profRes.data.username;
      }

      return {
        id: user.id,
        email: user.email,
        username: username || user.email.split("@")[0]
      };
    } catch (e) {
      return null;
    }
  }

  /**
   * Subscribe to auth state changes
   * @param {Function} callback - (event, session) => void
   */
  function onAuthStateChange(callback) {
    if (client && client.auth && typeof client.auth.onAuthStateChange === "function") {
      return client.auth.onAuthStateChange(callback);
    }
    return { data: { subscription: { unsubscribe: function () {} } } };
  }

  /* ============================================================
     READING SESSIONS CRUD
     ============================================================ */

  /**
   * Save / Upsert a reading session to Supabase
   * @param {Object} item - { id, title, text, mapping, charCount, timestamp }
   */
  async function saveSession(item) {
    if (!item) return { success: false, error: "Empty item" };
    await init();

    if (!client) {
      return { success: false, reason: "not_configured" };
    }

    try {
      var currentUser = await getCurrentUser();
      var row = {
        id: String(item.id),
        user_id: currentUser ? currentUser.id : null,
        title: item.title,
        text: item.text,
        mapping: item.mapping,
        char_count: item.charCount || 0,
        created_at: new Date(item.timestamp || Date.now()).toISOString()
      };

      var res = await client
        .from(config.table)
        .upsert(row, { onConflict: "id" });

      if (res.error) {
        console.warn("[HanziNA] Supabase write error:", res.error.message);
        return { success: false, error: res.error };
      }
      return { success: true, data: res.data };
    } catch (err) {
      console.warn("[HanziNA] Supabase saveSession exception:", err);
      return { success: false, error: err };
    }
  }

  /**
   * Fetch reading sessions from Supabase, ordered newest first
   */
  async function fetchSessions() {
    await init();
    if (!client) {
      return null;
    }

    try {
      var query = client
        .from(config.table)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(30);

      var res = await query;
      if (res.error) {
        console.warn("[HanziNA] Supabase fetch error:", res.error.message);
        return null;
      }

      if (Array.isArray(res.data)) {
        return res.data.map(function (row) {
          return {
            id: row.id,
            title: row.title,
            text: row.text,
            mapping: row.mapping,
            charCount: row.char_count !== undefined ? row.char_count : (row.charCount || 0),
            timestamp: row.created_at ? new Date(row.created_at).getTime() : Date.now()
          };
        });
      }
      return [];
    } catch (err) {
      console.warn("[HanziNA] Supabase fetchSessions exception:", err);
      return null;
    }
  }

  /**
   * Delete a reading session from Supabase by ID
   * @param {string} id
   */
  async function deleteSession(id) {
    if (!id) return { success: false };
    await init();

    if (!client) {
      return { success: false, reason: "not_configured" };
    }

    try {
      var res = await client
        .from(config.table)
        .delete()
        .eq("id", String(id));

      if (res.error) {
        console.warn("[HanziNA] Supabase delete error:", res.error.message);
        return { success: false, error: res.error };
      }
      return { success: true };
    } catch (err) {
      console.warn("[HanziNA] Supabase deleteSession exception:", err);
      return { success: false, error: err };
    }
  }

  // Export API
  var api = {
    init: init,
    parseEnvText: parseEnvText,
    loadEnv: loadEnv,
    isConfigured: isConfigured,
    signUp: signUp,
    signIn: signIn,
    signOut: signOut,
    getCurrentUser: getCurrentUser,
    onAuthStateChange: onAuthStateChange,
    saveSession: saveSession,
    fetchSessions: fetchSessions,
    deleteSession: deleteSession,
    getConfig: function () {
      return { url: config.url, table: config.table, configured: isConfigured() };
    }
  };

  global.HanziNASupabase = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
