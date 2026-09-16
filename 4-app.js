/* Dato — AI Data-Leak Firewall (console app)
 * Everything runs locally. No prompt, file, or event ever leaves the browser.
 */
(function () {
  'use strict';
  var D = window.DatoDetect;

  // ---------- State ----------
  var POLICY_KEY = 'dato.policies.v1';
  var EVENT_KEY = 'dato.events.v1';
  var DEFAULT_POLICIES = {
    secrets: 'block',
    pii: 'warn',
    financial: 'warn',
    source: 'warn',
    contract: 'warn'
  };
  var ACTION_LABEL = { allow: 'Allow', warn: 'Warn', redact: 'Redact', block: 'Block' };

  function loadJSON(key, fallback) {
    try { var v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; }
    catch (e) { return fallback; }
  }
  var policies = Object.assign({}, DEFAULT_POLICIES, loadJSON(POLICY_KEY, {}));
  var events = loadJSON(EVENT_KEY, []);

  function savePolicies() { localStorage.setItem(POLICY_KEY, JSON.stringify(policies)); }
  function saveEvents() {
    if (events.length > 250) events = events.slice(events.length - 250);
    localStorage.setItem(EVENT_KEY, JSON.stringify(events));
  }

  // ---------- Navigation ----------
  var views = ['firewall', 'policies', 'activity', 'dashboard', 'assessment'];
  function showView(name) {
    views.forEach(function (v) {
      document.getElementById('view-' + v).classList.toggle('active', v === name);
      document.getElementById('nav-' + v).classList.toggle('active', v === name);
    });
    if (name === 'activity') renderActivity();
    if (name === 'dashboard') renderDashboard();
    location.hash = name;
  }
  views.forEach(function (v) {
    document.getElementById('nav-' + v).addEventListener('click', function (e) { e.preventDefault(); showView(v); });
  });

  // ---------- File intake ----------
  var attachedFiles = []; // {name, text}
  var fileInput = document.getElementById('file-input');
  fileInput.addEventListener('change', function () {
    var files = Array.prototype.slice.call(fileInput.files || []);
    files.forEach(function (f) {
      if (f.size > 2 * 1024 * 1024) { addAttachmentChip(f.name, null, 'too large (2 MB max)'); return; }
      var reader = new FileReader();
      reader.onload = function () {
        attachedFiles.push({ name: f.name, text: String(reader.result || '') });
        addAttachmentChip(f.name, attachedFiles.length - 1);
      };
      reader.readAsText(f);
    });
    fileInput.value = '';
  });
  function addAttachmentChip(name, idx, note) {
    var chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = '📎 ' + name + (note ? ' — ' + note : '');
    if (idx != null) {
      var x = document.createElement('button');
      x.className = 'chip-x'; x.textContent = '×'; x.title = 'Remove file';
      x.addEventListener('click', function () { attachedFiles[idx] = null; chip.remove(); });
      chip.appendChild(x);
    }
    document.getElementById('attachments').appendChild(chip);
  }

  // ---------- Scanning ----------
  function severityRank(s) { return { critical: 4, high: 3, medium: 2, low: 1 }[s] || 0; }

  function evaluate(findings) {
    // Decide the governing action: block > redact > warn > allow
    var rank = { allow: 0, warn: 1, redact: 2, block: 3 };
    var action = 'allow';
    findings.forEach(function (f) {
      var p = policies[f.category] || 'warn';
      if (rank[p] > rank[action]) action = p;
    });
    return action;
  }

  function logEvent(source, findings, action) {
    var byCat = {};
    Object.keys(D.CATEGORIES).forEach(function (c) { byCat[c] = 0; });
    findings.forEach(function (f) { byCat[f.category]++; });
    events.push({
      ts: Date.now(),
      source: source,
      action: action,
      total: findings.length,
      byCategory: byCat,
      topSeverity: findings.reduce(function (m, f) { return severityRank(f.severity) > severityRank(m) ? f.severity : m; }, 'low')
    });
    saveEvents();
  }

  function groupBy(arr, key) {
    var out = {};
    arr.forEach(function (x) { var k = x[key]; out[k] = out[k] || []; out[k].push(x); });
    return out;
  }

  function scanNow(sourceOverride) {
    var promptText = document.getElementById('prompt-input').value;
    var parts = [];
    if (promptText.trim()) parts.push({ name: 'prompt', text: promptText });
    attachedFiles.forEach(function (f) { if (f) parts.push(f); });
    var resultBox = document.getElementById('scan-result');
    if (!parts.length) {
      resultBox.innerHTML = '<div class="empty-state">Paste a prompt or attach a file to inspect it before it reaches an AI tool.</div>';
      return null;
    }
    var combined = parts.map(function (p) { return p.text; }).join('\n\n');
    var scan = D.scan(combined);
    var findings = scan.findings;
    var action = evaluate(findings);
    var source = sourceOverride || parts.map(function (p) { return p.name; }).join(', ');
    logEvent(source, findings, findings.length ? action : 'allowed-clean');
    renderScanResult(promptText, combined, findings, action);
    return { findings: findings, action: action, combined: combined };
  }

  function renderScanResult(promptText, combined, findings, action) {
    var resultBox = document.getElementById('scan-result');
    var sendBtn = document.getElementById('send-btn');
    if (!findings.length) {
      resultBox.innerHTML =
        '<div class="verdict verdict-allow"><div class="verdict-title">✓ Clear to send</div>' +
        '<div class="verdict-sub">No confidential data detected. Nothing left this device — inspection ran locally.</div></div>';
      sendBtn.disabled = false;
      sendBtn.textContent = 'Send to AI (simulated)';
      sendBtn.dataset.mode = 'send';
      return;
    }
    var byCat = groupBy(findings, 'category');
    var html = '';
    var verdictClass = { block: 'verdict-block', redact: 'verdict-redact', warn: 'verdict-warn', allow: 'verdict-allow' }[action];
    var verdictText = {
      block: '⛔ Blocked by policy',
      redact: '✂ Redaction required before sending',
      warn: '⚠ Confidential data detected — review before sending',
      allow: '✓ Allowed by policy'
    }[action];
    var verdictSub = {
      block: 'This content matches data classes your policy blocks from AI tools. Remove the flagged items or ask an admin to adjust policy.',
      redact: 'Dato removed the flagged data below. Send the redacted version instead.',
      warn: 'This content includes data your policy flags. Confirm you intend to share it.',
      allow: 'Findings logged for audit.'
    }[action];
    html += '<div class="verdict ' + verdictClass + '"><div class="verdict-title">' + verdictText + '</div>' +
      '<div class="verdict-sub">' + verdictSub + '</div></div>';
    html += '<div class="findings">';
    Object.keys(D.CATEGORIES).forEach(function (cat) {
      var list = byCat[cat];
      if (!list) return;
      html += '<div class="finding-group"><div class="finding-cat"><span class="cat-dot cat-' + cat + '"></span>' +
        D.CATEGORIES[cat].label + ' <span class="count">' + list.length + '</span>' +
        '<span class="policy-tag policy-' + (policies[cat] || 'warn') + '">' + ACTION_LABEL[policies[cat] || 'warn'] + '</span></div>';
      list.forEach(function (f) {
        html += '<div class="finding sev-' + f.severity + '"><span class="sev">' + f.severity.toUpperCase() + '</span>' +
          '<span class="finding-label">' + f.label + '</span><code class="masked">' + escapeHTML(f.masked) + '</code></div>';
      });
      html += '</div>';
    });
    html += '</div>';
    if (action === 'redact') {
      var redacted = D.redact(combined, findings);
      html += '<div class="redacted-box"><div class="redacted-head">Redacted version — safe to send</div>' +
        '<pre class="redacted-text">' + escapeHTML(redacted) + '</pre>' +
        '<button class="btn btn-secondary" id="copy-redacted">Copy redacted text</button></div>';
    }
    resultBox.innerHTML = html;
    var copyBtn = document.getElementById('copy-redacted');
    if (copyBtn) {
      var redactedText = D.redact(combined, findings);
      copyBtn.addEventListener('click', function () {
        navigator.clipboard && navigator.clipboard.writeText(redactedText);
        copyBtn.textContent = 'Copied ✓';
      });
    }
    if (action === 'block') {
      sendBtn.disabled = true;
      sendBtn.textContent = 'Blocked by policy';
    } else if (action === 'redact') {
      sendBtn.disabled = false;
      sendBtn.textContent = 'Send redacted version (simulated)';
      sendBtn.dataset.mode = 'redacted';
      sendBtn.dataset.payload = D.redact(combined, findings);
    } else {
      sendBtn.disabled = false;
      sendBtn.textContent = action === 'warn' ? 'I understand — send anyway (simulated)' : 'Send to AI (simulated)';
      sendBtn.dataset.mode = 'send';
    }
  }

  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  document.getElementById('scan-btn').addEventListener('click', function () { scanNow(); });
  document.getElementById('send-btn').addEventListener('click', function () {
    var btn = this;
    if (btn.disabled) return;
    btn.textContent = '✓ Sent (simulated) — no data left this device';
    logEvent('simulated-send', [], 'sent-' + (btn.dataset.mode || 'send'));
    setTimeout(function () { scanNow(); }, 1600);
  });
  document.getElementById('clear-btn').addEventListener('click', function () {
    document.getElementById('prompt-input').value = '';
    attachedFiles = [];
    document.getElementById('attachments').innerHTML = '';
    document.getElementById('scan-result').innerHTML = '<div class="empty-state">Paste a prompt or attach a file to inspect it before it reaches an AI tool.</div>';
    var sendBtn = document.getElementById('send-btn');
    sendBtn.disabled = false; sendBtn.textContent = 'Send to AI (simulated)';
  });

  // ---------- Policies ----------
  function renderPolicies() {
    var wrap = document.getElementById('policy-list');
    wrap.innerHTML = '';
    Object.keys(D.CATEGORIES).forEach(function (cat) {
      var row = document.createElement('div');
      row.className = 'policy-row';
      row.innerHTML = '<div class="policy-info"><span class="cat-dot cat-' + cat + '"></span>' +
        '<div><div class="policy-name">' + D.CATEGORIES[cat].label + '</div>' +
        '<div class="policy-desc">' + policyDescription(cat) + '</div></div></div>';
      var seg = document.createElement('div');
      seg.className = 'segmented';
      ['allow', 'warn', 'redact', 'block'].forEach(function (a) {
        var b = document.createElement('button');
        b.className = 'seg-btn' + (policies[cat] === a ? ' active seg-' + a : '');
        b.textContent = ACTION_LABEL[a];
        b.addEventListener('click', function () {
          policies[cat] = a; savePolicies(); renderPolicies();
          logEvent('policy-change', [], 'policy:' + cat + '=' + a);
        });
        seg.appendChild(b);
      });
      row.appendChild(seg);
      wrap.appendChild(row);
    });
  }
  function policyDescription(cat) {
    return {
      secrets: 'API keys, tokens, private keys, passwords, connection strings',
      pii: 'SSNs, card numbers, emails, phones, addresses, IDs',
      financial: 'Bank details, revenue, payroll, invoices, IBANs',
      source: 'Proprietary code pasted into prompts',
      contract: 'Legal agreements, NDAs, contract clauses'
    }[cat];
  }

  // ---------- Activity log ----------
  function renderActivity() {
    var wrap = document.getElementById('activity-list');
    var filter = document.getElementById('activity-filter').value;
    var list = events.slice().reverse().filter(function (e) {
      if (filter === 'all') return true;
      return e.action === filter;
    });
    if (!list.length) {
      wrap.innerHTML = '<div class="empty-state">No events yet. Scans, policy decisions, and simulated sends appear here for audit.</div>';
      return;
    }
    var html = '<table class="log-table"><thead><tr><th>Time</th><th>Source</th><th>Findings</th><th>Worst severity</th><th>Action</th></tr></thead><tbody>';
    list.forEach(function (e) {
      var d = new Date(e.ts);
      html += '<tr><td class="mono">' + d.toLocaleString() + '</td><td>' + escapeHTML(e.source) + '</td>' +
        '<td>' + (e.total || '—') + '</td><td><span class="sev sev-' + e.topSeverity + '">' + (e.total ? e.topSeverity.toUpperCase() : '—') + '</span></td>' +
        '<td><span class="action-tag action-' + String(e.action).replace(/[^a-z-]/g, '') + '">' + escapeHTML(e.action) + '</span></td></tr>';
    });
    html += '</tbody></table>';
    wrap.innerHTML = html;
  }
  document.getElementById('activity-filter').addEventListener('change', renderActivity);
  document.getElementById('export-log').addEventListener('click', function () {
    var blob = new Blob([JSON.stringify(events, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'dato-audit-log.json';
    a.click();
    URL.revokeObjectURL(a.href);
  });
  document.getElementById('clear-log').addEventListener('click', function () {
    if (!confirm('Clear the local audit log?')) return;
    events = []; saveEvents(); renderActivity();
  });

  // ---------- Dashboard ----------
  function renderDashboard() {
    var scans = events.filter(function (e) { return ['allow', 'warn', 'redact', 'block', 'allowed-clean'].indexOf(e.action) !== -1; });
    var blocked = events.filter(function (e) { return e.action === 'block'; }).length;
    var warned = events.filter(function (e) { return e.action === 'warn'; }).length;
    var redacted = events.filter(function (e) { return e.action === 'redact'; }).length;
    var clean = events.filter(function (e) { return e.action === 'allowed-clean' || e.action === 'allow'; }).length;
    var findingsTotal = events.reduce(function (s, e) { return s + (e.total || 0); }, 0);
    setStat('stat-scans', scans.length);
    setStat('stat-findings', findingsTotal);
    setStat('stat-blocked', blocked);
    setStat('stat-redacted', redacted);

    // Category bars
    var byCat = {};
    Object.keys(D.CATEGORIES).forEach(function (c) { byCat[c] = 0; });
    events.forEach(function (e) {
      if (!e.byCategory) return;
      Object.keys(byCat).forEach(function (c) { byCat[c] += e.byCategory[c] || 0; });
    });
    var max = Math.max(1, Math.max.apply(null, Object.keys(byCat).map(function (c) { return byCat[c]; })));
    var bars = '';
    Object.keys(D.CATEGORIES).forEach(function (c) {
      bars += '<div class="bar-row"><span class="bar-label"><span class="cat-dot cat-' + c + '"></span>' + D.CATEGORIES[c].label + '</span>' +
        '<span class="bar-track"><span class="bar-fill cat-bg-' + c + '" style="width:' + Math.round(byCat[c] / max * 100) + '%"></span></span>' +
        '<span class="bar-num">' + byCat[c] + '</span></div>';
    });
    document.getElementById('cat-bars').innerHTML = bars;

    // Action donut (pure CSS conic-gradient)
    var total = Math.max(1, blocked + warned + redacted + clean);
    var pB = blocked / total * 100, pW = warned / total * 100, pR = redacted / total * 100;
    var donut = document.getElementById('action-donut');
    donut.style.background = 'conic-gradient(' +
      '#ff4d5e 0 ' + pB + '%,' +
      '#ffb020 ' + pB + '% ' + (pB + pW) + '%,' +
      '#7c5cff ' + (pB + pW) + '% ' + (pB + pW + pR) + '%,' +
      '#2de2c5 ' + (pB + pW + pR) + '% 100%)';
    document.getElementById('donut-legend').innerHTML =
      legendDot('#ff4d5e', 'Blocked', blocked) + legendDot('#ffb020', 'Warned', warned) +
      legendDot('#7c5cff', 'Redacted', redacted) + legendDot('#2de2c5', 'Clean', clean);

    // 7-day activity
    var days = [];
    for (var i = 6; i >= 0; i--) {
      var d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
      days.push({ label: d.toLocaleDateString(undefined, { weekday: 'short' }), start: d.getTime(), count: 0 });
    }
    scans.forEach(function (e) {
      for (var i = 0; i < days.length; i++) {
        if (e.ts >= days[i].start && e.ts < days[i].start + 86400000) { days[i].count++; break; }
      }
    });
    var dmax = Math.max(1, Math.max.apply(null, days.map(function (d) { return d.count; })));
    document.getElementById('week-bars').innerHTML = days.map(function (d) {
      return '<div class="day-col"><div class="day-bar" style="height:' + Math.round(d.count / dmax * 100) + '%" title="' + d.count + ' events"></div><div class="day-label">' + d.label + '</div></div>';
    }).join('');

    // Posture
    var posture = Object.keys(D.CATEGORIES).map(function (c) {
      return '<span class="policy-tag policy-' + policies[c] + '">' + D.CATEGORIES[c].label.split(' ')[0] + ': ' + ACTION_LABEL[policies[c]] + '</span>';
    }).join(' ');
    document.getElementById('posture-line').innerHTML = posture;
  }
  function setStat(id, v) { document.getElementById(id).textContent = v; }
  function legendDot(color, label, n) {
    return '<span class="legend-item"><span class="legend-dot" style="background:' + color + '"></span>' + label + ' <b>' + n + '</b></span>';
  }

  // ---------- Boot ----------
  renderPolicies();
  var initial = (location.hash || '#firewall').slice(1);
  showView(views.indexOf(initial) !== -1 ? initial : 'firewall');

  // Expose a small API for the assessment module
  window.DatoApp = {
    scanText: function (text) {
      var scan = D.scan(text);
      return { findings: scan.findings, action: evaluate(scan.findings), redacted: D.redact(text, scan.findings) };
    },
    logEvent: logEvent,
    getPolicies: function () { return Object.assign({}, policies); }
  };
})();
