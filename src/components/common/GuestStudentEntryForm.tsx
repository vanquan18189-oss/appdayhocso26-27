import React, { useState, useEffect } from 'react';
import { UserCheck, School, Play, Sparkles, Edit3, Home, CheckCircle2, BookOpen } from 'lucide-react';
import { GuestStudentProfile, saveGuestStudentProfile } from '../../services/publicGuestService';

interface GuestStudentEntryFormProps {
  activityTypeLabel: string;
  title: string;
  subject?: string;
  grade?: string;
  subtitle?: string;
  questionCount?: number;
  durationMinutes?: number;
  guestProfile: GuestStudentProfile | null;
  isStarted: boolean;
  onStart: (profile: GuestStudentProfile) => void;
  onEditInfo?: () => void;
  onGoHome?: () => void;
}

export const GuestStudentEntryForm: React.FC<GuestStudentEntryFormProps> = ({
  activityTypeLabel,
  title,
  subject,
  grade,
  subtitle,
  questionCount,
  durationMinutes,
  guestProfile,
  isStarted,
  onStart,
  onEditInfo,
  onGoHome,
}) => {
  const [studentName, setStudentName] = useState(guestProfile?.studentName || '');
  const [classOrSchool, setClassOrSchool] = useState(guestProfile?.classOrSchool || '');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (guestProfile) {
      setStudentName(guestProfile.studentName || '');
      setClassOrSchool(guestProfile.classOrSchool || '');
    }
  }, [guestProfile]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = studentName.trim();
    const cleanClassSchool = classOrSchool.trim();

    if (!cleanName) {
      setErrorMsg('Em vui lòng nhập Họ và tên học sinh trước khi bắt đầu làm bài nhé!');
      return;
    }
    if (!cleanClassSchool) {
      setErrorMsg('Em vui lòng nhập Lớp hoặc Trường của mình nhé!');
      return;
    }

    setErrorMsg('');
    const saved = saveGuestStudentProfile(cleanName, cleanClassSchool);
    onStart(saved);
  };

  if (isStarted && guestProfile) {
    return (
      <div className="bg-white/95 backdrop-blur-md border-b border-indigo-100 shadow-sm sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 text-white flex items-center justify-center font-black text-sm shadow-sm shrink-0">
              {guestProfile.studentName.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                  <CheckCircle2 size={12} /> Học sinh tự do
                </span>
                <span className="text-sm font-black text-slate-900 truncate">
                  {guestProfile.studentName}
                </span>
                <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded-md border border-indigo-100">
                  {guestProfile.classOrSchool}
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium truncate mt-0.5">
                {activityTypeLabel}: <strong className="text-slate-700">{title}</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onEditInfo && (
              <button
                type="button"
                onClick={onEditInfo}
                className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1.5 transition"
              >
                <Edit3 size={13} /> Đổi thông tin
              </button>
            )}
            {onGoHome && (
              <button
                type="button"
                onClick={onGoHome}
                className="px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center gap-1.5 transition"
              >
                <Home size={13} /> Trang chủ
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-sky-50 to-purple-50 py-8 px-4 flex flex-col items-center justify-center">
      <div className="w-full max-w-xl bg-white rounded-3xl shadow-xl border-2 border-indigo-100 overflow-hidden">
        {/* Header Banner */}
        <div className="bg-gradient-to-r from-indigo-600 via-blue-600 to-purple-600 px-6 py-6 text-white relative overflow-hidden">
          <div className="relative z-10">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 backdrop-blur-sm text-xs font-extrabold uppercase tracking-wider mb-3">
              <Sparkles size={13} /> {activityTypeLabel} • Chế độ Học sinh tự do
            </div>
            <h1 className="text-xl sm:text-2xl font-black leading-snug">
              {title}
            </h1>
            <div className="flex flex-wrap items-center gap-2 mt-3 text-xs font-bold text-indigo-100">
              {subject && (
                <span className="px-2.5 py-1 rounded-lg bg-white/15 border border-white/20 flex items-center gap-1">
                  <BookOpen size={13} /> Môn: {subject}
                </span>
              )}
              {grade && (
                <span className="px-2.5 py-1 rounded-lg bg-white/15 border border-white/20">
                  {grade.toLowerCase().startsWith('khối') ? grade : `Khối ${grade}`}
                </span>
              )}
              {typeof questionCount === 'number' && questionCount > 0 && (
                <span className="px-2.5 py-1 rounded-lg bg-white/15 border border-white/20">
                  {questionCount} câu hỏi
                </span>
              )}
              {typeof durationMinutes === 'number' && durationMinutes > 0 && (
                <span className="px-2.5 py-1 rounded-lg bg-white/15 border border-white/20">
                  Thời gian: {durationMinutes} phút
                </span>
              )}
            </div>
            {subtitle && (
              <p className="text-xs text-indigo-100/90 mt-2 font-medium">
                {subtitle}
              </p>
            )}
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-5">
          <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-3.5 text-xs font-semibold text-amber-900 leading-relaxed">
            👋 Chào mừng em! Em không cần tài khoản hay mật khẩu. Chỉ cần điền <strong>Họ và tên</strong> cùng <strong>Lớp / Trường</strong> bên dưới để bắt đầu làm bài ngay nhé!
          </div>

          {errorMsg && (
            <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold">
              ⚠️ {errorMsg}
            </div>
          )}

          <div>
            <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-2">
              1. Họ và tên học sinh <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <UserCheck
                size={18}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-indigo-500 pointer-events-none"
              />
              <input
                type="text"
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
                placeholder="VD: Nguyễn Minh Anh"
                autoFocus
                className="w-full pl-11 pr-4 py-3.5 rounded-2xl border-2 border-slate-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 outline-none text-sm font-bold text-slate-900 transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-2">
              2. Lớp / Trường <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <School
                size={18}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-indigo-500 pointer-events-none"
              />
              <input
                type="text"
                value={classOrSchool}
                onChange={(e) => setClassOrSchool(e.target.value)}
                placeholder="VD: Lớp 3C - Trường Tiểu học Trực Khang"
                className="w-full pl-11 pr-4 py-3.5 rounded-2xl border-2 border-slate-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 outline-none text-sm font-bold text-slate-900 transition"
              />
            </div>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
            <button
              type="submit"
              className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-indigo-600 via-blue-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-black text-base shadow-lg shadow-indigo-500/25 flex items-center justify-center gap-2 transition transform active:scale-[0.99] cursor-pointer"
            >
              <Play size={18} fill="currentColor" /> Bắt đầu làm bài ngay
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
