# Tender Finder — Natural Capital Advisory

A web-based tool for searching UK government procurement notices from [Find a Tender](https://www.find-tender.service.gov.uk) and [Contracts Finder](https://www.contractsfinder.service.gov.uk), filtered to surface opportunities relevant to carbon and biodiversity markets.

---

## What this does

UK public bodies are legally required to publish procurement notices when they need to buy services above a certain value. This tool automatically searches those notices across both major government platforms, filters them by relevance, and presents the results in a clean, sortable table with a downloadable CSV and an interactive map.

---

## How to use the tool

The tool is a website hosted on GitHub Pages. No installation is needed — open it in any modern browser.

1. **Keywords** are pre-loaded from `keywords.txt` when the page opens. You can add your own by typing in the keywords box and pressing Enter, or remove any by clicking on them.
2. Use the **Search in** toggle to choose whether keywords are matched against the title, description, or both.
3. Use the **Tender status** toggle to show only open tenders or include closed ones.
4. Use the **Search scope** toggle to search all available tenders (slower, more thorough) or limit to a set number of pages.
5. Click **Search**. Results from both Find a Tender and Contracts Finder are fetched and filtered in parallel.
6. Results appear in a table. Use the **Sort by** dropdown to reorder them.
7. Switch to the **Map tab** to see results plotted by postcode on an interactive UK map.
8. Click **Download CSV** at any time to export the current results.

---

## Repository structure

```
find-a-tender/
├── index.html                              # Main application page
├── keywords.txt                            # Default keyword list (one per line, # for comments)
├── styles/
│   └── main.css                            # All application styles
├── scripts/
│   ├── filter.js                           # Keyword matching logic
│   ├── search.js                           # API fetching, pagination, and search loop
│   ├── map.js                              # Leaflet map, geocoding, and marker clustering
│   ├── ui.js                               # DOM state, tags, toggles, table, CSV download
│   └── old/
│       └── fetch_tenders.py                # Original command-line Python script (archived)
├── supabase/
│   ├── config.toml                         # Supabase project configuration
│   └── functions/
│       ├── tender-proxy/
│       │   └── index.ts                    # Edge function: proxies Find a Tender API
│       └── contracts-finder-proxy/
│           └── index.ts                    # Edge function: proxies Contracts Finder API
├── requirements.txt                        # Python dependencies (archived script only)
├── .env                                    # Local environment variables (not committed)
├── .gitignore                              # Prevents secrets and cache files being committed
└── README.md                               # This file
```

---

## Architecture

The tool is a static website with no backend of its own. It works as follows:

```
Browser (GitHub Pages)
    │
    ├── scripts/search.js
    │       │
    │       ├── POST → Supabase Edge Function: tender-proxy
    │       │               │
    │       │               └── GET → Find a Tender OCDS API
    │       │
    │       └── POST → Supabase Edge Function: contracts-finder-proxy
    │                       │
    │                       └── GET → Contracts Finder OCDS API
    │
    ├── scripts/filter.js       (keyword matching, runs in browser)
    ├── scripts/map.js          (geocoding via Postcodes.io, Leaflet rendering)
    └── scripts/ui.js           (DOM, table, CSV, state)
```

**Why the proxy functions?** Browsers block direct requests to most external APIs due to security rules (CORS). The Supabase edge functions act as middlemen — the browser calls them, they call the government APIs, and return the data with the headers needed to allow browser access.

---

## Data sources

| Source | What it covers | API documentation |
|--------|---------------|-------------------|
| [Find a Tender](https://www.find-tender.service.gov.uk) | UK public contracts above the legal threshold (OJEU/Procurement Act 2023) | [Developer docs](https://www.find-tender.service.gov.uk/Developer/Documentation) |
| [Contracts Finder](https://www.contractsfinder.service.gov.uk) | UK public contracts above £10,000 (central government) and £25,000 (other public bodies) | [Developer docs](https://www.contractsfinder.service.gov.uk/apidocumentation/Notices/1/GET-Published-Notices-Latest) |
| [Postcodes.io](https://postcodes.io) | Free open-source UK postcode geocoding (for the map) | [API docs](https://postcodes.io) |

Both government APIs are fully open — no API key or registration is required. All data is published under the [Open Government Licence v3.0](http://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/).

Data is in [OCDS (Open Contracting Data Standard)](https://standard.open-contracting.org/) version 1.1.5 format.

---

## Keyword configuration

Keywords are loaded from `keywords.txt` at startup. The format is one keyword or phrase per line. Lines beginning with `#` are treated as comments and ignored.

```
# Biodiversity & habitat offsetting
Biodiversity Net Gain
BNG
habitat creation

# Carbon & net zero
carbon credits
carbon neutral
```

Keywords are matched as **whole words**, case-insensitively. `carbon` will not match `carbonate`. `BNG` will not match `bingo`. Multi-word phrases such as `Biodiversity Net Gain` are matched exactly as a phrase.

A tender is included if it matches **any** keyword in the list.

If `keywords.txt` fails to load (e.g. when running the file locally without a server), a built-in default keyword list is used automatically as a fallback.

---

## Results table

| Column | Description |
|--------|-------------|
| Title | The tender title, linked to the original notice |
| Buyer | The procuring organisation |
| Postcode | The buyer's postcode (used for map placement) |
| Value | Estimated contract value in GBP (if provided) |
| Closes | Deadline for submissions. Highlighted amber if within 21 days, red if within 7 days |
| Matched on | Which keywords triggered this result |
| Source | **FT** = Find a Tender · **CF** = Contracts Finder |

---

## Map

The map tab plots results by buyer postcode using [Leaflet](https://leafletjs.com) and [OpenStreetMap](https://www.openstreetmap.org). Postcodes are resolved to coordinates via [Postcodes.io](https://postcodes.io).

Geocoding runs in the background while you view the table, so the map is usually ready by the time you switch to it. Nearby pins are automatically clustered. A note below the map shows how many results could be mapped and how many were missing a postcode.

The map is centred on England and fits automatically to show all plotted results.

---

## CSV download

Clicking **Download CSV** exports all current results (in their current sort order) as a `.csv` file named `tenders-YYYY-MM-DD.csv`. The file includes: Title, Buyer, Postcode, Value, Closing date, Matched keywords, Source (full name), OCID, and a direct link to the notice.

---

## Supabase edge functions

The two proxy functions live in `supabase/functions/`. They are deployed to the project at `hzagpyjeauqkqffvptti.supabase.co`.

Each function:
1. Accepts a request from the browser with query parameters
2. Forwards those parameters to the relevant government API
3. Returns the JSON response with CORS headers so the browser can receive it

To redeploy after changes:

```bash
supabase functions deploy tender-proxy
supabase functions deploy contracts-finder-proxy
```

You will need the [Supabase CLI](https://supabase.com/docs/guides/cli) installed and to be logged in (`supabase login`).

---

## Running locally

The application is a static HTML/CSS/JS site and requires a local web server to run correctly (browsers block some features when opening files directly from disk).

The simplest option with Python installed:

```bash
# From the project root
python3 -m http.server 8080
```

Then open `http://localhost:8080` in your browser.

The search functionality calls the live Supabase proxy functions, so an internet connection is required.

---

## Filtering

The browser-side `filter.js` script uses whole-word regex matching across tender titles and descriptions. A tender is included if it matches any keyword in the list. This is fast, requires no external services, and works entirely in the browser with no data sent to third parties beyond the government APIs themselves.

---

## API behaviour

| Topic | Detail |
|-------|--------|
| Authentication | None required. Both government APIs are fully open. |
| Pagination | Cursor-based. Each response includes a `next` URL. The script follows it automatically until all pages are fetched or the page limit is reached. |
| Rate limiting | HTTP 429 responses are surfaced to the user with a clear message. |
| Timeouts | Requests time out after 60 seconds. The APIs can be slow — this is normal. |
| Page size | 100 results per request (the API maximum). |

---

## Troubleshooting

**Search runs but no results appear**

Keywords may not match the terminology used in recent tenders. Try broader terms (`biodiversity`, `carbon`, `environment`) or switch from "Open only" to "Include closed" to see a larger dataset.

**"Rate limit reached. Please wait a moment and try again."**

The government API has temporarily throttled requests. Wait 30–60 seconds and search again.

**"The service is temporarily unavailable."**

The Find a Tender or Contracts Finder API is down. Check [https://www.find-tender.service.gov.uk](https://www.find-tender.service.gov.uk) in your browser. This is outside our control.

**Map shows fewer pins than there are results**

Not all tenders include a buyer postcode. The map shows only those that do. The coverage note below the map shows the exact count.

**Keywords don't load on startup**

This happens when the page is opened directly from disk as a file rather than through a web server. The default keyword list is used automatically in this case. Use a local server (see Running locally above) to load keywords from `keywords.txt`.

**A tender appears in the results but the link goes to a "not found" page**

Some notices are unpublished or corrected after the API returns them. This is a data quality issue with the source, not a bug in the tool.

---

## Notes on IP and usage

The Find a Tender and Contracts Finder APIs are provided under the [Open Government Licence v3.0](http://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/). Data fetched from the APIs is public procurement information and carries no confidentiality restrictions.

---

*Built with JavaScript · Leaflet · OpenStreetMap · Supabase Edge Functions · Find a Tender OCDS API · Contracts Finder API · Postcodes.io · GitHub Pages · Claude AI*
