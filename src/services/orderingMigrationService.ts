import { db } from './firebase';
import { collection, getDocs, doc } from 'firebase/firestore';
import { trackedSetDoc } from './firestoreWriteTracker';
import { HomeworkAssignment, QuestionItem } from '../types';
import { getCorrectOrderingSequence } from '../lib/constants';
import { checkQuestionCorrectLocal } from '../components/modules/StudentExamModule';
import { getLocalCachedAssignments, saveAssignmentsToLocalStorage } from './assignmentStorageService';
import { getLocalCachedQuestions, saveQuestionsBatchToFirestore } from './questionStorageService';

const ORDERING_MIGRATION_KEY = 'eduplay_ordering_migration_done_v2';

/**
 * Migration Service: Chuẩn hóa toàn bộ câu hỏi Sắp xếp thứ tự (Ordering)
 * và tự động chấm lại toàn bộ các bài nộp đã làm của học sinh.
 */
export async function runOrderingQuestionsMigration(): Promise<void> {
  if (typeof window === 'undefined') return;
  if (localStorage.getItem(ORDERING_MIGRATION_KEY) === 'true') {
    return; // Migration already completed previously!
  }

  try {
    console.log('🔄 Bắt đầu quét và chuẩn hóa toàn bộ câu hỏi Sắp xếp thứ tự (Ordering)...');

    // 1. Quét và cập nhật assignments trong LocalStorage
    const localAssignments = getLocalCachedAssignments();
    let localAssignmentsChanged = false;

    const updatedLocalAssignments = localAssignments.map(as => {
      let asChanged = false;
      const questions = as.questions || [];
      const totalQ = questions.length || 1;

      // Chuẩn hóa câu hỏi
      const fixedQuestions = questions.map(q => {
        const isOrdering = (q.type || '').includes('ordering') || (q.type || '').includes('sắp xếp');
        if (!isOrdering) return q;

        const trueOrder = getCorrectOrderingSequence(q);
        const newCorrectAnswer = trueOrder.map((opt, i) => `${i + 1}. ${opt}`).join('\n');
        asChanged = true;
        return {
          ...q,
          correctOrder: trueOrder,
          correctAnswer: newCorrectAnswer
        };
      });

      // Chấm lại submissions nếu có
      let fixedSubs = as.submissions;
      if (Array.isArray(as.submissions) && as.submissions.length > 0) {
        fixedSubs = as.submissions.map(sub => {
          if (!sub.answers) return sub;
          let correctCount = 0;
          fixedQuestions.forEach((q, qIdx) => {
            const studentChoice = Array.isArray(sub.answers) 
              ? sub.answers[qIdx] 
              : (sub.answers[qIdx] !== undefined ? sub.answers[qIdx] : sub.answers[String(qIdx)]);
            if (checkQuestionCorrectLocal(q, studentChoice)) {
              correctCount++;
            }
          });
          const newScore = Number(((correctCount / totalQ) * 10).toFixed(1));
          if (sub.score !== newScore) {
            asChanged = true;
            return {
              ...sub,
              score: newScore
            };
          }
          return sub;
        });
      }

      if (asChanged) {
        localAssignmentsChanged = true;
        return {
          ...as,
          questions: fixedQuestions,
          submissions: fixedSubs
        };
      }
      return as;
    });

    if (localAssignmentsChanged) {
      saveAssignmentsToLocalStorage(updatedLocalAssignments);
      console.log('✅ Đã chuẩn hóa câu hỏi và điểm số trong LocalStorage assignments');
    }

    // 2. Quét và cập nhật LocalStorage cho bài làm của từng học sinh (eduplay_student_submissions_*)
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('eduplay_student_submissions_')) {
        try {
          const raw = localStorage.getItem(key);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
              let changed = false;
              const updatedSubs = parsed.map(subItem => {
                const as = subItem.assignment;
                if (!as || !Array.isArray(as.questions)) return subItem;

                let subChanged = false;
                const fixedQuestions = as.questions.map((q: QuestionItem) => {
                  const isOrdering = (q.type || '').includes('ordering') || (q.type || '').includes('sắp xếp');
                  if (!isOrdering) return q;
                  const trueOrder = getCorrectOrderingSequence(q);
                  subChanged = true;
                  return {
                    ...q,
                    correctOrder: trueOrder,
                    correctAnswer: trueOrder.map((opt, idx) => `${idx + 1}. ${opt}`).join('\n')
                  };
                });

                if (subChanged && subItem.answers) {
                  let correctCount = 0;
                  const totalQ = fixedQuestions.length || 1;
                  fixedQuestions.forEach((q: QuestionItem, qIdx: number) => {
                    const studentChoice = Array.isArray(subItem.answers)
                      ? subItem.answers[qIdx]
                      : (subItem.answers[qIdx] !== undefined ? subItem.answers[qIdx] : subItem.answers[String(qIdx)]);
                    if (checkQuestionCorrectLocal(q, studentChoice)) {
                      correctCount++;
                    }
                  });
                  const newScore = Number(((correctCount / totalQ) * 10).toFixed(1));
                  changed = true;
                  return {
                    ...subItem,
                    score: String(newScore),
                    assignment: {
                      ...as,
                      questions: fixedQuestions
                    }
                  };
                }
                return subItem;
              });

              if (changed) {
                localStorage.setItem(key, JSON.stringify(updatedSubs));
              }
            }
          }
        } catch {}
      }
    }

    // 3. Quét và cập nhật Cloud Firestore nếu db sẵn sàng
    if (db) {
      const assignSnap = await getDocs(collection(db, 'assignments'));
      for (const docSnap of assignSnap.docs) {
        const asData = docSnap.data() as HomeworkAssignment;
        let docChanged = false;
        const questions = asData.questions || [];
        const totalQ = questions.length || 1;

        const fixedQuestions = questions.map(q => {
          const isOrdering = (q.type || '').includes('ordering') || (q.type || '').includes('sắp xếp');
          if (!isOrdering) return q;

          const trueOrder = getCorrectOrderingSequence(q);
          const newCorrectAnswer = trueOrder.map((opt, i) => `${i + 1}. ${opt}`).join('\n');
          docChanged = true;
          return {
            ...q,
            correctOrder: trueOrder,
            correctAnswer: newCorrectAnswer
          };
        });

        let fixedSubs = asData.submissions;
        if (Array.isArray(asData.submissions) && asData.submissions.length > 0) {
          fixedSubs = asData.submissions.map(sub => {
            if (!sub.answers) return sub;
            let correctCount = 0;
            fixedQuestions.forEach((q, qIdx) => {
              const studentChoice = Array.isArray(sub.answers) 
                ? sub.answers[qIdx] 
                : (sub.answers[qIdx] !== undefined ? sub.answers[qIdx] : sub.answers[String(qIdx)]);
              if (checkQuestionCorrectLocal(q, studentChoice)) {
                correctCount++;
              }
            });
            const newScore = Number(((correctCount / totalQ) * 10).toFixed(1));
            if (sub.score !== newScore) {
              docChanged = true;
              return {
                ...sub,
                score: newScore
              };
            }
            return sub;
          });
        }

        if (docChanged) {
          const assignRef = doc(db, 'assignments', docSnap.id);
          await trackedSetDoc(assignRef, {
            questions: fixedQuestions,
            submissions: fixedSubs,
            updatedAt: new Date().toISOString()
          }, { merge: true });
          console.log(`✅ Đã chuẩn hóa câu hỏi và điểm bài tập ${docSnap.id} trên Firestore`);
        }
      }

      // Quét câu hỏi trong questions collection
      try {
        const qSnap = await getDocs(collection(db, 'questions'));
        for (const docSnap of qSnap.docs) {
          const qData = docSnap.data() as QuestionItem;
          const isOrdering = (qData.type || '').includes('ordering') || (qData.type || '').includes('sắp xếp');
          if (isOrdering) {
            const trueOrder = getCorrectOrderingSequence(qData);
            const newCorrectAnswer = trueOrder.map((opt, i) => `${i + 1}. ${opt}`).join('\n');
            await trackedSetDoc(doc(db, 'questions', docSnap.id), {
              correctOrder: trueOrder,
              correctAnswer: newCorrectAnswer
            }, { merge: true });
          }
        }
      } catch {}
    }

    localStorage.setItem(ORDERING_MIGRATION_KEY, 'true');
    window.dispatchEvent(new Event('eduplay_student_submissions_updated'));
    console.log('🎉 Hoàn thành migration chuẩn hóa câu hỏi sắp xếp thứ tự!');
  } catch (err) {
    console.warn('Lỗi khi chạy runOrderingQuestionsMigration:', err);
  }
}

// Tự động kích hoạt khi tải ứng dụng
if (typeof window !== 'undefined') {
  setTimeout(() => {
    runOrderingQuestionsMigration().catch(console.error);
  }, 500);
}
