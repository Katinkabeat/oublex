// TWL Scrabble word list (bundled in public/words.txt — same base list as the
// other SQ word games, kept here as Oublex's OWN copy so its dictionary can be
// tuned independently later without touching the others).
// Lazy-loaded once, cached on globalThis so HMR + multiple consumers share it.

let wordSet = null
let loadPromise = null

export async function loadDictionary() {
  if (wordSet) return wordSet
  if (loadPromise) return loadPromise
  if (typeof globalThis !== 'undefined' && globalThis.__OUBLEX_DICTIONARY__) {
    wordSet = globalThis.__OUBLEX_DICTIONARY__
    return wordSet
  }
  const base = import.meta.env?.BASE_URL ?? '/'
  loadPromise = fetch(`${base}words.txt`)
    .then(r => r.text())
    .then(text => {
      const set = new Set(text.split(/\s+/).filter(Boolean).map(w => w.toUpperCase()))
      wordSet = set
      if (typeof globalThis !== 'undefined') globalThis.__OUBLEX_DICTIONARY__ = set
      loadPromise = null
      return set
    })
  return loadPromise
}

export function isValidWord(word, set) {
  if (!set || !word) return false
  return set.has(word.toUpperCase())
}
