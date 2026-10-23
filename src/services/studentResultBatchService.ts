import { db } from './firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { normalizeStudentCode } from './studentCode';
import { STUDENT_RESULTS_COLLECTION, StudentResultDocument } from './studentResultService';

/**
 * Lấy danh sách kết quả học tập của tất cả học sinh trong một danh sách Mã HS (studentCodes)
 * Tối ưu hóa: Truy vấn dựa trên studentCode trực tiếp, không dùng sddcn hay tên học sinh.
 */
export async function getStudentResultsBatch(studentCodes: string[]): Promise<Map<string, StudentResultDocument>> {
  const resultMap = new Map<string, StudentResultDocument>();
  if (!Array.isArray(studentCodes) || studentCodes.length === 0 || !db) {
    return resultMap;
  }

  const normalizedCodes = studentCodes.map(c => normalizeStudentCode(c)).filter(Boolean);
  if (normalizedCodes.length === 0) return resultMap;

  try {
    // Firestore giới hạn 'in' query tối đa 10 phần tử một lần, thực hiện chia lô (batching) nếu cần
    const batchSize = 10;
    for (let i = 0; i < normalizedCodes.length; i += batchSize) {
      const chunk = normalizedCodes.slice(i, i + batchSize);
      const q = query(
        collection(db, STUDENT_RESULTS_COLLECTION),
        where('studentCode', 'in', chunk)
      );

      const snap = await getDocs(q);
      snap.forEach(docSnap => {
        const data = docSnap.data() as StudentResultDocument;
        if (data && data.studentCode) {
          resultMap.set(normalizeStudentCode(data.studentCode), data);
        }
      });
    }
  } catch (err) {
    console.warn('Lỗi khi truy vấn batch kết quả học sinh:', err);
  }

  return resultMap;
}
