import React, { useState, useEffect, useMemo } from 'react';
import {
  ShieldCheck,
  X,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Database,
  Copy,
  Check,
  FileCode2,
  UserCheck,
  Sparkles
} from 'lucide-react';
import {
  scanLegacyContentForOwnership,
  executeOwnershipMigration,
  MigrationPreviewItem,
  FULL_FIRESTORE_RULES_TEXT,
  COLLECTION_LABELS,
  MigratableCollection
} from '../../services/ownershipMigrationService';
import { CANONICAL_TEACHER_DIRECTORY, normalizeDepartmentName } from '../../constants/teacherDirectory';

interface OwnershipMigrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMigrationComplete?: () => void;
}

export const OwnershipMigrationModal: React.FC<OwnershipMigrationModalProps> = ({
  isOpen,
  onClose,
  onMigrationComplete
}) => {
  const [activeTab, setActiveTab] = useState<'preview' | 'rules'>('preview');
  const [items, setItems] = useState<MigrationPreviewItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [filterMode, setFilterMode] = useState<'all' | 'unidentified' | 'missing_owner'>('all');
  const [collectionFilter, setCollectionFilter] = useState<string>('all');
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [batchTeacherId, setBatchTeacherId] = useState<string>('gv-10');
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [copiedRules, setCopiedRules] = useState(false);

  const loadScanResults = async () => {
    setIsLoading(true);
    setStatusMessage(null);
    try {
      const results = await scanLegacyContentForOwnership();
      setItems(results);
      // Select all items needing migration by default
      const needsMigKeys = new Set(results.filter(i => i.needsMigration).map(i => i.key));
      setSelectedKeys(needsMigKeys.size > 0 ? needsMigKeys : new Set(results.map(i => i.key)));
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: `Không thể quét dữ liệu Firestore: ${err?.message || String(err)}`
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadScanResults();
    }
  }, [isOpen]);

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      if (collectionFilter !== 'all' && item.collectionName !== collectionFilter) return false;
      if (filterMode === 'unidentified' && item.isAutoResolved) return false;
      if (filterMode === 'missing_owner' && !item.needsMigration) return false;
      return true;
    });
  }, [items, filterMode, collectionFilter]);

  const stats = useMemo(() => {
    const total = items.length;
    const unidentified = items.filter(i => !i.isAutoResolved).length;
    const autoResolved = items.filter(i => i.isAutoResolved).length;
    const needsMigration = items.filter(i => i.needsMigration).length;
    return { total, unidentified, autoResolved, needsMigration };
  }, [items]);

  if (!isOpen) return null;

  const handleChangeProposedOwner = (itemKey: string, newTeacherId: string) => {
    const teacher = CANONICAL_TEACHER_DIRECTORY.find(t => t.id === newTeacherId);
    if (!teacher) return;

    setItems(prev =>
      prev.map(item => {
        if (item.key !== itemKey) return item;
        return {
          ...item,
          proposedTeacherId: teacher.id,
          proposedOwnerId: teacher.uid || teacher.id,
          proposedOwnerEmail: teacher.emails[0],
          proposedOwnerName: teacher.name,
          proposedToChuyenMon: normalizeDepartmentName(teacher.toChuyenMon),
          reason: `Quản trị viên chọn thủ công (${teacher.name})`
        };
      })
    );
  };

  const handleApplyBatchTeacher = () => {
    const teacher = CANONICAL_TEACHER_DIRECTORY.find(t => t.id === batchTeacherId);
    if (!teacher || selectedKeys.size === 0) return;

    setItems(prev =>
      prev.map(item => {
        if (!selectedKeys.has(item.key)) return item;
        return {
          ...item,
          proposedTeacherId: teacher.id,
          proposedOwnerId: teacher.uid || teacher.id,
          proposedOwnerEmail: teacher.emails[0],
          proposedOwnerName: teacher.name,
          proposedToChuyenMon: normalizeDepartmentName(teacher.toChuyenMon),
          reason: `Gán hàng loạt bởi Admin (${teacher.name})`
        };
      })
    );
    setStatusMessage({
      type: 'info',
      text: `Đã đổi người sở hữu dự kiến cho ${selectedKeys.size} mục đã chọn sang "${teacher.name} (${teacher.toChuyenMon})". Bấm "Sao lưu & Xác nhận Gán Chủ Sở Hữu" để lưu lên Firestore.`
    });
  };

  const toggleSelectAllFiltered = () => {
    const allFilteredSelected = filteredItems.every(i => selectedKeys.has(i.key));
    const next = new Set(selectedKeys);
    if (allFilteredSelected) {
      filteredItems.forEach(i => next.delete(i.key));
    } else {
      filteredItems.forEach(i => next.add(i.key));
    }
    setSelectedKeys(next);
  };

  const toggleSelectRow = (key: string) => {
    const next = new Set(selectedKeys);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelectedKeys(next);
  };

  const handleConfirmMigration = async () => {
    const targetItems = items.filter(i => selectedKeys.has(i.key));
    if (targetItems.length === 0) {
      setStatusMessage({
        type: 'error',
        text: 'Vui lòng tích chọn ít nhất 1 mục trong bảng để thực hiện gán chủ sở hữu.'
      });
      return;
    }

    setIsExecuting(true);
    setStatusMessage(null);
    try {
      const res = await executeOwnershipMigration(targetItems);
      if (res.success) {
        setStatusMessage({
          type: 'success',
          text: `Đã sao lưu an toàn vào collection "ownership_migration_backups" (Mã lô: ${res.backupBatchId}) và gán chủ sở hữu thành công cho ${res.migratedCount} tài liệu!`
        });
        await loadScanResults();
        if (onMigrationComplete) onMigrationComplete();
      } else {
        setStatusMessage({
          type: 'error',
          text: `Đã gán ${res.migratedCount} mục, có ${res.errors.length} lỗi: ${res.errors.slice(0, 2).join('; ')}`
        });
      }
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: `Lỗi khi thực thi gán quyền sở hữu: ${err?.message || String(err)}`
      });
    } finally {
      setIsExecuting(false);
    }
  };

  const handleCopyRules = () => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(FULL_FIRESTORE_RULES_TEXT).then(() => {
        setCopiedRules(true);
        setTimeout(() => setCopiedRules(false), 3000);
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5">
      <div className="bg-white rounded-3xl max-w-6xl w-full max-h-[92vh] shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-700 via-blue-700 to-slate-900 text-white px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-white/15 border border-white/20">
              <ShieldCheck className="w-6 h-6 text-amber-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-black tracking-tight">
                  QUẢN TRỊ PHÂN QUYỀN (RBAC) & GÁN CHỦ SỞ HỮU DỮ LIỆU CŨ
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-amber-400/20 text-amber-200 border border-amber-300/30">
                  Admin Only
                </span>
              </div>
              <p className="text-xs text-indigo-100 mt-0.5">
                Xem trước người sở hữu dự kiến, tự động sao lưu trước khi ghi `ownerId` và xuất Firestore Rules chuẩn bảo mật
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-full bg-white/10 hover:bg-white/25 text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Safe Order Banner (Requirement 11) */}
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-3 flex flex-wrap items-center justify-between gap-2 shrink-0 text-xs text-amber-950">
          <div className="flex items-center gap-2 font-bold">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>THỨ TỰ TRIỂN KHAI AN TOÀN (3 BƯỚC):</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold">
            <span className="px-2.5 py-1 rounded-lg bg-white border border-amber-300 text-amber-900">
              Bước 1: Quét & kiểm tra bảng xem trước bên dưới
            </span>
            <span>→</span>
            <span className="px-2.5 py-1 rounded-lg bg-white border border-amber-300 text-amber-900">
              Bước 2: Bấm "Sao lưu & Xác nhận Gán Chủ Sở Hữu"
            </span>
            <span>→</span>
            <span className="px-2.5 py-1 rounded-lg bg-white border border-amber-300 text-amber-900">
              Bước 3: Chuyển sang tab "Firestore Rules" để sao chép & dán lên Firebase Console
            </span>
          </div>
        </div>

        {/* Tabs */}
        <div className="px-6 pt-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2 shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('preview')}
              className={`px-4 py-2.5 rounded-t-xl text-xs font-black flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
                activeTab === 'preview'
                  ? 'bg-white text-indigo-700 border-indigo-600 shadow-2xs'
                  : 'text-slate-600 border-transparent hover:text-slate-900'
              }`}
            >
              <Database className="w-4 h-4" />
              <span>1. Bảng Xem Trước & Gán Chủ Sở Hữu ({stats.total} mục)</span>
            </button>
            <button
              onClick={() => setActiveTab('rules')}
              className={`px-4 py-2.5 rounded-t-xl text-xs font-black flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
                activeTab === 'rules'
                  ? 'bg-white text-indigo-700 border-indigo-600 shadow-2xs'
                  : 'text-slate-600 border-transparent hover:text-slate-900'
              }`}
            >
              <FileCode2 className="w-4 h-4" />
              <span>2. Mã Firestore Rules Đầy Đủ (Dán vào Firebase Console)</span>
            </button>
          </div>

          {activeTab === 'preview' && (
            <button
              onClick={loadScanResults}
              disabled={isLoading}
              className="mb-2 px-3 py-1.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-indigo-600' : ''}`} />
              <span>Quét lại Firestore</span>
            </button>
          )}
        </div>

        {/* Body */}
        {activeTab === 'preview' ? (
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
                <div className="text-[11px] font-bold text-slate-500 uppercase">Tổng tài liệu học liệu</div>
                <div className="text-xl font-black text-slate-900 mt-0.5">{stats.total}</div>
              </div>
              <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200">
                <div className="text-[11px] font-bold text-emerald-700 uppercase">Đã suy ra chủ từ email/tên</div>
                <div className="text-xl font-black text-emerald-900 mt-0.5">{stats.autoResolved}</div>
              </div>
              <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200">
                <div className="text-[11px] font-bold text-amber-800 uppercase">Chưa xác định được chủ</div>
                <div className="text-xl font-black text-amber-900 mt-0.5">{stats.unidentified}</div>
                <div className="text-[10px] text-amber-700 font-medium">Mặc định gán về Admin</div>
              </div>
              <div className="p-3.5 rounded-2xl bg-indigo-50 border border-indigo-200">
                <div className="text-[11px] font-bold text-indigo-700 uppercase">Cần bổ sung ownerId</div>
                <div className="text-xl font-black text-indigo-900 mt-0.5">{stats.needsMigration}</div>
              </div>
            </div>

            {statusMessage && (
              <div
                className={`p-3.5 rounded-2xl border text-xs font-bold flex items-center gap-2.5 ${
                  statusMessage.type === 'success'
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                    : statusMessage.type === 'error'
                      ? 'bg-rose-50 border-rose-300 text-rose-900'
                      : 'bg-sky-50 border-sky-300 text-sky-900'
                }`}
              >
                {statusMessage.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <Sparkles className="w-4 h-4 text-indigo-600 shrink-0" />
                )}
                <span>{statusMessage.text}</span>
              </div>
            )}

            {/* Filters & Batch Assign Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={filterMode}
                  onChange={e => setFilterMode(e.target.value as any)}
                  className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-700"
                >
                  <option value="all">Tất cả tài liệu ({stats.total})</option>
                  <option value="unidentified">Chưa xác định được chủ ({stats.unidentified})</option>
                  <option value="missing_owner">Chưa có trường ownerId ({stats.needsMigration})</option>
                </select>

                <select
                  value={collectionFilter}
                  onChange={e => setCollectionFilter(e.target.value)}
                  className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-700"
                >
                  <option value="all">Tất cả phân hệ (6 collections)</option>
                  {(Object.keys(COLLECTION_LABELS) as MigratableCollection[]).map(col => (
                    <option key={col} value={col}>
                      {COLLECTION_LABELS[col]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-slate-600">Gán nhanh {selectedKeys.size} mục đã chọn cho:</span>
                <select
                  value={batchTeacherId}
                  onChange={e => setBatchTeacherId(e.target.value)}
                  className="px-3 py-1.5 rounded-xl bg-white border border-slate-300 text-xs font-bold text-slate-800"
                >
                  {CANONICAL_TEACHER_DIRECTORY.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.toChuyenMon} - {t.emails[0]})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleApplyBatchTeacher}
                  className="px-3 py-1.5 rounded-xl bg-indigo-100 hover:bg-indigo-200 text-indigo-800 text-xs font-black transition-colors cursor-pointer"
                >
                  Áp dụng vào bảng
                </button>
              </div>
            </div>

            {/* Preview Table */}
            <div className="border border-slate-200 rounded-2xl overflow-hidden">
              <div className="max-h-[42vh] overflow-y-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-100 text-slate-700 uppercase text-[10px] font-black sticky top-0 z-10 border-b border-slate-200">
                    <tr>
                      <th className="p-3 w-10 text-center">
                        <input
                          type="checkbox"
                          checked={filteredItems.length > 0 && filteredItems.every(i => selectedKeys.has(i.key))}
                          onChange={toggleSelectAllFiltered}
                          className="rounded text-indigo-600 w-4 h-4 cursor-pointer"
                        />
                      </th>
                      <th className="p-3">Tên nội dung / Câu hỏi</th>
                      <th className="p-3 w-36">Loại học liệu</th>
                      <th className="p-3 w-64">Người sở hữu dự kiến (Có thể đổi)</th>
                      <th className="p-3">Lý do suy đoán / Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {isLoading ? (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-slate-500 font-bold">
                          Đang quét toàn bộ tài liệu trong Firestore...
                        </td>
                      </tr>
                    ) : filteredItems.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-slate-500 font-bold">
                          Không có mục nào khớp với bộ lọc hiện tại.
                        </td>
                      </tr>
                    ) : (
                      filteredItems.map(item => (
                        <tr
                          key={item.key}
                          className={`hover:bg-slate-50/80 ${
                            !item.isAutoResolved ? 'bg-amber-50/30' : ''
                          }`}
                        >
                          <td className="p-3 text-center">
                            <input
                              type="checkbox"
                              checked={selectedKeys.has(item.key)}
                              onChange={() => toggleSelectRow(item.key)}
                              className="rounded text-indigo-600 w-4 h-4 cursor-pointer"
                            />
                          </td>
                          <td className="p-3">
                            <div className="font-bold text-slate-900 line-clamp-1">{item.title}</div>
                            <div className="text-[10px] text-slate-500 mt-0.5">
                              ID: <span className="font-mono">{item.docId}</span> • {item.subject} {item.grade ? `• ${item.grade}` : ''}
                            </div>
                          </td>
                          <td className="p-3">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                              {item.collectionLabel}
                            </span>
                          </td>
                          <td className="p-3">
                            <select
                              value={item.proposedTeacherId}
                              onChange={e => handleChangeProposedOwner(item.key, e.target.value)}
                              className="w-full px-2.5 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500"
                            >
                              {CANONICAL_TEACHER_DIRECTORY.map(t => (
                                <option key={t.id} value={t.id}>
                                  {t.name} ({t.toChuyenMon})
                                </option>
                              ))}
                            </select>
                            <div className="text-[10px] text-slate-500 mt-0.5 truncate">
                              Email: {item.proposedOwnerEmail} • {item.proposedToChuyenMon}
                            </div>
                          </td>
                          <td className="p-3">
                            <div className="flex items-center gap-1.5">
                              {item.isAutoResolved ? (
                                <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-extrabold">
                                  Tự động khớp
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 text-[10px] font-extrabold">
                                  Chưa rõ chủ → Mặc định Admin
                                </span>
                              )}
                              {!item.needsMigration && (
                                <span className="px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-800 text-[10px] font-extrabold">
                                  Đã có ownerId
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-600 mt-1">{item.reason}</div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2 bg-slate-900 text-white p-4 rounded-2xl">
              <div>
                <h4 className="text-sm font-black">Bộ Quy Tắc Bảo Mật Firestore (firestore.rules)</h4>
                <p className="text-xs text-slate-300 mt-0.5">
                  Sao chép toàn bộ nội dung bên dưới và dán vào thẻ <strong>Rules</strong> trong Firebase Console sau khi đã chạy Bước 2.
                </p>
              </div>
              <button
                onClick={handleCopyRules}
                className={`px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 cursor-pointer transition-all ${
                  copiedRules ? 'bg-emerald-600 text-white' : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                }`}
              >
                {copiedRules ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{copiedRules ? 'Đã sao chép Rules!' : 'Sao chép toàn bộ Rules'}</span>
              </button>
            </div>

            <pre className="p-4 rounded-2xl bg-slate-950 text-emerald-300 text-xs font-mono overflow-x-auto max-h-[52vh] leading-relaxed border border-slate-800">
              {FULL_FIRESTORE_RULES_TEXT}
            </pre>
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between flex-wrap gap-3 shrink-0">
          <div className="text-xs text-slate-600 font-medium">
            Đã chọn <strong>{selectedKeys.size}</strong> / {items.length} tài liệu. Hệ thống luôn tạo bản sao lưu trong <code>ownership_migration_backups</code> trước khi cập nhật.
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200 transition-colors cursor-pointer"
            >
              Đóng
            </button>
            {activeTab === 'preview' && (
              <button
                onClick={handleConfirmMigration}
                disabled={isExecuting || selectedKeys.size === 0}
                className="px-5 py-2.5 rounded-xl text-xs font-black bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white shadow-md flex items-center gap-2 cursor-pointer transition-all"
              >
                <UserCheck className="w-4 h-4" />
                <span>
                  {isExecuting
                    ? 'Đang sao lưu & gán chủ sở hữu...'
                    : `Sao lưu & Xác nhận Gán Chủ Sở Hữu (${selectedKeys.size} mục)`}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
