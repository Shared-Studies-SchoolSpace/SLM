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
   * Build the API prompt asking the model for two-part plain text:
   *   - mapping: occurrence-ordered Hanzi(pinyin,english) tokens
   *   - delimiter: @@@
   *   - translation: a fluent natural English sentence
   */
  function buildPrompt(text) {
    var textClean = (text || "").trim();
    return (
      "You are a Chinese-language annotation engine for the HanziNA reader. Given the Chinese text in <INPUT_TEXT>, output ONLY the following two-part plain text — no JSON, no markdown, no code fences, no labels, no commentary:\n\n" +
      "<mapping string>\n" +
      "@@@\n" +
      "<translation string>\n\n" +
      "The line containing only @@@ is a fixed delimiter. Everything before it is the mapping; everything after it is the translation. Nothing else may appear in the output.\n\n" +
      "1. Mapping — an occurrence-ordered word-mapping string.\n\n" +
      "Format: <Hanzi>(<pinyin>,<english>) per lexical unit, entries separated by a single space, no trailing space. Every slot must contain real content for that specific unit. NEVER output the words \"pinyin\", \"pīnyīn\" or \"english\" as values.\n\n" +
      "Segmentation (follow the register of the text):\n" +
      "- Modern prose: group characters into one entry when they form a standard Mandarin dictionary word or fixed expression (e.g. 太初, 同在, 就是, idioms, reduplications like 高高兴兴).\n" +
      "- Classical/literary Chinese (poetry, 文言文): most words are single characters. Group only fixed compounds and names (e.g. 木兰, 可汗, 叹息). When unsure, use single characters.\n" +
      "- Function words/particles (的, 了, 与, 在, 是, etc.) are standalone entries unless part of a fixed compound.\n" +
      "- Entries follow the exact left-to-right order of the source, including repeats — never merge or skip repeated occurrences.\n" +
      "- Self-check: concatenating the Hanzi from every entry in order must reproduce every Chinese character in the source, with nothing skipped, duplicated, or reordered.\n\n" +
      "Scope:\n" +
      "- Map Chinese (Hanzi) content ONLY.\n" +
      "- Exclude ALL punctuation, Chinese or Western (，。！？、；：\"\"''《》…—- etc.).\n" +
      "- Exclude non-Hanzi content — digits, Latin letters, symbols, whitespace.\n\n" +
      "Pinyin field:\n" +
      "- Real tone-marked Hanyu Pinyin for that unit (e.g. tàichū), syllables joined with no spaces or hyphens.\n" +
      "- Neutral tone: no diacritic (e.g. ma, de).\n" +
      "- Polyphonic characters (多音字) and fixed terms: use the reading that fits this occurrence's meaning (e.g. 还 hái vs huán; 可汗 kèhán, not kěhàn).\n" +
      "- Capitalize pinyin only for true proper nouns — personal names, places, organizations (e.g. 北京 Běijīng, 木兰 Mùlán). Common nouns stay lowercase even if the English gloss is capitalized (e.g. 神 shén → \"God\").\n\n" +
      "English field:\n" +
      "- A concise gloss for THIS occurrence's sense, not every dictionary sense.\n" +
      "- Never use a comma inside this field — it breaks the pinyin/english split. Use a semicolon for multiple senses.\n" +
      "- No parentheses inside this field.\n\n" +
      "2. Translation — a fluent, idiomatic English rendering of the full passage as normal prose. No pinyin, no gloss, no brackets, no markdown.\n\n" +
      "Edge cases:\n" +
      "- Empty or punctuation-only input → output an empty line, then @@@, then an empty line.\n" +
      "- Non-Chinese material mixed into the source: omit from the mapping, but reflect its meaning in the translation.\n" +
      "- The mapping must never contain the literal sequence @@@.\n\n" +
      "Before responding, verify silently: no entry contains the literal words pinyin/pīnyīn/english as values; the concatenated Hanzi reconstructs the source in order; no english field contains a comma; the delimiter line appears exactly once.\n\n" +
      "EXAMPLE 1 INPUT: 太初有道，道与神同在，道就是神。\n" +
      "EXAMPLE 1 OUTPUT:\n" +
      "太初(tàichū,in the beginning) 有(yǒu,was) 道(dào,the Word) 道(dào,the Word) 与(yǔ,with) 神(shén,God) 同在(tóngzài,with) 道(dào,the Word) 就是(jiùshì,was) 神(shén,God)\n" +
      "@@@\n" +
      "In the beginning was the Word, and the Word was with God, and the Word was God.\n\n" +
      "EXAMPLE 2 INPUT: 床前明月光，疑是地上霜。\n" +
      "EXAMPLE 2 OUTPUT:\n" +
      "床(chuáng,bed) 前(qián,in front of) 明月(míngyuè,bright moon) 光(guāng,light) 疑(yí,suspect) 是(shì,be) 地上(dìshàng,on the ground) 霜(shuāng,frost)\n" +
      "@@@\n" +
      "Always output the accurate output in the expected format, ensure that you do not output e.g 光(pinyin,character), but the accurate translation.\n\n" +
      "EXAMPLE 3 INPUT: 床前明月光，疑是地上霜。\n" +
      "EXAMPLE 3 OUTPUT:\n" +
      "床(chuáng,bed) 前(qián,in front of) 明月(míngyuè,bright moon) 光(guāng,light) 疑(yí,suspect) 是(shì,be) 地上(dìshàng,on the ground) 霜(shuāng,frost)\n" +
      "@@@\n" +
      "Always output the accurate output in the expected format, ensure that you do not output e.g 光(pinyin,character), but the accurate translation.\n\n" +
      "Bright moonlight falls before my bed — I wonder if it is frost upon the ground.\n\n" +
      "Chinese text:\n" +
      "<INPUT_TEXT>\n" +
      textClean + "\n" +
      "</INPUT_TEXT>"
    );
  }

  /**
   * Build a human-readable copy-paste prompt (for the Copy Prompt button / manual AI use).
   */
  function buildCopyPrompt(text) {
    return buildPrompt(text);
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
    var model = (options.model || getModel()).trim();

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
      try { errData = await response.json(); } catch (e) { }
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

    // Parse two-part plain text response: <mapping>\n@@@\n<translation>
    var mapping = "";
    var translation = "";
    var cleanContent = content.replace(/```[a-z]*\n?/gi, "").replace(/```/g, "").trim();

    var delimIdx = cleanContent.indexOf("@@@");
    if (delimIdx !== -1) {
      mapping = cleanContent.slice(0, delimIdx).trim();
      translation = cleanContent.slice(delimIdx + 3).trim();
    } else {
      // Fallback: check if model returned JSON
      try {
        var parsed = JSON.parse(cleanContent);
        mapping = (parsed.mapping || "").trim();
        translation = (parsed.translation || "").trim();
      } catch (e) {
        // Fallback: treat whole content as mapping
        mapping = cleanContent;
        translation = "";
      }
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
