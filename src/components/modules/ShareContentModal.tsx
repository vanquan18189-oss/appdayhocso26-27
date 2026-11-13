import React, { useState, useEffect, useMemo } from 'react';
import { Users, X, Share2, Sparkles, Check, Shield, Trash2, RotateCcw, Lock } from 'lucide-react';
import { SharePermissionLevel } from '../../types';
import {
  getCurrentAccessContext,
  updateContentSharingInFirestore
} from '../../services/permissionService';
import {
  CANONICAL_TEACHER_DIRECTORY,
  TEACHER_DEPARTMENTS,
  normalizeDepartmentName
} from '../../constants/teacherDirectory';

export type ShareContentType = 'exam' | 'lesson' | 'question' | 'game' | 'assignment';

export interface ShareContentData {
  id?: string;
  title: string;
  grade?: string;
  subject?: string;
  customUrl?: string;
  collectionName?: string;
  toChuyenMon?: string;
  sharedWithTeachers?: string[];
  sharedWithGroups?: string[];
  sharePermission?: SharePermissionLevel;
  allowDeleteByShared?: boolean;
}

export interface ShareConfirmPayload {
  contentType: ShareContentType;
  id?: string;
  title: string;
  link: string;
  shareDept: boolean;
  sharePublicBank: boolean;
  allowDuplicate: boolean;
  sharedWithTeachers: string[];
  sharedWithGroups: string[];
  sharePermission: SharePermissionLevel;
  allowDeleteByShared: boolean;
  revoked?: boolean;
}

export interface ShareContentModalProps {
  isOpen: boolean;
  onClose: () => void;
  contentType: ShareContentType;
  collectionNameOverride?: string;
  content: ShareContentData | null;
  onConfirmShare?: (payload: ShareConfirmPayload) => void;
}

const DEFAULT_COLLECTION_BY_TYPE: Record<ShareContentType, string> = {
  lesson: 'elearning_lessons',
  question: 'questions',
  exam: 'exams',
  assignment: 'assignments',
  game: 'games'
};

export const ShareContentModal: React.FC<ShareContentModalProps> = ({
  isOpen,
  onClose,
  contentType,
  collectionNameOverride,
  content,
  onConfirmShare,
}) => {
  const access = useMemo(() => getCurrentAccessContext(), [isOpen]);
  const ownerDepartment = normalizeDepartmentName(
    content?.toChuyenMon || access.toChuyenMon || 'Tổ 1'
  );
  const effectiveCollectionName = collectionNameOverride || content?.collectionName || DEFAULT_COLLECTION_BY_TYPE[contentType];

  const [copied, setCopied] = useState(false);
  const [shareScopeMode, setShareScopeMode] = useState<'department' | 'specific'>('department');
  const [selectedGroups, setSelectedGroups] = useState<string[]>([ownerDepartment]);
  const [selectedTeacherIds, setSelectedTeacherIds] = useState<string[]>([]);
  const [sharePermission, setSharePermission] = useState<SharePermissionLevel>('view');
  const [allowDeleteByShared, setAllowDeleteByShared] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Filter colleague teachers:
  // Regular teacher can share with teachers in the SAME department (toChuyenMon).
  // Admin can share with any teacher across departments.
  const departmentColleagues = useMemo(() => {
    return CANONICAL_TEACHER_DIRECTORY.filter(t => {
      const isSelf =
        t.id === access.teacherId ||
        t.emails.some(em => access.allEmails.includes(em));
      if (isSelf) return false;
      if (access.isAdmin) return true;
      return normalizeDepartmentName(t.toChuyenMon) === ownerDepartment;
    });
  }, [access, ownerDepartment]);

  useEffect(() => {
    if (isOpen && content) {
      setCopied(false);
      const existingGroups = Array.isArray(content.sharedWithGroups) ? content.sharedWithGroups : [];
      const existingTeachers = Array.isArray(content.sharedWithTeachers) ? content.sharedWithTeachers : [];

      if (existingTeachers.length > 0 && existingGroups.length === 0) {
        setShareScopeMode('specific');
      } else {
        setShareScopeMode('department');
      }

      setSelectedGroups(existingGroups.length > 0 ? existingGroups : [ownerDepartment]);

      // Map existing sharedWithTeachers (which may contain email/uid/id) back to canonical teacher IDs
      const preselectedIds = departmentColleagues
        .filter(t =>
          existingTeachers.includes(t.id) ||
          (t.uid && existingTeachers.includes(t.uid)) ||
          t.emails.some(em => existingTeachers.map(x => x.toLowerCase()).includes(em.toLowerCase()))
        )
        .map(t => t.id);

      setSelectedTeacherIds(preselectedIds);
      setSharePermission(content.sharePermission || 'view');
      setAllowDeleteByShared(Boolean(content.allowDeleteByShared));
    }
  }, [isOpen, content, ownerDepartment, departmentColleagues]);

  if (!isOpen || !content) return null;

  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://eduplay.vn';
  const contentId = content.id || 'item-share';
  const shareLink = content.customUrl || `${origin}/${contentType}/${contentId}`;

  const isCurrentlyShared =
    (Array.isArray(content.sharedWithGroups) && content.sharedWithGroups.length > 0) ||
    (Array.isArray(content.sharedWithTeachers) && content.sharedWithTeachers.length > 0);

  const typeConfig = {
    exam: {
      modalTitle: 'CHIA SẺ ĐỀ KIỂM TRA TRONG TỔ CHUYÊN MÔN',
      labelPrefix: 'Đề kiểm tra:',
      linkLabel: 'Liên kết truy cập đề kiểm tra',
      noteText: 'Chỉ những giáo viên cùng Tổ chuyên môn được bạn chọn bên dưới mới nhìn thấy đề kiểm tra này trong thẻ "Của đồng nghiệp".'
    },
    lesson: {
      modalTitle: 'CHIA SẺ BÀI GIẢNG TRONG TỔ CHUYÊN MÔN',
      labelPrefix: 'Bài giảng:',
      linkLabel: 'Liên kết truy cập bài giảng',
      noteText: 'Chỉ những giáo viên cùng Tổ chuyên môn được bạn chọn bên dưới mới nhìn thấy bài giảng này trong thẻ "Của đồng nghiệp".'
    },
    question: {
      modalTitle: 'CHIA SẺ CÂU HỎI TRONG TỔ CHUYÊN MÔN',
      labelPrefix: 'Câu hỏi:',
      linkLabel: 'Liên kết truy cập câu hỏi',
      noteText: 'Chỉ những giáo viên cùng Tổ chuyên môn được bạn chọn bên dưới mới nhìn thấy câu hỏi này trong thẻ "Của đồng nghiệp".'
    },
    game: {
      modalTitle: 'CHIA SẺ TRÒ CHƠI TRONG TỔ CHUYÊN MÔN',
      labelPrefix: 'Phòng trò chơi:',
      linkLabel: 'Liên kết truy cập trò chơi',
      noteText: 'Chỉ những giáo viên cùng Tổ chuyên môn được bạn chọn bên dưới mới nhìn thấy trò chơi này trong thẻ "Của đồng nghiệp".'
    },
    assignment: {
      modalTitle: 'CHIA SẺ BÀI TẬP TRONG TỔ CHUYÊN MÔN',
      labelPrefix: 'Bài tập:',
      linkLabel: 'Liên kết truy cập bài tập',
      noteText: 'Chỉ những giáo viên cùng Tổ chuyên môn được bạn chọn bên dưới mới nhìn thấy bài tập này trong thẻ "Của đồng nghiệp".'
    }
  }[contentType];

  const handleCopyLink = () => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(shareLink).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }).catch(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      });
    } else {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const toggleTeacherSelection = (teacherId: string) => {
    setSelectedTeacherIds(prev =>
      prev.includes(teacherId) ? prev.filter(id => id !== teacherId) : [...prev, teacherId]
    );
  };

  const toggleGroupSelection = (deptName: string) => {
    setSelectedGroups(prev =>
      prev.includes(deptName) ? prev.filter(g => g !== deptName) : [...prev, deptName]
    );
  };

  const buildSharedTeachersTokens = (teacherIds: string[]): string[] => {
    const tokens = new Set<string>();
    for (const tid of teacherIds) {
      const matched = CANONICAL_TEACHER_DIRECTORY.find(t => t.id === tid);
      if (matched) {
        tokens.add(matched.id);
        if (matched.uid) tokens.add(matched.uid);
        matched.emails.forEach(em => tokens.add(em.toLowerCase()));
      } else {
        tokens.add(tid);
      }
    }
    return Array.from(tokens);
  };

  const handleConfirm = async () => {
    setIsSaving(true);
    try {
      const finalGroups =
        shareScopeMode === 'department'
          ? (access.isAdmin ? selectedGroups : [ownerDepartment])
          : [];

      const finalTeachers =
        shareScopeMode === 'specific'
          ? buildSharedTeachersTokens(selectedTeacherIds)
          : buildSharedTeachersTokens(
              CANONICAL_TEACHER_DIRECTORY
                .filter(t => finalGroups.includes(normalizeDepartmentName(t.toChuyenMon)))
                .filter(t => t.id !== access.teacherId)
                .map(t => t.id)
            );

      const targetCollection = content.collectionName || DEFAULT_COLLECTION_BY_TYPE[contentType];
      if (content.id && targetCollection) {
        await updateContentSharingInFirestore(targetCollection, String(content.id), {
          sharedWithTeachers: finalTeachers,
          sharedWithGroups: finalGroups,
          sharePermission,
          allowDeleteByShared
        });
      }

      const payload: ShareConfirmPayload = {
        contentType,
        id: content.id,
        title: content.title,
        link: shareLink,
        shareDept: finalGroups.length > 0,
        sharePublicBank: false,
        allowDuplicate: sharePermission === 'edit' || sharePermission === 'assign',
        sharedWithTeachers: finalTeachers,
        sharedWithGroups: finalGroups,
        sharePermission,
        allowDeleteByShared,
        revoked: false
      };

      if (onConfirmShare) {
        onConfirmShare(payload);
      }
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const handleRevokeShare = async () => {
    setIsSaving(true);
    try {
      const targetCollection = content.collectionName || DEFAULT_COLLECTION_BY_TYPE[contentType];
      if (content.id && targetCollection) {
        await updateContentSharingInFirestore(targetCollection, String(content.id), {
          sharedWithTeachers: [],
          sharedWithGroups: [],
          sharePermission: 'view',
          allowDeleteByShared: false
        });
      }

      const payload: ShareConfirmPayload = {
        contentType,
        id: content.id,
        title: content.title,
        link: shareLink,
        shareDept: false,
        sharePublicBank: false,
        allowDuplicate: false,
        sharedWithTeachers: [],
        sharedWithGroups: [],
        sharePermission: 'view',
        allowDeleteByShared: false,
        revoked: true
      };

      if (onConfirmShare) {
        onConfirmShare(payload);
      }
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden animate-scale-up">
        {/* Header */}
        <div className="bg-gradient-to-r from-sky-600 to-indigo-600 text-white p-5 flex items-start justify-between shrink-0">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/20 backdrop-blur-md text-sky-100 font-extrabold text-[10px] uppercase">
              <Users className="w-3 h-3 text-sky-200" /> Phân quyền & Chia sẻ nội bộ ({ownerDepartment})
            </div>
            <h3 className="text-base sm:text-lg font-black text-white font-heading">
              👥 {typeConfig.modalTitle}
            </h3>
            <p className="text-xs text-sky-100 font-medium truncate max-w-md">
              <span className="opacity-80 font-normal">{typeConfig.labelPrefix} </span>
              {content.title}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full bg-black/20 hover:bg-black/40 text-white/90 hover:text-white transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {/* 1. Đối tượng nhận chia sẻ */}
          <div className="space-y-2.5">
            <label className="text-xs font-extrabold text-slate-700 uppercase tracking-wider block">
              1. Chọn đối tượng giáo viên được chia sẻ ({ownerDepartment})
            </label>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setShareScopeMode('department')}
                className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                  shareScopeMode === 'department'
                    ? 'bg-indigo-50 border-indigo-500 text-indigo-950 ring-2 ring-indigo-500/20'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div className="text-xs font-black flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-indigo-600" />
                  <span>Chia sẻ cho cả Tổ ({ownerDepartment})</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Tất cả giáo viên thuộc {ownerDepartment} đều thấy học liệu này
                </p>
              </button>

              <button
                type="button"
                onClick={() => setShareScopeMode('specific')}
                className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                  shareScopeMode === 'specific'
                    ? 'bg-indigo-50 border-indigo-500 text-indigo-950 ring-2 ring-indigo-500/20'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div className="text-xs font-black flex items-center gap-1.5">
                  <Shield className="w-4 h-4 text-indigo-600" />
                  <span>Chọn từng giáo viên cụ thể</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Chỉ các giáo viên được tích chọn bên dưới mới xem được
                </p>
              </button>
            </div>

            {shareScopeMode === 'department' && access.isAdmin && (
              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="text-[11px] font-bold text-slate-600">
                  Admin: Chọn các Tổ chuyên môn được phép truy cập:
                </div>
                <div className="flex flex-wrap gap-2">
                  {TEACHER_DEPARTMENTS.map(dept => (
                    <label
                      key={dept}
                      className={`px-2.5 py-1 rounded-xl border text-xs font-bold flex items-center gap-1.5 cursor-pointer ${
                        selectedGroups.includes(dept)
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white text-slate-700 border-slate-200'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedGroups.includes(dept)}
                        onChange={() => toggleGroupSelection(dept)}
                        className="sr-only"
                      />
                      <span>{dept}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {shareScopeMode === 'specific' && (
              <div className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/70 max-h-44 overflow-y-auto space-y-2">
                {departmentColleagues.length === 0 ? (
                  <p className="text-xs text-slate-500 italic">
                    Không có giáo viên đồng nghiệp nào khác trong {ownerDepartment}.
                  </p>
                ) : (
                  departmentColleagues.map(colleague => (
                    <label
                      key={colleague.id}
                      className="flex items-center justify-between p-2 rounded-xl bg-white border border-slate-200/80 hover:border-indigo-300 cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5">
                        <input
                          type="checkbox"
                          checked={selectedTeacherIds.includes(colleague.id)}
                          onChange={() => toggleTeacherSelection(colleague.id)}
                          className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                        />
                        <div>
                          <div className="text-xs font-extrabold text-slate-800">
                            {colleague.name}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {colleague.toChuyenMon} • {colleague.emails[0]}
                          </div>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                        {colleague.id}
                      </span>
                    </label>
                  ))
                )}
              </div>
            )}
          </div>

          {/* 2. Mức quyền chia sẻ */}
          <div className="space-y-2.5">
            <label className="text-xs font-extrabold text-slate-700 uppercase tracking-wider block">
              2. Mức quyền cho người được chia sẻ
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {[
                {
                  id: 'view' as SharePermissionLevel,
                  label: 'Chỉ xem',
                  desc: 'Chỉ xem nội dung, không sửa, không giao bài'
                },
                {
                  id: 'edit' as SharePermissionLevel,
                  label: 'Xem và sửa',
                  desc: 'Được xem và chỉnh sửa nội dung câu hỏi/bài'
                },
                {
                  id: 'assign' as SharePermissionLevel,
                  label: 'Xem, sửa và giao',
                  desc: 'Được xem, sửa và giao cho lớp mình phụ trách'
                }
              ].map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setSharePermission(opt.id)}
                  className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                    sharePermission === opt.id
                      ? 'bg-sky-50 border-sky-500 text-sky-950 ring-2 ring-sky-500/20'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="text-xs font-black flex items-center justify-between">
                    <span>{opt.label}</span>
                    {sharePermission === opt.id && <Check className="w-3.5 h-3.5 text-sky-600" />}
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1 leading-snug">{opt.desc}</p>
                </button>
              ))}
            </div>

            {/* Quyền Xóa (Mặc định tắt - chỉ chủ nội dung và Admin mới được xóa) */}
            <label className="flex items-center gap-2.5 p-3 rounded-2xl border border-rose-200/80 bg-rose-50/40 text-xs font-bold text-slate-800 cursor-pointer mt-2">
              <input
                type="checkbox"
                checked={allowDeleteByShared}
                onChange={e => setAllowDeleteByShared(e.target.checked)}
                className="rounded text-rose-600 focus:ring-rose-500 w-4 h-4"
              />
              <div className="flex-1">
                <div className="flex items-center gap-1.5 text-rose-900">
                  <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                  <span>Cho phép người được chia sẻ hiển thị nút "Xóa"</span>
                </div>
                <p className="text-[10px] text-slate-500 font-medium mt-0.5">
                  Nếu không bật, nút "Xóa" luôn chỉ dành riêng cho chủ nội dung ({access.name}) và Admin.
                </p>
              </div>
            </label>
          </div>

          {/* 3. Liên kết truy cập */}
          <div className="space-y-1.5">
            <label className="text-xs font-extrabold text-slate-700 uppercase tracking-wider block">
              {typeConfig.linkLabel}
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={shareLink}
                className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-700 focus:outline-none"
              />
              <button
                type="button"
                onClick={handleCopyLink}
                className={`px-3.5 py-2 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs whitespace-nowrap ${
                  copied ? 'bg-emerald-600' : 'bg-indigo-600 hover:bg-indigo-700'
                }`}
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5" /> Đã sao chép!
                  </>
                ) : (
                  <>
                    <Share2 className="w-3.5 h-3.5" /> Sao chép link
                  </>
                )}
              </button>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500 pt-0.5">
              <Lock className="w-3 h-3 text-slate-400 shrink-0" />
              <span>Giáo viên không nằm trong danh sách chia sẻ khi mở đường dẫn sẽ nhận thông báo "Bạn không có quyền xem nội dung này".</span>
            </div>
          </div>

          {/* Note Box */}
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-medium flex items-start gap-2">
            <Sparkles className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <span>{typeConfig.noteText}</span>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2 shrink-0">
          <div>
            {isCurrentlyShared && (
              <button
                type="button"
                onClick={handleRevokeShare}
                disabled={isSaving}
                className="px-3.5 py-2 rounded-xl text-xs font-extrabold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Thu hồi chia sẻ</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200 transition-all cursor-pointer"
            >
              Hủy bỏ
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={isSaving || (shareScopeMode === 'specific' && selectedTeacherIds.length === 0)}
              className="px-5 py-2 rounded-xl text-xs font-extrabold bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white transition-all shadow-md cursor-pointer active:scale-95"
            >
              {isSaving ? 'Đang lưu...' : 'Xác nhận chia sẻ'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
