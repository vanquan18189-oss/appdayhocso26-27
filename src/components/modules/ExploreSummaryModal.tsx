import React from 'react';
import { 
  Award, 
  RotateCcw, 
  CheckCircle2, 
  Check, 
  X, 
  Lightbulb, 
  Clock, 
  Target, 
  Play
} from 'lucide-react';
import { VideoCheckpoint } from './InteractiveVideoPlayer';

export interface ExploreSummaryData {
  accuracy: number;
  correctCount: number;
  totalQuestions: number;
}

export interface ExploreSummaryModalProps {
  title?: string;
  checkpoints: VideoCheckpoint[];
  answeredCheckpoints: Record<string, { selected: any; correct: boolean; question: VideoCheckpoint }>;
  coreSummary?: string;
  onReplay: () => void;
  onComplete: (data?: ExploreSummaryData) => void;
  onClose?: () => void;
  onSeek?: (timestamp: number) => void;
}

const formatTime = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const renderUserSelection = (item?: { selected: any; question?: VideoCheckpoint }, fallbackCp?: VideoCheckpoint) => {
  if (!item || item.selected === undefined || item.selected === null || item.selected === '') return '(Chưa trả lời)';
  const q = item.question || fallbackCp || ({} as VideoCheckpoint);
  const qType = q.type || q.question?.type || (q as any)?.questionType || 'multiple_choice';
  
  if (qType === 'multiple_choice') {
    let idx = 0;
    if (typeof item.selected === 'number') {
      idx = item.selected;
    } else if (typeof item.selected === 'string' && item.selected.length === 1 && item.selected.toUpperCase() >= 'A' && item.selected.toUpperCase() <= 'Z') {
      idx = item.selected.toUpperCase().charCodeAt(0) - 65;
    }
    const optText = q.options && q.options[idx] !== undefined ? q.options[idx] : String(item.selected ?? '');
    const letter = String.fromCharCode(65 + Math.max(0, idx));
    return `${letter}. ${optText}`;
  }
  if (qType === 'multiple_response') {
    if (Array.isArray(item.selected)) {
      return item.selected
        .map((idx: number) => `${String.fromCharCode(65 + idx)}. ${q.options?.[idx] || ''}`)
        .join('; ');
    }
    return String(item.selected);
  }
  if (qType === 'true_false') {
    if (typeof item.selected === 'object' && item.selected !== null) {
      const entries = Object.entries(item.selected);
      if (entries.length > 0) {
        return entries.map(([i, v]) => `Ý ${Number(i) + 1}: ${v ? 'Đúng' : 'Sai'}`).join(' | ');
      }
    }
    return String(item.selected ?? 'Chưa trả lời');
  }
  if (qType === 'fill_blank' || qType === 'essay') {
    return String(item.selected || '(Chưa nhập)');
  }
  if (qType === 'ordering') {
    return Array.isArray(item.selected) ? item.selected.join(' ➔ ') : String(item.selected ?? 'Chưa sắp xếp');
  }
  if (qType === 'matching') {
    if (typeof item.selected === 'object' && item.selected !== null) {
      return Object.entries(item.selected).map(([k, v]) => `Cặp ${Number(k) + 1} ➔ ${v}`).join('; ');
    }
    return 'Chưa ghép nối';
  }
  if (qType === 'classification') {
    if (typeof item.selected === 'object' && item.selected !== null) {
      return Object.entries(item.selected).map(([k, v]) => `Mục ${Number(k) + 1}: ${v}`).join('; ');
    }
    return 'Chưa phân loại';
  }
  return String(item.selected ?? 'Chưa trả lời');
};

const renderCorrectAnswer = (q?: VideoCheckpoint) => {
  if (!q) return 'Xem giải thích chi tiết';
  const qType = q.type || q.question?.type || (q as any)?.questionType || 'multiple_choice';
  if (qType === 'multiple_choice') {
    let idx = q.correctIndex;
    if (idx === undefined && q.correctAnswer) {
      const norm = String(q.correctAnswer).trim().toUpperCase();
      if (norm.length === 1 && norm >= 'A' && norm <= 'Z') {
        idx = norm.charCodeAt(0) - 65;
      }
    }
    const finalIdx = idx ?? 0;
    const optText = q.options && q.options[finalIdx] ? q.options[finalIdx] : (q.correctAnswer || 'A');
    return `${String.fromCharCode(65 + finalIdx)}. ${optText}`;
  }
  if (qType === 'multiple_response') {
    return q.correctAnswer || 'Xem hướng dẫn chi tiết';
  }
  if (qType === 'fill_blank') {
    return q.correctAnswer || q.question?.correctAnswer || 'Đáp án chính xác';
  }
  if (qType === 'ordering') {
    return q.options ? q.options.join(' ➔ ') : 'Thứ tự chuẩn';
  }
  if (qType === 'true_false') {
    if (q.statements && q.statements.length > 0) {
      return q.statements.map((s, i) => `Ý ${i + 1}: ${s.isCorrect ? 'Đúng' : 'Sai'}`).join(' | ');
    }
  }
  return q.correctAnswer || 'Xem giải thích chi tiết';
};

export const ExploreSummaryModal: React.FC<ExploreSummaryModalProps> = ({
  title = 'Bài học khám phá',
  checkpoints = [],
  answeredCheckpoints = {},
  coreSummary = '',
  onReplay,
  onComplete,
  onClose,
  onSeek
}) => {
  const totalQuestions = checkpoints.length;
  const correctCount = Object.values(answeredCheckpoints).filter(item => item?.correct).length;
  const percentage = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 100;

  // Extract 2-3 key takeaways from coreSummary
  const keyTakeaways: string[] = (() => {
    if (!coreSummary || !coreSummary.trim()) {
      return [];
    }
    const lines = coreSummary
      .split(/\r?\n|•|-|\+/)
      .map(s => s.trim())
      .filter(s => s.length > 5);

    if (lines.length > 0) {
      return lines.slice(0, 4);
    }
    // Split by sentence if single long paragraph
    const sentences = coreSummary
      .split(/(?<=[.!?])\s+/)
      .map(s => s.trim())
      .filter(s => s.length > 8);
    return sentences.slice(0, 3);
  })();

  return (
    <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md z-[99999] flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-in fade-in duration-300">
      <div 
        className="bg-slate-900 border border-indigo-500/40 rounded-3xl p-5 sm:p-8 max-w-3xl w-full shadow-2xl space-y-6 text-white my-auto relative max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* CLOSE BUTTON */}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="absolute top-5 right-5 p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-all cursor-pointer z-10"
            title="Đóng cửa sổ tổng kết"
          >
            <X className="w-5 h-5" />
          </button>
        )}
        
        {/* HEADER */}
        <div className="text-center space-y-2 pt-1">
          <div className="inline-flex w-16 h-16 rounded-3xl bg-amber-400/20 text-amber-400 border border-amber-400/30 items-center justify-center shadow-lg mb-1 animate-bounce">
            <Award className="w-8 h-8" />
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
            Tổng Kết Hoạt Động Khám Phá!
          </h2>
          <p className="text-xs sm:text-sm text-indigo-300 font-medium">
            📖 {title}
          </p>
        </div>

        {/* SUMMARY STATS ROW (3 METRICS) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-800/80 p-4 rounded-2xl border border-slate-700/80">
          
          {/* Metric 1: Correct count */}
          <div className="flex items-center gap-3 p-2 rounded-xl bg-slate-900/50 border border-slate-800">
            <div className="w-10 h-10 rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/30 flex items-center justify-center font-bold shrink-0">
              <Target className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Kết quả câu hỏi mốc</span>
              <span className="text-sm sm:text-base font-extrabold text-white">
                {totalQuestions > 0 ? `${correctCount} / ${totalQuestions} câu đúng` : 'Không có câu hỏi mốc'}
              </span>
            </div>
          </div>

          {/* Metric 2: Percentage progress */}
          <div className="flex items-center gap-3 p-2 rounded-xl bg-slate-900/50 border border-slate-800">
            <div className="w-10 h-10 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-extrabold text-xs shrink-0">
              {percentage}%
            </div>
            <div className="flex-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Tỷ lệ chính xác</span>
              <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden mt-1">
                <div 
                  className="h-full rounded-full transition-all duration-500 bg-gradient-to-r from-teal-400 to-emerald-500" 
                  style={{ width: `${percentage}%` }} 
                />
              </div>
            </div>
          </div>

          {/* Metric 3: Status */}
          <div className="flex items-center gap-3 p-2 rounded-xl bg-slate-900/50 border border-slate-800">
            <div className="w-10 h-10 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/30 flex items-center justify-center font-bold shrink-0">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Trạng thái</span>
              <span className="text-xs sm:text-sm font-extrabold text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Hoàn tất mốc video</span>
              </span>
            </div>
          </div>

        </div>

        {/* SECTION 1: GHI NHỚ NHANH - TRÍCH XUẤT TỪ NỘI DUNG GIÁO VIÊN SOẠN */}
        <div className="bg-indigo-950/60 border border-indigo-500/30 p-5 rounded-2xl space-y-3">
          <div className="flex items-center gap-2 text-xs font-extrabold text-indigo-300 uppercase tracking-wider">
            <Lightbulb className="w-4 h-4 text-amber-300" />
            <span>📌 Ghi nhớ nhanh nội dung Khám phá</span>
          </div>

          {keyTakeaways.length > 0 ? (
            <ul className="space-y-2 text-xs sm:text-sm text-slate-200">
              {keyTakeaways.map((point, pIdx) => (
                <li key={pIdx} className="flex items-start gap-2.5 leading-relaxed font-medium">
                  <span className="w-5 h-5 rounded-lg bg-indigo-500/20 text-indigo-300 text-xs flex items-center justify-center shrink-0 mt-0.5 font-bold">
                    {pIdx + 1}
                  </span>
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          ) : coreSummary && coreSummary.trim() ? (
            <p className="text-xs sm:text-sm text-slate-200 leading-relaxed font-medium">
              {coreSummary}
            </p>
          ) : (
            <p className="text-xs text-slate-400 italic">
              Chưa có ghi chú nội dung cho hoạt động Khám phá.
            </p>
          )}
        </div>

        {/* SECTION 2: DANH SÁCH CHI TIẾT TỪNG CÂU HỎI MỐC */}
        {totalQuestions > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-1 border-b border-slate-800">
              <span className="text-xs font-extrabold text-purple-300 uppercase tracking-wider">
                Chi tiết câu hỏi mốc trong video ({correctCount}/{totalQuestions} câu đúng)
              </span>
              <span className="text-[11px] text-slate-400">
                Các câu chưa đúng được tô nổi bật để em dễ dàng ôn lại
              </span>
            </div>

            <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
              {checkpoints.map((cp, idx) => {
                const ansItem = answeredCheckpoints[cp.id];
                const isAnswered = Boolean(ansItem);
                const isCorrect = Boolean(ansItem?.correct);
                const qContent = cp.questionText || cp.question?.content || `Câu hỏi mốc ${idx + 1}`;
                const qExpl = cp.explanation || cp.question?.explanation;

                return (
                  <div
                    key={cp.id || idx}
                    className={`p-4 rounded-2xl transition-all space-y-3 ${
                      !isCorrect 
                        ? 'bg-rose-950/30 border-2 border-rose-500/60 shadow-md shadow-rose-950/20' 
                        : 'bg-slate-800/80 border border-slate-700 shadow-xs'
                    }`}
                  >
                    {/* Header line */}
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-0.5 rounded-lg text-xs font-black bg-purple-500/20 text-purple-300 border border-purple-500/30">
                          Câu {idx + 1} ({formatTime(cp.timestamp)})
                        </span>
                        <span className="text-xs text-slate-300 font-semibold truncate max-w-sm sm:max-w-md">
                          {qContent}
                        </span>
                      </div>

                      {/* Result badge */}
                      {isCorrect ? (
                        <span className="px-2.5 py-1 rounded-xl text-[11px] font-black bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1 shrink-0">
                          <Check className="w-3.5 h-3.5" /> Đúng
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-xl text-[11px] font-black bg-rose-500/20 text-rose-300 border border-rose-500/40 flex items-center gap-1 shrink-0">
                          <X className="w-3.5 h-3.5" /> Chưa đúng
                        </span>
                      )}
                    </div>

                    {/* Answers details */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-1">
                      <div className={`p-2.5 rounded-xl border flex items-start gap-2 ${
                        isCorrect ? 'bg-slate-900/60 border-slate-700/80 text-slate-200' : 'bg-rose-950/40 border-rose-500/40 text-rose-200'
                      }`}>
                        <span className="font-bold text-slate-400 shrink-0">Em đã chọn:</span>
                        <span className="font-semibold">{renderUserSelection(ansItem, cp)}</span>
                      </div>

                      <div className="p-2.5 rounded-xl border bg-slate-900/60 border-slate-700/80 text-emerald-300 flex items-start gap-2">
                        <span className="font-bold text-slate-400 shrink-0">Đáp án chuẩn:</span>
                        <span className="font-bold">{renderCorrectAnswer(cp)}</span>
                      </div>
                    </div>

                    {/* Teacher Explanation */}
                    {qExpl && (
                      <div className="p-3 rounded-xl bg-slate-900/70 border border-slate-800 text-xs text-slate-300 space-y-0.5">
                        <strong className="text-indigo-300 block font-bold">💡 Giải thích của giáo viên:</strong>
                        <p className="leading-relaxed">{qExpl}</p>
                      </div>
                    )}

                    {/* Seek button for incorrect questions */}
                    {!isCorrect && onSeek && (
                      <div className="flex justify-end pt-1">
                        <button
                          type="button"
                          onClick={() => onSeek(cp.timestamp)}
                          className="px-4 py-2 rounded-xl bg-rose-600/90 hover:bg-rose-600 text-white font-extrabold text-xs transition-all shadow-md flex items-center gap-2 cursor-pointer active:scale-95"
                        >
                          <Play className="w-3.5 h-3.5 fill-white" />
                          <span>Xem lại đoạn video ({formatTime(cp.timestamp)})</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ACTIONS FOOTER (3 BUTTONS) */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-800">
          <button
            type="button"
            onClick={onReplay}
            className="w-full sm:w-auto px-5 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl transition-all border border-slate-700 flex items-center justify-center gap-2 cursor-pointer shadow-sm"
          >
            <RotateCcw className="w-4 h-4" />
            <span>🔄 Học lại phần Khám phá</span>
          </button>

          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="w-full sm:w-auto px-5 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl transition-all border border-slate-700 flex items-center justify-center cursor-pointer"
              >
                <span>Đóng</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                if (onComplete) {
                  onComplete({ accuracy: percentage, correctCount, totalQuestions });
                }
              }}
              className="w-full sm:w-auto px-7 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-xs sm:text-sm rounded-xl transition-all shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2 cursor-pointer active:scale-98"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>✅ Hoàn tất & Tiếp tục</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
