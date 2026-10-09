const Rooms = {
  async render() {
    const [rooms, buildingFilter, statusFilter, search] = await Promise.all([
      DB.getAll('rooms'),
      Promise.resolve(document.getElementById('roomBuildingFilter').value),
      Promise.resolve(document.getElementById('roomStatusFilter').value),
      Promise.resolve(document.getElementById('roomSearch').value.trim().toLowerCase()),
    ]);
    const filtered = rooms.filter(r =>
      (!buildingFilter || r.building === buildingFilter) &&
      (!statusFilter || r.status === statusFilter) &&
      (!search || `${r.name} ${r.building} ${r.type}`.toLowerCase().includes(search))
    ).sort((a, b) => a.building.localeCompare(b.building) || a.name.localeCompare(b.name, undefined, { numeric: true }));

    const tbody = document.querySelector('#roomsTable tbody');
    tbody.innerHTML = filtered.map(r => `
      <tr>
        <td>${r.building}</td><td>${r.name}</td><td>${r.type || '—'}</td>
        <td><span class="badge ${r.status.toLowerCase()}">${r.status}</span></td>
        <td>${r.notes || '—'}</td>
        <td>
          <button class="btn small ghost" data-edit="${r.id}">Edit</button>
          <button class="btn small ghost" data-toggle="${r.id}">${r.status === 'Active' ? 'Deactivate' : 'Activate'}</button>
        </td>
      </tr>`).join('');
    document.getElementById('roomsEmpty').hidden = filtered.length > 0;
  },

  populateFilters() {
    const bf = document.getElementById('roomBuildingFilter');
    const rf = document.getElementById('rfBuilding');
    const buildings = Object.keys(ROOM_GROUPS);
    bf.innerHTML = '<option value="">All Buildings</option>' + buildings.map(b => `<option>${b}</option>`).join('');
    rf.innerHTML = buildings.map(b => `<option>${b}</option>`).join('');
  },

  openModal(room = null) {
    document.getElementById('roomModalTitle').textContent = room ? 'Edit Room' : 'Add Room';
    document.getElementById('roomForm').dataset.id = room ? room.id : '';
    document.getElementById('rfBuilding').value = room ? room.building : Object.keys(ROOM_GROUPS)[0];
    document.getElementById('rfName').value = room ? room.name : '';
    document.getElementById('rfType').value = room ? room.type : '';
    document.getElementById('rfStatus').value = room ? room.status : 'Active';
    document.getElementById('rfNotes').value = room ? room.notes : '';
    document.getElementById('roomModal').hidden = false;
  },

  async save(e) {
    e.preventDefault();
    const id = e.target.dataset.id;
    const existing = id ? await DB.get('rooms', id) : null;
    const now = new Date().toISOString();
    await DB.put('rooms', {
      id: id || Utils.uid(),
      building: document.getElementById('rfBuilding').value,
      name: document.getElementById('rfName').value.trim(),
      type: document.getElementById('rfType').value.trim(),
      status: document.getElementById('rfStatus').value,
      notes: document.getElementById('rfNotes').value.trim(),
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now,
    });
    document.getElementById('roomModal').hidden = true;
    Utils.toast('Room saved.');
    Rooms.render();
  },

  async toggleStatus(id) {
    const room = await DB.get('rooms', id);
    if (!room) return;
    room.status = room.status === 'Active' ? 'Inactive' : 'Active';
    room.updatedAt = new Date().toISOString();
    await DB.put('rooms', room);
    Utils.toast(`Room ${room.status === 'Active' ? 'activated' : 'deactivated'}.`);
    Rooms.render();
  },

  bind() {
    document.getElementById('addRoomBtn').addEventListener('click', () => Rooms.openModal());
    document.getElementById('roomModalCancel').addEventListener('click', () => (document.getElementById('roomModal').hidden = true));
    document.getElementById('roomForm').addEventListener('submit', Rooms.save);
    ['roomSearch', 'roomBuildingFilter', 'roomStatusFilter'].forEach(id =>
      document.getElementById(id).addEventListener('input', Rooms.render));
    document.querySelector('#roomsTable tbody').addEventListener('click', async (e) => {
      const editId = e.target.dataset.edit;
      const toggleId = e.target.dataset.toggle;
      if (editId) Rooms.openModal(await DB.get('rooms', editId));
      else if (toggleId) Rooms.toggleStatus(toggleId);
    });
  },
};
