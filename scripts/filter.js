// ── filter.js ──
// Handles filtering of search results based on user criteria.

function keywordMatches(text, keyword) {
  if (!text) return false;
  const escaped = keyword.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\ /g, '\\s+');
  return new RegExp(`\\b${escaped}\\b`, 'i').test(text);
}

function filterRelease(release, kws, where) {
  const tender      = release.tender || {};
  const title       = tender.title || '';
  const description = release.description || tender.description || '';
  const matched     = [];

  for (const kw of kws) {
    if (!kw.trim()) continue;
    const inTitle = keywordMatches(title, kw);
    const inDesc  = keywordMatches(description, kw);
    if      (where === 'title'       && inTitle)           matched.push(kw);
    else if (where === 'description' && inDesc)            matched.push(kw);
    else if (where === 'both' && (inTitle || inDesc))      matched.push(kw);
  }
  return matched;
}
