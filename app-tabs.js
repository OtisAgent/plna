// HAF PLNA Driver Dashboard — app-tabs.js
// Part 2 of 3: calendar, money, reports, compliance tabs
// Runs after app-core.js (defer order) — STATE and api() are global from part 1

// ─── Calendar tab ────────────────────────────────────────────────────────────
function renderCalendar(jobs) {
  var mon = new Date(STATE.weekStart + 'T00:00:00');
  var tod = new Date().toISOString().slice(0, 10);
  var days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  var end = new Date(mon); end.setDate(mon.getDate() + 6);
  var prev = new Date(mon); prev.setDate(mon.getDate() - 7);
  var next = new Date(mon); next.setDate(mon.getDate() + 7);
  var cols = days.map(function(d, i) {
    var day = new Date(mon); day.setDate(mon.getDate() + i);
    var ds = day.toISOString().slice(0, 10);
    var isT = ds === tod;
    var dj = jobs.filter(function(j) { return j.date === ds; });
    var tot = dj.reduce(function(s, j) { return s + j.pay; }, 0);
    var inner = dj.length
      ? dj.map(function(j) {
          return '<div class="bg-gray-50 rounded p-2 mb-1.5 text-xs">'
            + '<p class="text-gray-400 font-semibold">' + j.t + '</p>'
            + '<p class="font-bold text-gray-700">' + j.pc + '→' + j.dc + '</p>'
            + '<p class="text-green-600 font-bold">\xa3' + j.pay.toFixed(2) + '</p>'
            + '<a href="https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent('HAF Drive: ' + j.pc + '→' + j.dc) + '&dates=' + j.t.replace(':', '') + '00Z/' + j.t.replace(':', '') + '3600Z" target="_blank" class="text-gray-400 hover:text-blue-500">📅 Add</a>'
            + '</div>';
        }).join('') + '<p class="text-xs font-bold text-orange-500 border-t pt-1 mt-1">\xa3' + tot.toFixed(2) + '</p>'
      : '<p class="text-xs text-gray-400 italic text-center py-2">Free</p>';
    return '<div class="rounded-xl p-3 border ' + (isT ? 'border-orange-400 bg-orange-50' : 'bg-white') + '">'
      + '<p class="text-xs font-bold text-gray-400 uppercase">' + d + '</p>'
      + '<p class="text-xl font-black ' + (isT ? 'text-orange-500' : 'text-gray-800') + ' mb-2">' + day.getDate() + '</p>'
      + inner + '</div>';
  }).join('');
  return '<div class="max-w-5xl mx-auto">'
    + '<div class="mb-6"><h2 class="text-2xl font-black text-gray-800">Calendar</h2><p class="text-gray-500 text-sm mt-1">Your week at a glance.</p></div>'
    + '<div class="flex items-center justify-between mb-4">'
    + '<button onclick="changeWeek(\'' + prev.toISOString().slice(0,10) + '\')" class="px-4 py-2 border border-gray-200 rounded-lg text-sm font-semibold hover:border-orange-300">← Prev</button>'
    + '<h3 class="font-bold text-gray-700">' + mon.toLocaleDateString('en-GB',{day:'numeric',month:'short'}) + ' – ' + end.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}) + '</h3>'
    + '<button onclick="changeWeek(\'' + next.toISOString().slice(0,10) + '\')" class="px-4 py-2 border border-gray-200 rounded-lg text-sm font-semibold hover:border-orange-300">Next →</button>'
    + '</div>'
    + '<div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">' + cols + '</div>'
    + '<div class="flex justify-end mt-4"><button onclick="exportCal()" class="px-4 py-2 border border-gray-200 rounded-lg text-sm font-semibold text-gray-600 hover:border-orange-300">📥 Export week (.ics)</button></div>'
    + '</div>';
}

async function changeWeek(ws) {
  STATE.weekStart = ws;
  var r = await api('/api/calendar?week=' + ws);
  document.getElementById('content').innerHTML = renderCalendar(r && r.jobs ? r.jobs : []);
}

// ─── Money tab ────────────────────────────────────────────────────────────────
function renderMoney() {
  var e = STATE.earnings || {};
  var cardDefs = [['Earned this week', '\xa3' + (e.earned || 0).toFixed(2), 'All jobs'], ['Payable next', '\xa3' + (e.payable || 0).toFixed(2), 'Awaiting transfer'], ['Paid out', '\xa3' + (e.paid || 0).toFixed(2), 'Received'], ['Booked ahead', '\xa3' + (e.booked || 0).toFixed(2), 'Upcoming']];
  var cards = cardDefs.map(function(x) {
    return '<div class="bg-white rounded-xl p-4 border"><p class="text-xs font-bold uppercase tracking-wide text-gray-400">' + x[0] + '</p><p class="text-2xl font-black text-gray-800 mt-1">' + x[1] + '</p><p class="text-xs text-gray-400 mt-1">' + x[2] + '</p></div>';
  }).join('');
  var PS = {paid:'bg-green-100 text-green-700',payable:'bg-amber-100 text-amber-700',upcoming:'bg-blue-100 text-blue-700'};
  var rows = (e.jobs || []).map(function(j) {
    return '<tr class="border-b last:border-0"><td class="py-2.5 font-semibold text-gray-700 text-sm">' + j.id + '</td><td class="py-2.5 text-gray-500 text-sm">' + (j.pc || '') + '→' + (j.dc || '') + '</td><td class="py-2.5 font-bold text-green-600 text-sm">\xa3' + j.pay.toFixed(2) + '</td><td class="py-2.5"><span class="text-xs font-semibold px-2.5 py-1 rounded-full ' + (PS[j.pay_status] || 'bg-gray-100 text-gray-600') + '">' + j.pay_status + '</span></td></tr>';
  }).join('');
  return '<div class="max-w-3xl mx-auto">'
    + '<div class="mb-6"><h2 class="text-2xl font-black text-gray-800">Money &amp; Payouts</h2></div>'
    + '<div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">' + cards + '</div>'
    + '<div class="bg-white rounded-xl border p-5"><h3 class="font-bold text-gray-800 mb-4">Job breakdown</h3><div class="overflow-x-auto"><table class="w-full"><thead><tr class="text-left text-xs font-bold text-gray-400 uppercase border-b"><th class="pb-2">Job</th><th class="pb-2">Route</th><th class="pb-2">Pay</th><th class="pb-2">Status</th></tr></thead><tbody>' + rows + '</tbody></table></div></div>'
    + '</div>';
}

// ─── Reports tab ──────────────────────────────────────────────────────────────
function renderReports() {
  var cpm = STATE.costPerMile;
  var jobs = (STATE.earnings && STATE.earnings.jobs ? STATE.earnings.jobs : []).filter(function(j) { return j.st !== 'declined'; });
  var tp = 0, pay = 0, mi = 0;
  var rows = jobs.map(function(j) {
    var c = j.mi * cpm, pr = j.pay - c, mg = j.pay > 0 ? pr / j.pay * 100 : 0;
    tp += pr; pay += j.pay; mi += j.mi;
    return '<tr class="border-b last:border-0"><td class="py-2.5 font-semibold text-gray-700 text-sm">' + (j.pc || '') + '→' + (j.dc || '') + '</td><td class="py-2.5 text-gray-500 text-sm">' + j.mi + '</td><td class="py-2.5 text-sm">\xa3' + j.pay.toFixed(2) + '</td><td class="py-2.5 text-red-500 text-sm">\xa3' + c.toFixed(2) + '</td><td class="py-2.5 font-bold text-sm ' + (pr >= 0 ? 'text-green-600' : 'text-red-500') + '">\xa3' + pr.toFixed(2) + '</td><td class="py-2.5 text-gray-400 text-xs">' + mg.toFixed(0) + '%</td></tr>';
  });
  var am = pay > 0 ? tp / pay * 100 : 0;
  var ppm = mi > 0 ? tp / mi : 0;
  var bst = Math.max.apply(null, [0].concat(jobs.map(function(j) { return j.pay - j.mi * cpm; })));
  var statDefs = [['Total profit', '\xa3' + tp.toFixed(2), 'This week'], ['Avg margin', am.toFixed(0) + '%', 'After costs'], ['Per mile', '\xa3' + ppm.toFixed(2), 'All drives'], ['Best drive', '\xa3' + bst.toFixed(2), 'Highest profit']];
  var statCards = statDefs.map(function(x, i) {
    return '<div class="' + (i === 3 ? 'bg-orange-500' : 'bg-white border') + ' rounded-xl p-4"><p class="text-xs font-bold uppercase tracking-wide ' + (i === 3 ? 'text-white/80' : 'text-gray-400') + '">' + x[0] + '</p><p class="text-2xl font-black ' + (i === 3 ? 'text-white' : 'text-gray-800') + ' mt-1">' + x[1] + '</p><p class="text-xs ' + (i === 3 ? 'text-white/70' : 'text-gray-400') + ' mt-1">' + x[2] + '</p></div>';
  }).join('');
  return '<div class="max-w-3xl mx-auto">'
    + '<div class="mb-5"><h2 class="text-2xl font-black text-gray-800">Reports &amp; Analytics</h2></div>'
    + '<div class="flex items-center gap-3 mb-5 bg-white rounded-xl border p-4"><label class="text-sm font-semibold text-gray-700">Cost per mile (\xa3)</label><input type="number" value="' + cpm + '" step="0.01" min="0.10" max="1.00" onchange="STATE.costPerMile=parseFloat(this.value);renderTab(\'reports\')" class="border-2 border-gray-200 rounded-lg px-3 py-2 text-sm w-24 focus:border-orange-400 focus:outline-none"><span class="text-xs text-gray-400">HMRC rate: 45p</span></div>'
    + '<div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">' + statCards + '</div>'
    + '<div class="bg-white rounded-xl border p-5"><div class="overflow-x-auto"><table class="w-full"><thead><tr class="text-left text-xs font-bold text-gray-400 uppercase border-b"><th class="pb-2">Drive</th><th class="pb-2">Mi</th><th class="pb-2">Pay</th><th class="pb-2">Cost</th><th class="pb-2">Profit</th><th class="pb-2">Margin</th></tr></thead><tbody>' + rows.join('') + '</tbody></table></div></div>'
    + '</div>';
}

// ─── Compliance tab ───────────────────────────────────────────────────────────
function renderCompliance() {
  var d = STATE.driver, docs = STATE.docs;
  var DST = {verified:'bg-green-100 text-green-700',pending:'bg-amber-100 text-amber-700',rejected:'bg-red-100 text-red-700',missing:'bg-gray-100 text-gray-600'};
  var DLB = {verified:'✅ Verified',pending:'⏳ Under review',rejected:'✗ Not accepted',missing:'— Not uploaded'};
  var anyP = docs.some(function(x) { return x.st === 'pending'; });
  var cleverUrl = 'https://cleverpay-dev.pages.dev/upload?driver_id=' + encodeURIComponent(d.id);
  var statusBadge = d.clever_checked
    ? '<span class="text-xs bg-green-100 text-green-700 px-2.5 py-1 rounded-full font-bold">✅ Clever Checked</span>'
    : anyP
      ? '<span class="text-xs bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full font-bold">⏳ Under review</span>'
      : '<span class="text-xs bg-red-100 text-red-700 px-2.5 py-1 rounded-full font-bold">Documents needed</span>';
  var detailDefs = [['Driver ID',d.id],['Name',d.name],['Plan',d.plan],['Base',d.base],['Van',d.van],['Clever Checked',d.clever_checked ? '✅ Verified' : '⚠ Docs needed']];
  var details = detailDefs.map(function(x) { return '<div><p class="text-xs font-bold text-gray-400 uppercase tracking-wide">' + x[0] + '</p><p class="font-semibold text-gray-800 mt-0.5 text-sm">' + x[1] + '</p></div>'; }).join('');
  var docList = docs.map(function(doc) {
    return '<div class="flex items-center justify-between py-3 border-b last:border-0"><div><p class="font-semibold text-gray-800 text-sm">' + doc.lbl + '</p>' + (doc.note ? '<p class="text-xs text-gray-400 mt-0.5">' + doc.note + '</p>' : '') + '</div><span class="text-xs font-semibold px-2.5 py-1 rounded-full ' + (DST[doc.st] || 'bg-gray-100') + '">' + (DLB[doc.st] || doc.st) + '</span></div>';
  }).join('');
  var plans = ['Lite','Plus','Pro'].map(function(p) {
    return '<div class="rounded-xl border-2 ' + (d.plan === p ? 'border-orange-400 bg-orange-50' : 'border-gray-200') + ' p-4 text-center"><p class="font-black text-gray-800">' + p + '</p><p class="text-xs text-gray-400 mt-1">' + (p === 'Lite' ? 'Free' : p === 'Plus' ? '\xa329/mo' : '\xa359/mo') + '</p>' + (d.plan === p ? '<p class="text-xs text-orange-500 font-bold mt-2">Your plan</p>' : '') + '</div>';
  }).join('');
  return '<div class="max-w-2xl mx-auto">'
    + '<div class="mb-6"><h2 class="text-2xl font-black text-gray-800">Compliance &amp; Profile</h2></div>'
    + '<div class="bg-white rounded-xl border p-5 mb-5"><h3 class="font-bold text-gray-800 mb-4">Driver details</h3><div class="grid grid-cols-2 gap-4">' + details + '</div></div>'
    + '<div class="bg-white rounded-xl border p-5 mb-5"><div class="flex items-center justify-between mb-4"><h3 class="font-bold text-gray-800">Clever Checked documents</h3>' + statusBadge + '</div>'
    + docList
    + '<a href="' + cleverUrl + '" target="_blank" class="mt-4 inline-flex items-center gap-2 bg-orange-500 text-white px-4 py-2.5 rounded-xl font-bold text-sm hover:bg-orange-400 transition-colors">📄 Upload / view documents on Clever portal →</a>'
    + '<p class="text-xs text-gray-400 mt-3">Documents are reviewed by the HAF team. Status updates here once checked.</p></div>'
    + '<div class="bg-white rounded-xl border p-5"><h3 class="font-bold text-gray-800 mb-1">Your plan</h3><p class="text-sm text-gray-400 mb-4">To change plan, message HAF on WhatsApp.</p><div class="grid grid-cols-3 gap-3">' + plans + '</div></div>'
    + '</div>';
}
