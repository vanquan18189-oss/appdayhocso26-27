import React, { useEffect, useState } from 'react';
import confetti from 'canvas-confetti';
import {
  fetchPublicGameForGuest,
  PublicGameFetchedData,
} from '../../services/publicGuestService';
import { GameItem } from '../../types';
import { GamePlayStage } from './games/GamePlayStage';
import { GameFlashcardsStage } from './games/GameFlashcardsStage';
import {
  AlertCircle,
  Award,
  CheckCircle2,
  ExternalLink,
  Flame,
  Gamepad2,
  Home,
  Play,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Star,
  Trophy,
  XCircle,
} from 'lucide-react';

interface PublicGamePlayerViewProps {
  gameId: string;
  onGoHome?: () => void;
}

interface QuestionAttemptRecord {
  questionIndex: number;
  studentAnswerText: string;
  correctAnswerText: string;
  isCorrect: boolean;
  timedOut?: boolean;
}

const isMatchingQuestion = (q: any): boolean => {
  if (!q) return false;
  if (q.statements && Array.isArray(q.statements) && q.statements.length > 0) {
    return false;
  }
  const typeStr = String(q.type || '').trim().toLowerCase();
  const contentStr = String(q.content || q.question || '').trim().toLowerCase();
  if (
    typeStr === 'matching' ||
    typeStr === 'noi_cap' ||
    typeStr === 'ghep_noi' ||
    typeStr === 'ghép nối' ||
    typeStr === 'nối cặp' ||
    typeStr === 'nối cặp / kéo thả' ||
    typeStr === 'kéo thả' ||
    typeStr.includes('ghép') ||
    typeStr.includes('nối')
  ) {
    return true;
  }
  if (q.matchingPairs && Array.isArray(q.matchingPairs) && q.matchingPairs.length > 0) {
    return true;
  }
  if (
    contentStr.includes('ghép nối') ||
    contentStr.includes('nối cặp') ||
    (contentStr.includes('cột a') && contentStr.includes('cột b'))
  ) {
    return true;
  }
  return false;
};

const isEssayQuestion = (q: any): boolean => {
  if (!q) return false;
  const typeStr = String(q.type || '').trim().toLowerCase();
  return typeStr.includes('essay') || typeStr.includes('tu_luan') || typeStr.includes('tự luận');
};

const isTrueFalseQuestion = (q: any): boolean => {
  if (!q) return false;
  const typeStr = String(q.type || '').trim().toLowerCase();
  const contentStr = String(q.content || q.question || '').trim().toLowerCase();
  return (
    typeStr.includes('true_false') ||
    typeStr.includes('dung_sai') ||
    typeStr.includes('đúng/sai') ||
    typeStr.includes('đúng sai') ||
    contentStr.includes('đúng hoặc sai') ||
    Boolean(q.statements && Array.isArray(q.statements) && q.statements.length > 0)
  );
};

const isMultipleResponseQuestion = (q: any): boolean => {
  if (!q) return false;
  const typeStr = String(q.type || '').trim().toLowerCase();
  const contentStr = String(q.content || q.question || '').trim().toLowerCase();
  return (
    typeStr.includes('multiple_response') ||
    typeStr.includes('multi_choice') ||
    typeStr.includes('nhiều đáp án') ||
    contentStr.includes('nhiều đáp án')
  );
};

const isFillBlankQuestion = (q: any): boolean => {
  if (!q) return false;
  const typeStr = String(q.type || '').trim().toLowerCase();
  return typeStr.includes('fill_blank') || typeStr.includes('dien_khuyet') || typeStr.includes('điền khuyết');
};

const isOrderingQuestion = (q: any): boolean => {
  if (!q) return false;
  const typeStr = String(q.type || '').trim().toLowerCase();
  const contentStr = String(q.content || q.question || '').trim().toLowerCase();
  return (
    typeStr.includes('ordering') ||
    typeStr.includes('sap_xep') ||
    typeStr.includes('sắp xếp') ||
    contentStr.includes('sắp xếp')
  );
};

const isClassificationQuestion = (q: any): boolean => {
  if (!q) return false;
  const typeStr = String(q.type || '').trim().toLowerCase();
  const contentStr = String(q.content || q.question || '').trim().toLowerCase();
  return (
    typeStr.includes('classification') ||
    typeStr.includes('phan_loai') ||
    typeStr.includes('phân loại') ||
    contentStr.includes('phân loại') ||
    Boolean(q.classificationItems && q.classificationItems.length > 0)
  );
};

const isMultipleChoiceQuestion = (q: any): boolean => {
  if (!q) return false;
  if (
    isMatchingQuestion(q) ||
    isClassificationQuestion(q) ||
    isOrderingQuestion(q) ||
    isTrueFalseQuestion(q) ||
    isMultipleResponseQuestion(q) ||
    isEssayQuestion(q) ||
    isFillBlankQuestion(q)
  ) {
    return false;
  }
  const typeStr = String(q.type || '').trim().toLowerCase();
  if (
    typeStr === 'multiple_choice' ||
    typeStr === 'single_choice' ||
    typeStr === 'trắc nghiệm đơn' ||
    typeStr === 'trắc nghiệm' ||
    typeStr.includes('trắc nghiệm')
  ) {
    return true;
  }
  if (q.options && q.options.length > 0) {
    return true;
  }
  return false;
};

function getCorrectOrderingSequence(q: any): string[] {
  if (!q) return [];
  if (Array.isArray(q.correctOrder) && q.correctOrder.length > 0) {
    return q.correctOrder.map((s: any) => String(s));
  }
  if (Array.isArray(q.options) && q.options.length > 0) {
    return q.options.map((s: any) => String(s));
  }
  return [];
}

function checkQuestionCorrectLocal(qi: any, choice: any): boolean {
  if (!qi) return false;
  if (isMatchingQuestion(qi)) {
    const studentPairs = typeof choice === 'object' && choice !== null ? choice : {};
    const pairs = qi.matchingPairs || [];
    if (pairs.length === 0) return false;
    return pairs.every((pair: any, pIdx: number) => {
      const studentSelected =
        studentPairs[pIdx] !== undefined ? studentPairs[pIdx] : studentPairs[pair.left];
      if (studentSelected === undefined || studentSelected === null || studentSelected === '') {
        return false;
      }
      const correctRightStr = String(pair.right || '').trim().toLowerCase();
      if (String(studentSelected).trim().toLowerCase() === correctRightStr) return true;
      if (typeof studentSelected === 'number') {
        if (studentSelected === pIdx) return true;
        if (
          pairs[studentSelected] &&
          String(pairs[studentSelected].right || '').trim().toLowerCase() === correctRightStr
        ) {
          return true;
        }
      }
      const rightPrefixMatch = correctRightStr.match(/^([a-z0-9])[\.\:\)\-]/i);
      if (
        rightPrefixMatch &&
        String(studentSelected).trim().toLowerCase() === rightPrefixMatch[1].toLowerCase()
      ) {
        return true;
      }
      return false;
    });
  }
  if (isOrderingQuestion(qi)) {
    const studentOrder = choice || [];
    const correctOrder = getCorrectOrderingSequence(qi);
    if (correctOrder.length === 0) return true;
    if (!Array.isArray(studentOrder) || studentOrder.length !== correctOrder.length) return false;
    return studentOrder.every(
      (item: any, i: number) => String(item).trim() === String(correctOrder[i]).trim()
    );
  }
  if (isClassificationQuestion(qi)) {
    const studentAnswers = choice || {};
    const items = qi.classificationItems || [];
    if (items.length === 0) return false;
    return items.every((item: any, iIdx: number) => studentAnswers[iIdx] === item.group);
  }
  if (isTrueFalseQuestion(qi)) {
    if (qi.statements && qi.statements.length > 0) {
      const studentStmts = choice || {};
      return qi.statements.every((st: any, sIdx: number) => studentStmts[sIdx] === st.isCorrect);
    }
    const sChoice = choice as number;
    const sLetter =
      sChoice !== undefined && typeof sChoice === 'number'
        ? String.fromCharCode(65 + sChoice)
        : '';
    const rawCorrect = String(qi.correctAnswer ?? qi.answer ?? '').trim();
    const isCorrectAnswerTrue =
      rawCorrect === 'A' ||
      rawCorrect.toLowerCase().includes('đúng') ||
      rawCorrect === 'true' ||
      (qi.correctAnswer as any) === true;
    const studentSelectedTrue =
      sLetter === 'A' ||
      sChoice === 0 ||
      String(choice).toLowerCase().includes('đúng') ||
      (choice as any) === true;
    return isCorrectAnswerTrue === studentSelectedTrue;
  }
  if (isMultipleResponseQuestion(qi)) {
    const studentArr = Array.isArray(choice) ? [...choice].sort((a: number, b: number) => a - b) : [];
    const rawCorrect = String(qi.correctAnswer ?? qi.answer ?? '');
    const correctArr = Array.isArray(qi.options)
      ? qi.options
          .map((opt: any, idx: number) => {
            const optStr = String(opt || '');
            return optStr.startsWith('✓') ||
              optStr.includes('(Đúng)') ||
              rawCorrect.includes(String.fromCharCode(65 + idx))
              ? idx
              : -1;
          })
          .filter((idx: number) => idx !== -1)
      : [];
    if (correctArr.length === 0) return true;
    if (studentArr.length !== correctArr.length) return false;
    return studentArr.every((val: number, idx: number) => val === correctArr[idx]);
  }
  if (isEssayQuestion(qi) || isFillBlankQuestion(qi)) {
    if (!choice) return false;
    const rawCorrect = String(qi.correctAnswer ?? qi.answer ?? '').trim();
    if (rawCorrect && String(choice).trim().toLowerCase() === rawCorrect.toLowerCase()) {
      return true;
    }
    return String(choice).trim().length > 0;
  }

  const expectedAnswer = String(qi.correctAnswer ?? qi.answer ?? '').trim();
  const options = Array.isArray(qi.options) ? qi.options.map((o: any) => String(o ?? '')) : [];
  if (typeof choice === 'number' && choice >= 0 && choice < options.length) {
    const sLetter = String.fromCharCode(65 + choice);
    const optText = options[choice];
    return (
      sLetter.toUpperCase() === expectedAnswer.toUpperCase() ||
      String(choice) === expectedAnswer ||
      optText.trim().toLowerCase() === expectedAnswer.toLowerCase()
    );
  }
  const choiceStr = String(choice ?? '').trim();
  if (!choiceStr) return false;
  if (choiceStr.toUpperCase() === expectedAnswer.toUpperCase()) return true;
  const letterIdx = ['A', 'B', 'C', 'D'].indexOf(expectedAnswer.toUpperCase());
  if (
    letterIdx >= 0 &&
    options[letterIdx] &&
    options[letterIdx].trim().toLowerCase() === choiceStr.toLowerCase()
  ) {
    return true;
  }
  const choiceLetterIdx = ['A', 'B', 'C', 'D'].indexOf(choiceStr.toUpperCase());
  if (
    choiceLetterIdx >= 0 &&
    options[choiceLetterIdx] &&
    options[choiceLetterIdx].trim().toLowerCase() === expectedAnswer.toLowerCase()
  ) {
    return true;
  }
  return false;
}

function formatReadableCorrectAnswer(q: any): string {
  if (!q) return '';
  if (isMatchingQuestion(q) && Array.isArray(q.matchingPairs)) {
    return q.matchingPairs.map((p: any) => `${p.left} → ${p.right}`).join(' | ');
  }
  if (isTrueFalseQuestion(q) && Array.isArray(q.statements) && q.statements.length > 0) {
    return q.statements
      .map((st: any, idx: number) => `${idx + 1}) ${st.statement}: ${st.isCorrect ? 'Đúng' : 'Sai'}`)
      .join(' | ');
  }
  if (isOrderingQuestion(q)) {
    return getCorrectOrderingSequence(q).join(' → ');
  }
  if (isClassificationQuestion(q) && Array.isArray(q.classificationItems)) {
    return q.classificationItems.map((it: any) => `${it.content} (${it.group})`).join(' | ');
  }

  const options = Array.isArray(q.options) ? q.options.map((o: any) => String(o ?? '')) : [];
  const raw = String(q.correctAnswer ?? q.answer ?? '').trim();
  const letterIdx = ['A', 'B', 'C', 'D'].indexOf(raw.toUpperCase());
  if (letterIdx >= 0 && options[letterIdx] !== undefined) {
    return `${raw.toUpperCase()}. ${options[letterIdx]}`;
  }
  const numIdx = Number(raw);
  if (!Number.isNaN(numIdx) && raw !== '' && numIdx >= 0 && numIdx < options.length) {
    return `${String.fromCharCode(65 + numIdx)}. ${options[numIdx]}`;
  }
  const matchIdx = options.findIndex((opt) => opt.trim().toLowerCase() === raw.toLowerCase());
  if (matchIdx >= 0) {
    return `${String.fromCharCode(65 + matchIdx)}. ${options[matchIdx]}`;
  }
  return raw || (options[0] ? `A. ${options[0]}` : 'Đáp án chuẩn');
}

function formatReadableStudentAnswer(q: any, answerValue: any, choiceKey?: string): string {
  if (answerValue === undefined || answerValue === null || answerValue === '') {
    return 'Chưa trả lời';
  }
  if (isMatchingQuestion(q) && typeof answerValue === 'object') {
    const pairs = q.matchingPairs || [];
    return pairs
      .map((p: any, idx: number) => `${p.left} → ${answerValue[idx] ?? answerValue[p.left] ?? '?'}`)
      .join(' | ');
  }
  if (isTrueFalseQuestion(q) && Array.isArray(q.statements) && typeof answerValue === 'object') {
    return q.statements
      .map((_: any, idx: number) => `${idx + 1}) ${answerValue[idx] ? 'Đúng' : 'Sai'}`)
      .join(' | ');
  }
  if (isOrderingQuestion(q) && Array.isArray(answerValue)) {
    return answerValue.join(' → ');
  }
  if (isClassificationQuestion(q) && typeof answerValue === 'object' && Array.isArray(q.classificationItems)) {
    return q.classificationItems
      .map((it: any, idx: number) => `${it.content} (${answerValue[idx] || '?'})`)
      .join(' | ');
  }

  const options = Array.isArray(q.options) ? q.options.map((o: any) => String(o ?? '')) : [];
  if (typeof answerValue === 'number' && answerValue >= 0 && answerValue < options.length) {
    return `${String.fromCharCode(65 + answerValue)}. ${options[answerValue]}`;
  }
  const strVal = String(answerValue).trim();
  const letterIdx = ['A', 'B', 'C', 'D'].indexOf(strVal.toUpperCase());
  if (letterIdx >= 0 && options[letterIdx] !== undefined) {
    return `${strVal.toUpperCase()}. ${options[letterIdx]}`;
  }
  const matchIdx = options.findIndex((opt) => opt.trim().toLowerCase() === strVal.toLowerCase());
  if (matchIdx >= 0) {
    return `${String.fromCharCode(65 + matchIdx)}. ${options[matchIdx]}`;
  }
  if (choiceKey && ['A', 'B', 'C', 'D'].includes(choiceKey.toUpperCase())) {
    return `${choiceKey.toUpperCase()}. ${strVal}`;
  }
  return strVal;
}

function formatGameTypeBadge(type?: string): string {
  if (type === 'golden_bell') return '🔔 Rung Chuông Vàng';
  if (type === 'flashcards') return '🃏 Thẻ Ghi Nhớ Flashcards';
  if (type === 'speed_quiz') return '🚤 Đua Thuyền Siêu Tốc';
  if (type === 'lucky_wheel') return '🎡 Vòng Quay May Mắn';
  return '🎮 Trò Chơi Học Tập AI';
}

export const PublicGamePlayerView: React.FC<PublicGamePlayerViewProps> = ({
  gameId,
  onGoHome,
}) => {
  const [gameData, setGameData] = useState<PublicGameFetchedData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Client-side gameplay state (zero Firestore writes, zero student entry form)
  const [stage, setStage] = useState<'playing' | 'finished'>('playing');
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [selectedChoiceKey, setSelectedChoiceKey] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [comboStreak, setComboStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [timerSeconds, setTimerSeconds] = useState(15);
  const [totalTimerSeconds, setTotalTimerSeconds] = useState(15);
  const [isTimerRunning, setIsTimerRunning] = useState(true);
  const [gameAnswers, setGameAnswers] = useState<Record<number, any>>({});
  const [attemptsByQuestion, setAttemptsByQuestion] = useState<Record<number, QuestionAttemptRecord>>({});

  // Lucky wheel state
  const [isSpinning, setIsSpinning] = useState(false);
  const [wheelWinner, setWheelWinner] = useState<string | null>(null);

  // Flashcards state
  const [flashcardFlipped, setFlashcardFlipped] = useState(false);
  const [masteredCardIndices, setMasteredCardIndices] = useState<number[]>([]);
  const [reviewCardIndices, setReviewCardIndices] = useState<number[]>([]);

  const loadGame = async () => {
    setIsLoading(true);
    try {
      const res = await fetchPublicGameForGuest(gameId);
      if (res.status === 'ok') {
        setGameData(res.data);
        resetGameplayState(res.data);
      } else {
        setGameData(null);
      }
    } catch (e) {
      console.error('Error loading public game:', e);
      setGameData(null);
    } finally {
      setIsLoading(false);
    }
  };

  const resetGameplayState = (data?: PublicGameFetchedData | null) => {
    const target = data ?? gameData;
    const isSpeed = target?.kind === 'arena' && target.game.type === 'speed_quiz';
    const perQSeconds = isSpeed ? 10 : 15;

    setStage('playing');
    setCurrentQuestionIndex(0);
    setSelectedOption(null);
    setSelectedChoiceKey(null);
    setScore(0);
    setComboStreak(0);
    setBestStreak(0);
    setCorrectCount(0);
    setTimerSeconds(perQSeconds);
    setTotalTimerSeconds(perQSeconds);
    setIsTimerRunning(true);
    setGameAnswers({});
    setAttemptsByQuestion({});
    setIsSpinning(false);
    setWheelWinner(null);
    setFlashcardFlipped(false);
    setMasteredCardIndices([]);
    setReviewCardIndices([]);
  };

  useEffect(() => {
    loadGame();
  }, [gameId]);

  const activeArenaGame: GameItem | null = (() => {
    if (!gameData) return null;
    if (gameData.kind === 'arena') return gameData.game;
    const qAny = gameData.quizzi as any;
    if (Array.isArray(qAny.questions) && qAny.questions.length > 0) {
      return {
        id: String(gameData.quizzi.id),
        title: gameData.quizzi.title || 'Trò chơi Quizzi',
        description: gameData.quizzi.desc || 'Trò chơi tương tác trực tuyến',
        type: 'golden_bell',
        subject: gameData.quizzi.subject || 'Tổng hợp',
        grade: gameData.quizzi.grade || 'Khối 3',
        questionsCount: qAny.questions.length,
        plays: 0,
        status: 'open',
        questions: qAny.questions,
      };
    }
    return null;
  })();

  const questions = activeArenaGame?.questions || [];
  const isFlashcards = activeArenaGame?.type === 'flashcards';

  // Per-question countdown timer for quiz modes
  useEffect(() => {
    if (
      !activeArenaGame ||
      isFlashcards ||
      stage !== 'playing' ||
      !isTimerRunning ||
      selectedOption !== null ||
      questions.length === 0
    ) {
      return;
    }

    if (timerSeconds <= 0) {
      handleTimeoutQuestion();
      return;
    }

    const timer = window.setInterval(() => {
      setTimerSeconds((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [
    activeArenaGame,
    isFlashcards,
    stage,
    isTimerRunning,
    selectedOption,
    timerSeconds,
    currentQuestionIndex,
    questions.length,
  ]);

  const handleGoHome = () => {
    if (onGoHome) {
      onGoHome();
    } else if (typeof window !== 'undefined') {
      window.location.href = '/';
    }
  };

  const finishGameClientOnly = () => {
    setIsTimerRunning(false);
    setStage('finished');
    try {
      confetti({
        particleCount: 90,
        spread: 75,
        origin: { y: 0.6 },
      });
    } catch {
      // Ignore confetti errors
    }
  };

  const handleTimeoutQuestion = () => {
    const currentQ = questions[currentQuestionIndex];
    if (!currentQ || selectedOption !== null) return;

    const perQSeconds = activeArenaGame?.type === 'speed_quiz' ? 10 : 15;
    setComboStreak(0);
    setSelectedChoiceKey(null);
    setSelectedOption('INCORRECT');
    setIsTimerRunning(false);

    setAttemptsByQuestion((prev) => ({
      ...prev,
      [currentQuestionIndex]: {
        questionIndex: currentQuestionIndex,
        studentAnswerText: 'Hết giờ (Chưa chọn đáp án)',
        correctAnswerText: formatReadableCorrectAnswer(currentQ),
        isCorrect: false,
        timedOut: true,
      },
    }));

    window.setTimeout(() => {
      if (currentQuestionIndex + 1 < questions.length) {
        setCurrentQuestionIndex((prev) => prev + 1);
        setSelectedOption(null);
        setSelectedChoiceKey(null);
        setTotalTimerSeconds(perQSeconds);
        setTimerSeconds(perQSeconds);
        setIsTimerRunning(true);
      } else {
        finishGameClientOnly();
      }
    }, 1400);
  };

  const handleGameAnswerSubmit = (answerValue: any, choiceKey?: string) => {
    if (!activeArenaGame || selectedOption !== null) return;
    const currentQ = questions[currentQuestionIndex];
    if (!currentQ) return;

    const isCorrect = checkQuestionCorrectLocal(currentQ, answerValue);
    setSelectedChoiceKey(choiceKey ?? (typeof answerValue === 'string' ? answerValue : null));
    setSelectedOption(isCorrect ? 'CORRECT' : 'INCORRECT');
    setIsTimerRunning(false);

    if (isCorrect) {
      setScore((prev) => prev + 100);
      setCorrectCount((prev) => prev + 1);
      setComboStreak((prev) => {
        const nextStreak = prev + 1;
        setBestStreak((b) => Math.max(b, nextStreak));
        return nextStreak;
      });
      try {
        confetti({
          particleCount: 45,
          spread: 65,
          origin: { y: 0.7 },
        });
      } catch {
        // Ignore confetti errors
      }
    } else {
      setComboStreak(0);
    }

    setAttemptsByQuestion((prev) => ({
      ...prev,
      [currentQuestionIndex]: {
        questionIndex: currentQuestionIndex,
        studentAnswerText: formatReadableStudentAnswer(currentQ, answerValue, choiceKey),
        correctAnswerText: formatReadableCorrectAnswer(currentQ),
        isCorrect,
      },
    }));

    // Auto-advance for single-choice questions; manual button also available in GamePlayStage
    if (isMultipleChoiceQuestion(currentQ)) {
      const perQSeconds = activeArenaGame.type === 'speed_quiz' ? 10 : 15;
      window.setTimeout(() => {
        if (currentQuestionIndex + 1 < questions.length) {
          setCurrentQuestionIndex((prev) => prev + 1);
          setSelectedOption(null);
          setSelectedChoiceKey(null);
          setTotalTimerSeconds(perQSeconds);
          setTimerSeconds(perQSeconds);
          setIsTimerRunning(true);
        } else {
          finishGameClientOnly();
        }
      }, 1500);
    }
  };

  const handleSpinLuckyWheel = () => {
    if (isSpinning) return;
    setIsSpinning(true);
    setWheelWinner(null);
    const prizes = ['+50 Điểm thưởng', 'Ngôi sao may mắn', 'Trả lời nhân đôi', 'Lượt quay xuất sắc'];
    window.setTimeout(() => {
      const picked = prizes[Math.floor(Math.random() * prizes.length)];
      setWheelWinner(picked);
      setIsSpinning(false);
    }, 1200);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex flex-col items-center justify-center p-6">
        <div className="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-slate-700 font-extrabold text-base">
          Đang mở trò chơi học tập...
        </p>
      </div>
    );
  }

  if (!gameData) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-20 h-20 rounded-3xl bg-rose-100 text-rose-600 flex items-center justify-center mb-4 shadow-sm">
          <AlertCircle size={40} />
        </div>
        <h2 className="text-xl font-black text-slate-900 mb-2">
          Không tìm thấy trò chơi
        </h2>
        <p className="text-slate-600 max-w-md mb-6 text-sm">
          Trò chơi này không tồn tại, đã bị xóa hoặc đường dẫn chia sẻ không hợp lệ.
        </p>
        <div className="flex items-center gap-3">
          <button
            onClick={loadGame}
            className="px-5 py-2.5 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-100 transition flex items-center gap-2 cursor-pointer"
          >
            <RefreshCw size={16} /> Thử tải lại
          </button>
          <button
            onClick={handleGoHome}
            className="px-5 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition flex items-center gap-2 cursor-pointer"
          >
            <Home size={16} /> Về trang chủ
          </button>
        </div>
      </div>
    );
  }

  const title =
    gameData.kind === 'arena'
      ? gameData.game.title || 'Trò chơi học tập trực tuyến'
      : gameData.quizzi.title || 'Trò chơi tương tác Quizzi';
  const subject =
    gameData.kind === 'arena'
      ? gameData.game.subject || 'Tổng hợp'
      : (gameData.quizzi as any).subjectLabel || gameData.quizzi.subject || 'Tổng hợp';
  const grade =
    gameData.kind === 'arena'
      ? (gameData.game as any).khoi || gameData.game.grade || 'Khối 3'
      : gameData.quizzi.grade || 'Khối 3';
  const classNameLabel =
    gameData.kind === 'arena'
      ? (gameData.game as any).lop || gameData.game.classInfo || ''
      : gameData.quizzi.classInfo || '';

  // Case 1: Standalone Quizzi HTML / External Embed game (no question array)
  if (!activeArenaGame && gameData.kind === 'quizzi') {
    const qItem = gameData.quizzi as any;
    const quizziExternalUrl: string =
      qItem.embedUrl || qItem.playUrl || qItem.gameUrl || qItem.externalLink || qItem.url || qItem.link || '';

    return (
      <div className="min-h-screen bg-slate-900 flex flex-col">
        <header className="bg-slate-900/95 border-b border-slate-800 px-4 py-3 flex items-center justify-between gap-3 text-white">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-slate-950 flex items-center justify-center font-black shadow-sm shrink-0">
              <Gamepad2 size={22} />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-indigo-500/20 text-indigo-300 border border-indigo-400/30">
                  ⚡ Trò chơi Quizzi Tự luyện
                </span>
                <span className="text-xs font-bold text-slate-300">
                  {subject} • {/^khối/i.test(grade) ? grade : `Khối ${grade}`}
                  {classNameLabel ? ` • ${classNameLabel}` : ''}
                </span>
              </div>
              <h1 className="text-sm sm:text-base font-black text-white truncate mt-0.5">
                {title}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {quizziExternalUrl && (
              <a
                href={quizziExternalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition inline-flex items-center gap-1.5"
              >
                <ExternalLink size={14} /> Mở cửa sổ mới
              </a>
            )}
            <button
              onClick={handleGoHome}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs transition inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Home size={14} /> Trang chủ
            </button>
          </div>
        </header>

        <div className="flex-1 flex flex-col">
          {qItem.htmlContent ? (
            <iframe
              srcDoc={qItem.htmlContent}
              title={title}
              className="flex-1 w-full border-0 min-h-[calc(100vh-64px)] bg-white"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            />
          ) : quizziExternalUrl ? (
            <iframe
              src={quizziExternalUrl}
              title={title}
              className="flex-1 w-full border-0 min-h-[calc(100vh-64px)] bg-white"
              allow="fullscreen; autoplay; clipboard-write"
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-white">
              <Play size={48} className="text-indigo-400 mb-3" />
              <p className="text-slate-300 font-bold">
                Trò chơi này chưa có đường dẫn nội dung.
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Case 2: Arena Game (Rung Chuông Vàng, Flashcards, Đua Thuyền, Vòng Quay May Mắn)
  if (!activeArenaGame || questions.length === 0) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-20 h-20 rounded-3xl bg-amber-100 text-amber-600 flex items-center justify-center mb-4 shadow-sm">
          <Gamepad2 size={40} />
        </div>
        <h2 className="text-xl font-black text-slate-900 mb-2">{title}</h2>
        <p className="text-slate-600 max-w-md mb-6 text-sm">
          Bộ câu hỏi của trò chơi này đang được cập nhật. Vui lòng quay lại sau!
        </p>
        <button
          onClick={handleGoHome}
          className="px-5 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition flex items-center gap-2 cursor-pointer"
        >
          <Home size={16} /> Về trang chủ
        </button>
      </div>
    );
  }

  // Calculate summary stats for finished screen
  const totalQuestions = questions.length;
  const effectiveCorrectCount = isFlashcards ? masteredCardIndices.length : correctCount;
  const accuracyPercent =
    totalQuestions > 0 ? Math.round((effectiveCorrectCount / totalQuestions) * 100) : 0;
  const starsEarned = accuracyPercent >= 80 ? 3 : accuracyPercent >= 50 ? 2 : 1;
  const finalScore = isFlashcards ? effectiveCorrectCount * 100 : score;

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-purple-950 to-slate-900 flex flex-col">
      {/* Top Game Header */}
      <header className="bg-white/10 backdrop-blur-md border-b border-white/15 px-4 sm:px-6 py-3 flex items-center justify-between gap-3 text-white sticky top-0 z-30">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-slate-950 flex items-center justify-center font-black shadow-md shrink-0">
            <Gamepad2 size={22} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-amber-400/20 text-amber-300 border border-amber-300/30">
                {formatGameTypeBadge(activeArenaGame.type)}
              </span>
              <span className="text-xs font-bold text-indigo-200">
                Môn {subject} • {/^khối/i.test(grade) ? grade : `Khối ${grade}`}
                {classNameLabel ? ` • ${classNameLabel}` : ''} • {totalQuestions} câu hỏi
              </span>
            </div>
            <h1 className="text-sm sm:text-base font-black text-white truncate mt-0.5">
              {title}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => resetGameplayState()}
            className="px-3.5 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white font-extrabold text-xs transition inline-flex items-center gap-1.5 cursor-pointer"
          >
            <RotateCcw size={14} /> Chơi lại
          </button>
          <button
            type="button"
            onClick={handleGoHome}
            className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-xs transition inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Home size={14} /> Trang chủ
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-6 sm:py-8">
        {stage === 'playing' ? (
          isFlashcards ? (
            <GameFlashcardsStage
              activeGame={activeArenaGame}
              currentIndex={currentQuestionIndex}
              isFlipped={flashcardFlipped}
              masteredIndices={masteredCardIndices}
              reviewIndices={reviewCardIndices}
              onToggleFlip={() => setFlashcardFlipped((prev) => !prev)}
              onMarkMastered={() => {
                const nextMastered = masteredCardIndices.includes(currentQuestionIndex)
                  ? masteredCardIndices
                  : [...masteredCardIndices, currentQuestionIndex];
                const nextReview = reviewCardIndices.filter((i) => i !== currentQuestionIndex);
                setMasteredCardIndices(nextMastered);
                setReviewCardIndices(nextReview);
                setCorrectCount(nextMastered.length);
                setScore(nextMastered.length * 100);
                setBestStreak((b) => Math.max(b, nextMastered.length));
                try {
                  confetti({ particleCount: 35, spread: 55, origin: { y: 0.7 } });
                } catch {}
                setFlashcardFlipped(false);
                if (currentQuestionIndex + 1 < questions.length) {
                  setCurrentQuestionIndex((prev) => prev + 1);
                } else {
                  finishGameClientOnly();
                }
              }}
              onMarkNeedsReview={() => {
                const nextReview = reviewCardIndices.includes(currentQuestionIndex)
                  ? reviewCardIndices
                  : [...reviewCardIndices, currentQuestionIndex];
                const nextMastered = masteredCardIndices.filter((i) => i !== currentQuestionIndex);
                setReviewCardIndices(nextReview);
                setMasteredCardIndices(nextMastered);
                setCorrectCount(nextMastered.length);
                setScore(nextMastered.length * 100);
                setFlashcardFlipped(false);
                if (currentQuestionIndex + 1 < questions.length) {
                  setCurrentQuestionIndex((prev) => prev + 1);
                } else {
                  finishGameClientOnly();
                }
              }}
              onPrevCard={() => {
                setFlashcardFlipped(false);
                setCurrentQuestionIndex((prev) => Math.max(0, prev - 1));
              }}
              onJumpToNextReview={() => {
                if (reviewCardIndices.length > 0) {
                  setFlashcardFlipped(false);
                  setCurrentQuestionIndex(reviewCardIndices[0]);
                }
              }}
              onFinishDeck={() => finishGameClientOnly()}
              onExit={() => finishGameClientOnly()}
            />
          ) : (
            <GamePlayStage
              activeGame={activeArenaGame}
              currentQuestionIndex={currentQuestionIndex}
              selectedOption={selectedOption}
              selectedChoiceKey={selectedChoiceKey}
              score={score}
              comboStreak={comboStreak}
              correctCount={correctCount}
              timerSeconds={timerSeconds}
              totalTimerSeconds={totalTimerSeconds}
              currentUserName="Học sinh tự luyện"
              gameAnswers={gameAnswers}
              setGameAnswers={setGameAnswers}
              onExit={() => finishGameClientOnly()}
              onSubmitAnswer={handleGameAnswerSubmit}
              onNextManualQuestion={() => {
                const perQSeconds = activeArenaGame.type === 'speed_quiz' ? 10 : 15;
                if (currentQuestionIndex + 1 < questions.length) {
                  setCurrentQuestionIndex((prev) => prev + 1);
                  setSelectedOption(null);
                  setSelectedChoiceKey(null);
                  setTotalTimerSeconds(perQSeconds);
                  setTimerSeconds(perQSeconds);
                  setIsTimerRunning(true);
                } else {
                  finishGameClientOnly();
                }
              }}
              isSpinning={isSpinning}
              wheelWinner={wheelWinner}
              onSpinLuckyWheel={handleSpinLuckyWheel}
              isMatchingQuestion={isMatchingQuestion}
              isTrueFalseQuestion={isTrueFalseQuestion}
              isMultipleResponseQuestion={isMultipleResponseQuestion}
              isOrderingQuestion={isOrderingQuestion}
              isClassificationQuestion={isClassificationQuestion}
              isMultipleChoiceQuestion={isMultipleChoiceQuestion}
            />
          )
        ) : (
          /* Finished Podium + Full Per-Question Answer Review */
          <div className="space-y-6 animate-in fade-in duration-300">
            {/* Podium & Score Card */}
            <div className="bg-gradient-to-b from-indigo-900 via-purple-900 to-slate-900 rounded-[2.5rem] p-6 sm:p-10 shadow-2xl border-4 border-indigo-400/30 text-center text-white relative overflow-hidden">
              <div className="absolute -top-24 -left-24 w-72 h-72 bg-amber-400/15 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute -bottom-24 -right-24 w-72 h-72 bg-pink-500/15 rounded-full blur-3xl pointer-events-none" />

              <div className="relative z-10 max-w-2xl mx-auto">
                {/* 1 to 3 Golden Stars */}
                <div className="flex items-center justify-center gap-3 mb-4">
                  {[1, 2, 3].map((starNum) => {
                    const earned = starNum <= starsEarned;
                    return (
                      <div
                        key={starNum}
                        className={`transition-all duration-500 ${
                          starNum === 2 ? '-translate-y-3 scale-125' : ''
                        }`}
                      >
                        <Star
                          className={`w-12 h-12 sm:w-14 sm:h-14 ${
                            earned
                              ? 'text-yellow-400 fill-yellow-400 drop-shadow-[0_0_20px_rgba(250,204,21,0.85)]'
                              : 'text-white/20 fill-white/10'
                          }`}
                        />
                      </div>
                    );
                  })}
                </div>

                <div className="w-20 h-20 mx-auto mb-4 rounded-3xl bg-gradient-to-br from-yellow-300 via-amber-400 to-orange-500 p-1 shadow-xl">
                  <div className="w-full h-full bg-indigo-950/40 rounded-[1.3rem] flex items-center justify-center">
                    <Trophy className="w-10 h-10 text-yellow-200" />
                  </div>
                </div>

                <span className="inline-flex items-center gap-1.5 px-4 py-1 rounded-full bg-white/10 border border-white/20 text-amber-300 text-xs font-black uppercase tracking-wider mb-2">
                  <Sparkles className="w-3.5 h-3.5" /> Hoàn thành lượt chơi tự luyện
                </span>

                <h2 className="text-2xl sm:text-4xl font-black tracking-tight mb-2">
                  {starsEarned === 3
                    ? 'Xuất Sắc! Quán Quân Tri Thức!'
                    : starsEarned === 2
                    ? 'Giỏi Lắm! Cố Gắng Phát Huy Nhé!'
                    : 'Hoàn Thành Lượt Chơi! Cùng Ôn Tập Thêm Nhé!'}
                </h2>
                <p className="text-indigo-200 font-bold text-sm sm:text-base mb-6">
                  {title}
                </p>

                {/* Metrics Grid */}
                <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-7">
                  <div className="bg-white/10 backdrop-blur-md border-2 border-white/15 rounded-3xl p-4">
                    <p className="text-[11px] font-black uppercase tracking-wider text-indigo-200 mb-1">
                      Tổng điểm
                    </p>
                    <p className="text-2xl sm:text-4xl font-black text-yellow-300">
                      {finalScore}
                    </p>
                  </div>

                  <div className="bg-white/10 backdrop-blur-md border-2 border-white/15 rounded-3xl p-4">
                    <p className="text-[11px] font-black uppercase tracking-wider text-emerald-200 mb-1">
                      {isFlashcards ? 'Thẻ đã thuộc' : 'Số câu đúng'}
                    </p>
                    <p className="text-2xl sm:text-4xl font-black text-emerald-300">
                      {effectiveCorrectCount}/{totalQuestions}
                    </p>
                    <p className="text-[11px] font-bold text-emerald-200/80 mt-0.5">
                      Đạt {accuracyPercent}%
                    </p>
                  </div>

                  <div className="bg-white/10 backdrop-blur-md border-2 border-white/15 rounded-3xl p-4">
                    <p className="text-[11px] font-black uppercase tracking-wider text-orange-200 mb-1">
                      Combo cao nhất
                    </p>
                    <p className="text-2xl sm:text-4xl font-black text-orange-300 flex items-center justify-center gap-1">
                      <Flame className="w-6 h-6 text-orange-400 fill-orange-400" />
                      {isFlashcards ? effectiveCorrectCount : bestStreak}
                    </p>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => resetGameplayState()}
                    className="px-7 py-3.5 bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 text-slate-950 font-black rounded-2xl border-b-4 border-orange-700 active:border-b-0 active:translate-y-1 transition-all flex items-center gap-2 shadow-xl cursor-pointer text-base"
                  >
                    <RotateCcw className="w-5 h-5" /> Chơi lại ngay
                  </button>
                  <button
                    type="button"
                    onClick={handleGoHome}
                    className="px-6 py-3.5 bg-white/10 hover:bg-white/20 text-white font-black rounded-2xl border-2 border-white/20 transition-all flex items-center gap-2 cursor-pointer text-base"
                  >
                    <Home className="w-5 h-5" /> Về trang chủ
                  </button>
                </div>
              </div>
            </div>

            {/* Detailed Per-Question Answer Review Section */}
            <div className="bg-white rounded-[2rem] p-5 sm:p-8 shadow-xl border border-slate-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 mb-5 border-b border-slate-200">
                <div className="flex items-center gap-2.5">
                  <span className="w-10 h-10 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center font-black">
                    <Award className="w-5 h-5" />
                  </span>
                  <div>
                    <h3 className="text-base sm:text-lg font-black text-slate-900">
                      Bảng Đối Chiếu Đáp Án Từng Câu ({effectiveCorrectCount}/{totalQuestions} câu đúng)
                    </h3>
                    <p className="text-xs text-slate-500 font-semibold">
                      Xem lại chi tiết đáp án đúng – sai của từng câu hỏi để tự ôn luyện kiến thức
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                {questions.map((q: any, idx: number) => {
                  const questionTitle = q.content || q.question || `Câu hỏi ${idx + 1}`;
                  const correctOptionLabel = formatReadableCorrectAnswer(q);

                  if (isFlashcards) {
                    const isRemembered = masteredCardIndices.includes(idx);
                    return (
                      <div
                        key={q.id || idx}
                        className={`rounded-2xl border-2 p-4 sm:p-5 transition ${
                          isRemembered
                            ? 'bg-emerald-50/60 border-emerald-200'
                            : 'bg-amber-50/60 border-amber-200'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <span className="px-3 py-1 rounded-xl bg-white border border-slate-200 text-xs font-black text-slate-800">
                            Thẻ #{idx + 1}
                          </span>
                          <span
                            className={`px-3 py-1 rounded-xl text-xs font-black inline-flex items-center gap-1 ${
                              isRemembered
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {isRemembered ? (
                              <>
                                <CheckCircle2 className="w-3.5 h-3.5" /> Đã thuộc
                              </>
                            ) : (
                              <>
                                <RotateCcw className="w-3.5 h-3.5" /> Cần ôn lại
                              </>
                            )}
                          </span>
                        </div>
                        <p className="font-extrabold text-slate-900 text-sm sm:text-base mb-2">
                          {questionTitle}
                        </p>
                        <div className="text-xs sm:text-sm font-bold text-emerald-800 bg-white/90 rounded-xl px-3.5 py-2.5 border border-emerald-200">
                          <span className="text-emerald-600 uppercase tracking-wider text-[11px] block mb-0.5">
                            Đáp án / Mặt sau thẻ:
                          </span>
                          {correctOptionLabel}
                        </div>
                        {q.explanation && (
                          <p className="text-xs text-slate-600 mt-2 bg-white/80 rounded-xl px-3 py-2 border border-slate-200">
                            💡 <strong>Giải thích:</strong> {q.explanation}
                          </p>
                        )}
                      </div>
                    );
                  }

                  const attempt = attemptsByQuestion[idx];
                  const isCorrect = attempt?.isCorrect === true;
                  const studentSelectedLabel = attempt
                    ? attempt.studentAnswerText
                    : 'Chưa trả lời';

                  return (
                    <div
                      key={q.id || idx}
                      className={`rounded-2xl border-2 p-4 sm:p-5 transition ${
                        isCorrect
                          ? 'bg-emerald-50/50 border-emerald-200'
                          : 'bg-rose-50/50 border-rose-200'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-2.5">
                        <span className="px-3 py-1 rounded-xl bg-white border border-slate-200 text-xs font-black text-slate-800">
                          Câu {idx + 1}
                        </span>
                        <span
                          className={`px-3 py-1 rounded-xl text-xs font-black inline-flex items-center gap-1.5 ${
                            isCorrect
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {isCorrect ? (
                            <>
                              <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Chính xác (+100đ)
                            </>
                          ) : (
                            <>
                              <XCircle className="w-4 h-4 text-rose-600" /> Chưa đúng
                            </>
                          )}
                        </span>
                      </div>

                      <p className="font-extrabold text-slate-900 text-sm sm:text-base mb-3 leading-snug">
                        {questionTitle}
                      </p>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs sm:text-sm">
                        <div
                          className={`rounded-xl px-3.5 py-2.5 border font-bold ${
                            isCorrect
                              ? 'bg-emerald-100/70 border-emerald-300 text-emerald-900'
                              : 'bg-rose-100/70 border-rose-300 text-rose-900'
                          }`}
                        >
                          <span className="block text-[11px] uppercase tracking-wider opacity-75 mb-0.5">
                            Câu trả lời của em:
                          </span>
                          {studentSelectedLabel}
                        </div>

                        <div className="rounded-xl px-3.5 py-2.5 border bg-emerald-100/70 border-emerald-300 text-emerald-900 font-bold">
                          <span className="block text-[11px] uppercase tracking-wider text-emerald-700 mb-0.5">
                            Đáp án đúng:
                          </span>
                          {correctOptionLabel}
                        </div>
                      </div>

                      {q.explanation && (
                        <div className="mt-3 text-xs sm:text-sm text-slate-700 bg-white rounded-xl px-3.5 py-2.5 border border-slate-200">
                          💡 <strong>Giải thích:</strong> {q.explanation}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
