import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';

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

const STANDARD_GRADE_SUBJECTS: Record<string, string[]> = {
  'Khối 1': ['Toán', 'Tiếng Việt', 'Tiếng Anh', 'Tự nhiên và Xã hội', 'Đạo đức', 'Âm nhạc', 'Mĩ thuật', 'Giáo dục thể chất', 'Hoạt động trải nghiệm'],
  'Khối 2': ['Toán', 'Tiếng Việt', 'Tiếng Anh', 'Tự nhiên và Xã hội', 'Đạo đức', 'Âm nhạc', 'Mĩ thuật', 'Giáo dục thể chất', 'Hoạt động trải nghiệm'],
  'Khối 3': ['Toán', 'Tiếng Việt', 'Tiếng Anh', 'Tin học', 'Công nghệ', 'Tự nhiên và Xã hội', 'Đạo đức', 'Âm nhạc', 'Mĩ thuật', 'Giáo dục thể chất', 'Hoạt động trải nghiệm'],
  'Khối 4': ['Toán', 'Tiếng Việt', 'Tiếng Anh', 'Tin học', 'Công nghệ', 'Khoa học', 'Lịch sử và Địa lí', 'Đạo đức', 'Âm nhạc', 'Mĩ thuật', 'Giáo dục thể chất', 'Hoạt động trải nghiệm'],
  'Khối 5': ['Toán', 'Tiếng Việt', 'Tiếng Anh', 'Tin học', 'Công nghệ', 'Khoa học', 'Lịch sử và Địa lí', 'Đạo đức', 'Âm nhạc', 'Mĩ thuật', 'Giáo dục thể chất', 'Hoạt động trải nghiệm']
};

const cleanDClasses = [
  { id: '1D', name: 'Lớp 1D', grade: 'Khối 1', room: 'Phòng 102' },
  { id: '2D', name: 'Lớp 2D', grade: 'Khối 2', room: 'Phòng 202' },
  { id: '3D', name: 'Lớp 3D', grade: 'Khối 3', room: 'Phòng 302' },
  { id: '4D', name: 'Lớp 4D', grade: 'Khối 4', room: 'Phòng 402' },
  { id: '5D', name: 'Lớp 5D', grade: 'Khối 5', room: 'Phòng 502' }
];

async function clean() {
  console.log('Normalizing 1D, 2D, 3D, 4D, 5D documents in Firestore classes & class_rosters...');
  
  for (const item of cleanDClasses) {
    const subjects = STANDARD_GRADE_SUBJECTS[item.grade].map(s => ({ isVisible: true, subjectName: s }));
    
    // Update 'classes' document
    await setDoc(doc(db, 'classes', item.id), {
      id: item.id,
      name: item.name,
      grade: item.grade,
      room: item.room,
      subjects
    }, { merge: true });

    // Update 'class_rosters' document
    await setDoc(doc(db, 'class_rosters', item.id), {
      classKey: item.id,
      className: item.name,
      updatedAt: new Date().toISOString()
    }, { merge: true });

    console.log(`[OK] Cleaned doc ${item.id}: name set to "${item.name}"`);
  }

  console.log('Successfully normalized Firestore class documents!');
  process.exit(0);
}

clean().catch(err => {
  console.error(err);
  process.exit(1);
});
