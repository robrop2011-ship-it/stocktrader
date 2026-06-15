// /api/top30.js
// Vercel Serverless Function — fetches quotes for the top 30 tracked
// tickers from Finnhub in one request to the browser, batching the
// upstream calls server-side and caching briefly at the edge.
//
// REQUIRED SETUP:
// In your Vercel project settings -> Environment Variables, add:
//   FINNHUB_API_KEY = <your finnhub api key>
// Then redeploy.

const TOP_30 = [
  'AAPL','MSFT','NVDA','AMZN','GOOGL','META','TSLA','BRK.B','AVGO','LLY',
  'JPM','V','UNH','XOM','WMT','MA','PG','JNJ','HD','COST',
  'NFLX','AMD','ORCL','CRM','BAC','ADBE','PEP','KO','DIS','INTC'
];

export default async function handler(req, res) {
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'Server is not configured with FINNHUB_API_KEY' });
    return;
  }

  try {
    const results = await Promise.all(
      TOP_30.map(async (symbol) => {
        try {
          const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${apiKey}`;
          const r = await fetch(url);
          if (!r.ok) return { symbol, error: true };
          const data = await r.json();
          return {
            symbol,
            price: data.c,      // current price
            change: data.d,     // change
            changePct: data.dp, // percent change
            high: data.h,       // day high
            low: data.l,        // day low
            open: data.o,       // open
            prevClose: data.pc  // previous close
          };
        } catch {
          return { symbol, error: true };
        }
      })
    );

    // Short edge cache: Finnhub free tier allows 60 req/min, and this
    // single call makes 30 upstream requests, so cache to avoid
    // exhausting the quota under traffic.
    res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=45');
    res.status(200).json({ updated: Date.now(), quotes: results });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch quotes', details: String(err) });
  }
}
