// ============================================================
// LIVE STOCK TRACKER
// Top 30 most-traded / popular US stocks.
// Fetches live quotes from /api/top30 — a Vercel serverless function
// that calls Finnhub server-side (keeping the API key off the client).
// Falls back to a simulated live feed if that endpoint is unavailable
// (e.g. running locally without `vercel dev`, or before env var setup).
// ============================================================

const TOP_30 = [
  { ticker: 'AAPL',  name: 'Apple Inc.' },
  { ticker: 'MSFT',  name: 'Microsoft Corp.' },
  { ticker: 'NVDA',  name: 'NVIDIA Corp.' },
  { ticker: 'AMZN',  name: 'Amazon.com Inc.' },
  { ticker: 'GOOGL', name: 'Alphabet Inc. (Class A)' },
  { ticker: 'META',  name: 'Meta Platforms Inc.' },
  { ticker: 'TSLA',  name: 'Tesla Inc.' },
  { ticker: 'BRK-B', name: 'Berkshire Hathaway (B)', finnhubSymbol: 'BRK.B' },
  { ticker: 'AVGO',  name: 'Broadcom Inc.' },
  { ticker: 'LLY',   name: 'Eli Lilly & Co.' },
  { ticker: 'JPM',   name: 'JPMorgan Chase & Co.' },
  { ticker: 'V',     name: 'Visa Inc.' },
  { ticker: 'UNH',   name: 'UnitedHealth Group' },
  { ticker: 'XOM',   name: 'Exxon Mobil Corp.' },
  { ticker: 'WMT',   name: 'Walmart Inc.' },
  { ticker: 'MA',    name: 'Mastercard Inc.' },
  { ticker: 'PG',    name: 'Procter & Gamble' },
  { ticker: 'JNJ',   name: 'Johnson & Johnson' },
  { ticker: 'HD',    name: 'Home Depot Inc.' },
  { ticker: 'COST',  name: 'Costco Wholesale' },
  { ticker: 'NFLX',  name: 'Netflix Inc.' },
  { ticker: 'AMD',   name: 'Advanced Micro Devices' },
  { ticker: 'ORCL',  name: 'Oracle Corp.' },
  { ticker: 'CRM',   name: 'Salesforce Inc.' },
  { ticker: 'BAC',   name: 'Bank of America' },
  { ticker: 'ADBE',  name: 'Adobe Inc.' },
  { ticker: 'PEP',   name: 'PepsiCo Inc.' },
  { ticker: 'KO',    name: 'Coca-Cola Co.' },
  { ticker: 'DIS',   name: 'Walt Disney Co.' },
  { ticker: 'INTC',  name: 'Intel Corp.' }
];

const REFRESH_MS = 15000;

let stockData = {};      // ticker -> { price, change, changePct, ... }
let selectedTicker = null;
let liveEnabled = true;
let pollTimer = null;
let usingSimulation = false;

// ---------- Init ----------
document.addEventListener('DOMContentLoaded', () => {
  // seed simulation baseline prices so fallback always works
  TOP_30.forEach(s => {
    stockData[s.ticker] = {
      ...s,
      price: +(Math.random() * 400 + 20).toFixed(2),
      prevClose: null,
      change: 0,
      changePct: 0,
      open: null, high: null, low: null, volume: null
    };
    stockData[s.ticker].prevClose = stockData[s.ticker].price;
  });

  renderList();
  fetchLiveData();
  startPolling();

  document.getElementById('toggle-live').addEventListener('click', (e) => {
    e.preventDefault();
    liveEnabled = !liveEnabled;
    const dot = document.getElementById('live-dot');
    const status = document.getElementById('live-status');
    const btn = document.getElementById('toggle-live');
    if (liveEnabled) {
      dot.classList.remove('paused');
      status.textContent = 'Live — updates every 15s';
      btn.textContent = 'Pause';
      startPolling();
    } else {
      dot.classList.add('paused');
      status.textContent = 'Paused';
      btn.textContent = 'Resume';
      stopPolling();
    }
  });

  document.getElementById('refresh-now').addEventListener('click', (e) => {
    e.preventDefault();
    fetchLiveData();
  });

  document.getElementById('search-input').addEventListener('input', (e) => {
    renderList(e.target.value);
  });
});

function startPolling(){
  stopPolling();
  pollTimer = setInterval(fetchLiveData, REFRESH_MS);
}
function stopPolling(){
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

// ---------- Data fetching ----------
async function fetchLiveData(){
  try {
    const res = await fetch('/api/top30', { cache: 'no-store' });
    if (!res.ok) throw new Error('Network response not OK: ' + res.status);
    const json = await res.json();
    if (!json.quotes) throw new Error('Unexpected response shape');
    applyFinnhubQuotes(json.quotes);
    usingSimulation = false;
    document.getElementById('data-source-note').textContent = 'Data source: Finnhub (live, via /api/top30)';
  } catch (err) {
    // Fallback: simulate live ticking so the UI is still demonstrable
    usingSimulation = true;
    simulateTick();
    document.getElementById('data-source-note').textContent =
      'Data source: Simulated — /api/top30 unavailable (set FINNHUB_API_KEY in Vercel env vars and deploy, or run `vercel dev` locally)';
  }

  document.getElementById('last-updated').textContent =
    'Last updated: ' + new Date().toLocaleTimeString();

  renderList(document.getElementById('search-input').value);
  if (selectedTicker) renderDetail(selectedTicker);
}

function applyFinnhubQuotes(quotes){
  quotes.forEach(q => {
    if (q.error) return;
    const entry = TOP_30.find(s => (s.finnhubSymbol || s.ticker) === q.symbol);
    if (!entry) return;

    const d = stockData[entry.ticker];
    const price = (typeof q.price === 'number' && q.price > 0) ? q.price : d.price;
    const prevClose = (typeof q.prevClose === 'number' && q.prevClose > 0) ? q.prevClose : d.prevClose;
    const change = (typeof q.change === 'number') ? q.change : price - prevClose;
    const changePct = (typeof q.changePct === 'number') ? q.changePct : (prevClose ? (change / prevClose) * 100 : 0);

    stockData[entry.ticker] = {
      ...d,
      price,
      prevClose,
      change,
      changePct,
      open: (typeof q.open === 'number' && q.open > 0) ? q.open : d.open,
      high: (typeof q.high === 'number' && q.high > 0) ? q.high : d.high,
      low: (typeof q.low === 'number' && q.low > 0) ? q.low : d.low,
      volume: d.volume // Finnhub /quote does not return volume
    };
  });
}

function simulateTick(){
  Object.keys(stockData).forEach(t => {
    const d = stockData[t];
    const drift = (Math.random() - 0.5) * (d.price * 0.004); // +/- 0.2% jitter
    const newPrice = Math.max(1, +(d.price + drift).toFixed(2));
    const change = newPrice - d.prevClose;
    const changePct = (change / d.prevClose) * 100;
    d.price = newPrice;
    d.change = change;
    d.changePct = changePct;
    d.high = d.high ? Math.max(d.high, newPrice) : newPrice;
    d.low = d.low ? Math.min(d.low, newPrice) : newPrice;
    d.open = d.open || d.prevClose;
    d.volume = d.volume || Math.floor(Math.random() * 50_000_000 + 1_000_000);
  });
}

// ---------- Rendering ----------
function renderList(filter = ''){
  const list = document.getElementById('tracker-list');
  list.innerHTML = '';
  const f = filter.trim().toLowerCase();

  TOP_30
    .filter(s => !f || s.ticker.toLowerCase().includes(f) || s.name.toLowerCase().includes(f))
    .forEach(s => {
      const d = stockData[s.ticker];
      const isUp = d.change >= 0;
      const item = document.createElement('div');
      item.className = 'tracker-list-item' + (selectedTicker === s.ticker ? ' selected' : '');
      item.innerHTML = `
        <div>
          <div class="ticker">${s.ticker}</div>
          <div style="color:var(--muted); font-size:11px;">${s.name}</div>
        </div>
        <div class="price-block">
          <div>$${d.price.toFixed(2)}</div>
          <div class="chg ${isUp ? 'up' : 'down'}">${isUp ? '+' : ''}${d.changePct.toFixed(2)}%</div>
        </div>
      `;
      item.addEventListener('click', () => {
        selectedTicker = s.ticker;
        renderList(filter);
        renderDetail(s.ticker);
      });
      list.appendChild(item);
    });

  if (list.children.length === 0) {
    list.innerHTML = `<div class="tracker-list-item"><span>No matching stocks</span></div>`;
  }
}

function renderDetail(ticker){
  const s = TOP_30.find(t => t.ticker === ticker);
  const d = stockData[ticker];
  const isUp = d.change >= 0;
  const detail = document.getElementById('tracker-detail');

  detail.innerHTML = `
    <div class="tracker-detail-header">
      <div>
        <div class="label">Company / Ticker</div>
        <div style="font-size:18px; font-weight:700;">${s.name} <span class="badge">${s.ticker}</span></div>
      </div>
      <div style="text-align:right;">
        <div class="tracker-price-big">$${d.price.toFixed(2)}</div>
        <div class="tracker-chg ${isUp ? 'up' : 'down'}">
          ${isUp ? '▲' : '▼'} ${isUp ? '+' : ''}${d.change.toFixed(2)} (${isUp ? '+' : ''}${d.changePct.toFixed(2)}%)
        </div>
      </div>
    </div>

    <div class="time-range-row" style="margin-bottom: var(--space-2);">
      <div class="label" style="margin:0; align-self:center;">Time Range:</div>
      <a href="#" class="btn active">1D</a>
      <a href="#" class="btn">1W</a>
      <a href="#" class="btn">1M</a>
      <a href="#" class="btn">3M</a>
      <a href="#" class="btn">1Y</a>
      <a href="#" class="btn">All</a>
    </div>

    <div class="placeholder xtall">Live Chart Placeholder — ${s.ticker}</div>

    <div class="tracker-stats">
      <div class="tracker-stat">
        <div class="label">Open</div>
        <div class="val">${d.open ? '$' + d.open.toFixed(2) : '—'}</div>
      </div>
      <div class="tracker-stat">
        <div class="label">High</div>
        <div class="val">${d.high ? '$' + d.high.toFixed(2) : '—'}</div>
      </div>
      <div class="tracker-stat">
        <div class="label">Low</div>
        <div class="val">${d.low ? '$' + d.low.toFixed(2) : '—'}</div>
      </div>
      <div class="tracker-stat">
        <div class="label">Volume</div>
        <div class="val">${d.volume ? Number(d.volume).toLocaleString() : 'N/A (live feed)'}</div>
      </div>
    </div>

    <div style="margin-top: var(--space-3); display:flex; gap: var(--space-2);">
      <a href="stock-detail.html" class="btn">View Full Detail Page</a>
      <a href="#" class="btn btn-solid">Add to Watchlist</a>
    </div>
  `;
}
