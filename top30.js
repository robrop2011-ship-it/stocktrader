// /api/top30.js
// Vercel Serverless Function — fetches quotes for the top 30 tracked
// tickers from Finnhub using a SINGLE WebSocket connection instead of
// 30 individual REST calls. Subscribes to all symbols, collects trades
// for up to 5 seconds, then returns the latest price seen per symbol.
// Falls back to the REST /quote endpoint for any symbol that received
// no trade data during the window (e.g. outside market hours).
//
// REQUIRED SETUP:
// In your Vercel project settings -> Environment Variables, add:
//   FINNHUB_API_KEY = <your finnhub api key>
// Then redeploy.

import WebSocket from 'ws';

const TOP_30 = [
  'AAPL','MSFT','NVDA','AMZN','GOOGL','META','TSLA','BRK.B','AVGO','LLY',
  'JPM','V','UNH','XOM','WMT','MA','PG','JNJ','HD','COST',
  'NFLX','AMD','ORCL','CRM','BAC','ADBE','PEP','KO','DIS','INTC'
];

// How long to keep the WebSocket open collecting trades (ms).
// Longer = more symbols get live data; shorter = faster response.
const COLLECT_MS = 5000;

export default async function handler(req, res) {
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'Server is not configured with FINNHUB_API_KEY' });
    return;
  }

  // latest trade seen per symbol during the collection window
  const latest = {};

  try {
    await new Promise((resolve, reject) => {
      const ws = new WebSocket(`wss://ws.finnhub.io?token=${apiKey}`);

      const timeout = setTimeout(() => {
        ws.close();
        resolve();
      }, COLLECT_MS);

      ws.on('open', () => {
        // Subscribe to all 30 symbols in rapid succession — still 1 connection
        TOP_30.forEach(symbol => {
          ws.send(JSON.stringify({ type: 'subscribe', symbol }));
        });
      });

      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw);
          if (msg.type !== 'trade' || !Array.isArray(msg.data)) return;
          msg.data.forEach(trade => {
            const sym = trade.s;
            // Keep the most recent trade price for each symbol
            if (!latest[sym] || trade.t > (latest[sym].t || 0)) {
              latest[sym] = { price: trade.p, volume: trade.v, t: trade.t };
            }
          });
        } catch { /* ignore malformed frames */ }
      });

      ws.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });

      ws.on('close', () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  } catch (wsErr) {
    // WebSocket failed entirely — fall through to REST fallback below
    console.error('WebSocket error:', wsErr);
  }

  // For symbols that got no live trade during the window (common outside
  // market hours), fall back to a single REST /quote call per missing symbol.
  // This is still far fewer REST calls than before (typically 0 during
  // market hours, up to 30 after hours).
  const missing = TOP_30.filter(sym => !latest[sym]);

  if (missing.length > 0) {
    await Promise.all(
      missing.map(async (symbol) => {
        try {
          const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${apiKey}`;
          const r = await fetch(url);
          if (!r.ok) return;
          const data = await r.json();
          if (data.c) {
            latest[symbol] = {
              price:     data.c,
              prevClose: data.pc,
              change:    data.d,
              changePct: data.dp,
              high:      data.h,
              low:       data.l,
              open:      data.o,
              fromRest:  true
            };
          }
        } catch { /* skip symbol on error */ }
      })
    );
  }

  // Shape the response the same way tracker.js already expects
  const quotes = TOP_30.map(symbol => {
    const d = latest[symbol];
    if (!d) return { symbol, error: true };

    if (d.fromRest) {
      // Data came from REST fallback — already fully shaped
      return {
        symbol,
        price:     d.price,
        change:    d.change,
        changePct: d.changePct,
        high:      d.high,
        low:       d.low,
        open:      d.open,
        prevClose: d.prevClose
      };
    }

    // Data came from WebSocket trades — we only get price & volume,
    // so change/changePct will be calculated client-side from prevClose
    return {
      symbol,
      price:  d.price,
      volume: d.volume
      // change / changePct / high / low / open omitted intentionally;
      // tracker.js already handles missing fields gracefully
    };
  });

  res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=45');
  res.status(200).json({ updated: Date.now(), quotes });
}
