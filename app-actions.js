// HAF PLNA Driver Dashboard — app-actions.js
// Part 3 of 3: users tab, actions, and bootstrap
// Runs last (defer order) — all functions from parts 1 & 2 are global by now

// ─── Users tab ────────────────────────────────────────────────────────────────
function renderUsers() {
  var d = STATE.driver;
  var toggleDefs = [
    ['KNECT access', 'Receive and respond to network job offers from KNECT.', true],
    ['PLNA tier', 'Current tier: ' + d.plan + '. Change via WhatsApp.', true],
    ['Clever Checked', d.clever_checked ? 'Verified — you can accept live jobs.' : 'Upload documents on Compliance tab to unlock.', d.clever_checked]
  ];
  var toggles = toggleDefs.map(function(x) {
    return '<div class="flex items-center justify-between py-4 border-b last:border-0">'
      + '<div class="pr-4"><h4 class="font-bold text-gray-800 text-sm">' + x[0] + '</h4><p class="text-xs text-gray-400 mt-0.5">' + x[1] + '</p></div>'
      + '<div class="w-10 h-6 rounded-full ' + (x[2] ? 'toggle-on' : 'toggle-off') + ' relative flex-shrink-0">'
      + '<span class="absolute top-0.5 ' + (x[2] ? 'right-0.5' : 'left-0.5') + ' w-5 h-5 bg-white rounded-full"></span>'
      + '</div></div>';
  }).join('');
  return '<div class="max-w-xl mx-auto">'
    + '<div class="mb-6"><h2 class="text-2xl font-black text-gray-800">Users &amp; Access</h2></div>'
    + '<div class="bg-white rounded-xl border p-5 mb-5">'
    + '<h3 class="font-bold text-gray-800 mb-1">Account holder</h3>'
    + '<p class="text-sm text-gray-400 mb-4">Only you can change access settings.</p>'
    + toggles
    + '</div>'
    + '<div class="bg-white rounded-xl border p-5"><h3 class="font-bold text-gray-800 mb-1">Team members</h3><p class="text-sm text-gray-400 mb-3">Invite someone to help manage this account.</p><p class="text-sm text-gray-400 italic">Just you right now. Team invites coming soon.</p></div>'
    + '</div>';
}

// ─── Actions ──────────────────────────────────────────────────────────────────
async function toggleAvail() {
  STATE.driver.available = !STATE.driver.available;
  await api('/api/driver/available', { method: 'PATCH', body: JSON.stringify({ available: STATE.driver.available }) });
  var btn = document.getElementById('avail-btn'), dot = document.getElementById('avail-dot');
  if (btn) btn.className = btn.className.replace(/toggle-\w+/, 'toggle-' + (STATE.driver.available ? 'on' : 'off'));
  if (dot) dot.className = dot.className.replace(/(right|left)-0\.5/, (STATE.driver.available ? 'right' : 'left') + '-0.5');
}

function shareGPS() {
  if (!navigator.geolocation) { alert('Location not available on this device.'); return; }
  navigator.geolocation.getCurrentPosition(function(pos) {
    api('/api/driver/location', { method: 'PATCH', body: JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude }) });
    if (!STATE.driver.location) STATE.driver.location = {};
    Object.assign(STATE.driver.location, { lat: pos.coords.latitude, lng: pos.coords.longitude, updated_min: 0, active: true });
    document.getElementById('content').innerHTML = renderToday();
  }, function() { alert('Could not get location.'); });
}

function exportCal() {
  var jobs = STATE.earnings && STATE.earnings.jobs ? STATE.earnings.jobs : [];
  var lines = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//HAF PLNA//EN'];
  jobs.forEach(function(j) {
    var parts = j.t ? j.t.split(':').map(Number) : [8, 0];
    var dt = new Date(j.date + 'T00:00:00'); dt.setHours(parts[0], parts[1]);
    var dtE = new Date(dt); dtE.setHours(parts[0] + 1, parts[1]);
    var fmt = function(d) { return d.toISOString().replace(/[-:]/g,'').slice(0,15) + 'Z'; };
    lines.push('BEGIN:VEVENT', 'DTSTART:' + fmt(dt), 'DTEND:' + fmt(dtE), 'SUMMARY:HAF Drive ' + (j.pc || '') + '→' + (j.dc || ''), 'DESCRIPTION:\xa3' + j.pay.toFixed(2), 'END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  var a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([lines.join('\r\n')], { type: 'text/calendar' }));
  a.download = 'plna-week.ics';
  a.click();
}

function logout() {
  sessionStorage.removeItem('plna_token');
  sessionStorage.removeItem('plna_api');
  window.location.href = API + '/';
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────
init();
