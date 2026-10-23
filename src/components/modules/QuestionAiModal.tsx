import React from 'react';
import {
  X,
  Sparkles,
  LayoutGrid,
  FileText,
  Upload,
  PenTool,
  Trash2,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Download,
  RotateCcw,
  AlertTriangle,
  FileSpreadsheet
} from 'lucide-react';
import { QUESTION_TYPES, getQuestionTypeLabel } from '../../lib/constants';
import { cleanQuestionMath } from '../../utils/mathFormatter';

interface QuestionAiModalProps {
  isOpen: boolean;
  onClose: () => void;
  quickLessonName: string;
  setQuickLessonName: (v: string) => void;
  quickGrade: string;
  setQuickGrade: (v: string) => void;
  quickSubject: string;
  setQuickSubject: (v: string) => void;
  quickExamType?: string;
  setQuickExamType?: (v: string) => void;
  quickLevelSelection: string;
  setQuickLevelSelection: (v: string) => void;
  quickSourceMode: 'standard' | 'paste' | 'file';
  setQuickSourceMode: (v: 'standard' | 'paste' | 'file') => void;
  quickCount: number;
  setQuickCount: (v: number) => void;
  quickRawText: string;
  setQuickRawText: (v: string) => void;
  uploadedFileName: string | null;
  setUploadedFileName: (v: string | null) => void;
  setUploadedFileContent: (v: string) => void;
  uploadedFileBase64?: string;
  setUploadedFileBase64?: (v: string) => void;
  uploadedFileType?: string;
  setUploadedFileType?: (v: string) => void;
  manualQuestionsList?: any[];
  setManualQuestionsList?: (v: any[]) => void;
  lessonNameError: boolean;
  setLessonNameError: (v: boolean) => void;
  isGenerating: boolean;
  isSaving?: boolean;
  saveError?: string | null;
  onDownloadBackup?: (format: 'json' | 'excel') => void;
  generationError: string | null;
  isPreviewStep: boolean;
  setIsPreviewStep: (v: boolean) => void;
  previewQuestions: any[];
  handleStartCreateExam: () => void;
  handleConfirmSave: () => void;
  GRADES: string[];
  SUBJECTS: string[];
  EXAM_TYPES: string[];
  blueprint?: any;
}

const getLevelLabel = (level?: string) => {
  if (!level) return 'Nhận biết';
  const clean = level.toLowerCase().replace(/-/g, '_').trim();
  switch (clean) {
    case 'nhan_biet':
    case 'nhận_biết':
    case 'nhận biết':
      return 'Nhận biết';
    case 'thong_hieu':
    case 'thông_hiểu':
    case 'thông hiểu':
      return 'Thông hiểu';
    case 'van_dung':
    case 'vận_dụng':
    case 'vận dụng':
      return 'Vận dụng';
    case 'van_dung_cao':
    case 'vận_dụng_cao':
    case 'vận dụng cao':
      return 'Vận dụng cao';
    default:
      return level;
  }
};

const getTypeLabel = (type?: string) => {
  return getQuestionTypeLabel(type || 'multiple_choice');
};

export const QuestionAiModal: React.FC<QuestionAiModalProps> = ({
  isOpen,
  onClose,
  quickLessonName,
  setQuickLessonName,
  quickGrade,
  setQuickGrade,
  quickSubject,
  setQuickSubject,
  quickExamType,
  setQuickExamType,
  quickLevelSelection,
  setQuickLevelSelection,
  quickSourceMode,
  setQuickSourceMode,
  quickCount,
  setQuickCount,
  quickRawText,
  setQuickRawText,
  uploadedFileName,
  setUploadedFileName,
  setUploadedFileContent,
  uploadedFileBase64,
  setUploadedFileBase64,
  uploadedFileType,
  setUploadedFileType,
  manualQuestionsList,
  setManualQuestionsList,
  lessonNameError,
  setLessonNameError,
  isGenerating,
  isSaving = false,
  saveError = null,
  onDownloadBackup,
  generationError,
  isPreviewStep,
  setIsPreviewStep,
  previewQuestions,
  handleStartCreateExam,
  handleConfirmSave,
  GRADES,
  SUBJECTS,
  EXAM_TYPES,
  blueprint,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden border border-slate-100">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <h3 className="text-xl font-semibold text-slate-800">TRUNG TÂM TẠO CÂU HỎI TỰ ĐỘNG</h3>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {!isPreviewStep ? (
            <>
              {/* Top Configuration Fields (4 fields) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3.5">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Chủ đề đề mới <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={quickLessonName}
                    onChange={(e) => {
                      setQuickLessonName(e.target.value);
                      if (lessonNameError) setLessonNameError(false);
                    }}
                    placeholder="Nhập chủ đề đề thi..."
                    className={`w-full px-3 py-2 text-sm rounded-xl border ${
                      lessonNameError ? 'border-rose-400 bg-rose-50 ring-2 ring-rose-200' : 'border-slate-200 bg-white'
                    } outline-none focus:ring-2 focus:ring-teal-500 font-normal text-slate-800 placeholder-slate-400`}
                  />
                  {lessonNameError && (
                    <span className="text-xs text-rose-600 font-medium block mt-1">
                      ⚠️ Vui lòng nhập chủ đề
                    </span>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Chọn khối
                  </label>
                  <select
                    value={quickGrade}
                    onChange={(e) => setQuickGrade(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white outline-none focus:ring-2 focus:ring-teal-500 font-medium text-slate-800 cursor-pointer"
                  >
                    {GRADES.map((grade) => (
                      <option key={grade} value={grade}>{grade}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Chọn môn học
                  </label>
                  <select
                    value={quickSubject}
                    onChange={(e) => setQuickSubject(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white outline-none focus:ring-2 focus:ring-teal-500 font-medium text-slate-800 cursor-pointer"
                  >
                    {SUBJECTS.map((subject) => (
                      <option key={subject} value={subject}>{subject}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Mức độ
                  </label>
                  <select
                    value={quickLevelSelection}
                    onChange={(e) => setQuickLevelSelection(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white outline-none focus:ring-2 focus:ring-teal-500 font-medium text-slate-800 cursor-pointer"
                  >
                    <option value="all3">Cả 3 mức độ</option>
                    <option value="all4">Cả 4 mức độ</option>
                    <option value="nhan_biet">Nhận biết</option>
                    <option value="thong_hieu">Thông hiểu</option>
                    <option value="van_dung">Vận dụng</option>
                    <option value="van_dung_cao">Vận dụng cao</option>
                  </select>
                </div>
              </div>

              {/* Phương thức tạo đề */}
              <div className="space-y-2 pt-1">
                <label className="block text-sm font-medium text-slate-700">
                  Phương thức tạo đề <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                  {[
                    { id: 'standard', name: 'Cấu trúc chuẩn', icon: LayoutGrid },
                    { id: 'paste', name: 'Dán đề mẫu', icon: FileText },
                    { id: 'file', name: 'Tải File PDF/Word', icon: Upload },
                  ].map((method) => {
                    const isSelected = quickSourceMode === method.id;
                    const Icon = method.icon;
                    return (
                      <button
                        key={method.id}
                        type="button"
                        onClick={() => setQuickSourceMode(method.id as any)}
                        className={`p-3.5 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-2 group relative ${
                          isSelected
                            ? 'border-[#C7D2FE] bg-[#EEF2FF] text-[#4F46E5] ring-2 ring-indigo-200/50 shadow-xs font-semibold'
                            : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50/50'
                        }`}
                      >
                        <Icon className={`w-5 h-5 ${isSelected ? 'text-[#4F46E5]' : 'text-gray-600'}`} />
                        <span className="text-xs">{method.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Method Content */}
              <div className="pt-2">
                {/* 1. CẤU TRÚC CHUẨN */}
                {quickSourceMode === 'standard' && blueprint && (
                  <div className="space-y-4 animate-fade-in bg-gray-50/50 p-4 rounded-xl border border-gray-200">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-xs font-semibold text-gray-800">{blueprint.title}</h4>
                        <p className="text-xs text-gray-500">Tổng thời gian: {blueprint.durationMinutes} phút - Tổng điểm: {blueprint.totalPoints}</p>
                      </div>
                      <div className="flex items-center gap-2 text-xs font-medium text-gray-700">
                        <span>Số lượng câu:</span>
                        <input
                          type="number"
                          readOnly
                          value={blueprint.parts.reduce((sum: number, p: any) => sum + p.questions.length, 0)}
                          className="w-16 px-2 py-1 border border-gray-200 rounded-lg text-center font-medium text-gray-800 bg-gray-100"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                      {blueprint.parts.map((part: any, pIdx: number) => (
                        <div key={pIdx} className="bg-white p-3 rounded-xl border border-gray-200 shadow-2xs">
                          <div className="font-semibold text-gray-800 mb-2">{part.partName} ({part.points} điểm)</div>
                          <div className="space-y-1">
                            {part.questions.map((q: any, qIdx: number) => (
                              <div key={qIdx} className="flex justify-between text-gray-600">
                                <span>Câu {q.questionNumber}: {q.type === 'single_choice' ? 'Trắc nghiệm đơn' : q.type === 'multi_choice' ? 'Chọn nhiều' : q.type === 'true_false' ? 'Đúng/Sai' : 'Tự luận'}</span>
                                <span className="font-medium text-gray-800">{q.points} điểm</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {quickSourceMode === 'standard' && !blueprint && (
                    <div className="p-4 text-xs text-amber-800 bg-amber-50 rounded-xl border border-amber-200">
                        Chưa chọn cấu trúc đề thi.
                    </div>
                )}

                {/* 2. DÁN ĐỀ MẪU */}
                {quickSourceMode === 'paste' && (
                  <div className="space-y-3 animate-fade-in">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-bold text-slate-800">
                        Nội dung đề mẫu
                      </label>
                      <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                        <span>Số lượng câu cần:</span>
                        <input
                          type="number"
                          min={1}
                          max={50}
                          value={quickCount}
                          onChange={(e) => setQuickCount(parseInt(e.target.value) || 10)}
                          className="w-16 px-2 py-1 border border-slate-200 rounded-lg text-center font-bold text-slate-800 outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                        />
                      </div>
                    </div>

                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Dán tất cả câu hỏi trắc nghiệm, tự luận, phương án lựa chọn và đáp án của bạn. AI sẽ quét và tự động phân loại, trích xuất cấu trúc đề thi.
                    </p>

                    <textarea
                      rows={6}
                      value={quickRawText}
                      onChange={(e) => setQuickRawText(e.target.value)}
                      placeholder={`Ví dụ:\nCâu 1: Thiết bị nào sau đây là thiết bị vào?\nA. Chuột\nB. Màn hình\nC. Máy in\nD. Loa\nĐáp án đúng: A`}
                      className="w-full p-3.5 text-xs border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 placeholder-slate-400 font-medium text-slate-800 shadow-2xs"
                    />

                    <div className="flex items-center justify-between text-[11px] text-slate-400 bg-slate-50 p-2.5 rounded-lg border border-slate-200/60">
                      <span>💡 Gợi ý: AI hỗ trợ nhận diện và bóc tách nhiều dạng câu hỏi cùng một lúc.</span>
                      <button
                        type="button"
                        onClick={() => {
                          setQuickLessonName('Chủ đề: Thiết bị Vào - Ra');
                          setQuickGrade('Khối 4');
                          setQuickSubject('Tin học');
                          setQuickRawText(`Câu 1: Thiết bị nào sau đây là thiết bị vào?
A. Chuột
B. Màn hình
C. Máy in
D. Loa
Đáp án đúng: A

Câu 2: Thiết bị nào sau đây dùng để hiển thị kết quả làm việc của máy tính?
A. Bàn phím
B. Màn hình
C. Chuột
D. Máy quét
Đáp án đúng: B

Câu 3: Đâu là thiết bị vừa có thể tiếp nhận thông tin vào vừa đưa thông tin ra?
A. Màn hình cảm ứng
B. Loa nghe nhạc
C. Chuột máy tính
D. Bàn phím cơ
Đáp án đúng: A`);
                        }}
                        className="text-teal-700 font-bold hover:underline cursor-pointer"
                      >
                        Dán nội dung mẫu Tin học 4
                      </button>
                    </div>
                  </div>
                )}

                {/* 3. TẢI FILE PDF/WORD */}
                {quickSourceMode === 'file' && (
                  <div className="space-y-3 animate-fade-in">
                    <div 
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const file = e.dataTransfer.files?.[0];
                        if (file) {
                          setUploadedFileName(file.name);
                          if (setUploadedFileType) {
                            setUploadedFileType(file.type || (file.name.endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream'));
                          }
                          const cleanName = file.name.replace(/\.[^/.]+$/, "");
                          if (!quickLessonName.trim()) {
                            setQuickLessonName(cleanName);
                            if (lessonNameError) setLessonNameError(false);
                          }
                          
                          // Read base64
                          const reader = new FileReader();
                          reader.onload = (event) => {
                            const dataUrl = event.target?.result as string;
                            if (setUploadedFileBase64) {
                              setUploadedFileBase64(dataUrl || '');
                            }
                          };
                          reader.readAsDataURL(file);

                          // Also read text for text/csv files
                          const textReader = new FileReader();
                          textReader.onload = (event) => {
                            const text = event.target?.result as string;
                            setUploadedFileContent(text || '');
                          };
                          textReader.readAsText(file);
                        }
                      }}
                      onClick={() => document.getElementById('ai-file-uploader-modal')?.click()}
                      className="border-2 border-dashed border-teal-300 hover:border-teal-500 rounded-2xl p-6 text-center bg-teal-50/30 hover:bg-teal-50/60 transition-all space-y-3 relative group cursor-pointer"
                    >
                      <input
                        id="ai-file-uploader-modal"
                        type="file"
                        accept=".txt,.csv,.doc,.docx,.pdf,.xlsx"
                        className="hidden"
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            setUploadedFileName(file.name);
                            if (setUploadedFileType) {
                              setUploadedFileType(file.type || (file.name.endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream'));
                            }
                            const cleanName = file.name.replace(/\.[^/.]+$/, "");
                            if (!quickLessonName.trim()) {
                              setQuickLessonName(cleanName);
                              if (lessonNameError) setLessonNameError(false);
                            }
                            
                            // Read base64
                            const reader = new FileReader();
                            reader.onload = (event) => {
                              const dataUrl = event.target?.result as string;
                              if (setUploadedFileBase64) {
                                setUploadedFileBase64(dataUrl || '');
                              }
                            };
                            reader.readAsDataURL(file);

                            // Also read text for text/csv files
                            const textReader = new FileReader();
                            textReader.onload = (event) => {
                              const text = event.target?.result as string;
                              setUploadedFileContent(text || '');
                            };
                            textReader.readAsText(file);
                          }
                        }}
                      />
                      <Upload className="w-8 h-8 text-teal-600 mx-auto animate-bounce" />
                      <div className="text-xs font-bold text-slate-800">
                        Kéo thả hoặc click để chọn file tài liệu của bạn (PDF / Word / TXT / Excel)
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Hỗ trợ tệp lên tới 15MB, tự động nhận diện và trích xuất câu hỏi
                      </p>

                      {uploadedFileName ? (
                        <div className="flex items-center justify-center gap-2 mt-3" onClick={(e) => e.stopPropagation()}>
                          <span className="text-xs font-bold text-teal-900 bg-teal-100 border border-teal-300 py-1.5 px-3.5 rounded-xl inline-flex items-center gap-2 shadow-2xs">
                            📄 {uploadedFileName}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setUploadedFileName(null);
                                setUploadedFileContent('');
                                if (setUploadedFileBase64) setUploadedFileBase64('');
                                if (setUploadedFileType) setUploadedFileType('');
                              }}
                              className="p-0.5 hover:bg-teal-200 rounded-full text-teal-700 hover:text-teal-900 transition-colors"
                              title="Gỡ tệp"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </span>
                        </div>
                      ) : (
                        <div className="text-[10px] text-teal-700 font-medium">
                          Chưa có file nào được chọn
                        </div>
                      )}
                    </div>
                  </div>
                )}


              </div>

              {/* Status and error feedback */}
              {generationError && (
                <div className="p-3.5 bg-amber-50 text-amber-900 border border-amber-300 rounded-xl text-xs font-semibold flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-base">⚠️</span>
                    <span className="break-words">
                      {generationError}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleStartCreateExam}
                    disabled={isGenerating}
                    className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 active:scale-95 text-white rounded-lg text-xs font-bold transition-all shadow-xs shrink-0 cursor-pointer disabled:opacity-50"
                  >
                    🔄 Thử lại ngay
                  </button>
                </div>
              )}

              {isGenerating && (
                <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 flex items-center gap-3 animate-pulse">
                  <div className="w-4 h-4 border-2 border-teal-600 border-t-transparent rounded-full animate-spin shrink-0"></div>
                  <div className="text-xs font-bold text-teal-900">
                    Trợ lý AI đang thực hiện bóc tách, chuẩn hóa và khởi tạo các câu hỏi sư phạm... Vui lòng đợi trong giây lát!
                  </div>
                </div>
              )}
            </>
          ) : (
            /* PREVIEW STEP */
            <div className="space-y-4 animate-fade-in">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div>
                  <h4 className="text-base font-semibold text-slate-900">Xem trước danh sách câu hỏi đã tạo</h4>
                  <p className="text-sm text-slate-500">Đã khởi tạo thành công {previewQuestions.length} câu hỏi chuẩn sư phạm</p>
                </div>
                <span className="px-3 py-1 bg-emerald-100 text-emerald-800 rounded-md font-medium text-xs border border-emerald-200">
                  {previewQuestions.length} câu hỏi
                </span>
              </div>

              {saveError && (
                <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-900 space-y-2.5 shadow-xs">
                  <div className="flex items-start gap-2.5 font-semibold">
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <div className="text-amber-900 font-bold text-sm">Ghi dữ liệu vào CSDL Firestore bị gián đoạn hoặc từ chối</div>
                      <div className="font-medium text-xs text-amber-800 mt-1 break-words bg-white/70 p-2 rounded-lg border border-amber-200">{saveError}</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-amber-200/60 text-[11px] text-amber-800">
                    <span>💡 Danh sách <strong>{previewQuestions.length} câu hỏi</strong> trong màn hình này được giữ nguyên 100%. Bạn không bị mất dữ liệu!</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onDownloadBackup?.('json')}
                        className="px-2.5 py-1 bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-lg font-bold flex items-center gap-1 transition-all cursor-pointer shadow-2xs"
                      >
                        <Download className="w-3.5 h-3.5" /> Tải JSON
                      </button>
                      <button
                        type="button"
                        onClick={() => onDownloadBackup?.('excel')}
                        className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold flex items-center gap-1 transition-all cursor-pointer shadow-2xs"
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5" /> Tải Excel/CSV
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                {previewQuestions.map((rawQ, idx) => {
                  const q = cleanQuestionMath(rawQ);
                  return (
                    <div key={q.id || idx} className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200/60">
                        <span className="font-semibold text-sm text-teal-900">
                          Câu {idx + 1}
                        </span>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="px-2.5 py-0.5 rounded-md text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">
                            Mức độ: {getLevelLabel(q.level)}
                          </span>
                          <span className="px-2.5 py-0.5 rounded-md text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200">
                            Loại: {getTypeLabel(q.type)}
                          </span>
                        </div>
                      </div>
                      <p className="text-base text-slate-800 font-medium leading-relaxed">{q.content}</p>
                      {q.options && q.options.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                          {q.options.map((opt: string, oIdx: number) => (
                            <div
                              key={oIdx}
                              className={`p-2.5 rounded-lg text-sm border ${
                                opt.startsWith(q.correctAnswer) || opt.includes('Đáp án đúng')
                                  ? 'bg-emerald-50 border-emerald-300 text-emerald-900 font-medium'
                                  : 'bg-white border-slate-200 text-slate-700 font-normal'
                              }`}
                            >
                              {opt}
                            </div>
                          ))}
                        </div>
                      )}
                      {q.explanation && (
                        <div className="text-sm text-slate-600 bg-white p-2.5 rounded-lg border border-slate-100 font-normal">
                          💡 <span className="font-medium text-slate-800">Giải thích:</span> {q.explanation}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 px-6 py-4 border-t border-slate-100 shrink-0 w-full">
          {isPreviewStep ? (
            <>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsPreviewStep(false)}
                  disabled={isSaving}
                  className="px-3.5 py-2 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl flex items-center gap-1.5 cursor-pointer transition-all active:scale-98 disabled:opacity-50"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Quay lại
                </button>

                <button
                  type="button"
                  onClick={() => onDownloadBackup?.('excel')}
                  disabled={previewQuestions.length === 0}
                  className="px-3.5 py-2 text-xs font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl flex items-center gap-1.5 cursor-pointer transition-all shadow-2xs"
                  title="Tải bản sao dạng Excel / CSV"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Tải bản sao (Excel)</span>
                </button>

                <button
                  type="button"
                  onClick={() => onDownloadBackup?.('json')}
                  disabled={previewQuestions.length === 0}
                  className="px-3 py-2 text-xs font-semibold bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 rounded-xl flex items-center gap-1.5 cursor-pointer transition-all shadow-2xs"
                  title="Tải bản sao dạng JSON"
                >
                  <Download className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Tải JSON</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl cursor-pointer transition-colors"
                >
                  Đóng
                </button>

                <button
                  type="button"
                  onClick={handleConfirmSave}
                  disabled={previewQuestions.length === 0 || isSaving}
                  className={`px-5 py-2 text-xs font-semibold rounded-xl flex items-center gap-2 shadow-md cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:scale-98 transition-all ${
                    saveError
                      ? 'bg-amber-600 hover:bg-amber-700 text-white shadow-amber-200/80'
                      : 'bg-[#4F46E5] hover:bg-[#4338CA] text-white shadow-indigo-200/80'
                  }`}
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 text-white animate-spin" />
                      <span>Đang lưu vào CSDL...</span>
                    </>
                  ) : saveError ? (
                    <>
                      <RotateCcw className="w-4 h-4 text-amber-100" />
                      <span>Thử lưu lại CSDL ({previewQuestions.length} câu)</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-indigo-100" />
                      <span>Xác nhận lưu vào Ngân hàng ({previewQuestions.length} câu)</span>
                    </>
                  )}
                </button>
              </div>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                disabled={isGenerating}
                className="px-5 py-2.5 text-sm font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-xl cursor-pointer disabled:opacity-50 transition-colors"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleStartCreateExam}
                disabled={isGenerating || (quickSourceMode === 'file' && !uploadedFileName)}
                className="px-6 py-2.5 text-sm font-medium bg-[#7C3AED] hover:bg-[#6D28D9] text-white rounded-xl flex items-center gap-2 shadow-sm shadow-purple-700/20 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-98"
              >
                {isGenerating ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Đang xử lý tạo đề...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-amber-300" />
                    <span>BẮT ĐẦU TẠO CÂU HỎI</span>
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
