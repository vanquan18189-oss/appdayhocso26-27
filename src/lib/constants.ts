export const SUBJECTS = ["Toán", "Tiếng Việt", "Tin học", "Công nghệ", "Khoa học", "Lịch sử và Địa lý", "Tiếng Anh", "Đạo đức", "Tự nhiên và Xã hội", "Âm nhạc", "Mỹ thuật", "GDTC", "HĐTN"];
export const GRADES = ["Khối 1", "Khối 2", "Khối 3", "Khối 4", "Khối 5"];
export const CLASSES_BY_GRADE: Record<string, string[]> = {
  "Khối 1": ["Lớp 1C", "Lớp 1D"],
  "Khối 2": ["Lớp 2C", "Lớp 2D"],
  "Khối 3": ["Lớp 3C", "Lớp 3D"],
  "Khối 4": ["Lớp 4C", "Lớp 4D"],
  "Khối 5": ["Lớp 5C", "Lớp 5D"]
};
export const ALL_CLASSES = Object.values(CLASSES_BY_GRADE).flat();
export const EXAM_TYPES = ["Thường xuyên", "Giữa kì 1", "Cuối kì 1", "Giữa kì 2", "Cuối kì 2"];

export function extractGradeDigit(str?: string | number): string {
  if (str === undefined || str === null) return '';
  const match = String(str).match(/\d+/);
  return match ? match[0] : '';
}

export function isGradeMatching(itemGrade?: string | number, filterGrade?: string): boolean {
  if (!filterGrade || filterGrade === 'Tất cả các khối' || filterGrade === 'Tất cả khối' || filterGrade === 'all') return true;
  if (itemGrade === undefined || itemGrade === null) return false;
  const itemStr = String(itemGrade).trim().toLowerCase();
  const filterStr = String(filterGrade).trim().toLowerCase();
  if (itemStr === filterStr) return true;
  const itemDigit = extractGradeDigit(itemStr);
  const filterDigit = extractGradeDigit(filterStr);
  if (itemDigit && filterDigit) return itemDigit === filterDigit;
  return itemStr.includes(filterStr) || filterStr.includes(itemStr);
}

export interface QuestionTypeDefinition {
  id: string;
  label: string;
  aliases: string[];
}

export const QUESTION_TYPES: QuestionTypeDefinition[] = [
  { id: 'multiple_choice', label: 'Trắc nghiệm đơn', aliases: ['trắc nghiệm', 'multiple_choice', 'single_choice', 'trắc nghiệm đơn'] },
  { id: 'multiple_response', label: 'Chọn nhiều đáp án đúng', aliases: ['chọn nhiều đáp án đúng', 'multiple_response', 'multi_choice', 'chọn nhiều đáp án', 'nhiều đáp án'] },
  { id: 'true_false', label: 'Câu hỏi Đúng/Sai', aliases: ['câu hỏi đúng/sai', 'true_false', 'đúng / sai', 'đúng/sai', 'dung_sai'] },
  { id: 'fill_blank', label: 'Điền khuyết / Ngắn', aliases: ['điền khuyết / ngắn', 'fill_blank', 'điền khuyết', 'dien_khuyet', 'ngắn', 'short_answer'] },
  { id: 'ordering', label: 'Sắp xếp thứ tự', aliases: ['sắp xếp thứ tự', 'ordering', 'sắp xếp', 'sap_xep', 'thứ tự'] },
  { id: 'matching', label: 'Nối cặp / Kéo thả', aliases: ['nối cặp / kéo thả', 'matching', 'nối cặp', 'kéo thả', 'noi_cap'] },
  { id: 'classification', label: 'Phân loại', aliases: ['phân loại', 'classification', 'phan_loai', 'nhóm'] },
  { id: 'essay', label: 'Tự luận tự do', aliases: ['tự luận tự do', 'essay', 'tự luận', 'tu_luan'] }
];

export const normalizeQuestionType = (type?: string): string => {
  if (!type) return 'multiple_choice';
  const clean = type.toLowerCase().trim();
  if (
    clean === 'multiple_choice' || 
    clean === 'single_choice' || 
    clean === 'trắc nghiệm đơn' || 
    clean === 'trắc nghiệm' ||
    clean === 'chon_mot_dap_an' ||
    clean.includes('một đáp án')
  ) {
    return 'multiple_choice';
  }
  if (
    clean === 'multiple_response' || 
    clean === 'multi_choice' || 
    clean === 'multiple_choice_multi' || 
    clean === 'multiple_select' ||
    clean.includes('nhiều đáp án') ||
    clean.includes('chọn nhiều')
  ) {
    return 'multiple_response';
  }
  if (
    clean === 'true_false' || 
    clean === 'dung_sai' ||
    clean.includes('đúng/sai') || 
    clean.includes('đúng / sai') || 
    clean.includes('đúng sai')
  ) {
    return 'true_false';
  }
  if (
    clean === 'fill_blank' || 
    clean === 'dien_khuyet' || 
    clean === 'short_answer' || 
    clean.includes('điền khuyết') || 
    clean.includes('ngắn')
  ) {
    return 'fill_blank';
  }
  if (
    clean === 'ordering' || 
    clean === 'sap_xep' || 
    clean.includes('sắp xếp') || 
    clean.includes('thứ tự')
  ) {
    return 'ordering';
  }
  if (
    clean === 'matching' || 
    clean === 'noi_cap' || 
    clean.includes('nối cặp') || 
    clean.includes('kéo thả') || 
    clean.includes('ghép')
  ) {
    return 'matching';
  }
  if (
    clean === 'classification' || 
    clean === 'phan_loai' || 
    clean.includes('phân loại') || 
    clean.includes('nhóm')
  ) {
    return 'classification';
  }
  if (
    clean === 'essay' || 
    clean === 'tu_luan' || 
    clean.includes('tự luận')
  ) {
    return 'essay';
  }
  return 'multiple_choice';
};

export const getDefaultAnswerSchemaByType = (rawType?: string): {
  options?: string[];
  correctAnswer?: string;
  statements?: { statement: string; isCorrect: boolean; explanation?: string }[];
  matchingPairs?: { left: string; right: string }[];
  classificationGroups?: string[];
  classificationItems?: { name: string; group: string }[];
} => {
  const normType = normalizeQuestionType(rawType);
  switch (normType) {
    case 'multiple_choice':
      return {
        options: ['', '', '', ''],
        correctAnswer: 'A',
        statements: undefined,
        matchingPairs: undefined,
        classificationGroups: undefined,
        classificationItems: undefined
      };
    case 'multiple_response':
      return {
        options: ['', '', '', ''],
        correctAnswer: 'A',
        statements: undefined,
        matchingPairs: undefined,
        classificationGroups: undefined,
        classificationItems: undefined
      };
    case 'true_false':
      return {
        statements: [
          { statement: 'Nhận định 1...', isCorrect: true },
          { statement: 'Nhận định 2...', isCorrect: false }
        ],
        options: undefined,
        correctAnswer: undefined,
        matchingPairs: undefined,
        classificationGroups: undefined,
        classificationItems: undefined
      };
    case 'fill_blank':
      return {
        correctAnswer: '',
        options: undefined,
        statements: undefined,
        matchingPairs: undefined,
        classificationGroups: undefined,
        classificationItems: undefined
      };
    case 'ordering':
      return {
        options: ['Bước 1...', 'Bước 2...', 'Bước 3...'],
        correctAnswer: undefined,
        statements: undefined,
        matchingPairs: undefined,
        classificationGroups: undefined,
        classificationItems: undefined
      };
    case 'matching':
      return {
        matchingPairs: [
          { left: 'Vế A 1...', right: 'Vế B 1...' },
          { left: 'Vế A 2...', right: 'Vế B 2...' }
        ],
        options: undefined,
        correctAnswer: undefined,
        statements: undefined,
        classificationGroups: undefined,
        classificationItems: undefined
      };
    case 'classification':
      return {
        classificationGroups: ['Nhóm 1', 'Nhóm 2'],
        classificationItems: [
          { name: 'Mục 1', group: 'Nhóm 1' },
          { name: 'Mục 2', group: 'Nhóm 2' }
        ],
        options: undefined,
        correctAnswer: undefined,
        statements: undefined,
        matchingPairs: undefined
      };
    case 'essay':
      return {
        correctAnswer: '',
        options: undefined,
        statements: undefined,
        matchingPairs: undefined,
        classificationGroups: undefined,
        classificationItems: undefined
      };
    default:
      return {
        options: ['', '', '', ''],
        correctAnswer: 'A',
        statements: undefined,
        matchingPairs: undefined,
        classificationGroups: undefined,
        classificationItems: undefined
      };
  }
};

export const purgeStaleQuestionAnswerFields = (q: any, targetType?: string): any => {
  if (!q || typeof q !== 'object') return q;
  const normType = normalizeQuestionType(targetType || q.type);
  const cleaned: any = { ...q, type: normType };

  if (normType !== 'multiple_choice' && normType !== 'multiple_response' && normType !== 'ordering') {
    delete cleaned.options;
  }
  if (normType !== 'multiple_choice' && normType !== 'multiple_response' && normType !== 'fill_blank' && normType !== 'essay') {
    delete cleaned.correctAnswer;
  }
  if (normType !== 'true_false') {
    delete cleaned.statements;
  }
  if (normType !== 'matching') {
    delete cleaned.matchingPairs;
    delete cleaned.pairs;
  }
  if (normType !== 'classification') {
    delete cleaned.classificationGroups;
    delete cleaned.classificationItems;
  }
  if (normType !== 'ordering') {
    delete cleaned.order;
    delete cleaned.indices;
    delete cleaned.correctOrder;
  }
  return cleaned;
};

export const resetQuestionType = (targetTypeOrQuestion?: any, newType?: string): any => {
  if (typeof targetTypeOrQuestion === 'object' && targetTypeOrQuestion !== null) {
    const targetType = normalizeQuestionType(newType || targetTypeOrQuestion.type);
    const cleaned = purgeStaleQuestionAnswerFields(targetTypeOrQuestion, targetType);
    const defaults = getDefaultAnswerSchemaByType(targetType);
    return {
      ...cleaned,
      ...defaults,
      type: targetType
    };
  }
  const normType = normalizeQuestionType(targetTypeOrQuestion || newType);
  return getDefaultAnswerSchemaByType(normType);
};

export const getDefaultAnswerDataForType = (rawTypeOrQuestion?: any, _q?: any): any => {
  const t = typeof rawTypeOrQuestion === 'object' && rawTypeOrQuestion !== null ? rawTypeOrQuestion.type : rawTypeOrQuestion;
  return getDefaultAnswerSchemaByType(t);
};

export const sanitizeQuestionForFirestore = (q: any): any => {
  if (!q) return q;
  const normType = normalizeQuestionType(q.type);
  
  const base: any = {
    id: q.id,
    type: normType,
    content: q.content || '',
    explanation: q.explanation || '',
    level: q.level || 'nhan_biet'
  };

  if (q.code) base.code = q.code;
  if (q.subject) base.subject = q.subject;
  if (q.grade) base.grade = q.grade;
  if (q.lessonName) base.lessonName = q.lessonName;
  if (q.imageUrl) base.imageUrl = q.imageUrl;
  if (q.imagePrompt) base.imagePrompt = q.imagePrompt;
  if (q.authorName) base.authorName = q.authorName;
  if (q.authorType) base.authorType = q.authorType;
  if (q.teacherId) base.teacherId = q.teacherId;
  if (q.teacherName) base.teacherName = q.teacherName;
  if (q.teacherEmail) base.teacherEmail = q.teacherEmail;
  if (q.createdBy) base.createdBy = q.createdBy;
  if (q.createdAt) base.createdAt = q.createdAt;
  if (q.score !== undefined) base.score = q.score;
  if (q.points !== undefined) base.points = q.points;

  switch (normType) {
    case 'multiple_choice':
      base.options = Array.isArray(q.options) && q.options.length > 0 ? q.options : ['', '', '', ''];
      base.correctAnswer = typeof q.correctAnswer === 'string' && q.correctAnswer.trim() ? q.correctAnswer.trim() : 'A';
      break;
    case 'multiple_response':
      base.options = Array.isArray(q.options) && q.options.length > 0 ? q.options : ['', '', '', ''];
      base.correctAnswer = Array.isArray(q.correctAnswer) ? q.correctAnswer.join(',') : (q.correctAnswer || 'A');
      break;
    case 'true_false':
      base.statements = Array.isArray(q.statements) && q.statements.length > 0
        ? q.statements.map((s: any) => ({
            statement: s.statement || '',
            isCorrect: Boolean(s.isCorrect),
            ...(s.explanation ? { explanation: s.explanation } : {})
          }))
        : [
            { statement: 'Nhận định 1...', isCorrect: true },
            { statement: 'Nhận định 2...', isCorrect: false }
          ];
      break;
    case 'fill_blank':
      base.correctAnswer = typeof q.correctAnswer === 'string' ? q.correctAnswer : '';
      break;
    case 'ordering': {
      const opts = Array.isArray(q.options) && q.options.length > 0 
        ? q.options.map((item: any) => String(item || '').trim()).filter(Boolean)
        : ['Bước 1...', 'Bước 2...', 'Bước 3...'];
      base.options = opts;
      base.correctAnswer = opts.map((opt: string, i: number) => `${i + 1}. ${opt}`).join(' -> ');
      break;
    }
    case 'matching':
      base.matchingPairs = Array.isArray(q.matchingPairs) && q.matchingPairs.length > 0
        ? q.matchingPairs.map((p: any) => ({ left: p.left || '', right: p.right || '' }))
        : [
            { left: 'Vế A 1...', right: 'Vế B 1...' },
            { left: 'Vế A 2...', right: 'Vế B 2...' }
          ];
      break;
    case 'classification':
      base.classificationGroups = Array.isArray(q.classificationGroups) && q.classificationGroups.length > 0
        ? q.classificationGroups
        : ['Nhóm 1', 'Nhóm 2'];
      base.classificationItems = Array.isArray(q.classificationItems) && q.classificationItems.length > 0
        ? q.classificationItems.map((item: any) => ({ name: item.name || '', group: item.group || base.classificationGroups[0] }))
        : [{ name: 'Mục 1', group: base.classificationGroups[0] }];
      break;
    case 'essay':
      base.correctAnswer = typeof q.correctAnswer === 'string' ? q.correctAnswer : '';
      break;
    default:
      base.options = Array.isArray(q.options) && q.options.length > 0 ? q.options : ['', '', '', ''];
      base.correctAnswer = typeof q.correctAnswer === 'string' ? q.correctAnswer : 'A';
      break;
  }

  return base;
};

export const getQuestionTypeLabel = (type?: string): string => {
  if (!type) return 'Trắc nghiệm đơn';
  const clean = type.toLowerCase().trim();
  const found = QUESTION_TYPES.find(qt => 
    qt.id === clean || qt.label.toLowerCase() === clean || qt.aliases.some(a => a.toLowerCase() === clean)
  );
  return found ? found.label : type;
};

export const matchesQuestionType = (questionType: string | undefined, filterType: string): boolean => {
  if (!filterType || filterType === 'all') return true;
  if (!questionType) return false;
  
  const cleanQType = questionType.toLowerCase().trim();
  const cleanFilter = filterType.toLowerCase().trim();
  
  const targetDef = QUESTION_TYPES.find(qt => qt.id === cleanFilter || qt.label.toLowerCase() === cleanFilter);
  if (!targetDef) return cleanQType === cleanFilter;
  
  return (
    cleanQType === targetDef.id ||
    cleanQType === targetDef.label.toLowerCase() ||
    targetDef.aliases.some(a => a.toLowerCase() === cleanQType)
  );
};

export const isMultipleResponse = (type?: string): boolean => {
  if (!type) return false;
  const clean = type.toLowerCase().trim();
  return clean === 'multiple_response' || clean.includes('nhiều') || clean === 'multi_choice' || clean === 'multiple_select';
};

/**
 * Trích xuất và chuẩn hóa thứ tự các bước đáp án đúng cho câu hỏi dạng Ordering (Sắp xếp thứ tự).
 * Tuyệt đối tách biệt giữa mảng hiển thị options và mảng đáp án chuẩn correctOrder.
 * Căn cứ xác định thứ tự chuẩn theo độ ưu tiên:
 * 1. Phân tích chuỗi các bước trong explanation / gợi ý giải (ví dụ: "(C) -> (A) -> (B)")
 * 2. Phân tích chuỗi quy trình trong correctAnswer (ví dụ: "B -> D -> C -> A", "C -> A -> B")
 * 3. Mảng correctOrder được lưu rõ ràng (mảng ký tự ['C','A','B'] hoặc mảng chuỗi)
 * 4. Mảng options hiện hành nếu đã được giáo viên sắp xếp đúng
 */
export const getCorrectOrderingSequence = (q: any): string[] => {
  if (!q) return [];
  const rawOptions: string[] = Array.isArray(q.options) 
    ? q.options.map((o: any) => String(o || '').trim()).filter(Boolean)
    : [];
  if (rawOptions.length === 0) return [];

  // Helper tìm option theo ký tự ('A', 'B', 'C', 'D'...)
  const findOptionByLetter = (letter: string): string | null => {
    const l = letter.trim().toUpperCase();
    // Khớp option bắt đầu bằng 'A.', 'A)', 'A:', 'A -',...
    const byPrefix = rawOptions.find(opt => {
      const m = opt.match(/^([A-Z0-9])[\.\:\)\-\s]/i);
      return m && m[1].toUpperCase() === l;
    });
    if (byPrefix) return byPrefix;

    // Khớp theo index (A=0, B=1, C=2, D=3,...)
    const idx = l.charCodeAt(0) - 65;
    if (idx >= 0 && idx < rawOptions.length) {
      return rawOptions[idx];
    }
    return null;
  };

  // Helper khớp option theo chuỗi nội dung không dấu
  const findOptionByContent = (str: string): string | null => {
    const cleanTarget = str
      .replace(/^(\d+[\.\:\)\-]\s*)+/i, '')
      .replace(/^(bước|step)\s*\d+[\:\.\-]?\s*/i, '')
      .replace(/^[A-Z][\.\:\)\-]\s*/i, '')
      .trim()
      .toLowerCase();
    if (!cleanTarget) return null;

    const matched = rawOptions.find(opt => {
      const cleanOpt = opt
        .replace(/^(\d+[\.\:\)\-]\s*)+/i, '')
        .replace(/^(bước|step)\s*\d+[\:\.\-]?\s*/i, '')
        .replace(/^[A-Z][\.\:\)\-]\s*/i, '')
        .trim()
        .toLowerCase();
      return cleanOpt.includes(cleanTarget) || cleanTarget.includes(cleanOpt);
    });
    return matched || null;
  };

  // 1. Phân tích explanation / gợi ý giải nếu có chuỗi mũi tên và ký hiệu bước
  if (typeof q.explanation === 'string' && q.explanation.trim()) {
    const exp = q.explanation;
    if (exp.includes('->') || exp.includes('➔') || exp.includes('→') || exp.includes('-->')) {
      const parts = exp.split(/\s*(?:->|➔|→|-->)\s*/);
      const extractedLetters: string[] = [];
      for (const part of parts) {
        const m = part.match(/\(([A-Z0-9])\)/i) || 
                  part.match(/(?:bước|step)\s*\d+[\:\.\-]?\s*.*?\(([A-Z0-9])\)/i) || 
                  part.match(/\b([A-D])\b/i);
        if (m) {
          extractedLetters.push(m[1].toUpperCase());
        }
      }
      if (extractedLetters.length === rawOptions.length) {
        const unique = new Set(extractedLetters);
        if (unique.size === rawOptions.length) {
          const matchedOpts = extractedLetters.map(findOptionByLetter).filter(Boolean) as string[];
          if (matchedOpts.length === rawOptions.length) {
            return matchedOpts;
          }
        }
      }
    }
  }

  // 2. Phân tích correctAnswer nếu được cấu hình
  if (q.correctAnswer) {
    // 2a. correctAnswer là chuỗi có định dạng quy trình (ví dụ: 'B -> D -> C -> A' hoặc 'C -> A -> B' hoặc '1. C...\n2. A...')
    if (typeof q.correctAnswer === 'string' && q.correctAnswer.trim()) {
      const ca = q.correctAnswer.trim();
      
      // Định dạng phân tách mũi tên hoặc dấu phẩy
      if (ca.includes('->') || ca.includes('➔') || ca.includes('→') || ca.includes(',')) {
        const parts = ca.split(/\s*(?:->|➔|→|,)\s*/).map((s: string) => s.trim().toUpperCase());
        if (parts.length === rawOptions.length) {
          const matched = parts.map(findOptionByLetter).filter(Boolean) as string[];
          if (matched.length === rawOptions.length && new Set(matched).size === rawOptions.length) {
            return matched;
          }
        }
      }

      // Định dạng phân tách xuống dòng: "1. C...\n2. A...\n3. B..."
      if (ca.includes('\n')) {
        const lines = ca.split('\n').map((l: string) => l.trim()).filter(Boolean);
        if (lines.length === rawOptions.length) {
          const lineLetters = lines.map((l: string) => {
            const m = l.match(/^\d+[\.\:\)\-]\s*([A-Z0-9])[\.\:\)\-]/i) || l.match(/^([A-Z0-9])[\.\:\)\-]/i);
            return m ? m[1].toUpperCase() : null;
          }).filter(Boolean) as string[];

          if (lineLetters.length === rawOptions.length && new Set(lineLetters).size === rawOptions.length) {
            // Kiểm tra xem thứ tự các chữ cái có khác A, B, C ban đầu không
            const isDifferentFromDefault = lineLetters.some((l, i) => l.charCodeAt(0) - 65 !== i);
            if (isDifferentFromDefault) {
              const matched = lineLetters.map(findOptionByLetter).filter(Boolean) as string[];
              if (matched.length === rawOptions.length) return matched;
            }
          }

          // Thử khớp theo nội dung từng dòng
          const matchedByContent = lines.map(findOptionByContent).filter(Boolean) as string[];
          if (matchedByContent.length === rawOptions.length && new Set(matchedByContent).size === rawOptions.length) {
            return matchedByContent;
          }
        }
      }
    }

    // 2b. correctAnswer là mảng chuỗi hoặc mảng số index
    if (Array.isArray(q.correctAnswer) && q.correctAnswer.length === rawOptions.length) {
      if (q.correctAnswer.every((item: any) => typeof item === 'string')) {
        const letters = q.correctAnswer.map((s: string) => s.trim().toUpperCase());
        if (letters.every((l: string) => l.length === 1 && l >= 'A' && l <= 'Z')) {
          const matched = letters.map(findOptionByLetter).filter(Boolean) as string[];
          if (matched.length === rawOptions.length) return matched;
        }
        return q.correctAnswer.map((item: any) => String(item).trim());
      }
      if (q.correctAnswer.every((item: any) => typeof item === 'number')) {
        const nums: number[] = q.correctAnswer;
        const minVal = Math.min(...nums);
        const maxVal = Math.max(...nums);
        if (minVal >= 1 && maxVal <= rawOptions.length) {
          return nums.map(n => rawOptions[n - 1]).filter(Boolean);
        }
        if (minVal >= 0 && maxVal < rawOptions.length) {
          return nums.map(n => rawOptions[n]).filter(Boolean);
        }
      }
    }
  }

  // 3. Phân tích correctOrder
  if (Array.isArray(q.correctOrder) && q.correctOrder.length === rawOptions.length) {
    // Nếu correctOrder là mảng ký tự ['C', 'A', 'B']
    if (q.correctOrder.every((item: any) => typeof item === 'string' && item.trim().length <= 2)) {
      const mapped = q.correctOrder.map((l: any) => findOptionByLetter(String(l))).filter(Boolean) as string[];
      if (mapped.length === rawOptions.length && new Set(mapped).size === rawOptions.length) {
        return mapped;
      }
    }
    // Nếu correctOrder là mảng chuỗi đầy đủ và khác rawOptions
    const isDifferent = q.correctOrder.some((item: any, i: number) => String(item).trim() !== rawOptions[i]);
    if (isDifferent) {
      return q.correctOrder.map((item: any) => String(item).trim());
    }
  }

  // 4. Mặc định dùng mảng options hiện hành (nếu giáo viên đã sắp xếp trực tiếp trong editor)
  return rawOptions;
};

export const extractTrueOrderingFromQuestion = (q: any): string[] => {
  return getCorrectOrderingSequence(q);
};


