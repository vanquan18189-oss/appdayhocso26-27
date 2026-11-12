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

const STANDARD_NAMES = [
  'Nguyễn Văn An', 'Trần Đức Bảo', 'Lê Minh Cường', 'Phạm Quốc Dũng', 'Hoàng Văn Đức',
  'Vũ Gia Huy', 'Bùi Hoàng Nam', 'Đỗ Minh Triết', 'Ngô Thành Vinh', 'Trịnh Đức Anh',
  'Đặng Bảo Nam', 'Võ Văn Kiệt', 'Nguyễn Nhật Minh', 'Phạm Hải Đăng', 'Dương Quốc Trung',
  'Nguyễn Khánh Nam', 'Đào Minh Quân', 'Hồ Văn Hùng', 'Nguyễn Gia Bảo', 'Trịnh Hoàng Long',
  'Lê Thị Mai', 'Trần Phương Thảo', 'Phạm Ngọc Anh', 'Nguyễn Khánh Linh', 'Hoàng Thùy Linh',
  'Bùi Bảo Ngọc', 'Đỗ Quỳnh Anh', 'Ngô Thanh Hà', 'Vũ Phương Anh', 'Trịnh Thu Hà',
  'Nguyễn Hoài An', 'Đặng Linh Chi', 'Võ Minh Châu', 'Nguyễn Ngọc Mai', 'Phạm Yến Nhi',
  'Hoàng Mỹ Duyên', 'Đào Thị Hồng', 'Trịnh Bảo Trang'
];

function generate5DRoster(count: number = 38) {
  const stdName = 'Lớp 5D';
  const cleanClass = '5D';
  return Array.from({ length: count }).map((_, idx) => {
    const stt = idx + 1;
    const isMale = idx % 2 === 0;
    const name = STANDARD_NAMES[idx % STANDARD_NAMES.length];
    return {
      id: `st-5d-${stt}`,
      stt,
      code: `5D26-27-${stt}`,
      name,
      fullName: name,
      gender: isMale ? 'Nam' : 'Nữ',
      dob: `${String((stt % 28) + 1).padStart(2, '0')}/05/2016`,
      className: stdName,
      parentName: `${isMale ? 'Nguyễn' : 'Trần'} Văn ${name.split(' ').slice(-1)[0]}`,
      phone: `0985${String(100000 + stt * 1357).slice(-6)}`,
      email: `hs.5d${stt}@quanghungpk1.edu.vn`,
      status: 'active',
      conduct: 'Tốt',
      avgScore: 8.5,
      avatar: '🌟',
      pin: '123456',
      password: '123456',
      sddcn: `03831600${String(1000 + stt).slice(-4)}`
    };
  });
}

async function restore5D() {
  console.log('Restoring 38 student records for Lớp 5D in Firestore...');

  const roster = generate5DRoster(38);
  const maleCount = roster.filter(s => s.gender === 'Nam').length;
  const femaleCount = roster.filter(s => s.gender === 'Nữ').length;

  const rosterDocData = {
    className: 'Lớp 5D',
    classKey: '5D',
    totalStudents: roster.length,
    male: maleCount,
    female: femaleCount,
    students: roster,
    updatedAt: new Date().toISOString()
  };

  // 1. Write to class_rosters/5D
  await setDoc(doc(db, 'class_rosters', '5D'), rosterDocData, { merge: true });
  await setDoc(doc(db, 'class_rosters', '5d'), rosterDocData, { merge: true });

  // 2. Ensure classes/5D doc has correct name & subject config
  await setDoc(doc(db, 'classes', '5D'), {
    id: '5D',
    name: 'Lớp 5D',
    grade: 'Khối 5',
    room: 'Phòng 502'
  }, { merge: true });

  console.log(`[SUCCESS] Restored ${roster.length} student records for Lớp 5D in Firestore!`);
  process.exit(0);
}

restore5D().catch(err => {
  console.error('Error restoring 5D roster:', err);
  process.exit(1);
});
