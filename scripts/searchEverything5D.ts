import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyAazNo3xjmQAHXbjq8aC9Blqy_PSpAHTtI",
  authDomain: "appdayhoc-dcb36.firebaseapp.com",
  projectId: "appdayhoc-dcb36",
  storageBucket: "appdayhoc-dcb36.firebasestorage.app",
  messagingSenderId: "498653089335",
  appId: "1:498653089335:web:3d9453134dc6ca238379b2",
  measurementId: "G-JNQPGWC6F4"
};

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);

async function searchAll() {
  console.log('=== SEARCHING ALL COLLECTIONS FOR ANY 5D REFERENCES ===');

  const knownCollections = [
    'classes', 'class_rosters', 'students', 'student_enrollments', 'users',
    'submissions', 'student_submissions', 'exam_submissions', 'homework_submissions',
    'unmatched_submissions', 'assignments', 'assignments_v2', 'exams', 'games',
    'elearning_student_progress', 'student_scores'
  ];

  for (const col of knownCollections) {
    try {
      const snap = await getDocs(collection(db, col));
      console.log(`Collection '${col}': ${snap.size} documents`);
      snap.forEach(d => {
        const str = JSON.stringify(d.data());
        if (str.toLowerCase().includes('5d')) {
          console.log(`  [FOUND 5D in '${col}' doc '${d.id}']:`, str.slice(0, 350));
        }
      });
    } catch (e: any) {
      // collection may not exist
    }
  }

  process.exit(0);
}

searchAll().catch(err => {
  console.error(err);
  process.exit(1);
});
