const firebaseConfig = {
  apiKey: 'AIzaSyA8weN2Ql7zKsienHXMZpcGO4Z8u6CVZTY',
  authDomain: 'legalhub-law.firebaseapp.com',
  projectId: 'legalhub-law',
  storageBucket: 'legalhub-law.firebasestorage.app',
  messagingSenderId: '623059622188',
  appId: '1:623059622188:web:f3a5aedc77c3873e4d7489',
  measurementId: 'G-B82KXQKJDV'
};

let app = null;
let firebaseAuth = null;
let firestore = null;

try {
  const sdk = (typeof window !== 'undefined' ? window.firebase : null);
  if (sdk?.initializeApp) {
    app = sdk.apps?.length ? sdk.app() : sdk.initializeApp(firebaseConfig);
    firebaseAuth = sdk.auth(app);
    firestore = sdk.firestore(app);
  } else {
    console.warn('Firebase SDK not loaded — running in local-only mode.');
  }
} catch (error) {
  console.warn('Firebase init failed — running in local-only mode.', error);
}

export { firebaseAuth, firestore };
export const isFirebaseReady = () => !!(firebaseAuth && firestore);

export const addDoc = (reference, data) => reference.add(data);
export const collection = (database, name) => database.collection(name);
export const deleteDoc = reference => reference.delete();
export const doc = (database, collectionName, id) => database.collection(collectionName).doc(id);
export const getDocs = reference => reference.get();
export const orderBy = field => ({ type: 'orderBy', field });
export const where = (field, operator, value) => ({ type: 'where', field, operator, value });
export const query = (reference, ...constraints) => constraints.reduce((current, constraint) => {
  if (!constraint) return current;
  if (constraint.type === 'where') return current.where(constraint.field, constraint.operator, constraint.value);
  if (constraint.type === 'orderBy' || constraint.field) return current.orderBy(constraint.field);
  return current;
}, reference);
export const setDoc = (reference, data, options) => reference.set(data, options || {});
export const signInWithEmailAndPassword = (auth, email, password) => {
  if (!auth) {
    const err = new Error('Firebase Auth is offline.');
    err.code = 'auth/network-request-failed';
    return Promise.reject(err);
  }
  return auth.signInWithEmailAndPassword(email, password);
};
export const signOut = auth => (auth ? auth.signOut() : Promise.resolve());
