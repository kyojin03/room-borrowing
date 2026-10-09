const App = {
  titles: { dashboard: 'Dashboard', records: 'Daily Records', statistics: 'Statistics', reports: 'Reports', rooms: 'Rooms', backup: 'Backup & Restore', settings: 'Settings' },

  showView(name) {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === name));
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + name));
    document.getElementById('viewTitle').textContent = App.titles[name] || '';
    document.getElementById('sidebar').classList.remove('open');
    if (name === 'rooms') Rooms.render();
    if (name === 'reports') { Reports.fillBuildings(); }
    if (name === 'backup') Backup.status();
    if (name === 'statistics') Stats.init();
    if (name === 'records') Records.render();
    if (name === 'dashboard') App.renderDashboard();
  },

  async renderDashboard() {
    const [rooms, records] = await Promise.all([DB.getAll('rooms'), DB.getAll('borrowingRecords')]);
    const today = Utils.todayISO();
    const monthPrefix = today.slice(0, 7);
    const todays = records.filter(r => r.actualDate === today);
    const active = records.filter(r => r.status === 'Active');
    const monthRecs = records.filter(r => r.actualDate.startsWith(monthPrefix));
    const monthMins = monthRecs.reduce((s, r) => s + (r.actualDurationMinutes || 0), 0);
    document.getElementById('cardToday').textContent = todays.length;
    document.getElementById('cardActive').textContent = active.length;
    document.getElementById('cardOccupied').textContent = new Set(active.map(r => r.actualRoomId)).size;
    document.getElementById('cardRooms').textContent = rooms.filter(r => r.status === 'Active').length;
    document.getElementById('cardMonth').textContent = monthRecs.length;
    document.getElementById('cardMonthHours').textContent = (monthMins / 60).toFixed(1) + ' hrs';

    const sorted = todays.sort((a, b) => a.actualTimeIn - b.actualTimeIn);
    document.querySelector('#todayTable tbody').innerHTML = sorted.map(r => `
      <tr>
        <td>${r.actualRoomName}</td><td>${r.actualBuilding}</td><td>${r.actualBorrower}</td><td>${r.actualDepartment}</td><td>${r.actualPurpose}</td>
        <td>${Utils.formatTime(r.actualTimeIn)}</td><td>${r.actualTimeOut != null ? Utils.formatTime(r.actualTimeOut) : '—'}</td>
        <td>${r.actualDurationMinutes != null ? Utils.formatDuration(r.actualDurationMinutes) : '—'}</td>
        <td><span class="badge ${r.status.toLowerCase()}">${r.status}</span></td>
        <td>${r.status === 'Active' ? `<button class="btn small" data-close="${r.id}">Close</button>` : ''}</td>
      </tr>`).join('');
    document.getElementById('todayEmpty').hidden = sorted.length > 0;

    document.querySelector('#roomStatusTable tbody').innerHTML = active.map(r => `
      <tr>
        <td>${r.actualBuilding}</td><td>${r.actualRoomName}</td>
        <td><span class="badge active">Currently Borrowed</span></td>
        <td>${r.actualBorrower}</td><td>${r.actualDepartment}</td>
        <td>${Utils.formatTime(r.actualTimeIn)}</td>
        <td><button class="btn small" data-close="${r.id}">Close</button></td>
      </tr>`).join('');
    document.getElementById('roomStatusEmpty').hidden = active.length > 0;
  },

  bind() {
    document.querySelectorAll('.nav-btn').forEach(b => b.addEventListener('click', () => App.showView(b.dataset.view)));
    document.querySelectorAll('[data-goto]').forEach(b => b.addEventListener('click', () => App.showView(b.dataset.goto)));
    document.addEventListener('click', e => {
      const c = e.target.dataset && e.target.dataset.close;
      if (c && (document.getElementById('view-dashboard').classList.contains('active'))) {
        Records.closeRecord(c).then(() => App.renderDashboard());
      }
    });
    document.getElementById('menuToggle').addEventListener('click', () => document.getElementById('sidebar').classList.toggle('open'));
  },

  async init() {
    if (App._initialized) return;
    App._initialized = true;
    await DB.open();
    const seeded = await DB.seedRoomsIfEmpty();
    Rooms.populateFilters();
    Rooms.bind();
    Records.bind();
    Stats.bind();
    Reports.bind();
    Backup.bind();
    Demo.bind();
    Records.defaults();
    await Records.fillBuildings();
    App.bind();
    App.renderDashboard();
    if (seeded) Utils.toast('Room master data initialized.');
  },
};

document.addEventListener('DOMContentLoaded', App.init);
