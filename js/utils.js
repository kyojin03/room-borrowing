const Utils = {
  todayISO() { return new Date().toISOString().slice(0, 10); },
  nowMinutes() { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); },
  formatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''));
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  },
  formatTime(mins) {
    if (mins === '' || mins == null) return '';
    const h = Math.floor(mins / 60), m = mins % 60;
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
  },
  formatDurationShort(mins) {
    if (mins == null || isNaN(mins)) return '';
    const h = Math.floor(mins / 60), m = mins % 60;
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
  },
  formatDuration(mins) {
    if (mins == null || isNaN(mins)) return '';
    const h = Math.floor(mins / 60), m = mins % 60;
    if (h === 0) return `${m} min`;
    if (m === 0) return `${h} hr`;
    return `${h} hr ${m} min`;
  },
  uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); },
  toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(t._timer);
    t._timer = setTimeout(() => (t.hidden = true), 2600);
  },
};
