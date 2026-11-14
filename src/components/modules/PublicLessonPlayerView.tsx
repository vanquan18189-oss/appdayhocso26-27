import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock,
  Globe,
  Home,
  Lock,
  RotateCcw,
  Sparkles,
  User
} from 'lucide-react';
import { Lesson5EPlan } from '../../types';
import { fetchPublicLessonById } from '../../services/lessonStorageService';
import {
  fetchPublicLessonForGuest,
  getSavedGuestStudentProfile,
  GuestStudentProfile,
  saveGuestLessonProgressToFirestore
} from '../../services/publicGuestService';
import { GuestStudentEntryForm } from '../common/GuestStudentEntryForm';
import { InteractiveVideoPlayer } from './InteractiveVideoPlayer';
import { StudentEngageView } from './StudentEngageView';
import { StudentIntroView } from './StudentIntroView';
import { StudentObjectivesView } from './StudentObjectivesView';
import { StudentElaborateView } from './StudentElaborateView';
import { StudentApplyView } from './StudentApplyView';
import { StudentAssessmentView } from './StudentAssessmentView';
import { StudentReviewView } from './StudentReviewView';
import {
  LessonStepKey,
  STANDARD_5E_TABS,
  getInitialLessonStep,
  getNextStepInLessonFlow,
  getNextStepLabel,
  mapStepToStandard5ETab
} from './LessonFlowController';

interface PublicLessonPlayerViewProps {
  lessonId: string;
  onGoHome: () => void;
}

type FetchState = 'loading' | 'ok' | 'unpublished' | 'not_found' | 'error';

export const PublicLessonPlayerView: React.FC<PublicLessonPlayerViewProps> = ({
  lessonId,
  onGoHome
}) => {
  const [fetchState, setFetchState] = useState<FetchState>('loading');
  const [lesson, setLesson] = useState<Lesson5EPlan | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [activeStepTab, setActiveStepTab] = useState<LessonStepKey>('engage');
  const [isRelearningExplore, setIsRelearningExplore] = useState<boolean>(false);
  const [guestProfile, setGuestProfile] = useState<GuestStudentProfile | null>(() =>
    getSavedGuestStudentProfile()
  );
  const [isStarted, setIsStarted] = useState<boolean>(false);
  const [guestProgress, setGuestProgress] = useState<Record<string, any>>({});

  useEffect(() => {
    let isCancelled = false;

    const loadLesson = async () => {
      setFetchState('loading');
      setLesson(null);
      setErrorMessage('');
      setGuestProgress({});
      setIsRelearningExplore(false);

      const guestRes = await fetchPublicLessonForGuest(lessonId);
      if (isCancelled) return;

      if (guestRes.status === 'ok') {
        setLesson(guestRes.lesson);
        setActiveStepTab(getInitialLessonStep(guestRes.lesson));
        setFetchState('ok');
        return;
      }

      const res = await fetchPublicLessonById(lessonId);
      if (isCancelled) return;

      if (res.status === 'ok') {
        setLesson(res.lesson);
        setActiveStepTab(getInitialLessonStep(res.lesson));
        setFetchState('ok');
      } else if (res.status === 'unpublished') {
        setFetchState('unpublished');
      } else if (res.status === 'not_found') {
        setFetchState('not_found');
      } else {
        setErrorMessage(res.message || 'Không thể tải bài giảng. Vui lòng thử lại.');
        setFetchState('error');
      }
    };

    loadLesson();

    return () => {
      isCancelled = true;
    };
  }, [lessonId]);

  // Track engageViewed in state and sync to Firestore when started
  useEffect(() => {
    if (
      fetchState === 'ok' &&
      lesson &&
      isStarted &&
      (activeStepTab === 'engage' || activeStepTab === 'intro' || activeStepTab === 'objectives')
    ) {
      setGuestProgress((prev) => {
        if (prev.engageViewed) return prev;
        const next = { ...prev, engageViewed: true, updatedAt: new Date().toISOString() };
        if (guestProfile) {
          saveGuestLessonProgressToFirestore(lesson, guestProfile, next);
        }
        return next;
      });
    }
  }, [fetchState, lesson, activeStepTab, isStarted, guestProfile]);

  const updateLocalProgress = (patch: Record<string, any>) => {
    setGuestProgress((prev) => {
      const next = {
        ...prev,
        ...patch,
        updatedAt: new Date().toISOString()
      };
      if (lesson && guestProfile) {
        saveGuestLessonProgressToFirestore(lesson, guestProfile, next);
      }
      return next;
    });
  };

  const displayStudentName = guestProfile
    ? `${guestProfile.studentName} (${guestProfile.classOrSchool})`
    : 'Học sinh tự do';

  if (fetchState === 'loading') {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col font-sans antialiased">
        <div className="max-w-6xl w-full mx-auto px-4 sm:px-6 pt-5 flex justify-end">
          <button
            type="button"
            onClick={onGoHome}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 text-xs font-bold shadow-2xs transition-all cursor-pointer"
          >
            <Home className="w-3.5 h-3.5" />
            <span>Trang chủ</span>
          </button>
        </div>

        <div className="flex-1 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8 sm:p-10 max-w-md w-full text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto">
              <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            </div>
            <div className="space-y-1">
              <h2 className="text-base font-extrabold text-slate-900">Đang mở bài giảng...</h2>
              <p className="text-xs text-slate-500">Vui lòng chờ trong giây lát để tải nội dung học tập.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (fetchState === 'unpublished') {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col font-sans antialiased">
        <div className="max-w-6xl w-full mx-auto px-4 sm:px-6 pt-5 flex justify-end">
          <button
            type="button"
            onClick={onGoHome}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 text-xs font-bold shadow-2xs transition-all cursor-pointer"
          >
            <Home className="w-3.5 h-3.5" />
            <span>Trang chủ</span>
          </button>
        </div>

        <div className="flex-1 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-amber-200 shadow-sm p-8 sm:p-10 max-w-md w-full text-center space-y-5">
            <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto border border-amber-200">
              <Lock className="w-7 h-7" />
            </div>
            <div className="space-y-2">
              <h2 className="text-lg sm:text-xl font-black text-slate-900">Bài giảng chưa được công bố</h2>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                Bài giảng này hiện đang ở chế độ nháp hoặc chưa được duyệt công khai. Em hãy quay lại sau hoặc liên hệ giáo viên nhé.
              </p>
            </div>
            <button
              type="button"
              onClick={onGoHome}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-extrabold shadow-md shadow-indigo-600/20 transition-all cursor-pointer"
            >
              <Home className="w-4 h-4" />
              <span>Quay về Trang chủ</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (fetchState === 'not_found' || fetchState === 'error' || !lesson) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col font-sans antialiased">
        <div className="max-w-6xl w-full mx-auto px-4 sm:px-6 pt-5 flex justify-end">
          <button
            type="button"
            onClick={onGoHome}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 text-xs font-bold shadow-2xs transition-all cursor-pointer"
          >
            <Home className="w-3.5 h-3.5" />
            <span>Trang chủ</span>
          </button>
        </div>

        <div className="flex-1 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8 sm:p-10 max-w-md w-full text-center space-y-5">
            <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto border border-rose-200">
              <AlertCircle className="w-7 h-7" />
            </div>
            <div className="space-y-2">
              <h2 className="text-lg sm:text-xl font-black text-slate-900">
                {fetchState === 'error' ? 'Không thể tải bài giảng' : 'Không tìm thấy bài giảng'}
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                {fetchState === 'error'
                  ? errorMessage
                  : 'Liên kết bài giảng không chính xác hoặc bài giảng đã bị gỡ khỏi hệ thống.'}
              </p>
            </div>
            <button
              type="button"
              onClick={onGoHome}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-extrabold shadow-md shadow-indigo-600/20 transition-all cursor-pointer"
            >
              <Home className="w-4 h-4" />
              <span>Quay về Trang chủ</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!isStarted || !guestProfile) {
    return (
      <GuestStudentEntryForm
        activityTypeLabel="Bài Giảng E-Learning 5E"
        title={lesson.title || 'Bài giảng trực tuyến'}
        subject={lesson.subject}
        grade={lesson.grade}
        subtitle={lesson.topic}
        guestProfile={guestProfile}
        isStarted={false}
        onStart={(profile) => {
          setGuestProfile(profile);
          setIsStarted(true);
          saveGuestLessonProgressToFirestore(lesson, profile, {
            ...guestProgress,
            engageViewed: true,
          });
        }}
        onGoHome={onGoHome}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans antialiased selection:bg-indigo-500 selection:text-white">
      <GuestStudentEntryForm
        activityTypeLabel="Bài Giảng E-Learning 5E"
        title={lesson.title || 'Bài giảng trực tuyến'}
        subject={lesson.subject}
        grade={lesson.grade}
        subtitle={lesson.topic}
        guestProfile={guestProfile}
        isStarted={true}
        onStart={(profile) => {
          setGuestProfile(profile);
          setIsStarted(true);
        }}
        onEditInfo={() => setIsStarted(false)}
        onGoHome={onGoHome}
      />

      <div className="max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-7 space-y-6">
        {/* Top bar: Lesson Header */}
        <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="space-y-2 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 text-[11px] font-extrabold px-2.5 py-0.5 rounded-full border border-emerald-200">
                  <Globe className="w-3 h-3" />
                  <span>Học công khai</span>
                </span>
                {lesson.subject && (
                  <span className="bg-indigo-50 text-indigo-700 text-[11px] font-extrabold px-2.5 py-0.5 rounded-full border border-indigo-100">
                    {lesson.subject}
                  </span>
                )}
                {lesson.grade && (
                  <span className="bg-purple-50 text-purple-700 text-[11px] font-extrabold px-2.5 py-0.5 rounded-full border border-purple-100">
                    {lesson.grade}
                  </span>
                )}
                {lesson.duration && (
                  <span className="inline-flex items-center gap-1 text-xs text-slate-500 font-medium">
                    <Clock className="w-3.5 h-3.5" />
                    <span>{lesson.duration}</span>
                  </span>
                )}
              </div>

              <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 leading-snug">
                {lesson.title}
              </h1>

              {lesson.topic && lesson.topic !== lesson.title && (
                <p className="text-xs sm:text-sm text-slate-500 font-medium flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>{lesson.topic}</span>
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Standard 5E Navigation Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          {STANDARD_5E_TABS.map((tab) => {
            const currentStandardTab = mapStepToStandard5ETab(activeStepTab);
            const isActive = currentStandardTab === tab.key;

            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveStepTab(tab.key)}
                className={`p-3.5 sm:p-4 rounded-2xl text-left transition-all border cursor-pointer flex flex-col justify-between space-y-2 ${
                  isActive
                    ? 'bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-600/20'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full ${
                      isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    Bước {tab.stepNumber}
                  </span>
                  <Sparkles className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h4 className="text-xs sm:text-sm font-extrabold truncate">{tab.label}</h4>
                  <p className={`text-[11px] truncate ${isActive ? 'text-indigo-100' : 'text-slate-500'}`}>
                    {tab.badge}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Step Content Card */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-xs space-y-6">
          {activeStepTab === 'engage' && (
            <StudentEngageView
              lesson={lesson}
              onNavigateToNext={() => setActiveStepTab(getNextStepInLessonFlow('engage', lesson))}
              nextStepLabel={getNextStepLabel('engage', lesson)}
            />
          )}

          {activeStepTab === 'intro' && (
            <StudentIntroView
              lesson={lesson}
              onNavigateToNext={() => {
                updateLocalProgress({ engageViewed: true });
                setActiveStepTab(getNextStepInLessonFlow('intro', lesson));
              }}
              nextStepLabel={getNextStepLabel('intro', lesson)}
            />
          )}

          {activeStepTab === 'objectives' && (
            <StudentObjectivesView
              lesson={lesson}
              onNavigateToNext={() => {
                updateLocalProgress({ engageViewed: true });
                setActiveStepTab(getNextStepInLessonFlow('objectives', lesson));
              }}
            />
          )}

          {activeStepTab === 'explore' && (
            <div className="space-y-6">
              <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
                <div className="w-10 h-10 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
                  2
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-extrabold text-slate-900">
                    {lesson.stepExplore?.title || 'Khám phá'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {lesson.stepExplore?.subtitle || 'Xây dựng khái niệm mới'}
                  </p>
                </div>
              </div>

              {guestProgress?.exploreCompleted && !isRelearningExplore ? (
                <div className="bg-gradient-to-br from-purple-50 via-indigo-50 to-white rounded-3xl p-6 sm:p-8 border border-purple-200 shadow-sm space-y-6 animate-in fade-in">
                  <div className="flex items-center justify-between border-b border-purple-100 pb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-purple-600 text-white flex items-center justify-center font-bold text-xl shadow-md">
                        <CheckCircle2 className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="text-base sm:text-lg font-black text-slate-900 font-heading">
                          Đã hoàn thành phần Khám phá!
                        </h3>
                        <p className="text-xs text-purple-700 font-medium">
                          Tỷ lệ chính xác:{' '}
                          <strong className="font-extrabold">{guestProgress?.exploreAccuracy ?? 100}%</strong>
                        </p>
                      </div>
                    </div>
                    <span className="px-3.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-black border border-emerald-300">
                      ✓ Đã hoàn thành
                    </span>
                  </div>

                  <div className="bg-indigo-950 text-white p-5 sm:p-6 rounded-2xl border border-indigo-500/30 space-y-2.5 shadow-inner">
                    <div className="flex items-center gap-2 text-xs font-extrabold text-indigo-300 uppercase tracking-wider">
                      <Sparkles className="w-4 h-4 text-amber-300" /> Ghi nhớ nội dung Khám phá
                    </div>
                    <p className="text-xs sm:text-sm text-slate-200 leading-relaxed font-medium">
                      {lesson.stepExplore?.objectives ||
                        'Học sinh nắm vững các khái niệm trọng tâm, quan sát thí nghiệm mô phỏng và liên hệ thực tế.'}
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-purple-100">
                    <button
                      type="button"
                      onClick={() => setIsRelearningExplore(true)}
                      className="w-full sm:w-auto px-5 py-3 rounded-2xl border border-purple-200 bg-white hover:bg-purple-50 text-purple-700 text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-2xs"
                    >
                      <RotateCcw className="w-4 h-4 text-purple-600" />
                      <span>Học lại phần Khám phá (Xem lại video)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveStepTab(getNextStepInLessonFlow('explore', lesson))}
                      className="w-full sm:w-auto px-8 py-3.5 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white text-xs sm:text-sm font-black transition-all shadow-lg shadow-purple-600/30 flex items-center justify-center gap-2 cursor-pointer active:scale-98"
                    >
                      <span>Tiếp tục sang {getNextStepLabel('explore', lesson)}</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                    <span className="text-xs font-extrabold text-purple-700 uppercase tracking-wider flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-purple-600" /> Video Bài Giảng Tương Tác & Trả Lời Câu Hỏi Mốc
                    </span>
                    <span className="text-xs text-slate-500 font-medium">
                      Xem kỹ video và trả lời câu hỏi dừng hình để mở khóa hoàn thành
                    </span>
                  </div>
                  <InteractiveVideoPlayer
                    videoUrl={(lesson.stepExplore as any)?.videoUrl || 'https://www.youtube.com/watch?v=UF8o89k1g8g'}
                    checkpoints={(lesson.stepExplore as any)?.checkpoints || []}
                    title={lesson.title}
                    coreSummary={
                      (lesson.stepExplore as any)?.coreSummary ||
                      lesson.stepExplore?.objectives ||
                      'Học sinh nắm vững các khái niệm trọng tâm, quan sát thí nghiệm mô phỏng và liên hệ thực tế.'
                    }
                    isAlreadyCompleted={Boolean(guestProgress?.exploreCompleted)}
                    savedAnswers={guestProgress?.exploreCheckpointAnswers || {}}
                    onSaveCheckpoint={(_cpId, _answerData, allAnswers) => {
                      const total = ((lesson.stepExplore as any)?.checkpoints || []).length;
                      const correctCount = Object.values(allAnswers).filter((a: any) => a.correct).length;
                      const acc = total > 0 ? Math.round((correctCount / total) * 100) : 100;
                      const isCompleted = total > 0 ? Object.keys(allAnswers).length >= total : true;
                      updateLocalProgress({
                        exploreCheckpointAnswers: allAnswers,
                        exploreAccuracy: acc,
                        exploreCompleted: isCompleted,
                        engageViewed: true
                      });
                    }}
                    onComplete={(summaryData) => {
                      const accuracy = typeof summaryData?.accuracy === 'number' ? summaryData.accuracy : 100;
                      updateLocalProgress({
                        exploreCompleted: true,
                        exploreAccuracy: accuracy,
                        exploreSummaryData: summaryData,
                        engageViewed: true
                      });
                      setIsRelearningExplore(false);
                      setActiveStepTab(getNextStepInLessonFlow('explore', lesson));
                    }}
                  />
                </div>
              )}
            </div>
          )}

          {activeStepTab === 'elaborate' && (
            <StudentElaborateView
              lesson={lesson}
              onNavigateToNext={() => {
                const existing = guestProgress?.elaborate || {};
                updateLocalProgress({
                  elaborate: { ...existing, isCompleted: true, score: existing.score ?? 10 }
                });
                setActiveStepTab(getNextStepInLessonFlow('elaborate', lesson));
              }}
              nextStepLabel={getNextStepLabel('elaborate', lesson)}
              savedData={guestProgress.elaborate}
              onSaveProgress={(data) => {
                updateLocalProgress({ elaborate: { ...data, isCompleted: true } });
              }}
            />
          )}

          {activeStepTab === 'apply' && (
            <StudentApplyView
              lesson={lesson}
              currentUserName={displayStudentName}
              currentClass=""
              onNavigateToNext={() => {
                const existing = guestProgress?.apply || {};
                updateLocalProgress({
                  apply: { ...existing, isCompleted: true, isSubmitted: true }
                });
                setActiveStepTab(getNextStepInLessonFlow('apply', lesson));
              }}
              nextStepLabel={getNextStepLabel('apply', lesson)}
              savedData={guestProgress.apply}
              onSaveProgress={(data) => {
                updateLocalProgress({ apply: { ...data, isCompleted: true, isSubmitted: true } });
              }}
            />
          )}

          {activeStepTab === 'assessment' && (
            <StudentAssessmentView
              lesson={lesson}
              onNavigateToNext={() => {
                const existing = guestProgress?.assessment || {};
                updateLocalProgress({
                  assessment: { ...existing, isCompleted: true, testScore: existing.testScore ?? 10 }
                });
                setActiveStepTab(getNextStepInLessonFlow('assessment', lesson));
              }}
              nextStepLabel={getNextStepLabel('assessment', lesson)}
              savedData={guestProgress.assessment}
              onSaveProgress={(data) => {
                updateLocalProgress({ assessment: { ...data, isCompleted: true } });
              }}
            />
          )}

          {activeStepTab === 'review' &&
            (() => {
              const engageViewed = Boolean(guestProgress?.engageViewed);

              const exploreAccuracy =
                typeof guestProgress?.exploreAccuracy === 'number'
                  ? guestProgress.exploreAccuracy
                  : guestProgress?.exploreCompleted
                  ? 100
                  : null;

              const elaborateScore =
                typeof guestProgress?.elaborate?.score === 'number'
                  ? guestProgress.elaborate.score
                  : typeof guestProgress?.elaborate?.practiceScore === 'number'
                  ? guestProgress.elaborate.practiceScore
                  : null;

              const applySubmitted = Boolean(
                guestProgress?.apply?.isCompleted ||
                  guestProgress?.apply?.isSubmitted ||
                  guestProgress?.apply?.submittedQuestions
              );

              const assessmentScore =
                typeof guestProgress?.assessment?.testScore === 'number'
                  ? guestProgress.assessment.testScore
                  : typeof guestProgress?.assessment?.score === 'number'
                  ? guestProgress.assessment.score
                  : null;

              const scoredItems: number[] = [];
              if (typeof exploreAccuracy === 'number') scoredItems.push(exploreAccuracy);
              if (typeof elaborateScore === 'number') scoredItems.push(elaborateScore * 10);
              if (typeof assessmentScore === 'number') scoredItems.push(assessmentScore * 10);

              const overallScore =
                scoredItems.length > 0
                  ? Math.round(scoredItems.reduce((a, b) => a + b, 0) / scoredItems.length)
                  : null;

              return (
                <StudentReviewView
                  lesson={lesson}
                  currentUserName={displayStudentName}
                  currentClass=""
                  teacherName={lesson.authorName}
                  isGuestMode={true}
                  backButtonLabel="Quay về Trang chủ"
                  lastUpdatedAt={guestProgress?.updatedAt}
                  overallResults={{
                    engageViewed,
                    exploreAccuracy,
                    exploreCompleted: Boolean(guestProgress?.exploreCompleted),
                    elaborateScore,
                    elaborateCompleted: Boolean(
                      guestProgress?.elaborate?.isCompleted || typeof elaborateScore === 'number'
                    ),
                    applySubmitted,
                    assessmentScore,
                    assessmentCompleted: Boolean(
                      guestProgress?.assessment?.isCompleted || typeof assessmentScore === 'number'
                    ),
                    overallScore
                  }}
                  onRestartLesson={() => {
                    setGuestProgress({ engageViewed: true, updatedAt: new Date().toISOString() });
                    setIsRelearningExplore(false);
                    setActiveStepTab(getInitialLessonStep(lesson));
                  }}
                  onBackToList={onGoHome}
                />
              );
            })()}
        </div>
      </div>
    </div>
  );
};
