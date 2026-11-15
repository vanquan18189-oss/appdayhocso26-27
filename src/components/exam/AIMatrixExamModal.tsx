import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  Download,
  Edit3,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  Layers,
  Loader2,
  RotateCcw,
  Save,
  Sparkles,
  X,
} from 'lucide-react';
import {
  AIExamConfig,
  AIExamQuestion,
  BoSachGiaoKhoa,
  DangCauHoiTracNghiem,
  GeneratedAIExamPackage,
  KhoiLopTieuHoc,
  MonHocChamDiem,
  SUBJECTS_BY_GRADE,
  ThoiDiemKiemTra,
  ThoiGianLamBai,
} from '../../types/aiMatrixExam';
import { generateAIExamPackage } from '../../services/aiMatrixExamService';
import { exportAIExamToWord } from '../../utils/aiExamWordExport';

export interface AIMatrixExamModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveToSystem?: (pkg: GeneratedAIExamPackage, editingExamId?: string | null) => void;
  initialPackage?: GeneratedAIExamPackage | null;
  editingExamId?: string | null;
}

type ResultTabKey = 'matrix' | 'spec' | 'exam' | 'answers';

const KHOI_LOP_OPTIONS: Array<{ value: KhoiLopTieuHoc; label: string }> = [
  { value: '1', label: 'Khối 1' },
  { value: '2', label: 'Khối 2' },
  { value: '3', label: 'Khối 3' },
  { value: '4', label: 'Khối 4' },
  { value: '5', label: 'Khối 5' },
];

const THOI_DIEM_OPTIONS: ThoiDiemKiemTra[] = [
  'Giữa học kì I',
  'Cuối học kì I',
  'Giữa học kì II',
  'Cuối năm học',
];

const BO_SACH_OPTIONS: BoSachGiaoKhoa[] = [
  'Kết nối tri thức với cuộc sống',
  'Cánh diều',
  'Chân trời sáng tạo',
];

const QUESTION_FORMAT_OPTIONS: Array<{
  id: DangCauHoiTracNghiem;
  label: string;
}> = [
  { id: 'multiple_choice', label: 'Khoanh tròn chữ cái (A, B, C, D)' },
  { id: 'fill_blank', label: 'Điền khuyết' },
  { id: 'matching', label: 'Nối cột' },
  { id: 'true_false', label: 'Đúng / Sai' },
];

/**
 * Kho gợi ý mạch kiến thức chuẩn Chương trình GDPT 2018 theo Môn học & Khối lớp
 */
const CURRICULUM_TOPICS_SUGGESTIONS: Record<
  MonHocChamDiem,
  Partial<Record<KhoiLopTieuHoc, string>>
> = {
  Toán: {
    '1': 'Các số đến 10 và phép cộng, phép trừ trong phạm vi 10\nCác số đến 100 và phép tính cộng, trừ không nhớ\nHình phẳng, hình khối và đo độ dài, thời gian',
    '2': 'Số tự nhiên và phép cộng, phép trừ có nhớ trong phạm vi 100\nBảng nhân 2, 5 và bảng chia 2, 5\nHình phẳng, hình khối và đại lượng đo lường (độ dài, khối lượng, dung tích, thời gian)',
    '3': 'Số tự nhiên và các phép tính cộng, trừ, nhân, chia trong phạm vi 10 000\nBảng nhân, bảng chia từ 2 đến 9 và biểu thức số\nHình học trực quan (chu vi, diện tích hình chữ nhật, hình vuông) và đo lường',
    '4': 'Số tự nhiên đến lớp triệu và bốn phép tính với số tự nhiên\nPhân số và các phép tính cộng, trừ, nhân, chia phân số\nHình học, đo lường (góc, hai đường thẳng vuông góc/song song, diện tích) và yếu tố thống kê',
    '5': 'Số thập phân và các phép tính với số thập phân\nTỉ số phần trăm và giải toán về tỉ số phần trăm\nHình học và đo lường (diện tích hình tam giác, hình thang, hình tròn; thể tích hình hộp chữ nhật, hình lập phương)\nSố đo thời gian và toán chuyển động đều',
  },
  'Tiếng Việt': {
    '1': 'Đọc thành tiếng và đọc hiểu văn bản ngắn (vần, tiếng, từ, câu)\nViết chính tả và điền âm, vần đúng quy tắc chính tả\nLuyện từ và câu phù hợp lứa tuổi lớp 1',
    '2': 'Đọc hiểu văn bản truyện kể, thơ thiếu nhi\nLuyện từ và câu: Từ chỉ sự vật, hoạt động, đặc điểm; Câu kể Ai là gì?, Ai làm gì?\nViết đoạn văn ngắn 4 - 5 câu về người thân, đồ vật, con vật yêu thích',
    '3': 'Đọc hiểu văn bản văn học và văn bản thông tin\nLuyện từ và câu: Mở rộng vốn từ theo chủ điểm, câu khiến, câu cảm, biện pháp so sánh, dấu câu\nViết đoạn văn nêu tình cảm, cảm xúc hoặc thuật lại một sự việc',
    '4': 'Đọc hiểu văn bản và kiến thức tiếng Việt\nLuyện từ và câu: Danh từ, động từ, tính từ; Chủ ngữ, vị ngữ trong câu kể; Dấu gạch ngang, dấu ngoặc kép\nViết bài văn kể chuyện sáng tạo hoặc miêu tả con vật, cây cối',
    '5': 'Đọc hiểu văn bản văn học, nghị luận, thông tin\nLuyện từ và câu: Từ đồng nghĩa, từ đa nghĩa, đại từ, kết từ, câu ghép và liên kết câu trong đoạn văn\nViết bài văn tả người, tả phong cảnh hoặc nêu ý kiến về một hiện tượng',
  },
  'Tiếng Anh': {
    '3': 'Listening & Reading Comprehension (Family, School, Colors, Toys, Animals)\nVocabulary & Phonics (Classroom objects, Numbers 1-20, Pets)\nSentence Patterns & Writing (Greetings, Introducing oneself, Asking about age and objects)',
    '4': 'Reading Comprehension (Time, Daily routines, Jobs, Countries, Weather)\nVocabulary & Grammar (Present simple, Can/Cannot, Prepositions of place, Days of the week)\nWriting & Rearranging Sentences (Describing daily activities, Favorite subjects and food)',
    '5': 'Reading Comprehension (Holidays, Health, Future jobs, Transportation, Seasons)\nVocabulary & Grammar (Past simple, Future with will/be going to, Should/Shouldn’t, Comparatives)\nWriting & Sentence Transformation (Describing past events, Weekend plans, Giving advice)',
  },
  'Tin học': {
    '3': 'Chủ đề A. Máy tính và em (Thông tin và quyết định, các bộ phận cơ bản của máy tính, tư thế ngồi và an toàn điện)\nChủ đề B. Mạng máy tính và Internet (Xem tin tức và giải trí trên web)\nChủ đề C. Tổ chức lưu trữ, tìm kiếm và trao đổi thông tin (Sơ đồ hình cây, thư mục và tệp)\nChủ đề E. Ứng dụng tin học (Làm quen với bài trình chiếu đơn giản)',
    '4': 'Chủ đề A. Máy tính và em (Phần cứng và phần mềm máy tính, gõ bàn phím đúng cách)\nChủ đề B & C. Mạng máy tính và tìm kiếm thông tin trên Internet bằng từ khóa\nChủ đề E. Ứng dụng tin học (Soạn thảo văn bản tiếng Việt và tạo bài trình chiếu sinh động)\nChủ đề F. Giải quyết vấn đề với sự trợ giúp của máy tính (Làm quen với lập trình trực quan Scratch)',
    '5': 'Chủ đề A. Máy tính và em (Việc máy tính có thể làm và lưu trữ tệp thông tin)\nChủ đề C & D. Tìm kiếm thông tin trên website và bản quyền nội dung thông tin số\nChủ đề E. Ứng dụng tin học (Sử dụng phần mềm đồ họa tạo sản phẩm số và định dạng văn bản)\nChủ đề F. Lập trình trực quan Scratch (Biến nhớ, cấu trúc lặp, cấu trúc rẽ nhánh và tạo chương trình trò chơi)',
  },
  'Công nghệ': {
    '3': 'Phần 1. Công nghệ và đời sống (Tự nhiên và công nghệ, sử dụng đèn học, quạt điện, máy thu thanh, máy thu hình)\nPhần 2. Thủ công kĩ thuật (An toàn với môi trường công nghệ trong gia đình, làm đồ dùng học tập và biển báo giao thông)',
    '4': 'Phần 1. Công nghệ và đời sống (Hoa và cây cảnh quanh em; Vật liệu, dụng cụ và kĩ thuật trồng hoa, cây cảnh trong chậu)\nPhần 2. Thủ công kĩ thuật (Lắp ghép mô hình kĩ thuật và làm đồ chơi dân gian an toàn)',
    '5': 'Phần 1. Công nghệ và đời sống (Vai trò của công nghệ, nhà sáng chế, thiết kế sản phẩm công nghệ, sử dụng điện thoại và tủ lạnh an toàn)\nPhần 2. Thủ công kĩ thuật (Lắp ráp mô hình xe điện chạy bằng pin, mô hình máy phát điện gió và mô hình điện mặt trời)',
  },
  'Khoa học': {
    '4': 'Chủ đề 1. Chất (Nước, không khí và bảo vệ nguồn nước, bầu không khí)\nChủ đề 2. Năng lượng (Ánh sáng, âm thanh, nhiệt và sự truyền nhiệt)\nChủ đề 3 & 4. Thực vật, động vật và Nấm (Nhu cầu sống của sinh vật, chuỗi thức ăn)\nChủ đề 5. Con người và sức khỏe (Dinh dưỡng hợp lí và phòng tránh đuối nước)',
    '5': 'Chủ đề 1. Chất (Đất, hỗn hợp và dung dịch, sự biến đổi hóa học của chất)\nChủ đề 2. Năng lượng (Năng lượng chất đốt, năng lượng mặt trời, gió, nước chảy và mạch điện đơn giản)\nChủ đề 3. Thực vật và động vật (Sự sinh sản của thực vật có hoa và động vật)\nChủ đề 4 & 5. Vi khuẩn, Con người và sức khỏe, Sinh vật và môi trường',
  },
  'Lịch sử và Địa lí': {
    '4': 'Địa phương em và Trung du, miền núi Bắc Bộ (Thiên nhiên, dân cư, văn hóa và Đền Hùng)\nĐồng bằng Bắc Bộ (Sông Hồng, văn minh lúa nước, Thăng Long - Hà Nội, Văn Miếu - Quốc Tử Giám)\nDuyên hải miền Trung (Thiên nhiên, Cố đô Huế, Phố cổ Hội An)\nTây Nguyên và Nam Bộ (Lễ hội Cồng chiêng, thiên nhiên Nam Bộ, Địa đạo Củ Chi, Thành phố Hồ Chí Minh)',
    '5': 'Đất nước và con người Việt Nam (Vị trí địa lí, lãnh thổ, biển đảo, dân cư và các dân tộc Việt Nam)\nNhững quốc gia đầu tiên trên lãnh thổ Việt Nam (Văn Lang, Âu Lạc, Phù Nam, Chăm-pa)\nXây dựng và bảo vệ đất nước Việt Nam (Đấu tranh giành độc lập, các triều đại Lý - Trần - Hậu Lê - Nguyễn, Cách mạng tháng Tám, Chiến dịch Điện Biên Phủ, Đại thắng mùa Xuân 1975)\nCác châu lục, đại dương trên thế giới và Chung tay xây dựng thế giới xanh, hòa bình',
  },
};

function getSuggestedTopics(monHoc: MonHocChamDiem, khoiLop: KhoiLopTieuHoc): string {
  return (
    CURRICULUM_TOPICS_SUGGESTIONS[monHoc]?.[khoiLop] ||
    CURRICULUM_TOPICS_SUGGESTIONS[monHoc]?.['3'] ||
    CURRICULUM_TOPICS_SUGGESTIONS[monHoc]?.['4'] ||
    CURRICULUM_TOPICS_SUGGESTIONS[monHoc]?.['5'] ||
    `Mạch kiến thức trọng tâm môn ${monHoc} lớp ${khoiLop} theo chương trình GDPT 2018`
  );
}

function formatScoreVN(val: number): string {
  const num = Number.isFinite(val) ? Math.round((val + Number.EPSILON) * 100) / 100 : 0;
  if (num === 0) return '0';
  const fixed = Number.isInteger(num) ? num.toFixed(1) : String(num);
  return fixed.replace('.', ',');
}

export const AIMatrixExamModal: React.FC<AIMatrixExamModalProps> = ({
  isOpen,
  onClose,
  onSaveToSystem,
  initialPackage = null,
  editingExamId = null,
}) => {
  const [khoiLop, setKhoiLop] = useState<KhoiLopTieuHoc>('5');
  const [monHoc, setMonHoc] = useState<MonHocChamDiem>('Tin học');
  const [thoiDiemKiemTra, setThoiDiemKiemTra] = useState<ThoiDiemKiemTra>('Giữa học kì I');
  const [thoiGianLamBai, setThoiGianLamBai] = useState<ThoiGianLamBai>(35);
  const [boSachGiaoKhoa, setBoSachGiaoKhoa] = useState<BoSachGiaoKhoa>(
    'Kết nối tri thức với cuộc sống'
  );
  const [soCauTracNghiem, setSoCauTracNghiem] = useState<number>(8);
  const [soCauTuLuan, setSoCauTuLuan] = useState<number>(2);
  const [dangCauHoiTracNghiem, setDangCauHoiTracNghiem] = useState<DangCauHoiTracNghiem[]>([
    'multiple_choice',
    'matching',
    'true_false',
  ]);
  const [chuDeKienThuc, setChuDeKienThuc] = useState<string>(() =>
    getSuggestedTopics('Tin học', '5')
  );
  const [muc1_NhanBiet, setMuc1_NhanBiet] = useState<number>(40);
  const [muc2_KetNoi, setMuc2_KetNoi] = useState<number>(40);
  const [muc3_VanDung, setMuc3_VanDung] = useState<number>(20);
  const [ghiChuThem, setGhiChuThem] = useState<string>('');

  const [generatedPkg, setGeneratedPkg] = useState<GeneratedAIExamPackage | null>(null);
  const [activeTab, setActiveTab] = useState<ResultTabKey>('matrix');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [isExportingWord, setIsExportingWord] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [editingQuestionIdx, setEditingQuestionIdx] = useState<number | null>(null);

  const availableSubjects = useMemo<MonHocChamDiem[]>(
    () => SUBJECTS_BY_GRADE[khoiLop] || ['Toán', 'Tiếng Việt'],
    [khoiLop]
  );

  // Khi mở Modal với `initialPackage` (xem lại đề đã lưu), tự động nạp toàn bộ cấu hình & 4 Tab
  useEffect(() => {
    if (!isOpen) return;

    setErrorMessage(null);
    setEditingQuestionIdx(null);

    if (initialPackage && initialPackage.config) {
      const cfg = initialPackage.config;
      const validGrade: KhoiLopTieuHoc =
        cfg.khoiLop && SUBJECTS_BY_GRADE[cfg.khoiLop] ? cfg.khoiLop : '5';
      const gradeSubjects = SUBJECTS_BY_GRADE[validGrade] || ['Toán', 'Tiếng Việt'];
      const validSubject: MonHocChamDiem = gradeSubjects.includes(cfg.monHoc)
        ? cfg.monHoc
        : gradeSubjects[0];

      setKhoiLop(validGrade);
      setMonHoc(validSubject);
      setThoiDiemKiemTra(cfg.thoiDiemKiemTra || 'Giữa học kì I');
      setThoiGianLamBai(cfg.thoiGianLamBai === 40 ? 40 : 35);
      setBoSachGiaoKhoa(cfg.boSachGiaoKhoa || 'Kết nối tri thức với cuộc sống');
      setSoCauTracNghiem(
        typeof cfg.soCauTracNghiem === 'number'
          ? cfg.soCauTracNghiem
          : (initialPackage.questions || []).filter((q) => q.phan === 'TRAC_NGHIEM').length
      );
      setSoCauTuLuan(
        typeof cfg.soCauTuLuan === 'number'
          ? cfg.soCauTuLuan
          : (initialPackage.questions || []).filter((q) => q.phan === 'TU_LUAN').length
      );
      setDangCauHoiTracNghiem(
        Array.isArray(cfg.dangCauHoiTracNghiem) && cfg.dangCauHoiTracNghiem.length > 0
          ? cfg.dangCauHoiTracNghiem
          : ['multiple_choice']
      );
      setChuDeKienThuc(
        cfg.chuDeKienThuc || getSuggestedTopics(validSubject, validGrade)
      );
      setMuc1_NhanBiet(typeof cfg.muc1_NhanBiet === 'number' ? cfg.muc1_NhanBiet : 40);
      setMuc2_KetNoi(typeof cfg.muc2_KetNoi === 'number' ? cfg.muc2_KetNoi : 40);
      setMuc3_VanDung(typeof cfg.muc3_VanDung === 'number' ? cfg.muc3_VanDung : 20);
      setGhiChuThem(cfg.ghiChuThem || '');

      setGeneratedPkg(initialPackage);
      setActiveTab('matrix');
      setStatusMessage(
        'Đã nạp sẵn hồ sơ Ma trận, Bản đặc tả, Đề kiểm tra và Hướng dẫn chấm đã lưu. Thầy/Cô có thể xem, chỉnh sửa hoặc tải file Word (.docx).'
      );
    } else {
      setStatusMessage(null);
    }
  }, [isOpen, initialPackage, editingExamId]);

  const handleGradeChange = (nextKhoiLop: KhoiLopTieuHoc) => {
    setKhoiLop(nextKhoiLop);
    const nextAllowed = SUBJECTS_BY_GRADE[nextKhoiLop] || ['Toán', 'Tiếng Việt'];
    const nextSubject = nextAllowed.includes(monHoc) ? monHoc : nextAllowed[0];
    if (nextSubject !== monHoc) {
      setMonHoc(nextSubject);
    }
    setChuDeKienThuc(getSuggestedTopics(nextSubject, nextKhoiLop));
  };

  const handleSubjectChange = (nextMonHoc: MonHocChamDiem) => {
    setMonHoc(nextMonHoc);
    setChuDeKienThuc(getSuggestedTopics(nextMonHoc, khoiLop));
  };

  if (!isOpen) return null;

  const totalConfiguredQuestions = Math.max(0, soCauTracNghiem) + Math.max(0, soCauTuLuan);
  const totalLevelPercent = muc1_NhanBiet + muc2_KetNoi + muc3_VanDung;

  const handleToggleFormat = (formatId: DangCauHoiTracNghiem) => {
    setDangCauHoiTracNghiem((prev) => {
      if (prev.includes(formatId)) {
        if (prev.length === 1) return prev; // Luôn giữ tối thiểu 1 dạng câu hỏi
        return prev.filter((item) => item !== formatId);
      }
      return [...prev, formatId];
    });
  };

  const handleApplyLevelPreset = (m1: number, m2: number, m3: number) => {
    setMuc1_NhanBiet(m1);
    setMuc2_KetNoi(m2);
    setMuc3_VanDung(m3);
  };

  const handleGenerate = async () => {
    setErrorMessage(null);
    setStatusMessage(null);

    if (totalConfiguredQuestions <= 0) {
      setErrorMessage('Tổng số câu hỏi phải lớn hơn 0.');
      return;
    }

    if (totalLevelPercent !== 100) {
      setErrorMessage(
        `Tổng tỷ lệ 3 mức độ nhận thức phải bằng đúng 100% (hiện tại là ${totalLevelPercent}%).`
      );
      return;
    }

    const config: AIExamConfig = {
      khoiLop,
      monHoc,
      thoiDiemKiemTra,
      thoiGianLamBai,
      boSachGiaoKhoa,
      soCauTracNghiem,
      soCauTuLuan,
      dangCauHoiTracNghiem,
      chuDeKienThuc: chuDeKienThuc.trim() || getSuggestedTopics(monHoc, khoiLop),
      muc1_NhanBiet,
      muc2_KetNoi,
      muc3_VanDung,
      ghiChuThem: ghiChuThem.trim(),
    };

    setIsGenerating(true);
    try {
      const result = await generateAIExamPackage(config);
      setGeneratedPkg(result);
      setActiveTab('matrix');
      setEditingQuestionIdx(null);
      setStatusMessage(
        `Đã tạo thành công Ma trận, Bản đặc tả và Đề kiểm tra môn ${monHoc} (Khối ${khoiLop}) gồm ${result.questions.length} câu hỏi – Tổng 10,0 điểm!`
      );
    } catch (err: any) {
      setErrorMessage(
        err?.message || 'Không thể sinh Ma trận & Đề kiểm tra bằng AI lúc này. Vui lòng thử lại!'
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const handleExportWord = async () => {
    if (!generatedPkg) return;
    setIsExportingWord(true);
    setErrorMessage(null);
    try {
      await exportAIExamToWord(generatedPkg);
      setStatusMessage('Đã xuất file Word (.docx) chuẩn Thông tư 27 thành công!');
    } catch (err: any) {
      setErrorMessage(err?.message || 'Không thể xuất file Word (.docx). Vui lòng thử lại.');
    } finally {
      setIsExportingWord(false);
    }
  };

  const handleSavePkgToSystem = () => {
    if (!generatedPkg || !onSaveToSystem) return;
    onSaveToSystem(generatedPkg, editingExamId);
    setStatusMessage('Đã lưu đề kiểm tra kèm ma trận vào hệ thống thành công!');
  };

  const handleUpdateQuestionField = (
    qIdx: number,
    patch: Partial<AIExamQuestion>
  ) => {
    if (!generatedPkg) return;
    const updatedQuestions = generatedPkg.questions.map((q, idx) =>
      idx === qIdx ? { ...q, ...patch } : q
    );
    setGeneratedPkg({
      ...generatedPkg,
      questions: updatedQuestions,
    });
  };

  const tnList = generatedPkg?.questions.filter((q) => q.phan === 'TRAC_NGHIEM') || [];
  const tlList = generatedPkg?.questions.filter((q) => q.phan === 'TU_LUAN') || [];

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4">
      <div className="bg-slate-100 rounded-3xl w-full max-w-[1440px] h-[94vh] shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
        {/* 1. TOP HEADER */}
        <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-600 text-white flex items-center justify-center shadow-sm shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base lg:text-lg font-extrabold text-slate-900 truncate">
                Tạo Ma Trận &amp; Đề Kiểm Tra Bằng AI (Dành cho môn đánh giá bằng điểm số - Thông tư 27)
              </h2>
              <p className="text-xs text-slate-500 truncate">
                Tự động đồng bộ 100% Ma trận 17 cột • Bản đặc tả GDPT 2018 • Đề chính thức • Hướng dẫn chấm (Thang điểm 10,0)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={!generatedPkg || isExportingWord}
              onClick={handleExportWord}
              className="px-3.5 py-2 rounded-xl text-xs font-extrabold bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white transition-all shadow-xs flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              {isExportingWord ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              <span>Tải file Word (.docx)</span>
            </button>

            <button
              type="button"
              disabled={!generatedPkg || !onSaveToSystem}
              onClick={handleSavePkgToSystem}
              className="px-3.5 py-2 rounded-xl text-xs font-extrabold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white transition-all shadow-xs flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Save className="w-4 h-4" />
              <span>Lưu vào hệ thống</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <X className="w-4 h-4" />
              <span>Đóng</span>
            </button>
          </div>
        </div>

        {/* Status / Error Banner */}
        {(statusMessage || errorMessage) && (
          <div
            className={`px-5 py-2.5 text-xs font-bold flex items-center justify-between gap-3 shrink-0 border-b ${
              errorMessage
                ? 'bg-rose-50 border-rose-200 text-rose-800'
                : 'bg-emerald-50 border-emerald-200 text-emerald-800'
            }`}
          >
            <div className="flex items-center gap-2">
              {errorMessage ? (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              )}
              <span>{errorMessage || statusMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setErrorMessage(null);
                setStatusMessage(null);
              }}
              className="text-slate-500 hover:text-slate-800 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* 2. TWO-COLUMN MAIN BODY */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
          {/* LEFT COLUMN: THIẾT LẬP CẤU HÌNH ĐỀ KIỂM TRA */}
          <div className="lg:col-span-4 xl:col-span-4 bg-white border-r border-slate-200 overflow-y-auto p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-teal-600" />
                <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wide">
                  Thiết lập cấu hình đề kiểm tra
                </h3>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-teal-50 text-teal-700 border border-teal-200">
                Thông tư 27
              </span>
            </div>

            {/* Khối lớp & Môn học chấm điểm */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Khối lớp <span className="text-rose-500">*</span>
                </label>
                <select
                  value={khoiLop}
                  onChange={(e) => handleGradeChange(e.target.value as KhoiLopTieuHoc)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50/70 focus:bg-white focus:border-teal-500 text-xs sm:text-sm font-bold text-slate-800 outline-none cursor-pointer"
                >
                  {KHOI_LOP_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Môn chấm điểm ({availableSubjects.length} môn) <span className="text-rose-500">*</span>
                </label>
                <select
                  value={monHoc}
                  onChange={(e) => handleSubjectChange(e.target.value as MonHocChamDiem)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50/70 focus:bg-white focus:border-teal-500 text-xs sm:text-sm font-bold text-teal-800 outline-none cursor-pointer"
                >
                  {availableSubjects.map((subj) => (
                    <option key={subj} value={subj}>
                      {subj}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Kỳ kiểm tra & Thời gian làm bài */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Kỳ kiểm tra
                </label>
                <select
                  value={thoiDiemKiemTra}
                  onChange={(e) => setThoiDiemKiemTra(e.target.value as ThoiDiemKiemTra)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50/70 focus:bg-white focus:border-teal-500 text-xs sm:text-sm font-semibold text-slate-800 outline-none cursor-pointer"
                >
                  {THOI_DIEM_OPTIONS.map((period) => (
                    <option key={period} value={period}>
                      {period}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Thời gian làm bài
                </label>
                <select
                  value={thoiGianLamBai}
                  onChange={(e) => setThoiGianLamBai(Number(e.target.value) as ThoiGianLamBai)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50/70 focus:bg-white focus:border-teal-500 text-xs sm:text-sm font-semibold text-slate-800 outline-none cursor-pointer"
                >
                  <option value={35}>35 phút</option>
                  <option value={40}>40 phút</option>
                </select>
              </div>
            </div>

            {/* Bộ sách giáo khoa */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Bộ sách giáo khoa
              </label>
              <select
                value={boSachGiaoKhoa}
                onChange={(e) => setBoSachGiaoKhoa(e.target.value as BoSachGiaoKhoa)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50/70 focus:bg-white focus:border-teal-500 text-xs sm:text-sm font-semibold text-slate-800 outline-none cursor-pointer"
              >
                {BO_SACH_OPTIONS.map((book) => (
                  <option key={book} value={book}>
                    {book}
                  </option>
                ))}
              </select>
            </div>

            {/* Khung Cấu trúc số câu hỏi */}
            <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-200 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-slate-800">
                  Cấu trúc số câu hỏi
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-indigo-100 text-indigo-700">
                  Tổng: {totalConfiguredQuestions} câu
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    Số câu Trắc nghiệm
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={25}
                    value={soCauTracNghiem}
                    onChange={(e) => setSoCauTracNghiem(Math.max(0, Number(e.target.value)))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm font-extrabold text-slate-900 outline-none focus:border-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    Số câu Tự luận
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={15}
                    value={soCauTuLuan}
                    onChange={(e) => setSoCauTuLuan(Math.max(0, Number(e.target.value)))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm font-extrabold text-slate-900 outline-none focus:border-teal-500"
                  />
                </div>
              </div>
            </div>

            {/* Checkbox chọn nhiều Dạng câu hỏi Trắc nghiệm */}
            <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-200 space-y-2">
              <span className="block text-xs font-extrabold text-slate-800">
                Dạng câu hỏi Trắc nghiệm
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {QUESTION_FORMAT_OPTIONS.map((fmt) => {
                  const checked = dangCauHoiTracNghiem.includes(fmt.id);
                  return (
                    <label
                      key={fmt.id}
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold cursor-pointer transition-all select-none ${
                        checked
                          ? 'bg-teal-50 border-teal-300 text-teal-900'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => handleToggleFormat(fmt.id)}
                        className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500 cursor-pointer"
                      />
                      <span className="leading-tight">{fmt.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Các mạch kiến thức / chủ đề */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-slate-700">
                  Các mạch kiến thức / chủ đề (mỗi dòng 1 chủ đề)
                </label>
                <button
                  type="button"
                  onClick={() => setChuDeKienThuc(getSuggestedTopics(monHoc, khoiLop))}
                  className="text-[11px] font-bold text-teal-600 hover:text-teal-800 flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" /> Gợi ý mẫu
                </button>
              </div>
              <textarea
                rows={4}
                value={chuDeKienThuc}
                onChange={(e) => setChuDeKienThuc(e.target.value)}
                placeholder="Nhập mỗi dòng 1 mạch kiến thức hoặc chủ đề bài học..."
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50/60 focus:bg-white focus:border-teal-500 text-xs font-medium text-slate-800 outline-none leading-relaxed"
              />
            </div>

            {/* Khung Tỷ lệ điểm 3 mức độ (Thông tư 27) */}
            <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-200 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-slate-800">
                  Tỷ lệ điểm 3 mức độ (Thông tư 27)
                </span>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[11px] font-extrabold ${
                    totalLevelPercent === 100
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-rose-100 text-rose-700'
                  }`}
                >
                  Tổng: {totalLevelPercent}%
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    Mức 1 (%)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={5}
                    value={muc1_NhanBiet}
                    onChange={(e) => setMuc1_NhanBiet(Math.max(0, Number(e.target.value)))}
                    className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-extrabold text-slate-900 text-center outline-none focus:border-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    Mức 2 (%)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={5}
                    value={muc2_KetNoi}
                    onChange={(e) => setMuc2_KetNoi(Math.max(0, Number(e.target.value)))}
                    className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-extrabold text-slate-900 text-center outline-none focus:border-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    Mức 3 (%)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={5}
                    value={muc3_VanDung}
                    onChange={(e) => setMuc3_VanDung(Math.max(0, Number(e.target.value)))}
                    className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-extrabold text-slate-900 text-center outline-none focus:border-teal-500"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-0.5">
                <button
                  type="button"
                  onClick={() => handleApplyLevelPreset(40, 40, 20)}
                  className={`flex-1 py-1.5 px-2.5 rounded-xl text-[11px] font-extrabold border transition cursor-pointer ${
                    muc1_NhanBiet === 40 && muc2_KetNoi === 40 && muc3_VanDung === 20
                      ? 'bg-teal-600 text-white border-teal-600'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  Chuẩn 40-40-20
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyLevelPreset(50, 30, 20)}
                  className={`flex-1 py-1.5 px-2.5 rounded-xl text-[11px] font-extrabold border transition cursor-pointer ${
                    muc1_NhanBiet === 50 && muc2_KetNoi === 30 && muc3_VanDung === 20
                      ? 'bg-teal-600 text-white border-teal-600'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  Chuẩn 50-30-20
                </button>
              </div>
            </div>

            {/* Ghi chú / Yêu cầu thêm */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Ghi chú / Yêu cầu thêm (nếu có)
              </label>
              <input
                type="text"
                value={ghiChuThem}
                onChange={(e) => setGhiChuThem(e.target.value)}
                placeholder="VD: Câu tự luận gắn với tình huống thực tiễn của học sinh..."
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50/60 focus:bg-white focus:border-teal-500 text-xs font-medium text-slate-800 outline-none"
              />
            </div>

            {/* Nút bấm lớn màu xanh ngọc: ✨ Tạo Ma Trận & Đề Bằng AI */}
            <button
              type="button"
              disabled={isGenerating}
              onClick={handleGenerate}
              className="w-full py-3.5 px-5 rounded-2xl bg-gradient-to-r from-teal-500 via-emerald-500 to-cyan-600 hover:from-teal-600 hover:to-cyan-700 disabled:opacity-60 text-white font-black text-sm shadow-lg shadow-teal-500/20 flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>AI đang thiết lập Ma trận &amp; Đề kiểm tra...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  <span>✨ Tạo Ma Trận &amp; Đề Bằng AI</span>
                </>
              )}
            </button>
          </div>

          {/* RIGHT COLUMN: 4 RESULT TABS */}
          <div className="lg:col-span-8 xl:col-span-8 flex flex-col bg-slate-50 overflow-hidden">
            {/* 4 Tabs Navigation */}
            <div className="bg-white border-b border-slate-200 px-4 pt-3 flex items-center gap-2 overflow-x-auto shrink-0">
              <button
                type="button"
                onClick={() => setActiveTab('matrix')}
                className={`px-4 py-2.5 rounded-t-xl text-xs sm:text-sm font-extrabold border-b-2 flex items-center gap-2 transition-all whitespace-nowrap cursor-pointer ${
                  activeTab === 'matrix'
                    ? 'border-teal-600 text-teal-700 bg-teal-50/60'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Tab 1: Ma trận đề</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('spec')}
                className={`px-4 py-2.5 rounded-t-xl text-xs sm:text-sm font-extrabold border-b-2 flex items-center gap-2 transition-all whitespace-nowrap cursor-pointer ${
                  activeTab === 'spec'
                    ? 'border-teal-600 text-teal-700 bg-teal-50/60'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Layers className="w-4 h-4" />
                <span>Tab 2: Bản đặc tả chi tiết</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('exam')}
                className={`px-4 py-2.5 rounded-t-xl text-xs sm:text-sm font-extrabold border-b-2 flex items-center gap-2 transition-all whitespace-nowrap cursor-pointer ${
                  activeTab === 'exam'
                    ? 'border-teal-600 text-teal-700 bg-teal-50/60'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <FileText className="w-4 h-4" />
                <span>
                  Tab 3: Đề kiểm tra ({generatedPkg ? generatedPkg.questions.length : totalConfiguredQuestions} câu)
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('answers')}
                className={`px-4 py-2.5 rounded-t-xl text-xs sm:text-sm font-extrabold border-b-2 flex items-center gap-2 transition-all whitespace-nowrap cursor-pointer ${
                  activeTab === 'answers'
                    ? 'border-teal-600 text-teal-700 bg-teal-50/60'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <FileCheck2 className="w-4 h-4" />
                <span>Tab 4: Đáp án &amp; Biểu điểm</span>
              </button>
            </div>

            {/* Tab Content Area */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6">
              {!generatedPkg ? (
                <div className="bg-white rounded-3xl border border-slate-200 p-10 sm:p-14 text-center max-w-2xl mx-auto my-8 shadow-xs space-y-4">
                  <div className="w-16 h-16 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center mx-auto">
                    <ClipboardList className="w-8 h-8" />
                  </div>
                  <h4 className="text-base sm:text-lg font-extrabold text-slate-900">
                    Chưa có dữ liệu Ma trận &amp; Đề kiểm tra
                  </h4>
                  <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                    Thầy/Cô hãy chọn <strong>Khối lớp</strong>, <strong>Môn chấm điểm</strong>, kiểm tra gợi ý{' '}
                    <strong>Các mạch kiến thức</strong> ở cột bên trái và bấm nút{' '}
                    <strong className="text-teal-700">✨ Tạo Ma Trận &amp; Đề Bằng AI</strong> để hệ thống sinh trọn bộ 4 phần chuẩn Thông tư 27/2020/TT-BGDĐT.
                  </p>
                </div>
              ) : (
                <>
                  {/* TAB 1: MA TRẬN ĐỀ (Bảng 17 cột) */}
                  {activeTab === 'matrix' && (() => {
                    const rows = generatedPkg.matrixRows;
                    const sum = rows.reduce(
                      (acc, r) => ({
                        m1_tn_cau: acc.m1_tn_cau + r.m1_tn_cau,
                        m1_tn_diem: acc.m1_tn_diem + r.m1_tn_diem,
                        m1_tl_cau: acc.m1_tl_cau + r.m1_tl_cau,
                        m1_tl_diem: acc.m1_tl_diem + r.m1_tl_diem,
                        m2_tn_cau: acc.m2_tn_cau + r.m2_tn_cau,
                        m2_tn_diem: acc.m2_tn_diem + r.m2_tn_diem,
                        m2_tl_cau: acc.m2_tl_cau + r.m2_tl_cau,
                        m2_tl_diem: acc.m2_tl_diem + r.m2_tl_diem,
                        m3_tn_cau: acc.m3_tn_cau + r.m3_tn_cau,
                        m3_tn_diem: acc.m3_tn_diem + r.m3_tn_diem,
                        m3_tl_cau: acc.m3_tl_cau + r.m3_tl_cau,
                        m3_tl_diem: acc.m3_tl_diem + r.m3_tl_diem,
                        tongSoCau: acc.tongSoCau + r.tongSoCau,
                        tongDiem: acc.tongDiem + r.tongDiem,
                      }),
                      {
                        m1_tn_cau: 0,
                        m1_tn_diem: 0,
                        m1_tl_cau: 0,
                        m1_tl_diem: 0,
                        m2_tn_cau: 0,
                        m2_tn_diem: 0,
                        m2_tl_cau: 0,
                        m2_tl_diem: 0,
                        m3_tn_cau: 0,
                        m3_tn_diem: 0,
                        m3_tl_cau: 0,
                        m3_tl_diem: 0,
                        tongSoCau: 0,
                        tongDiem: 0,
                      }
                    );

                    return (
                      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-4">
                        <div className="text-center space-y-1">
                          <h3 className="text-base font-black text-slate-900 uppercase">
                            I. MA TRẬN ĐỀ KIỂM TRA ĐỊNH KÌ – {generatedPkg.config.thoiDiemKiemTra.toUpperCase()}
                          </h3>
                          <p className="text-xs font-bold text-slate-600">
                            Môn: {generatedPkg.config.monHoc} • Khối {generatedPkg.config.khoiLop} • Thời gian:{' '}
                            {generatedPkg.config.thoiGianLamBai} phút • Sách: {generatedPkg.config.boSachGiaoKhoa}
                          </p>
                        </div>

                        <div className="overflow-x-auto">
                          <table className="w-full border-collapse border border-slate-400 text-xs">
                            <thead>
                              <tr className="bg-slate-100 text-slate-900 font-extrabold">
                                <th rowSpan={3} className="border border-slate-400 px-2 py-2 text-center w-10">
                                  TT
                                </th>
                                <th rowSpan={3} className="border border-slate-400 px-3 py-2 text-left min-w-[180px]">
                                  Mạch kiến thức / Chủ đề
                                </th>
                                <th colSpan={4} className="border border-slate-400 px-2 py-1.5 text-center bg-sky-50">
                                  Mức 1 (Nhận biết)
                                </th>
                                <th colSpan={4} className="border border-slate-400 px-2 py-1.5 text-center bg-amber-50">
                                  Mức 2 (Kết nối)
                                </th>
                                <th colSpan={4} className="border border-slate-400 px-2 py-1.5 text-center bg-purple-50">
                                  Mức 3 (Vận dụng)
                                </th>
                                <th colSpan={2} rowSpan={2} className="border border-slate-400 px-2 py-1.5 text-center bg-emerald-50">
                                  Tổng
                                </th>
                                <th rowSpan={3} className="border border-slate-400 px-2 py-2 text-center w-16">
                                  Tỷ lệ %
                                </th>
                              </tr>
                              <tr className="bg-slate-50 text-slate-800 font-bold">
                                <th colSpan={2} className="border border-slate-400 px-1.5 py-1 text-center">
                                  TNKQ
                                </th>
                                <th colSpan={2} className="border border-slate-400 px-1.5 py-1 text-center">
                                  TL
                                </th>
                                <th colSpan={2} className="border border-slate-400 px-1.5 py-1 text-center">
                                  TNKQ
                                </th>
                                <th colSpan={2} className="border border-slate-400 px-1.5 py-1 text-center">
                                  TL
                                </th>
                                <th colSpan={2} className="border border-slate-400 px-1.5 py-1 text-center">
                                  TNKQ
                                </th>
                                <th colSpan={2} className="border border-slate-400 px-1.5 py-1 text-center">
                                  TL
                                </th>
                              </tr>
                              <tr className="bg-slate-100/80 text-slate-700 font-bold text-[11px]">
                                <th className="border border-slate-400 px-1.5 py-1 text-center">Câu</th>
                                <th className="border border-slate-400 px-1.5 py-1 text-center">Đ</th>
                                <th className="border border-slate-400 px-1.5 py-1 text-center">Câu</th>
                                <th className="border border-slate-400 px-1.5 py-1 text-center">Đ</th>
                                <th className="border border-slate-400 px-1.5 py-1 text-center">Câu</th>
                                <th className="border border-slate-400 px-1.5 py-1 text-center">Đ</th>
                                <th className="border border-slate-400 px-1.5 py-1 text-center">Câu</th>
                                <th className="border border-slate-400 px-1.5 py-1 text-center">Đ</th>
                                <th className="border border-slate-400 px-1.5 py-1 text-center">Câu</th>
                                <th className="border border-slate-400 px-1.5 py-1 text-center">Đ</th>
                                <th className="border border-slate-400 px-1.5 py-1 text-center">Câu</th>
                                <th className="border border-slate-400 px-1.5 py-1 text-center">Đ</th>
                                <th className="border border-slate-400 px-1.5 py-1 text-center">Câu</th>
                                <th className="border border-slate-400 px-1.5 py-1 text-center">Điểm</th>
                              </tr>
                            </thead>
                            <tbody>
                              {rows.map((r, idx) => (
                                <tr key={idx} className="hover:bg-slate-50">
                                  <td className="border border-slate-400 px-2 py-2 text-center font-bold">
                                    {r.tt || idx + 1}
                                  </td>
                                  <td className="border border-slate-400 px-3 py-2 font-semibold text-slate-900">
                                    {r.machKienThuc}
                                  </td>
                                  <td className="border border-slate-400 px-1.5 py-2 text-center">
                                    {r.m1_tn_cau || ''}
                                  </td>
                                  <td className="border border-slate-400 px-1.5 py-2 text-center">
                                    {r.m1_tn_diem ? formatScoreVN(r.m1_tn_diem) : ''}
                                  </td>
                                  <td className="border border-slate-400 px-1.5 py-2 text-center">
                                    {r.m1_tl_cau || ''}
                                  </td>
                                  <td className="border border-slate-400 px-1.5 py-2 text-center">
                                    {r.m1_tl_diem ? formatScoreVN(r.m1_tl_diem) : ''}
                                  </td>
                                  <td className="border border-slate-400 px-1.5 py-2 text-center">
                                    {r.m2_tn_cau || ''}
                                  </td>
                                  <td className="border border-slate-400 px-1.5 py-2 text-center">
                                    {r.m2_tn_diem ? formatScoreVN(r.m2_tn_diem) : ''}
                                  </td>
                                  <td className="border border-slate-400 px-1.5 py-2 text-center">
                                    {r.m2_tl_cau || ''}
                                  </td>
                                  <td className="border border-slate-400 px-1.5 py-2 text-center">
                                    {r.m2_tl_diem ? formatScoreVN(r.m2_tl_diem) : ''}
                                  </td>
                                  <td className="border border-slate-400 px-1.5 py-2 text-center">
                                    {r.m3_tn_cau || ''}
                                  </td>
                                  <td className="border border-slate-400 px-1.5 py-2 text-center">
                                    {r.m3_tn_diem ? formatScoreVN(r.m3_tn_diem) : ''}
                                  </td>
                                  <td className="border border-slate-400 px-1.5 py-2 text-center">
                                    {r.m3_tl_cau || ''}
                                  </td>
                                  <td className="border border-slate-400 px-1.5 py-2 text-center">
                                    {r.m3_tl_diem ? formatScoreVN(r.m3_tl_diem) : ''}
                                  </td>
                                  <td className="border border-slate-400 px-2 py-2 text-center font-extrabold text-slate-900">
                                    {r.tongSoCau}
                                  </td>
                                  <td className="border border-slate-400 px-2 py-2 text-center font-extrabold text-teal-700">
                                    {formatScoreVN(r.tongDiem)}
                                  </td>
                                  <td className="border border-slate-400 px-2 py-2 text-center font-bold">
                                    {formatScoreVN(r.tyLePhanTram)}%
                                  </td>
                                </tr>
                              ))}
                              <tr className="bg-emerald-50/80 font-extrabold text-slate-900">
                                <td className="border border-slate-400 px-2 py-2.5 text-center" />
                                <td className="border border-slate-400 px-3 py-2.5 text-center uppercase">
                                  Tổng cộng
                                </td>
                                <td className="border border-slate-400 px-1.5 py-2.5 text-center">{sum.m1_tn_cau}</td>
                                <td className="border border-slate-400 px-1.5 py-2.5 text-center">
                                  {formatScoreVN(sum.m1_tn_diem)}
                                </td>
                                <td className="border border-slate-400 px-1.5 py-2.5 text-center">{sum.m1_tl_cau}</td>
                                <td className="border border-slate-400 px-1.5 py-2.5 text-center">
                                  {formatScoreVN(sum.m1_tl_diem)}
                                </td>
                                <td className="border border-slate-400 px-1.5 py-2.5 text-center">{sum.m2_tn_cau}</td>
                                <td className="border border-slate-400 px-1.5 py-2.5 text-center">
                                  {formatScoreVN(sum.m2_tn_diem)}
                                </td>
                                <td className="border border-slate-400 px-1.5 py-2.5 text-center">{sum.m2_tl_cau}</td>
                                <td className="border border-slate-400 px-1.5 py-2.5 text-center">
                                  {formatScoreVN(sum.m2_tl_diem)}
                                </td>
                                <td className="border border-slate-400 px-1.5 py-2.5 text-center">{sum.m3_tn_cau}</td>
                                <td className="border border-slate-400 px-1.5 py-2.5 text-center">
                                  {formatScoreVN(sum.m3_tn_diem)}
                                </td>
                                <td className="border border-slate-400 px-1.5 py-2.5 text-center">{sum.m3_tl_cau}</td>
                                <td className="border border-slate-400 px-1.5 py-2.5 text-center">
                                  {formatScoreVN(sum.m3_tl_diem)}
                                </td>
                                <td className="border border-slate-400 px-2 py-2.5 text-center text-indigo-700">
                                  {sum.tongSoCau}
                                </td>
                                <td className="border border-slate-400 px-2 py-2.5 text-center text-emerald-700">
                                  10,0
                                </td>
                                <td className="border border-slate-400 px-2 py-2.5 text-center text-emerald-700">
                                  100%
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })()}

                  {/* TAB 2: BẢN ĐẶC TẢ CHI TIẾT */}
                  {activeTab === 'spec' && (
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-4">
                      <div className="text-center space-y-1">
                        <h3 className="text-base font-black text-slate-900 uppercase">
                          II. BẢN ĐẶC TẢ ĐỀ KIỂM TRA ĐỊNH KÌ
                        </h3>
                        <p className="text-xs font-bold text-slate-600">
                          Môn: {generatedPkg.config.monHoc} • Khối {generatedPkg.config.khoiLop} •{' '}
                          {generatedPkg.config.thoiDiemKiemTra}
                        </p>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse border border-slate-400 text-xs">
                          <thead>
                            <tr className="bg-slate-100 text-slate-900 font-extrabold">
                              <th className="border border-slate-400 px-2.5 py-2.5 text-center w-10">TT</th>
                              <th className="border border-slate-400 px-3 py-2.5 text-left w-[18%]">
                                Mạch kiến thức
                              </th>
                              <th className="border border-slate-400 px-3 py-2.5 text-left w-[26%]">
                                Đơn vị kiến thức / Yêu cầu cần đạt (GDPT 2018)
                              </th>
                              <th className="border border-slate-400 px-3 py-2.5 text-center w-[16%]">
                                Số câu theo mức độ
                              </th>
                              <th className="border border-slate-400 px-3 py-2.5 text-left">
                                Mô tả chi tiết năng lực cần đạt ở từng câu
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {generatedPkg.specificationRows.map((row, idx) => (
                              <tr key={idx} className="align-top hover:bg-slate-50">
                                <td className="border border-slate-400 px-2.5 py-3 text-center font-bold">
                                  {row.tt || idx + 1}
                                </td>
                                <td className="border border-slate-400 px-3 py-3 font-bold text-slate-900">
                                  {row.machKienThuc}
                                </td>
                                <td className="border border-slate-400 px-3 py-3 text-slate-700 leading-relaxed">
                                  {row.donViKienThucYCCD}
                                </td>
                                <td className="border border-slate-400 px-3 py-3 text-center space-y-1">
                                  <div className="px-2 py-0.5 rounded bg-sky-50 text-sky-800 font-bold">
                                    Mức 1: {row.soCauMuc1} câu
                                  </div>
                                  <div className="px-2 py-0.5 rounded bg-amber-50 text-amber-800 font-bold">
                                    Mức 2: {row.soCauMuc2} câu
                                  </div>
                                  <div className="px-2 py-0.5 rounded bg-purple-50 text-purple-800 font-bold">
                                    Mức 3: {row.soCauMuc3} câu
                                  </div>
                                </td>
                                <td className="border border-slate-400 px-3 py-3 space-y-1.5 text-slate-800">
                                  {(row.moTaChiTietTheoCau || []).map((desc, dIdx) => (
                                    <div key={dIdx} className="leading-relaxed">
                                      • {desc}
                                    </div>
                                  ))}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* TAB 3: ĐỀ KIỂM TRA CHÍNH THỨC (Cho phép sửa trực tiếp câu hỏi/đáp án) */}
                  {activeTab === 'exam' && (
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 sm:p-7 space-y-6">
                      <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-slate-200">
                        <div>
                          <h3 className="text-base font-black text-slate-900 uppercase">
                            III. ĐỀ KIỂM TRA CHÍNH THỨC ({generatedPkg.questions.length} CÂU – 10,0 ĐIỂM)
                          </h3>
                          <p className="text-xs text-slate-500 font-semibold">
                            Bấm vào nút <strong>"Sửa câu hỏi"</strong> trên từng câu để chỉnh sửa trực tiếp nội dung hoặc đáp án trước khi tải Word / lưu hệ thống.
                          </p>
                        </div>
                      </div>

                      {/* PHẦN I: TRẮC NGHIỆM */}
                      {tnList.length > 0 && (
                        <div className="space-y-4">
                          <h4 className="text-sm font-black text-teal-800 bg-teal-50 border border-teal-200 px-4 py-2 rounded-xl uppercase">
                            I. PHẦN TRẮC NGHIỆM ({tnList.length} câu)
                          </h4>

                          {generatedPkg.questions.map((q, qIdx) => {
                            if (q.phan !== 'TRAC_NGHIEM') return null;
                            const isEditing = editingQuestionIdx === qIdx;

                            return (
                              <div
                                key={q.soThuTu}
                                className="rounded-2xl border border-slate-200 p-4 sm:p-5 bg-slate-50/50 space-y-3"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="flex items-center gap-2">
                                    <span className="px-2.5 py-1 rounded-lg bg-teal-600 text-white text-xs font-extrabold">
                                      Câu {q.soThuTu} ({formatScoreVN(q.diem)} điểm)
                                    </span>
                                    <span className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-bold">
                                      {q.mucDo}
                                    </span>
                                    <span className="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 border border-amber-200 text-xs font-bold">
                                      {q.hinhThuc}
                                    </span>
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() =>
                                      setEditingQuestionIdx(isEditing ? null : qIdx)
                                    }
                                    className="px-3 py-1.5 rounded-xl text-xs font-bold bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 flex items-center gap-1.5 cursor-pointer"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                    <span>{isEditing ? 'Xong' : 'Sửa câu hỏi'}</span>
                                  </button>
                                </div>

                                {isEditing ? (
                                  <div className="space-y-3 bg-white p-4 rounded-xl border border-teal-200">
                                    <div>
                                      <label className="block text-xs font-bold text-slate-700 mb-1">
                                        Nội dung câu hỏi
                                      </label>
                                      <textarea
                                        rows={2}
                                        value={q.noiDungCauHoi}
                                        onChange={(e) =>
                                          handleUpdateQuestionField(qIdx, {
                                            noiDungCauHoi: e.target.value,
                                          })
                                        }
                                        className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs sm:text-sm font-semibold text-slate-900 outline-none focus:border-teal-500"
                                      />
                                    </div>

                                    {q.hinhThuc === 'Nối' ? (
                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div>
                                          <label className="block text-xs font-bold text-slate-700 mb-1">
                                            Cột A (mỗi dòng 1 ý)
                                          </label>
                                          <textarea
                                            rows={3}
                                            value={(q.cotA || []).join('\n')}
                                            onChange={(e) =>
                                              handleUpdateQuestionField(qIdx, {
                                                cotA: e.target.value
                                                  .split('\n')
                                                  .map((s) => s.trim())
                                                  .filter(Boolean),
                                              })
                                            }
                                            className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-medium"
                                          />
                                        </div>
                                        <div>
                                          <label className="block text-xs font-bold text-slate-700 mb-1">
                                            Cột B (mỗi dòng 1 ý)
                                          </label>
                                          <textarea
                                            rows={3}
                                            value={(q.cotB || []).join('\n')}
                                            onChange={(e) =>
                                              handleUpdateQuestionField(qIdx, {
                                                cotB: e.target.value
                                                  .split('\n')
                                                  .map((s) => s.trim())
                                                  .filter(Boolean),
                                              })
                                            }
                                            className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-medium"
                                          />
                                        </div>
                                      </div>
                                    ) : (
                                      Array.isArray(q.luaChon) &&
                                      q.luaChon.length > 0 && (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                          {q.luaChon.map((opt, optIdx) => (
                                            <input
                                              key={optIdx}
                                              type="text"
                                              value={opt}
                                              onChange={(e) => {
                                                const nextOpts = [...(q.luaChon || [])];
                                                nextOpts[optIdx] = e.target.value;
                                                handleUpdateQuestionField(qIdx, {
                                                  luaChon: nextOpts,
                                                });
                                              }}
                                              className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold"
                                            />
                                          ))}
                                        </div>
                                      )
                                    )}

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                      <div>
                                        <label className="block text-xs font-bold text-slate-700 mb-1">
                                          Đáp án chính xác
                                        </label>
                                        <input
                                          type="text"
                                          value={q.dapAnChinhXac}
                                          onChange={(e) =>
                                            handleUpdateQuestionField(qIdx, {
                                              dapAnChinhXac: e.target.value,
                                            })
                                          }
                                          className="w-full px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-emerald-800"
                                        />
                                      </div>
                                      <div>
                                        <label className="block text-xs font-bold text-slate-700 mb-1">
                                          Hướng dẫn chấm
                                        </label>
                                        <input
                                          type="text"
                                          value={q.huongDanCham}
                                          onChange={(e) =>
                                            handleUpdateQuestionField(qIdx, {
                                              huongDanCham: e.target.value,
                                            })
                                          }
                                          className="w-full px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-medium"
                                        />
                                      </div>
                                    </div>
                                  </div>
                                ) : (
                                  <>
                                    <p className="text-sm font-bold text-slate-900 leading-relaxed">
                                      {q.noiDungCauHoi}
                                    </p>

                                    {q.hinhThuc === 'Nối' ? (
                                      <div className="overflow-x-auto">
                                        <table className="w-full border-collapse border border-slate-300 text-xs bg-white">
                                          <thead>
                                            <tr className="bg-slate-100 font-extrabold text-slate-800">
                                              <th className="border border-slate-300 px-3 py-2 text-left w-1/2">
                                                Cột A
                                              </th>
                                              <th className="border border-slate-300 px-3 py-2 text-left w-1/2">
                                                Cột B
                                              </th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {Array.from({
                                              length: Math.max(
                                                (q.cotA || []).length,
                                                (q.cotB || []).length
                                              ),
                                            }).map((_, rIdx) => (
                                              <tr key={rIdx}>
                                                <td className="border border-slate-300 px-3 py-2 text-slate-800 font-medium">
                                                  {q.cotA?.[rIdx] || ''}
                                                </td>
                                                <td className="border border-slate-300 px-3 py-2 text-slate-800 font-medium">
                                                  {q.cotB?.[rIdx] || ''}
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    ) : (
                                      Array.isArray(q.luaChon) &&
                                      q.luaChon.length > 0 && (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                          {q.luaChon.map((opt, optIdx) => (
                                            <div
                                              key={optIdx}
                                              className="px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-800"
                                            >
                                              {opt}
                                            </div>
                                          ))}
                                        </div>
                                      )
                                    )}

                                    <div className="text-xs font-bold text-emerald-700 bg-emerald-50/80 border border-emerald-200 rounded-xl px-3 py-2">
                                      ✓ Đáp án: {q.dapAnChinhXac}
                                    </div>
                                  </>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* PHẦN II: TỰ LUẬN */}
                      {tlList.length > 0 && (
                        <div className="space-y-4 pt-2">
                          <h4 className="text-sm font-black text-indigo-800 bg-indigo-50 border border-indigo-200 px-4 py-2 rounded-xl uppercase">
                            II. PHẦN TỰ LUẬN ({tlList.length} câu)
                          </h4>

                          {generatedPkg.questions.map((q, qIdx) => {
                            if (q.phan !== 'TU_LUAN') return null;
                            const isEditing = editingQuestionIdx === qIdx;

                            return (
                              <div
                                key={q.soThuTu}
                                className="rounded-2xl border border-slate-200 p-4 sm:p-5 bg-slate-50/50 space-y-3"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="flex items-center gap-2">
                                    <span className="px-2.5 py-1 rounded-lg bg-indigo-600 text-white text-xs font-extrabold">
                                      Câu {q.soThuTu} ({formatScoreVN(q.diem)} điểm)
                                    </span>
                                    <span className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-bold">
                                      {q.mucDo}
                                    </span>
                                    <span className="px-2.5 py-1 rounded-lg bg-slate-200 text-slate-800 text-xs font-bold">
                                      Tự luận
                                    </span>
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() =>
                                      setEditingQuestionIdx(isEditing ? null : qIdx)
                                    }
                                    className="px-3 py-1.5 rounded-xl text-xs font-bold bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 flex items-center gap-1.5 cursor-pointer"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                    <span>{isEditing ? 'Xong' : 'Sửa câu hỏi'}</span>
                                  </button>
                                </div>

                                {isEditing ? (
                                  <div className="space-y-3 bg-white p-4 rounded-xl border border-indigo-200">
                                    <div>
                                      <label className="block text-xs font-bold text-slate-700 mb-1">
                                        Nội dung câu hỏi tự luận
                                      </label>
                                      <textarea
                                        rows={2}
                                        value={q.noiDungCauHoi}
                                        onChange={(e) =>
                                          handleUpdateQuestionField(qIdx, {
                                            noiDungCauHoi: e.target.value,
                                          })
                                        }
                                        className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs sm:text-sm font-semibold text-slate-900 outline-none"
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-xs font-bold text-slate-700 mb-1">
                                        Đáp án / Lời giải chuẩn
                                      </label>
                                      <textarea
                                        rows={2}
                                        value={q.dapAnChinhXac}
                                        onChange={(e) =>
                                          handleUpdateQuestionField(qIdx, {
                                            dapAnChinhXac: e.target.value,
                                          })
                                        }
                                        className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-emerald-800 outline-none"
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-xs font-bold text-slate-700 mb-1">
                                        Hướng dẫn chấm chi tiết
                                      </label>
                                      <textarea
                                        rows={2}
                                        value={q.huongDanCham}
                                        onChange={(e) =>
                                          handleUpdateQuestionField(qIdx, {
                                            huongDanCham: e.target.value,
                                          })
                                        }
                                        className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-medium text-slate-700 outline-none"
                                      />
                                    </div>
                                  </div>
                                ) : (
                                  <>
                                    <p className="text-sm font-bold text-slate-900 leading-relaxed">
                                      {q.noiDungCauHoi}
                                    </p>
                                    <div className="bg-white rounded-xl p-3 border border-dashed border-slate-300 text-xs text-slate-400 space-y-1.5">
                                      <div className="font-bold text-slate-600 italic">Bài làm:</div>
                                      <div>................................................................................................................................................</div>
                                      <div>................................................................................................................................................</div>
                                    </div>
                                    <div className="text-xs font-bold text-emerald-800 bg-emerald-50/80 border border-emerald-200 rounded-xl px-3.5 py-2.5 space-y-1">
                                      <div>✓ Đáp án: {q.dapAnChinhXac}</div>
                                      <div className="text-slate-600 font-medium">
                                        💡 Hướng dẫn chấm: {q.huongDanCham}
                                      </div>
                                    </div>
                                  </>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB 4: ĐÁP ÁN & BIỂU ĐIỂM */}
                  {activeTab === 'answers' && (
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-4">
                      <div className="text-center space-y-1">
                        <h3 className="text-base font-black text-slate-900 uppercase">
                          IV. ĐÁP ÁN VÀ HƯỚNG DẪN CHẤM (BIỂU ĐIỂM)
                        </h3>
                        <p className="text-xs font-bold text-slate-600">
                          Môn: {generatedPkg.config.monHoc} • Khối {generatedPkg.config.khoiLop} •{' '}
                          {generatedPkg.config.thoiDiemKiemTra}
                        </p>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse border border-slate-400 text-xs">
                          <thead>
                            <tr className="bg-slate-100 text-slate-900 font-extrabold">
                              <th className="border border-slate-400 px-3 py-2.5 text-center w-16">
                                Câu
                              </th>
                              <th className="border border-slate-400 px-3 py-2.5 text-center w-40">
                                Mức độ / Dạng
                              </th>
                              <th className="border border-slate-400 px-3 py-2.5 text-left w-[28%]">
                                Đáp án chính xác
                              </th>
                              <th className="border border-slate-400 px-3 py-2.5 text-left">
                                Hướng dẫn chấm chi tiết
                              </th>
                              <th className="border border-slate-400 px-3 py-2.5 text-center w-24">
                                Biểu điểm
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {generatedPkg.questions.map((q) => (
                              <tr key={q.soThuTu} className="align-top hover:bg-slate-50">
                                <td className="border border-slate-400 px-3 py-3 text-center font-extrabold text-slate-900">
                                  Câu {q.soThuTu}
                                </td>
                                <td className="border border-slate-400 px-3 py-3 text-center">
                                  <div className="font-extrabold text-indigo-700">{q.mucDo}</div>
                                  <div className="text-[11px] text-slate-500 italic">({q.hinhThuc})</div>
                                </td>
                                <td className="border border-slate-400 px-3 py-3 font-bold text-emerald-800">
                                  {q.dapAnChinhXac}
                                </td>
                                <td className="border border-slate-400 px-3 py-3 text-slate-700 leading-relaxed">
                                  {q.huongDanCham}
                                </td>
                                <td className="border border-slate-400 px-3 py-3 text-center font-extrabold text-teal-700">
                                  {formatScoreVN(q.diem)} điểm
                                </td>
                              </tr>
                            ))}
                            <tr className="bg-emerald-50/80 font-extrabold text-slate-900">
                              <td
                                colSpan={4}
                                className="border border-slate-400 px-4 py-3 text-right uppercase"
                              >
                                Tổng điểm toàn bài
                              </td>
                              <td className="border border-slate-400 px-3 py-3 text-center text-emerald-700 text-sm">
                                10,0 điểm
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
