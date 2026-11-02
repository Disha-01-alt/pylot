// dashboard.mjs — Pylot Treasury Console (Phase 5 / Design).
// A product view, not a debug table: NL agent command bar, KPI tiles (hero: $ saved
// vs all-fiat), a reconciled ledger grid, clickable on-chain tx links, and a working
// human-in-the-loop Approve control for escalated payouts.
// Run:  node dashboard.mjs   then open http://localhost:3000  (set PORT=... if in use)
// ponytail: one file, node:http (zero deps). AG Grid + Google Fonts from CDN — needs internet.
import { createServer } from 'node:http';
import { readAll, record } from './src/ledger.mjs';
import { reconcileAll } from './src/reconcile.mjs';
import { payBatch } from './src/pylot.mjs';
import { interpret } from './src/interpret.mjs';
import { sendFiatPayout } from './src/rails/paypalPayouts.mjs';
import { sendPyusdPayout } from './src/rails/pyusdChain.mjs';

const PORT = process.env.PORT ?? 3000;
const live = process.env.PYLOT_LIVE === '1';
const AG = 'https://cdn.jsdelivr.net/npm/ag-grid-community@31.3.2';

const readBody = (req) => new Promise((resolve) => {
  let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => resolve(b));
});

// Sample batch a visitor can run from the browser (the "live link" demo).
// Testnet-sized amounts: the Sepolia PYUSD faucet gives up to 100 test PYUSD/day,
// so the PYUSD legs (30 + 9 + 6 = 45) stay well under that. The routing logic is
// identical at any scale.
const SAMPLE = {
  label: 'Creator collab #4812 — "City Nights" music video',
  recipients: [
    { id: 'editor-us',   country: 'US', amountUsd: 12,  preference: 'auto', hasCryptoWallet: false },
    { id: 'vfx-ng',      country: 'NG', amountUsd: 30,  preference: 'auto', hasCryptoWallet: true  },
    { id: 'music-ph',    country: 'PH', amountUsd: 9,   preference: 'auto', hasCryptoWallet: true  },
    { id: 'producer-in', country: 'IN', amountUsd: 6,   preference: 'auto', hasCryptoWallet: true  },
    { id: 'director-gb', country: 'GB', amountUsd: 150, preference: 'fiat', hasCryptoWallet: false },
  ],
};
const POLICY = { approvalThresholdUsd: 100, allowPyusd: true, materialityUsd: 5 };

const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Pylot — Treasury Console</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,500;0,9..144,700;1,9..144,600&family=Schibsted+Grotesk:wght@400;500;700&family=Spline+Sans+Mono:wght@400;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${AG}/styles/ag-grid.css">
<link rel="stylesheet" href="${AG}/styles/ag-theme-quartz.css">
<style>
  :root {
    --bg:#0b1020; --surface:#11182d; --surface2:#0e1526; --line:#1e2742;
    --text:#e8ecf6; --muted:#8b96b3; --blue:#19a4ff; --pp:#0070ba;
    --green:#2fd07a; --amber:#f5b83d; --red:#ff5d5d; --violet:#9f8bff;
    --serif:"Fraunces",Georgia,serif; --sans:"Schibsted Grotesk",sans-serif; --mono:"Spline Sans Mono",monospace;
  }
  * { box-sizing:border-box; }
  body {
    margin:0; font-family:var(--sans); color:var(--text); background:var(--bg); min-height:100vh;
    background-image:
      radial-gradient(1100px 420px at 18% -8%, #14306355 0%, transparent 60%),
      radial-gradient(900px 380px at 85% -12%, #0a4a6e44 0%, transparent 60%),
      repeating-linear-gradient(0deg, transparent 0 47px, #ffffff05 47px 48px),
      repeating-linear-gradient(90deg, transparent 0 47px, #ffffff04 47px 48px);
  }
  body::after { /* film grain */
    content:""; position:fixed; inset:0; pointer-events:none; opacity:.05; mix-blend-mode:overlay;
    background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)'/%3E%3C/svg%3E");
  }
  header { padding:26px 28px 10px; }
  .brandrow { display:flex; align-items:baseline; gap:14px; flex-wrap:wrap; }
  h1 { margin:0; font-family:var(--serif); font-weight:700; font-style:italic; font-size:34px; letter-spacing:.3px; }
  h1 .c { color:var(--blue); }
  .sub { font-size:11px; letter-spacing:2.6px; text-transform:uppercase; color:var(--muted); font-weight:700; }
  .badge { display:inline-flex; align-items:center; gap:6px; font-size:10.5px; font-weight:800; letter-spacing:1.4px;
    padding:4px 10px; border-radius:999px; border:1px solid var(--line); background:var(--surface); }
  .badge .dot { width:7px; height:7px; border-radius:50%; }
  .badge.live { color:var(--green); border-color:#2fd07a44; } .badge.live .dot { background:var(--green); animation:pulse 1.6s infinite; }
  .badge.dry  { color:var(--amber); } .badge.dry .dot { background:var(--amber); }
  @keyframes pulse { 0%,100%{box-shadow:0 0 0 0 #2fd07a55} 50%{box-shadow:0 0 0 6px #2fd07a11} }
  .tagline { margin:7px 0 0; color:var(--muted); font-size:13.5px; max-width:760px; }
  /* agent command bar */
  #agent-form { margin-top:16px; display:flex; gap:10px; max-width:860px; position:relative; }
  #agent-form::before { content:"\\276F"; position:absolute; left:16px; top:50%; transform:translateY(-50%);
    color:var(--blue); font-weight:700; font-size:14px; pointer-events:none; }
  #agent-input { flex:1; background:var(--surface); border:1px solid var(--line); border-radius:12px;
    padding:13px 16px 13px 38px; font-size:14px; color:var(--text); font-family:var(--sans); outline:none;
    transition:border-color .15s, box-shadow .15s; }
  #agent-input:focus { border-color:var(--blue); box-shadow:0 0 0 3px #19a4ff22, 0 0 24px #19a4ff18; }
  #agent-input::placeholder { color:var(--muted); }
  #agent-btn { background:linear-gradient(135deg, var(--blue), var(--pp)); color:#fff; border:0; border-radius:12px;
    padding:0 22px; font-weight:800; font-size:13.5px; font-family:var(--sans); cursor:pointer; white-space:nowrap;
    transition:transform .12s, box-shadow .15s; }
  #agent-btn:hover { transform:translateY(-1px); box-shadow:0 6px 22px #19a4ff44; }
  #agent-btn:disabled { opacity:.55; cursor:default; transform:none; box-shadow:none; }
  #agent-banner { margin-top:10px; font-size:13px; color:var(--violet); font-style:italic; font-family:var(--serif); min-height:18px; }
  /* KPI tiles — hero first */
  .tiles { display:flex; gap:14px; padding:16px 28px 2px; flex-wrap:wrap; align-items:stretch; }
  .tile { background:var(--surface); border:1px solid var(--line); border-radius:14px; padding:16px 20px; min-width:138px;
    animation:rise .5s cubic-bezier(.2,.7,.3,1) both; }
  .tiles .tile:nth-child(1){animation-delay:.05s} .tiles .tile:nth-child(2){animation-delay:.12s}
  .tiles .tile:nth-child(3){animation-delay:.19s} .tiles .tile:nth-child(4){animation-delay:.26s}
  .tiles .tile:nth-child(5){animation-delay:.33s} .tiles .tile:nth-child(6){animation-delay:.4s}
  @keyframes rise { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:none; } }
  .tile .n { font-family:var(--serif); font-weight:700; font-size:26px; line-height:1.05; font-variant-numeric:tabular-nums; }
  .tile .l { font-size:10px; color:var(--muted); text-transform:uppercase; letter-spacing:1.6px; margin-top:7px; font-weight:700; }
  .tile.hero { border-color:#2fd07a44; background:linear-gradient(180deg, #11261d, var(--surface)); min-width:200px; }
  .tile.hero .n { font-size:40px; color:var(--green); text-shadow:0 0 28px #2fd07a44; }
  /* ledger grid */
  #grid { height:calc(100vh - 384px); min-height:290px; margin:10px 28px 14px; border-radius:14px; overflow:hidden;
    border:1px solid var(--line); }
  .ag-theme-quartz {
    --ag-background-color:var(--surface); --ag-foreground-color:var(--text);
    --ag-header-background-color:var(--surface2); --ag-header-foreground-color:var(--muted);
    --ag-border-color:var(--line); --ag-row-border-color:var(--line);
    --ag-odd-row-background-color:#0f1628; --ag-row-hover-color:#16203a;
    --ag-font-family:var(--sans); --ag-font-size:12.5px; --ag-grid-size:7px; --ag-line-height:19px;
    --ag-value-change-value-highlight-background-color:#2fd07a33; /* reconciliation flash */
  }
  .gridbar { display:flex; align-items:center; gap:12px; padding:10px 28px 0; }
  .gridbar .k { font-size:10px; letter-spacing:2.2px; color:var(--muted); font-weight:800; }
  #qf { background:var(--surface); border:1px solid var(--line); border-radius:9px; padding:7px 12px;
    font-size:12.5px; color:var(--text); font-family:var(--sans); outline:none; width:320px; transition:border-color .15s; }
  #qf:focus { border-color:var(--blue); }
  .pill { padding:2px 9px; border-radius:999px; font-size:10.5px; font-weight:700; white-space:nowrap; letter-spacing:.3px; }
  .rail-pyusd { background:#0b2d4b; color:#5bc0ff; } .rail-fiat { background:#1a2238; color:#aab6d3; }
  .rc-reconciled,.rc-invoice_created { background:#0e2b1d; color:var(--green); }
  .rc-pending,.rc-pending_approval { background:#332508; color:var(--amber); }
  .rc-unsettled { background:#391313; color:var(--red); } .rc-unverifiable { background:#1a2238; color:var(--muted); }
  .rc-instruction { background:#231c42; color:var(--violet); }
  .by { font-size:10px; color:var(--muted); font-family:var(--mono); }
  .ref { font-family:var(--mono); font-size:11px; }
  a.tx { color:var(--blue); text-decoration:none; font-family:var(--mono); font-size:11px; }
  a.tx:hover { text-decoration:underline; }
  button.approve-btn { background:linear-gradient(135deg,#2fd07a,#1a7f3c); color:#06130b; border:0; border-radius:8px;
    padding:4px 13px; font-weight:800; cursor:pointer; font-size:11.5px; font-family:var(--sans); }
  button.approve-btn:hover { box-shadow:0 0 16px #2fd07a55; } button.approve-btn:disabled { opacity:.5; cursor:default; }
  /* tech strip + footer */
  .stack { display:flex; gap:8px; flex-wrap:wrap; align-items:center; padding:0 28px 6px; }
  .stack .k { font-size:10px; letter-spacing:2.2px; color:var(--muted); font-weight:800; margin-right:4px; }
  .chip { font-size:11px; font-weight:600; color:var(--text); background:var(--surface); border:1px solid var(--line);
    border-radius:999px; padding:3.5px 11px; display:inline-flex; align-items:center; gap:6px; }
  .chip i { width:6px; height:6px; border-radius:50%; display:inline-block; }
  .chip.pp i { background:var(--blue); } .chip.ai i { background:var(--violet); }
  .chip.ch i { background:var(--green); } .chip.sp i { background:var(--amber); }
  footer { font-size:11px; color:var(--muted); padding:4px 28px 20px; }
</style></head><body>
<header>
  <div class="brandrow">
    <h1><span class="c">P</span>ylot</h1>
    <span class="sub">Treasury Console</span>
    <span class="badge __MODE_CLASS__" id="mode"><span class="dot"></span>__MODE__</span>
  </div>
  <p class="tagline">Tell the agent what to pay. It routes every payout to the best rail — conventional
  PayPal or PYUSD — executes, and reconciles. Obligation originated via PayPal Invoicing.</p>
  <form id="agent-form">
    <input id="agent-input" value="Pay the City Nights crew; hold anything over $100" autocomplete="off">
    <button type="submit" id="agent-btn">Send to agent</button>
  </form>
  <div id="agent-banner"></div>
</header>
<div class="tiles" id="tiles"></div>
<div class="gridbar">
  <span class="k">AUDIT LEDGER</span>
  <input id="qf" placeholder="Filter — recipient, rail, status, reasoning&hellip;" autocomplete="off">
</div>
<div id="grid" class="ag-theme-quartz"></div>
<div class="stack">
  <span class="k">BUILT ON</span>
  <span class="chip pp"><i></i>PayPal Payouts v1</span>
  <span class="chip pp"><i></i>PayPal Invoicing v2</span>
  <span class="chip pp"><i></i>PayPal Transaction Search</span>
  <span class="chip pp"><i></i>Orders V2 pay-with-crypto</span>
  <span class="chip ch"><i></i>PYUSD &middot; Ethereum Sepolia</span>
  <span class="chip ai"><i></i>MCP server</span>
  <span class="chip ai"><i></i>Claude agent &middot; drives payouts via MCP</span>
  <span class="chip sp"><i></i>AG Grid</span>
  <span class="chip sp"><i></i>Render</span>
  <span class="chip sp"><i></i>Node.js</span>
</div>
<footer>Costs are Pylot estimates, not PayPal quotes. &ldquo;Saved&rdquo; is vs. routing the whole batch on fiat. PYUSD leg settles on a test network.</footer>
<script src="${AG}/dist/ag-grid-community.min.js"></script>
<script>
  const money = (p) => p.value == null ? '' : '$' + Number(p.value).toFixed(2);
  const pill = (cls, txt) => '<span class="pill ' + cls + '">' + txt + '</span>';
  const txCell = (p) => {
    const v = p.value; if (!v) return '';
    if (/^0x[0-9a-fA-F]{10,}$/.test(v) && !v.includes('DRYRUN'))
      return '<a class="tx" href="https://sepolia.etherscan.io/tx/' + v + '" target="_blank">' + v.slice(0,12) + '&hellip;</a>';
    return '<span class="ref">' + v + '</span>';
  };
  const actionCell = (p) => p.data.reconciliation?.status === 'pending_approval'
    ? '<button class="approve-btn" data-recipient="' + p.data.recipient + '" data-rail="' + p.data.rail + '" data-amt="' + p.data.amountUsd + '" data-est="' + (p.data.estimatedCostUsd ?? '') + '">Approve</button>'
    : '';
  const cols = [
    { headerName:'Time', field:'ts', width:88, valueFormatter:p => p.value ? p.value.slice(11,19) : '', cellClass:'ref' },
    { headerName:'Recipient', field:'recipient', width:118 },
    { headerName:'Rail', field:'rail', width:88, cellRenderer:p => p.value ? pill('rail-'+p.value,(p.value).toUpperCase()) : '' },
    { headerName:'Amount', field:'amountUsd', width:92, valueFormatter:money, type:'rightAligned' },
    { headerName:'Est. cost', field:'estimatedCostUsd', width:88, valueFormatter:money, type:'rightAligned' },
    { headerName:'Decided', field:'decidedBy', width:118, cellRenderer:p => {
        const BY = { rule:'policy engine', 'rule-fallback':'policy engine', rules:'policy engine', llm:'Claude', approved:'operator' };
        return p.value ? '<span class="by">'+(BY[p.value] ?? p.value)+'</span>' : '';
      } },
    { headerName:'Reconciliation', width:138, valueGetter:p => p.data.reconciliation?.status,
      cellRenderer:p => p.value ? pill('rc-'+p.value, p.value.replace(/_/g,' ')) : '' },
    { headerName:'Action', width:104, cellRenderer:actionCell },
    { headerName:'Reasoning', field:'reasoning', flex:1, minWidth:250, wrapText:true, autoHeight:true },
    { headerName:'Ref / tx', field:'ref', width:148, cellRenderer:txCell },
  ];
  // AG Grid: delta row updates via getRowId so reconciliation changes FLASH in place
  // as the 4s poll flips PENDING -> SUCCESS; quick filter + per-column filters for audit.
  const gridOptions = {
    columnDefs:cols, rowData:[], enableCellTextSelection:true, animateRows:true,
    defaultColDef:{ resizable:true, sortable:true, filter:true, enableCellChangeFlash:true },
    getRowId: (p) => String(p.data._i),
  };
  const api = agGrid.createGrid(document.querySelector('#grid'), gridOptions);
  document.querySelector('#qf').addEventListener('input', (e) =>
    api.setGridOption('quickFilterText', e.target.value));

  async function load() {
    const rows = (await (await fetch('/api/ledger')).json()).map((r, i) => ({ ...r, _i: i }));
    api.setGridOption('rowData', rows);
    const instructed = rows.find(r => r.event === 'INSTRUCTED');
    document.querySelector('#agent-banner').textContent = instructed ? instructed.reasoning : '';
    const paid = rows.filter(r => r.event === 'PAID');
    const volume = paid.reduce((a,r)=>a+(r.amountUsd||0),0);
    const pyusd = paid.filter(r => r.rail === 'pyusd').length;
    const saved = paid.reduce((a,r)=>a+Math.max(0,(r.altFiatCostUsd||0)-(r.estimatedCostUsd||0)),0);
    const avgEta = paid.length ? paid.reduce((a,r)=>a+(r.etaHours||0),0)/paid.length : 0;
    const tiles = [
      ['hero','$'+saved.toFixed(2),'Saved vs all-fiat'],
      ['','$'+volume.toFixed(2),'Volume routed'],
      ['', paid.length ? Math.round(pyusd/paid.length*100)+'%' : '0%','Via PYUSD'],
      ['', avgEta < 1 ? '<1h' : Math.round(avgEta)+'h','Avg settlement'],
      ['', String(paid.length),'Settled'],
      ['', String(rows.filter(r=>r.reconciliation?.status==='pending_approval').length),'Awaiting approval'],
    ];
    document.querySelector('#tiles').innerHTML = tiles.map(([h,n,l]) =>
      '<div class="tile ' + h + '"><div class="n">'+n+'</div><div class="l">'+l+'</div></div>').join('');
  }

  document.querySelector('#agent-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const b = document.querySelector('#agent-btn'); b.disabled = true; b.textContent = 'Agent working\\u2026';
    await fetch('/api/instruct', { method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ text: document.querySelector('#agent-input').value }) });
    b.disabled = false; b.textContent = 'Send to agent';
    load();
  });

  document.addEventListener('click', async (e) => {
    const b = e.target.closest('.approve-btn'); if (!b) return;
    b.disabled = true; b.textContent = '\\u2026';
    await fetch('/api/approve', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ recipient:b.dataset.recipient, rail:b.dataset.rail, amountUsd:Number(b.dataset.amt),
        estimatedCostUsd: b.dataset.est ? Number(b.dataset.est) : undefined }) });
    load();
  });

  load(); setInterval(load, 4000);
</script></body></html>`;

createServer(async (req, res) => {
  try {
    if (req.method === 'POST' && req.url.startsWith('/api/instruct')) {
      const { text = '' } = JSON.parse((await readBody(req)) || '{}');
      const { recipients, policy, interpretation, parsedBy } = await interpret(text || SAMPLE.label, SAMPLE.recipients);
      // Append-only: new instructions ADD to the audit trail (never wipe MCP/agent history).
      // The instruction itself is the first audit-trail entry: what the human asked for.
      record({ event: 'INSTRUCTED', reasoning: interpretation, detail: text, decidedBy: parsedBy });
      await payBatch({ label: (text || SAMPLE.label).slice(0, 80), recipients }, { ...POLICY, ...policy }, { dryRun: !live });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, interpretation }));
    }
    if (req.method === 'POST' && req.url.startsWith('/api/approve')) {
      const { recipient = 'unknown', rail = 'fiat', amountUsd = 0, estimatedCostUsd } = JSON.parse((await readBody(req)) || '{}');
      const r = { id: recipient };
      let exec;
      try {
        exec = rail === 'pyusd'
          ? await sendPyusdPayout({ recipient: r, amountUsd }, { dryRun: !live })
          : await sendFiatPayout({ recipient: r, amountUsd }, { dryRun: !live });
      } catch (e) { exec = { ok: false, status: 'ERROR', ref: null, reason: e.message }; }
      const row = record({
        event: exec.ok ? 'PAID' : 'FAILED', recipient, rail, amountUsd,
        estimatedCostUsd, // carried from the escalated row's real estimate — never a naive flat fee
        reasoning: 'approved by operator', decidedBy: 'approved',
        status: exec.status, ref: exec.ref, ...(exec.reason ? { detail: exec.reason } : {}),
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(row));
    }
    if (req.url.startsWith('/api/ledger')) {
      const rows = await reconcileAll(readAll(), { dryRun: !live });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(rows));
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(PAGE.replace('__MODE_CLASS__', live ? 'live' : 'dry').replace('__MODE__', live ? 'LIVE' : 'DRY-RUN'));
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end(String(e));
  }
}).listen(PORT, () => console.log(`Pylot Treasury Console -> http://localhost:${PORT}  (${live ? 'LIVE' : 'dry-run'})`));
