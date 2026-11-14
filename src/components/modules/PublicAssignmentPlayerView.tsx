import React, { useEffect, useState, useMemo } from 'react';
import { HomeworkAssignment, ExamPaper } from '../../types';
import {
  fetchPublicAssignmentById,
  getSavedGuestStudentProfile,
  GuestStudentProfile,
  saveGuestAssignmentSubmissionToFirestore,
} from '../../services/publicGuestService';
import { GuestStudentEntryForm } from '../common/GuestStudentEntryForm';
import { StudentExamModule } from './StudentExamModule';
import { PublicLessonPlayerView } from './PublicLessonPlayerView';
import { AlertCircle, Home, RefreshCw } from 'lucide-react';

interface PublicAssignmentPlayerViewProps {
  assignmentId: string;
  onGoHome?: () => void;
}

export const PublicAssignmentPlayerView: React.FC<PublicAssignmentPlayerViewProps> = ({
  assignmentId,
  onGoHome,
}) => {
  const [assignment, setAssignment] = useState<HomeworkAssignment | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [guestProfile, setGuestProfile] = useState<GuestStudentProfile | null>(() =>
    getSavedGuestStudentProfile()
  );
  const [isStarted, setIsStarted] = useState(false);

  const loadAssignment = async () => {
    setIsLoading(true);
    try {
      const res = await fetchPublicAssignmentById(assignmentId);
      if (res.status === 'ok') {
        setAssignment(res.assignment);
      } else {
        setAssignment(null);
      }
    } catch (e) {
      console.error('Error loading public assignment:', e);
      setAssignment(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAssignment();
  }, [assignmentId]);

  const handleGoHome = () => {
    if (onGoHome) {
      onGoHome();
    } else if (typeof window !== 'undefined') {
      window.location.href = '/';
    }
  };

  const examFromAssignment = useMemo<ExamPaper | null>(() => {
    if (!assignment) return null;
    const questions = Array.isArray(assignment.questions) ? assignment.questions : [];

    return {
      id: assignment.id,
      originalExamId: assignment.originalAssignmentId,
      title: assignment.title || 'Bài tập trực tuyến',
      subject: assignment.subject || 'Tin học',
      grade: assignment.grade || 'Khối 3',
      durationMinutes: 45,
      totalPoints: 10,
      matrix: { nhanBiet: 0, thongHieu: 0, vanDung: 0, vanDungCao: 0 },
      questions,
      createdAt: assignment.dueDate || new Date().toISOString().split('T')[0],
      status: 'published',
      targetClass: assignment.targetClass || 'Tất cả',
      examType: 'Luyện tập',
      enableRealtimeLeaderboard: assignment.enableRealtimeLeaderboard,
      createdBy: assignment.createdBy,
    };
  }, [assignment]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-sky-50 flex flex-col items-center justify-center p-6">
        <div className="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-slate-700 font-extrabold text-base">
          Đang tải bài tập trực tuyến...
        </p>
      </div>
    );
  }

  if (!assignment) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-20 h-20 rounded-3xl bg-rose-100 text-rose-600 flex items-center justify-center mb-4 shadow-sm">
          <AlertCircle size={40} />
        </div>
        <h2 className="text-xl font-black text-slate-900 mb-2">
          Không tìm thấy bài tập
        </h2>
        <p className="text-slate-600 max-w-md mb-6 text-sm">
          Bài tập này không tồn tại, đã bị xóa hoặc đường dẫn chia sẻ không hợp lệ.
        </p>
        <div className="flex items-center gap-3">
          <button
            onClick={loadAssignment}
            className="px-5 py-2.5 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-100 transition flex items-center gap-2"
          >
            <RefreshCw size={16} /> Thử tải lại
          </button>
          <button
            onClick={handleGoHome}
            className="px-5 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition flex items-center gap-2"
          >
            <Home size={16} /> Về trang chủ
          </button>
        </div>
      </div>
    );
  }

  // If this assignment is an E-learning lesson assignment without standalone questions
  if (assignment.lessonId && (!assignment.questions || assignment.questions.length === 0)) {
    return <PublicLessonPlayerView lessonId={assignment.lessonId} onGoHome={handleGoHome} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <GuestStudentEntryForm
        activityTypeLabel="Bài Tập Trực Tuyến"
        title={assignment.title || 'Bài tập tự luyện'}
        subject={assignment.subject}
        grade={assignment.grade}
        subtitle={assignment.description}
        questionCount={(assignment.questions || []).length}
        guestProfile={guestProfile}
        isStarted={isStarted}
        onStart={(profile) => {
          setGuestProfile(profile);
          setIsStarted(true);
        }}
        onEditInfo={() => setIsStarted(false)}
        onGoHome={handleGoHome}
      />

      {isStarted && guestProfile && examFromAssignment && (
        <div className="flex-1 max-w-6xl w-full mx-auto px-4 py-6">
          <StudentExamModule
            key={`${examFromAssignment.id}_${guestProfile.guestCode}`}
            exams={[examFromAssignment]}
            currentUserId={guestProfile.guestCode}
            currentUserName={`${guestProfile.studentName} (${guestProfile.classOrSchool})`}
            initialActiveExam={examFromAssignment}
            mode="assignment"
            allowMultipleAttempts={true}
            onCloseExam={handleGoHome}
            onSubmitted={(submission) => {
              saveGuestAssignmentSubmissionToFirestore({
                assignment,
                guestProfile,
                answers: submission.answers || {},
                scoreNumber: Number(submission.scoreNumber ?? submission.totalScore ?? 0),
                scoreLabel: String(submission.score ?? '0 / 10'),
                correctCount: Number(submission.correctCount ?? 0),
                totalQuestions: Number(submission.totalQuestions ?? (assignment.questions || []).length),
                submittedTime: String(submission.submittedTime || new Date().toLocaleString('vi-VN')),
              });
            }}
          />
        </div>
      )}
    </div>
  );
};
