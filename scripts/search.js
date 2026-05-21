// ── search.js ──
// Handles API fetching, pagination, and the main search loop.
// Calls onSearchComplete() in ui.js when results are ready.

const BASE_URL = 'https://hzagpyjeauqkqffvptti.supabase.co/functions/v1/tender-proxy';

async function fetchPage(url) {
  const response = await fetch(url, {
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(60000)
  });
  if (!response.ok) {
    if (response.status === 429) throw new Error('Rate limit reached. Please wait a moment and try again.');
    if (response.status === 503) throw new Error('The Find a Tender service is temporarily unavailable. Please try again shortly.');
    throw new Error(`API error: ${response.status}`);
  }
  return response.json();
}

function getNextUrl(data) {
  const links = data.links;
  if (!links) return null;
  if (typeof links === 'object' && !Array.isArray(links)) return links.next || null;
  if (Array.isArray(links)) {
    const next = links.find(l => l.rel === 'next');
    return next ? next.href : null;
  }
  return null;
}

function extractPostcode(release) {
  for (const party of (release.parties || [])) {
    if ((party.roles || []).includes('buyer')) {
      return party.address?.postalCode || null;
    }
  }
  return null;
}

function buildResult(release, matchedKeywords) {
  const tender = release.tender || {};
  const buyer  = release.buyer  || {};
  return {
    ocid:     release.ocid || '',
    title:    tender.title || 'No title',
    buyer:    buyer.name   || 'Unknown',
    postcode: extractPostcode(release) || '',
    value:    tender.value?.amount ?? null,
    currency: tender.value?.currency || 'GBP',
    closes:   tender.tenderPeriod?.endDate || null,
    matched:  matchedKeywords,
    link:     `https://www.find-tender.service.gov.uk/Notice/${release.id || ''}`
  };
}

function cancelSearch() { cancelled = true; }

async function startSearch() {
  if (keywords.length === 0) {
    setStatus('error', 'Please enter at least one keyword before searching.');
    return;
  }

  cancelled = false;
  const searchAll = scopeMode === 'all';
  const maxPages  = searchAll
    ? Infinity
    : Math.max(1, Math.min(500, parseInt(document.getElementById('pages-input').value) || 20));

  setSearching(true);

  // Reset results display
  const resultsSection = document.getElementById('results-section');
  const emptyState     = document.getElementById('empty-state');
  resultsSection.style.display = 'none';
  emptyState.style.display     = 'none';

  setStatus('loading', 'Connecting to Find a Tender…');

  let url          = `${BASE_URL}?limit=100&stages=tender`;
  let page         = 1;
  let totalFetched = 0;
  const results    = [];
  const today      = new Date();
  today.setHours(0, 0, 0, 0);

  try {
    while (page <= maxPages) {
      if (cancelled) {
        setStatus('success',
          `Search cancelled — ${page - 1} page(s) checked, ${totalFetched.toLocaleString()} tenders searched, ${results.length} match(es) found.`
        );
        break;
      }

      setStatus('loading',
        `Page ${page}${searchAll ? '' : ` of ${maxPages}`} — ${totalFetched.toLocaleString()} tenders checked, ${results.length} match(es) found so far…`
      );

      const data     = await fetchPage(url);
      const releases = data.releases || [];
      totalFetched  += releases.length;

      for (const release of releases) {
        const matched = filterRelease(release, keywords, searchIn);
        if (!matched.length) continue;
        const result = buildResult(release, matched);
        if (statusMode === 'open') {
          const closes = result.closes ? new Date(result.closes) : null;
          if (closes && closes < today) continue;
        }
        results.push(result);
      }

      const nextUrl = getNextUrl(data);
      if (!nextUrl) {
        if (!cancelled) {
          setStatus('success',
            `Complete — all ${totalFetched.toLocaleString()} tenders searched across ${page} page(s). Found ${results.length} match(es).`
          );
        }
        break;
      }

      const nextUrlObj = new URL(nextUrl);
      url = `${BASE_URL}?${nextUrlObj.searchParams.toString()}`;
      page++;
      await new Promise(r => setTimeout(r, 500));
    }

    if (!cancelled && page > maxPages) {
      setStatus('success',
        `Searched ${totalFetched.toLocaleString()} tenders across ${maxPages} page(s). Found ${results.length} match(es).`
      );
    }

    // Hand off to ui.js — it handles table rendering, map kickoff, and display
    onSearchComplete(results, totalFetched, page);

  } catch (err) {
    setStatus('error', err.message || 'An unexpected error occurred. Please try again.');
    emptyState.style.display = 'block';
    emptyState.innerHTML = `
      <h3>Something went wrong</h3>
      <p>${escapeHtml(err.message)}</p>
    `;
  } finally {
    setSearching(false);
  }
}