// Smoke test: load the app in jsdom with fake IndexedDB, exercise the main flows.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const dom = new JSDOM(html, {
  url: 'http://localhost/',
  runScripts: 'outside-only',
  pretendToBeVisual: true,
});
const { window } = dom;

// IndexedDB + storage shims
window.indexedDB = require('fake-indexeddb').indexedDB;
window.IDBKeyRange = require('fake-indexeddb').IDBKeyRange;
if (!window.navigator.serviceWorker) Object.defineProperty(window.navigator, 'serviceWorker', { value: undefined });

// Execute app scripts in order
const scriptFiles = ['js/utils.js', 'js/db.js', 'js/rooms.js', 'js/records.js', 'js/statistics.js', 'js/reports.js', 'js/backup.js', 'js/app.js'];
window.eval(scriptFiles.map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n;\n') + '\n;window.Utils=Utils;window.DB=DB;window.ROOM_GROUPS=ROOM_GROUPS;window.Rooms=Rooms;window.Records=Records;window.Stats=Stats;window.Reports=Reports;window.Backup=Backup;window.Demo=Demo;window.App=App;');

const errors = [];
window.addEventListener('error', e => errors.push(e.message));

(async () => {
  await window.eval('App.init()');
  const roomCount = await window.eval('DB.getAll("rooms").then(r => r.length)');
  console.log('rooms seeded:', roomCount);

  // Create a record
  const room = (await window.eval('DB.getAll("rooms")'))[0];
  await window.eval(`(async () => {
    document.getElementById('recBuilding').value = '${room.building}';
    await Records.fillRoomsForBuilding('${room.building}', 'recRoom');
    document.getElementById('recRoom').value = '${room.id}';
    document.getElementById('recBorrower').value = 'Test User';
    document.getElementById('recDepartment').value = 'CCS';
    document.getElementById('recPurpose').value = 'Meeting';
    document.getElementById('recTimeIn').value = '09:00';
    document.getElementById('recordForm').dispatchEvent(new window.Event('submit', { cancelable: true }));
  })()`);
  await new Promise(r => setTimeout(r, 100));
  const recs = await window.eval('DB.getAll("borrowingRecords")');
  console.log('records after create:', recs.length, '| status:', recs[0] && recs[0].status, '| actualDate:', recs[0] && recs[0].actualDate);

  // Active-room protection
  const conflict = await window.eval(`(async () => {
    document.getElementById('recBuilding').value = '${room.building}';
    await Records.fillRoomsForBuilding('${room.building}', 'recRoom');
    document.getElementById('recRoom').value = '${room.id}';
    document.getElementById('recBorrower').value = 'Second User';
    document.getElementById('recDepartment').value = 'CCS';
    document.getElementById('recPurpose').value = 'Meeting';
    document.getElementById('recTimeIn').value = '10:00';
    let alerted = false;
    const orig = window.alert; window.alert = () => { alerted = true; };
    document.getElementById('recordForm').dispatchEvent(new window.Event('submit', { cancelable: true }));
    await new Promise(r => setTimeout(r, 50));
    window.alert = orig;
    return alerted;
  })()`);
  console.log('active-room protection alerted:', conflict);

  // Close record
  await window.eval(`Records.closeRecord('${recs[0].id}')`);
  const closed = await window.eval('DB.get("borrowingRecords", "' + recs[0].id + '")');
  console.log('closed status:', closed.status, '| duration:', closed.actualDurationMinutes);

  // Stats + dashboard render without errors
  await window.eval('Stats.render()');
  await window.eval('App.renderDashboard()');
  console.log('stats/dashboard rendered OK');
  console.log(errors.length ? 'ERRORS: ' + errors.join('; ') : 'No window errors');
})().catch(e => { console.error('TEST FAILED:', e); process.exit(1); });

