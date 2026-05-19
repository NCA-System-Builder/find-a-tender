import re
import time
import requests

# Base URL for the Find a Tender API
BASE_URL = "https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages"

# No API key needed - this is a fully open API
HEADERS = {"Accept": "application/json"}

# How many results to fetch per request (max is 100)
PAGE_SIZE = 100

# Keywords relevant to carbon and biodiversity procurement
TEST_KEYWORDS = [
    "Biodiversity Net Gain",
    "BNG",
    "biodiversity",
    "carbon",
    "carbon credits",
    "net zero",
    "carbon neutral",
    "nutrient mitigation",
    "phosphate mitigation",
    "nitrate mitigation",
]

# How many pages to fetch in one run (each page = up to 100 results)
MAX_PAGES = 5


def fetch_page(url=None, stage="tender"):
    """
    Fetch a single page of tenders from the API.
    Returns the parsed JSON response, or None if the request failed.

    Parameters:
        url   -- full URL to fetch (used for pagination). If None, fetches the first page.
        stage -- contracting stage to filter by (planning, tender, award).
                 Only used when fetching the first page.
    """
    try:
        if url:
            response = requests.get(url, headers=HEADERS, timeout=60)
        else:
            params = {
                "limit": PAGE_SIZE,
                "stages": stage,
            }
            response = requests.get(BASE_URL, headers=HEADERS, params=params, timeout=60)

        response.raise_for_status()
        return response.json()

    except requests.exceptions.Timeout:
        print("Error: The request timed out. The API may be slow or unavailable.")
        return None

    except requests.exceptions.HTTPError as e:
        print(f"Error: HTTP {response.status_code} — {e}")
        if response.status_code == 429:
            retry_after = response.headers.get("Retry-After", "a few")
            print(f"Rate limit hit. Please wait {retry_after} seconds before trying again.")
        elif response.status_code == 503:
            retry_after = response.headers.get("Retry-After", "a few")
            print(f"Service unavailable. Please wait {retry_after} seconds before trying again.")
        return None

    except requests.exceptions.ConnectionError:
        print("Error: Could not connect to the API. Check your internet connection.")
        return None

    except requests.exceptions.RequestException as e:
        print(f"Error: An unexpected error occurred — {e}")
        return None


def get_next_url(data):
    """
    Extract the next page URL from the API response links.
    Handles two formats the API may return:
      - A dict:  {'next': 'https://...'}
      - A list:  [{'rel': 'next', 'href': 'https://...'}]
    Returns the URL string, or None if there is no next page.
    """
    links = data.get("links", None)
    if isinstance(links, dict):
        return links.get("next")
    elif isinstance(links, list):
        for link in links:
            if link.get("rel") == "next":
                return link.get("href")
    return None


def extract_postcode(release):
    """
    Extract the buyer's postcode from a release.
    Returns the postcode string, or None if not found.
    """
    parties = release.get("parties", [])
    for party in parties:
        if "buyer" in party.get("roles", []):
            postcode = party.get("address", {}).get("postalCode")
            if postcode:
                return postcode
    return None


def keyword_matches(text, keyword):
    """
    Check whether a keyword appears as a whole word in the text.
    Case-insensitive. Handles multi-word phrases.
    """
    escaped = re.escape(keyword.strip())
    escaped = escaped.replace(r"\ ", r"\s+")
    pattern = rf"\b{escaped}\b"
    return bool(re.search(pattern, text, re.IGNORECASE))


def filter_by_keywords(releases, keywords, search_in="both"):
    """
    Filter releases by keywords using whole-word matching.
    A result is included if it matches ANY keyword.

    Returns a list of (release, matched_keywords) tuples.
    """
    if not keywords:
        return [(r, []) for r in releases]

    results = []
    for release in releases:
        tender      = release.get("tender", {})
        title       = tender.get("title", "")
        description = tender.get("description", "")

        matched_keywords = []
        for keyword in keywords:
            if not keyword.strip():
                continue
            if search_in == "title":
                if keyword_matches(title, keyword):
                    matched_keywords.append(keyword)
            elif search_in == "description":
                if keyword_matches(description, keyword):
                    matched_keywords.append(keyword)
            else:
                if keyword_matches(title, keyword) or keyword_matches(description, keyword):
                    matched_keywords.append(keyword)

        if matched_keywords:
            results.append((release, matched_keywords))

    return results


def print_tender_summary(release, matched_keywords=None):
    """
    Print a readable summary of a single tender release.
    """
    tender     = release.get("tender", {})
    buyer      = release.get("buyer", {})

    title       = tender.get("title", "No title available")
    description = tender.get("description", "No description available")
    status      = tender.get("status", "Unknown")
    amount      = tender.get("value", {}).get("amount", "Not specified")
    currency    = tender.get("value", {}).get("currency", "")
    end_date    = tender.get("tenderPeriod", {}).get("endDate", "No closing date")
    buyer_name  = buyer.get("name", "Unknown buyer")
    ocid        = release.get("ocid", "No ID")
    postcode    = extract_postcode(release)

    value_str = f"{amount} {currency}".strip() if amount != "Not specified" else "Not specified"

    print(f"  OCID:        {ocid}")
    print(f"  Title:       {title}")
    print(f"  Buyer:       {buyer_name}")
    print(f"  Postcode:    {postcode if postcode else 'Not provided'}")
    print(f"  Status:      {status}")
    print(f"  Value:       {value_str}")
    print(f"  Closes:      {end_date}")
    print(f"  Description: {description[:120]}{'...' if len(str(description)) > 120 else ''}")
    if matched_keywords:
        print(f"  Matched on:  {', '.join(matched_keywords)}")
    print()


def main():
    print("=== Find a Tender — Keyword Search ===")
    print(f"Keywords: {TEST_KEYWORDS}\n")

    all_matched = []
    total_fetched = 0
    next_url = None
    page = 1

    while page <= MAX_PAGES:
        print(f"Fetching page {page}...", end=" ", flush=True)
        data = fetch_page(url=next_url)

        if data is None:
            print("Failed. Stopping.")
            break

        releases = data.get("releases", [])
        total_fetched += len(releases)
        print(f"{len(releases)} results fetched.")

        matched = filter_by_keywords(releases, TEST_KEYWORDS, search_in="both")
        all_matched.extend(matched)

        next_url = get_next_url(data)
        if not next_url:
            print("No further pages available.")
            break

        page += 1
        time.sleep(1)  # Be polite to the API between requests

    # --- Print results ---
    print(f"\n=== Results ===")
    print(f"Searched {total_fetched} tenders across {page} page(s).")
    print(f"Found {len(all_matched)} match(es).\n")

    if all_matched:
        for i, (release, matched) in enumerate(all_matched, 1):
            print(f"Match {i}:")
            print_tender_summary(release, matched_keywords=matched)
    else:
        print("No matches found. Try adjusting your keywords or increasing MAX_PAGES.")


if __name__ == "__main__":
    main()