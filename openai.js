/* ============================================================
   HanziNA — OpenAI Translation & Word Mapping Service
   Automatically generates occurrence-ordered Chinese word mappings
   using OpenAI Chat Completions API (gpt-4o-mini / gpt-4o).
   ============================================================ */
(function (global) {
  "use strict";

  var STORAGE_KEY_API_KEY = "hanzina_openai_api_key";
  var STORAGE_KEY_MODEL = "hanzina_openai_model";
  var DEFAULT_MODEL = "gpt-4o-mini";

  /**
   * Get stored API key from localStorage or global env
   */
  function getAPIKey() {
    try {
      var key = localStorage.getItem(STORAGE_KEY_API_KEY);
      if (key && key.trim()) return key.trim();
    } catch (e) {}

    var env = (typeof window !== "undefined" && window.__ENV__) ||
              (typeof global !== "undefined" && global.__ENV__) ||
              (typeof process !== "undefined" && process.env) || {};

    return env.OPENAI_API_KEY || "";
  }

  /**
   * Save API Key to localStorage
   */
  function setAPIKey(key) {
    try {
      if (key && key.trim()) {
        localStorage.setItem(STORAGE_KEY_API_KEY, key.trim());
      } else {
        localStorage.removeItem(STORAGE_KEY_API_KEY);
      }
    } catch (e) {}
  }

  /**
   * Get selected OpenAI model
   */
  function getModel() {
    try {
      var model = localStorage.getItem(STORAGE_KEY_MODEL);
      if (model && model.trim()) return model.trim();
    } catch (e) {}

    var env = (typeof window !== "undefined" && window.__ENV__) ||
              (typeof global !== "undefined" && global.__ENV__) ||
              (typeof process !== "undefined" && process.env) || {};

    return env.OPENAI_MODEL || DEFAULT_MODEL;
  }

  /**
   * Save selected model to localStorage
   */
  function setModel(model) {
    try {
      if (model && model.trim()) {
        localStorage.setItem(STORAGE_KEY_MODEL, model.trim());
      } else {
        localStorage.removeItem(STORAGE_KEY_MODEL);
      }
    } catch (e) {}
  }

  /**
   * Call OpenAI API to generate occurrence-ordered word mapping
   */
  async function generateOpenAIMapping(text, options) {
    options = options || {};
    var apiKey = options.apiKey || getAPIKey();
    var model = options.model || getModel();

    if (!apiKey) {
      throw new Error("OPENAI_API_KEY_MISSING");
    }

    var textClean = (text || "").trim();
    if (!textClean) {
      throw new Error("EMPTY_TEXT");
    }

    var systemPrompt =
      "You are a Chinese linguistic parser and lexical segmenter for the HanziNA reader app.\n" +
      "Your job is to segment Chinese text into lexical units/words and output occurrence-ordered mappings in the exact format: Hanzi(pinyin,english)\n\n" +
      "STRICT RULES:\n" +
      "1. Output ONLY mapped tokens in format: Hanzi(pinyin,english)\n" +
      "2. Every entry corresponds to ONE occurrence in the text, in the EXACT sequence of appearance.\n" +
      "3. Separate entries with a single space.\n" +
      "4. Include accurate tone-marked Pinyin (e.g. tàichū) and concise English glosses.\n" +
      "5. Do NOT include markdown formatting (like ```), commentary, punctuation outside tokens, or extra text. Output raw tokens only.";

    var userPrompt = "Chinese text:\n" + textClean;

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
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
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

    // Clean any accidental markdown code blocks
    content = content.replace(/```[a-z]*\n?/gi, "").replace(/```/g, "").trim();

    if (!content) {
      throw new Error("EMPTY_AI_RESPONSE");
    }

    return content;
  }

  var api = {
    getAPIKey: getAPIKey,
    setAPIKey: setAPIKey,
    getModel: getModel,
    setModel: setModel,
    generateOpenAIMapping: generateOpenAIMapping
  };

  global.HanziNAOpenAI = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

})(typeof window !== "undefined" ? window : this);
