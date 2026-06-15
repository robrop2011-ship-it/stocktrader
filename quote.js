// /api/quote.js
// Vercel Serverless Function — proxies Finnhub quote requests.
// Keeps the Finnhub API key on the server; the browser never sees it.
//
// REQUIRED SETUP:
// In your Vercel project settings -> Environment Variables, add:
//   FINNHUB_API_KEY = <your finnhub api key>
// Then redeploy. Do NOT put the key in this file or any frontend file.

export default async function handler(req, res) {
  const { symbol } = req.query;

  if (!symbol) {
    res.status(400).json({ error: 'Missing required query param: symbol' });
    return;
  }

  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'Server is not configured with FINNHUB_API_KEY' });
    return;
  }

  try {
    const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${apiKey}`;
    const finnhubRes = await fetch(url);

    if (!finnhubRes.ok) {
      res.status(finnhubRes.status).json({ error: `Finnhub error: ${finnhubRes.statusText}` });
      return;
    }

    const data = await finnhubRes.json();

    // Cache briefly at the edge to reduce upstream calls (Finnhub free tier
    // is rate-limited per minute).
    res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=30');
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch from Finnhub', details: String(err) });
  }
}
