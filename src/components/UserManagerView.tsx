import React from 'react';
import {
  Users2,
  GraduationCap,
  ShieldCheck,
  School,
  Search,
  Plus,
  Mail,
  Phone,
} from 'lucide-react';

export const UserManagerView: React.FC = () => {
  const users = [
    {
      id: 'GV-01',
      name: 'Nguyễn Thị Thu',
      role: 'Giáo viên cốt cán (Tin học & Công nghệ)',
      classes: '3A1, 3A2, 4A1',
      email: 'thunguyen.tkhang@edu.vn',
      phone: '0912.xxx.888',
      auth: 'Firebase Auth (Quản trị)',
    },
    {
      id: 'GV-02',
      name: 'Trần Văn Hoàng',
      role: 'Giáo viên Toán & Khoa học',
      classes: '3A1, 3A3, 5A2',
      email: 'hoangtran.tkhang@edu.vn',
      phone: '0983.xxx.123',
      auth: 'Firebase Auth (Giáo viên)',
    },
    {
      id: 'GV-03',
      name: 'Lê Thị Mai',
      role: 'Giáo viên Tiếng Việt',
      classes: '3A2, 3A3, 4A2',
      email: 'maile.tkhang@edu.vn',
      phone: '0975.xxx.456',
      auth: 'Firebase Auth (Giáo viên)',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200/80 mb-2">
              <School className="w-3.5 h-3.5 text-slate-600" />
              <span>Hội đồng Sư phạm & Quản trị Lớp học</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              Phân Hệ Quản Lý Người Dùng
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Phân quyền tài khoản Giáo viên, Học sinh, Phụ huynh và Lớp học trường TH&THCS Trực Khang
            </p>
          </div>

          <button
            onClick={() => alert('Thêm tài khoản giáo viên/học sinh mới...')}
            className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs sm:text-sm shadow-sm transition-all flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Thêm Người Dùng</span>
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <span className="font-bold text-sm text-slate-800">Danh sách Giáo viên & Nhân sự sư phạm</span>
          <span className="text-xs text-slate-500">Đồng bộ Firebase Authentication</span>
        </div>
        <div className="divide-y divide-slate-100">
          {users.map((u) => (
            <div key={u.id} className="p-4 sm:p-5 flex items-center justify-between gap-4 flex-wrap sm:flex-nowrap hover:bg-slate-50/60 transition-colors">
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-full bg-slate-200 text-slate-700 font-bold flex items-center justify-center text-sm border border-slate-300">
                  {u.name.split(' ').slice(-1)[0][0]}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold text-sm text-slate-900">{u.name}</h4>
                    <span className="text-[10px] font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                      {u.id}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-0.5">{u.role}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Phụ trách: {u.classes}</p>
                </div>
              </div>

              <div className="text-right text-xs space-y-1">
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-0.5">
                  <ShieldCheck className="w-3 h-3 text-emerald-600" />
                  {u.auth}
                </span>
                <p className="text-slate-500 font-mono text-[11px]">{u.email}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
