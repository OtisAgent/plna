// HAF PLNA Driver Dashboard — app-core.js
// Part 1 of 3: constants, shell, today tab
// Loaded via defer — runs before app-tabs.js and app-actions.js

function mondayOf(ds) {
  var d = new Date(ds + 'T00:00:00'); var day = d.getDay() || 7; d.setDate(d.getDate() - day + 1); return d.toISOString().slice(0, 10);
}

var API = sessionStorage.getItem('plna_api') || '';
var TOKEN = sessionStorage.getItem('plna_token') || '';
var TABS = [['today','📦','Today'],['calendar','📅','Calendar'],['money','💰','Money'],['reports','📊','Reports'],['compliance','📋','Compliance'],['users','👥','Users']];

if (!TOKEN) { window.location.href = API + '/'; }

var STATE = { driver: null, jobs: [], earnings: null, docs: [], weekStart: mondayOf(new Date().toISOString().slice(0,10)), costPerMile: 0.45 };
var activeTab = 'today';

async function api(path, opts) {
  opts = opts || {};
  var r = await fetch(API + path, { headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + TOKEN }, ...opts });
  if (r.status === 401) { window.location.href = API + '/'; return null; }
  return r.json();
}

// ─── Init ─────────────────────────────────────────────────────────────────────
async function init() {
  var res = await Promise.all([api('/api/driver'), api('/api/jobs/today')]);
  if (!res[0]) return;
  STATE.driver = res[0];
  STATE.jobs = res[1] && res[1].jobs ? res[1].jobs : [];
  renderShell();
  renderTab('today');
}

// ─── Shell ────────────────────────────────────────────────────────────────────
function renderShell() {
  var d = STATE.driver;
  var sidebar = '<aside class="sidebar w-72 fixed top-0 left-0 h-screen flex flex-col z-50 hidden md:flex">'
    + '<div class="px-6 py-5 border-b border-white/10"><h1 class="text-white font-bold text-lg">🚚 HAF PLNA</h1><p class="text-white/40 text-xs mt-1">Driver Platform</p></div>'
    + '<div class="px-6 py-4 border-b border-white/10">'
    + '<p class="text-white font-semibold text-sm">' + d.name + '</p>'
    + '<p class="text-white/40 text-xs mt-0.5">' + d.id + ' · ' + d.plan + ' Plan</p>'
    + '<div class="flex items-center justify-between mt-3">'
    + '<span class="text-white/50 text-xs">Available for work</span>'
    + '<button id="avail-btn" onclick="toggleAvail()" class="w-10 h-6 rounded-full ' + (d.available ? 'toggle-on' : 'toggle-off') + ' relative flex-shrink-0 transition-colors">'
    + '<span id="avail-dot" class="absolute top-0.5 ' + (d.available ? 'right-0.5' : 'left-0.5') + ' w-5 h-5 bg-white rounded-full transition-all"></span>'
    + '</button></div></div>'
    + '<nav class="flex-1 py-4"><ul>'
    + TABS.map(function(t) { return '<li id="nav-' + t[0] + '" onclick="switchTab(\'' + t[0] + '\')" class="nav-item flex items-center gap-3 px-6 py-3 cursor-pointer text-sm font-medium text-white/60 hover:text-white hover:bg-white/5">' + t[1] + ' ' + t[2] + '</li>'; }).join('')
    + '</ul></nav>'
    + '<div class="px-6 py-4 border-t border-white/10"><button onclick="logout()" class="w-full py-2 text-sm text-white/40 border border-white/20 rounded-lg hover:border-red-400 hover:text-red-400 transition-colors">Sign out</button></div>'
    + '</aside>'
    + '<main class="flex-1 md:ml-72 pb-20 md:pb-8"><div id="content" class="p-6"></div></main>'
    + '<nav class="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50 h-16"><div class="flex h-full">'
    + TABS.map(function(t) { return '<div id="bnav-' + t[0] + '" onclick="switchTab(\'' + t[0] + '\')" class="flex-1 flex flex-col items-center justify-center gap-1 cursor-pointer text-xs font-semibold text-gray-400">' + t[1] + '<span>' + t[2] + '</span></div>'; }).join('')
    + '</div></nav>';
  document.getElementById('app').innerHTML = sidebar;
  setActiveNav('today');
}

function setActiveNav(tab) {
  TABS.forEach(function(t) {
    var k = t[0];
    var el = document.getElementById('nav-' + k);
    var bn = document.getElementById('bnav-' + k);
    if (el) { el.classList.toggle('nav-active', k === tab); if (k !== tab) el.classList.remove('nav-active'); }
    if (bn) bn.style.color = k === tab ? '#FF6B35' : '';
  });
}

function switchTab(tab) {
  activeTab = tab;
  setActiveNav(tab);
  renderTab(tab);
}

async function renderTab(tab) {
  var el = document.getElementById('content');
  el.innerHTML = '<div class="text-gray-400 text-sm py-8 text-center">Loading…</div>';
  if (tab === 'today') { el.innerHTML = renderToday(); return; }
  if (tab === 'calendar') { var rc = await api('/api/calendar?week=' + STATE.weekStart); el.innerHTML = renderCalendar(rc && rc.jobs ? rc.jobs : []); return; }
  if (tab === 'money') { if (!STATE.earnings) STATE.earnings = await api('/api/earnings'); el.innerHTML = renderMoney(); return; }
  if (tab === 'reports') { if (!STATE.earnings) STATE.earnings = await api('/api/earnings'); el.innerHTML = renderReports(); return; }
  if (tab === 'compliance') { if (!STATE.docs.length) { var rd = await api('/api/documents'); STATE.docs = rd && rd.documents ? rd.documents : []; } el.innerHTML = renderCompliance(); return; }
  if (tab === 'users') { el.innerHTML = renderUsers(); return; }
}

// ─── Today tab ────────────────────────────────────────────────────────────────
function renderToday() {
  var d = STATE.driver, jobs = STATE.jobs;
  var h = new Date().getHours();
  var greet = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  var del = jobs.filter(function(j) { return j.st === 'delivered'; }).length;
  var mi = jobs.reduce(function(s, j) { return s + j.mi; }, 0).toFixed(1);
  var pay = jobs.reduce(function(s, j) { return s + j.pay; }, 0).toFixed(2);
  var waMsg = encodeURIComponent('Hi HAF — sharing my live location now. Driver ' + d.id + '.');
  var loc = d.location;
  var locCard = loc && loc.active
    ? '<div class="bg-white rounded-xl p-4 border flex flex-wrap items-center justify-between gap-3 mb-6"><div><p class="font-bold text-gray-800">📍 Location live</p><p class="text-sm text-gray-500">Updated ' + loc.updated_min + ' min ago \xb7 via WhatsApp</p></div><a href="https://wa.me/447707705331?text=' + waMsg + '" target="_blank" class="px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-bold">📤 Update on WhatsApp</a></div>'
    : '<div class="bg-white rounded-xl p-4 border flex flex-wrap items-center justify-between gap-3 mb-6"><div><p class="font-bold text-gray-800">📍 Go active — share your location</p><p class="text-sm text-gray-500">Tap 📎 → Location → Share live location in WhatsApp</p></div><div class="flex gap-2"><a href="https://wa.me/447707705331?text=' + waMsg + '" target="_blank" class="px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-bold">Go active →</a><button onclick="shareGPS()" class="px-3 py-2 border border-gray-200 rounded-lg text-sm font-semibold text-gray-600">📱 Use GPS</button></div></div>';
  var statDefs = [['Jobs today', jobs.length, 'runs scheduled'], ['Delivered', del, del + '/' + jobs.length + ' done'], ['Loaded miles', mi + ' mi', 'all jobs'], ['Expected pay', '\xa3' + pay, 'before deductions']];
  var stats = statDefs.map(function(x, i) {
    return '<div class="' + (i === 3 ? 'bg-orange-500' : 'bg-white border') + ' rounded-xl p-4"><p class="text-xs font-bold uppercase tracking-wide ' + (i === 3 ? 'text-white/80' : 'text-gray-400') + '">' + x[0] + '</p><p class="text-2xl font-black ' + (i === 3 ? 'text-white' : 'text-gray-800') + ' mt-1">' + x[1] + '</p><p class="text-xs ' + (i === 3 ? 'text-white/70' : 'text-gray-400') + ' mt-1">' + x[2] + '</p></div>';
  }).join('');
  var chips = [
    d.clever_checked ? '<span class="px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">✓ Clever Checked</span>' : '<span class="px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">⚠ Docs needed</span>',
    '<span class="px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">🚐 ' + d.van + '</span>',
    '<span class="px-3 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-700">📍 ' + d.base + '</span>',
    '<span class="px-3 py-1 rounded-full text-xs font-semibold bg-orange-100 text-orange-700">★ ' + d.plan + '</span>'
  ].join('');
  return '<div class="max-w-3xl mx-auto">'
    + '<div class="mb-5"><h2 class="text-2xl font-black text-gray-800">' + greet + ', ' + d.name.split(' ')[0] + '.</h2>'
    + '<p class="text-gray-500 text-sm mt-1">' + new Date().toLocaleDateString('en-GB', {weekday:'long',day:'numeric',month:'long',year:'numeric'}) + '</p></div>'
    + '<div class="flex flex-wrap gap-2 mb-5">' + chips + '</div>'
    + '<div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">' + stats + '</div>'
    + locCard
    + '<div class="flex flex-col gap-4">' + jobs.map(function(j) { return jobCard(j); }).join('') + '</div>'
    + '</div>';
}

var ST = {offered:'bg-orange-100 text-orange-700',accepted:'bg-blue-100 text-blue-700',collected:'bg-amber-100 text-amber-700',in_transit:'bg-amber-100 text-amber-700',delivered:'bg-green-100 text-green-700',declined:'bg-red-100 text-red-700'};
var SL = {offered:'🔔 Offered',accepted:'✓ Accepted',collected:'📦 Collected',in_transit:'🚚 In transit',delivered:'✅ Delivered',declined:'✗ Declined'};

function badge(st) {
  return '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ' + (ST[st] || 'bg-gray-100 text-gray-600') + '">' + (SL[st] || st) + '</span>';
}

function jobCard(job) {
  var isCur = ['in_transit','collected'].includes(job.st);
  var wa = 'https://wa.me/447707705331?text=' + encodeURIComponent('HAF Job ' + job.id + ': ' + (isCur ? 'delivering to ' + job.dc : 'on my way to ' + job.pc) + '. Driver ' + STATE.driver.id + '.');
  var gcal = 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent('HAF Drive: ' + job.pc + '→' + job.dc) + '&dates=' + job.t.replace(':', '') + '00Z/' + job.t.replace(':', '') + '3600Z&details=' + encodeURIComponent('\xa3' + job.pay.toFixed(2) + ' \xb7 ' + job.mi + ' mi');
  var action = '';
  if (job.st === 'offered') action = STATE.driver.clever_checked
    ? '<button onclick="updateJob(\'' + job.id + '\',\'accepted\')" class="px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-bold">Accept job</button>'
    : '<span class="text-xs bg-amber-50 text-amber-600 px-3 py-2 rounded-lg">🔒 Upload Clever Checked docs to accept</span>';
  if (job.st === 'accepted') action = '<button onclick="updateJob(\'' + job.id + '\',\'collected\')" class="px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-bold">Mark collected</button>';
  if (['collected','in_transit'].includes(job.st)) action = '<button onclick="updateJob(\'' + job.id + '\',\'delivered\')" class="px-4 py-2 bg-green-500 text-white rounded-lg text-sm font-bold">Mark delivered ✓</button>';
  return '<div id="job-' + job.id + '" class="bg-white rounded-xl p-5 border ' + (isCur ? 'job-current' : '') + ' ' + (job.st === 'delivered' ? 'opacity-70' : '') + '">'
    + '<div class="flex justify-between items-start mb-3"><span class="text-sm text-gray-400 font-semibold">⏰ ' + job.t + '</span>' + badge(job.st) + '</div>'
    + '<p class="font-bold text-gray-800 mb-3">' + job.pc + ' → ' + job.dc + '</p>'
    + '<div class="grid grid-cols-2 gap-2 mb-3 text-xs">'
    + '<div class="bg-gray-50 rounded-lg p-2"><p class="text-gray-400 font-bold uppercase">Collect</p><p class="font-medium text-gray-700 mt-0.5">' + job.pa + '</p></div>'
    + '<div class="bg-gray-50 rounded-lg p-2"><p class="text-gray-400 font-bold uppercase">Deliver</p><p class="font-medium text-gray-700 mt-0.5">' + job.da + '</p></div>'
    + '</div>'
    + '<div class="flex gap-4 text-sm text-gray-400 mb-3"><span>📏 <strong class="text-gray-700">' + job.mi + ' mi</strong></span><span>💷 <strong class="text-gray-700">\xa3' + job.pay.toFixed(2) + '</strong></span></div>'
    + '<div class="flex flex-wrap gap-2">' + action
    + '<a href="' + wa + '" target="_blank" class="px-3 py-2 border border-gray-200 rounded-lg text-sm font-semibold text-gray-600 hover:border-orange-300">💬 WhatsApp HAF</a>'
    + '<a href="' + gcal + '" target="_blank" class="px-3 py-2 border border-gray-200 rounded-lg text-sm font-semibold text-gray-600 hover:border-blue-300">📅 Calendar</a>'
    + '</div></div>';
}

async function updateJob(id, status) {
  await api('/api/job/' + id + '/status', { method: 'PATCH', body: JSON.stringify({ status: status }) });
  var j = STATE.jobs.find(function(x) { return x.id === id; });
  if (j) j.st = status;
  document.getElementById('content').innerHTML = renderToday();
}
