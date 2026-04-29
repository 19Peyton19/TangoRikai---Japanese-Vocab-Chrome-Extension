// background.js — 単語理解 v3.0

const JISHO    = "https://jisho.org/api/v1/search/words?keyword=";
const KANJI_API = "https://kanjiapi.dev/v1/kanji/";
const TATOEBA  = "https://tatoeba.org/api_v0/search?from=jpn&to=eng&limit=20&query=";

const cache = new Map();

function isKanji(ch) {
  const c = ch.codePointAt(0);
  return (c >= 0x4e00 && c <= 0x9faf) || (c >= 0x3400 && c <= 0x4dbf);
}

async function get(url) {
  if (cache.has(url)) return cache.get(url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  const data = await res.json();
  cache.set(url, data);
  return data;
}

// ── POS parser ────────────────────────────────────────────────────────────────
function parseWordType(senses) {
  if (!senses || senses.length === 0) return "";
  const pos = senses.flatMap(s => s.parts_of_speech || []);
  if (pos.length === 0) return "";

  const tags = [];

  // Verb type
  const isVerb = pos.some(p => p.toLowerCase().includes("verb"));
  if (isVerb) {
    if (pos.some(p => /ichidan/i.test(p)))        tags.push("Ichidan verb");
    else if (pos.some(p => /godan.*u\b/i.test(p))) tags.push("Godan verb (う)");
    else if (pos.some(p => /godan.*ku/i.test(p)))  tags.push("Godan verb (く)");
    else if (pos.some(p => /godan.*gu/i.test(p)))  tags.push("Godan verb (ぐ)");
    else if (pos.some(p => /godan.*su/i.test(p)))  tags.push("Godan verb (す)");
    else if (pos.some(p => /godan.*tsu/i.test(p))) tags.push("Godan verb (つ)");
    else if (pos.some(p => /godan.*nu/i.test(p)))  tags.push("Godan verb (ぬ)");
    else if (pos.some(p => /godan.*bu/i.test(p)))  tags.push("Godan verb (ぶ)");
    else if (pos.some(p => /godan.*mu/i.test(p)))  tags.push("Godan verb (む)");
    else if (pos.some(p => /godan.*ru/i.test(p)))  tags.push("Godan verb (る)");
    else if (pos.some(p => /godan/i.test(p)))      tags.push("Godan verb");
    else if (pos.some(p => /suru/i.test(p)))       tags.push("Suru verb");
    else if (pos.some(p => /kuru/i.test(p)))       tags.push("Kuru verb");
    else if (pos.some(p => /irregular/i.test(p)))  tags.push("Irregular verb");

    const isTransitive   = pos.some(p => /transitive/i.test(p) && !/intransitive/i.test(p));
    const isIntransitive = pos.some(p => /intransitive/i.test(p) && !/transitive/i.test(p));
    const isBoth         = pos.some(p => /transitive/i.test(p)) && pos.some(p => /intransitive/i.test(p));
    if (isBoth)             tags.push("transitive or intransitive");
    else if (isTransitive)  tags.push("transitive");
    else if (isIntransitive) tags.push("intransitive");
  }

  // Adjective type
  if (pos.some(p => /i-adjective/i.test(p)))        tags.push("い-adjective");
  else if (pos.some(p => /na-adjective/i.test(p)))   tags.push("な-adjective");
  else if (pos.some(p => /no-adjective/i.test(p)))   tags.push("の-adjective");
  else if (pos.some(p => /pre-noun/i.test(p)))       tags.push("Pre-noun adjective");

  // Copula
  if (pos.some(p => /copula/i.test(p) || /\bda\b/i.test(p))) tags.push("Copula");

  // Noun subtypes
  if (!isVerb && pos.some(p => /noun/i.test(p))) {
    if (pos.some(p => /proper/i.test(p)))           tags.push("Proper noun");
    else if (pos.some(p => /verbal/i.test(p)))      tags.push("Verbal noun");
    else if (pos.some(p => /adverbial/i.test(p)))   tags.push("Adverbial noun");
    else if (pos.some(p => /suffix/i.test(p)))      tags.push("Noun suffix");
    else                                             tags.push("Noun");
  }

  // Other
  if (pos.some(p => /adverb/i.test(p)))             tags.push("Adverb");
  if (pos.some(p => /particle/i.test(p)))           tags.push("Particle");
  if (pos.some(p => /conjunction/i.test(p)))        tags.push("Conjunction");
  if (pos.some(p => /interjection/i.test(p)))       tags.push("Interjection");
  if (pos.some(p => /expression/i.test(p)))         tags.push("Expression");
  if (pos.some(p => /suffix/i.test(p) && !/noun/i.test(p))) tags.push("Suffix");
  if (pos.some(p => /prefix/i.test(p)))             tags.push("Prefix");
  if (pos.some(p => /auxiliary/i.test(p)))          tags.push("Auxiliary");

  return [...new Set(tags)].join(" · ");
}

// ── Conjugation detection ─────────────────────────────────────────────────────

// Extract the kana that trails after the last kanji — this is the inflected ending
function kanaSuffix(text) {
  let i = text.length - 1;
  while (i >= 0 && !isKanji(text[i])) i--;
  return i < 0 ? text : text.slice(i + 1);
}

function isVerbEntry(entry) {
  const pos = entry?.senses?.flatMap(s => s.parts_of_speech || []) || [];
  return pos.some(p => /verb/i.test(p));
}

// Match kana suffix against ordered conjugation pattern table
function detectConjugation(inputText, dictWord, dictReading, entry) {
  if (!isVerbEntry(entry)) return null;

  // Not conjugated if the input exactly matches the dict form (word or reading)
  const exactMatch = entry?.japanese?.some(j =>
    j.word === inputText || j.reading === inputText
  );
  if (exactMatch) return null;

  const suffix = kanaSuffix(inputText);

  // Patterns ordered longest-first to avoid short suffixes swallowing long ones
  const patterns = [
    // Polite compound forms
    { ends: ['ていませんでした'],           type: 'Past negative continuous polite' },
    { ends: ['ていませんか'],               type: 'Negative continuous invitation' },
    { ends: ['ていません', 'ておりません'], type: 'Negative continuous polite' },
    { ends: ['ていました', 'ておりました'], type: 'Past continuous polite' },
    { ends: ['ています', 'ております', 'てます'], type: 'Continuous polite (ています)' },
    // Continuous / progressive
    { ends: ['ていない', 'でいない', 'てない', 'でない'], type: 'Negative continuous (ていない)' },
    { ends: ['ていた', 'でいた', 'てた', 'でた'],         type: 'Past continuous (ていた)' },
    { ends: ['ている', 'でいる'],                          type: 'Continuous (ている)' },
    // Request
    { ends: ['てください', 'でください', 'てくれ', 'でくれ'], type: 'Request (please ~)' },
    { ends: ['ないでください', 'ないでくれ'],               type: 'Negative request (please don\'t)' },
    // Completion (しまう / contracted)
    { ends: ['てしまいました', 'でしまいました'],           type: 'Completion polite past' },
    { ends: ['てしまいます', 'でしまいます'],               type: 'Completion polite' },
    { ends: ['てしまった', 'でしまった', 'ちゃった', 'じゃった'], type: 'Completion past (ended up ~ing)' },
    { ends: ['てしまう', 'でしまう', 'ちゃう', 'じゃう'],  type: 'Completion (end up ~ing)' },
    // Attempt / try
    { ends: ['てみました', 'でみました'],  type: 'Tried (polite past)' },
    { ends: ['てみます', 'でみます'],      type: 'Will try (polite)' },
    { ends: ['てみた', 'でみた'],          type: 'Tried (てみた)' },
    { ends: ['てみる', 'でみる'],          type: 'Try doing (てみる)' },
    // Permission
    { ends: ['てもいい', 'でもいい', 'てもよい', 'でもよい'], type: 'Permission (may ~)' },
    // Obligation
    { ends: ['なければならない', 'なければいけない', 'なきゃならない', 'なきゃいけない', 'ないといけない', 'なくてはいけない', 'なくてはならない'], type: 'Obligation (must ~)' },
    // After
    { ends: ['てから', 'でから'], type: 'After doing (てから)' },
    // Non-exhaustive listing
    { ends: ['たり', 'だり'], type: 'Non-exhaustive listing (たり)' },
    // Causative-passive
    { ends: ['させられた', 'らせられた'],  type: 'Causative-passive past' },
    { ends: ['させられる', 'らせられる'], type: 'Causative-passive' },
    // Causative
    { ends: ['させました', 'らせました'],  type: 'Causative polite past' },
    { ends: ['させます', 'らせます'],      type: 'Causative polite' },
    { ends: ['させた', 'らせた'],          type: 'Causative past' },
    { ends: ['させる', 'らせる'],          type: 'Causative' },
    // Passive / potential polite
    { ends: ['られました', 'れました'],    type: 'Passive/Potential polite past' },
    { ends: ['られます', 'れます'],        type: 'Passive/Potential polite' },
    // Passive / potential
    { ends: ['られた', 'れた'],            type: 'Passive/Potential past' },
    { ends: ['られる', 'れる'],            type: 'Passive / Potential' },
    // While
    { ends: ['ながら'],                    type: 'While doing (ながら)' },
    // Conditional
    { ends: ['たら', 'だら'],              type: 'Conditional (たら-form)' },
    { ends: ['えば', 'けば', 'げば', 'せば', 'てば', 'ねば', 'べば', 'めば', 'れば'], type: 'Conditional (ば-form)' },
    // Polite forms
    { ends: ['ませんでした'],              type: 'Polite past negative' },
    { ends: ['ませんか'],                  type: 'Polite invitation (ませんか)' },
    { ends: ['ましょう'],                  type: 'Polite volitional (let\'s ~)' },
    { ends: ['ました'],                    type: 'Polite past (ました)' },
    { ends: ['ません'],                    type: 'Polite negative (ません)' },
    { ends: ['ます'],                      type: 'Polite present (ます-form)' },
    // Plain forms
    { ends: ['なかった'],                  type: 'Past negative' },
    { ends: ['ない'],                      type: 'Negative (ない-form)' },
    { ends: ['よう', 'おう'],              type: 'Volitional (let\'s / intend to)' },
    { ends: ['て', 'で'],                  type: 'Te-form (connecting form)' },
    { ends: ['た', 'だ'],                  type: 'Past (た-form)' },
    { ends: ['ろ', 'よ', 'え'],            type: 'Imperative' },
  ];

  for (const { ends, type } of patterns) {
    if (ends.some(e => suffix.endsWith(e) || inputText.endsWith(e))) return type;
  }

  // Fallback: we know it's a verb and it didn't match dict form
  return 'Conjugated form';
}

// ── Find best entry for a text (exact reading/word match preferred) ────────────
function findBestEntry(data, text) {
  if (!data?.data?.length) return null;
  // 1. Exact word match
  let entry = data.data.find(e => e.japanese?.some(j => j.word === text));
  if (entry) return entry;
  // 2. Exact reading match
  entry = data.data.find(e => e.japanese?.some(j => j.reading === text));
  if (entry) return entry;
  // 3. Fall back to first result
  return data.data[0];
}

// ── HOMOPHONES ────────────────────────────────────────────────────────────────
async function getHomophones(text) {
  const mainData = await get(JISHO + encodeURIComponent(text));
  const mainEntry = findBestEntry(mainData, text);

  const jpMatch  = mainEntry?.japanese?.find(j => j.word === text || j.reading === text)
                   || mainEntry?.japanese?.[0];
  const dictWord = jpMatch?.word  || "";
  const reading  = jpMatch?.reading || jpMatch?.word || "";
  const meaning  = mainEntry?.senses?.[0]?.english_definitions?.slice(0, 2).join(", ") || "";
  const isCommon = mainEntry?.is_common || false;
  const jlpt     = mainEntry?.jlpt?.[0] || "";
  const wordType      = parseWordType(mainEntry?.senses);
  const conjugation   = detectConjugation(text, dictWord, reading, mainEntry);
  const baseWord      = conjugation ? (dictWord || reading) : null;
  const baseMeaning   = conjugation ? meaning : null;

  if (!reading) return { reading, meaning, isCommon, jlpt, wordType, conjugation, baseWord, baseMeaning, relatedWords: [] };

  const homophoneData = await get(JISHO + encodeURIComponent(reading));
  const seen = new Set([text]);
  const relatedWords = [];

  for (const entry of (homophoneData?.data || [])) {
    if (relatedWords.length >= 8) break;
    for (const jp of (entry.japanese || [])) {
      const word = jp.word || jp.reading;
      const entryReading = jp.reading || jp.word;
      if (!word || seen.has(word) || entryReading !== reading) continue;
      seen.add(word);
      relatedWords.push({
        word,
        reading: entryReading,
        meaning: entry.senses?.[0]?.english_definitions?.slice(0, 2).join(", ") || "",
        jlpt: entry.jlpt?.[0] || "",
        isCommon: entry.is_common || false
      });
      break;
    }
  }
  return { reading, meaning, isCommon, jlpt, wordType, conjugation, baseWord, baseMeaning, relatedWords };
}

// ── SYNONYMS ──────────────────────────────────────────────────────────────────
async function getSynonyms(text) {
  const mainData = await get(JISHO + encodeURIComponent(text));
  const mainEntry = mainData?.data?.[0];
  const reading = mainEntry?.japanese?.[0]?.reading || "";
  // Use first English keyword to find semantically related Japanese words
  const keyword = mainEntry?.senses?.[0]?.english_definitions?.[0] || text;

  const synData = await get(JISHO + encodeURIComponent(keyword));
  const seen = new Set([text, reading]);
  const words = [];

  for (const entry of (synData?.data || [])) {
    if (words.length >= 8) break;
    const word = entry.japanese?.[0]?.word || entry.japanese?.[0]?.reading;
    const entryReading = entry.japanese?.[0]?.reading || "";
    if (!word || seen.has(word) || seen.has(entryReading)) continue;
    seen.add(word);
    seen.add(entryReading);
    words.push({
      word,
      reading: entryReading,
      meaning: entry.senses?.[0]?.english_definitions?.slice(0, 2).join(", ") || "",
      jlpt: entry.jlpt?.[0] || "",
      isCommon: entry.is_common || false
    });
  }
  return { words };
}

// ── KANJI BREAKDOWN ───────────────────────────────────────────────────────────
async function getKanjiBreakdown(text) {
  const kanjiChars = [...new Set([...text].filter(isKanji))];
  if (kanjiChars.length === 0) return { kanji: [] };

  const results = await Promise.all(
    kanjiChars.map(ch => get(KANJI_API + encodeURIComponent(ch)).catch(() => null))
  );

  const kanji = results
    .map((data, i) => data ? {
      char: kanjiChars[i],
      meanings: data.meanings?.slice(0, 4) || [],
      onyomi: data.on_readings?.slice(0, 3) || [],
      kunyomi: data.kun_readings?.slice(0, 3) || [],
      grade: data.grade || null,
      jlpt: data.jlpt || null,
      stroke_count: data.stroke_count || null
    } : null)
    .filter(Boolean);

  return { kanji };
}

// ── WORD DETAIL (card click) ──────────────────────────────────────────────────
async function getWordDetail(word) {
  const [dictData, sentenceData] = await Promise.all([
    get(JISHO + encodeURIComponent(word)),
    get(TATOEBA + encodeURIComponent(word)).catch(() => null)
  ]);

  const entry = dictData?.data?.find(e =>
    e.japanese?.some(j => (j.word || j.reading) === word)
  ) || dictData?.data?.[0];

  const senses = (entry?.senses || []).map(s => ({
    definitions: s.english_definitions || [],
    partsOfSpeech: s.parts_of_speech || [],
    tags: s.tags || [],
    info: s.info || []
  }));

  // Parse Tatoeba sentences — pick a varied spread by character length
  // so results are useful for both beginners and advanced learners.
  const allSentences = (sentenceData?.results || [])
    .map(r => ({
      japanese: r.text,
      english: r.translations?.[0]?.[0]?.text || ""
    }))
    .filter(s => s.japanese && s.english);

  // Bucket by length: short ≤20 chars, medium 21-50, long >50
  const short  = allSentences.filter(s => s.japanese.length <= 20);
  const medium = allSentences.filter(s => s.japanese.length > 20 && s.japanese.length <= 50);
  const long   = allSentences.filter(s => s.japanese.length > 50);

  // Pick up to 2 short, 2 medium, 1 long — fall back across buckets if one is empty
  const pick = (arr, n) => arr.slice(0, n);
  const sentences = [
    ...pick(short, 2),
    ...pick(medium, 2),
    ...pick(long, 1),
    // if we have fewer than 3 total, pad from whatever is available
    ...( (short.length + medium.length + long.length < 3) ? allSentences.slice(0, 3) : [] )
  ]
    // deduplicate and cap at 5
    .filter((s, i, arr) => arr.findIndex(x => x.japanese === s.japanese) === i)
    .slice(0, 5);

  return {
    word: entry?.japanese?.[0]?.word || word,
    reading: entry?.japanese?.[0]?.reading || "",
    isCommon: entry?.is_common || false,
    jlpt: entry?.jlpt?.[0] || "",
    senses,
    sentences,
    otherForms: (entry?.japanese || []).slice(1, 4).map(j => ({
      word: j.word || "",
      reading: j.reading || ""
    }))
  };
}

// ── BUNPRO INTEGRATION ────────────────────────────────────────────────────────

// Cache the Next.js buildId — it only changes on Bunpro deploys
let cachedBuildId = null;

async function getBunproBuildId() {
  if (cachedBuildId) return cachedBuildId;
  const resp = await fetch("https://bunpro.jp/", { credentials: "include" });
  const html = await resp.text();
  // __NEXT_DATA__ is always a <script id="__NEXT_DATA__"> tag with JSON
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>({.*?})<\/script>/s);
  if (!match) throw new Error("Could not find __NEXT_DATA__ on bunpro.jp");
  const nextData = JSON.parse(match[1]);
  cachedBuildId = nextData.buildId;
  return cachedBuildId;
}

// Read the frontend_api_token cookie Bunpro sets on login
async function getBunproToken() {
  return new Promise((resolve) => {
    chrome.cookies.get(
      { url: "https://bunpro.jp", name: "frontend_api_token" },
      (cookie) => resolve(cookie?.value || null)
    );
  });
}

async function addWordToBunpro(word) {
  const token = await getBunproToken();
  if (!token) throw new Error("NOT_LOGGED_IN");

  // Step 1: Resolve word → Bunpro vocab ID via Next.js data route (no auth needed)
  const buildId = await getBunproBuildId();
  const vocabUrl = `https://bunpro.jp/_next/data/${buildId}/ja/vocabs/${encodeURIComponent(word)}.json?slug=${encodeURIComponent(word)}`;

  const vocabResp = await fetch(vocabUrl, { credentials: "include" });

  if (vocabResp.status === 404) {
    // Word not in Bunpro's vocab list
    throw new Error(`"${word}" not found in Bunpro vocabulary`);
  }
  if (!vocabResp.ok) {
    // buildId may have gone stale after a Bunpro deploy — bust the cache and retry once
    cachedBuildId = null;
    const freshBuildId = await getBunproBuildId();
    const retryUrl = `https://bunpro.jp/_next/data/${freshBuildId}/ja/vocabs/${encodeURIComponent(word)}.json?slug=${encodeURIComponent(word)}`;
    const retryResp = await fetch(retryUrl, { credentials: "include" });
    if (!retryResp.ok) throw new Error(`Vocab lookup failed: ${retryResp.status}`);
    const retryData = await retryResp.json();
    return doAddReview(retryData, word, token);
  }

  const vocabData = await vocabResp.json();
  return doAddReview(vocabData, word, token);
}

async function doAddReview(vocabData, word, token) {
  const reviewable = vocabData?.pageProps?.reviewable;
  if (!reviewable?.id) throw new Error(`Could not find Bunpro ID for "${word}"`);

  const vocabId   = reviewable.id;
  const vocabType = reviewable.type_pascal || "Vocab"; // always "Vocab" for vocab items

  // Step 2: Add to review queue
  const addResp = await fetch(
    "https://api.bunpro.jp/api/frontend/reviews/update_via_action_type",
    {
      method: "PATCH",
      headers: {
        "Authorization": `Token token=${token}`,
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({
        action_type: "add",
        deck_id: null,
        reviewables: [[vocabType, vocabId]]
      })
    }
  );

  if (!addResp.ok) {
    const body = await addResp.json().catch(() => ({}));
    throw new Error(`Bunpro add failed: ${addResp.status} — ${JSON.stringify(body)}`);
  }

  return { word };
}

// Called by options page to check login status
async function checkBunproLogin() {
  const token = await getBunproToken();
  return { loggedIn: !!token };
}

async function getKanjiWords(kanji) {
  const data = await get(JISHO + encodeURIComponent(kanji));
  const words = [];
  const seen = new Set();
  for (const entry of (data?.data || [])) {
    const word = entry.japanese?.[0]?.word || entry.japanese?.[0]?.reading;
    if (!word || seen.has(word) || !([...word].some(ch => ch === kanji))) continue;
    seen.add(word);
    words.push({
      word,
      reading: entry.japanese[0]?.reading || "",
      meaning: entry.senses?.[0]?.english_definitions?.slice(0, 2).join(", ") || "",
      jlpt: entry.jlpt?.[0] || "",
      isCommon: entry.is_common || false
    });
    if (words.length >= 12) break;
  }
  return { words };
}

// ── Keyboard shortcut ─────────────────────────────────────────────────────────
chrome.commands.onCommand.addListener((command) => {
  if (command === "open-panel") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { type: "SHORTCUT_OPEN" });
      }
    });
  }
});


chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handlers = {
    ANALYZE_JAPANESE: () => getHomophones(message.text),
    GET_SYNONYMS:     () => getSynonyms(message.text),
    GET_KANJI:        () => getKanjiBreakdown(message.text),
    GET_WORD_DETAIL:  () => getWordDetail(message.word),
    GET_KANJI_WORDS:  () => getKanjiWords(message.kanji),
    ADD_TO_BUNPRO:       () => addWordToBunpro(message.word),
    CHECK_BUNPRO_LOGIN:  () => checkBunproLogin(),
    OPEN_OPTIONS:        () => { chrome.runtime.openOptionsPage(); return Promise.resolve({}); }
  };

  const handler = handlers[message.type];
  if (!handler) return false;

  handler()
    .then(data => sendResponse({ success: true, data }))
    .catch(err => sendResponse({ success: false, error: err.message }));
  return true;
});
