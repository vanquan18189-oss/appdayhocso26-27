import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, 
  CheckCircle2, 
  AlertCircle, 
  Trash2, 
  Save, 
  Edit3, 
  AlertTriangle,
  RotateCcw,
  Check,
  FileQuestion,
  HelpCircle,
  Download
} from 'lucide-react';
import { downloadStudentSubmissionPdf } from '../../services/studentSubmissionPdfService';
import { QuestionItem } from '../../types';
import { 
  formatScore, 
  formatTotalScore, 
  isSubjectWithScore, 
  getQualitativeLabel, 
  getQualitativeLevel, 
  formatSubmissionDateTime, 
  getCurrentSubmissionTimestamp 
} from '../../utils/scoreUtils';
import { 
  checkQuestionCorrectLocal,
  isMatchingQuestion,
  isOrderingQuestion,
  isTrueFalseQuestion,
  isMultipleResponseQuestion,
  isFillBlankQuestion,
  isEssayQuestion,
  isClassificationQuestion
} from './StudentExamModule';
import { normalizeQuestionType, getQuestionTypeLabel } from '../../lib/constants';
import { db } from '../../firebaseConfig';
import { doc, setDoc, getDoc, runTransaction } from 'firebase/firestore';
import { getLocalCachedAssignments } from '../../services/assignmentStorageService';
import { getLocalCachedExams } from '../../services/examStorageService';

export interface QuestionEvaluation {
  questionId: string;
  questionIndex: number;
  question: QuestionItem;
  points: number;
  isCorrect: boolean;
  isAnswered: boolean;
  studentChoice: any;
}

export interface StudentSubmissionDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'assignment' | 'exam';
  targetItem: {
    id: string;
    originalId?: string;
    originalAssignmentId?: string;
    originalExamId?: string;
    title: string;
    subject: string;
    grade?: string;
    targetClass?: string;
    durationMinutes?: number;
    questions?: QuestionItem[];
    questionSnapshot?: QuestionItem[];
    submissions?: any[];
    [key: string]: any;
  } | null;
  studentSubmission: {
    id?: string;
    studentId?: string;
    studentCode?: string;
    maHs?: string;
    code?: string;
    name?: string;
    studentName?: string;
    fullName?: string;
    answers?: any;
    answersById?: Record<string, any>;
    questionSnapshot?: QuestionItem[];
    assignment?: any;
    exam?: any;
    totalScore?: number | string;
    score?: number | string;
    submittedTime?: string;
    submittedAt?: string;
    rawSubmission?: any;
    [key: string]: any;
  } | null;
  onSaveRegrade?: (updatedSubmission: any) => Promise<void> | void;
  onDeleteSubmission?: (studentIdentifier: string) => Promise<void> | void;
}

/**
 * Trích xuất câu trả lời của học sinh cho một câu hỏi cụ thể theo ID hoặc Index
 */
export function extractStudentAnswer(q: QuestionItem, qIdx: number, sub: any): any {
  if (!sub) return undefined;
  const rawSub = sub.rawSubmission || sub;

  // 1. Ưu tiên đối chiếu theo question ID qua answersById
  if (rawSub.answersById && q.id && rawSub.answersById[q.id] !== undefined) {
    return rawSub.answersById[q.id];
  }
  if (sub.answersById && q.id && sub.answersById[q.id] !== undefined) {
    return sub.answersById[q.id];
  }

  // 2. Đối chiếu theo answers object (keyed by question ID hoặc index)
  const answersObj = rawSub.answers !== undefined ? rawSub.answers : sub.answers;
  if (answersObj && typeof answersObj === 'object' && !Array.isArray(answersObj)) {
    if (q.id && answersObj[q.id] !== undefined) {
      return answersObj[q.id];
    }
    if (answersObj[qIdx] !== undefined) {
      return answersObj[qIdx];
    }
    if (answersObj[String(qIdx)] !== undefined) {
      return answersObj[String(qIdx)];
    }
  }

  // 3. Đối chiếu theo answers mảng theo vị trí
  if (Array.isArray(answersObj) && answersObj[qIdx] !== undefined) {
    return answersObj[qIdx];
  }

  // 4. Dự phòng qua studentAnswers hoặc choices
  const alt = rawSub.studentAnswers || rawSub.choices;
  if (alt && typeof alt === 'object') {
    if (q.id && alt[q.id] !== undefined) return alt[q.id];
    if (alt[qIdx] !== undefined) return alt[qIdx];
  }

  return undefined;
}

export const StudentSubmissionDetailModal: React.FC<StudentSubmissionDetailModalProps> = ({
  isOpen,
  onClose,
  mode,
  targetItem,
  studentSubmission,
  onSaveRegrade,
  onDeleteSubmission
}) => {
  const [resolvedQuestions, setResolvedQuestions] = useState<QuestionItem[]>([]);
  const [isLoadingQuestions, setIsLoadingQuestions] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [evaluations, setEvaluations] = useState<QuestionEvaluation[]>([]);
  const [hasChanges, setHasChanges] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<boolean>(false);
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);

  // Student identification
  const studentName = studentSubmission?.studentName || 
                      studentSubmission?.fullName || 
                      studentSubmission?.name || 
                      studentSubmission?.rawSubmission?.studentName || 
                      'Học sinh';

  const studentCode = studentSubmission?.studentCode || 
                      studentSubmission?.maHs || 
                      studentSubmission?.studentId || 
                      studentSubmission?.code || 
                      studentSubmission?.rawSubmission?.studentCode || 
                      '';

  const submittedTime = studentSubmission?.submittedTime || 
                        studentSubmission?.submittedAt || 
                        studentSubmission?.rawSubmission?.submittedAt || 
                        getCurrentSubmissionTimestamp();

  // 1. TẢI CÂU HỎI TỪ CHÍNH BÀI ĐÃ GIAO / ĐỀ KIỂM TRA ĐÓ
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setIsLoadingQuestions(true);
    setLoadError(null);

    const resolveQuestionsSource = async () => {
      try {
        const rawSub = studentSubmission?.rawSubmission || studentSubmission;

        // Ưu tiên 1: Bản chụp questionSnapshot lưu kèm trong bài làm đã nộp
        if (Array.isArray(rawSub?.questionSnapshot) && rawSub.questionSnapshot.length > 0) {
          if (isMounted) {
            setResolvedQuestions(rawSub.questionSnapshot);
            setIsLoadingQuestions(false);
          }
          return;
        }

        // Ưu tiên 2: Questions lưu kèm trong object assignment / exam của bài nộp
        const subAssignmentQuestions = rawSub?.assignment?.questions || rawSub?.exam?.questions;
        if (Array.isArray(subAssignmentQuestions) && subAssignmentQuestions.length > 0) {
          if (isMounted) {
            setResolvedQuestions(subAssignmentQuestions);
            setIsLoadingQuestions(false);
          }
          return;
        }

        // Ưu tiên 3: questionSnapshot của chính tài liệu bài giao
        if (Array.isArray(targetItem?.questionSnapshot) && targetItem.questionSnapshot.length > 0) {
          if (isMounted) {
            setResolvedQuestions(targetItem.questionSnapshot);
            setIsLoadingQuestions(false);
          }
          return;
        }

        // Ưu tiên 4: questions của chính bài đã giao / đề kiểm tra đang mở
        if (Array.isArray(targetItem?.questions) && targetItem.questions.length > 0) {
          if (isMounted) {
            setResolvedQuestions(targetItem.questions);
            setIsLoadingQuestions(false);
          }
          return;
        }

        // Ưu tiên 5: Tra cứu trong Local Storage Cache theo đúng ID của bài đó
        const targetId = targetItem?.id || rawSub?.assignmentId || rawSub?.examId || '';
        const rootId = (targetId || '').replace(/-class-.*$/, '').replace(/^(as|ex)-/, '');
        
        if (mode === 'assignment') {
          const cachedAssignments = getLocalCachedAssignments();
          const matchedAssignment = cachedAssignments.find(a => 
            a.id === targetId || 
            a.originalAssignmentId === targetId ||
            (rootId && a.id.includes(rootId))
          );
          if (matchedAssignment?.questions && matchedAssignment.questions.length > 0) {
            if (isMounted) {
              setResolvedQuestions(matchedAssignment.questions);
              setIsLoadingQuestions(false);
            }
            return;
          }
        } else {
          const cachedExams = getLocalCachedExams();
          const matchedExam = cachedExams.find(e => 
            e.id === targetId || 
            e.originalExamId === targetId ||
            (rootId && e.id.includes(rootId))
          );
          if (matchedExam?.questions && matchedExam.questions.length > 0) {
            if (isMounted) {
              setResolvedQuestions(matchedExam.questions);
              setIsLoadingQuestions(false);
            }
            return;
          }
        }

        // Ưu tiên 6: Tải trực tiếp tài liệu từ Cloud Firestore theo mã bài (assignmentId / examId)
        if (db && targetId) {
          const colName = mode === 'assignment' ? 'assignments' : 'exams';
          try {
            const snap = await getDoc(doc(db, colName, targetId));
            if (snap.exists()) {
              const data = snap.data();
              const qs = data.questionSnapshot || data.questions;
              if (Array.isArray(qs) && qs.length > 0) {
                if (isMounted) {
                  setResolvedQuestions(qs);
                  setIsLoadingQuestions(false);
                }
                return;
              }
            }
          } catch (fetchErr) {
            console.warn('Lỗi tải câu hỏi từ Firestore:', fetchErr);
          }
        }

        // NGUYÊN TẮC: Nếu không tìm thấy câu hỏi của bài đó thì thông báo lỗi,
        // TUYỆT ĐỐI KHÔNG lấy từ Ngân hàng câu hỏi, không lấy theo môn học/khối/tiêu đề, không dùng câu hỏi mẫu!
        if (isMounted) {
          setLoadError('Không tải được câu hỏi của bài này.');
          setResolvedQuestions([]);
          setIsLoadingQuestions(false);
        }
      } catch (err: any) {
        if (isMounted) {
          setLoadError(`Không tải được câu hỏi của bài này (${err?.message || 'Lỗi không xác định'})`);
          setIsLoadingQuestions(false);
        }
      }
    };

    resolveQuestionsSource();

    return () => {
      isMounted = false;
    };
  }, [isOpen, targetItem, studentSubmission, mode]);

  // 2. KHỞI TẠO NGUỒN ĐIỂM SỐ VÀ TRẠNG THÁI TỪNG CÂU DUY NHẤT (SSOT)
  useEffect(() => {
    if (resolvedQuestions.length === 0) {
      setEvaluations([]);
      return;
    }

    const totalQ = resolvedQuestions.length;
    const defaultPointPerQ = Number((10 / Math.max(1, totalQ)).toFixed(1));
    const rawSub = studentSubmission?.rawSubmission || studentSubmission;

    const initialEvaluations: QuestionEvaluation[] = resolvedQuestions.map((q, qIdx) => {
      const qDeclaredPoints = (q as any).points ?? (q as any).score;
      const points = (typeof qDeclaredPoints === 'number' && !isNaN(qDeclaredPoints) && qDeclaredPoints > 0)
        ? qDeclaredPoints
        : defaultPointPerQ;

      const studentChoice = extractStudentAnswer(q, qIdx, rawSub);

      // Xác định học sinh đã làm câu này hay bỏ trống
      const isAnswered = studentChoice !== undefined && studentChoice !== null && studentChoice !== '';

      // Xác định trạng thái Đúng/Sai ban đầu
      let isCorrect = false;

      // 1. Kiểm tra nếu bài nộp đã có sẵn kết quả chấm câu này
      if (Array.isArray(studentSubmission?.answers) && studentSubmission.answers[qIdx] !== undefined) {
        const recordedAns = studentSubmission.answers[qIdx];
        if (recordedAns === 'pass' || recordedAns === true) {
          isCorrect = true;
        } else if (recordedAns === 'fail' || recordedAns === false) {
          isCorrect = false;
        } else if (isAnswered) {
          isCorrect = checkQuestionCorrectLocal(q, studentChoice);
        }
      } else if (isAnswered) {
        isCorrect = checkQuestionCorrectLocal(q, studentChoice);
      }

      return {
        questionId: q.id || `q-${qIdx}`,
        questionIndex: qIdx,
        question: q,
        points,
        isCorrect,
        isAnswered,
        studentChoice
      };
    });

    setEvaluations(initialEvaluations);
    setHasChanges(false);
    setSaveSuccessMsg(null);
  }, [resolvedQuestions, studentSubmission]);

  // 3. TÍNH TOÁN ĐIỂM SỐ NHẤT QUÁN 100% TỪ NGUỒN EVALUATIONS DUY NHẤT
  const stats = useMemo(() => {
    const totalCount = evaluations.length;
    const correctCount = evaluations.filter(e => e.isCorrect).length;
    
    // Tổng điểm tính từ các câu đúng
    const totalPointsSum = evaluations.reduce((acc, e) => acc + (e.isCorrect ? e.points : 0), 0);
    
    // Điểm thang 10 chuẩn
    const scoreOutOf10 = totalCount > 0 
      ? Number(Math.min(10, Math.max(0, Math.round((correctCount / totalCount) * 10))))
      : 0;

    const calculatedScore = Number(totalPointsSum.toFixed(1));

    return {
      totalCount,
      correctCount,
      calculatedScore,
      scoreOutOf10
    };
  }, [evaluations]);

  // 4. GIÁO VIÊN BẤM ĐỔI KẾT QUẢ ĐÚNG / SAI CỦA TỪNG CÂU
  const handleToggleQuestionStatus = (index: number) => {
    setEvaluations(prev => {
      const next = [...prev];
      if (next[index]) {
        next[index] = {
          ...next[index],
          isCorrect: !next[index].isCorrect
        };
      }
      return next;
    });
    setHasChanges(true);
    setSaveSuccessMsg(null);
  };

  // 5. LƯU KẾT QUẢ CHẤM LẠI VÀO FIRESTORE & LOCAL STORAGE (1 lượt ghi duy nhất)
  const handleSaveRegrade = async () => {
    if (!targetItem?.id || !studentCode) return;
    setIsSaving(true);
    setSaveSuccessMsg(null);

    try {
      const newAnswersArray = evaluations.map(e => e.isCorrect ? 'pass' : 'fail');
      const newScoreNumber = stats.scoreOutOf10;
      const newScoreStr = isSubjectWithScore(targetItem.subject) ? `${newScoreNumber}` : getQualitativeLabel(stats.correctCount, stats.totalCount);
      const nowStr = formatSubmissionDateTime(getCurrentSubmissionTimestamp());

      const rawSub = studentSubmission?.rawSubmission || studentSubmission;
      const updatedSubmissionPayload = {
        ...rawSub,
        studentId: studentCode,
        studentCode: studentCode,
        maHs: studentCode,
        studentName: studentName,
        answers: newAnswersArray,
        totalScore: newScoreNumber,
        score: newScoreNumber,
        status: 'submitted',
        isRegraded: true,
        regradedAt: nowStr,
        feedback: `Đã chấm lại bởi giáo viên: ${stats.correctCount}/${stats.totalCount} câu đúng (${newScoreNumber} điểm).`
      };

      const targetCol = mode === 'assignment' ? 'assignments' : 'exams';
      const targetDocId = targetItem.id;

      // 1. Ghi đúng vào sub-collection submissions của tài liệu này
      if (db) {
        try {
          const subDocRef = doc(db, targetCol, targetDocId, 'submissions', studentCode);
          await setDoc(subDocRef, updatedSubmissionPayload, { merge: true });
        } catch (subErr) {
          console.warn('Lỗi ghi subcollection:', subErr);
        }

        // 2. Cập nhật mảng submissions trên master document
        try {
          const masterDocRef = doc(db, targetCol, targetDocId);
          await runTransaction(db, async (transaction) => {
            const snap = await transaction.get(masterDocRef);
            if (snap.exists()) {
              const currentData = snap.data();
              const existingSubs = Array.isArray(currentData.submissions) ? [...currentData.submissions] : [];
              const filtered = existingSubs.filter((s: any) => 
                (s.studentCode || s.maHs || s.studentId || s.code || '').toLowerCase() !== studentCode.toLowerCase()
              );
              filtered.unshift(updatedSubmissionPayload);
              transaction.update(masterDocRef, {
                submissions: filtered,
                updatedAt: new Date().toISOString()
              });
            }
          });
        } catch (tErr) {
          console.warn('Lỗi transaction master doc:', tErr);
        }
      }

      // 3. Cập nhật Local Storage
      if (typeof window !== 'undefined') {
        const storagePrefix = mode === 'assignment' ? 'eduplay_student_submissions_' : 'eduplay_student_exam_subs_';
        try {
          const savedRaw = localStorage.getItem(`${storagePrefix}${studentCode}`);
          const parsed = savedRaw ? JSON.parse(savedRaw) : [];
          if (Array.isArray(parsed)) {
            const filtered = parsed.filter((s: any) => 
              (s.id !== targetDocId && s.assignmentId !== targetDocId && s.examId !== targetDocId)
            );
            filtered.unshift(updatedSubmissionPayload);
            localStorage.setItem(`${storagePrefix}${studentCode}`, JSON.stringify(filtered));
          }
        } catch {}

        // Global all submissions cache
        const allKey = mode === 'assignment' ? 'eduplay_all_assignment_submissions' : 'eduplay_all_exam_submissions';
        try {
          const allRaw = localStorage.getItem(allKey);
          const allParsed = allRaw ? JSON.parse(allRaw) : [];
          if (Array.isArray(allParsed)) {
            const filteredAll = allParsed.filter((s: any) => 
              !(s.id === targetDocId || s.assignmentId === targetDocId || s.examId === targetDocId) ||
              (s.studentCode || s.maHs || s.studentId) !== studentCode
            );
            filteredAll.unshift(updatedSubmissionPayload);
            localStorage.setItem(allKey, JSON.stringify(filteredAll));
          }
        } catch {}

        // Dispatch real-time events
        window.dispatchEvent(new Event('eduplay_student_submissions_updated'));
        window.dispatchEvent(new Event('eduplay_exam_submissions_updated'));
        window.dispatchEvent(new Event('eduplay_assignments_updated'));
      }

      if (onSaveRegrade) {
        await onSaveRegrade(updatedSubmissionPayload);
      }

      setHasChanges(false);
      setSaveSuccessMsg(`Đã lưu kết quả chấm lại cho học sinh ${studentName}: ${stats.correctCount}/${stats.totalCount} câu đúng (${newScoreNumber} điểm).`);
    } catch (err: any) {
      alert(`Lưu chấm lại thất bại: ${err?.message || String(err)}`);
    } finally {
      setIsSaving(false);
    }
  };

  // 6. XỬ LÝ XOÁ BÀI LÀM NÀY
  const handleDeleteSubmission = async () => {
    if (!studentCode) return;
    try {
      if (onDeleteSubmission) {
        await onDeleteSubmission(studentCode);
      }
      onClose();
    } catch (err) {
      console.error('Lỗi khi xoá bài làm:', err);
    }
  };

  // 7. XỬ LÝ TẢI BÀI LÀM (PDF)
  const handleExportPdf = async () => {
    if (isExportingPdf) return;
    try {
      setIsExportingPdf(true);
      await downloadStudentSubmissionPdf({
        targetItem,
        studentName,
        studentCode,
        className: targetItem?.targetClass || studentSubmission?.targetClass,
        submittedTime,
        attempts: studentSubmission?.attempts || 1,
        evaluations,
        stats,
        mode
      });
    } catch (err: any) {
      console.error('Lỗi khi tạo file PDF:', err);
      alert(`Không thể tạo file PDF: ${err?.message || String(err)}`);
    } finally {
      setIsExportingPdf(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-70 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 animate-fade-in">
      <div className="bg-white rounded-3xl max-w-4xl w-full p-5 sm:p-7 shadow-2xl border border-slate-200 flex flex-col max-h-[92vh] overflow-y-auto space-y-5 animate-scale-up">
        
        {/* 1. HEADER */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
              <FileQuestion className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-slate-900 font-heading">
                Chi tiết bài làm & Chấm lại
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                {targetItem?.title || (mode === 'assignment' ? 'Bài tập' : 'Đề kiểm tra')} • {targetItem?.subject || ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleExportPdf}
              disabled={isExportingPdf}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-sm whitespace-nowrap disabled:opacity-60"
              title="Tải toàn bộ bài làm của học sinh này dưới dạng file PDF"
            >
              {isExportingPdf ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Đang tạo file...</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>Tải bài làm (PDF)</span>
                </>
              )}
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-all cursor-pointer"
              title="Đóng"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 2. SUB-HEADER NOTE */}
        <div className="text-xs font-semibold text-sky-600">
          Nội dung này do giáo viên tự biên soạn.
        </div>

        {/* 3. LIGHT PINK BANNER (HỒNG NHẠT) */}
        <div className="bg-rose-50/80 border border-rose-200 rounded-2xl p-4 sm:p-5 space-y-3">
          <h4 className="text-base font-black text-rose-900">
            {studentName} đã hoàn thành {mode === 'assignment' ? 'bài tập' : 'bài kiểm tra'} này!
          </h4>

          <div className="space-y-1.5 text-xs text-rose-900/90 font-medium">
            <p>
              <strong className="text-rose-950 font-bold">Số câu đúng:</strong>{' '}
              <span className="font-extrabold text-rose-700">{stats.correctCount}/{stats.totalCount}</span>
            </p>
            <p>
              <strong className="text-rose-950 font-bold">Tổng số câu hỏi:</strong>{' '}
              <span>{stats.totalCount}</span>
            </p>

            {isSubjectWithScore(targetItem?.subject) ? (
              <>
                <p>
                  <strong className="text-rose-950 font-bold">Điểm {mode === 'assignment' ? 'bài tập' : 'bài thi'}:</strong>{' '}
                  <span className="text-rose-600 font-extrabold">{stats.calculatedScore}</span>
                </p>
                <p>
                  <strong className="text-rose-950 font-bold">Điểm thang 10:</strong>{' '}
                  <span className="text-rose-600 font-black text-sm">{stats.scoreOutOf10}</span>
                </p>
              </>
            ) : (
              <p>
                <strong className="text-rose-950 font-bold">Mức đánh giá:</strong>{' '}
                <span className="font-extrabold text-emerald-700">
                  {getQualitativeLabel(stats.correctCount, stats.totalCount)}
                </span>
              </p>
            )}

            <p>
              <strong className="text-rose-950 font-bold">Thời gian nộp bài:</strong>{' '}
              <span>{formatSubmissionDateTime(submittedTime)}</span>
            </p>
          </div>

          <div className="pt-1 flex items-center gap-3">
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-xs transition-all cursor-pointer active:scale-95 flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" /> Xoá bài làm này
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs text-rose-800 font-bold">Xác nhận xoá?</span>
                <button
                  onClick={handleDeleteSubmission}
                  className="px-3 py-1.5 rounded-lg bg-rose-700 text-white font-bold text-xs hover:bg-rose-800"
                >
                  Đồng ý
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="px-3 py-1.5 rounded-lg bg-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-300"
                >
                  Huỷ
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 4. THÔNG BÁO LƯU THÀNH CÔNG */}
        {saveSuccessMsg && (
          <div className="p-3 bg-emerald-50 border border-emerald-300 text-emerald-800 rounded-xl text-xs font-bold flex items-center gap-2 animate-fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{saveSuccessMsg}</span>
          </div>
        )}

        {/* 5. TRƯỜNG HỢP KHÔNG TẢI ĐƯỢC CÂU HỎI */}
        {loadError && (
          <div className="p-6 bg-amber-50 border border-amber-200 rounded-2xl text-center space-y-2">
            <AlertTriangle className="w-8 h-8 text-amber-600 mx-auto" />
            <h4 className="text-sm font-extrabold text-amber-900">
              {loadError}
            </h4>
            <p className="text-xs text-amber-800/80">
              Hệ thống không tìm thấy nội dung câu hỏi trong bản chụp bài nộp hoặc trong bài giao với ID: <code className="bg-amber-100 px-1.5 py-0.5 rounded font-mono">{targetItem?.id}</code>.
            </p>
          </div>
        )}

        {isLoadingQuestions && (
          <div className="py-12 text-center text-slate-400 space-y-2">
            <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs font-semibold">Đang tải câu hỏi của bài làm...</p>
          </div>
        )}

        {/* 6. BẢNG ĐIỂM (SCORE MATRIX TABLE) - DÙNG CHUNG NGUỒN EVALUATIONS */}
        {!isLoadingQuestions && evaluations.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-base font-extrabold text-slate-900 font-heading">
                Bảng điểm
              </h4>
              <span className="text-xs text-slate-500 font-medium">
                Bấm vào nút <strong>[Đúng / Sai]</strong> ở từng câu bên dưới để chấm lại
              </span>
            </div>

            {/* Bảng điểm tóm tắt dạng ma trận hàng ngang */}
            <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white shadow-2xs">
              <table className="w-full text-center border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 font-bold text-slate-700">
                    <th className="py-2.5 px-4 text-left bg-slate-50 border-r border-slate-200 font-extrabold text-slate-800">
                      Câu hỏi
                    </th>
                    {evaluations.map((e) => (
                      <th 
                        key={e.questionIndex} 
                        className="py-2.5 px-3 bg-amber-50/80 border-r border-slate-200 font-black text-amber-800"
                      >
                        {e.questionIndex + 1}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  <tr className="border-b border-slate-200">
                    <td className="py-2.5 px-4 text-left font-bold text-slate-700 bg-slate-50 border-r border-slate-200">
                      Điểm
                    </td>
                    {evaluations.map((e) => (
                      <td 
                        key={e.questionIndex} 
                        className="py-2.5 px-3 font-extrabold text-slate-800 border-r border-slate-200"
                      >
                        {e.isCorrect ? formatScore(e.points) : '0'}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-2.5 px-4 text-left font-bold text-slate-700 bg-slate-50 border-r border-slate-200">
                      Kết quả
                    </td>
                    {evaluations.map((e) => (
                      <td key={e.questionIndex} className="py-2.5 px-3 border-r last:border-r-0 border-slate-200">
                        {e.isCorrect ? (
                          <span className="inline-flex w-5 h-5 rounded-full bg-emerald-100 border border-emerald-300 text-emerald-700 items-center justify-center text-[10px] font-black">
                            ✓
                          </span>
                        ) : (
                          <span className="inline-flex w-5 h-5 rounded-full bg-rose-100 border border-rose-300 text-rose-700 items-center justify-center text-[10px] font-black">
                            ✗
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>

            {/* 7. DANH SÁCH CHI TIẾT TỪNG CÂU HỎI THẬT */}
            <div className="space-y-4 pt-2">
              <h4 className="text-sm font-extrabold text-slate-900 font-heading">
                Chi tiết từng câu hỏi trong bài ({evaluations.length} câu)
              </h4>

              {evaluations.map((evalItem) => {
                const q = evalItem.question;
                const qIdx = evalItem.questionIndex;
                const qType = normalizeQuestionType(q.type);
                const isPass = evalItem.isCorrect;
                const studentChoice = evalItem.studentChoice;
                const isAnswered = evalItem.isAnswered;

                return (
                  <div 
                    key={evalItem.questionId}
                    className="p-4 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-3 transition-all hover:border-slate-300"
                  >
                    {/* Header câu hỏi: Số thứ tự, Điểm và Nút Đổi Đúng / Sai */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className={`font-extrabold text-xs ${isPass ? 'text-emerald-700' : 'text-rose-700'}`}>
                          Câu {qIdx + 1} ({formatScore(evalItem.points)}đ):
                        </span>

                        {/* Nút Đổi Đúng / Sai có thể bấm trực tiếp để chấm lại */}
                        <button
                          type="button"
                          onClick={() => handleToggleQuestionStatus(qIdx)}
                          className={`px-3 py-1 rounded-lg text-xs font-bold border flex items-center gap-1.5 cursor-pointer transition-all active:scale-95 ${
                            isPass 
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-200' 
                              : 'bg-rose-100 text-rose-800 border-rose-300 hover:bg-rose-200'
                          }`}
                          title="Bấm để đổi kết quả Đúng / Sai câu này"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>{isPass ? '✓ Đúng' : '✗ Sai'}</span>
                          <span className="text-[10px] opacity-75 font-normal">(Bấm để đổi)</span>
                        </button>
                      </div>

                      <span className="text-xs text-slate-400 font-medium">
                        {getQuestionTypeLabel(q.type)}
                      </span>
                    </div>

                    {/* Nội dung câu hỏi */}
                    <p className="font-bold text-slate-900 text-sm sm:text-base leading-relaxed">
                      {q.content}
                    </p>

                    {/* Cảnh báo chưa trả lời nếu học sinh bỏ trống */}
                    {!isAnswered && (
                      <div className="p-2.5 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-xs font-semibold flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>Học sinh chưa trả lời câu hỏi này (Bỏ trống)</span>
                      </div>
                    )}

                    {/* ======================================================== */}
                    {/* DẠNG 1: TRẮC NGHIỆM ĐƠN (MULTIPLE CHOICE)               */}
                    {/* ======================================================== */}
                    {qType === 'multiple_choice' && q.options && q.options.length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                        {q.options.map((optText, oIdx) => {
                          const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
                          const letter = letters[oIdx] || String.fromCharCode(65 + oIdx);

                          // Xác định đây có phải đáp án đúng của câu hỏi không
                          const isCorrectOpt = String(q.correctAnswer || '').trim().toUpperCase() === letter ||
                                               String(q.correctAnswer || '').trim().toLowerCase() === String(optText).trim().toLowerCase();

                          // Xác định học sinh có chọn phương án này không
                          let isSelectedByStudent = false;
                          if (typeof studentChoice === 'number') {
                            isSelectedByStudent = studentChoice === oIdx;
                          } else if (typeof studentChoice === 'string') {
                            const trimmedChoice = studentChoice.trim();
                            isSelectedByStudent = trimmedChoice.toUpperCase() === letter ||
                                                  trimmedChoice.toLowerCase() === String(optText).trim().toLowerCase();
                          }

                          // Styling theo quy định:
                          // - Học sinh chọn đúng: Xanh + nhãn "Học sinh chọn"
                          // - Học sinh chọn sai: Đỏ + nhãn "Học sinh chọn"
                          // - Đáp án đúng: Xanh + nhãn "Đáp án đúng"
                          // - Bình thường: Trắng
                          let boxStyle = 'border-slate-200 bg-white text-slate-700';
                          let badgeText: React.ReactNode = null;

                          if (isSelectedByStudent && isCorrectOpt) {
                            boxStyle = 'border-emerald-500 bg-emerald-50 text-emerald-950 font-bold';
                            badgeText = (
                              <span className="text-xs bg-emerald-200 text-emerald-800 px-2 py-0.5 rounded font-extrabold">
                                ✓ Đúng / Học sinh chọn
                              </span>
                            );
                          } else if (isSelectedByStudent && !isCorrectOpt) {
                            boxStyle = 'border-rose-400 bg-rose-50 text-rose-950 font-bold';
                            badgeText = (
                              <span className="text-xs bg-rose-200 text-rose-800 px-2 py-0.5 rounded font-extrabold">
                                ✗ Học sinh chọn
                              </span>
                            );
                          } else if (!isSelectedByStudent && isCorrectOpt) {
                            boxStyle = 'border-emerald-400 bg-emerald-50/70 text-emerald-900 font-semibold';
                            badgeText = (
                              <span className="text-xs bg-emerald-100 text-emerald-700 border border-emerald-300 px-2 py-0.5 rounded font-medium">
                                Đáp án đúng
                              </span>
                            );
                          }

                          return (
                            <div 
                              key={oIdx} 
                              className={`p-3 rounded-xl border flex items-center justify-between gap-3 text-xs sm:text-sm ${boxStyle}`}
                            >
                              <div className="flex items-center gap-2.5">
                                <span className="w-6 h-6 rounded-md bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-xs shrink-0">
                                  {letter}
                                </span>
                                <span>{optText}</span>
                              </div>
                              {badgeText}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* ======================================================== */}
                    {/* DẠNG 2: CÂU HỎI ĐÚNG / SAI (TRUE / FALSE)               */}
                    {/* ======================================================== */}
                    {isTrueFalseQuestion(q) && (
                      <div className="space-y-2 pt-1">
                        {q.statements && q.statements.length > 0 ? (
                          <div className="space-y-2">
                            {q.statements.map((stmt: any, sIdx: number) => {
                              const studentStmtChoice = (typeof studentChoice === 'object' && studentChoice !== null)
                                ? studentChoice[sIdx]
                                : undefined;

                              const isStmtCorrect = studentStmtChoice === stmt.isCorrect;

                              return (
                                <div 
                                  key={sIdx}
                                  className="p-3 rounded-xl border border-slate-200 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                                >
                                  <span className="font-medium text-slate-800">{sIdx + 1}. {stmt.text || stmt.content}</span>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <span className="text-slate-500">
                                      Đáp án: <strong className="text-emerald-700">{stmt.isCorrect ? 'Đúng' : 'Sai'}</strong>
                                    </span>
                                    <span className="text-slate-400">|</span>
                                    <span className={`px-2 py-0.5 rounded font-bold ${
                                      studentStmtChoice === undefined 
                                        ? 'bg-slate-100 text-slate-400' 
                                        : isStmtCorrect 
                                          ? 'bg-emerald-100 text-emerald-800' 
                                          : 'bg-rose-100 text-rose-800'
                                    }`}>
                                      HS chọn: {studentStmtChoice === undefined ? 'Chưa chọn' : (studentStmtChoice ? 'Đúng' : 'Sai')}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="p-3 bg-white rounded-xl border border-slate-200 text-xs space-y-1">
                            <div>Đáp án đúng: <strong className="text-emerald-700">{String(q.correctAnswer)}</strong></div>
                            <div>Học sinh trả lời: <strong className={isPass ? 'text-emerald-700' : 'text-rose-700'}>{String(studentChoice ?? 'Chưa trả lời')}</strong></div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* ======================================================== */}
                    {/* DẠNG 3: NỐI CẶP (MATCHING)                              */}
                    {/* ======================================================== */}
                    {isMatchingQuestion(q) && q.matchingPairs && q.matchingPairs.length > 0 && (
                      <div className="space-y-2 pt-1 text-xs">
                        <div className="font-semibold text-slate-600 mb-1">Các cặp ghép nối:</div>
                        {q.matchingPairs.map((pair, pIdx) => {
                          const studentMatched = (typeof studentChoice === 'object' && studentChoice !== null)
                            ? (studentChoice[pIdx] !== undefined ? studentChoice[pIdx] : studentChoice[pair.left])
                            : undefined;

                          const isPairMatch = studentMatched && String(studentMatched).trim().toLowerCase() === String(pair.right).trim().toLowerCase();

                          return (
                            <div key={pIdx} className="p-2.5 rounded-xl border border-slate-200 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                              <span className="font-bold text-slate-800">{pair.left}</span>
                              <div className="flex items-center gap-2">
                                <span className="text-emerald-700 font-medium">➔ Đúng: {pair.right}</span>
                                <span className={`px-2 py-0.5 rounded font-bold ${isPairMatch ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                                  HS nối: {studentMatched || 'Chưa nối'}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* ======================================================== */}
                    {/* DẠNG 4: SẮP XẾP THỨ TỰ (ORDERING)                       */}
                    {/* ======================================================== */}
                    {isOrderingQuestion(q) && (
                      <div className="space-y-2 pt-1 text-xs">
                        <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-1.5">
                          <div className="font-semibold text-emerald-700">
                            Thứ tự đúng: {Array.isArray(q.correctOrder) ? q.correctOrder.join(' ➔ ') : (q.correctAnswer || 'Theo khai báo bài')}
                          </div>
                          <div className="font-semibold text-slate-700">
                            Thứ tự học sinh sắp xếp:{' '}
                            <span className={isPass ? 'text-emerald-700 font-bold' : 'text-rose-700 font-bold'}>
                              {Array.isArray(studentChoice) ? studentChoice.join(' ➔ ') : (studentChoice || 'Chưa sắp xếp')}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* ======================================================== */}
                    {/* DẠNG 5: ĐIỀN KHUYẾT / TỰ LUẬN (FILL BLANK / ESSAY)       */}
                    {/* ======================================================== */}
                    {(isFillBlankQuestion(q) || isEssayQuestion(q)) && (
                      <div className="space-y-2 pt-1 text-xs">
                        <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-1.5">
                          <div>Đáp án chuẩn: <strong className="text-emerald-700">{q.correctAnswer || 'Giáo viên tự chấm'}</strong></div>
                          <div>
                            Câu trả lời của học sinh:{' '}
                            <strong className={isPass ? 'text-emerald-700' : 'text-rose-700'}>
                              {studentChoice !== undefined && studentChoice !== '' ? String(studentChoice) : 'Chưa nhập câu trả lời'}
                            </strong>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Gợi ý / Giải thích nếu có */}
                    {q.explanation && (
                      <div className="p-2.5 bg-amber-50/70 border border-amber-200 rounded-xl text-xs text-amber-900 font-medium">
                        💡 <strong>Giải thích / Gợi ý:</strong> {q.explanation}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 8. FOOTER: NÚT LƯU KẾT QUẢ CHẤM LẠI & ĐÓNG */}
        <div className="pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            {hasChanges && (
              <span className="text-xs font-bold text-amber-600 flex items-center gap-1 animate-pulse">
                <AlertCircle className="w-4 h-4" /> Đã sửa điểm câu hỏi, vui lòng lưu lại
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-50 transition-all cursor-pointer"
            >
              Đóng
            </button>

            <button
              onClick={handleSaveRegrade}
              disabled={isSaving || !hasChanges}
              className={`px-5 py-2.5 rounded-xl font-bold text-xs shadow-xs transition-all flex items-center gap-1.5 cursor-pointer ${
                hasChanges 
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-200 active:scale-95' 
                  : 'bg-slate-100 text-slate-400 cursor-not-allowed'
              }`}
            >
              <Save className="w-4 h-4" />
              <span>{isSaving ? 'Đang lưu...' : 'Lưu kết quả chấm lại'}</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
