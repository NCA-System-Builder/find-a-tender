// ── search.js ──
// Handles API fetching, pagination, and the main search loop.
// Runs Find a Tender and Contracts Finder in parallel.
// Calls onSearchComplete() in ui.js when results are ready.

const FT_URL = 'https://hzagpyjeauqkqffvptti.supabase.co/functions/v1/tender-proxy';
const CF_URL = 'https://hzagpyjeauqkqffvptti.supabase.co/functions/v1/contracts-finder-proxy';

async function fetchPage(url) {
  const response = await fetch(url, {
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(60000)
  });
  if (!response.ok) {
    if (response.status === 429) throw new Error('Rate limit reached. Please wait a moment and try again.');
    if (response.status === 503) throw new Error('The service is temporarily unavailable. Please try again shortly.');
    throw new Error(`API error: ${response.status}`);
  }
  return response.json();
}

function getNextUrl(data, proxyBase) {
  const links = data.links;
  if (!links) return null;
  // Links can be a dict {next: '...'} or array [{rel:'next', href:'...'}]
  let nextHref = null;
  if (typeof links === 'object' && !Array.isArray(links)) {
    nextHref = links.next || null;
  } else if (Array.isArray(links)) {
    const next = links.find(l => l.rel === 'next');
    nextHref = next ? next.href : null;
  }
  if (!nextHref) return null;
  // Route through our proxy — strip the original domain, keep query params
  const nextUrlObj = new URL(nextHref);
  return `${proxyBase}?${nextUrlObj.searchParams.toString()}`;
}

function extractPostcode(release) {
  for (const party of (release.parties || [])) {
    if ((party.roles || []).includes('buyer')) {
      return party.address?.postalCode || null;
    }
  }
  return null;
}

function buildResult(release, matchedKeywords, source) {
  const tender = release.tender || {};
  const buyer  = release.buyer  || {};

  // Contracts Finder notice link uses GUID portion of the id field
  // e.g. "91b86688-2d51-46ff-a8eb-e42398b7b8d4-898534" -> take everything before the last hyphen-number
  let link;
  if (source === 'CF') {
    const id = release.id || '';
    // The GUID is everything up to the last -NNNNNN suffix
    const guidMatch = id.match(/^(.+)-\d+$/);
    const guid = guidMatch ? guidMatch[1] : id;
    link = `https://www.contractsfinder.service.gov.uk/Notice/${guid}`;
  } else {
    link = `https://www.find-tender.service.gov.uk/Notice/${release.id || ''}`;
  }

  return {
    ocid:     release.ocid || '',
    title:    tender.title || 'No title',
    buyer:    buyer.name   || 'Unknown',
    postcode: extractPostcode(release) || '',
    value:    tender.value?.amount ?? null,
    currency: tender.value?.currency || 'GBP',
    closes:   tender.tenderPeriod?.endDate || null,
    matched:  matchedKeywords,
    source,   // 'FT' or 'CF'
    link
  };
}

// ── Fetch all pages from one source ──
async function fetchAllPages(proxyBase, label, maxPages, searchAll, results, today, onProgress) {
  let url  = `${proxyBase}?limit=100&stages=tender`;
  let page = 1;
  let fetched = 0;

  while (page <= maxPages) {
    if (cancelled) break;

    onProgress(label, page, fetched, results.length);

    const data     = await fetchPage(url);
    const releases = data.releases || [];
    fetched += releases.length;

    for (const release of releases) {
      const matched = filterRelease(release, keywords, searchIn);
      if (!matched.length) continue;
      const result = buildResult(release, matched, label);
      if (statusMode === 'open') {
        const closes = result.closes ? new Date(result.closes) : null;
        if (closes && closes < today) continue;
      }
      results.push(result);
    }

    const nextUrl = getNextUrl(data, proxyBase);
    if (!nextUrl) break;
    url = nextUrl;
    page++;
    await new Promise(r => setTimeout(r, 500));
  }

  return fetched;
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

  document.getElementById('results-section').style.display = 'none';
  document.getElementById('empty-state').style.display     = 'none';

  setStatus('loading', 'Connecting to Find a Tender and Contracts Finder…');

  const results = [];
  const today   = new Date();
  today.setHours(0, 0, 0, 0);

  // Progress callback — shows combined live status
  let ftFetched = 0;
  let cfFetched = 0;

  function onProgress(label, page, fetched, matchCount) {
    if (label === 'FT') ftFetched = fetched;
    if (label === 'CF') cfFetched = fetched;
    setStatus('loading',
      `Searching… FT page ${page} · CF page ${page} — ` +
      `${(ftFetched + cfFetched).toLocaleString()} tenders checked, ${matchCount} match(es) found so far…`
    );
  }

  try {
    // Run both sources in parallel
    const [ftFetchedTotal, cfFetchedTotal] = await Promise.all([
      fetchAllPages(FT_URL, 'FT', maxPages, searchAll, results, today, onProgress),
      fetchAllPages(CF_URL, 'CF', maxPages, searchAll, results, today, onProgress)
    ]);

    const totalFetched = ftFetchedTotal + cfFetchedTotal;

    if (!cancelled) {
      setStatus('success',
        `Complete — ${totalFetched.toLocaleString()} tenders searched ` +
        `(${ftFetchedTotal.toLocaleString()} FT, ${cfFetchedTotal.toLocaleString()} CF). ` +
        `Found ${results.length} match(es).`
      );
    } else {
      setStatus('success',
        `Search cancelled — ${totalFetched.toLocaleString()} tenders checked, ${results.length} match(es) found.`
      );
    }

    onSearchComplete(results, totalFetched, 0);

  } catch (err) {
    setStatus('error', err.message || 'An unexpected error occurred. Please try again.');
    document.getElementById('empty-state').style.display = 'block';
    document.getElementById('empty-state').innerHTML = `
      <h3>Something went wrong</h3>
      <p>${escapeHtml(err.message)}</p>
    `;
  } finally {
    setSearching(false);
  }
}