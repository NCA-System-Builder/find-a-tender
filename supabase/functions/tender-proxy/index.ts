const TENDER_API = "https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages";

Deno.serve(async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "content-type, authorization",
      },
    });
  }

  try {
    // Get the query string from the incoming request
    const url = new URL(req.url);
    const params = url.searchParams.toString();

    // Build the full API URL, passing through any query parameters
    const apiUrl = params ? `${TENDER_API}?${params}` : TENDER_API;

    // Fetch from the real API
    const response = await fetch(apiUrl, {
      headers: { "Accept": "application/json" },
    });

    const data = await response.json();

    // Return the data to the browser with CORS headers
    return new Response(JSON.stringify(data), {
      status: response.status,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
});