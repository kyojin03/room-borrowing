// Backup & Restore — full JSON export/import with replace/merge, CSV, backup status.
const Backup = {
  async status() {
    const [rooms, records] = await Promise.all([DB.getAll('rooms'), DB.getAll('borrowingRecords')]);
    const last = await DB.get('settings', 'lastBackup');
    document.getElementById('bkLast').textContent = last ? Utils.formatDate(last.value.slice(0, 10)) + ' ' + new Date(last.value).toLocaleTimeString() : 'Never';
    document.getElementById('bkRecords').textContent = records.length;
    document.getElementById('bkRooms').textContent = rooms.length;
    if (navigator.storage && navigator.storage.estimate) {
      const est = await navigator.storage.estimate();
      document.getElementById('bkSize').textContent = est.usage != null ? (est.usage / 1024 / 1024).toFixed(2) + ' MB' : 'Not available';
    } else document.getElementById('bkSize').textContent = 'Not available';
  },

  async exportAll() {
    const [rooms, records, settings] = await Promise.all([DB.getAll('rooms'), DB.getAll('borrowingRecords'), DB.getAll('settings')]);
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), rooms, borrowingRecords: records, settings }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `room-borrowing-backup-${Utils.todayISO()}.json`;
    a.click();
    await DB.put('settings', { id: 'lastBackup', key: 'lastBackup', value: new Date().toISOString() });
    Utils.toast('Backup exported.');
    Backup.status();
  },

  async restore(file) {
    let data;
    try { data = JSON.parse(await file.text()); } catch { Utils.toast('Invalid backup file.'); return; }
    if (!data || !Array.isArray(data.borrowingRecords) || !Array.isArray(data.rooms)) { Utils.toast('Invalid backup format.'); return; }
    const mode = confirm('Choose OK to REPLACE all existing data, or Cancel to MERGE with existing data.') ? 'replace' : 'merge';
    if (mode === 'replace') {
      if (!confirm('This will erase all current data. Continue?')) return;
      const stores = ['rooms', 'borrowingRecords', 'settings'];
      const lists = await Promise.all(stores.map(s => DB.getAll(s)));
      for (let i = 0; i < stores.length; i++) for (const item of lists[i]) await DB.delete(stores[i], item.id);
      for (const r of data.rooms) await DB.put('rooms', r);
      for (const r of data.borrowingRecords) await DB.put('borrowingRecords', r);
      if (Array.isArray(data.settings)) for (const s of data.settings) await DB.put('settings', s);
    } else {
      const existing = new Set((await DB.getAll('borrowingRecords')).map(r => r.id));
      for (const r of data.rooms) { const found = (await DB.getAll('rooms')).some(x => x.id === r.id); if (!found) await DB.put('rooms', r); }
      for (const r of data.borrowingRecords) if (!existing.has(r.id)) await DB.put('borrowingRecords', r);
    }
    Utils.toast(`Restore complete (${mode}).`);
    Backup.status();
  },

  async exportCsv() {
    const recs = (await DB.getAll('borrowingRecords')).sort((a, b) => a.actualDate.localeCompare(b.actualDate));
    if (!recs.length) { Utils.toast('No records to export.'); return; }
    const headers = ['actualDate', 'actualBuilding', 'actualRoomName', 'actualBorrower', 'actualDepartment', 'actualPurpose', 'actualTimeIn', 'actualTimeOut', 'actualDurationMinutes', 'wasTransferred', 'requestedRoom', 'requestedDate', 'status', 'remarks'];
    const esc = v => v == null ? '' : `"${String(v).replace(/"/g, '""')}"`;
    const rows = recs.map(r => headers.map(h => esc(h === 'actualTimeIn' || h === 'actualTimeOut' ? (r[h] != null ? Utils.formatTime(r[h]) : '') : h === 'wasTransferred' ? (r[h] ? 'Yes' : 'No') : r[h])).join(','));
    const blob = new Blob([headers.join(',') + '\r\n' + rows.join('\r\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `room-records-${Utils.todayISO()}.csv`;
    a.click();
  },

  bind() {
    document.getElementById('bkExport').addEventListener('click', Backup.exportAll);
    document.getElementById('bkImport').addEventListener('click', () => document.getElementById('bkFile').click());
    document.getElementById('bkFile').addEventListener('change', e => { if (e.target.files[0]) Backup.restore(e.target.files[0]); e.target.value = ''; });
    document.getElementById('bkCsv').addEventListener('click', Backup.exportCsv);
  },
};

// Demo data — never auto-loaded; identifiable via requestReference 'DEMO'.
const Demo = {
  async load() {
    if (!confirm('Load sample demo records for testing? They are marked DEMO and removable.')) return;
    const rooms = await DB.getAll('rooms');
    const pick = i => rooms[i % rooms.length];
    const depts = ['CAHP', 'CCS', 'CIT', 'CBA', 'CTE'];
    const purposes = ['Meeting', 'Training', 'Class', 'Examination', 'Event'];
    const now = new Date().toISOString();
    for (let i = 0; i < 12; i++) {
      const room = pick(i * 7);
      const d = new Date(); d.setDate(d.getDate() - i);
      const date = d.toISOString().slice(0, 10);
      const tIn = 8 * 60 + i * 15;
      await DB.put('borrowingRecords', {
        id: 'demo-' + i, requestReference: 'DEMO', requestDate: date, requestingDepartment: depts[i % 5],
        departmentHead: '', requestedBy: 'Demo Requester', notedBy: '',
        requestedBuilding: room.building, requestedRoom: room.name, requestedDate: date,
        requestedTimeIn: tIn, requestedTimeOut: tIn + 90,
        actualDate: date, actualBuilding: room.building, actualRoomId: room.id, actualRoomName: room.name,
        actualBorrower: 'Demo Borrower ' + (i + 1), actualDepartment: depts[i % 5], actualPurpose: purposes[i % 5],
        actualTimeIn: tIn, actualTimeOut: tIn + 90, actualDurationMinutes: 90,
        wasTransferred: false, transferReason: '', remarks: 'Demo record', status: 'Completed',
        createdAt: now, updatedAt: now,
      });
    }
    Utils.toast('Demo data loaded.');
  },
  async remove() {
    const all = await DB.getAll('borrowingRecords');
    const demos = all.filter(r => r.requestReference === 'DEMO' || (r.id && r.id.startsWith('demo-')));
    for (const r of demos) await DB.delete('borrowingRecords', r.id);
    Utils.toast(`Removed ${demos.length} demo record(s).`);
  },
  async wipe() {
    if (!confirm('This will erase ALL rooms, records, and settings. Continue?')) return;
    if (!confirm('Really erase everything? This cannot be undone.')) return;
    indexedDB.deleteDatabase(DB_NAME).onsuccess = () => location.reload();
  },
  bind() {
    document.getElementById('demoLoad').addEventListener('click', Demo.load);
    document.getElementById('demoRemove').addEventListener('click', Demo.remove);
    document.getElementById('wipeAll').addEventListener('click', Demo.wipe);
  },
};
