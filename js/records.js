// Daily Records module — request reference (historical) vs actual usage (utilization).
const Records = {
  page: 1,
  pageSize: 10,
  sortKey: 'actualDate',
  sortDir: -1,

  timeToMin(t) { if (!t) return null; const [h, m] = t.split(':').map(Number); return h * 60 + m; },
  minToTime(mins) { if (mins == null) return ''; const h = Math.floor(mins / 60), m = mins % 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`; },

  defaults() {
    const now = new Date();
    document.getElementById('recId').value = '';
    for (const id of ['recRequestReference', 'recRequestDate', 'recRequestingDepartment', 'recDepartmentHead',
      'recRequestedBy', 'recNotedBy', 'recRequestedBuilding', 'recRequestedRoom', 'recRequestedDate',
      'recDate', 'recBuilding', 'recBorrower', 'recDepartment', 'recPurpose', 'recRemarks', 'recTransferReason']) {
      document.getElementById(id).value = '';
    }
    document.getElementById('recRequestedTimeIn').value = '';
    document.getElementById('recRequestedTimeOut').value = '';
    document.getElementById('recDate').value = Utils.todayISO();
    document.getElementById('recBuilding').value = '';
    document.getElementById('recRoom').innerHTML = '<option value="">Select building first</option>';
    document.getElementById('recTimeIn').value = Records.minToTime(now.getHours() * 60 + now.getMinutes());
    document.getElementById('recTimeOut').value = '';
    document.getElementById('recSubmit').textContent = 'Save Record';
    document.getElementById('formErrors').textContent = '';
    document.getElementById('durationPreview').textContent = '';
    document.getElementById('transferReasonRow').hidden = true;
    document.getElementById('reqRefDetails').open = false;
  },

  setError(msg) { document.getElementById('formErrors').textContent = msg; },

  updateDurationPreview() {
    const tIn = Records.timeToMin(document.getElementById('recTimeIn').value);
    const tOut = Records.timeToMin(document.getElementById('recTimeOut').value);
    const el = document.getElementById('durationPreview');
    if (tIn != null && tOut != null && tOut >= tIn) el.textContent = `Duration: ${Utils.formatDuration(tOut - tIn)}`;
    else el.textContent = '';
  },

  // Show transfer reason only when actual room differs from requested room.
  async evaluateTransferRow() {
    const reqBuilding = document.getElementById('recRequestedBuilding').value.trim();
    const reqRoom = document.getElementById('recRequestedRoom').value.trim();
    const actBuilding = document.getElementById('recBuilding').value;
    const actRoomId = document.getElementById('recRoom').value;
    let differs = false;
    if (reqRoom || reqBuilding) {
      const room = actRoomId ? await DB.get('rooms', actRoomId) : null;
      differs = !!(reqRoom && room && reqRoom.trim() !== room.name) || !!(reqBuilding && actBuilding && reqBuilding !== actBuilding);
    }
    document.getElementById('transferReasonRow').hidden = !differs;
  },

  async autofillFromRequest() {
    const reqBuilding = document.getElementById('recRequestedBuilding').value.trim();
    const reqRoom = document.getElementById('recRequestedRoom').value.trim();
    if (reqBuilding) {
      const buildings = [...new Set((await DB.getAll('rooms')).map(r => r.building))];
      const match = buildings.find(b => b.toLowerCase() === reqBuilding.toLowerCase());
      if (match && document.getElementById('recBuilding').value !== match) {
        document.getElementById('recBuilding').value = match;
        await Records.fillRoomsForBuilding(match, 'recRoom');
      }
      if (reqRoom && match) {
        const room = (await DB.getAll('rooms')).find(r => r.building === match && r.name.toLowerCase() === reqRoom.toLowerCase());
        if (room) document.getElementById('recRoom').value = room.id;
      }
    }
    Records.evaluateTransferRow();
  },

  async fillBuildings() {
    const rooms = await DB.getAll('rooms');
    const buildings = [...new Set(rooms.map(r => r.building))];
    document.getElementById('recBuilding').innerHTML = '<option value="">Select building</option>' + buildings.map(b => `<option>${b}</option>`).join('');
    document.getElementById('fBuilding').innerHTML = '<option value="">All Buildings</option>' + buildings.map(b => `<option>${b}</option>`).join('');
  },

  async fillRoomsForBuilding(building, targetId) {
    const rooms = (await DB.getAll('rooms')).filter(r => r.building === building && r.status === 'Active');
    rooms.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    document.getElementById(targetId).innerHTML =
      '<option value="">Select room</option>' + rooms.map(r => `<option value="${r.id}">${r.name}</option>`).join('');
  },

  async activeRecordForRoom(roomId, excludeId = null) {
    const recs = await DB.getAll('borrowingRecords');
    return recs.find(r => r.actualRoomId === roomId && r.status === 'Active' && r.id !== excludeId);
  },

  async save(e) {
    e.preventDefault();
    const g = id => document.getElementById(id).value.trim();
    const id = document.getElementById('recId').value;
    const actualDate = g('recDate');
    const actualBuilding = g('recBuilding');
    const actualRoomId = g('recRoom');
    const actualBorrower = g('recBorrower');
    const actualDepartment = g('recDepartment');
    const actualPurpose = g('recPurpose');
    const actualTimeIn = document.getElementById('recTimeIn').value;
    const actualTimeOut = document.getElementById('recTimeOut').value;
    const remarks = g('recRemarks');

    if (!actualDate || !actualBuilding || !actualRoomId || !actualBorrower || !actualDepartment || !actualPurpose || !actualTimeIn) {
      Records.setError('Please fill in all required Actual Room Use fields (marked *).'); return;
    }
    Records.setError('');
    const room = await DB.get('rooms', actualRoomId);
    if (!room) { Records.setError('Selected room no longer exists.'); return; }
    if (room.status !== 'Active') { Records.setError('This room is inactive and cannot be borrowed.'); return; }

    const tIn = Records.timeToMin(actualTimeIn);
    const tOut = Records.timeToMin(actualTimeOut);
    if (tOut != null && tOut < tIn) { Records.setError('Actual Time Out cannot be earlier than Actual Time In.'); return; }

    // Overlap warning: same room, same date, overlapping time window.
    const all = await DB.getAll('borrowingRecords');
    const overlap = all.find(r => r.actualRoomId === actualRoomId && r.actualDate === actualDate && r.id !== id && r.status === 'Completed' &&
      r.actualTimeIn != null && r.actualTimeIn <= (tOut ?? 1439) && (r.actualTimeOut ?? 1439) >= tIn);
    if (overlap && !Records._overlapConfirmed) {
      Records._overlapConfirmed = true;
      if (!confirm(`Warning: This overlaps an existing record for ${room.name} on ${actualDate} (${overlap.status === 'Active' ? 'currently active' : Utils.formatTime(overlap.actualTimeIn) + '–' + Utils.formatTime(overlap.actualTimeOut)}). Save anyway?`)) {
        Records._overlapConfirmed = false; return;
      }
    }
    Records._overlapConfirmed = false;

    const conflict = await Records.activeRecordForRoom(actualRoomId, id || null);
    if (conflict && tOut == null) {
      alert('This room is currently being used. Please close the active borrowing record before creating a new one.');
      return;
    }

    const requestedBuilding = g('recRequestedBuilding');
    const requestedRoom = g('recRequestedRoom');
    const wasTransferred = !!(requestedRoom && (requestedRoom.trim() !== room.name || (requestedBuilding && requestedBuilding !== actualBuilding)));

    const existing = id ? await DB.get('borrowingRecords', id) : null;
    const now = new Date().toISOString();
    await DB.put('borrowingRecords', {
      id: id || Utils.uid(),
      // Request reference — historical, from the signed paper form; never overwritten by actual values.
      requestReference: g('recRequestReference'),
      requestDate: g('recRequestDate'),
      requestingDepartment: g('recRequestingDepartment'),
      departmentHead: g('recDepartmentHead'),
      requestedBy: g('recRequestedBy'),
      notedBy: g('recNotedBy'),
      requestedBuilding,
      requestedRoom,
      requestedDate: g('recRequestedDate'),
      requestedTimeIn: Records.timeToMin(document.getElementById('recRequestedTimeIn').value),
      requestedTimeOut: Records.timeToMin(document.getElementById('recRequestedTimeOut').value),
      // Actual usage — the utilization record.
      actualDate, actualBuilding, actualRoomId, actualRoomName: room.name,
      actualBorrower, actualDepartment, actualPurpose,
      actualTimeIn: tIn, actualTimeOut: tOut,
      actualDurationMinutes: tOut != null ? tOut - tIn : null,
      wasTransferred, transferReason: wasTransferred ? g('recTransferReason') : '',
      remarks,
      status: tOut != null ? 'Completed' : 'Active',
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now,
    });
    Utils.toast(existing ? 'Record updated.' : 'Record saved.');
    Records.defaults();
    document.getElementById('recordForm').dataset.dirty = '';
    if (Records._saveAnother) { Records._saveAnother = false; document.getElementById('recBorrower').focus(); }
    Records.render();
  },

  async closeRecord(id) {
    const r = await DB.get('borrowingRecords', id);
    if (!r || r.status !== 'Active') return;
    const now = new Date();
    if (r.actualDate === Utils.todayISO()) {
      r.actualTimeOut = now.getHours() * 60 + now.getMinutes();
      if (r.actualTimeOut < r.actualTimeIn) r.actualTimeOut = r.actualTimeIn;
    } else {
      r.actualTimeOut = r.actualTimeIn;
      r.remarks = (r.remarks ? r.remarks + ' | ' : '') + 'Closed on a later date — verify Actual Time Out.';
    }
    r.actualDurationMinutes = r.actualTimeOut - r.actualTimeIn;
    r.status = 'Completed';
    r.updatedAt = new Date().toISOString();
    await DB.put('borrowingRecords', r);
    Utils.toast('Record closed.');
    Records.render();
  },

  async deleteRecord(id) {
    if (!confirm('Delete this record? This cannot be undone.')) return;
    await DB.delete('borrowingRecords', id);
    Utils.toast('Record deleted.');
    Records.render();
  },

  async editRecord(id) {
    const r = await DB.get('borrowingRecords', id);
    if (!r) return;
    document.getElementById('recId').value = r.id;
    document.getElementById('recRequestReference').value = r.requestReference || '';
    document.getElementById('recRequestDate').value = r.requestDate || '';
    document.getElementById('recRequestingDepartment').value = r.requestingDepartment || '';
    document.getElementById('recDepartmentHead').value = r.departmentHead || '';
    document.getElementById('recRequestedBy').value = r.requestedBy || '';
    document.getElementById('recNotedBy').value = r.notedBy || '';
    document.getElementById('recRequestedBuilding').value = r.requestedBuilding || '';
    document.getElementById('recRequestedRoom').value = r.requestedRoom || '';
    document.getElementById('recRequestedDate').value = r.requestedDate || '';
    document.getElementById('recRequestedTimeIn').value = r.requestedTimeIn != null ? Records.minToTime(r.requestedTimeIn) : '';
    document.getElementById('recRequestedTimeOut').value = r.requestedTimeOut != null ? Records.minToTime(r.requestedTimeOut) : '';
    document.getElementById('recDate').value = r.actualDate;
    document.getElementById('recBuilding').value = r.actualBuilding;
    await Records.fillRoomsForBuilding(r.actualBuilding, 'recRoom');
    document.getElementById('recRoom').value = r.actualRoomId;
    document.getElementById('recBorrower').value = r.actualBorrower;
    document.getElementById('recDepartment').value = r.actualDepartment;
    document.getElementById('recPurpose').value = r.actualPurpose;
    document.getElementById('recTimeIn').value = Records.minToTime(r.actualTimeIn);
    document.getElementById('recTimeOut').value = r.actualTimeOut != null ? Records.minToTime(r.actualTimeOut) : '';
    document.getElementById('recRemarks').value = r.remarks || '';
    document.getElementById('recTransferReason').value = r.transferReason || '';
    document.getElementById('recSubmit').textContent = 'Update Record';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  async viewDetails(id) {
    const r = await DB.get('borrowingRecords', id);
    if (!r) return;
    document.getElementById('detailBody').innerHTML = `
      <h4 style="margin:4px 0">Request Reference</h4>
      <div><b>Reference</b> ${r.requestReference || '—'}</div>
      <div><b>Request Date</b> ${r.requestDate ? Utils.formatDate(r.requestDate) : '—'}</div>
      <div><b>Requesting Dept.</b> ${r.requestingDepartment || '—'}</div>
      <div><b>Department Head</b> ${r.departmentHead || '—'}</div>
      <div><b>Requested By</b> ${r.requestedBy || '—'}</div>
      <div><b>Noted By</b> ${r.notedBy || '—'}</div>
      <div><b>Requested Room</b> ${r.requestedRoom || '—'} (${r.requestedBuilding || '—'})</div>
      <div><b>Requested Date</b> ${r.requestedDate ? Utils.formatDate(r.requestedDate) : '—'}</div>
      <div><b>Requested Time</b> ${r.requestedTimeIn != null ? Utils.formatTime(r.requestedTimeIn) : '—'}${r.requestedTimeOut != null ? ' – ' + Utils.formatTime(r.requestedTimeOut) : ''}</div>
      <h4 style="margin:12px 0 4px">Actual Room Use</h4>
      <div><b>Actual Use Date</b> ${Utils.formatDate(r.actualDate)}</div>
      <div><b>Actual Room</b> ${r.actualRoomName} (${r.actualBuilding})</div>
      <div><b>Actual Borrower</b> ${r.actualBorrower}</div>
      <div><b>Actual Department</b> ${r.actualDepartment}</div>
      <div><b>Actual Purpose</b> ${r.actualPurpose}</div>
      <div><b>Actual Time In</b> ${Utils.formatTime(r.actualTimeIn)}</div>
      <div><b>Actual Time Out</b> ${r.actualTimeOut != null ? Utils.formatTime(r.actualTimeOut) : '—'}</div>
      <div><b>Actual Duration</b> ${r.actualDurationMinutes != null ? Utils.formatDuration(r.actualDurationMinutes) : '—'}</div>
      <div><b>Transferred</b> ${r.wasTransferred ? 'Yes' + (r.transferReason ? ' — ' + r.transferReason : '') : 'No'}</div>
      <div><b>Status</b> ${r.status}</div>
      <div><b>Remarks</b> ${r.remarks || '—'}</div>`;
    document.getElementById('detailModal').hidden = false;
  },

  async filtered() {
    const all = await DB.getAll('borrowingRecords');
    const q = document.getElementById('fSearch').value.trim().toLowerCase();
    const from = document.getElementById('fFrom').value;
    const to = document.getElementById('fTo').value;
    const exact = document.getElementById('fDate').value;
    const building = document.getElementById('fBuilding').value;
    const room = document.getElementById('fRoom').value.trim().toLowerCase();
    const dept = document.getElementById('fDept').value.trim().toLowerCase();
    const borrower = document.getElementById('fBorrower').value.trim().toLowerCase();
    const purpose = document.getElementById('fPurpose').value.trim().toLowerCase();
    const status = document.getElementById('fStatus').value;
    const transfer = document.getElementById('fTransfer').value;
    return all.filter(r =>
      (!exact || r.actualDate === exact) &&
      (!from || r.actualDate >= from) && (!to || r.actualDate <= to) &&
      (!building || r.actualBuilding === building) &&
      (!room || r.actualRoomName.toLowerCase().includes(room)) &&
      (!dept || r.actualDepartment.toLowerCase().includes(dept)) &&
      (!borrower || r.actualBorrower.toLowerCase().includes(borrower)) &&
      (!purpose || r.actualPurpose.toLowerCase().includes(purpose)) &&
      (!status || r.status === status) &&
      (!transfer || (transfer === 'Yes' ? r.wasTransferred : !r.wasTransferred)) &&
      (!q || `${r.actualBorrower} ${r.actualRoomName} ${r.actualPurpose} ${r.actualDepartment} ${r.actualBuilding}`.toLowerCase().includes(q))
    ).sort((a, b) => {
      const k = Records.sortKey;
      const va = a[k] ?? '', vb = b[k] ?? '';
      return (va < vb ? -1 : va > vb ? 1 : 0) * Records.sortDir;
    });
  },

  async render() {
    const list = await Records.filtered();
    const size = Records.pageSize === 'all' ? list.length || 1 : Records.pageSize;
    const pages = Math.max(1, Math.ceil(list.length / size));
    if (Records.page > pages) Records.page = pages;
    const slice = list.slice((Records.page - 1) * size, Records.page * size);
    document.querySelector('#recordsTable tbody').innerHTML = slice.map(r => `
      <tr>
        <td>${Utils.formatDate(r.actualDate)}</td><td>${r.actualRoomName}</td><td>${r.actualBuilding}</td>
        <td>${r.actualBorrower}</td><td>${r.actualDepartment}</td><td>${r.actualPurpose}</td>
        <td>${Utils.formatTime(r.actualTimeIn)}</td><td>${r.actualTimeOut != null ? Utils.formatTime(r.actualTimeOut) : '—'}</td>
        <td title="${r.actualDurationMinutes != null ? Utils.formatDuration(r.actualDurationMinutes) : ''}">${r.actualDurationMinutes != null ? Utils.formatDurationShort(r.actualDurationMinutes) : '—'}</td>
        <td>${r.wasTransferred ? '<span class="badge transferred">Transferred</span>' : 'No'}</td>
        <td><span class="badge ${r.status === 'Active' ? 'active' : 'completed'}">${r.status === 'Active' ? 'Ongoing' : 'Completed'}</span></td>
        <td>
          ${r.status === 'Active' ? `<button class="btn small" data-close="${r.id}">Time Out</button>` : ''}
          <button class="btn small ghost" data-view="${r.id}">View</button>
          <button class="btn small ghost" data-edit="${r.id}">Edit</button>
          <button class="btn small ghost" data-del="${r.id}">Delete</button>
        </td>
      </tr>`).join('');
    document.getElementById('recordsEmpty').hidden = slice.length > 0;
    document.getElementById('pgInfo').textContent = `Page ${Records.page} of ${pages} (${list.length} records)`;
    const all = await DB.getAll('borrowingRecords');
    document.getElementById('purposeList').innerHTML =
      [...new Set(all.map(r => r.actualPurpose))].map(p => `<option value="${p}">`).join('');
    document.getElementById('borrowerList').innerHTML =
      [...new Set(all.map(r => r.actualBorrower))].map(p => `<option value="${p}">`).join('');
    document.getElementById('deptList').innerHTML =
      [...new Set(all.map(r => r.actualDepartment))].map(p => `<option value="${p}">`).join('');
    Records.renderChips();
  },

  renderChips() {
    const labels = { fSearch: 'Search', fFrom: 'From', fTo: 'To', fDate: 'Date', fBuilding: 'Building', fRoom: 'Room', fDept: 'Department', fBorrower: 'Borrower', fPurpose: 'Purpose', fStatus: 'Status', fTransfer: 'Transfer' };
    const chips = [];
    for (const [id, label] of Object.entries(labels)) {
      const v = document.getElementById(id).value;
      if (v) chips.push(`<span class="chip" data-chip="${id}" title="Click to remove">${label}: ${String(v).replace(/</g, '&lt;')} ×</span>`);
    }
    document.getElementById('filterChips').innerHTML = chips.join('');
  },

  async exportFilteredCsv() {
    const list = await Records.filtered();
    if (!list.length) { Utils.toast('No records to export.'); return; }
    const headers = ['actualDate', 'actualBuilding', 'actualRoomName', 'actualBorrower', 'actualDepartment', 'actualPurpose', 'actualTimeIn', 'actualTimeOut', 'actualDurationMinutes', 'wasTransferred', 'status', 'remarks'];
    const esc = v => v == null ? '' : `"${String(v).replace(/"/g, '""')}"`;
    const rows = list.map(r => headers.map(h => esc(h === 'actualTimeIn' || h === 'actualTimeOut' ? (r[h] != null ? Utils.formatTime(r[h]) : '') : h === 'wasTransferred' ? (r[h] ? 'Yes' : 'No') : h === 'actualDurationMinutes' ? (r[h] != null ? Utils.formatDuration(r[h]) : '') : r[h])).join(','));
    const blob = new Blob([headers.join(',') + '\r\n' + rows.join('\r\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `records-${Utils.todayISO()}.csv`;
    a.click();
  },

  bind() {
    document.getElementById('recBuilding').addEventListener('change', e => Records.fillRoomsForBuilding(e.target.value, 'recRoom'));
    document.getElementById('recordForm').addEventListener('submit', Records.save);
    document.getElementById('recReset').addEventListener('click', Records.defaults);
    document.getElementById('fClear').addEventListener('click', () => {
      ['fSearch', 'fFrom', 'fTo', 'fDate', 'fRoom', 'fDept', 'fBorrower', 'fPurpose'].forEach(id => document.getElementById(id).value = '');
      document.getElementById('fBuilding').value = '';
      document.getElementById('fStatus').value = '';
      document.getElementById('fTransfer').value = '';
      Records.page = 1; Records.render();
    });
    ['fSearch', 'fFrom', 'fTo', 'fDate', 'fBuilding', 'fRoom', 'fDept', 'fBorrower', 'fPurpose', 'fStatus', 'fTransfer']
      .forEach(id => document.getElementById(id).addEventListener('input', () => { Records.page = 1; Records.render(); }));
    document.querySelectorAll('#recordsTable th[data-sort]').forEach(th =>
      th.addEventListener('click', () => {
        if (Records.sortKey === th.dataset.sort) Records.sortDir *= -1;
        else { Records.sortKey = th.dataset.sort; Records.sortDir = 1; }
        Records.render();
      }));
    document.getElementById('pgPrev').addEventListener('click', () => { if (Records.page > 1) { Records.page--; Records.render(); } });
    document.getElementById('pgNext').addEventListener('click', () => { Records.page++; Records.render(); });
    document.getElementById('pgSize').addEventListener('change', e => { Records.pageSize = e.target.value === '9999' ? 'all' : parseInt(e.target.value, 10); Records.page = 1; Records.render(); });
    document.getElementById('fAdvancedToggle').addEventListener('click', () => {
      const adv = document.getElementById('advancedFilters');
      adv.hidden = !adv.hidden;
      document.getElementById('fAdvancedToggle').setAttribute('aria-expanded', String(!adv.hidden));
      document.getElementById('fAdvancedToggle').textContent = adv.hidden ? 'Advanced filters ▾' : 'Advanced filters ▴';
    });
    document.getElementById('filterChips').addEventListener('click', e => {
      const id = e.target.dataset.chip;
      if (id) { document.getElementById(id).value = ''; Records.page = 1; Records.render(); }
    });
    document.getElementById('fExportCsv').addEventListener('click', Records.exportFilteredCsv);
    document.getElementById('fExportPdf').addEventListener('click', () => window.print());
    document.querySelectorAll('[data-now]').forEach(b => b.addEventListener('click', () => {
      const now = new Date();
      document.getElementById(b.dataset.now).value = Records.minToTime(now.getHours() * 60 + now.getMinutes());
      Records.updateDurationPreview();
    }));
    ['recTimeIn', 'recTimeOut'].forEach(id => document.getElementById(id).addEventListener('change', Records.updateDurationPreview));
    ['recRequestedBuilding', 'recRequestedRoom'].forEach(id => document.getElementById(id).addEventListener('change', Records.autofillFromRequest));
    ['recBuilding', 'recRoom'].forEach(id => document.getElementById(id).addEventListener('change', Records.evaluateTransferRow));
    document.getElementById('recSaveAnother').addEventListener('click', () => { Records._saveAnother = true; document.getElementById('recordForm').requestSubmit(); });
    document.getElementById('recReset').addEventListener('click', () => {
      const f = document.getElementById('recordForm');
      if (f.dataset.dirty === '1' && !confirm('Discard the current form entries?')) return;
      f.dataset.dirty = ''; Records.defaults();
    });
    document.getElementById('recordForm').addEventListener('input', () => (document.getElementById('recordForm').dataset.dirty = '1'));
    document.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && document.getElementById('view-records').classList.contains('active')) {
        e.preventDefault(); document.getElementById('recordForm').requestSubmit();
      }
    });
    document.querySelector('#recordsTable tbody').addEventListener('click', e => {
      const c = e.target.dataset.close, v = e.target.dataset.view, ed = e.target.dataset.edit, d = e.target.dataset.del;
      if (c) Records.closeRecord(c);
      else if (v) Records.viewDetails(v);
      else if (ed) Records.editRecord(ed);
      else if (d) Records.deleteRecord(d);
    });
    document.getElementById('detailClose').addEventListener('click', () => (document.getElementById('detailModal').hidden = true));
  },
};
