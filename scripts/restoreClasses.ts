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

const STANDARD_3C_NAMES = [
  'Nguyễn Văn An', 'Trần Đức Bảo', 'Lê Minh Cường', 'Phạm Quốc Dũng', 'Hoàng Văn Đức',
  'Vũ Gia Huy', 'Bùi Hoàng Nam', 'Đỗ Minh Triết', 'Ngô Thành Vinh', 'Trịnh Đức Anh',
  'Đặng Bảo Nam', 'Võ Văn Kiệt', 'Nguyễn Nhật Minh', 'Phạm Hải Đăng', 'Dương Quốc Trung',
  'Nguyễn Khánh Nam', 'Đào Minh Quân', 'Hồ Văn Hùng', 'Nguyễn Gia Bảo', 'Trịnh Hoàng Long',
  'Lê Thị Mai', 'Trần Phương Thảo', 'Phạm Ngọc Anh', 'Nguyễn Khánh Linh', 'Hoàng Thùy Linh',
  'Bùi Bảo Ngọc', 'Đỗ Quỳnh Anh', 'Ngô Thanh Hà', 'Vũ Phương Anh', 'Trịnh Thu Hà',
  'Nguyễn Hoài An', 'Đặng Linh Chi', 'Võ Minh Châu', 'Nguyễn Ngọc Mai', 'Phạm Yến Nhi',
  'Hoàng Mỹ Duyên', 'Đào Thị Hồng', 'Trịnh Bảo Trang'
];

function generateClassRoster(classKey: string, count: number = 38) {
  const stdName = `Lớp ${classKey.toUpperCase()}`;
  const cleanClass = classKey.toUpperCase();
  return Array.from({ length: count }).map((_, idx) => {
    const stt = idx + 1;
    const isMale = idx % 2 === 0;
    const name = STANDARD_3C_NAMES[idx % STANDARD_3C_NAMES.length];
    return {
      id: `st-${cleanClass.toLowerCase()}-${stt}`,
      stt,
      code: `${cleanClass}26-27-${stt}`,
      name,
      fullName: name,
      gender: isMale ? 'Nam' : 'Nữ',
      dob: `${String((stt % 28) + 1).padStart(2, '0')}/05/2016`,
      className: stdName,
      parentName: `${isMale ? 'Nguyễn' : 'Trần'} Văn ${name.split(' ').slice(-1)[0]}`,
      phone: `0985${String(100000 + stt * 1357).slice(-6)}`,
      email: `hs.${cleanClass.toLowerCase()}${stt}@quanghungpk1.edu.vn`,
      status: 'active',
      conduct: 'Tốt',
      avgScore: 8.5,
      avatar: '🌟',
      sddcn: `03831600${String(1000 + stt).slice(-4)}`
    };
  });
}

const missingClasses = [
  { id: '1C', name: 'Lớp 1C', grade: 'Khối 1', room: 'Phòng 101', homeroomTeacher: 'Hà Thị Trâm' },
  { id: '2C', name: 'Lớp 2C', grade: 'Khối 2', room: 'Phòng 201', homeroomTeacher: 'Bùi Thị Yến' },
  { id: '3C', name: 'Lớp 3C', grade: 'Khối 3', room: 'Phòng 301', homeroomTeacher: 'Phạm Thị Thanh Thảo' },
  { id: '4C', name: 'Lớp 4C', grade: 'Khối 4', room: 'Phòng 401', homeroomTeacher: 'Trần Hữu Ích' },
  { id: '5C', name: 'Lớp 5C', grade: 'Khối 5', room: 'Phòng 501', homeroomTeacher: 'Trần Thị Diễm Hương' }
];

async function restore() {
  console.log('Restoring missing classes and rosters to Firestore...');
  
  for (const item of missingClasses) {
    const subjects = STANDARD_GRADE_SUBJECTS[item.grade].map(s => ({ isVisible: true, subjectName: s }));
    
    // 1. Restore to 'classes' collection
    const classDocData = {
      id: item.id,
      name: item.name,
      grade: item.grade,
      room: item.room,
      homeroomTeacher: item.homeroomTeacher,
      subjects
    };
    await setDoc(doc(db, 'classes', item.id), classDocData, { merge: true });
    console.log(`[OK] Restored class doc: classes/${item.id}`);

    // 2. Generate 38 students roster
    const roster = generateClassRoster(item.id, 38);
    const maleCount = roster.filter(s => s.gender === 'Nam').length;
    const femaleCount = roster.filter(s => s.gender === 'Nữ').length;
    
    const rosterDocData = {
      className: item.name,
      classKey: item.id,
      totalStudents: roster.length,
      male: maleCount,
      female: femaleCount,
      students: roster,
      updatedAt: new Date().toISOString()
    };

    // Store in both uppercase & lowercase class_rosters keys
    await setDoc(doc(db, 'class_rosters', item.id), rosterDocData, { merge: true });
    await setDoc(doc(db, 'class_rosters', item.id.toLowerCase()), rosterDocData, { merge: true });
    console.log(`[OK] Restored roster doc: class_rosters/${item.id} & class_rosters/${item.id.toLowerCase()} (${roster.length} students)`);
  }

  console.log('All missing classes (1C, 2C, 3C, 4C, 5C) and their rosters successfully restored!');
  process.exit(0);
}

restore().catch(err => {
  console.error('Error restoring classes:', err);
  process.exit(1);
});
