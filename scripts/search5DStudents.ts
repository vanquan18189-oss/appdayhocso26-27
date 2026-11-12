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

async function searchAll() {
  console.log('=== SEARCHING FIRESTORE FOR CLASS 5D DATA ===');

  // 1. Check class_rosters collection
  const rosterSnap = await getDocs(collection(db, 'class_rosters'));
  console.log(`Found ${rosterSnap.size} documents in 'class_rosters':`);
  rosterSnap.forEach(d => {
    const data = d.data();
    const id = d.id;
    const students = Array.isArray(data.students) ? data.students : (Array.isArray(data.studentList) ? data.studentList : []);
    console.log(` - Doc "${id}": className="${data.className}", classKey="${data.classKey}", studentsCount=${students.length}`);
    if (id.toLowerCase().includes('5d') || (data.className && data.className.toLowerCase().includes('5d'))) {
      console.log(`   --> Found 5D roster doc! Details:`, JSON.stringify(data).slice(0, 500));
    }
  });

  // 2. Check students collection if exists
  try {
    const studentsSnap = await getDocs(collection(db, 'students'));
    console.log(`\nFound ${studentsSnap.size} documents in 'students':`);
    let count5d = 0;
    studentsSnap.forEach(d => {
      const data = d.data();
      const cls = data.className || data.class || data.classId || '';
      if (cls.toLowerCase().includes('5d') || d.id.toLowerCase().includes('5d')) {
        count5d++;
        console.log(` - Student Doc "${d.id}": name="${data.name || data.fullName}", class="${cls}"`);
      }
    });
    console.log(`Total 5D student docs in 'students' collection: ${count5d}`);
  } catch (err: any) {
    console.log('Error checking students collection:', err?.message);
  }

  // 3. Check student_enrollments collection
  try {
    const enrollSnap = await getDocs(collection(db, 'student_enrollments'));
    console.log(`\nFound ${enrollSnap.size} documents in 'student_enrollments':`);
    enrollSnap.forEach(d => {
      const data = d.data();
      const cls = data.className || data.classId || '';
      if (cls.toLowerCase().includes('5d')) {
        console.log(` - Enrollment "${d.id}": sddcn="${data.sddcn}", classId="${data.classId}", displayCode="${data.displayCode}"`);
      }
    });
  } catch (err: any) {
    console.log('Error checking student_enrollments:', err?.message);
  }

  // 4. Check user profiles (users collection) for 5D students or homeroom teachers
  try {
    const usersSnap = await getDocs(collection(db, 'users'));
    console.log(`\nFound ${usersSnap.size} documents in 'users':`);
    usersSnap.forEach(d => {
      const data = d.data();
      const cls = data.className || data.lop || data.class || '';
      if (cls.toLowerCase().includes('5d') || d.id.toLowerCase().includes('5d')) {
        console.log(` - User "${d.id}": name="${data.name || data.fullName}", role="${data.role}", class="${cls}"`);
      }
    });
  } catch (err: any) {
    console.log('Error checking users collection:', err?.message);
  }

  // 5. Check submissions / student_submissions for any student details from 5D
  try {
    const subsSnap = await getDocs(collection(db, 'student_submissions'));
    console.log(`\nFound ${subsSnap.size} documents in 'student_submissions':`);
    subsSnap.forEach(d => {
      const data = d.data();
      const cls = data.className || data.classId || '';
      if (cls.toLowerCase().includes('5d')) {
        console.log(` - Submission "${d.id}": studentName="${data.studentName}", studentCode="${data.studentCode}"`);
      }
    });
  } catch (err: any) {
    console.log('Error checking student_submissions:', err?.message);
  }

  process.exit(0);
}

searchAll().catch(err => {
  console.error(err);
  process.exit(1);
});
