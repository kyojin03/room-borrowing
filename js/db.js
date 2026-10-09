// IndexedDB layer — all persistence lives here; UI modules never touch raw IDB.
const DB_NAME = 'RoomBorrowingDB';
const DB_VERSION = 2;

const ROOM_GROUPS = {
  'CATALINA 1': ['Room 101','Room 104','Room 105','Room 201','Room 202','Room 203','Room 204','Room 205','Room 302','Room 303','Room 304','Room 305','Room 401','Room 402','Room 403','Room 404'],
  'CATALINA 2': ['Room 301','Room 302','Room 303','Room 304','Room 305','Room 306','Room 307','Room 401','Room 402','Room 403','Room 404','Room 405','Room 406','Room 407','Room 408','Room 409','Room 501','Room 502','Room 503','Room 504','Room 505','Room 506','Room 507','Room 508','Room 601','Room 602','Room 603','Room 604','Room 605','Room 606','Room 607','Room 608','Room 609','NSTP/MPH','ED TECH','Reading Room 1','Reading Room 2','Alumni/Research'],
  'CATALINA 3': ['Room 201','Room 202','Room 203','Room 204','Room 205','Room 206'],
  'PEREGRIN 3': ['Room 101','Room 102','Room 103','Room 104','Room 105','Room 106','Room 107','Room 108','Room 201','Room 202','Room 203','Room 204','Room 205','Room 206','Room 301','Room 302','Room 303','Room 304','Room 305','Room 306','Room 307','Room 308','Room 401','Room 402','Room 403','Room 404','Room 405','Room 406','Room 407','Room 408'],
  'FMCH': ['Room 1','Room 2','Room 3','Room 4','Room 5','Room 6'],
};

const DB = {
  instance: null,

  open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('rooms')) {
          const rooms = db.createObjectStore('rooms', { keyPath: 'id' });
          rooms.createIndex('building', 'building');
          rooms.createIndex('status', 'status');
          rooms.createIndex('name', 'name');
        }
        if (!db.objectStoreNames.contains('borrowingRecords')) {
          db.createObjectStore('borrowingRecords', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'id' });
        }
        // v2: recording schema uses actual-usage field names
        if (e.oldVersion < 2 && db.objectStoreNames.contains('borrowingRecords')) {
          const store = e.target.transaction.objectStore('borrowingRecords');
          for (const idx of ['date', 'building', 'roomId', 'department', 'borrower', 'purpose', 'status']) {
            if (store.indexNames.contains(idx)) store.deleteIndex(idx);
          }
          store.createIndex('actualDate', 'actualDate');
          store.createIndex('actualBuilding', 'actualBuilding');
          store.createIndex('actualRoomId', 'actualRoomId');
          store.createIndex('actualDepartment', 'actualDepartment');
          store.createIndex('actualBorrower', 'actualBorrower');
          store.createIndex('status', 'status');
          store.createIndex('actualPurpose', 'actualPurpose');
          store.createIndex('wasTransferred', 'wasTransferred');
        }
      };
      req.onsuccess = () => { DB.instance = req.result; DB.migrateRecords().then(() => resolve(req.result)); };
      req.onerror = () => reject(req.error);
    });
  },

  tx(storeName, mode = 'readonly') {
    return DB.instance.transaction(storeName, mode).objectStore(storeName);
  },

  getAll(storeName) {
    return new Promise((resolve, reject) => {
      const req = DB.tx(storeName).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  get(storeName, id) {
    return new Promise((resolve, reject) => {
      const req = DB.tx(storeName).get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  put(storeName, obj) {
    return new Promise((resolve, reject) => {
      const req = DB.tx(storeName, 'readwrite').put(obj);
      req.onsuccess = () => resolve(obj);
      req.onerror = () => reject(req.error);
    });
  },

  delete(storeName, id) {
    return new Promise((resolve, reject) => {
      const req = DB.tx(storeName, 'readwrite').delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  },

  // One-time field migration: old records used generic names (date, roomName, ...).
  async migrateRecords() {
    const all = await DB.getAll('borrowingRecords');
    for (const r of all) {
      if (r.actualDate !== undefined) continue;
      const migrated = {
        ...r,
        requestReference: '', requestDate: '', requestingDepartment: '', departmentHead: '',
        requestedBy: '', notedBy: '', requestedBuilding: '', requestedRoom: '',
        requestedDate: '', requestedTimeIn: null, requestedTimeOut: null,
        actualDate: r.date, actualBuilding: r.building, actualRoomId: r.roomId,
        actualRoomName: r.roomName, actualBorrower: r.borrower, actualDepartment: r.department,
        actualPurpose: r.purpose, actualTimeIn: r.timeIn, actualTimeOut: r.timeOut,
        actualDurationMinutes: r.durationMinutes,
        wasTransferred: false, transferReason: '',
      };
      delete migrated.date; delete migrated.building; delete migrated.roomId;
      delete migrated.roomName; delete migrated.borrower; delete migrated.department;
      delete migrated.purpose; delete migrated.timeIn; delete migrated.timeOut;
      delete migrated.durationMinutes;
      await DB.put('borrowingRecords', migrated);
    }
  },

  async seedRoomsIfEmpty() {
    const rooms = await DB.getAll('rooms');
    if (rooms.length > 0) return false;
    const now = new Date().toISOString();
    for (const [building, names] of Object.entries(ROOM_GROUPS)) {
      for (const name of names) {
        await DB.put('rooms', {
          id: Utils.uid(), building, name, type: '', status: 'Active', notes: '',
          createdAt: now, updatedAt: now,
        });
      }
    }
    return true;
  },
};
