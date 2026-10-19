/**
 * Guardian SMS relay — Cloudflare Worker.
 *
 * Why this exists: Twilio's API doesn't send CORS headers, so a browser app
 * can't call it directly. This tiny worker holds your Twilio credentials
 * server-side and exposes one POST endpoint the app can call.
 *
 * Deploy:  npx wrangler deploy worker/sms-relay.js
 * Then set secrets (never in code):
 *   npx wrangler secret put TWILIO_SID
 *   npx wrangler secret put TWILIO_TOKEN
 *   npx wrangler secret put TWILIO_FROM      (your Twilio number, E.164)
 *   npx wrangler secret put ALLOWED_ORIGIN   (e.g. https://guardian.yourdomain.com)
 *
 * The app then just needs the worker URL in Settings → SMS alerts.
 */

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const cors = {
      "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: cors });

    // Basic origin check — not bulletproof, but stops drive-by abuse.
    if (env.ALLOWED_ORIGIN && origin && origin !== env.ALLOWED_ORIGIN) {
      return new Response("Forbidden", { status: 403, headers: cors });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return new Response("Bad JSON", { status: 400, headers: cors });
    }
    const to = String(body.to || "").trim();
    const text = String(body.body || "").trim().slice(0, 1500);
    if (!/^\+[1-9]\d{6,15}$/.test(to) || !text) {
      return new Response("Bad 'to'/'body'", { status: 400, headers: cors });
    }

    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_SID}/Messages.json`;
    const params = new URLSearchParams({ To: to, From: env.TWILIO_FROM, Body: text });
    const resp = await fetch(twilioUrl, {
      method: "POST",
      headers: {
        Authorization: "Basic " + btoa(`${env.TWILIO_SID}:${env.TWILIO_TOKEN}`),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });
    const data = await resp.text();
    return new Response(data, { status: resp.status, headers: { ...cors, "Content-Type": "application/json" } });
  },
};
