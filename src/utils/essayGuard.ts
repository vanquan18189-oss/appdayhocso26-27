/**
 * Tiện ích kiểm tra và bảo vệ câu trả lời tự luận (Essay Guard).
 * Viết bằng TypeScript thuần, chạy cục bộ 100% không gọi AI.
 *
 * Mục đích: Phát hiện và loại bỏ các câu trả lời vô nghĩa (spam, gõ phím ngẫu nhiên,
 * sao chép đề bài, ký tự lặp rác) trước hoặc trong quy trình chấm bài.
 */

export interface EssayGuardOptions {
  /**
   * Số từ tối thiểu khi câu hỏi yêu cầu trả lời thành câu giải thích / lý do.
   * Mặc định: 3 từ.
   */
  minWords?: number;

  /**
   * Bắt buộc kiểm tra độ dài câu theo số từ tối thiểu (bỏ qua nhận diện tự động từ câu hỏi).
   * Mặc định: false (tự nhận diện qua các từ khóa trong câu hỏi như 'tại sao', 'hãy giải thích'...).
   */
  requireSentence?: boolean;

  /**
   * Ngưỡng trùng lặp giữa câu trả lời và câu hỏi (0.0 đến 1.0) để xác định hành vi chép đề.
   * Mặc định: 0.90 (90%).
   */
  similarityThreshold?: number;

  /**
   * Danh sách từ khóa thuật ngữ hoặc tiếng Anh bổ sung được coi là hợp lệ.
   */
  additionalWhitelist?: string[];
}

export interface EssayValidationResult {
  invalid: boolean;
  reason: string;
}

/**
 * Danh mục thuật ngữ công nghệ, tiếng Anh thông dụng trong môn học (Tin học, Ngoại ngữ, KHTN).
 * Được coi là từ hợp lệ dù không theo quy tắc âm tiết tiếng Việt thuần túy.
 */
const COMMON_TECH_WHITELIST = new Set<string>([
  // Phần cứng & thiết bị
  'usb', 'cpu', 'ram', 'rom', 'pc', 'laptop', 'mouse', 'keyboard', 'monitor', 'screen',
  'cd', 'dvd', 'hardware', 'port', 'mic', 'loa', 'cam', 'webcam', 'wifi', 'bluetooth',
  // Phần mềm & ứng dụng
  'app', 'web', 'website', 'online', 'link', 'file', 'folder', 'icon', 'windows',
  'word', 'excel', 'powerpoint', 'paint', 'scratch', 'browser', 'google', 'drive',
  'doc', 'docs', 'sheet', 'sheets', 'slide', 'slides', 'classroom', 'eduplay',
  'youtube', 'video', 'audio', 'software', 'email', 'mail', 'pass', 'password',
  // Lập trình & thuật ngữ
  'code', 'coding', 'data', 'robot', 'chat', 'bot', 'click', 'enter', 'delete',
  'shift', 'ctrl', 'alt', 'caps', 'lock', 'esc', 'backspace', 'tab', 'save',
  'print', 'copy', 'paste', 'cut', 'open', 'close', 'new', 'edit', 'view',
  'smart', 'tech', 'stem', 'steam', 'ai', 'it', 'bit', 'byte', 'kb', 'mb', 'gb', 'tb'
]);

/**
 * Tập nguyên âm tiếng Việt (cả hoa, thường và có dấu)
 */
const VIETNAMESE_VOWELS = new Set<string>([
  'a', 'à', 'á', 'ả', 'ã', 'ạ',
  'ă', 'ằ', 'ắ', 'ẳ', 'ẵ', 'ặ',
  'â', 'ầ', 'ấ', 'ẩ', 'ẫ', 'ậ',
  'e', 'è', 'é', 'ẻ', 'ẽ', 'ẹ',
  'ê', 'ề', 'ế', 'ể', 'ễ', 'ệ',
  'i', 'ì', 'í', 'ỉ', 'ĩ', 'ị',
  'o', 'ò', 'ó', 'ỏ', 'õ', 'ọ',
  'ô', 'ồ', 'ố', 'ổ', 'ỗ', 'ộ',
  'ơ', 'ờ', 'ớ', 'ở', 'ỡ', 'ợ',
  'u', 'ù', 'ú', 'ủ', 'ũ', 'ụ',
  'ư', 'ừ', 'ứ', 'ử', 'ữ', 'ự',
  'y', 'ỳ', 'ý', 'ỷ', 'ỹ', 'ỵ'
]);

/**
 * Tập phụ âm hợp lệ trong âm tiết tiếng Việt:
 * - Phụ âm đầu đơn & ghép: b, c, d, đ, g, h, k, l, m, n, p, r, s, t, v, x, ch, gh, gi, kh, nh, ng, ngh, ph, qu, th, tr
 * - Phụ âm cuối: c, ch, m, n, ng, nh, p, t
 */
const VALID_INITIAL_CONSONANTS = new Set<string>([
  'b', 'c', 'd', 'đ', 'g', 'h', 'k', 'l', 'm', 'n', 'p', 'r', 's', 't', 'v', 'x',
  'ch', 'gh', 'gi', 'kh', 'nh', 'ng', 'ngh', 'ph', 'qu', 'th', 'tr'
]);

const VALID_FINAL_CONSONANTS = new Set<string>([
  'c', 'ch', 'm', 'n', 'ng', 'nh', 'p', 't'
]);

/**
 * Các chuỗi phím bấm liền nhau phổ biến trên bàn phím QWERTY (gõ phím ngẫu nhiên / mashing)
 */
const KEYBOARD_WALK_PATTERNS = [
  'asdf', 'qwer', 'zxcv', 'hjkl', 'ghjk', 'dfgh', 'erty', 'tyui', 'yuio', 'uiop',
  'cvbn', 'vbnm', 'fdsa', 'rewq', 'vcxz', 'lkjh', 'kjhg', 'jhgf', 'jhjh', 'jkjk',
  'hjk', 'ghj', 'jkl', 'asd', 'sdf', 'dfg', 'fgh', 'qwe', 'wer', 'ert', 'zxc', 'xcv'
];

/**
 * Chuẩn hóa chuỗi văn bản: xóa khoảng trắng thừa đầu đuôi và rút gọn khoảng trắng giữa các từ.
 */
function normalizeSpaces(text: string): string {
  return (text || '').trim().replace(/\s+/g, ' ');
}

/**
 * Bỏ dấu tiếng Việt phục vụ so khớp cơ bản không phụ thuộc dấu
 */
function removeVietnameseDiacritics(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

/**
 * Kiểm tra xem một từ đơn có phải là âm tiết tiếng Việt hợp lệ hay không.
 */
function isValidVietnameseSyllable(word: string, customWhitelist?: Set<string>): boolean {
  const cleanWord = word.trim().toLowerCase();
  if (!cleanWord) return false;

  // 1. Kiểm tra từ điển thuật ngữ / tiếng Anh thông dụng
  if (COMMON_TECH_WHITELIST.has(cleanWord) || customWhitelist?.has(cleanWord)) {
    return true;
  }

  // 2. Chữ số đơn thuần hoặc số thứ tự (ví dụ: '1', '2a', '10')
  if (/^\d+[a-z]?$/i.test(cleanWord)) {
    return true;
  }

  // 3. Phải chứa ít nhất 1 nguyên âm
  let hasVowel = false;
  for (const char of cleanWord) {
    if (VIETNAMESE_VOWELS.has(char)) {
      hasVowel = true;
      break;
    }
  }
  if (!hasVowel) {
    return false;
  }

  // 4. Phát hiện các cụm phụ âm bất thường không tồn tại trong ngữ âm tiếng Việt
  const deaccented = removeVietnameseDiacritics(cleanWord);
  const impossibleClusters = [
    'jh', 'jk', 'kj', 'hj', 'ghj', 'df', 'fg', 'sd', 'zx', 'xc', 'vb', 'bn', 'nm',
    'qk', 'qp', 'qw', 'qe', 'qr', 'qt', 'qy', 'kl', 'lk', 'lp', 'pl', 'mr', 'nr',
    'rb', 'rt', 'rk', 'rj', 'bb', 'cc', 'dd', 'ff', 'gg', 'hh', 'jj', 'kk', 'll',
    'mm', 'nn', 'pp', 'qq', 'rr', 'ss', 'tt', 'vv', 'xx', 'zz'
  ];
  for (const cluster of impossibleClusters) {
    if (deaccented.includes(cluster)) {
      return false;
    }
  }

  // 5. Tách và kiểm tra cấu trúc cơ bản: [Phụ âm đầu] + [Vần nguyên âm] + [Phụ âm cuối]
  // Tìm vị trí nguyên âm đầu tiên và nguyên âm cuối cùng
  let firstVowelIdx = -1;
  let lastVowelIdx = -1;
  for (let i = 0; i < cleanWord.length; i++) {
    if (VIETNAMESE_VOWELS.has(cleanWord[i])) {
      if (firstVowelIdx === -1) firstVowelIdx = i;
      lastVowelIdx = i;
    }
  }

  const initialConsonant = cleanWord.substring(0, firstVowelIdx);
  const finalConsonant = cleanWord.substring(lastVowelIdx + 1);

  if (initialConsonant && !VALID_INITIAL_CONSONANTS.has(initialConsonant)) {
    // Cho phép một số ngoại lệ viết tắt chữ cái hoa hoặc từ mượn phổ biến
    if (initialConsonant.length > 3) return false;
  }

  if (finalConsonant && !VALID_FINAL_CONSONANTS.has(finalConsonant)) {
    // Nếu có phụ âm cuối không nằm trong tập hợp hợp lệ
    return false;
  }

  return true;
}

/**
 * Tính toán độ tương đồng giữa hai chuỗi văn bản (dựa trên Bigram Dice Coefficient)
 * Trả về giá trị từ 0.0 (hoàn toàn khác) đến 1.0 (trùng khớp tuyệt đối).
 */
function calculateTextSimilarity(str1: string, str2: string): number {
  const s1 = removeVietnameseDiacritics(str1.toLowerCase().replace(/[\p{P}\p{S}\s]+/gu, ''));
  const s2 = removeVietnameseDiacritics(str2.toLowerCase().replace(/[\p{P}\p{S}\s]+/gu, ''));

  if (!s1 || !s2) return 0;
  if (s1 === s2) return 1.0;
  if (s1.includes(s2) && s2.length >= s1.length * 0.9) return 0.95;
  if (s2.includes(s1) && s1.length >= s2.length * 0.9) return 0.95;

  if (s1.length < 2 || s2.length < 2) return 0;

  const getBigrams = (str: string) => {
    const bigrams = new Map<string, number>();
    for (let i = 0; i < str.length - 1; i++) {
      const bigram = str.substring(i, i + 2);
      bigrams.set(bigram, (bigrams.get(bigram) || 0) + 1);
    }
    return bigrams;
  };

  const bg1 = getBigrams(s1);
  const bg2 = getBigrams(s2);

  let intersection = 0;
  bg1.forEach((count, bigram) => {
    if (bg2.has(bigram)) {
      intersection += Math.min(count, bg2.get(bigram)!);
    }
  });

  const total = (s1.length - 1) + (s2.length - 1);
  return total > 0 ? (2.0 * intersection) / total : 0;
}

/**
 * Kiểm tra xem câu hỏi có chứa yêu cầu trả lời thành câu văn trọn vẹn / giải thích hay không.
 */
function isExplanatoryQuestion(questionText: string): boolean {
  if (!questionText) return false;
  const qLower = questionText.toLowerCase();
  return (
    qLower.includes('tại sao') ||
    qLower.includes('vì sao') ||
    qLower.includes('hãy giải thích') ||
    qLower.includes('giải thích vì sao') ||
    qLower.includes('trình bày') ||
    qLower.includes('nêu ý kiến') ||
    qLower.includes('nêu cảm nghĩ') ||
    qLower.includes('hãy viết câu') ||
    qLower.includes('viết đoạn văn') ||
    qLower.includes('nêu các bước') ||
    qLower.includes('em hiểu thế nào')
  );
}

/**
 * HÀM CHÍNH: Kiểm tra tính vô nghĩa của câu trả lời tự luận.
 *
 * @param answer Nội dung học sinh đã nhập
 * @param question Nội dung câu hỏi của đề bài
 * @param options Cấu hình tùy chọn (ngưỡng từ, whitelist, kiểm tra câu...)
 * @returns { invalid: boolean, reason: string }
 */
export function isMeaninglessAnswer(
  answer: string,
  question: string = '',
  options?: EssayGuardOptions
): EssayValidationResult {
  const cleanAnswer = normalizeSpaces(answer);
  const normLower = cleanAnswer.toLowerCase();

  // -------------------------------------------------------------------------
  // QUY TẮC 1: Rỗng, hoặc chỉ gồm khoảng trắng, dấu câu, chữ số
  // -------------------------------------------------------------------------
  if (!cleanAnswer || cleanAnswer.length === 0) {
    return {
      invalid: true,
      reason: 'Bài làm để trống hoặc chỉ chứa khoảng trắng.'
    };
  }

  // Tách riêng các ký tự chữ cái (hỗ trợ Unicode tiếng Việt đầy đủ)
  const lettersOnly = normLower.replace(/[\d\s\p{P}\p{S}]/gu, '');
  if (lettersOnly.length === 0) {
    return {
      invalid: true,
      reason: 'Bài làm không chứa chữ cái, chỉ gồm ký tự số hoặc dấu câu đặc biệt.'
    };
  }

  // -------------------------------------------------------------------------
  // QUY TẮC 3: Một ký tự lặp từ 4 lần liên tiếp trở lên (ví dụ: aaaa, hhhh, xxxx)
  // -------------------------------------------------------------------------
  if (/(.)\1{3,}/u.test(normLower)) {
    return {
      invalid: true,
      reason: 'Bài làm chứa ký tự lặp lại bất thường liên tiếp từ 4 lần trở lên.'
    };
  }

  // -------------------------------------------------------------------------
  // QUY TẮC 4: Lặp một cụm ngắn từ 2 đến 4 ký tự nhiều lần (jhjhjh, asdasd, hjkhjk)
  // -------------------------------------------------------------------------
  // Lặp cụm 2-4 ký tự từ 3 lần trở lên liên tục (ví dụ: jhjhjh, abcabcabc)
  if (/(.{2,4})\1{2,}/i.test(normLower)) {
    return {
      invalid: true,
      reason: 'Bài làm lặp lại liên tục một cụm ký tự ngắn từ 3 lần trở lên.'
    };
  }

  // Lặp cụm 3-4 ký tự 2 lần trong 1 từ đơn không có khoảng trắng (ví dụ: asdasd, hjkhjk)
  const singleTokens = normLower.split(/\s+/);
  for (const token of singleTokens) {
    if (token.length >= 6 && /^(.{3,4})\1+$/i.test(token)) {
      return {
        invalid: true,
        reason: 'Chứa từ gõ lặp lại cụm ký tự vô nghĩa (như asdasd, hjkhjk).'
      };
    }
  }

  // -------------------------------------------------------------------------
  // QUY TẮC 5: Chuỗi gõ phím ngẫu nhiên (mashing: asdf, qwer, zxcv, jkl, hjk, ghj)
  // -------------------------------------------------------------------------
  const customWhitelist = options?.additionalWhitelist ? new Set(options.additionalWhitelist.map(w => w.toLowerCase())) : undefined;

  for (const pattern of KEYBOARD_WALK_PATTERNS) {
    // Chỉ kiểm tra chuỗi mashing nếu nó nằm trong từ không thuộc whitelist
    for (const token of singleTokens) {
      if (token.includes(pattern) && !COMMON_TECH_WHITELIST.has(token) && !customWhitelist?.has(token)) {
        // Nếu từ đó không có nguyên âm hoặc chứa chuỗi mashing từ 4 ký tự
        if (pattern.length >= 4 || !/[aeiouyáàảãạăắằẳẵặâấầẩẫậéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵ]/i.test(token)) {
          return {
            invalid: true,
            reason: `Bài làm chứa chuỗi gõ phím ngẫu nhiên liên tiếp trên bàn phím ("${pattern}").`
          };
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // QUY TẮC 6: Có ít hơn 3 ký tự khác nhau trên tổng độ dài từ 5 ký tự trở lên
  // -------------------------------------------------------------------------
  if (lettersOnly.length >= 5) {
    const distinctChars = new Set(lettersOnly.split(''));
    if (distinctChars.size < 3) {
      return {
        invalid: true,
        reason: 'Bài làm có độ dài từ 5 ký tự trở lên nhưng chứa ít hơn 3 ký tự khác nhau.'
      };
    }
  }

  // -------------------------------------------------------------------------
  // QUY TẮC 2: Dưới 3 từ khi câu hỏi yêu cầu trả lời thành câu
  // -------------------------------------------------------------------------
  const words = normLower
    .split(/[\s\p{P}]+/u)
    .filter(w => w.length > 0 && !/^\d+$/.test(w));

  const minWordsRequired = options?.minWords ?? 3;
  const requireSentence = options?.requireSentence ?? isExplanatoryQuestion(question);

  if (requireSentence && words.length < minWordsRequired) {
    return {
      invalid: true,
      reason: `Câu hỏi yêu cầu giải thích/trình bày nhưng câu trả lời quá ngắn (dưới ${minWordsRequired} từ).`
    };
  }

  // -------------------------------------------------------------------------
  // QUY TẮC 7: Từ 50% số từ trở lên không phải âm tiết tiếng Việt hợp lệ
  // -------------------------------------------------------------------------
  if (words.length > 0) {
    let invalidSyllablesCount = 0;
    for (const word of words) {
      if (!isValidVietnameseSyllable(word, customWhitelist)) {
        invalidSyllablesCount++;
      }
    }

    const invalidRatio = invalidSyllablesCount / words.length;
    if (invalidRatio >= 0.5) {
      return {
        invalid: true,
        reason: 'Có từ 50% số từ trở lên không phải là âm tiết tiếng Việt hoặc thuật ngữ hợp lệ.'
      };
    }
  }

  // -------------------------------------------------------------------------
  // QUY TẮC 8: Chép nguyên văn câu hỏi làm câu trả lời (độ giống từ 90% trở lên)
  // -------------------------------------------------------------------------
  if (question && question.trim().length > 10) {
    const similarityThresh = options?.similarityThreshold ?? 0.90;
    const similarity = calculateTextSimilarity(cleanAnswer, question);
    if (similarity >= similarityThresh) {
      return {
        invalid: true,
        reason: `Bài làm sao chép lại nguyên văn câu hỏi của đề bài (độ tương đồng đạt ${Math.round(similarity * 100)}%).`
      };
    }
  }

  // Vượt qua tất cả các chốt chặn -> Hợp lệ
  return {
    invalid: false,
    reason: 'Câu trả lời đạt chuẩn cấu trúc ngôn ngữ hợp lệ.'
  };
}

/* =========================================================================
 * BỘ 15 VÍ DỤ KIỂM THỬ (TEST CASES) THEO YÊU CẦU
 * =========================================================================
 *
 * --- [8 BÀI VÔ NGHĨA PHẢI BỊ CHẶN (invalid = true)] ---
 * 1. isMeaninglessAnswer("jhjhjjkj", "Em hãy nêu tác dụng của cây thư mục")
 *    => { invalid: true, reason: '...chuỗi gõ phím ngẫu nhiên / không phải âm tiết tiếng Việt...' }
 *
 * 2. isMeaninglessAnswer("asdfgh", "Tại sao cần đặt tên tệp rõ ràng?")
 *    => { invalid: true, reason: '...chuỗi gõ phím ngẫu nhiên trên bàn phím ("asdf")...' }
 *
 * 3. isMeaninglessAnswer("aaaaa", "Hãy giải thích sự khác nhau giữa tệp và thư mục")
 *    => { invalid: true, reason: '...ký tự lặp lại bất thường liên tiếp từ 4 lần trở lên...' }
 *
 * 4. isMeaninglessAnswer("asdasd", "Nêu các bước sao chép tệp")
 *    => { invalid: true, reason: '...lặp lại cụm ký tự vô nghĩa (như asdasd)...' }
 *
 * 5. isMeaninglessAnswer("..... ??? !!!", "Em hãy trình bày ý kiến của mình")
 *    => { invalid: true, reason: '...không chứa chữ cái, chỉ gồm ký tự số hoặc dấu câu đặc biệt...' }
 *
 * 6. isMeaninglessAnswer("12345678", "Hãy giải thích vì sao cần lưu bài thường xuyên")
 *    => { invalid: true, reason: '...không chứa chữ cái, chỉ gồm ký tự số hoặc dấu câu đặc biệt...' }
 *
 * 7. isMeaninglessAnswer("jh jh jk kj hjk", "Em hiểu thế nào về thư mục mẹ?")
 *    => { invalid: true, reason: '...từ 50% số từ trở lên không phải là âm tiết tiếng Việt...' }
 *
 * 8. isMeaninglessAnswer(
 *      "Em hãy nêu các bước tạo thư mục mới trên máy tính",
 *      "Em hãy nêu các bước tạo thư mục mới trên máy tính"
 *    )
 *    => { invalid: true, reason: '...sao chép lại nguyên văn câu hỏi của đề bài...' }
 *
 *
 * --- [7 BÀI HỢP LỆ PHẢI ĐƯỢC CHO QUA (invalid = false)] ---
 * 9. isMeaninglessAnswer("Tệp tin và thư mục", "Câu hỏi về thành phần lưu trữ")
 *    => { invalid: false, reason: 'Câu trả lời đạt chuẩn cấu trúc ngôn ngữ hợp lệ.' }
 *
 * 10. isMeaninglessAnswer("Nháy nút phải chuột chọn New rồi chọn Folder", "Nêu các bước tạo thư mục mới")
 *     => { invalid: false, reason: '...hợp lệ (chấp nhận từ New, Folder trong ngữ cảnh Tin học)...' }
 *
 * 11. isMeaninglessAnswer("Dùng để lưu trữ dữ liệu an toàn", "Thiết bị USB dùng để làm gì?")
 *     => { invalid: false, reason: '...hợp lệ...' }
 *
 * 12. isMeaninglessAnswer("Thiết bị USB dùng để sao chép dữ liệu", "Tại sao cần dùng USB?")
 *     => { invalid: false, reason: '...hợp lệ (chấp nhận thuật ngữ USB)...' }
 *
 * 13. isMeaninglessAnswer("Vì cây thư mục giúp quản lý thông tin khoa học và dễ tìm kiếm", "Tại sao cần sắp xếp cây thư mục?")
 *     => { invalid: false, reason: '...hợp lệ (trả lời đầy đủ câu giải thích)...' }
 *
 * 14. isMeaninglessAnswer("Học sinh mở phần mềm Word và gõ nội dung bài học", "Nêu cách soạn thảo văn bản")
 *     => { invalid: false, reason: '...hợp lệ (chấp nhận thuật ngữ Word)...' }
 *
 * 15. isMeaninglessAnswer("Em chọn đáp án A vì đây là thao tác đúng nhất", "Tại sao em chọn phương án này?")
 *     => { invalid: false, reason: '...hợp lệ...' }
 * ========================================================================= */
