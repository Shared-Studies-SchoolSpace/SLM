/* ============================================================
   HanziNA — OpenAI Translation & Word Mapping Service
   Automatically generates occurrence-ordered Chinese word mappings
   AND a full natural English translation using OpenAI Chat Completions.
   Credentials and model are read directly from the environment (.env).
   ============================================================ */
(function (global) {
  "use strict";

  var DEFAULT_MODEL = "gpt-4o-mini";
  var CJK_GLOBAL_RE = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/g;

  /**
   * Build the API prompt asking the model for BOTH:
   *   - mapping: occurrence-ordered Hanzi(pinyin,english) tokens
   *   - translation: a fluent natural English sentence (no pinyin)
   * Response format: raw JSON object — no markdown, no fences.
   */
  function buildPrompt(text) {
    var textClean = (text || "").trim();
    return (
      "You are a Chinese language assistant for the HanziNA reader. Given the Chinese text below, respond with a JSON object containing exactly two keys:\n\n" +
      "1. \"mapping\": the occurrence-ordered word mapping string. Rules:\n" +
      "   - Format: Hanzi(pinyin,english) for each lexical unit.\n" +
      "   - Map Chinese words/characters ONLY. Do NOT include or map punctuation (，, 。, ！, ？ etc.).\n" +
      "   - One entry per occurrence, in the EXACT sequence of the text.\n" +
      "   - Every Chinese character must be accounted for in order. Do not skip repeated characters.\n" +
      "   - Separate entries with a single space.\n" +
      "   - pinyin field: tone-marked Mandarin Pinyin (e.g. tàichū). NOT English.\n" +
      "   - english field: concise English gloss/definition.\n\n" +
      "2. \"translation\": a fluent, natural English translation of the full passage. No pinyin. No word-by-word gloss. Write it as a proper English sentence or paragraph.\n\n" +
      "Respond with ONLY the raw JSON object — no markdown, no code fences, no explanation.\n\n" +
      "EXAMPLE INPUT: 太初有道，道与神同在，道就是神。\n" +
      "EXAMPLE OUTPUT: {\"mapping\":\"太初(tàichū,in the beginning) 有(yǒu,was) 道(dào,the Word) 道(dào,the Word) 与(yǔ,with) 神(shén,God) 同在(tóngzài,with) 道(dào,the Word) 就是(jiùshì,was) 神(shén,God)\",\"translation\":\"In the beginning was the Word, and the Word was with God, and the Word was God.\"}\n\n" +
      "Chinese text:\n" +
      textClean
    );
  }

  /**
   * Build a human-readable copy-paste prompt (for the Copy Prompt button / manual AI use).
   * Explains both outputs so the user can paste it into Gemini / ChatGPT.
   */
  function buildCopyPrompt(text) {
    var textClean = (text || "").trim();
    return (
      "Please process the following Chinese text for the HanziNA reader and return a JSON object with TWO fields:\n\n" +
      "1. \"mapping\": occurrence-ordered word mapping. Format: Hanzi(pinyin,english) per lexical unit, space-separated, in exact text order. Include every Chinese character. Omit punctuation.\n" +
      "2. \"translation\": a fluent, natural English translation of the full passage. No pinyin. Proper English only.\n\n" +
      "Output ONLY the raw JSON — no markdown, no code fences, no explanation.\n\n" +
      "Chinese text:\n" +
      textClean
    );
  }

  /**
   * Sanitize AI output to guarantee format integrity and remove any accidental punctuation artifacts
   */
  function sanitizeMapping(raw) {
    if (!raw || typeof raw !== "string") return "";

    // Remove markdown code fences
    var text = raw.replace(/```[a-z]*\n?/gi, "").replace(/```/g, "").trim();

    // Normalize full-width brackets and commas
    text = text.replace(/（/g, "(").replace(/）/g, ")").replace(/，/g, ",");

    var tokens = [];
    var ENTRY_RE = /([^\s()]+)\(([^()]*)\)/g;
    var m;

    while ((m = ENTRY_RE.exec(text)) !== null) {
      var rawHanzi = m[1];
      var body = m[2];

      // Keep only CJK characters in Hanzi part
      var cleanHanzi = (rawHanzi.match(CJK_GLOBAL_RE) || []).join("");
      if (!cleanHanzi) {
        // Skip tokens that contain only punctuation (e.g. ，(,) or 。(.))
        continue;
      }

      var parts = body.split(",");
      var pinyin = (parts.shift() || "").trim();
      var english = parts.join(",").trim();

      if (pinyin && english) {
        tokens.push(cleanHanzi + "(" + pinyin + "," + english + ")");
      }
    }

    return tokens.length > 0 ? tokens.join(" ") : text;
  }

  /**
   * Get API key from environment
   */
  function getAPIKey() {
    if (global.HanziNAEnv && typeof global.HanziNAEnv.get === "function") {
      var key = global.HanziNAEnv.get("OPENAI_API_KEY");
      if (key && key.trim()) return key.trim();
    }

    var env = (typeof window !== "undefined" && window.__ENV__) ||
              (typeof global !== "undefined" && global.__ENV__) ||
              (typeof process !== "undefined" && process.env) || {};

    return (env.OPENAI_API_KEY || "").trim();
  }

  /**
   * Get selected OpenAI model from environment
   */
  function getModel() {
    if (global.HanziNAEnv && typeof global.HanziNAEnv.get === "function") {
      var model = global.HanziNAEnv.get("OPENAI_MODEL");
      if (model && model.trim()) return model.trim();
    }

    var env = (typeof window !== "undefined" && window.__ENV__) ||
              (typeof global !== "undefined" && global.__ENV__) ||
              (typeof process !== "undefined" && process.env) || {};

    return (env.OPENAI_MODEL || DEFAULT_MODEL).trim();
  }

  /**
   * Check if OpenAI integration is configured in environment
   */
  function isConfigured() {
    return !!getAPIKey();
  }

  /**
   * Call OpenAI API to generate the occurrence-ordered word mapping
   * AND a full natural English translation.
   *
   * Returns: { mapping: string, translation: string }
   */
  async function generateOpenAIMapping(text, options) {
    options = options || {};

    // Ensure environment is fully loaded if async loader exists
    if (global.HanziNAEnv && typeof global.HanziNAEnv.loadEnv === "function") {
      await global.HanziNAEnv.loadEnv();
    }

    var apiKey = (options.apiKey || getAPIKey()).trim();
    var model  = (options.model  || getModel()).trim();

    if (!apiKey) {
      throw new Error("OPENAI_API_KEY_MISSING");
    }

    var textClean = (text || "").trim();
    if (!textClean) {
      throw new Error("EMPTY_TEXT");
    }

    var prompt = buildPrompt(textClean);

    var response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + apiKey
      },
      body: JSON.stringify({
        model: model,
        temperature: 0.1,
        messages: [
          { role: "user", content: prompt }
        ]
      })
    });

    if (!response.ok) {
      var errData = {};
      try { errData = await response.json(); } catch (e) {}
      var errMsg = (errData.error && errData.error.message) || ("HTTP " + response.status);

      if (response.status === 401) {
        throw new Error("INVALID_API_KEY: " + errMsg);
      } else if (response.status === 429) {
        throw new Error("RATE_LIMIT_EXCEEDED: " + errMsg);
      } else {
        throw new Error("OPENAI_API_ERROR: " + errMsg);
      }
    }

    var data = await response.json();
    var content = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "";

    if (!content.trim()) {
      throw new Error("EMPTY_AI_RESPONSE");
    }

    // Parse JSON response { mapping, translation }
    var mapping     = "";
    var translation = "";
    try {
      // Strip any accidental markdown fences before parsing
      var jsonStr = content.replace(/```[a-z]*\n?/gi, "").replace(/```/g, "").trim();
      var parsed  = JSON.parse(jsonStr);
      mapping     = (parsed.mapping     || "").trim();
      translation = (parsed.translation || "").trim();
    } catch (e) {
      // Fallback: model didn't return JSON — treat whole content as mapping
      mapping     = content;
      translation = "";
    }

    // Sanitize the mapping string to ensure 100% HanziNA format compliance
    var sanitized = sanitizeMapping(mapping);

    return { mapping: sanitized, translation: translation };
  }

  var api = {
    getAPIKey: getAPIKey,
    getModel: getModel,
    isConfigured: isConfigured,
    buildPrompt: buildPrompt,
    buildCopyPrompt: buildCopyPrompt,
    sanitizeMapping: sanitizeMapping,
    generateOpenAIMapping: generateOpenAIMapping
  };

  global.HanziNAOpenAI = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
