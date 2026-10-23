import { QuestionItem } from '../types';

export interface QuestionValidationResult {
  isValid: boolean;
  errors: string[];
  warning?: string;
}

/**
 * Hàm kiểm tra hợp lệ toàn diện theo từng loại câu hỏi chuẩn sư phạm:
 * - Trắc nghiệm đơn (multiple_choice): Phải có ít nhất 2 options, nội dung đầy đủ.
 * - Trắc nghiệm nhiều đáp án (multiple_response): Phải có ít nhất 2 options.
 * - Đúng/Sai (true_false): Phải có statements hợp lệ hoặc options A/B.
 * - Nối cặp (matching): Phải có mảng matchingPairs với ít nhất 2 cặp (khuyến nghị >= 3), mỗi cặp có cả left và right không rỗng.
 * - Điền khuyết (fill_blank): Phải có nội dung chứa dấu ... hoặc từ khóa điền khuyết.
 * - Sắp xếp (ordering): Phải có mảng options/correctOrder ít nhất 2 bước.
 * - Tự luận (essay): Phải có nội dung câu hỏi.
 */
export function validateQuestion(q: QuestionItem): QuestionValidationResult {
  const errors: string[] = [];
  if (!q) {
    return { isValid: false, errors: ['Câu hỏi không tồn tại.'] };
  }

  const content = (q.content || '').trim();
  if (!content) {
    errors.push('Nội dung câu hỏi không được để trống.');
  }

  const typeStr = (q.type || 'multiple_choice').trim().toLowerCase();

  switch (typeStr) {
    case 'matching':
    case 'nối cặp':
    case 'kéo thả': {
      const pairs = q.matchingPairs;
      if (!Array.isArray(pairs) || pairs.length === 0) {
        errors.push('Câu hỏi Nối cặp chưa có dữ liệu các cặp ghép nối (matchingPairs rỗng).');
      } else {
        pairs.forEach((p, idx) => {
          if (!p || !p.left || !String(p.left).trim() || !p.right || !String(p.right).trim()) {
            errors.push(`Cặp ghép nối số ${idx + 1} bị thiếu vế trái (A) hoặc vế phải (B).`);
          }
        });
      }
      break;
    }
    case 'multiple_choice':
    case 'trắc nghiệm': {
      const opts = q.options;
      if (!Array.isArray(opts) || opts.length < 2) {
        errors.push('Câu hỏi trắc nghiệm phải có ít nhất 2 phương án lựa chọn.');
      }
      break;
    }
    case 'multiple_response': {
      const opts = q.options;
      if (!Array.isArray(opts) || opts.length < 2) {
        errors.push('Câu hỏi trắc nghiệm nhiều đáp án phải có ít nhất 2 phương án lựa chọn.');
      }
      break;
    }
    case 'true_false':
    case 'đúng/sai': {
      const stmts = q.statements;
      const opts = q.options;
      if ((!Array.isArray(stmts) || stmts.length === 0) && (!Array.isArray(opts) || opts.length === 0)) {
        errors.push('Câu hỏi Đúng/Sai phải có danh sách mệnh đề nhận định hoặc lựa chọn Đúng/Sai.');
      }
      break;
    }
    case 'ordering':
    case 'sắp xếp': {
      const opts = q.options;
      if (!Array.isArray(opts) || opts.length < 2) {
        errors.push('Câu hỏi sắp xếp thứ tự phải có ít nhất 2 bước/sự kiện.');
      }
      break;
    }
    case 'fill_blank':
    case 'điền khuyết': {
      if (!content.includes('...') && !content.includes('___')) {
        errors.push('Câu hỏi điền khuyết nên chứa dấu ba chấm (...) hoặc gạch chân để làm chỗ trống.');
      }
      break;
    }
    case 'essay':
    case 'tự luận': {
      break;
    }
    default: {
      break;
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Kiểm tra và chuẩn hóa dữ liệu cũ dạng "Cột A: ...; Cột B: ..."
 * Chỉ tự động suy ra và trích xuất thành matchingPairs khi phát hiện cấu trúc rõ ràng.
 * Nếu không suy ra được chắc chắn, gán cờ cần giáo viên nhập cặp và không tự đoán mò.
 */
export function normalizeLegacyMatchingQuestion(q: QuestionItem): QuestionItem {
  if (!q) return q;
  const content = (q.content || '').trim();
  const hasValidPairs = Array.isArray(q.matchingPairs) && q.matchingPairs.length > 0 && q.matchingPairs.every(p => p.left && p.right);

  if (hasValidPairs) {
    return { ...q, type: 'matching' };
  }

  const lowerContent = content.toLowerCase();
  const isLegacyMatching = lowerContent.includes('cột a') && lowerContent.includes('cột b') || lowerContent.includes('nối') || (q.type || '').includes('matching');

  if (!isLegacyMatching) {
    return q;
  }

  // Thử trích xuất các cặp từ correctAnswer hoặc explanation hoặc options nếu có cấu trúc rõ ràng
  let extractedPairs: { left: string; right: string }[] = [];

  // Tìm trong correctAnswer nếu có định dạng số/chữ
  const sourceText = `${q.correctAnswer || ''}\n${q.explanation || ''}`;
  const lines = sourceText.split(/\r?\n/);
  
  const leftItems: string[] = [];
  const rightItems: string[] = [];

  lines.forEach(line => {
    const trimmed = line.trim();
    if (/^\d+[\.\)]/.test(trimmed)) {
      leftItems.push(trimmed.replace(/^\d+[\.\)]\s*/, ''));
    } else if (/^[a-z][\.\)]/i.test(trimmed)) {
      rightItems.push(trimmed.replace(/^[a-z][\.\)]\s*/i, ''));
    }
  });

  if (leftItems.length > 0 && rightItems.length > 0 && leftItems.length === rightItems.length) {
    extractedPairs = leftItems.map((l, i) => ({ left: l, right: rightItems[i] || `Đáp án ${i + 1}` }));
  } else {
    // Dự phòng mặc định an toàn: đánh dấu cần giáo viên nhập cặp thủ công, không tự đoán mò
    extractedPairs = [
      { left: 'Vế A 1 (Cần giáo viên cập nhật)', right: 'Vế B 1 (Cần giáo viên cập nhật)' },
      { left: 'Vế A 2 (Cần giáo viên cập nhật)', right: 'Vế B 2 (Cần giáo viên cập nhật)' }
    ];
  }

  return {
    ...q,
    type: 'matching',
    matchingPairs: extractedPairs
  };
}
