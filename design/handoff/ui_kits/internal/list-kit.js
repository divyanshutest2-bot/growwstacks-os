// GrowwStacks OS — reusable list engine + small render helpers for table list views.
// Page must contain: #stateSeg (optional), #search (optional), #filterbar (optional),
// a container div, and #navToggle. Call initList(cfg).
(function () {
  var OWN = { AR:'var(--iris-600)', PM:'var(--sky-600)', NK:'var(--green-600)', DV:'var(--amber-500)', SK:'var(--n-500)', LX:'var(--red-500)', MI:'var(--amber-500)', AD:'var(--sky-600)', SR:'var(--green-600)' };
  var SD = { active:'var(--color-status-active)', away:'var(--color-status-away)', left:'var(--color-status-left)' };
  var RLABEL = { great:'Great', good:'Good', average:'Average', bad:'Bad' };

  var LK = {
    OWN: OWN, SD: SD,
    avatar: function (init, bg, sz) { sz = sz || 28; return '<span class="avatar" style="background:' + (bg || 'var(--n-500)') + ';width:' + sz + 'px;height:' + sz + 'px;font-size:' + (sz < 26 ? 9 : 11) + 'px">' + init + '</span>'; },
    ostack: function (list) {
      return '<div class="ostack">' + list.map(function (o) {
        var dot = o[1] ? '<span class="sdot" style="background:' + SD[o[1]] + '"></span>' : '';
        return '<span class="wrap">' + LK.avatar(o[0], OWN[o[0]], 24) + dot + '</span>';
      }).join('') + '</div>';
    },
    status: function (label, color) { return '<span class="status"><span class="dot" style="background:' + color + '"></span>' + label + '</span>'; },
    plain: function (label) { return '<span class="status">' + label + '</span>'; },
    sched: function (label, kind) { return '<span class="schedule" style="background:var(--color-' + kind + '-bg);color:var(--color-' + kind + '-text);border:1px solid var(--color-' + kind + '-border)">' + label + '</span>'; },
    rating: function (r) { return '<span class="rating ' + r + '">' + RLABEL[r] + '</span>'; },
    bar: function (pct) { return '<div style="display:flex;align-items:center;gap:8px"><div style="flex:1;min-width:60px;max-width:120px;height:6px;border-radius:999px;background:var(--color-bg-active);overflow:hidden"><div style="width:' + pct + '%;height:100%;background:var(--color-accent);border-radius:999px"></div></div><span class="mono" style="font-size:10px;color:var(--color-text-tertiary)">' + pct + '%</span></div>'; },
    money: function (v) { if (v === null || v === undefined || v === '') return '<span style="color:var(--color-text-muted)">—</span>'; if (typeof v === 'string') return v; return '<span class="mono" style="font-weight:500">' + (v >= 100000 ? '₹' + (v / 100000).toFixed(1) + 'L' : '₹' + (v / 1000).toFixed(0) + 'K') + '</span>'; },
    prio: function (p) { var c = p === 'High' ? 'var(--color-danger-text)' : p === 'Medium' ? 'var(--color-warning-text)' : 'var(--color-text-tertiary)'; return '<span style="font-size:11px;font-weight:600;color:' + c + '">' + p + '</span>'; },
    mono: function (t, color) { return '<span class="mono" style="font-size:12px;color:' + (color || 'var(--color-text-secondary)') + '">' + t + '</span>'; },
    muted: function (t) { return '<span style="font-size:12px;color:var(--color-text-tertiary)">' + t + '</span>'; }
  };
  window.LK = LK;

  window.initList = function (cfg) {
    var wrap = document.getElementById(cfg.containerId);
    var HEAD = '<thead><tr>' + cfg.columns.map(function (c) { return '<th' + (c.num ? ' class="num"' : '') + '>' + c.label + '</th>'; }).join('') + '</tr></thead>';

    function rowHtml(r) {
      return '<tr data-href="' + cfg.navHref + '">' + cfg.columns.map(function (c) {
        return '<td' + (c.num ? ' class="num"' : '') + (c.tdStyle ? ' style="' + c.tdStyle + '"' : '') + '>' + c.render(r) + '</td>';
      }).join('') + '</tr>';
    }
    function skeleton() {
      var cells = cfg.columns.map(function (c, i) {
        if (i === 0) return '<td><div class="cell-name"><span class="skel" style="width:28px;height:28px;border-radius:8px"></span><div><div class="skel" style="width:120px;margin-bottom:5px"></div><div class="skel" style="width:70px;height:10px"></div></div></div></td>';
        return '<td><div class="skel" style="width:' + (50 + (i % 3) * 18) + 'px"></div></td>';
      }).join('');
      var r = ''; for (var i = 0; i < 6; i++) r += '<tr>' + cells + '</tr>';
      return '<table class="tbl">' + HEAD + '<tbody>' + r + '</tbody></table>';
    }
    function table(rows) { return '<table class="tbl">' + HEAD + '<tbody>' + rows.map(rowHtml).join('') + '</tbody></table>'; }
    function empty() {
      return '<div style="padding:56px 24px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:6px">'
        + '<span style="width:52px;height:52px;border-radius:var(--radius-lg);background:var(--color-accent-subtle);display:flex;align-items:center;justify-content:center;margin-bottom:6px"><i data-lucide="' + (cfg.emptyIcon || 'inbox') + '" style="font-size:26px;color:var(--color-accent)"></i></span>'
        + '<div style="font-weight:600;font-size:15px">' + (cfg.emptyTitle || 'Nothing here yet') + '</div>'
        + '<div style="font-size:13px;color:var(--color-text-tertiary);max-width:340px">' + (cfg.emptyText || '') + '</div>'
        + '<button class="btn btn-secondary btn-sm" id="clearBtn" style="margin-top:10px"><i data-lucide="x"></i>Clear filters</button></div>';
    }
    function icons() { if (window.lucide) lucide.createIcons(); }
    function applySearch() {
      var q = (document.getElementById('search') ? document.getElementById('search').value : '').toLowerCase().trim();
      var rows = cfg.rows.filter(function (r) { return !q || cfg.search(r, q); });
      if (rows.length === 0) { wrap.innerHTML = empty(); icons(); return; }
      wrap.innerHTML = table(rows); icons();
    }
    function setState(s) {
      if (s === 'loading') wrap.innerHTML = skeleton();
      else if (s === 'empty') wrap.innerHTML = empty();
      else applySearch();
      icons();
    }
    function active() { var on = document.querySelector('#stateSeg .on'); return on ? on.dataset.state : 'data'; }
    function gotoState(name) {
      var seg = document.getElementById('stateSeg'); if (seg) { seg.querySelectorAll('button').forEach(function (x) { x.classList.remove('on'); }); var b = seg.querySelector('[data-state="' + name + '"]'); if (b) b.classList.add('on'); }
      setState(name);
    }
    var seg = document.getElementById('stateSeg');
    if (seg) seg.addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) gotoState(b.dataset.state); });
    var search = document.getElementById('search');
    if (search) search.addEventListener('input', function () { if (active() === 'data') applySearch(); });
    var fb = document.getElementById('filterbar');
    if (fb) fb.addEventListener('click', function (e) { var b = e.target.closest('.fdrop'); if (b) b.classList.toggle('on'); });
    var nt = document.getElementById('navToggle');
    if (nt) nt.onclick = function () { document.getElementById('app').classList.toggle('collapsed'); };
    wrap.addEventListener('click', function (e) {
      var tr = e.target.closest('tr[data-href]'); if (tr) { location.href = tr.dataset.href; return; }
      if (e.target.closest('#clearBtn')) { if (search) search.value = ''; gotoState('data'); }
    });
    icons();
    if (seg) { setState('loading'); setTimeout(function () { gotoState('data'); }, 550); }
    else setState('data');
  };
})();
