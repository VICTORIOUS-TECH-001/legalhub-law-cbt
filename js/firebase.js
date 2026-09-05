const firebaseConfig = {
  apiKey: 'AIzaSyA8weN2Ql7zKsienHXMZpcGO4Z8u6CVZTY',
  authDomain: 'legalhub-law.firebaseapp.com',
  projectId: 'legalhub-law',
  storageBucket: 'legalhub-law.firebasestorage.app',
  messagingSenderId: '623059622188',
  appId: '1:623059622188:web:f3a5aedc77c3873e4d7489',
  measurementId: 'G-B82KXQKJDV'
};

const app = window.firebase.initializeApp(firebaseConfig);
export const firebaseAuth = window.firebase.auth(app);
export const firestore = window.firebase.firestore(app);
export const addDoc = (reference, data) => reference.add(data);
export const collection = (database, name) => database.collection(name);
export const deleteDoc = reference => reference.delete();
export const doc = (database, collectionName, id) => database.collection(collectionName).doc(id);
export const getDocs = reference => reference.get();
export const orderBy = field => ({ field });
export const query = (reference, ...constraints) => constraints.reduce(
  (current, constraint) => constraint.field ? current.orderBy(constraint.field) : current,
  reference
);
export const setDoc = (reference, data, options) => reference.set(data, options);
export const signInWithEmailAndPassword = (auth, email, password) => auth.signInWithEmailAndPassword(email, password);
export const signOut = auth => auth.signOut();
export const where = (field, operator, value) => ({ field, operator, value });
