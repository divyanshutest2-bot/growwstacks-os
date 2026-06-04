// GrowwStacks OS — shared left nav.
// <aside id="sidebar" data-active="…" [data-role="dev"] [data-user="Neha Kapoor" data-user-role="Developer" data-user-init="NK" data-user-color="var(--green-600)"]></aside>
(function () {
  var FULL = [
    ['dashboard', 'Dashboard', 'layout-grid', 'Dashboard.html', null],
    ['companies', 'Companies', 'building-2', 'Companies.html', null],
    ['contacts', 'Contacts', 'contact', 'Contacts.html', null],
    ['deals', 'Deals', 'handshake', 'Deals.html', null],
    ['projects', 'Projects', 'kanban', 'index.html', null],
    ['milestones', 'Milestones', 'flag', 'Milestones.html', null],
    ['payments', 'Payments', 'receipt', 'Payments.html', null],
    ['tasks', 'Tasks', 'square-check', 'Tasks.html', null]
  ];
  // Developer world: no companies / contacts / deals / payments — those simply don't exist here.
  var DEV = [
    ['dashboard', 'My work', 'layout-grid', '#', null],
    ['projects', 'Projects', 'kanban', 'Project (Developer view).html', null],
    ['milestones', 'Milestones', 'flag', '#', null],
    ['tasks', 'My tasks', 'square-check', '#', '6']
  ];
  var ADMIN = [
    ['users', 'Users', 'user-cog', 'Users.html'],
    ['integrations', 'Integrations', 'cable', 'Integrations.html']
  ];
  // Client portal: only their own world.
  var CLIENT = [
    ['projects', 'Projects', 'kanban', '#', null],
    ['timeline', 'Timeline', 'route', 'Client Timeline.html', null],
    ['deliverables', 'Deliverables', 'package', '#', null]
  ];

  function link(it, active) {
    var on = it[0] === active ? ' active' : '';
    var badge = it[4] ? '<span class="ni-badge">' + it[4] + '</span>' : '';
    return '<a class="ni' + on + '" href="' + it[3] + '"><i data-lucide="' + it[2] + '"></i><span class="ni-label">' + it[1] + '</span>' + badge + '</a>';
  }

  function build(el) {
    var active = el.getAttribute('data-active');
    var role = el.getAttribute('data-role');
    var dev = role === 'dev';
    var client = role === 'client';
    var items = dev ? DEV : client ? CLIENT : FULL;
    var uName = el.getAttribute('data-user') || 'Arjun Rao';
    var uRole = el.getAttribute('data-user-role') || 'Admin';
    var uInit = el.getAttribute('data-user-init') || 'AR';
    var uColor = el.getAttribute('data-user-color') || 'var(--iris-600)';

    var h = '<div class="brandrow"><span class="brandmark"><i data-lucide="layers" class="ic-fill"></i></span><span class="brandname">GrowwStacks<span> OS</span></span></div>';
    items.forEach(function (it) { h += link(it, active); });
    if (!client) {
      h += '<div class="nh">AI Supervisor</div>';
      h += '<a class="ni' + (active === 'attention' ? ' active' : '') + '" href="' + (dev ? '#' : 'Dashboard.html') + '"><i data-lucide="sparkles" class="ic-fill" style="color:var(--iris-300)"></i><span class="ni-label">' + (dev ? 'My attention' : 'Attention') + '</span><span class="ni-badge">' + (dev ? '3' : '7') + '</span></a>';
    }
    if (!dev && !client) {
      h += '<div class="nh">Admin</div>';
      ADMIN.forEach(function (it) { h += link(it, active); });
    }
    h += '<div class="acct"><div class="acct-row"><span class="avatar" style="background:' + uColor + ';box-shadow:none;width:26px;height:26px">' + uInit + '</span><div class="acct-meta"><div class="n">' + uName + '</div><div class="r">' + uRole + '</div></div><i data-lucide="chevrons-up-down" style="color:var(--color-sidebar-text-muted);font-size:14px"></i></div></div>';
    return h;
  }

  var el = document.getElementById('sidebar');
  if (el) { el.className = 'sidebar'; el.innerHTML = build(el); }
})();
