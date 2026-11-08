import { HomeworkAssignment, ExamPaper, QuestionItem } from '../types';
import { getLocalCachedAssignments, saveAssignmentsToLocalStorage, saveAssignmentToFirestore } from './assignmentStorageService';
import { getLocalCachedExams } from './examStorageService';
import { getLocalCachedQuestions } from './questionStorageService';
import { extractGradeDigit } from '../lib/constants';

/**
 * Normalize title by stripping common prefixes and extra whitespace
 */
export function normalizeTitle(title: string): string {
  if (!title) return '';
  return title
    .trim()
    .toLowerCase()
    .replace(/^đề kiểm tra\s*[-–:]\s*/i, '')
    .replace(/^bài tập\s*[-–:]\s*/i, '')
    .replace(/^bài tập tự luyện\s*[-–:]\s*/i, '')
    .replace(/^bài tập tự luyện từ ngân hàng câu hỏi\s*[-–:]\s*/i, '')
    .replace(/^luyện tập\s*[-–:]\s*/i, '')
    .replace(/^trò chơi\s*[-–:]\s*/i, '')
    .replace(/^chủ đề\s*[-–:]\s*/i, '')
    .replace(/\s+/g, ' ');
}

/**
 * Check if two questions have identical content and structure
 */
export function areQuestionsEqual(q1: QuestionItem, q2: QuestionItem): boolean {
  if (!q1 || !q2) return false;
  if ((q1.content || '').trim() !== (q2.content || '').trim()) return false;
  if (q1.type !== q2.type) return false;
  if ((q1.correctAnswer || '').trim() !== (q2.correctAnswer || '').trim()) return false;
  if (JSON.stringify(q1.options || []) !== JSON.stringify(q2.options || [])) return false;
  if (JSON.stringify(q1.matchingPairs || []) !== JSON.stringify(q2.matchingPairs || [])) return false;
  if (JSON.stringify(q1.statements || []) !== JSON.stringify(q2.statements || [])) return false;
  if (JSON.stringify(q1.correctOrder || []) !== JSON.stringify(q2.correctOrder || [])) return false;
  return true;
}

/**
 * Find matching original ExamPaper for an assignment
 */
export function findMatchingSourceExam(
  assignment: HomeworkAssignment,
  availableExams?: ExamPaper[]
): ExamPaper | null {
  const exams = availableExams && availableExams.length > 0 ? availableExams : getLocalCachedExams();
  if (!exams || exams.length === 0) return null;

  const rawExamId = (assignment as any).examId || assignment.originalAssignmentId || '';
  const asCleanTitle = normalizeTitle(assignment.title);
  const asSubject = (assignment.subject || '').trim().toLowerCase();
  const asGradeDigit = extractGradeDigit(assignment.grade || assignment.targetClass || '');

  // 1. Direct ID match
  if (rawExamId) {
    const foundById = exams.find(e => e.id === rawExamId || e.id === rawExamId.replace(/-class-.*$/, ''));
    if (foundById) return foundById;
  }

  // 2. Embedded ID match (e.g., assignment.id starts with exam-...)
  const foundByEmbeddedId = exams.find(e => assignment.id.includes(e.id));
  if (foundByEmbeddedId) return foundByEmbeddedId;

  // 3. Exact normalized title + subject + grade match
  if (asCleanTitle) {
    const foundByTitle = exams.find(e => {
      const examCleanTitle = normalizeTitle(e.title);
      const examSubject = (e.subject || '').trim().toLowerCase();
      const examGradeDigit = extractGradeDigit(e.grade || '');

      const titleMatch = examCleanTitle === asCleanTitle ||
        (asCleanTitle.length > 5 && examCleanTitle.includes(asCleanTitle)) ||
        (examCleanTitle.length > 5 && asCleanTitle.includes(examCleanTitle));

      const subjectMatch = !asSubject || !examSubject || asSubject === examSubject;
      const gradeMatch = !asGradeDigit || !examGradeDigit || asGradeDigit === examGradeDigit;

      return titleMatch && subjectMatch && gradeMatch;
    });

    if (foundByTitle) return foundByTitle;
  }

  // 4. Question ID overlap match (>= 60% question IDs match)
  const asQuestionIds = new Set((assignment.questions || []).map(q => q.id).filter(Boolean));
  if (asQuestionIds.size >= 2) {
    for (const ex of exams) {
      const exQuestionIds = (ex.questions || []).map(q => q.id).filter(Boolean);
      let matchCount = 0;
      exQuestionIds.forEach(id => {
        if (asQuestionIds.has(id)) matchCount++;
      });
      const ratio = matchCount / Math.max(1, asQuestionIds.size);
      if (ratio >= 0.6) {
        return ex;
      }
    }
  }

  return null;
}

export interface SyncResult {
  updatedAssignment: HomeworkAssignment;
  changed: boolean;
  sourceType: 'exam' | 'question_bank' | 'none';
  sourceTitle: string;
  details: {
    added: number;
    updated: number;
    removed: number;
    totalQuestions: number;
  };
  message: string;
}

/**
 * Synchronize questions of an assignment from original exam or question bank
 */
export function syncAssignmentQuestions(
  assignment: HomeworkAssignment,
  options?: {
    exams?: ExamPaper[];
    questionsBank?: QuestionItem[];
    forceTopicSync?: boolean;
  }
): SyncResult {
  if (!assignment) {
    return {
      updatedAssignment: assignment,
      changed: false,
      sourceType: 'none',
      sourceTitle: '',
      details: { added: 0, updated: 0, removed: 0, totalQuestions: 0 },
      message: 'Không tìm thấy dữ liệu bài tập.'
    };
  }

  const existingQuestions: QuestionItem[] = assignment.questions || [];
  const matchingExam = findMatchingSourceExam(assignment, options?.exams);

  // Strategy 1: Sync from Source Exam Paper (full set of additions, edits, deletions)
  if (matchingExam && matchingExam.questions && matchingExam.questions.length > 0) {
    const examQuestions = matchingExam.questions;
    const oldIds = new Set(existingQuestions.map(q => q.id));
    const newIds = new Set(examQuestions.map(q => q.id));

    let added = 0;
    let removed = 0;
    let updated = 0;

    examQuestions.forEach(eq => {
      if (!oldIds.has(eq.id)) {
        added++;
      } else {
        const oldQ = existingQuestions.find(q => q.id === eq.id);
        if (oldQ && !areQuestionsEqual(oldQ, eq)) {
          updated++;
        }
      }
    });

    existingQuestions.forEach(oq => {
      if (!newIds.has(oq.id)) {
        removed++;
      }
    });

    const hasChanged = added > 0 || removed > 0 || updated > 0 || existingQuestions.length !== examQuestions.length;

    const updatedAssignment: HomeworkAssignment = {
      ...assignment,
      questions: [...examQuestions],
      updatedAt: new Date().toISOString()
    };

    let msg = `Đã đồng bộ từ đề gốc "${matchingExam.title}": `;
    const parts: string[] = [];
    if (added > 0) parts.push(`Thêm mới ${added} câu`);
    if (updated > 0) parts.push(`Cập nhật nội dung ${updated} câu`);
    if (removed > 0) parts.push(`Xóa ${removed} câu không còn trong đề`);
    if (parts.length === 0) parts.push('Câu hỏi đã đồng bộ đầy đủ (phiên bản mới nhất)');
    msg += parts.join(', ') + '.';

    return {
      updatedAssignment,
      changed: hasChanged,
      sourceType: 'exam',
      sourceTitle: matchingExam.title,
      details: {
        added,
        updated,
        removed,
        totalQuestions: examQuestions.length
      },
      message: msg
    };
  }

  // Strategy 2: Sync from Question Bank (by question ID or topic)
  const bankQuestions = options?.questionsBank && options.questionsBank.length > 0
    ? options.questionsBank
    : getLocalCachedQuestions();

  if (bankQuestions && bankQuestions.length > 0) {
    const bankMapById = new Map<string, QuestionItem>();
    const bankMapByCode = new Map<string, QuestionItem>();
    bankQuestions.forEach(q => {
      if (q.id) bankMapById.set(q.id, q);
      if (q.code) bankMapByCode.set(q.code, q);
    });

    let updated = 0;
    const updatedQuestions = existingQuestions.map(q => {
      const freshQ = bankMapById.get(q.id) || (q.code ? bankMapByCode.get(q.code) : undefined);
      if (freshQ && !areQuestionsEqual(q, freshQ)) {
        updated++;
        return {
          ...q,
          ...freshQ,
          id: q.id // retain stable ID
        };
      }
      return q;
    });

    // Check if new questions were added to the same topic/lesson in Question Bank
    let added = 0;
    const topicName = existingQuestions[0]?.lessonName;
    if (options?.forceTopicSync && topicName) {
      const existingIds = new Set(updatedQuestions.map(q => q.id));
      const topicQuestionsInBank = bankQuestions.filter(
        bq => (bq.lessonName || '').trim() === topicName.trim() && !existingIds.has(bq.id)
      );
      if (topicQuestionsInBank.length > 0) {
        added = topicQuestionsInBank.length;
        updatedQuestions.push(...topicQuestionsInBank);
      }
    }

    const hasChanged = updated > 0 || added > 0;
    const updatedAssignment: HomeworkAssignment = {
      ...assignment,
      questions: updatedQuestions,
      updatedAt: new Date().toISOString()
    };

    let msg = 'Đã đồng bộ từ Ngân hàng câu hỏi: ';
    const parts: string[] = [];
    if (updated > 0) parts.push(`Cập nhật ${updated} câu`);
    if (added > 0) parts.push(`Thêm ${added} câu mới từ chủ đề`);
    if (parts.length === 0) parts.push('Câu hỏi đã đồng bộ với ngân hàng câu hỏi gốc');
    msg += parts.join(', ') + '.';

    return {
      updatedAssignment,
      changed: hasChanged,
      sourceType: 'question_bank',
      sourceTitle: 'Ngân hàng câu hỏi',
      details: {
        added,
        updated,
        removed: 0,
        totalQuestions: updatedQuestions.length
      },
      message: msg
    };
  }

  return {
    updatedAssignment: assignment,
    changed: false,
    sourceType: 'none',
    sourceTitle: '',
    details: { added: 0, updated: 0, removed: 0, totalQuestions: existingQuestions.length },
    message: 'Không tìm thấy đề gốc hoặc ngân hàng câu hỏi tương ứng.'
  };
}

/**
 * Automatically synchronize all existing assignments that match a modified exam
 */
export function syncAssignmentsForExam(exam: ExamPaper): number {
  if (typeof window === 'undefined' || !exam) return 0;
  try {
    const assignments = getLocalCachedAssignments();
    if (!assignments || assignments.length === 0) return 0;

    let updatedCount = 0;
    const newAssignments = assignments.map(as => {
      const match = findMatchingSourceExam(as, [exam]);
      if (match && match.id === exam.id) {
        const questionsDiffer = JSON.stringify(as.questions || []) !== JSON.stringify(exam.questions || []);
        if (questionsDiffer) {
          updatedCount++;
          return {
            ...as,
            questions: [...exam.questions],
            updatedAt: new Date().toISOString()
          };
        }
      }
      return as;
    });

    if (updatedCount > 0) {
      saveAssignmentsToLocalStorage(newAssignments);
      // Asynchronously update Firestore for modified assignments
      newAssignments.forEach(as => {
        if (JSON.stringify(as.questions) === JSON.stringify(exam.questions)) {
          saveAssignmentToFirestore(as).catch(err => {
            console.warn(`[Sync] Không thể lưu bài tập ${as.id} vào Firestore:`, err);
          });
        }
      });
      console.log(`🔄 [Auto-Sync] Đã tự động đồng bộ ${updatedCount} bài tập đã giao theo đề "${exam.title}"!`);
    }

    return updatedCount;
  } catch (err) {
    console.warn('Lỗi khi chạy syncAssignmentsForExam:', err);
    return 0;
  }
}
