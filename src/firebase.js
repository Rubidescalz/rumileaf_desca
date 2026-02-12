// Local adapter replacing Firebase for auth and simple persistence
// - Auth: fixed user sign-in without Firebase
// - DB: localStorage-backed consultations per user

// Fixed default user
const LOCAL_USER = {
  uid: 'local-rubi',
  email: 'rubi@gmail.com',
};

const AUTH_KEY = 'rumileaf_auth';
const USER_KEY = 'rumileaf_user';
const CONSULTATIONS_KEY = 'rumileaf_consultations';

// Utils - descxa
function serverTimestamp() {
  return Date.now();
}



function uuid() {
  // Simple unique ID generator (not RFC4122)
  return 'id-' + Math.random().toString(36).slice(2, 10) + '-' + Date.now().toString(36);
}

function readConsultationsStore() {
  try {
    const raw = localStorage.getItem(CONSULTATIONS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeConsultationsStore(store) {
  try {
    localStorage.setItem(CONSULTATIONS_KEY, JSON.stringify(store));
  } catch (e) {
    console.warn('[DB] Error writing consultations store', e);
  }
}

function getStoredUser() {
  try {
    const isAuth = localStorage.getItem(AUTH_KEY) === 'true';
    const email = localStorage.getItem(USER_KEY);
    if (isAuth && email && email === LOCAL_USER.email) {
      return { ...LOCAL_USER };
    }
  } catch {}
  return null;
}

// Auth adapter
const authListeners = new Set();

const auth = {
  currentUser: getStoredUser(),

  async signIn(email, password) {
    // Validate fixed credentials only
    if (email === LOCAL_USER.email && password === 'rubi28') {
      this.currentUser = { ...LOCAL_USER };
      try {
        localStorage.setItem(AUTH_KEY, 'true');
        localStorage.setItem(USER_KEY, LOCAL_USER.email);
      } catch {}
      notifyAuthListeners();
      return { user: this.currentUser };
    }
    const error = new Error('Credenciales inválidas');
    error.code = 'auth/invalid-credentials';
    throw error;
  },

  async signOut() {
    this.currentUser = null;
    try {
      localStorage.removeItem(AUTH_KEY);
      localStorage.removeItem(USER_KEY);
    } catch {}
    notifyAuthListeners();
  },

  onAuthStateChanged(callback) {
    // Immediately notify with current state
    try {
      callback(this.currentUser);
    } catch {}

    authListeners.add(callback);
    return () => {
      authListeners.delete(callback);
    };
  },
};

function notifyAuthListeners() {
  authListeners.forEach((cb) => {
    try { cb(auth.currentUser); } catch {}
  });
}

// DB adapter (localStorage)
const db = {
  addConsultation(data) {
    const userId = data.userId;
    if (!userId) throw new Error('userId requerido');

    const store = readConsultationsStore();
    const list = Array.isArray(store[userId]) ? store[userId] : [];

    const id = uuid();
    const createdAt = data.createdAt ?? serverTimestamp();

    const record = { id, ...data, createdAt };
    list.unshift(record); // add on top
    store[userId] = list;
    writeConsultationsStore(store);

    // Notify subscribers in this tab
    try {
      window.dispatchEvent(new Event('rumileaf_consultations_updated'));
    } catch {}

    return { id };
  },

  getUserConsultations(userId) {
    const store = readConsultationsStore();
    const list = Array.isArray(store[userId]) ? store[userId] : [];
    // Ensure sorted by createdAt desc
    return [...list].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  },

  subscribeUserConsultations(userId, callback) {
    // Initial emit
    try {
      callback(this.getUserConsultations(userId));
    } catch {}

    const handler = () => {
      try {
        callback(db.getUserConsultations(userId));
      } catch {}
    };

    window.addEventListener('rumileaf_consultations_updated', handler);
    // Cross-tab sync
    window.addEventListener('storage', (e) => {
      if (e.key === CONSULTATIONS_KEY) handler();
    });

    return () => {
      window.removeEventListener('rumileaf_consultations_updated', handler);
    };
  },
};

const firebaseAdapter = {
  db,
  auth,
  serverTimestamp,
};

export { db, auth, serverTimestamp };
export default firebaseAdapter;
