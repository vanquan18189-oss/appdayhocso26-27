import React from 'react';
import {
  X,
  ShieldCheck,
  School,
  Mail,
  UserCheck,
  Award,
  BookOpen,
  Calendar,
  LogOut,
  Sparkles,
} from 'lucide-react';

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity" onClick={onClose} />

      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden z-10 flex flex-col">
        {/* Profile Card Banner */}
        <div className="h-24 bg-gradient-to-r from-indigo-700 via-indigo-800 to-slate-900 relative">
          <button
            onClick={onClose}
            className="absolute top-3 right-3 p-1 rounded-full bg-black/20 text-white hover:bg-black/40 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Avatar & Title */}
        <div className="px-6 pb-6 relative pt-0 -mt-12 text-sm">
          <div className="flex items-end justify-between mb-3">
            <div className="relative">
              <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-amber-500 to-rose-500 border-4 border-white shadow-md flex items-center justify-center text-white font-bold text-2xl">
                TT
              </div>
              <div className="absolute bottom-0 right-0 w-6 h-6 rounded-full bg-emerald-500 border-2 border-white flex items-center justify-center" title="Firebase Authenticated">
                <ShieldCheck className="w-3.5 h-3.5 text-white" />
              </div>
            </div>

            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-xs">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Firebase Auth Verified
            </span>
          </div>

          <div>
            <h3 className="text-lg font-bold text-slate-900">Cô giáo Nguyễn Thị Thu</h3>
            <p className="text-xs text-indigo-700 font-medium flex items-center gap-1 mt-0.5">
              <Award className="w-3.5 h-3.5" />
              <span>Giáo viên cốt cán • Trưởng bộ môn Tin học & Công nghệ</span>
            </p>
          </div>

          <div className="mt-4 space-y-2.5 pt-4 border-t border-slate-100 text-xs">
            <div className="flex items-center gap-2.5 text-slate-600">
              <School className="w-4 h-4 text-slate-400" />
              <span className="font-semibold text-slate-800">Trường TH&THCS Trực Khang</span>
            </div>
            <div className="flex items-center gap-2.5 text-slate-600">
              <Mail className="w-4 h-4 text-slate-400" />
              <span className="font-mono text-slate-700">thunguyen.tkhang@edu.vn</span>
            </div>
            <div className="flex items-center gap-2.5 text-slate-600">
              <UserCheck className="w-4 h-4 text-slate-400" />
              <span>Tài khoản sư phạm định danh: <b className="text-slate-800">GV-TK-0842</b></span>
            </div>
            <div className="flex items-center gap-2.5 text-slate-600">
              <BookOpen className="w-4 h-4 text-slate-400" />
              <span>Phân quyền: <b>Toàn quyền Quản trị Ngân hàng Đề & Chấm AI</b></span>
            </div>
          </div>

          <div className="mt-5 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-center justify-between">
            <div>
              <p className="font-semibold text-slate-800">Phiên làm việc Trực Khang</p>
              <p className="text-[11px] text-slate-400">Đăng nhập tự động qua Firebase SSO</p>
            </div>
            <button
              onClick={() => {
                alert('Tài khoản demo giáo viên được duy trì bảo mật trên hệ thống Trực Khang.');
              }}
              className="px-2.5 py-1 text-slate-600 hover:text-rose-600 hover:bg-rose-50 rounded-lg text-xs font-medium border border-slate-200 hover:border-rose-200 transition-colors"
            >
              Đổi ca
            </button>
          </div>

          <div className="mt-5 flex justify-end">
            <button
              onClick={onClose}
              className="w-full py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-medium text-xs transition-colors"
            >
              Đóng thông tin
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
