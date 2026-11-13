import React, { useState, useEffect } from 'react';
import { Users, X, Share2, Sparkles, Check } from 'lucide-react';

export type ShareContentType = 'exam' | 'lesson' | 'question' | 'game';

export interface ShareContentData {
  id?: string;
  title: string;
  grade?: string;
  subject?: string;
  customUrl?: string;
}

export interface ShareConfirmPayload {
  contentType: ShareContentType;
  id?: string;
  title: string;
  link: string;
  shareDept: boolean;
  sharePublicBank: boolean;
  allowDuplicate: boolean;
}

export interface ShareContentModalProps {
  isOpen: boolean;
  onClose: () => void;
  contentType: ShareContentType;
  content: ShareContentData | null;
  onConfirmShare?: (payload: ShareConfirmPayload) => void;
}

export const ShareContentModal: React.FC<ShareContentModalProps> = ({
  isOpen,
  onClose,
  contentType,
  content,
  onConfirmShare,
}) => {
  const [copied, setCopied] = useState(false);
  const [shareDept, setShareDept] = useState(true);
  const [sharePublicBank, setSharePublicBank] = useState(true);
  const [allowDuplicate, setAllowDuplicate] = useState(true);

  useEffect(() => {
    if (isOpen) {
      setCopied(false);
      setShareDept(true);
      setSharePublicBank(true);
      setAllowDuplicate(true);
    }
  }, [isOpen, content]);

  if (!isOpen || !content) return null;

  // Build link URL based on content type
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://eduplay.vn';
  const contentId = content.id || 'item-share';
  const shareLink = content.customUrl || `${origin}/${contentType}/${contentId}`;

  // Dynamic texts based on contentType
  const typeConfig = {
    exam: {
      modalTitle: 'CHIA SẺ ĐỀ KIỂM TRA CHUYÊN MÔN',
      labelPrefix: 'Đề kiểm tra:',
      linkLabel: 'Liên kết truy cập đề kiểm tra',
      publicBankLabel: 'Đăng tải lên Ngân hàng đề kiểm tra dùng chung Trường Trực Khang',
      noteText: 'Đề kiểm tra sau khi chia sẻ sẽ xuất hiện ở Ngân Hàng Đề Kiểm Tra dùng chung để các giáo viên khác tham khảo.',
      successMsg: 'Đã chia sẻ thành công đề kiểm tra:'
    },
    lesson: {
      modalTitle: 'CHIA SẺ BÀI GIẢNG CHUYÊN MÔN',
      labelPrefix: 'Bài giảng:',
      linkLabel: 'Liên kết truy cập bài giảng',
      publicBankLabel: 'Đăng tải lên Ngân hàng Bài giảng dùng chung Trường Trực Khang',
      noteText: 'Bài giảng sau khi chia sẻ sẽ xuất hiện ở Ngân Hàng Bài Giảng dùng chung để các giáo viên khác tham khảo.',
      successMsg: 'Đã chia sẻ thành công bài giảng:'
    },
    question: {
      modalTitle: 'CHIA SẺ CÂU HỎI CHUYÊN MÔN',
      labelPrefix: 'Câu hỏi:',
      linkLabel: 'Liên kết truy cập câu hỏi',
      publicBankLabel: 'Đăng tải lên Ngân hàng câu hỏi dùng chung Trường Trực Khang',
      noteText: 'Câu hỏi sau khi chia sẻ sẽ xuất hiện ở Ngân Hàng Câu Hỏi dùng chung để các giáo viên khác tham khảo.',
      successMsg: 'Đã chia sẻ thành công câu hỏi:'
    },
    game: {
      modalTitle: 'CHIA SẺ TRÒ CHƠI CHUYÊN MÔN',
      labelPrefix: 'Phòng trò chơi:',
      linkLabel: 'Liên kết truy cập trò chơi',
      publicBankLabel: 'Đăng tải lên Kho Trò chơi dùng chung Trường Trực Khang',
      noteText: 'Phòng trò chơi sau khi chia sẻ sẽ xuất hiện ở Kho Trò Chơi dùng chung để các giáo viên khác tham khảo.',
      successMsg: 'Đã chia sẻ thành công phòng trò chơi:'
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

  const handleConfirm = () => {
    const payload: ShareConfirmPayload = {
      contentType,
      id: content.id,
      title: content.title,
      link: shareLink,
      shareDept,
      sharePublicBank,
      allowDuplicate
    };

    if (onConfirmShare) {
      onConfirmShare(payload);
    } else {
      alert(`${typeConfig.successMsg} ${content.title}`);
    }
    onClose();
  };

  const scopeInfo = [content.grade, content.subject].filter(Boolean).join(' / ');

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden animate-scale-up">
        {/* Header */}
        <div className="bg-gradient-to-r from-sky-600 to-indigo-600 text-white p-5 flex items-start justify-between">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/20 backdrop-blur-md text-sky-100 font-extrabold text-[10px] uppercase">
              <Users className="w-3 h-3 text-sky-200" /> Chia sẻ học liệu
            </div>
            <h3 className="text-lg font-black text-white font-heading">
              👥 {typeConfig.modalTitle}
            </h3>
            <p className="text-xs text-sky-100 font-medium truncate max-w-sm">
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
        <div className="p-6 space-y-5">
          {/* Link sharing box */}
          <div className="space-y-2">
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
                onClick={handleCopyLink}
                className={`px-3.5 py-2 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95 whitespace-nowrap ${
                  copied ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-indigo-600 hover:bg-indigo-700'
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
          </div>

          {/* Share target options */}
          <div className="space-y-3">
            <label className="text-xs font-extrabold text-slate-700 uppercase tracking-wider block">
              Phạm vi chia sẻ trong nhà trường
            </label>
            <div className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/60 space-y-2.5 text-xs">
              <label className="flex items-center gap-2.5 font-bold text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={shareDept}
                  onChange={(e) => setShareDept(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                />
                <span>
                  Chia sẻ cho Giáo viên Tổ chuyên môn{scopeInfo ? ` (${scopeInfo})` : ''}
                </span>
              </label>

              <label className="flex items-center gap-2.5 font-bold text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sharePublicBank}
                  onChange={(e) => setSharePublicBank(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                />
                <span>{typeConfig.publicBankLabel}</span>
              </label>

              <label className="flex items-center gap-2.5 font-bold text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowDuplicate}
                  onChange={(e) => setAllowDuplicate(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                />
                <span>Cho phép đồng nghiệp tải về và nhân bản cấu hình</span>
              </label>
            </div>
          </div>

          {/* Note Box */}
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-medium flex items-start gap-2">
            <Sparkles className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <span>{typeConfig.noteText}</span>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200 transition-all cursor-pointer"
          >
            Hủy bỏ
          </button>
          <button
            onClick={handleConfirm}
            className="px-5 py-2 rounded-xl text-xs font-extrabold bg-sky-600 hover:bg-sky-700 text-white transition-all shadow-md cursor-pointer active:scale-95"
          >
            Xác nhận chia sẻ
          </button>
        </div>
      </div>
    </div>
  );
};
