import React, { useEffect, useState, useMemo } from 'react';
import { ExamPaper } from '../../types';
import {
  fetchPublicExamById,
  getSavedGuestStudentProfile,
  GuestStudentProfile,
  saveGuestExamSubmissionToFirestore,
} from '../../services/publicGuestService';
import { GuestStudentEntryForm } from '../common/GuestStudentEntryForm';
import { StudentExamModule } from './StudentExamModule';
import { AlertCircle, Home, RefreshCw } from 'lucide-react';

interface PublicExamPlayerViewProps {
  examId: string;
  onGoHome?: () => void;
}

export const PublicExamPlayerView: React.FC<PublicExamPlayerViewProps> = ({
  examId,
  onGoHome,
}) => {
  const [exam, setExam] = useState<ExamPaper | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [guestProfile, setGuestProfile] = useState<GuestStudentProfile | null>(() =>
    getSavedGuestStudentProfile()
  );
  const [isStarted, setIsStarted] = useState(false);

  const loadExam = async () => {
    setIsLoading(true);
    try {
      const res = await fetchPublicExamById(examId);
      if (res.status === 'ok') {
        setExam(res.exam);
      } else {
        setExam(null);
      }
    } catch (e) {
      console.error('Error loading public exam:', e);
      setExam(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadExam();
  }, [examId]);

  const playableExam = useMemo<ExamPaper | null>(() => {
    if (!exam) return null;
    return {
      ...exam,
      status: 'published',
      startTime: undefined,
      endTime: undefined,
    };
  }, [exam]);

  const handleGoHome = () => {
    if (onGoHome) {
      onGoHome();
    } else if (typeof window !== 'undefined') {
      window.location.href = '/';
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-sky-50 flex flex-col items-center justify-center p-6">
        <div className="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-slate-700 font-extrabold text-base">
          Đang tải đề kiểm tra trực tuyến...
        </p>
      </div>
    );
  }

  if (!exam || !playableExam) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-20 h-20 rounded-3xl bg-rose-100 text-rose-600 flex items-center justify-center mb-4 shadow-sm">
          <AlertCircle size={40} />
        </div>
        <h2 className="text-xl font-black text-slate-900 mb-2">
          Không tìm thấy đề kiểm tra
        </h2>
        <p className="text-slate-600 max-w-md mb-6 text-sm">
          Đề kiểm tra này không tồn tại, chưa được phát hành hoặc đường dẫn chia sẻ không hợp lệ.
        </p>
        <div className="flex items-center gap-3">
          <button
            onClick={loadExam}
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

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <GuestStudentEntryForm
        activityTypeLabel="Đề Kiểm Tra Trực Tuyến"
        title={exam.title || 'Đề kiểm tra'}
        subject={exam.subject}
        grade={exam.grade}
        questionCount={(exam.questions || []).length}
        durationMinutes={exam.durationMinutes || 30}
        guestProfile={guestProfile}
        isStarted={isStarted}
        onStart={(profile) => {
          setGuestProfile(profile);
          setIsStarted(true);
        }}
        onEditInfo={() => setIsStarted(false)}
        onGoHome={handleGoHome}
      />

      {isStarted && guestProfile && (
        <div className="flex-1 max-w-6xl w-full mx-auto px-4 py-6">
          <StudentExamModule
            key={`${playableExam.id}_${guestProfile.guestCode}`}
            exams={[playableExam]}
            currentUserId={guestProfile.guestCode}
            currentUserName={`${guestProfile.studentName} (${guestProfile.classOrSchool})`}
            initialActiveExam={playableExam}
            mode="exam"
            allowMultipleAttempts={true}
            onCloseExam={handleGoHome}
            onSubmitted={(submission) => {
              saveGuestExamSubmissionToFirestore({
                exam,
                guestProfile,
                answers: submission.answers || {},
                scoreNumber: Number(submission.scoreNumber ?? submission.totalScore ?? 0),
                scoreLabel: String(submission.score ?? '0 / 10'),
                rankLabel: String(submission.rank ?? 'Đã Hoàn Thành'),
                correctCount: Number(submission.correctCount ?? 0),
                totalQuestions: Number(submission.totalQuestions ?? (exam.questions || []).length),
                submittedTime: String(submission.submittedTime || new Date().toLocaleString('vi-VN')),
              });
            }}
          />
        </div>
      )}
    </div>
  );
};
