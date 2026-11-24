/**
 * The owner's desktop war room, served at /api/owner/dashboard. Plain HTML + JS, no
 * build step. It reads and writes the same data as the app's war room screen, using the
 * signed token from the link the app makes (War room, then Use on computer).
 */
export const OWNER_DASHBOARD_HTML = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Split Mate · War room</title>
<style>
:root{
  --bg:#F6F7F5;--surface:#FFFFFF;--line:#E3E6E1;--text:#16201E;--muted:#5D6B67;--faint:#8A9692;
  --accent:#0E7C86;--accent-ink:#FFFFFF;--accent-soft:#E3F1F1;--warn:#A85F00;--warn-soft:#FDF1DE;--ok:#2F7A4B;
}
@media (prefers-color-scheme:dark){:root{
  --bg:#111615;--surface:#181F1E;--line:#29322F;--text:#E8EDEB;--muted:#A3B0AC;--faint:#76837F;
  --accent:#3FB8BE;--accent-ink:#06282B;--accent-soft:#16302F;--warn:#F0B04A;--warn-soft:#33281A;--ok:#6CC48E;
}}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--text);font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-variant-numeric:tabular-nums}
::selection{background:var(--accent);color:var(--accent-ink)}
button,textarea{font:inherit;color:inherit}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.wrap{max-width:1180px;margin:0 auto;padding:28px 24px 64px}
header{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:24px}
h1{font-size:26px;line-height:1.15;margin:0;letter-spacing:-0.01em}
.sub{color:var(--muted);font-size:13.5px;margin-top:4px}
.btns{display:flex;gap:8px;flex-wrap:wrap}
.btn{border:1px solid var(--line);background:var(--surface);border-radius:10px;padding:8px 14px;font-weight:600;font-size:14px;cursor:pointer;transition:background .15s,border-color .15s,transform .1s}
.btn:hover{border-color:var(--faint)}
.btn:active{transform:scale(.97)}
.btn:disabled{opacity:.55;cursor:default}
.btn.primary{background:var(--accent);border-color:var(--accent);color:var(--accent-ink)}
.btn.quiet{border-color:transparent;background:transparent;color:var(--muted);padding-left:8px;padding-right:8px}
.btn.quiet:hover{color:var(--text)}
.stats{display:flex;flex-wrap:wrap;gap:0;background:var(--surface);border:1px solid var(--line);border-radius:14px;margin-bottom:24px}
.stat{flex:1 1 140px;padding:14px 18px;border-left:1px solid var(--line)}
.stat:first-child{border-left:0}
.stat b{display:block;font-size:22px;font-weight:700}
.stat span{color:var(--muted);font-size:12.5px}
.stat.alert b{color:var(--warn)}
.grid{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:24px;align-items:start}
@media (max-width:900px){.grid{grid-template-columns:1fr}}
.tabs{display:flex;gap:4px;margin-bottom:12px;flex-wrap:wrap}
.tab{border:0;background:transparent;padding:7px 12px;border-radius:8px;font-weight:600;font-size:14px;color:var(--muted);cursor:pointer}
.tab[aria-selected="true"]{background:var(--surface);color:var(--text);box-shadow:0 1px 2px rgba(0,0,0,.06),0 0 0 1px var(--line)}
.tab small{color:var(--faint);font-weight:500;margin-left:4px}
.issue{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:16px 18px;margin-bottom:10px}
.issue h3{margin:0;font-size:16px;line-height:1.35}
.meta{color:var(--faint);font-size:12.5px;margin-top:2px}
.do{margin:12px 0 0;padding:10px 12px;background:var(--accent-soft);border-radius:10px}
.do em{display:block;font-style:normal;font-size:12px;font-weight:600;color:var(--accent);margin-bottom:2px}
.why{color:var(--muted);font-size:14px;margin:10px 0 0}
.row{display:flex;gap:8px;align-items:center;margin-top:12px;flex-wrap:wrap}
.note{width:100%;min-height:38px;max-height:160px;resize:vertical;border:1px solid var(--line);background:var(--bg);border-radius:10px;padding:8px 10px;margin-top:12px;font-size:14px}
.pill{font-size:12px;font-weight:600;padding:3px 9px;border-radius:99px;background:var(--bg);color:var(--muted);border:1px solid var(--line)}
.pill.approved,.pill.planned{color:var(--accent);border-color:var(--accent)}
.pill.done{color:var(--ok);border-color:var(--ok)}
.saved{font-size:12.5px;color:var(--muted)}
.panel{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:16px 18px;margin-bottom:16px}
.panel h2{font-size:14px;margin:0 0 8px;font-weight:700}
.panel p{margin:0;font-size:14px;color:var(--muted);white-space:pre-wrap}
.list{list-style:none;margin:0;padding:0}
.list li{padding:7px 0;border-top:1px solid var(--line);font-size:13.5px}
.list li:first-child{border-top:0}
.list .t{font-weight:600;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.list .s{color:var(--muted);font-size:12.5px}
table{width:100%;border-collapse:collapse;font-size:13.5px}
th{font-weight:600;color:var(--muted);text-align:right;font-size:12px;padding:4px 0}
th:first-child,td:first-child{text-align:left}
td{padding:6px 0;border-top:1px solid var(--line);text-align:right}
tfoot td{font-weight:700}
.empty{color:var(--muted);text-align:center;padding:40px 0}
.gate{max-width:420px;margin:15vh auto;text-align:center;color:var(--muted)}
.gate h1{color:var(--text);margin-bottom:8px}
.toast{position:fixed;left:50%;bottom:24px;transform:translate(-50%,20px);opacity:0;background:var(--text);color:var(--bg);padding:10px 16px;border-radius:10px;font-size:14px;transition:opacity .2s,transform .25s cubic-bezier(.2,.8,.2,1);pointer-events:none}
.toast.on{opacity:1;transform:translate(-50%,0)}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
</style>
</head>
<body>
<div id="app"></div>
<div class="toast" id="toast" role="status" aria-live="polite"></div>
<script>
(function(){
  var TOKEN_KEY = "splitmate-owner-token";
  var token = null;
  var m = /t=([^&]+)/.exec(location.hash || "");
  try {
    if (m) { token = decodeURIComponent(m[1]); localStorage.setItem(TOKEN_KEY, token); }
    else token = localStorage.getItem(TOKEN_KEY);
  } catch (e) { if (m) token = decodeURIComponent(m[1]); }
  if (m) history.replaceState(null, "", location.pathname);

  var app = document.getElementById("app");
  var state = { data: null, tab: "pending", busy: "", notes: {} };
  var TABS = [["pending","To decide"],["planned","Planned"],["approved","Approved"],["done","Done"],["declined","Dismissed"]];
  var LABEL = { pending:"To decide", approved:"Approved", planned:"Planned", declined:"Dismissed", done:"Built" };
  var FEATURE = { receipts:"Receipt scans", digest:"Morning briefing", reviews:"Store reviews" };

  function esc(s){ return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]; }); }
  function usd(n){ n = Number(n) || 0; return n > 0 && n < 0.01 ? "<$0.01" : "$" + n.toFixed(2); }
  function day(s){ try { return new Date(s).toLocaleDateString(undefined,{day:"numeric",month:"short"}); } catch(e){ return ""; } }
  function when(s){ try { return new Date(s).toLocaleString(undefined,{weekday:"short",hour:"2-digit",minute:"2-digit"}); } catch(e){ return ""; } }
  function toast(msg){ var t = document.getElementById("toast"); t.textContent = msg; t.classList.add("on"); clearTimeout(toast.h); toast.h = setTimeout(function(){ t.classList.remove("on"); }, 2200); }

  function api(path, opts){
    opts = opts || {};
    var headers = { "x-owner-token": token || "" };
    if (opts.body) headers["Content-Type"] = "application/json";
    return fetch("/api/owner/" + path, { method: opts.method || "GET", headers: headers, body: opts.body ? JSON.stringify(opts.body) : undefined })
      .then(function(r){ return r.json().catch(function(){ return {}; }).then(function(j){ if (!r.ok) { var e = new Error(j.error || "Something went wrong."); e.status = r.status; throw e; } return j; }); });
  }

  function gate(msg){
    app.innerHTML = '<div class="gate"><h1>War room</h1><p>' + esc(msg) + '</p></div>';
  }

  function load(){
    return api("war-room").then(function(d){ state.data = d; render(); })
      .catch(function(e){ if (e.status === 401 || e.status === 403) { try { localStorage.removeItem(TOKEN_KEY); } catch(x){} gate(e.message); } else toast(e.message); });
  }

  function issue(s){
    var note = state.notes[s.id] != null ? state.notes[s.id] : (s.note || "");
    var src = s.source === "reviews" ? "From store reviews" : "From support and crashes";
    var actions = s.status === "pending"
      ? '<button class="btn primary" data-act="approved" data-id="' + s.id + '">Approve</button>' +
        '<button class="btn" data-act="planned" data-id="' + s.id + '">Plan for later</button>' +
        '<button class="btn quiet" data-act="declined" data-id="' + s.id + '">Dismiss</button>'
      : '<span class="pill ' + esc(s.status) + '">' + esc(LABEL[s.status] || s.status) + '</span>' +
        (s.status === "approved" || s.status === "planned" ? '<button class="btn" data-act="done" data-id="' + s.id + '">Mark as built</button>' : "") +
        '<button class="btn quiet" data-act="pending" data-id="' + s.id + '">Move back</button>' +
        '<button class="btn quiet" data-act="' + esc(s.status) + '" data-id="' + s.id + '" data-save="1">Save note</button>';
    return '<article class="issue">' +
      '<h3>' + esc(s.title) + '</h3>' +
      '<div class="meta">' + src + ' · ' + day(s.createdAt) + '</div>' +
      '<div class="do"><em>What we should do</em>' + esc(s.change) + '</div>' +
      (s.reason ? '<p class="why">' + esc(s.reason) + '</p>' : "") +
      '<textarea class="note" data-note="' + s.id + '" rows="1" placeholder="Add a note (optional)">' + esc(note) + '</textarea>' +
      '<div class="row">' + actions + '</div>' +
    '</article>';
  }

  function render(){
    var d = state.data; if (!d) return;
    var counts = {}; d.suggestions.forEach(function(s){ counts[s.status] = (counts[s.status] || 0) + 1; });
    var list = d.suggestions.filter(function(s){ return s.status === state.tab; });
    var c = d.costs;
    var stats = [
      ["Users", d.stats.users], ["New this week", d.stats.newUsers7d], ["Scans this month", d.stats.scansThisMonth],
      ["Crashes, 24 h", d.stats.crashes24h, d.stats.crashes24h > 0], ["AI cost, 30 days", c ? usd(c.month) : "–"], ["To decide", d.stats.pending, d.stats.pending > 0]
    ].map(function(x){ return '<div class="stat' + (x[2] ? " alert" : "") + '"><b>' + esc(x[1]) + '</b><span>' + x[0] + '</span></div>'; }).join("");

    var costRows = c && c.byFeature.length
      ? '<table><thead><tr><th>Feature</th><th>Today</th><th>7 days</th><th>30 days</th></tr></thead><tbody>' +
        c.byFeature.map(function(f){ return '<tr><td>' + esc(FEATURE[f.feature] || f.feature) + ' <span class="s">· ' + f.calls + '</span></td><td>' + usd(f.today) + '</td><td>' + usd(f.week) + '</td><td>' + usd(f.month) + '</td></tr>'; }).join("") +
        '</tbody><tfoot><tr><td>Total</td><td>' + usd(c.today) + '</td><td>' + usd(c.week) + '</td><td>' + usd(c.month) + '</td></tr></tfoot></table>'
      : '<p>No AI calls recorded yet.</p>';

    var reviews = d.reviews;
    var rlist = (reviews && reviews.reviews) || [];
    var avg = rlist.length ? (rlist.reduce(function(a,r){ return a + r.rating; }, 0) / rlist.length).toFixed(1) : null;
    var reviewBody = !reviews ? '<p>Not read yet.</p>'
      : !(reviews.sources && reviews.sources.appStore) ? '<p>Not connected. Add APP_STORE_ID in Replit after launch.</p>'
      : '<p>' + (avg ? "★ " + avg + " from " + rlist.length + " recent reviews. " : "No reviews yet. ") + esc(reviews.summary || "") + '</p>';

    var emails = (d.report && d.report.emails) || [];
    var inbox = d.report && d.report.stats && d.report.stats.inboxConnected === false ? '<p>Inbox not connected.</p>'
      : emails.length ? '<ul class="list">' + emails.map(function(e){ return '<li><span class="t">' + esc(e.subject) + '</span><span class="s">' + esc(e.from) + '</span></li>'; }).join("") + '</ul>'
      : '<p>No new emails.</p>';
    var crashes = d.crashes.length ? '<ul class="list">' + d.crashes.map(function(x){ return '<li><span class="t">' + esc(x.message) + '</span><span class="s">' + x.n + (x.n === 1 ? " time" : " times") + '</span></li>'; }).join("") + '</ul>' : '<p>None in the last 24 hours.</p>';

    app.innerHTML = '<div class="wrap">' +
      '<header><div><h1>War room</h1><div class="sub">' + (d.report ? "Last briefing " + when(d.report.createdAt) : "No briefing yet") + '</div></div>' +
      '<div class="btns"><button class="btn" id="b-inbox"' + (state.busy ? " disabled" : "") + '>' + (state.busy === "inbox" ? "Reading inbox…" : "Read inbox now") + '</button>' +
      '<button class="btn" id="b-reviews"' + (state.busy ? " disabled" : "") + '>' + (state.busy === "reviews" ? "Reading reviews…" : "Read reviews") + '</button></div></header>' +
      '<section class="stats">' + stats + '</section>' +
      '<div class="grid"><main>' +
        '<div class="tabs" role="tablist">' + TABS.map(function(t){ return '<button class="tab" role="tab" data-tab="' + t[0] + '" aria-selected="' + (state.tab === t[0]) + '">' + t[1] + (counts[t[0]] ? '<small>' + counts[t[0]] + '</small>' : "") + '</button>'; }).join("") + '</div>' +
        (list.length ? list.map(issue).join("") : '<div class="empty">' + (state.tab === "pending" ? "Nothing to decide right now." : "Nothing here.") + '</div>') +
      '</main><aside>' +
        '<div class="panel"><h2>AI cost</h2>' + costRows + '</div>' +
        (d.report && d.report.briefing ? '<div class="panel"><h2>Briefing</h2><p>' + esc(d.report.briefing) + '</p></div>' : "") +
        '<div class="panel"><h2>Store reviews</h2>' + reviewBody + '</div>' +
        '<div class="panel"><h2>Support inbox</h2>' + inbox + '</div>' +
        '<div class="panel"><h2>Crashes</h2>' + crashes + '</div>' +
      '</aside></div></div>';
  }

  app.addEventListener("input", function(e){
    var id = e.target.getAttribute && e.target.getAttribute("data-note");
    if (id) state.notes[id] = e.target.value;
  });

  app.addEventListener("click", function(e){
    var el = e.target.closest ? e.target.closest("button") : null;
    if (!el) return;
    if (el.dataset.tab) { state.tab = el.dataset.tab; render(); return; }
    if (el.id === "b-inbox" || el.id === "b-reviews") {
      var which = el.id === "b-inbox" ? "inbox" : "reviews";
      state.busy = which; render();
      api(which === "inbox" ? "refresh" : "reviews", { method: "POST" })
        .then(function(r){ if (which === "reviews" && r.sources && !r.sources.appStore) toast("Store reviews start after launch."); return load(); })
        .catch(function(err){ toast(err.message); })
        .then(function(){ state.busy = ""; render(); });
      return;
    }
    var id = el.dataset.id, status = el.dataset.act;
    if (!id || !status) return;
    var s = state.data.suggestions.filter(function(x){ return x.id === id; })[0];
    if (!s) return;
    var note = state.notes[id] != null ? state.notes[id] : (s.note || "");
    var prev = s.status;
    s.status = status; s.note = note; delete state.notes[id]; render();
    api("suggestions/" + id, { method: "POST", body: { status: status, note: note } })
      .then(function(){
        if (el.dataset.save) toast("Note saved");
        else toast(status === "pending" ? "Moved back to To decide" : LABEL[status]);
        state.data.stats.pending = state.data.suggestions.filter(function(x){ return x.status === "pending"; }).length;
        render();
      })
      .catch(function(err){ s.status = prev; render(); toast(err.message); });
  });

  if (!token) gate("Open this page from the app: War room, then Use on computer.");
  else { gate("Loading…"); load(); }
  setInterval(function(){ if (token && !state.busy && !document.hidden && !document.activeElement.matches("textarea")) load(); }, 60000);
})();
</script>
</body>
</html>`;
