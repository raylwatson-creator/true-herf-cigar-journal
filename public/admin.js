// Moved out of an inline <script> in admin.html so it loads as a same-origin
// script file under the Content-Security-Policy's script-src 'self' -- an
// inline script isn't covered by 'self' and would silently stop running the
// moment that CSP is switched from report-only to enforced.
(function () {
  var STATS_API = '/.netlify/functions/admin-stats';
  var pwField = document.getElementById('pw');
  var gate = document.getElementById('gate');
  var dashboard = document.getElementById('dashboard');
  var gateError = document.getElementById('gateError');
  var dashError = document.getElementById('dashError');

  function fmtDate(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function fmtMoney(cents) {
    return '$' + (cents / 100).toFixed(2);
  }

  function fillTable(bodyId, emptyId, rows, renderRow) {
    var tbody = document.querySelector('#' + bodyId + ' tbody');
    var empty = document.getElementById(emptyId);
    tbody.innerHTML = '';
    if (!rows || rows.length === 0) {
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    rows.forEach(function (row) {
      var tr = document.createElement('tr');
      tr.innerHTML = renderRow(row);
      tbody.appendChild(tr);
    });
  }

  function render(data) {
    document.getElementById('statUsers').textContent = data.totalUsers;
    document.getElementById('statActive').textContent = data.activeUsers30d;
    document.getElementById('statPurchases').textContent = data.totalPurchases;
    document.getElementById('statUnclaimed').textContent = data.unclaimedPurchases;
    document.getElementById('statRevenue').textContent = fmtMoney(data.revenueCents);
    document.getElementById('generatedAt').textContent =
      'Updated ' + new Date(data.generatedAt).toLocaleString();

    fillTable('signupsTable', 'signupsEmpty', data.recentSignups, function (row) {
      return '<td>' + escapeHtml(row.email) + '</td><td>' + fmtDate(row.created_at) + '</td>';
    });

    fillTable('unclaimedTable', 'unclaimedEmpty', data.unclaimedPurchasesList, function (row) {
      return '<td>' + escapeHtml(row.email) + '</td><td>' + escapeHtml(row.order_number) + '</td><td>' + fmtDate(row.created_at) + '</td>';
    });
  }

  function escapeHtml(s) {
    var div = document.createElement('div');
    div.textContent = s == null ? '' : String(s);
    return div.innerHTML;
  }

  function loadStats(password) {
    dashError.textContent = '';
    return fetch(STATS_API, {
      headers: { 'x-admin-password': password },
    }).then(function (res) {
      if (res.status === 401) {
        throw new Error('WRONG_PASSWORD');
      }
      if (!res.ok) {
        throw new Error('Something went wrong loading stats (status ' + res.status + ').');
      }
      return res.json();
    });
  }

  function tryUnlock(password) {
    gateError.textContent = '';
    return loadStats(password).then(function (data) {
      try { sessionStorage.setItem('th_admin_pw', password); } catch (e) {}
      gate.hidden = true;
      dashboard.hidden = false;
      render(data);
    }).catch(function (err) {
      if (err.message === 'WRONG_PASSWORD') {
        gateError.textContent = 'Incorrect password.';
      } else {
        gateError.textContent = err.message;
      }
      try { sessionStorage.removeItem('th_admin_pw'); } catch (e) {}
    });
  }

  document.getElementById('unlockBtn').addEventListener('click', function () {
    tryUnlock(pwField.value);
  });
  pwField.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') tryUnlock(pwField.value);
  });

  document.getElementById('refreshBtn').addEventListener('click', function () {
    var pw = null;
    try { pw = sessionStorage.getItem('th_admin_pw'); } catch (e) {}
    if (!pw) {
      dashboard.hidden = true;
      gate.hidden = false;
      return;
    }
    loadStats(pw).then(render).catch(function (err) {
      dashError.textContent = err.message === 'WRONG_PASSWORD' ? 'Session expired, please re-enter the password.' : err.message;
      if (err.message === 'WRONG_PASSWORD') {
        dashboard.hidden = true;
        gate.hidden = false;
      }
    });
  });

  // Auto-unlock if this tab already has the password from earlier this session.
  (function () {
    var pw = null;
    try { pw = sessionStorage.getItem('th_admin_pw'); } catch (e) {}
    if (pw) tryUnlock(pw);
  })();
})();
