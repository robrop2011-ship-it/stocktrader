// /api/top30.js
// Vercel Serverless Function — fetches quotes for the top 30 tracked
// tickers from Finnhub. Uses Promise.all for concurrent REST calls
// (same as before) but with better error handling and logging so you
// can see exactly what's failing in Vercel's function logs.
//
// REQUIRED SETUP:
// Vercel project settings -> Environment Variables:
//   FINNHUB_API_KEY = <your finnhub api key>
// Then redeploy.

const TOP_30 = [
  'AAPL','MSFT','NVDA','AMZN','GOOGL','META','TSLA','BRK.B','AVGO','LLY',
  'JPM','V','UNH','XOM','WMT','MA','PG','JNJ','HD','COST',
  'NFLX','AMD','ORCL','CRM','BAC','ADBE','PEP','KO','DIS','INTC'
];

export default async function handler(req, res) {
  // --- CORS: allow your frontend to call this ---
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const apiKey = process.env.FINNHUB_API_KEY;

  // Log so you can see this in Vercel Function Logs
  console.log('FINNHUB_API_KEY present:', !!apiKey);

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
          const text = await r.text();

          if (!r.ok) {
            console.error(`Finnhub error for ${symbol}: ${r.status} ${text}`);
            return { symbol, error: true };
          }

          const data = JSON.parse(text);

          // Finnhub returns { c:0, d:null, ... } for invalid/unknown symbols
          if (!data.c) {
            console.warn(`No price data for ${symbol}:`, text);
            return { symbol, error: true };
          }

          return {
            symbol,
            price:     data.c,
            change:    data.d,
            changePct: data.dp,
            high:      data.h,
            low:       data.l,
            open:      data.o,
            prevClose: data.pc
          };
        } catch (symErr) {
          console.error(`Exception fetching ${symbol}:`, symErr);
          return { symbol, error: true };
        }
      })
    );

    console.log('Successful quotes:', results.filter(r => !r.error).length);

    res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=45');
    res.status(200).json({ updated: Date.now(), quotes: results });
  } catch (err) {
    console.error('Top-level handler error:', err);
    res.status(500).json({ error: 'Failed to fetch quotes', details: String(err) });
  }
}
