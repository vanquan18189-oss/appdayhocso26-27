import React from 'react';
import { 
  Sparkles, 
  Award, 
  CheckCircle2, 
  RotateCcw, 
  Home, 
  Printer, 
  Star, 
  Share2, 
  BookOpen, 
  Check, 
  Trophy,
  Heart,
  Lock
} from 'lucide-react';
import { Lesson5EPlan } from '../../types';
import { getStudentAvatarSource } from '../common/AnimalAvatars';
import { getCurrentStudentSession } from '../../services/studentSessionService';
import { getTeachersFromLocalStorage } from '../../services/teacherStorageService';

/**
 * Checks if a name is a generic placeholder rather than an actual teacher's name.
 */
export const isGenericTeacherLabel = (name?: string | null): boolean => {
  if (!name) return true;
  const clean = name.trim().toLowerCase();
  return (
    clean === '' ||
    clean === 'thầy/cô giáo bộ môn' ||
    clean === 'thay/co giao bo mon' ||
    clean === 'thầy/cô giáo' ||
    clean === 'thầy cô giáo' ||
    clean === 'giáo viên bộ môn' ||
    clean === 'giao vien bo mon' ||
    clean === 'giáo viên' ||
    clean === 'giao vien' ||
    clean === 'thầy/cô' ||
    clean === 'thầy cô' ||
    clean === 'thay/co' ||
    clean === 'thầy/cô giáo viên' ||
    clean === 'giáo viên phụ trách' ||
    clean === 'giáo viên đánh giá' ||
    clean === 'gvbm' ||
    clean === 'gv'
  );
};

/**
 * Format teacher display name with appropriate respectful title (Cô / Thầy / ThS.).
 */
export const formatTeacherWithTitle = (name: string): string => {
  if (!name || isGenericTeacherLabel(name)) return 'Thầy/Cô Phụ trách';
  const clean = name.trim();
  if (
    clean.startsWith('Cô ') || 
    clean.startsWith('Thầy ') || 
    clean.startsWith('ThS. ') || 
    clean.startsWith('TS. ') || 
    clean.startsWith('Thầy/Cô ')
  ) {
    return clean;
  }
  const lower = clean.toLowerCase();
  const isFemale = /\b(thị|cô|mai|lan|hoa|ngọc|thu|hương|hà|trang|phương|linh|thủ|diễm|dung|vân|thủy|yến|nhung|hạnh|oanh|loan|hằng|cúc|đào|mơ|xuyên|liên|tuyết|nguyệt|hồng|bích|hiền|quỳnh|trâm|thi|nhi|mi|thảo|ngân)\b/i.test(lower);
  return isFemale ? `Cô ${clean}` : `Thầy ${clean}`;
};

/**
 * Resolve real subject/homeroom teacher for a student class and subject from school teachers database.
 */
export const resolveTeacherForClassAndSubject = (studentClass?: string, subject?: string): string => {
  try {
    const teachers = getTeachersFromLocalStorage();
    const cleanClass = (studentClass || '').replace(/^lớp\s*/i, '').trim().toLowerCase();

    // 1. Try to find teacher assigned to this class and subject
    if (cleanClass && subject) {
      const cleanSubj = subject.toLowerCase();
      const matched = teachers.find(t => {
        const hasClass = (t.teachingClasses || []).some(c => c.toLowerCase().includes(cleanClass)) ||
                         (t.homeroomClasses || []).some(c => c.toLowerCase().includes(cleanClass)) ||
                         (t.nhomGvCn || '').toLowerCase().includes(cleanClass);
        const hasSubj = (t.subject || '').toLowerCase().includes(cleanSubj);
        return hasClass && hasSubj;
      });
      if (matched && matched.name && !isGenericTeacherLabel(matched.name)) {
        return matched.name;
      }
    }

    // 2. Try to find homeroom teacher (GVCN) of this class
    if (cleanClass) {
      const homeroom = teachers.find(t => 
        (t.homeroomClasses || []).some(c => c.toLowerCase().includes(cleanClass)) ||
        (t.nhomGvCn || '').toLowerCase().includes(cleanClass)
      );
      if (homeroom && homeroom.name && !isGenericTeacherLabel(homeroom.name)) {
        return homeroom.name;
      }
    }

    // 3. Try to find teacher teaching this subject in the school
    if (subject) {
      const cleanSubj = subject.toLowerCase();
      const subjTeacher = teachers.find(t => (t.subject || '').toLowerCase().includes(cleanSubj));
      if (subjTeacher && subjTeacher.name && !isGenericTeacherLabel(subjTeacher.name)) {
        return subjTeacher.name;
      }
    }

    // 4. Default to first active teacher in staff directory
    const activeTeacher = teachers.find(t => t.name && !isGenericTeacherLabel(t.name));
    if (activeTeacher && activeTeacher.name) {
      return activeTeacher.name;
    }
  } catch (e) {
    console.warn('Error resolving teacher from storage:', e);
  }
  return '';
};

export interface Overall5EResults {
  engageViewed?: boolean;
  exploreAccuracy?: number | null;
  exploreCompleted?: boolean;
  elaborateScore?: number | null;
  applySubmitted?: boolean;
  assessmentScore?: number | null;
  overallScore?: number | null;
}

interface StudentReviewViewProps {
  lesson: Lesson5EPlan;
  currentUserName: string;
  currentClass: string;
  studentAvatar?: string;
  teacherName?: string;
  overallResults?: Overall5EResults;
  isReviewMode?: boolean;
  lastUpdatedAt?: string;
  onRestartLesson: () => void;
  onBackToList: () => void;
}

export const StudentReviewView: React.FC<StudentReviewViewProps> = ({
  lesson,
  currentUserName,
  currentClass,
  studentAvatar,
  teacherName,
  overallResults = {},
  isReviewMode = false,
  lastUpdatedAt,
  onRestartLesson,
  onBackToList
}) => {
  const [showRestartConfirm, setShowRestartConfirm] = React.useState<boolean>(false);
  const studentSession = getCurrentStudentSession();
  const avatarSource = getStudentAvatarSource(
    studentAvatar || studentSession?.avatarUrl || studentSession?.avatar,
    currentUserName
  );
  const feedbackConfig = (lesson as any)?.feedbackConfig || {};
  const blocks = feedbackConfig.blocks || [];

  const formattedLastUpdated = React.useMemo(() => {
    if (!lastUpdatedAt) {
      const now = new Date();
      return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')} ngày ${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()}`;
    }
    try {
      const d = new Date(lastUpdatedAt);
      if (!isNaN(d.getTime())) {
        return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')} ngày ${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
      }
    } catch {}
    return lastUpdatedAt;
  }, [lastUpdatedAt]);

  // Determine true completion state for each of the 5 steps without mock fallbacks
  const isEngageCompleted = Boolean(overallResults.engageViewed);

  const hasExploreScore = typeof overallResults.exploreAccuracy === 'number' && !isNaN(overallResults.exploreAccuracy);
  const isExploreCompleted = Boolean(overallResults.exploreCompleted || hasExploreScore);
  const exploreAccuracyVal = hasExploreScore ? overallResults.exploreAccuracy : null;

  const hasElaborateScore = typeof overallResults.elaborateScore === 'number' && !isNaN(overallResults.elaborateScore);
  const isElaborateCompleted = hasElaborateScore;
  const elaborateScoreVal = hasElaborateScore ? overallResults.elaborateScore : null;

  const isApplySubmitted = Boolean(overallResults.applySubmitted);

  const hasAssessmentScore = typeof overallResults.assessmentScore === 'number' && !isNaN(overallResults.assessmentScore);
  const isAssessmentCompleted = hasAssessmentScore;
  const assessmentScoreVal = hasAssessmentScore ? overallResults.assessmentScore : null;

  // Count steps that were genuinely completed
  const completedStepsCount = [
    isEngageCompleted,
    isExploreCompleted,
    isElaborateCompleted,
    isApplySubmitted,
    isAssessmentCompleted
  ].filter(Boolean).length;

  // Calculate real total score strictly based on completed steps with actual score data
  let realCalculatedScore: number | null = null;
  if (typeof overallResults.overallScore === 'number' && !isNaN(overallResults.overallScore)) {
    realCalculatedScore = overallResults.overallScore;
  } else {
    const scoredParts: number[] = [];
    if (typeof exploreAccuracyVal === 'number') scoredParts.push(exploreAccuracyVal);
    if (typeof elaborateScoreVal === 'number') scoredParts.push(elaborateScoreVal * 10);
    if (typeof assessmentScoreVal === 'number') scoredParts.push(assessmentScoreVal * 10);

    if (scoredParts.length > 0) {
      realCalculatedScore = Math.round(scoredParts.reduce((a, b) => a + b, 0) / scoredParts.length);
    }
  }

  const hasEnoughScoreData = realCalculatedScore !== null;
  const calcScore = realCalculatedScore ?? 0;
  
  let activeBlockIndex = 0;
  let tierBadge = 'HOÀN THÀNH XUẤT SẮC 🏆';
  let isExcellent = false;

  if (completedStepsCount === 5 && hasEnoughScoreData && calcScore >= 85) {
    activeBlockIndex = 0;
    tierBadge = 'HOÀN THÀNH XUẤT SẮC 🏆';
    isExcellent = true;
  } else if (completedStepsCount >= 3 && hasEnoughScoreData && calcScore >= 60) {
    activeBlockIndex = blocks.length > 1 ? 1 : 0;
    tierBadge = 'HOÀN THÀNH TỐT - ĐẠT YÊU CẦU 👍';
    isExcellent = false;
  } else if (completedStepsCount > 0) {
    activeBlockIndex = blocks.length > 2 ? 2 : (blocks.length > 1 ? 1 : 0);
    tierBadge = `TIẾN TRÌNH: ${completedStepsCount}/5 BƯỚC 🌱`;
    isExcellent = false;
  } else {
    activeBlockIndex = blocks.length > 2 ? 2 : (blocks.length > 1 ? 1 : 0);
    tierBadge = 'CHƯA BẮT ĐẦU BÀI HỌC 📖';
    isExcellent = false;
  }

  const isGood = !isExcellent && completedStepsCount >= 3 && hasEnoughScoreData && calcScore >= 60;
  const isEffort = !isExcellent && !isGood;

  const defaultSticker = isExcellent ? '🏆' : isGood ? '👍' : (completedStepsCount > 0 ? '🌱' : '📖');
  const defaultPraiseTitle = isExcellent 
    ? 'Chúc mừng em đã hoàn thành xuất sắc toàn bộ bài học!' 
    : isGood
    ? 'Em đã hoàn thành tốt bài giảng 5E!'
    : (completedStepsCount > 0 
        ? 'Cố gắng hơn nữa nhé em! 🌱' 
        : 'Bắt đầu bài giảng 5E ngay hôm nay!');

  const defaultPraiseContent = isExcellent
    ? 'Em có tinh thần tự giác rất cao, trả lời chuẩn xác các câu hỏi tương tác trong video, thực hành luyện tập xuất sắc và vận dụng bài học vào thực tế rất tốt. Thầy/Cô rất tự hào về sự cố gắng của em!'
    : isGood
    ? 'Em đã tiếp thu tốt kiến thức bài học và hoàn thành các nội dung tương tác. Hãy tiếp tục phát huy tinh thần học tập tích cực này nhé!'
    : (completedStepsCount > 0 
        ? 'Em đã có nhiều nỗ lực. Hãy ôn tập kỹ hơn phần lý thuyết và thực hành để đạt kết quả cao hơn ở các bài học tới.'
        : 'Hãy nhấp vào các bước bài giảng để bắt đầu trải nghiệm nội dung và hoạt động tương tác.');

  // Resolve actual teacher name (eliminating generic placeholder "Thầy/Cô giáo bộ môn")
  const resolvedTeacherName = React.useMemo(() => {
    // 1. Direct teacherName prop passed from caller
    if (teacherName && !isGenericTeacherLabel(teacherName)) {
      return formatTeacherWithTitle(teacherName);
    }

    // 2. Teacher name saved inside the block (only if customized by teacher, not generic default)
    const blockTeacher = blocks[activeBlockIndex]?.teacherName;
    if (blockTeacher && !isGenericTeacherLabel(blockTeacher)) {
      return formatTeacherWithTitle(blockTeacher);
    }

    // 3. Author name of lesson
    if (lesson?.authorName && !isGenericTeacherLabel(lesson.authorName)) {
      return formatTeacherWithTitle(lesson.authorName);
    }

    // 4. Any assignedBy or teacherName in lesson object
    const extraTeacher = (lesson as any)?.assignedBy || (lesson as any)?.teacherName;
    if (extraTeacher && !isGenericTeacherLabel(extraTeacher)) {
      return formatTeacherWithTitle(extraTeacher);
    }

    // 5. Look up in localStorage cached assignments
    try {
      const assignedRaw = localStorage.getItem('eduplay_assigned_elearning_lessons');
      if (assignedRaw) {
        const assignedList = JSON.parse(assignedRaw);
        if (Array.isArray(assignedList)) {
          const match = assignedList.find((a: any) => 
            (a.lessonId && a.lessonId === lesson?.id) || 
            (a.id && a.id === lesson?.id) ||
            (a.title && lesson?.title && a.title.toLowerCase().trim() === lesson.title.toLowerCase().trim())
          );
          if (match && match.assignedBy && !isGenericTeacherLabel(match.assignedBy)) {
            return formatTeacherWithTitle(match.assignedBy);
          }
        }
      }
    } catch {
      // ignore
    }

    // 6. Look up matching teacher in school staff database
    const staffTeacher = resolveTeacherForClassAndSubject(currentClass, lesson?.subject);
    if (staffTeacher) {
      return formatTeacherWithTitle(staffTeacher);
    }

    // 7. Fallback to known homeroom teacher for Lớp 5C / TH Quang Hưng
    return 'Cô Trần Thị Diễm Hương';
  }, [teacherName, blocks, activeBlockIndex, lesson, currentClass]);

  const selectedBlock = blocks[activeBlockIndex] || {
    id: 'block-default',
    levelTitle: tierBadge,
    sticker: defaultSticker,
    praiseTitle: defaultPraiseTitle,
    praiseContent: defaultPraiseContent,
    teacherName: resolvedTeacherName,
    useLaurelWreath: isExcellent,
    laurelWreathUrl: 'https://cdn-icons-png.flaticon.com/512/3112/3112946.png',
    backgroundImageUrl: ''
  };

  const tierTheme = React.useMemo(() => {
    if (isExcellent) {
      return {
        cardBg: 'bg-gradient-to-b from-amber-50/95 via-yellow-50/80 to-amber-100/60 border border-amber-300/90 shadow-xl',
        badgeBg: 'bg-amber-400 text-amber-950 border border-amber-500/40',
        avatarGlow: 'bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 opacity-50 blur-xl animate-pulse',
        avatarBorder: 'border-amber-400',
        stickerBg: 'bg-amber-400 text-slate-950',
        titleColor: 'text-amber-950',
        boxBg: 'bg-white/90 border border-amber-200/90 shadow-xs',
        boxLabelColor: 'text-amber-800',
        boxTextColor: 'text-slate-800',
        footerBorder: 'border-amber-200/70',
        footerTextColor: 'text-slate-600',
        studentNameColor: 'text-slate-900',
        teacherNameColor: 'text-amber-800',
      };
    }
    if (isGood) {
      return {
        cardBg: 'bg-gradient-to-b from-teal-50/95 via-emerald-50/80 to-cyan-50/60 border border-teal-200/90 shadow-xl',
        badgeBg: 'bg-teal-100 text-teal-900 border border-teal-300',
        avatarGlow: 'bg-gradient-to-r from-teal-400 to-emerald-400 opacity-30 blur-lg',
        avatarBorder: 'border-teal-400',
        stickerBg: 'bg-teal-500 text-white',
        titleColor: 'text-teal-950',
        boxBg: 'bg-white/90 border border-teal-200/90 shadow-xs',
        boxLabelColor: 'text-teal-800',
        boxTextColor: 'text-slate-800',
        footerBorder: 'border-teal-200/70',
        footerTextColor: 'text-slate-600',
        studentNameColor: 'text-slate-900',
        teacherNameColor: 'text-teal-800',
      };
    }
    // Growth Mindset / Effort / In Progress (Warm pastel bright)
    return {
      cardBg: 'bg-gradient-to-b from-[#FFF9F2] via-[#FFF3E8] to-[#F0FDF4] border border-orange-200/90 shadow-xl',
      badgeBg: 'bg-orange-100 text-orange-900 border border-orange-300/80',
      avatarGlow: 'bg-gradient-to-r from-emerald-300 via-amber-200 to-orange-300 opacity-35 blur-lg',
      avatarBorder: 'border-orange-300',
      stickerBg: 'bg-orange-400 text-white',
      titleColor: 'text-orange-950',
      boxBg: 'bg-white/90 border border-orange-200/80 shadow-xs',
      boxLabelColor: 'text-orange-800',
      boxTextColor: 'text-slate-800',
      footerBorder: 'border-orange-200/70',
      footerTextColor: 'text-slate-600',
      studentNameColor: 'text-slate-900',
      teacherNameColor: 'text-orange-900',
    };
  }, [isExcellent, isGood]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-8 pb-12 max-w-4xl mx-auto animate-in fade-in duration-300">
      
      {/* 1. CHẾ ĐỘ XEM LẠI BANNER (Khi vào từ nút Xem lại kết quả) */}
      {isReviewMode && (
        <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-sky-600 text-white p-4 sm:p-5 rounded-2xl sm:rounded-3xl shadow-md border border-blue-400/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-xl shrink-0">
              📖
            </div>
            <div>
              <div className="text-xs sm:text-sm font-extrabold flex items-center gap-1.5">
                <span>Đang xem lại kết quả đã lưu</span>
              </div>
              <p className="text-[11px] sm:text-xs text-blue-100 font-medium mt-0.5">
                Lần học gần nhất: <span className="font-bold text-white">{formattedLastUpdated}</span>
              </p>
            </div>
          </div>

          <div className="shrink-0 flex items-center">
            <span className="px-3 py-1 rounded-full bg-white/20 backdrop-blur-md border border-white/30 text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-blue-100 shadow-xs">
              CHẾ ĐỘ XEM LẠI
            </span>
          </div>
        </div>
      )}

      {/* 2. VINH DANH & PHẢN HỒI GIÁO VIÊN BANNER (Phần trên: Nền sáng theo Growth Mindset) */}
      <div className={`rounded-3xl overflow-hidden relative p-6 sm:p-9 flex flex-col items-center text-center ${tierTheme.cardBg}`}>
        
        {/* Subtle ambient light decor */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-36 bg-white/40 blur-2xl pointer-events-none rounded-full" />

        <div className="relative z-10 w-full space-y-5">
          
          {/* Level Badge Pill */}
          <div className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-wider shadow-2xs ${tierTheme.badgeBg}`}>
            <span>{selectedBlock.sticker || defaultSticker}</span>
            <span>{selectedBlock.levelTitle || tierBadge}</span>
          </div>

          {/* AVATAR WITH OPTIONAL GOLDEN LAUREL WREATH (ONLY FOR EXCELLENT TIER) */}
          <div className="relative w-36 h-36 mx-auto flex items-center justify-center my-1">
            
            {/* Soft aura glow */}
            <div className={`absolute inset-0 rounded-full ${tierTheme.avatarGlow}`} />

            {/* Laurel Wreath Overlay (Only for Excellent) */}
            {isExcellent && selectedBlock.useLaurelWreath !== false && (
              <div className="absolute -inset-6 z-20 pointer-events-none flex items-center justify-center">
                <img 
                  src={selectedBlock.laurelWreathUrl || 'https://cdn-icons-png.flaticon.com/512/3112/3112946.png'} 
                  alt="Vòng nguyệt quế" 
                  className="w-full h-full object-contain drop-shadow-[0_0_18px_rgba(252,211,77,0.9)] scale-110"
                  referrerPolicy="no-referrer"
                />
              </div>
            )}

            {/* Student Avatar (Circular) */}
            <div className={`relative z-10 w-28 h-28 rounded-full border-4 shadow-xl overflow-hidden bg-white flex items-center justify-center ${tierTheme.avatarBorder}`}>
              <img 
                src={avatarSource} 
                alt={currentUserName || 'Avatar học sinh'} 
                className="w-full h-full object-cover rounded-full"
                referrerPolicy="no-referrer"
              />
            </div>

            {/* Sticker badge on avatar */}
            <div className={`absolute bottom-0 right-1 z-30 w-9 h-9 rounded-full border-2 border-white flex items-center justify-center text-sm font-black shadow-md ${tierTheme.stickerBg}`}>
              {selectedBlock.sticker || defaultSticker}
            </div>
          </div>

          {/* PRAISE TITLE */}
          <h2 className={`text-xl sm:text-2xl font-black tracking-tight font-heading max-w-xl mx-auto ${tierTheme.titleColor}`}>
            {selectedBlock.praiseTitle || defaultPraiseTitle}
          </h2>

          {/* PRAISE CONTENT (BOX LỜI NHẮN TỪ GIÁO VIÊN) */}
          <div className={`p-5 sm:p-6 rounded-2xl max-w-2xl mx-auto text-left space-y-2 ${tierTheme.boxBg}`}>
            <span className={`text-[11px] uppercase tracking-wider block font-black ${tierTheme.boxLabelColor}`}>
              💬 Lời nhắn từ Giáo viên:
            </span>
            <p className={`text-xs sm:text-sm leading-relaxed font-medium italic ${tierTheme.boxTextColor}`}>
              "{selectedBlock.praiseContent || defaultPraiseContent}"
            </p>
          </div>

          {/* FOOTER INFO */}
          <div className={`pt-3.5 flex flex-col sm:flex-row items-center justify-between text-xs max-w-2xl mx-auto gap-2 ${tierTheme.footerBorder} ${tierTheme.footerTextColor}`}>
            <span>Học sinh: <strong className={`font-bold ${tierTheme.studentNameColor}`}>{currentUserName} ({currentClass})</strong></span>
            <span>Giáo viên đánh giá: <strong className={`font-bold ${tierTheme.teacherNameColor}`}>{resolvedTeacherName}</strong></span>
          </div>
        </div>
      </div>

      {/* 3. TỔNG KẾT TIẾN TRÌNH HỌC TẬP 5E - DẠNG HÀNH TRÌNH TIMELINE */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-6">
        
        {/* HEADER BLOCK */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold shadow-2xs">
              <Trophy className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-slate-900 font-heading">
                Tổng Kết Tiến Trình Học Tập 5E
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                {completedStepsCount === 5 
                  ? 'Toàn bộ 5 bước học tập của bài giảng đã được hoàn tất 100%' 
                  : (completedStepsCount > 0 
                      ? `Đã hoàn thành ${completedStepsCount}/5 bước học tập (${Math.round((completedStepsCount / 5) * 100)}%)` 
                      : 'Chưa có bước nào trong bài giảng được hoàn thành')}
              </p>
            </div>
          </div>

          <div className={`hidden sm:flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-black shadow-2xs ${
            completedStepsCount === 5 
              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' 
              : (completedStepsCount > 0 ? 'bg-amber-100 text-amber-800 border border-amber-200' : 'bg-slate-100 text-slate-600 border border-slate-200')
          }`}>
            <Check className="w-4 h-4" />
            <span>{completedStepsCount === 5 ? '100% Hoàn Thành' : `${completedStepsCount}/5 Bước`}</span>
          </div>
        </div>

        {/* 1. THANH TIẾN ĐỘ TỔNG THỂ (OVERALL PROGRESS BAR) */}
        <div className="bg-slate-50/90 rounded-2xl p-4 sm:p-5 border border-slate-200/80 space-y-2.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 text-xs">
            <div className="font-extrabold text-slate-800 flex items-center gap-1.5">
              <span>Tiến độ hoàn thành:</span>
              <span className="text-[#00875A] font-black">{completedStepsCount}/5 bước</span>
              <span className="text-slate-500 font-bold">({Math.round((completedStepsCount / 5) * 100)}%)</span>
            </div>
            <div className="font-extrabold text-slate-700 flex items-center gap-1.5">
              <span>Điểm tích lũy:</span>
              {hasEnoughScoreData ? (
                <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-black border border-amber-300/80 shadow-2xs">
                  🏆 {calcScore} / 100 điểm
                </span>
              ) : (
                <span className="px-2.5 py-0.5 rounded-full bg-slate-200 text-slate-600 font-bold text-[11px]">
                  Chưa có điểm
                </span>
              )}
            </div>
          </div>

          {/* Progress track */}
          <div className="w-full h-3.5 bg-slate-200/80 rounded-full overflow-hidden p-0.5 border border-slate-300/60 shadow-inner">
            <div 
              className="h-full bg-gradient-to-r from-emerald-400 via-teal-500 to-emerald-600 rounded-full transition-all duration-500 shadow-xs"
              style={{ width: `${Math.max(completedStepsCount > 0 ? 5 : 0, (completedStepsCount / 5) * 100)}%` }}
            />
          </div>
        </div>

        {/* 2. TIMELINE HÀNH TRÌNH 5E - DESKTOP (CHIỀU NGANG) */}
        {(() => {
          const timelineSteps = [
            {
              id: 'engage',
              title: 'Khởi động (Engage)',
              iconEmoji: '🎯',
              desc: 'Hoàn thành tạo tâm thế hứng thú đầu giờ học.',
              isCompleted: isEngageCompleted,
              badgeText: isEngageCompleted ? '✓ Đã xem' : 'Chưa bắt đầu',
              badgeColor: isEngageCompleted ? 'text-emerald-700 bg-emerald-100/90 border-emerald-300' : 'text-slate-400 bg-slate-100 border-slate-200',
              extraScore: null
            },
            {
              id: 'explore',
              title: 'Khám phá (Explore)',
              iconEmoji: '🔍',
              desc: 'Xem video tương tác và vượt qua các mốc câu hỏi.',
              isCompleted: isExploreCompleted,
              badgeText: typeof exploreAccuracyVal === 'number' ? `✓ ${exploreAccuracyVal}% Đúng` : isExploreCompleted ? '✓ Đã xem' : 'Chưa bắt đầu',
              badgeColor: isExploreCompleted ? 'text-emerald-700 bg-emerald-100/90 border-emerald-300' : 'text-slate-400 bg-slate-100 border-slate-200',
              extraScore: null
            },
            {
              id: 'elaborate',
              title: 'Luyện tập (Elaborate)',
              iconEmoji: '🔨',
              desc: 'Thực hành giải bài tập củng cố kiến thức sâu sắc.',
              isCompleted: isElaborateCompleted,
              badgeText: hasElaborateScore ? `★ ${elaborateScoreVal}/10 Điểm` : 'Chưa bắt đầu',
              badgeColor: isElaborateCompleted ? 'text-amber-700 bg-amber-100/90 border-amber-300' : 'text-slate-400 bg-slate-100 border-slate-200',
              extraScore: hasElaborateScore ? `${elaborateScoreVal}/10 điểm` : null
            },
            {
              id: 'apply',
              title: 'Vận dụng (Apply)',
              iconEmoji: '🚀',
              desc: 'Giải quyết tình huống thực tế và đính kèm sản phẩm.',
              isCompleted: isApplySubmitted,
              badgeText: isApplySubmitted ? '✓ Đã nộp báo cáo' : 'Chưa bắt đầu',
              badgeColor: isApplySubmitted ? 'text-emerald-700 bg-emerald-100/90 border-emerald-300' : 'text-slate-400 bg-slate-100 border-slate-200',
              extraScore: null
            },
            {
              id: 'assessment',
              title: 'Đánh giá (Assessment)',
              iconEmoji: '📝',
              desc: 'Hoàn thành bài kiểm tra năng lực và tự đánh giá.',
              isCompleted: isAssessmentCompleted,
              badgeText: hasAssessmentScore ? `★ ${assessmentScoreVal}/10 Điểm` : 'Chưa bắt đầu',
              badgeColor: isAssessmentCompleted ? 'text-indigo-700 bg-indigo-100/90 border-indigo-300' : 'text-slate-400 bg-slate-100 border-slate-200',
              extraScore: hasAssessmentScore ? `${assessmentScoreVal}/10 điểm` : null
            }
          ];

          return (
            <>
              {/* DESKTOP VIEW */}
              <div className="hidden md:block relative pt-2 pb-2">
                <div className="grid grid-cols-5 gap-3 relative z-10">
                  {timelineSteps.map((step, idx) => {
                    const isLast = idx === timelineSteps.length - 1;
                    const nextStep = !isLast ? timelineSteps[idx + 1] : null;
                    const isSegmentCompleted = step.isCompleted && nextStep?.isCompleted;

                    return (
                      <div key={step.id} className="relative flex flex-col items-center text-center">
                        
                        {/* Connecting Line to next node */}
                        {!isLast && (
                          <div 
                            className={`absolute top-7 left-[50%] right-[-50%] h-1 z-0 transition-all ${
                              isSegmentCompleted
                                ? 'bg-emerald-500'
                                : 'border-t-2 border-dashed border-slate-300 bg-transparent'
                            }`}
                          />
                        )}

                        {/* Circle Node (Chấm tròn lớn) */}
                        <div className="relative z-10 mb-3.5">
                          <div className={`w-14 h-14 rounded-full flex items-center justify-center text-2xl transition-all shadow-md ${
                            step.isCompleted
                              ? 'bg-emerald-600 text-white ring-4 ring-emerald-100 border-2 border-emerald-500 shadow-emerald-600/20'
                              : 'bg-white text-slate-400 ring-4 ring-slate-100 border-2 border-slate-300'
                          }`}>
                            <span>{step.iconEmoji}</span>
                          </div>

                          {/* Checkmark or Lock Badge on Node */}
                          <div className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black border-2 border-white shadow-xs ${
                            step.isCompleted 
                              ? 'bg-emerald-500 text-white' 
                              : 'bg-slate-300 text-slate-600'
                          }`}>
                            {step.isCompleted ? <Check className="w-3 h-3 stroke-[3]" /> : <Lock className="w-2.5 h-2.5" />}
                          </div>
                        </div>

                        {/* Step Card Content Below Node */}
                        <div className={`w-full rounded-2xl p-3 flex flex-col items-center justify-between min-h-[148px] transition-all border ${
                          step.isCompleted
                            ? 'bg-emerald-50/70 border-emerald-200/90 text-emerald-950 shadow-2xs'
                            : 'bg-slate-50/60 border-slate-200/70 text-slate-500 opacity-65'
                        }`}>
                          <div className="space-y-1.5 w-full">
                            <div className="font-black text-xs text-slate-900 leading-tight">
                              {step.title}
                            </div>

                            <div className="inline-block">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black border ${step.badgeColor}`}>
                                {step.badgeText}
                              </span>
                            </div>

                            {step.extraScore && (
                              <div className="text-[11px] font-black text-amber-600 bg-amber-50 rounded-lg py-0.5 px-2 border border-amber-200/60">
                                ⭐ {step.extraScore}
                              </div>
                            )}
                          </div>

                          <p className="text-[10.5px] text-slate-600 leading-tight font-medium mt-2">
                            {step.desc}
                          </p>
                        </div>

                      </div>
                    );
                  })}
                </div>
              </div>

              {/* MOBILE VIEW (DỌC) */}
              <div className="block md:hidden relative pl-2 space-y-4">
                <div className="relative pl-6 space-y-4">
                  {/* Vertical dashed background track */}
                  <div className="absolute left-[38px] top-6 bottom-6 w-0.5 border-l-2 border-dashed border-slate-300 z-0" />

                  {timelineSteps.map((step, idx) => {
                    const isLast = idx === timelineSteps.length - 1;
                    const nextStep = !isLast ? timelineSteps[idx + 1] : null;
                    const isSegmentCompleted = step.isCompleted && nextStep?.isCompleted;

                    return (
                      <div key={`mob-${step.id}`} className="relative flex items-start gap-4">
                        
                        {/* Segment overlay if completed */}
                        {!isLast && isSegmentCompleted && (
                          <div className="absolute left-[15px] top-11 bottom-[-16px] w-1 bg-emerald-500 z-0" />
                        )}

                        {/* Node */}
                        <div className="relative z-10 shrink-0 mt-0.5">
                          <div className={`w-12 h-12 rounded-full flex items-center justify-center text-xl transition-all shadow-md ${
                            step.isCompleted
                              ? 'bg-emerald-600 text-white ring-4 ring-emerald-100 border-2 border-emerald-500 shadow-emerald-600/20'
                              : 'bg-white text-slate-400 ring-4 ring-slate-100 border-2 border-slate-300'
                          }`}>
                            <span>{step.iconEmoji}</span>
                          </div>

                          <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-black border border-white shadow-xs ${
                            step.isCompleted 
                              ? 'bg-emerald-500 text-white' 
                              : 'bg-slate-300 text-slate-600'
                          }`}>
                            {step.isCompleted ? <Check className="w-2.5 h-2.5 stroke-[3]" /> : <Lock className="w-2 h-2" />}
                          </div>
                        </div>

                        {/* Card */}
                        <div className={`flex-1 rounded-2xl p-3.5 transition-all border ${
                          step.isCompleted
                            ? 'bg-emerald-50/70 border-emerald-200/90 text-emerald-950 shadow-2xs'
                            : 'bg-slate-50/60 border-slate-200/70 text-slate-500 opacity-65'
                        }`}>
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-extrabold text-xs text-slate-900">
                              {step.title}
                            </span>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${step.badgeColor}`}>
                              {step.badgeText}
                            </span>
                          </div>

                          {step.extraScore && (
                            <div className="mt-1 text-[11px] font-black text-amber-600">
                              ⭐ {step.extraScore}
                            </div>
                          )}

                          <p className="text-[11px] text-slate-600 mt-1 font-medium leading-relaxed">
                            {step.desc}
                          </p>
                        </div>

                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          );
        })()}

        {/* ACTION BUTTONS BAR */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-100">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={handlePrint}
              className="w-full sm:w-auto px-5 py-3 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-2xs"
            >
              <Printer className="w-4 h-4 text-slate-500" />
              <span>In phiếu kết quả</span>
            </button>

            <button
              type="button"
              onClick={() => setShowRestartConfirm(true)}
              className="w-full sm:w-auto px-5 py-3 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-2xs"
            >
              <RotateCcw className="w-4 h-4 text-slate-500" />
              <span>Học lại bài này</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onBackToList}
            className="w-full sm:w-auto px-8 py-3.5 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white text-xs sm:text-sm font-black transition-all shadow-lg shadow-purple-600/30 flex items-center justify-center gap-2 cursor-pointer active:scale-98"
          >
            <Home className="w-4 h-4" />
            <span>Quay về danh sách bài giảng</span>
          </button>
        </div>

      </div>

      {/* CONFIRMATION MODAL CHO "HỌC LẠI BÀI NÀY" */}
      {showRestartConfirm && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl p-6 sm:p-7 max-w-md w-full shadow-2xl border border-slate-100 space-y-5 animate-in zoom-in-95">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                <RotateCcw className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900 font-heading">
                  Xác nhận học lại bài giảng
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Khởi động lại toàn bộ tiến trình 5E
                </p>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed font-medium">
              Bạn có chắc chắn muốn học lại bài này không? Hệ thống sẽ đặt lại các bước để bạn có thể học và thực hành lại từ bước đầu tiên.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowRestartConfirm(false)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-50 transition-all cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowRestartConfirm(false);
                  onRestartLesson();
                }}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white text-xs font-black transition-all shadow-md shadow-amber-500/20 cursor-pointer"
              >
                Đồng ý học lại
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
