// Statistics module — all numbers derived strictly from stored borrowingRecords.
const Stats = {
  range: { from: null, to: null },

  async records() {
    let recs = await DB.getAll('borrowingRecords');
    if (Stats.range.from) recs = recs.filter(r => r.actualDate >= Stats.range.from);
    if (Stats.range.to) recs = recs.filter(r => r.actualDate <= Stats.range.to);
    return recs;
  },

  dur(r) { return r.actualDurationMinutes != null ? r.actualDurationMinutes : 0; },

  group(recs, keyFn) {
    const map = new Map();
    for (const r of recs) {
      const k = keyFn(r);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(r);
    }
    return map;
  },

  table(headers, rows) {
    if (!rows.length) return '<div class="empty-state">Insufficient recorded data.</div>';
    return `<table><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>` +
      rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('') + '</tbody></table>';
  },

  async render() {
    const recs = await Stats.records();
    const body = document.getElementById('statsBody');
    if (!recs.length) {
      body.innerHTML = '<div class="empty-state">No borrowing records yet. Record usage in Daily Records to see statistics.</div>';
      return;
    }
    const total = recs.length;
    const totalMin = recs.reduce((s, r) => s + Stats.dur(r), 0);
    const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    // A. Room utilization
    const byRoom = [...Stats.group(recs, r => r.actualRoomName + '|' + r.actualBuilding).entries()].map(([k, list]) => {
      const mins = list.reduce((s, r) => s + Stats.dur(r), 0);
      return { name: k.split('|')[0], building: k.split('|')[1], count: list.length, mins };
    }).sort((a, b) => b.count - a.count);
    const roomHtml = Stats.table(
      ['Rank', 'Room', 'Building', 'Actual Uses', 'Total Hours', 'Avg Duration', 'Transfers'],
      byRoom.map((r, i) => {
        const list = Stats.group(recs, x => x.actualRoomName + '|' + x.actualBuilding).get(r.name + '|' + r.building) || [];
        return [i + 1, r.name, r.building, r.count, Utils.formatDuration(r.mins), Utils.formatDuration(Math.round(r.mins / r.count)), list.filter(x => x.wasTransferred).length];
      })
    );

    // B. Buildings
    const byB = [...Stats.group(recs, r => r.actualBuilding).entries()].map(([b, list]) => {
      const mins = list.reduce((s, r) => s + Stats.dur(r), 0);
      return { b, count: list.length, mins };
    }).sort((a, b) => b.count - a.count);
    const bHtml = Stats.table(['Building', 'Borrowings', '% of Total', 'Total Duration', 'Avg Duration'],
      byB.map(x => [x.b, x.count, (x.count / total * 100).toFixed(1) + '%', Utils.formatDuration(x.mins), Utils.formatDuration(Math.round(x.mins / x.count))]));

    // C. Departments
    const byD = [...Stats.group(recs, r => r.actualDepartment).entries()].map(([d, list]) => {
      const mins = list.reduce((s, r) => s + Stats.dur(r), 0);
      const topBldg = [...Stats.group(list, r => r.actualBuilding).entries()].sort((a, b) => b[1].length - a[1].length)[0][0];
      const topRoom = [...Stats.group(list, r => r.actualRoomName).entries()].sort((a, b) => b[1].length - a[1].length)[0][0];
      return { d, count: list.length, mins, topBldg, topRoom };
    }).sort((a, b) => b.count - a.count);
    const dHtml = Stats.table(['Department', 'Actual Uses', 'Total Duration', 'Avg Duration', 'Most Used Building', 'Most Used Room', '% of Total'],
      byD.map(x => [x.d, x.count, Utils.formatDuration(x.mins), Utils.formatDuration(Math.round(x.mins / x.count)), x.topBldg, x.topRoom, (x.count / total * 100).toFixed(1) + '%']));

    // D. Borrowers
    const byWho = [...Stats.group(recs, r => r.actualBorrower).entries()].map(([w, list]) => {
      const mins = list.reduce((s, r) => s + Stats.dur(r), 0);
      const topRoom = [...Stats.group(list, r => r.actualRoomName).entries()].sort((a, b) => b[1].length - a[1].length)[0][0];
      const topPurpose = [...Stats.group(list, r => r.actualPurpose).entries()].sort((a, b) => b[1].length - a[1].length)[0][0];
      return { w, count: list.length, mins, topRoom, topPurpose };
    }).sort((a, b) => b.count - a.count);
    const wHtml = Stats.table(['Borrower', 'Borrowings', 'Total Duration', 'Most Used Room', 'Most Common Purpose'],
      byWho.map(x => [x.w, x.count, Utils.formatDuration(x.mins), x.topRoom, x.topPurpose]));

    // E. Purposes
    const byP = [...Stats.group(recs, r => r.actualPurpose).entries()].map(([p, list]) => {
      const mins = list.reduce((s, r) => s + Stats.dur(r), 0);
      return { p, count: list.length, mins };
    }).sort((a, b) => b.count - a.count);
    const pHtml = Stats.table(['Purpose', 'Uses', '% of Total', 'Total Duration'],
      byP.map(x => [x.p, x.count, (x.count / total * 100).toFixed(1) + '%', Utils.formatDuration(x.mins)]));

    // Day of week
    const byDay = weekdays.map((name, i) => ({ name, count: recs.filter(r => new Date(r.actualDate + 'T00:00:00').getDay() === i).length }));
    const peak = byDay.reduce((a, b) => (b.count > a.count ? b : a), byDay[0]);
    const peakMsg = peak.count > 0
      ? `<p><b>Peak Day:</b> ${peak.name} had the highest recorded room borrowing activity with ${peak.count} record(s).</p>`
      : '<p class="muted">Not enough records to determine a meaningful trend.</p>';
    const dayHtml = Stats.table(['Day', 'Records'], byDay.map(d => [d.name, d.count]));

    // Time period
    const periods = { Morning: 0, Afternoon: 0, Evening: 0 };
    for (const r of recs) {
      const h = Math.floor(r.actualTimeIn / 60);
      if (h < 12) periods.Morning++;
      else if (h < 18) periods.Afternoon++;
      else periods.Evening++;
    }
    const topPeriod = Object.entries(periods).sort((a, b) => b[1] - a[1])[0];
    const periodHtml = Stats.table(['Period', 'Records'], Object.entries(periods).map(([k, v]) => [k, v])) +
      (topPeriod[1] > 0 ? `<p><b>Busiest Period:</b> ${topPeriod[0]} (${topPeriod[1]} records).</p>` : '');

    body.innerHTML = `
      <h2>Room Utilization</h2>${roomHtml}
      <p class="muted">Recorded Usage Rate: ${total} borrowings, ${Utils.formatDuration(totalMin)} total recorded usage. A capacity-based utilization rate requires an official room schedule, which is not available.</p>
      <h2>Building Statistics</h2>${bHtml}
      <h2>Department Statistics</h2>${dHtml}
      <h2>Borrower Statistics</h2>${wHtml}
      <h2>Purpose Statistics</h2>${pHtml}
      <h2>Day of Week</h2>${dayHtml}${peakMsg}
      <h2>Time Period</h2>${periodHtml}
      <h2>Request vs Actual</h2>${Stats.requestVsActual(recs)}`;
  },

  requestVsActual(recs) {
    const comparable = recs.filter(r => r.requestedRoom || r.requestedBuilding || r.requestedDate || r.requestedTimeIn != null);
    if (!comparable.length) return '<div class="empty-state">No request reference data available for comparison yet.</div>';
    const transferred = comparable.filter(r => r.wasTransferred).length;
    const diffDate = comparable.filter(r => r.requestedDate && r.requestedDate !== r.actualDate).length;
    const diffTime = comparable.filter(r => r.requestedTimeIn != null && Math.abs(r.requestedTimeIn - r.actualTimeIn) > 0).length;
    const sameRoom = comparable.length - transferred;
    const rate = (transferred / comparable.length * 100).toFixed(1);
    return Stats.table(['Indicator', 'Records'], [
      ['Same Room Used', sameRoom],
      ['Transferred to a Different Room', transferred],
      ['Different Actual Date', diffDate],
      ['Different Actual Start Time', diffTime],
    ]) + `<p><b>Room Transfer Rate:</b> ${rate}% of ${comparable.length} record(s) with request reference used a different room than requested.</p>`;
  },

  periodBounds(mode, offset = 0) {
    const now = new Date();
    let from, to;
    if (mode === 'month') {
      from = new Date(now.getFullYear(), now.getMonth() + offset, 1);
      to = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
    } else if (mode === 'week') {
      const dow = (now.getDay() + 6) % 7; // Monday start
      from = new Date(now); from.setDate(now.getDate() - dow + offset * 7);
      to = new Date(from); to.setDate(from.getDate() + 6);
    } else {
      from = new Date(now.getFullYear() + offset, 0, 1);
      to = new Date(now.getFullYear() + offset, 11, 31);
    }
    const iso = d => d.toISOString().slice(0, 10);
    return { from: iso(from), to: iso(to) };
  },

  async compare() {
    const mode = document.getElementById('cmpMode').value;
    const cur = Stats.periodBounds(mode, 0);
    const prev = Stats.periodBounds(mode, -1);
    const all = await DB.getAll('borrowingRecords');
    const inRange = (r, b) => r.actualDate >= b.from && r.actualDate <= b.to;
    const curRecs = all.filter(r => inRange(r, cur));
    const prevRecs = all.filter(r => inRange(r, prev));
    const out = document.getElementById('cmpResult');
    if (!curRecs.length && !prevRecs.length) {
      out.innerHTML = '<div class="empty-state">No records in either period.</div>'; return;
    }
    const mins = list => list.reduce((s, r) => s + Stats.dur(r), 0);
    const topOf = (list, fn) => {
      if (!list.length) return '—';
      return [...Stats.group(list, fn).entries()].sort((a, b) => b[1].length - a[1].length)[0][0];
    };
    const peakDay = list => {
      if (!list.length) return '—';
      const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const counts = names.map((n, i) => ({ n, c: list.filter(r => new Date(r.actualDate + 'T00:00:00').getDay() === i).length }));
      return counts.sort((a, b) => b.c - a.c)[0].n;
    };
    const activeCount = l => l.filter(r => r.status === 'Active').length;
    const completedCount = l => l.filter(r => r.status === 'Completed').length;
    const pct = (c, p) => p === 0 ? null : ((c - p) / p * 100);
    const change = (c, p, fmt) => {
      const d = c - p;
      const pp = pct(c, p);
      const sign = d > 0 ? '+' : d < 0 ? '-' : '';
      return `${sign}${fmt(Math.abs(d))}${pp == null ? '' : ` (${pp >= 0 ? '+' : ''}${pp.toFixed(1)}%)`}`;
    };
    out.innerHTML = `
      <p class="muted">Current: ${Utils.formatDate(cur.from)} – ${Utils.formatDate(cur.to)} | Previous: ${Utils.formatDate(prev.from)} – ${Utils.formatDate(prev.to)}</p>
      ${Stats.table(['Metric', 'Current', 'Previous', 'Change'], [
        ['Total Borrowings', curRecs.length, prevRecs.length, change(curRecs.length, prevRecs.length, v => v)],
        ['Total Duration', Utils.formatDuration(mins(curRecs)), Utils.formatDuration(mins(prevRecs)), change(mins(curRecs), mins(prevRecs), v => Utils.formatDuration(v))],
        ['Active Records', activeCount(curRecs), activeCount(prevRecs), change(activeCount(curRecs), activeCount(prevRecs), v => v)],
        ['Completed Records', completedCount(curRecs), completedCount(prevRecs), change(completedCount(curRecs), completedCount(prevRecs), v => v)],
        ['Most Used Room', topOf(curRecs, r => r.actualRoomName), topOf(prevRecs, r => r.actualRoomName), '—'],
        ['Most Used Building', topOf(curRecs, r => r.actualBuilding), topOf(prevRecs, r => r.actualBuilding), '—'],
        ['Most Active Department', topOf(curRecs, r => r.actualDepartment), topOf(prevRecs, r => r.actualDepartment), '—'],
        ['Peak Day', peakDay(curRecs), peakDay(prevRecs), '—'],
        ['Rooms Used', new Set(curRecs.map(r => r.actualRoomId)).size, new Set(prevRecs.map(r => r.actualRoomId)).size, change(new Set(curRecs.map(r => r.actualRoomId)).size, new Set(prevRecs.map(r => r.actualRoomId)).size, v => v)],
        ['Transfers', curRecs.filter(r => r.wasTransferred).length, prevRecs.filter(r => r.wasTransferred).length, change(curRecs.filter(r => r.wasTransferred).length, prevRecs.filter(r => r.wasTransferred).length, v => v)],
      ])}
      ${prevRecs.length === 0 ? '<p class="muted">No previous-period records available for comparison.</p>' : ''}`;
  },

  async trend() {
    const year = parseInt(document.getElementById('trendYear').value, 10);
    const all = await DB.getAll('borrowingRecords');
    const rows = [];
    let maxCount = 0;
    for (let m = 0; m < 12; m++) {
      const prefix = `${year}-${String(m + 1).padStart(2, '0')}`;
      const list = all.filter(r => r.actualDate.startsWith(prefix));
      const mins = list.reduce((s, r) => s + Stats.dur(r), 0);
      maxCount = Math.max(maxCount, list.length);
      rows.push({ label: new Date(year, m, 1).toLocaleString('en-US', { month: 'short' }), count: list.length, mins, avg: list.length ? Math.round(mins / list.length) : null, rooms: new Set(list.map(r => r.actualRoomId)).size });
    }
    const out = document.getElementById('trendResult');
    if (maxCount === 0) { out.innerHTML = '<div class="empty-state">Not enough records to determine a meaningful trend for this year.</div>'; return; }
    out.innerHTML = rows.map(r => `
      <div class="trend-row">
        <span class="trend-label">${r.label}</span>
        <div class="trend-track"><div class="trend-bar" style="width:${r.count ? Math.max(4, r.count / maxCount * 100) : 0}%"></div></div>
        <span class="trend-num">${r.count}</span>
      </div>`).join('') +
      Stats.table(['Month', 'Actual Uses', 'Total Duration', 'Avg Duration', 'Rooms Used'],
        rows.filter(r => r.count > 0).map(r => [r.label, r.count, Utils.formatDuration(r.mins), Utils.formatDuration(r.avg), r.rooms]));
  },

  async init() {
    const all = await DB.getAll('borrowingRecords');
    const years = [...new Set(all.map(r => r.actualDate.slice(0, 4)))].sort().reverse();
    const currentYear = String(new Date().getFullYear());
    document.getElementById('trendYear').innerHTML =
      (years.length ? years : [currentYear]).map(y => `<option ${y === currentYear ? 'selected' : ''}>${y}</option>`).join('');
    Stats.render();
  },

  bind() {
    document.getElementById('sApply').addEventListener('click', () => {
      Stats.range = { from: document.getElementById('sFrom').value || null, to: document.getElementById('sTo').value || null };
      Stats.render();
    });
    document.getElementById('sAll').addEventListener('click', () => {
      Stats.range = { from: null, to: null };
      document.getElementById('sFrom').value = ''; document.getElementById('sTo').value = '';
      Stats.render();
    });
    document.getElementById('cmpRun').addEventListener('click', Stats.compare);
    document.getElementById('trendRun').addEventListener('click', Stats.trend);
  },
};
