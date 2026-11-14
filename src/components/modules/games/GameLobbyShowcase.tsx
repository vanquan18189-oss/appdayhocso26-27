import React, { useState } from 'react';
import { Sparkles, Loader2, Wand2, BookOpen, CheckCircle2, Rocket, BookmarkPlus, ChevronDown } from 'lucide-react';
import { GameItem, GameType, UserRole } from '../../../types';
import { generateExamQuestionsAI } from '../../../services/geminiService';
import { GRADES } from '../../../lib/constants';
import {
  GoldenBellIllustration,
  FlashcardsIllustration,
  BoatRaceIllustration,
} from './GameIllustrations';
import {
  PRIMARY_SUBJECTS_CATALOG,
  getSuggestionsForSubjectAndGrade,
} from './primarySubjectsCatalog';

export interface GameLobbyShowcaseProps {
  userRole: UserRole;
  defaultGrade?: string;
  defaultClassInfo?: string;
  selectedMode: GameType;
  onSelectMode: (mode: GameType) => void;
  onLaunchAiGame: (game: GameItem, saveAsRoom?: boolean) => void;
  topicInputRef?: React.RefObject<HTMLInputElement | null>;
  sectionRef?: React.RefObject<HTMLDivElement | null>;
}

const GAME_MODES: Array<{
  type: GameType;
  title: string;
  badge: string;
  description: string;
  gradient: string;
  borderBottom: string;
  badgeBg: string;
  textColor: string;
  subTextColor: string;
  Illustration: React.FC<{ className?: string }>;
}> = [
  {
    type: 'golden_bell',
    title: 'Rung Chuông Vàng',
    badge: 'Đấu trí kinh điển',
    description: 'Trả lời từng câu hỏi nhanh nhạy, tích lũy Combo Streak rực rỡ để rung chuông chiến thắng!',
    gradient: 'from-amber-400 via-amber-500 to-orange-500',
    borderBottom: 'border-amber-200 border-b-[6px] border-b-orange-700',
    badgeBg: 'bg-amber-950/20 text-amber-950 border-amber-950/15',
    textColor: 'text-slate-950',
    subTextColor: 'text-amber-950/90',
    Illustration: GoldenBellIllustration,
  },
  {
    type: 'flashcards',
    title: 'Thẻ Ghi Nhớ Flashcards',
    badge: 'Lật thẻ 3D thông minh',
    description: 'Lật thẻ 3D mượt mà với từ khóa lớn, đáp án chi tiết và đánh dấu Đã thuộc / Cần ôn lại.',
    gradient: 'from-blue-500 via-indigo-500 to-purple-600',
    borderBottom: 'border-blue-300 border-b-[6px] border-b-indigo-900',
    badgeBg: 'bg-white/20 text-white border-white/30',
    textColor: 'text-white',
    subTextColor: 'text-blue-100',
    Illustration: FlashcardsIllustration,
  },
  {
    type: 'speed_quiz',
    title: 'Đua Thuyền / Vượt Chướng Ngại Vật',
    badge: 'Tốc độ & Bứt phá',
    description: 'Mỗi đáp án đúng đưa thuyền rẽ sóng vượt chướng ngại vật tiến thẳng về đích vinh quang!',
    gradient: 'from-teal-400 via-emerald-500 to-cyan-600',
    borderBottom: 'border-teal-200 border-b-[6px] border-b-teal-800',
    badgeBg: 'bg-emerald-950/20 text-emerald-950 border-emerald-950/15',
    textColor: 'text-slate-950',
    subTextColor: 'text-emerald-950/90',
    Illustration: BoatRaceIllustration,
  },
];

export const GameLobbyShowcase: React.FC<GameLobbyShowcaseProps> = ({
  userRole,
  defaultGrade = 'Khối 3',
  defaultClassInfo = 'Lớp 3A',
  selectedMode,
  onSelectMode,
  onLaunchAiGame,
  topicInputRef,
  sectionRef,
}) => {
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('toan');
  const [grade, setGrade] = useState<string>(GRADES.includes(defaultGrade) ? defaultGrade : 'Khối 3');
  const [topic, setTopic] = useState<string>('');
  const [questionCount, setQuestionCount] = useState<number>(5);
  const [saveAsRoom, setSaveAsRoom] = useState<boolean>(false);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const activeSubject =
    PRIMARY_SUBJECTS_CATALOG.find((item) => item.id === selectedSubjectId) ||
    PRIMARY_SUBJECTS_CATALOG[0];
  const quickSuggestions = getSuggestionsForSubjectAndGrade(activeSubject, grade);
  const activeModeMeta = GAME_MODES.find((m) => m.type === selectedMode) || GAME_MODES[0];

  const handleSubjectChange = (newSubjectId: string) => {
    const currentSuggestions = getSuggestionsForSubjectAndGrade(activeSubject, grade);
    if (currentSuggestions.includes(topic)) {
      setTopic('');
    }
    setSelectedSubjectId(newSubjectId);
    setErrorMsg(null);
  };

  const handleGradeChange = (newGrade: string) => {
    const currentSuggestions = getSuggestionsForSubjectAndGrade(activeSubject, grade);
    if (currentSuggestions.includes(topic)) {
      setTopic('');
    }
    setGrade(newGrade);
    setErrorMsg(null);
  };

  const handleGenerateAndPlay = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTopic = topic.trim();
    if (!cleanTopic) {
      setErrorMsg('Em hoặc Thầy/Cô hãy nhập tên bài học hoặc chọn một gợi ý nhanh bên dưới nhé!');
      topicInputRef?.current?.focus();
      return;
    }

    setErrorMsg(null);
    setIsGenerating(true);

    try {
      const promptTopic =
        selectedMode === 'flashcards'
          ? `${cleanTopic} (Môn ${activeSubject.aiSubjectName}, ${grade} - GDPT 2018. Ưu tiên dạng câu hỏi ngắn gọn - đáp án súc tích dễ ghi nhớ cho thẻ Flashcards Tiểu học)`
          : `${cleanTopic} (Môn ${activeSubject.aiSubjectName}, ${grade} - GDPT 2018. Tạo câu hỏi trắc nghiệm 4 lựa chọn A, B, C, D rõ ràng, sinh động phù hợp học sinh Tiểu học)`;

      const generated = await generateExamQuestionsAI(
        activeSubject.aiSubjectName,
        grade,
        promptTopic,
        questionCount
      );

      const formattedQuestions = (generated || []).map((q, idx) => {
        const cleanOptions = Array.isArray(q.options) && q.options.length >= 2
          ? q.options.slice(0, 4).map((opt, optIdx) => {
              const str = String(opt).trim();
              const letter = String.fromCharCode(65 + optIdx);
              return /^[A-D][\.\:\)]\s*/i.test(str) ? str : `${letter}. ${str}`;
            })
          : ['A. Đáp án thứ nhất', 'B. Đáp án thứ hai', 'C. Đáp án thứ ba', 'D. Đáp án thứ tư'];

        let resolvedAnswer = String(q.correctAnswer || 'A').trim();
        let displayFlashcardAnswer = resolvedAnswer;

        if (selectedMode === 'flashcards') {
          const letterMatch = resolvedAnswer.match(/^([A-D])$/i);
          if (letterMatch) {
            const ansIdx = letterMatch[1].toUpperCase().charCodeAt(0) - 65;
            if (cleanOptions[ansIdx]) {
              displayFlashcardAnswer = cleanOptions[ansIdx].replace(/^[A-D][\.\:\)]\s*/i, '');
            }
          }
        } else {
          const letterMatch = resolvedAnswer.match(/^([A-D])(?:[\.\:\)\s]|$)/i);
          resolvedAnswer = letterMatch ? letterMatch[1].toUpperCase() : 'A';
        }

        return {
          id: q.id || `ai-q-${Date.now()}-${idx}`,
          question: q.content || `Câu hỏi ${idx + 1}`,
          content: q.content || `Câu hỏi ${idx + 1}`,
          options: selectedMode === 'flashcards' ? undefined : cleanOptions,
          answer: selectedMode === 'flashcards' ? displayFlashcardAnswer : resolvedAnswer,
          explanation: q.explanation || '',
          type: selectedMode === 'flashcards' ? 'flashcard' : 'multiple_choice',
        };
      });

      if (formattedQuestions.length === 0) {
        throw new Error('AI chưa tạo được câu hỏi phù hợp. Vui lòng thử lại với chủ đề cụ thể hơn.');
      }

      const modeTitlePrefix =
        selectedMode === 'golden_bell'
          ? 'Rung Chuông Vàng'
          : selectedMode === 'flashcards'
          ? 'Flashcards'
          : 'Đua Thuyền';

      const newGame: GameItem = {
        id: `ai-game-${Date.now()}`,
        title: `${modeTitlePrefix}: ${cleanTopic}`,
        type: selectedMode,
        subject: activeSubject.aiSubjectName,
        grade,
        classInfo: defaultClassInfo,
        description: `Bộ ${formattedQuestions.length} câu hỏi AI • Môn ${activeSubject.label} (${grade})`,
        questions: formattedQuestions,
        status: 'open',
        isTimeLimited: selectedMode !== 'flashcards',
        timePerQuestion: selectedMode === 'speed_quiz' ? '10 giây / câu' : '15 giây / câu',
      };

      onLaunchAiGame(newGame, userRole !== 'student' && saveAsRoom);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Không thể kết nối AI lúc này. Vui lòng thử lại sau giây lát!');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div ref={sectionRef} className="space-y-6">
      {/* 1. 3 LARGE TACTILE 3D GAME MODE CARDS */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-lg sm:text-xl font-black text-slate-900 font-heading flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-amber-400 text-slate-950 shadow-sm text-base">
                🎮
              </span>
              <span>Chọn Chế Độ Chơi Yêu Thích</span>
            </h3>
            <p className="text-xs sm:text-sm text-slate-500 font-medium mt-0.5">
              Bấm vào một thẻ trò chơi bên dưới để chọn chế độ tạo câu hỏi AI ngay lập tức
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-extrabold">
            <Sparkles className="w-3.5 h-3.5" />
            Đang chọn: {activeModeMeta.title}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5">
          {GAME_MODES.map((mode) => {
            const isSelected = selectedMode === mode.type;
            const Illustration = mode.Illustration;
            return (
              <button
                key={mode.type}
                type="button"
                onClick={() => onSelectMode(mode.type)}
                className={`group relative text-left rounded-3xl p-5 sm:p-6 bg-gradient-to-br ${mode.gradient} border-2 ${mode.borderBottom} transition-all duration-200 cursor-pointer flex flex-col justify-between min-h-[205px] shadow-lg hover:-translate-y-1 hover:shadow-xl active:translate-y-[3px] active:border-b-[3px] ${
                  isSelected
                    ? 'ring-4 ring-offset-2 ring-indigo-500 scale-[1.01]'
                    : 'opacity-95 hover:opacity-100'
                }`}
              >
                {/* Selected checkmark pill */}
                {isSelected && (
                  <span className="absolute top-3.5 right-3.5 inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white text-indigo-700 font-black text-[11px] shadow-md animate-game-pop">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    Đã chọn
                  </span>
                )}

                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-2 pr-2">
                    <span className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-black uppercase tracking-wide border ${mode.badgeBg}`}>
                      {mode.badge}
                    </span>
                    <h4 className={`text-xl font-black font-heading leading-tight ${mode.textColor}`}>
                      {mode.title}
                    </h4>
                  </div>
                  <div className="shrink-0 w-20 h-20 rounded-2xl bg-white/25 backdrop-blur-xs border border-white/40 flex items-center justify-center shadow-inner group-hover:scale-105 transition-transform">
                    <Illustration className="w-16 h-16 drop-shadow-sm" />
                  </div>
                </div>

                <p className={`text-xs sm:text-[13px] font-semibold leading-relaxed mt-4 ${mode.subTextColor}`}>
                  {mode.description}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. SOFT ROUNDED AI TOPIC / LESSON QUICK-PLAY PANEL */}
      <div className="bg-[#FFFDF7] rounded-[28px] border-2 border-indigo-100 border-b-[6px] border-b-indigo-200 p-5 sm:p-7 shadow-md space-y-5 relative overflow-hidden">
        <div className="absolute -right-12 -top-12 w-44 h-44 bg-amber-200/25 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute -left-12 -bottom-12 w-44 h-44 bg-sky-200/25 rounded-full blur-2xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white flex items-center justify-center shrink-0 shadow-md border-b-4 border-indigo-900">
              <Wand2 className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-base sm:text-lg font-black text-slate-900 font-heading">
                Tạo Bộ Câu Hỏi Siêu Tốc Bằng AI
              </h4>
              <p className="text-xs sm:text-sm text-slate-600 font-medium">
                Chọn môn học hoặc nhập tên bài học để chơi ngay chế độ{' '}
                <strong className="text-indigo-700">{activeModeMeta.title}</strong>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Môn học Dropdown đồng bộ với chọn Khối & Số câu hỏi */}
            <label className="relative flex items-center gap-2 bg-white border-2 border-indigo-200 hover:border-indigo-400 rounded-2xl px-3.5 py-2 text-xs sm:text-sm font-extrabold text-slate-700 shadow-2xs transition-colors cursor-pointer">
              <BookOpen className="w-4 h-4 text-indigo-600 shrink-0" />
              <select
                value={selectedSubjectId}
                onChange={(e) => handleSubjectChange(e.target.value)}
                className="bg-transparent appearance-none pr-5 outline-none cursor-pointer font-extrabold text-indigo-700"
                aria-label="Chọn môn học"
              >
                {PRIMARY_SUBJECTS_CATALOG.map((subj) => (
                  <option key={subj.id} value={subj.id}>
                    {subj.dropdownLabel}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-indigo-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </label>

            <label className="relative flex items-center gap-1.5 bg-white border-2 border-slate-200 hover:border-indigo-300 rounded-2xl px-3.5 py-2 text-xs sm:text-sm font-extrabold text-slate-700 shadow-2xs transition-colors cursor-pointer">
              <span>🏫</span>
              <select
                value={grade}
                onChange={(e) => handleGradeChange(e.target.value)}
                className="bg-transparent appearance-none pr-5 outline-none cursor-pointer font-extrabold text-indigo-700"
                aria-label="Chọn khối lớp"
              >
                {GRADES.slice(0, 5).map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-indigo-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </label>

            <label className="relative flex items-center gap-1.5 bg-white border-2 border-slate-200 hover:border-indigo-300 rounded-2xl px-3.5 py-2 text-xs sm:text-sm font-extrabold text-slate-700 shadow-2xs transition-colors cursor-pointer">
              <span>🔢</span>
              <select
                value={questionCount}
                onChange={(e) => setQuestionCount(Number(e.target.value))}
                className="bg-transparent appearance-none pr-5 outline-none cursor-pointer font-extrabold text-indigo-700"
                aria-label="Chọn số câu hỏi"
              >
                <option value={5}>5 câu hỏi</option>
                <option value={8}>8 câu hỏi</option>
                <option value={10}>10 câu hỏi</option>
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-indigo-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </label>
          </div>
        </div>

        {/* Dynamic Quick Suggestions matching active Subject + Grade */}
        <div className="relative z-10 space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-800 text-xs font-extrabold">
              <span>{activeSubject.emoji}</span>
              <span>{activeSubject.label}</span>
              <span className="text-indigo-400">•</span>
              <span>{grade}</span>
            </span>
            <span className="text-xs font-bold text-slate-500">Gợi ý bài học nhanh:</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {quickSuggestions.map((suggestion) => {
              const isMatched = topic === suggestion;
              return (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => {
                    setTopic(suggestion);
                    setErrorMsg(null);
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                    isMatched
                      ? 'bg-indigo-600 text-white border-indigo-700 shadow-sm'
                      : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/70'
                  }`}
                >
                  + {suggestion}
                </button>
              );
            })}
          </div>
        </div>

        {/* Input & Primary Launch Button */}
        <form onSubmit={handleGenerateAndPlay} className="relative z-10 flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <input
              ref={topicInputRef}
              type="text"
              value={topic}
              onChange={(e) => {
                setTopic(e.target.value);
                if (errorMsg) setErrorMsg(null);
              }}
              placeholder={`Nhập tên bài học ${activeSubject.label} (${grade}) — VD: ${quickSuggestions[0] || ''}...`}
              className="w-full min-h-[52px] px-4 py-3 bg-white border-2 border-slate-200 focus:border-indigo-500 rounded-2xl text-sm sm:text-base font-bold text-slate-900 placeholder-slate-400 outline-none shadow-inner transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={isGenerating}
            className="min-h-[52px] px-6 py-3 bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 hover:from-indigo-500 hover:to-fuchsia-500 text-white font-black text-sm sm:text-base rounded-2xl border-b-[5px] border-indigo-900 shadow-lg hover:scale-[1.02] active:translate-y-[2px] active:border-b-[3px] transition-all flex items-center justify-center gap-2 shrink-0 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>AI đang soạn bài...</span>
              </>
            ) : (
              <>
                <Rocket className="w-5 h-5" />
                <span>Tạo & Chơi Ngay</span>
              </>
            )}
          </button>
        </form>

        {userRole !== 'student' && (
          <div className="relative z-10 flex items-center justify-between flex-wrap gap-2 pt-1">
            <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={saveAsRoom}
                onChange={(e) => setSaveAsRoom(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
              />
              <BookmarkPlus className="w-3.5 h-3.5 text-indigo-600" />
              <span>Đồng thời lưu bộ câu hỏi này vào Danh sách Phòng Thi Đấu cho lớp</span>
            </label>
          </div>
        )}

        {errorMsg && (
          <div className="relative z-10 px-4 py-2.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs sm:text-sm font-bold">
            ⚠️ {errorMsg}
          </div>
        )}
      </div>
    </div>
  );
};
