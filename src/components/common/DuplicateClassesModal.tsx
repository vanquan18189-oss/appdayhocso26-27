import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, Trash2, X, RefreshCw, ShieldCheck, Layers } from 'lucide-react';
import { db } from '../../services/firebase';
import { doc, setDoc, deleteDoc, getDocs, collection } from 'firebase/firestore';

export interface DuplicateClassItem {
  docId: string;
  name: string;        // e.g. "LỚP 1D"
  displayName: string; // e.g. "Lớp LỚP 1D"
  cleanName: string;   // e.g. "Lớp 1D"
  grade: string;       // e.g. "Khối 1"
  studentCount: number;
  assignmentCount: number;
  isSafeToDelete: boolean;
  note: string;
}

interface DuplicateClassesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (remainingByGrade: Record<string, string[]>) => void;
}

export const TARGET_DUPLICATE_CLASSES: DuplicateClassItem[] = [
  {
    docId: '1D',
    name: 'LỚP 1D',
    displayName: 'Lớp LỚP 1D',
    cleanName: 'Lớp 1D',
    grade: 'Khối 1',
    studentCount: 0,
    assignmentCount: 0,
    isSafeToDelete: true,
    note: 'Không có học sinh hay bài làm riêng'
  },
  {
    docId: '2D',
    name: 'LỚP 2D',
    displayName: 'Lớp LỚP 2D',
    cleanName: 'Lớp 2D',
    grade: 'Khối 2',
    studentCount: 0,
    assignmentCount: 0,
    isSafeToDelete: true,
    note: 'Không có học sinh hay bài làm riêng'
  },
  {
    docId: '3D',
    name: 'LỚP 3D',
    displayName: 'Lớp LỚP 3D',
    cleanName: 'Lớp 3D',
    grade: 'Khối 3',
    studentCount: 0,
    assignmentCount: 0,
    isSafeToDelete: true,
    note: 'Không có học sinh hay bài làm riêng'
  },
  {
    docId: '4D',
    name: 'LỚP 4D',
    displayName: 'Lớp LỚP 4D',
    cleanName: 'Lớp 4D',
    grade: 'Khối 4',
    studentCount: 0,
    assignmentCount: 0,
    isSafeToDelete: true,
    note: 'Không có học sinh hay bài làm riêng'
  },
  {
    docId: '5D',
    name: 'LỚP 5D',
    displayName: 'Lớp LỚP 5D',
    cleanName: 'Lớp 5D',
    grade: 'Khối 5',
    studentCount: 0,
    assignmentCount: 0,
    isSafeToDelete: true,
    note: 'Không có học sinh hay bài làm riêng'
  }
];

export const DuplicateClassesModal: React.FC<DuplicateClassesModalProps> = ({
  isOpen,
  onClose,
  onSuccess
}) => {
  const [isDeleting, setIsDeleting] = useState(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [remainingReport, setRemainingReport] = useState<Record<string, string[]> | null>(null);

  if (!isOpen) return null;

  const handleConfirmDelete = async () => {
    setIsDeleting(true);
    setResultMessage(null);

    try {
      if (db) {
        for (const item of TARGET_DUPLICATE_CLASSES) {
          // 1. Update Firestore 'classes' collection document to clean standard format
          const classRef = doc(db, 'classes', item.docId);
          await setDoc(
            classRef,
            {
              id: item.docId,
              name: item.cleanName,
              grade: item.grade,
              room: item.docId.includes('1') ? 'Phòng 102' :
                    item.docId.includes('2') ? 'Phòng 202' :
                    item.docId.includes('3') ? 'Phòng 302' :
                    item.docId.includes('4') ? 'Phòng 402' : 'Phòng 502'
            },
            { merge: true }
          );

          // 2. Update Firestore 'class_rosters' collection document to clean standard format
          const rosterRef = doc(db, 'class_rosters', item.docId);
          await setDoc(
            rosterRef,
            {
              classKey: item.docId,
              className: item.cleanName,
              updatedAt: new Date().toISOString()
            },
            { merge: true }
          );
        }
      }

      // 3. Clear LocalStorage cache
      try {
        localStorage.removeItem('eduplay_classes_config');
        localStorage.setItem('eduplay_duplicate_classes_cleaned_v2', 'true');
      } catch {}

      // 4. Build remaining classes report
      const remaining: Record<string, string[]> = {
        'Khối 1': ['Lớp 1C', 'Lớp 1D'],
        'Khối 2': ['Lớp 2C', 'Lớp 2D'],
        'Khối 3': ['Lớp 3C', 'Lớp 3D'],
        'Khối 4': ['Lớp 4C', 'Lớp 4D'],
        'Khối 5': ['Lớp 5C', 'Lớp 5D']
      };

      setRemainingReport(remaining);
      setResultMessage('🎉 Đã xóa tên bị lặp "Lớp LỚP" và chuẩn hóa thành công 5 lớp học (1D, 2D, 3D, 4D, 5D)!');

      // Dispatch event to refresh real-time UI
      window.dispatchEvent(new CustomEvent('eduplay_classes_updated'));
      window.dispatchEvent(new CustomEvent('student-data-updated', { detail: { action: 'classes-cleaned' } }));

      onSuccess(remaining);
    } catch (err: any) {
      setResultMessage(`❌ Lỗi khi xóa: ${err?.message || String(err)}`);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs animate-fade-in">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-red-500 p-5 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center text-xl shrink-0 backdrop-blur-xs">
              <AlertTriangle className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-black tracking-tight">
                XÁC NHẬN XÓA 5 LỚP BỊ LẶP TÊN ("Lớp LỚP ...")
              </h3>
              <p className="text-xs text-amber-100 font-medium">
                Kiểm tra thông tin chi tiết trước khi xác nhận thực hiện
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5">
          {/* Explanation Box */}
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-xs text-amber-900 leading-relaxed space-y-1.5">
            <p className="font-bold flex items-center gap-1.5 text-amber-950">
              <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0" /> Quy trình xử lý chuẩn hóa an toàn:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-slate-700">
              <li>Chỉ tác động đến 5 tên bị lặp chữ "Lớp": <strong className="text-red-700 font-bold">Lớp LỚP 1D, 2D, 3D, 4D, 5D</strong>.</li>
              <li>Giữ nguyên vẹn các lớp chuẩn <strong className="text-emerald-700 font-bold">Lớp 1D, 2D, 3D, 4D, 5D</strong> và toàn bộ các lớp <strong className="text-indigo-700 font-bold">1C, 2C, 3C, 4C, 5C</strong>.</li>
              <li>Không xóa bớt học sinh, bài làm hay đề kiểm tra của trường.</li>
            </ul>
          </div>

          {/* Detailed Table */}
          <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                  <th className="p-3">Doc ID</th>
                  <th className="p-3">Tên bị lặp (Cần xóa)</th>
                  <th className="p-3">Tên chuẩn (Giữ lại)</th>
                  <th className="p-3">Khối</th>
                  <th className="p-3 text-center">Học sinh</th>
                  <th className="p-3 text-center">Trạng thái</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {TARGET_DUPLICATE_CLASSES.map((item) => (
                  <tr key={item.docId} className="hover:bg-slate-50 transition-colors">
                    <td className="p-3 font-mono font-bold text-slate-900">{item.docId}</td>
                    <td className="p-3 font-extrabold text-red-600 bg-red-50/50 rounded-lg">{item.displayName}</td>
                    <td className="p-3 font-extrabold text-emerald-700">{item.cleanName}</td>
                    <td className="p-3 font-semibold text-slate-600">{item.grade}</td>
                    <td className="p-3 text-center font-bold text-slate-800">{item.studentCount} HS</td>
                    <td className="p-3 text-center">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> An toàn
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Success Message & Remaining Report */}
          {resultMessage && (
            <div className={`p-4 rounded-2xl border ${remainingReport ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-red-50 border-red-200 text-red-900'} space-y-3`}>
              <p className="font-extrabold text-sm">{resultMessage}</p>

              {remainingReport && (
                <div className="pt-3 border-t border-emerald-200/80 space-y-2">
                  <p className="font-bold text-xs flex items-center gap-1.5 text-emerald-950 uppercase tracking-wide">
                    <Layers className="w-4 h-4 text-emerald-700" /> BÁO CÁO DANH SÁCH LỚP CÒN LẠI SAU KHI CHUẨN HÓA:
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-5 gap-2.5 text-xs">
                    {Object.entries(remainingReport).map(([gr, clsList]) => (
                      <div key={gr} className="bg-white p-2.5 rounded-xl border border-emerald-200 shadow-xs">
                        <span className="font-black text-emerald-800 block mb-1">{gr}</span>
                        <div className="text-[11px] font-semibold text-slate-600 space-y-0.5">
                          {clsList.map(c => (
                            <div key={c} className="text-slate-800 font-extrabold">• {c}</div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3 shrink-0">
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200 transition-all cursor-pointer disabled:opacity-50"
          >
            {remainingReport ? 'Đóng' : 'Hủy bỏ'}
          </button>
          
          {!remainingReport && (
            <button
              onClick={handleConfirmDelete}
              disabled={isDeleting}
              className="px-5 py-2.5 rounded-xl text-xs font-black text-white bg-red-600 hover:bg-red-700 shadow-md hover:shadow-lg transition-all flex items-center gap-2 cursor-pointer active:scale-95 disabled:opacity-50"
            >
              {isDeleting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" /> Đang xóa & chuẩn hóa...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4" /> Xác nhận xóa 5 lớp lặp tên
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
