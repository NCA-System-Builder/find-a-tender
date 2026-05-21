// ── State ──
let keywords   = [];
let searchIn   = 'both';
let statusMode = 'open';
let scopeMode  = 'all';
let allResults = [];
let cancelled  = false;

// Fallback used when keywords.txt cannot be fetched (e.g. opening via file://)
const DEFAULT_KEYWORDS = [
  'Biodiversity Net Gain', 'BNG',
  'carbon credits', 'carbon neutral',
  'nutrient mitigation', 'phosphate mitigation', 'nitrate mitigation',
  'habitat creation', 'habitat restoration', 'habitat bank',
  'biodiversity offset', 'biodiversity credits', 'ecological mitigation',
  'nature recovery', 'species recovery', 'rewilding', 'landscape recovery',
  'nutrient neutrality', 'catchment management', 'catchment sensitive farming',
  'water quality improvement', 'wetland creation', 'riparian management',
  'peatland restoration', 'phosphate credits', 'nitrate credits',
  'nature-based solutions', 'NbS', 'natural flood management',
  'green infrastructure', 'natural capital', 'ecosystem services',
  'nature recovery network', 'land management', 'agri-environment',
  'sustainable land use', 'woodland creation', 'tree planting', 'saltmarsh restoration'
];

fetch('keywords.txt')
  .then(r => r.ok ? r.text() : Promise.reject())
  .then(text => {
    const loaded = text.split('\n')
      .map(l => l.trim())
      .filter(l => l && !l.startsWith('#'));
    loaded.forEach(addKeyword);
  })
  .catch(() => DEFAULT_KEYWORDS.forEach(addKeyword));

// ── Keyword tag input ──
const keywordInput = document.getElementById('keyword-input');
const tagContainer = document.getElementById('tag-container');

keywordInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    const val = keywordInput.value.trim().replace(/,$/, '');
    if (val) { addKeyword(val); keywordInput.value = ''; }
  }
  if (e.key === 'Backspace' && keywordInput.value === '' && keywords.length) {
    removeKeyword(keywords[keywords.length - 1]);
  }
});

function addKeyword(kw) {
  kw = kw.trim();
  if (!kw || keywords.includes(kw)) return;
  keywords.push(kw);
  renderTags();
}

function removeKeyword(kw) {
  keywords = keywords.filter(k => k !== kw);
  renderTags();
}

function renderTags() {
  tagContainer.innerHTML = '';
  keywords.forEach(kw => {
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.appendChild(document.createTextNode(kw));
    const btn = document.createElement('button');
    btn.className = 'tag-remove';
    btn.textContent = '×';
    btn.addEventListener('click', () => removeKeyword(kw));
    tag.appendChild(btn);
    tagContainer.appendChild(tag);
  });
}

// ── Toggle groups ──
function setupToggle(groupId, onChange) {
  document.querySelectorAll(`#${groupId} .toggle-btn`).forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll(`#${groupId} .toggle-btn`).forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      onChange(btn.dataset.value);
    });
  });
}

setupToggle('search-in-toggle', val => { searchIn = val; });
setupToggle('status-toggle',    val => { statusMode = val; });
setupToggle('scope-toggle',     val => {
  scopeMode = val;
  document.getElementById('pages-group').style.display = val === 'pages' ? 'flex' : 'none';
});

// ── Search button state ──
function setSearching(on) {
  document.getElementById('search-btn').disabled = on;
  const cb = document.getElementById('cancel-btn');
  on ? cb.classList.add('visible') : cb.classList.remove('visible');
}

// ── Sort + render ──
function sortAndRender() {
  const sortVal = document.getElementById('sort-select').value;
  const sorted  = [...allResults].sort((a, b) => {
    switch (sortVal) {
      case 'date-asc':  { const da = a.closes || '9999', db = b.closes || '9999'; return da < db ? -1 : da > db ? 1 : 0; }
      case 'date-desc': { const da = a.closes || '',    db = b.closes || '';    return da > db ? -1 : da < db ? 1 : 0; }
      case 'value-desc': return (b.value || 0) - (a.value || 0);
      case 'value-asc':  return (a.value || 0) - (b.value || 0);
      case 'buyer-asc':  return a.buyer.localeCompare(b.buyer);
      default:           return 0;
    }
  });
  renderTable(sorted);
}

function renderTable(results) {
  const tbody = document.getElementById('results-body');
  tbody.innerHTML = '';
  const now = new Date();

  for (const r of results) {
    const tr = document.createElement('tr');

    let dateDisplay = '—';
    let dateClass   = '';
    if (r.closes) {
      const d    = new Date(r.closes);
      const days = Math.ceil((d - now) / 86400000);
      dateDisplay = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
      if (days <= 7)       dateClass = 'date-urgent';
      else if (days <= 21) dateClass = 'date-soon';
    }

    const valueDisplay = r.value != null
      ? `£${Number(r.value).toLocaleString('en-GB', { maximumFractionDigits: 0 })}`
      : '—';

    const chips = r.matched.map(k => `<span class="keyword-chip">${escapeHtml(k)}</span>`).join('');

    tr.innerHTML = `
      <td class="td-title"><a href="${escapeHtml(r.link)}" target="_blank">${escapeHtml(r.title)}</a></td>
      <td class="td-buyer">${escapeHtml(r.buyer)}</td>
      <td>${escapeHtml(r.postcode) || '—'}</td>
      <td class="td-value">${valueDisplay}</td>
      <td class="td-date ${dateClass}">${dateDisplay}</td>
      <td><div class="keyword-chips">${chips}</div></td>
    `;
    tbody.appendChild(tr);
  }
}

// ── CSV download ──
function downloadCSV() {
  if (!allResults.length) return;
  const headers = ['Title', 'Buyer', 'Postcode', 'Value (GBP)', 'Closes', 'Matched Keywords', 'OCID', 'Link'];
  const rows    = allResults.map(r => [
    r.title, r.buyer, r.postcode,
    r.value ?? '', r.closes || '',
    r.matched.join('; '), r.ocid, r.link
  ]);
  const csv  = [headers, ...rows].map(row => row.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `tenders-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Status bar ──
function setStatus(type, message) {
  const bar = document.getElementById('status-bar');
  bar.classList.add('visible');
  document.getElementById('status-text').textContent = message;
  const spinner = document.getElementById('status-spinner');
  const dot     = document.getElementById('status-dot');
  if (type === 'loading') {
    spinner.style.display = 'block';
    dot.style.display     = 'none';
  } else {
    spinner.style.display = 'none';
    dot.style.display     = 'block';
    dot.className = `status-dot ${type === 'error' ? 'error' : 'success'}`;
  }
}

// ── Utility ──
function escapeHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
