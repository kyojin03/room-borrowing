// Reports module — executive summary, detailed records, utilization analysis from actual records only.
const Reports = {
  recs: [],

  async generate() {
    const all = await DB.getAll('borrowingRecords');
    const from = document.getElementById('rFrom').value;
    const to = document.getElementById('rTo').value;
    const building = document.getElementById('rBuilding').value;
    const room = document.getElementById('rRoom').value.trim().toLowerCase();
    const dept = document.getElementById('rDept').value.trim().toLowerCase();
    const borrower = document.getElementById('rBorrower').value.trim().toLowerCase();
    const purpose = document.getElementById('rPurpose').value.trim().toLowerCase();
    const transfer = document.getElementById('rTransfer').value;
    Reports.recs = all.filter(r =>
      (!from || r.actualDate >= from) && (!to || r.actualDate <= to) &&
      (!building || r.actualBuilding === building) &&
      (!room || r.actualRoomName.toLowerCase().includes(room)) &&
      (!dept || r.actualDepartment.toLowerCase().includes(dept)) &&
      (!borrower || r.actualBorrower.toLowerCase().includes(borrower)) &&
      (!purpose || r.actualPurpose.toLowerCase().includes(purpose)) &&
      (!transfer || (transfer === 'Yes' ? r.wasTransferred : !r.wasTransferred))
    ).sort((a, b) => a.actualDate.localeCompare(b.actualDate));
    Reports.render();
  },

  group(recs, fn) { const m = new Map(); for (const r of recs) { const k = fn(r); (m.get(k) || m.set(k, []).get(k)).push(r); } return m; },

  bars(rows) {
    const max = Math.max(...rows.map(r => r[1]), 1);
    return rows.slice(0, 12).map(([label, value]) => `
      <div class="trend-row">
        <span class="trend-label" style="width:150px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${String(label).replace(/"/g, '')}">${label}</span>
        <div class="trend-bar" style="width:${value ? Math.max(3, value / max * 100) : 0}%"></div>
        <span class="trend-num" style="width:auto">${value}</span>
      </div>`).join('');
  },

  render() {
    const recs = Reports.recs;
    const area = document.getElementById('reportArea');
    const empty = document.getElementById('reportEmpty');
    if (!recs.length) { area.hidden = true; empty.hidden = false; empty.textContent = 'No recording matching the selected filters.'; return; }
    area.hidden = false; empty.hidden = true;
    const mins = l => l.reduce((s, r) => s + (r.actualDurationMinutes || 0), 0);
    const topOf = (l, fn) => [...Reports.group(l, fn).entries()].sort((a, b) => b[1].length - a[1].length)[0]?.[0] || '—';
    const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const peakDay = (() => {
      const counts = new Map();
      for (const r of recs) { const d = new Date(r.actualDate + 'T00:00:00').getDay(); counts.set(d, (counts.get(d) || 0) + 1); }
      const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
      return top ? `${weekdays[top[0]]} (${top[1]} records)` : '—';
    })();
    const periods = { Morning: 0, Afternoon: 0, Evening: 0 };
    for (const r of recs) { const h = Math.floor(r.actualTimeIn / 60); if (h < 12) periods.Morning++; else if (h < 18) periods.Afternoon++; else periods.Evening++; }
    const topPeriod = Object.entries(periods).sort((a, b) => b[1] - a[1])[0];
    const rooms = new Set(recs.map(r => r.actualRoomId)).size;
    const transfers = recs.filter(r => r.wasTransferred).length;
    const period = `${document.getElementById('rFrom').value ? Utils.formatDate(document.getElementById('rFrom').value) : 'earliest record'} – ${document.getElementById('rTo').value ? Utils.formatDate(document.getElementById('rTo').value) : 'latest record'}`;

    const roomRows = [...Reports.group(recs, r => r.actualRoomName + ' (' + r.actualBuilding + ')').entries()]
      .map(([k, l]) => [k, l.length, Utils.formatDuration(mins(l)), Utils.formatDuration(Math.round(mins(l) / l.length))])
      .sort((a, b) => b[1] - a[1]);
    const bldgRows = [...Reports.group(recs, r => r.actualBuilding).entries()]
      .map(([k, l]) => [k, l.length, (l.length / recs.length * 100).toFixed(1) + '%', Utils.formatDuration(mins(l))])
      .sort((a, b) => b[1] - a[1]);
    const deptRows = [...Reports.group(recs, r => r.actualDepartment).entries()]
      .map(([k, l]) => [k, l.length, Utils.formatDuration(mins(l))])
      .sort((a, b) => b[1] - a[1]);
    const purposeRows = [...Reports.group(recs, r => r.actualPurpose).entries()]
      .map(([k, l]) => [k, l.length, (l.length / recs.length * 100).toFixed(1) + '%', Utils.formatDuration(mins(l))])
      .sort((a, b) => b[1] - a[1]);

    const detailed = recs.map(r => `<tr>
      <td>${r.requestDate ? Utils.formatDate(r.requestDate) : '—'}</td>
      <td>${r.requestingDepartment || '—'}</td>
      <td>${r.requestedRoom ? r.requestedRoom + (r.requestedBuilding ? ' (' + r.requestedBuilding + ')' : '') : '—'}</td>
      <td>${r.requestedDate ? Utils.formatDate(r.requestedDate) : '—'}</td>
      <td>${r.requestedTimeIn != null ? Utils.formatTime(r.requestedTimeIn) : '—'}</td>
      <td>${Utils.formatDate(r.actualDate)}</td><td>${r.actualBuilding}</td><td>${r.actualRoomName}</td>
      <td>${r.actualBorrower}</td><td>${r.actualDepartment}</td><td>${r.actualPurpose}</td>
      <td>${Utils.formatTime(r.actualTimeIn)}</td><td>${r.actualTimeOut != null ? Utils.formatTime(r.actualTimeOut) : '—'}</td>
      <td>${r.actualDurationMinutes != null ? Utils.formatDuration(r.actualDurationMinutes) : '—'}</td>
      <td>${r.wasTransferred ? 'Yes' : 'No'}</td><td>${r.remarks || ''}</td>
    </tr>`).join('');

    const interpretation = recs.length >= 3
      ? `Most recorded room use during the period came from ${topOf(recs, r => r.actualDepartment) || '—'}, with ${topOf(recs, r => r.actualBuilding) || '—'} accounting for the highest number of recorded room uses. Peak activity occurred on ${peakDay}, mostly during the ${topPeriod[0].toLowerCase()} period.${transfers ? ` ${transfers} approved request(s) resulted in actual transfer to a different room.` : ' No transfers were recorded in this period.'}`
      : 'The available records are not yet sufficient to establish a clear usage pattern.';

    document.getElementById('reportBody').innerHTML = `
      <p class="muted">Reporting period: ${period}</p>
      <h3>Executive Summary</h3>
      <table><tbody>
        <tr><td><b>Total Actual Room Uses</b></td><td>${recs.length}</td></tr>
        <tr><td><b>Total Rooms Used</b></td><td>${rooms}</td></tr>
        <tr><td><b>Total Usage Hours</b></td><td>${(mins(recs) / 60).toFixed(1)} hrs</td></tr>
        <tr><td><b>Most Used Room</b></td><td>${topOf(recs, r => r.actualRoomName)}</td></tr>
        <tr><td><b>Most Active Building</b></td><td>${topOf(recs, r => r.actualBuilding)}</td></tr>
        <tr><td><b>Most Active Department</b></td><td>${topOf(recs, r => r.actualDepartment)}</td></tr>
        <tr><td><b>Most Frequent Borrower</b></td><td>${topOf(recs, r => r.actualBorrower)}</td></tr>
        <tr><td><b>Peak Day</b></td><td>${peakDay}</td></tr>
        <tr><td><b>Transfers</b></td><td>${transfers}</td></tr>
      </tbody></table>
      <h3>Detailed Records</h3>
      <table><thead><tr><th>Request Date</th><th>Req. Dept</th><th>Requested Room</th><th>Requested Date</th><th>Req. Time In</th><th>Actual Date</th><th>Building</th><th>Room</th><th>Borrower</th><th>Department</th><th>Purpose</th><th>Time In</th><th>Time Out</th><th>Duration</th><th>Transfer</th><th>Remarks</th></tr></thead><tbody>${detailed}</tbody></table>
      <h3>Utilization Analysis</h3>
      <h4>Room Usage</h4>${Reports.bars(roomRows.map(r => [r[0], r[1]]))}${Stats.table(['Room', 'Uses', 'Total Duration', 'Avg Duration'], roomRows)}
      <h4>Building Usage</h4>${Reports.bars(bldgRows.map(r => [r[0], r[1]]))}${Stats.table(['Building', 'Uses', '% of Total', 'Total Duration'], bldgRows)}
      <h4>Department Usage</h4>${Stats.table(['Department', 'Uses', 'Total Duration'], deptRows)}
      <h4>Purpose Distribution</h4>${Reports.bars(purposeRows.map(r => [r[0], r[1]]))}${Stats.table(['Purpose', 'Uses', '% of Total', 'Total Duration'], purposeRows)}
      <h4>Time Pattern</h4>${Reports.bars(Object.entries(periods))}${Stats.table(['Period', 'Records'], Object.entries(periods).map(([k, v]) => [k, v]))}
      <h4>Transfers</h4><p>${transfers} of ${recs.length} actual uses differed from the originally requested room.</p>
      <h3>Analysis</h3><p>${interpretation}</p>`;
  },

  csv() {
    if (!Reports.recs.length) { Utils.toast('Generate a report first.'); return; }
    const headers = ['requestReference', 'requestDate', 'requestingDepartment', 'departmentHead', 'requestedBy', 'notedBy', 'requestedBuilding', 'requestedRoom', 'requestedDate', 'requestedTimeIn', 'requestedTimeOut', 'actualDate', 'actualBuilding', 'actualRoomName', 'actualBorrower', 'actualDepartment', 'actualPurpose', 'actualTimeIn', 'actualTimeOut', 'actualDurationMinutes', 'wasTransferred', 'transferReason', 'remarks', 'status'];
    const esc = v => v == null ? '' : `"${String(v).replace(/"/g, '""')}"`;
    const rows = Reports.recs.map(r => headers.map(h => esc(h === 'actualTimeIn' || h === 'requestedTimeIn' ? (r[h] != null ? Utils.formatTime(r[h]) : '') : h === 'actualTimeOut' || h === 'requestedTimeOut' ? (r[h] != null ? Utils.formatTime(r[h]) : '') : h === 'wasTransferred' ? (r[h] ? 'Yes' : 'No') : r[h])).join(','));
    const blob = new Blob([headers.join(',') + '\r\n' + rows.join('\r\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'room-utilization-report.csv';
    a.click();
  },

  fillBuildings() {
    const sel = document.getElementById('rBuilding');
    sel.innerHTML = '<option value="">All Buildings</option>' + Object.keys(ROOM_GROUPS).map(b => `<option>${b}</option>`).join('');
  },

  bind() {
    document.getElementById('rGenerate').addEventListener('click', Reports.generate);
    document.getElementById('rPrint').addEventListener('click', () => window.print());
    document.getElementById('rCsv').addEventListener('click', Reports.csv);
  },
};
