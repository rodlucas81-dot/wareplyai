// Proxies requests to the Anthropic Messages API.
// The API key is held as a Netlify environment variable (ANTHROPIC_API_KEY)
// so it's never exposed to the browser.

export default async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }
  if (req.method !== "POST") {
    return json({ error: { message: "Method not allowed" } }, 405);
  }

  const apiKey = Netlify.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return json({ error: { message: "Server is missing ANTHROPIC_API_KEY env var" } }, 500);
  }

  let body;
  try {
    body = await req.text();
    JSON.parse(body);
  } catch {
    return json({ error: { message: "Invalid JSON body" } }, 400);
  }

  const upstream = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body
  });

  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: { ...corsHeaders(), "Content-Type": "application/json" }
  });
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders(), "Content-Type": "application/json" }
  });
}

export const config = { path: "/api/claude" };
