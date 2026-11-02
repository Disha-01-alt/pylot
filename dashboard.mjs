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
<link href="https://fonts.googleapis.com/css2?family=Public+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${AG}/styles/ag-grid.css">
<link rel="stylesheet" href="${AG}/styles/ag-theme-quartz.css">
<style>
  :root {
    --paper:#f7f6f2; --card:#fffefb; --line:#e2dfd6; --line2:#cfccc2;
    --ink:#1a1c20; --muted:#6d7078; --faint:#9a9da4;
    --pp:#003087; --blue:#0551b5; --green:#116632; --greenbg:#ebf3ed;
    --amber:#8a5a00; --amberbg:#f8f0dd; --red:#9b1c1c; --redbg:#f8e9e9;
    --slate:#44485e; --slatebg:#ecedf3;
    --sans:"Public Sans",system-ui,sans-serif; --mono:"IBM Plex Mono",monospace;
  }
  * { box-sizing:border-box; }
  body { margin:0; font-family:var(--sans); color:var(--ink); background:var(--paper); min-height:100vh; }
  header { padding:22px 32px 0; }
  .brandrow { display:flex; align-items:baseline; gap:14px; flex-wrap:wrap; border-bottom:2px solid var(--ink); padding-bottom:12px; }
  h1 { margin:0; font-family:var(--mono); font-weight:600; font-size:21px; letter-spacing:4px; text-transform:uppercase; }
  h1 .c { color:var(--pp); }
  .sub { font-size:10.5px; letter-spacing:2.4px; text-transform:uppercase; color:var(--muted); font-weight:600; }
  .badge { display:inline-flex; align-items:center; gap:6px; font-size:10px; font-weight:600; letter-spacing:1.6px;
    font-family:var(--mono); padding:3px 9px; border:1px solid var(--line2); background:var(--card); margin-left:auto; }
  .badge .dot { width:7px; height:7px; border-radius:50%; }
  .badge.live { color:var(--green); } .badge.live .dot { background:#1d8a46; animation:pulse 1.8s infinite; }
  .badge.dry  { color:var(--amber); } .badge.dry .dot { background:#c08a1c; }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.35} }
  .tagline { margin:10px 0 0; color:var(--muted); font-size:13px; max-width:720px; line-height:1.5; }
  /* agent command bar */
  #agent-form { margin-top:14px; display:flex; max-width:860px; position:relative; }
  #agent-form::before { content:"\\276F"; position:absolute; left:14px; top:50%; transform:translateY(-50%);
    color:var(--pp); font-weight:600; font-size:13px; font-family:var(--mono); pointer-events:none; }
  #agent-input { flex:1; background:var(--card); border:1px solid var(--line2); border-right:0; border-radius:3px 0 0 3px;
    padding:11px 14px 11px 34px; font-size:13px; color:var(--ink); font-family:var(--mono); outline:none;
    transition:border-color .15s, box-shadow .15s; }
  #agent-input:focus { border-color:var(--blue); box-shadow:inset 0 0 0 1px var(--blue); }
  #agent-input::placeholder { color:var(--faint); }
  #agent-btn { background:var(--pp); color:#fff; border:1px solid var(--pp); border-radius:0 3px 3px 0;
    padding:0 20px; font-weight:600; font-size:12px; letter-spacing:.8px; text-transform:uppercase;
    font-family:var(--sans); cursor:pointer; white-space:nowrap; transition:background .15s; }
  #agent-btn:hover { background:#00256b; }
  #agent-btn:disabled { opacity:.55; cursor:default; }
  #agent-banner { margin-top:9px; font-size:12.5px; color:var(--slate); font-family:var(--mono); min-height:18px; }
  /* KPI strip — a bank-statement summary row, hairline-divided */
  .tiles { display:flex; flex-wrap:wrap; margin:16px 32px 0; border:1px solid var(--line); background:var(--card); }
  .tile { flex:1 1 120px; padding:14px 18px 12px; border-right:1px solid var(--line); }
  .tile:last-child { border-right:0; }
  .tile .n { font-family:var(--mono); font-weight:600; font-size:23px; line-height:1.1; font-variant-numeric:tabular-nums; }
  .tile .l { font-size:9.5px; color:var(--muted); text-transform:uppercase; letter-spacing:1.5px; margin-top:6px; font-weight:600; }
  .tile.hero { background:var(--greenbg); }
  .tile.hero .n { color:var(--green); font-size:23px; }
  /* ledger grid */
  #grid { height:calc(100vh - 372px); min-height:290px; margin:14px 32px; border:1px solid var(--line); }
  .ag-theme-quartz {
    --ag-background-color:var(--card); --ag-foreground-color:var(--ink);
    --ag-header-background-color:#f1efe9; --ag-header-foreground-color:var(--muted);
    --ag-border-color:var(--line); --ag-row-border-color:#eceade;
    --ag-odd-row-background-color:#fcfbf7; --ag-row-hover-color:#f0f4fa;
    --ag-font-family:var(--sans); --ag-font-size:12.5px; --ag-grid-size:7px; --ag-line-height:19px;
    --ag-border-radius:0; --ag-wrapper-border-radius:0;
    --ag-value-change-value-highlight-background-color:#d7ead9; /* reconciliation flash */
  }
  .gridbar { display:flex; align-items:baseline; gap:12px; padding:18px 32px 0; }
  .gridbar .k { font-size:10px; letter-spacing:2.2px; color:var(--ink); font-weight:700; }
  #qf { background:var(--card); border:1px solid var(--line2); border-radius:3px; padding:6px 11px;
    font-size:12px; color:var(--ink); font-family:var(--sans); outline:none; width:320px; transition:border-color .15s; }
  #qf:focus { border-color:var(--blue); }
  #export-btn { background:var(--card); border:1px solid var(--line2); border-radius:3px; padding:6px 13px;
    font-size:10.5px; font-family:var(--mono); letter-spacing:.6px; color:var(--slate); cursor:pointer; transition:border-color .15s; }
  #export-btn:hover { border-color:var(--blue); color:var(--blue); }
  #updated { margin-left:auto; font-size:10.5px; color:var(--faint); font-family:var(--mono); }
  .pill { padding:1.5px 8px; border-radius:2px; font-size:10px; font-weight:600; white-space:nowrap;
    letter-spacing:.6px; font-family:var(--mono); text-transform:uppercase; border:1px solid transparent; }
  .rail-pyusd { background:#e8eefa; color:var(--blue); border-color:#c6d6ef; }
  .rail-fiat  { background:#f0efea; color:var(--slate); border-color:var(--line2); }
  .rc-reconciled,.rc-invoice_created { background:var(--greenbg); color:var(--green); border-color:#c4dcc9; }
  .rc-pending,.rc-pending_approval { background:var(--amberbg); color:var(--amber); border-color:#e4d3ab; }
  .rc-unsettled { background:var(--redbg); color:var(--red); border-color:#e5c5c5; }
  .rc-unverifiable { background:#efefef; color:var(--muted); border-color:var(--line2); }
  .rc-instruction { background:var(--slatebg); color:var(--slate); border-color:#cdd0e0; }
  .by { font-size:10px; color:var(--muted); font-family:var(--mono); }
  .ref { font-family:var(--mono); font-size:11px; }
  a.tx { color:var(--blue); text-decoration:none; font-family:var(--mono); font-size:11px; }
  a.tx:hover { text-decoration:underline; }
  button.approve-btn { background:var(--card); color:var(--green); border:1px solid #9dbfa6; border-radius:3px;
    padding:3px 12px; font-weight:600; cursor:pointer; font-size:10.5px; font-family:var(--mono);
    letter-spacing:.8px; text-transform:uppercase; transition:background .15s; }
  button.approve-btn:hover { background:var(--greenbg); } button.approve-btn:disabled { opacity:.5; cursor:default; }
  /* tech strip + footer */
  .stack { display:flex; gap:7px; flex-wrap:wrap; align-items:center; padding:0 32px 8px; }
  .stack .k { font-size:9.5px; letter-spacing:2.2px; color:var(--muted); font-weight:700; margin-right:4px; }
  .chip { font-size:10.5px; font-weight:500; color:var(--slate); background:var(--card); border:1px solid var(--line);
    border-radius:2px; padding:2.5px 9px; display:inline-flex; align-items:center; gap:6px; font-family:var(--mono); }
  .chip i { width:5px; height:5px; border-radius:50%; display:inline-block; }
  .chip.pp i { background:var(--pp); } .chip.ai i { background:var(--slate); }
  .chip.ch i { background:var(--green); } .chip.sp i { background:#c08a1c; }
  footer { font-size:10.5px; color:var(--faint); padding:6px 32px 22px; border-top:1px solid var(--line);
    margin:6px 32px 0; padding-left:0; padding-right:0; line-height:1.6; }
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
  <button id="export-btn" title="Export the audit ledger as CSV">Export CSV</button>
  <span id="updated"></span>
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
    { headerName:'Time', field:'ts', width:104, sort:'desc', valueFormatter:p => p.value ? p.value.slice(11,19) : '', cellClass:'ref' },
    { headerName:'Recipient', field:'recipient', width:118 },
    { headerName:'Rail', field:'rail', width:88, cellRenderer:p => p.value ? pill('rail-'+p.value,(p.value).toUpperCase()) : '' },
    { headerName:'Amount', field:'amountUsd', width:102, valueFormatter:money, type:'rightAligned' },
    { headerName:'Est. cost', field:'estimatedCostUsd', width:106, valueFormatter:money, type:'rightAligned' },
    { headerName:'Decided', field:'decidedBy', width:118, cellRenderer:p => {
        const BY = { rule:'policy engine', 'rule-fallback':'policy engine', rules:'policy engine', llm:'Claude', approved:'operator' };
        return p.value ? '<span class="by">'+(BY[p.value] ?? p.value)+'</span>' : '';
      } },
    { headerName:'Status', width:168, valueGetter:p => p.data.reconciliation?.status,
      cellRenderer:p => p.value ? pill('rc-'+p.value, p.value.replace(/_/g,' ')) : '' },
    { headerName:'Action', width:104, cellRenderer:actionCell, enableCellChangeFlash:false },
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
    const instructed = rows.findLast(r => r.event === 'INSTRUCTED'); // latest instruction, append-only ledger
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
    document.querySelector('#updated').textContent = 'updated ' + new Date().toTimeString().slice(0,8);
  }

  document.querySelector('#export-btn').addEventListener('click', () =>
    api.exportDataAsCsv({ fileName: 'pylot-audit-ledger.csv' }));

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
