import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, getDoc } from 'firebase/firestore';

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

async function inspect() {
  console.log('--- INSPECTING FIRESTORE CLASSES COLLECTION ---');
  const classesSnap = await getDocs(collection(db, 'classes'));
  console.log(`Total documents in 'classes': ${classesSnap.size}`);
  
  classesSnap.forEach(d => {
    const data = d.data();
    console.log(`Doc ID: "${d.id}" | name: "${data.name}" | grade: "${data.grade}" | room: "${data.room}"`);
  });

  console.log('\n--- INSPECTING FIRESTORE CLASS_ROSTERS COLLECTION ---');
  const rostersSnap = await getDocs(collection(db, 'class_rosters'));
  console.log(`Total documents in 'class_rosters': ${rostersSnap.size}`);
  
  rostersSnap.forEach(d => {
    const data = d.data();
    const studentCount = Array.isArray(data.students) ? data.students.length : 0;
    console.log(`Doc ID: "${d.id}" | className: "${data.className}" | classKey: "${data.classKey}" | studentCount: ${studentCount}`);
  });

  console.log('\n--- INSPECTING OTHER COLLECTIONS FOR LINKED DATA ---');
  // Check assignments, exams, submissions, students
  const collectionsToCheck = ['assignments', 'assignments_v2', 'exams', 'submissions', 'student_submissions', 'students'];
  for (const colName of collectionsToCheck) {
    try {
      const snap = await getDocs(collection(db, colName));
      console.log(`Collection '${colName}': ${snap.size} docs`);
      if (!snap.empty && snap.size <= 20) {
        snap.forEach(d => {
          const data = d.data();
          const targetCls = data.targetClass || data.className || data.classId || data.classes;
          if (targetCls) {
            console.log(`  - Doc ${d.id} linked class:`, targetCls);
          }
        });
      }
    } catch (e: any) {
      console.log(`Collection '${colName}' check warning:`, e.message);
    }
  }

  process.exit(0);
}

inspect().catch(err => {
  console.error(err);
  process.exit(1);
});
