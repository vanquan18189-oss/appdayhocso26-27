import React, { useState, useEffect, useRef } from 'react';
import { 
  Sparkles, 
  FileText, 
  Image as ImageIcon, 
  CheckSquare, 
  Award, 
  Layers,
  Video,
  Play,
  Upload,
  Link2,
  Trash2,
  ExternalLink,
  Film,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Eye
} from 'lucide-react';
import { QuestionItem } from '../../types';
import { TeacherQuestionsListEditor } from './TeacherQuestionsListEditor';
import { uploadToCloudinary } from '../../lib/cloudinary';
import { 
  isYouTubeUrl, 
  getYouTubeEmbedUrl, 
  isVideoSource, 
  isImageSource, 
  detectMediaType, 
  MediaType 
} from '../../utils/mediaUtils';

interface TeacherEvaluateEditorProps {
  initialObjective?: string;
  initialTeacherActivities?: string;
  initialMaterials?: string;
  initialQuestions?: QuestionItem[];
  initialStudentActivities?: string;
  initialRequireAttachment?: boolean;
  initialCongratMessage?: string;
  questionsBank: QuestionItem[];
  defaultSubject?: string;
  defaultGrade?: string;
  onObjectiveChange: (val: string) => void;
  onTeacherActivitiesChange: (val: string) => void;
  onMaterialsChange: (val: string) => void;
  onQuestionsChange: (questions: QuestionItem[]) => void;
  onStudentActivitiesChange: (val: string) => void;
  onRequireAttachmentChange: (val: boolean) => void;
  onCongratMessageChange: (val: string) => void;
}

export type MediaInputMode = 'video_url' | 'video_upload' | 'image_url' | 'image_upload';

export const TeacherEvaluateEditor: React.FC<TeacherEvaluateEditorProps> = ({
  initialObjective = 'Vận dụng kiến thức vào thực tiễn đời sống và giải quyết vấn đề thực tế.',
  initialTeacherActivities = 'Giáo viên đưa ra tình huống thực tế và yêu cầu học sinh thảo luận, giải quyết vấn đề.',
  initialMaterials = '',
  initialQuestions = [],
  initialStudentActivities = 'Học sinh viết báo cáo thu hoạch ngắn gọn kết quả vận dụng kiến thức.',
  initialRequireAttachment = true,
  initialCongratMessage = 'Chúc mừng các em đã hoàn thành xuất sắc bài học!',
  questionsBank,
  defaultSubject = 'Tin học',
  defaultGrade = 'Khối 3',
  onObjectiveChange,
  onTeacherActivitiesChange,
  onMaterialsChange,
  onQuestionsChange,
  onStudentActivitiesChange,
  onRequireAttachmentChange,
  onCongratMessageChange
}) => {
  const [subTab, setSubTab] = useState<'step1' | 'step2' | 'step3'>('step1');

  const [objective, setObjective] = useState(initialObjective);
  const [teacherActivities, setTeacherActivities] = useState(initialTeacherActivities);
  const [materials, setMaterials] = useState(initialMaterials);
  const [questions, setQuestions] = useState<QuestionItem[]>(initialQuestions);
  const [studentActivities, setStudentActivities] = useState(initialStudentActivities);
  const [requireAttachment, setRequireAttachment] = useState(initialRequireAttachment);
  const [congratMessage, setCongratMessage] = useState(initialCongratMessage);

  // Sync initial props when switching lessons
  useEffect(() => {
    setObjective(initialObjective);
  }, [initialObjective]);

  useEffect(() => {
    setTeacherActivities(initialTeacherActivities);
  }, [initialTeacherActivities]);

  useEffect(() => {
    setMaterials(initialMaterials);
  }, [initialMaterials]);

  useEffect(() => {
    setQuestions(initialQuestions);
  }, [initialQuestions]);

  // Media input mode selection
  const getInitialMediaMode = (mat: string): MediaInputMode => {
    if (!mat) return 'video_url';
    const type = detectMediaType(mat);
    if (type === 'youtube' || type === 'video') {
      return mat.startsWith('data:video') ? 'video_upload' : 'video_url';
    }
    if (type === 'image') {
      return mat.startsWith('data:image') ? 'image_upload' : 'image_url';
    }
    return 'video_url';
  };

  const [mediaMode, setMediaMode] = useState<MediaInputMode>(() => getInitialMediaMode(initialMaterials));
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgressMsg, setUploadProgressMsg] = useState('');
  const [uploadError, setUploadError] = useState<string | null>(null);

  const videoFileInputRef = useRef<HTMLInputElement>(null);
  const imageFileInputRef = useRef<HTMLInputElement>(null);

  const handleQuestionsChange = (updated: QuestionItem[]) => {
    setQuestions(updated);
    onQuestionsChange(updated);
  };

  const handleUpdateMaterials = (newVal: string) => {
    setMaterials(newVal);
    onMaterialsChange(newVal);
    setUploadError(null);
  };

  const handleClearMaterials = () => {
    setMaterials('');
    onMaterialsChange('');
    setUploadError(null);
    if (videoFileInputRef.current) videoFileInputRef.current.value = '';
    if (imageFileInputRef.current) imageFileInputRef.current.value = '';
  };

  // Video File Upload Handler (Base64 + Cloudinary)
  const handleVideoFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check size limit: warning if > 45MB
    if (file.size > 50 * 1024 * 1024) {
      setUploadError('Dung lượng video vượt quá 50MB. Vui lòng chọn file nhẹ hơn hoặc dán link YouTube/link online.');
      return;
    }

    setIsUploading(true);
    setUploadProgressMsg('Đang đọc video và nén lưu trữ...');
    setUploadError(null);

    const reader = new FileReader();
    reader.onload = async () => {
      const base64Data = reader.result as string;
      // Set immediately as base64 so teacher can preview and save right away
      handleUpdateMaterials(base64Data);
      setUploadProgressMsg('Đang đồng bộ máy chủ lưu trữ (Cloudinary)...');

      // Attempt Cloudinary upload in background
      try {
        const cloudUrl = await uploadToCloudinary(file, 'video');
        if (cloudUrl) {
          handleUpdateMaterials(cloudUrl);
        }
      } catch (err: any) {
        console.warn('Cloudinary upload fallback to base64:', err);
        // Base64 is already preserved safely
      } finally {
        setIsUploading(false);
        setUploadProgressMsg('');
      }
    };

    reader.onerror = () => {
      setIsUploading(false);
      setUploadProgressMsg('');
      setUploadError('Không thể đọc file video từ thiết bị của bạn.');
    };

    reader.readAsDataURL(file);
  };

  // Image File Upload Handler (Base64 + Cloudinary)
  const handleImageFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 20 * 1024 * 1024) {
      setUploadError('Dung lượng ảnh vượt quá 20MB. Vui lòng chọn file nhẹ hơn.');
      return;
    }

    setIsUploading(true);
    setUploadProgressMsg('Đang đọc và xử lý ảnh...');
    setUploadError(null);

    const reader = new FileReader();
    reader.onload = async () => {
      const base64Data = reader.result as string;
      handleUpdateMaterials(base64Data);
      setUploadProgressMsg('Đang tải ảnh lên Cloudinary...');

      try {
        const cloudUrl = await uploadToCloudinary(file, 'image');
        if (cloudUrl) {
          handleUpdateMaterials(cloudUrl);
        }
      } catch (err: any) {
        console.warn('Cloudinary image upload fallback to base64:', err);
      } finally {
        setIsUploading(false);
        setUploadProgressMsg('');
      }
    };

    reader.onerror = () => {
      setIsUploading(false);
      setUploadProgressMsg('');
      setUploadError('Không thể đọc file ảnh từ thiết bị của bạn.');
    };

    reader.readAsDataURL(file);
  };

  const detectedType: MediaType = detectMediaType(materials);

  return (
    <div className="space-y-6">
      <div className="p-4 rounded-2xl bg-teal-500/10 border border-teal-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-extrabold text-teal-400 uppercase tracking-wide">
            CẤU HÌNH MỤC VẬN DỤNG (EVALUATE / APPLY)
          </h3>
          <p className="text-xs text-slate-300 mt-0.5">
            Xây dựng chuỗi 3 bước Vận dụng: Tình huống thực tế (Video / Hình ảnh), Câu hỏi tương tác và Báo cáo thu hoạch.
          </p>
        </div>
      </div>

      {/* 3 SUB-TABS NAVIGATION */}
      <div className="flex items-center gap-2 p-1.5 bg-slate-800 rounded-2xl border border-slate-700">
        <button
          type="button"
          onClick={() => setSubTab('step1')}
          className={`flex-1 py-3 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
            subTab === 'step1'
              ? 'bg-teal-600 text-white shadow-md shadow-teal-900/40'
              : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
          }`}
        >
          <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-[11px]">1</span>
          <span>Bước 1: Tình huống thực tế & Tư liệu</span>
        </button>

        <button
          type="button"
          onClick={() => setSubTab('step2')}
          className={`flex-1 py-3 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
            subTab === 'step2'
              ? 'bg-teal-600 text-white shadow-md shadow-teal-900/40'
              : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
          }`}
        >
          <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-[11px]">2</span>
          <span>Bước 2: Hướng giải quyết / Câu hỏi ({questions.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setSubTab('step3')}
          className={`flex-1 py-3 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
            subTab === 'step3'
              ? 'bg-teal-600 text-white shadow-md shadow-teal-900/40'
              : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
          }`}
        >
          <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-[11px]">3</span>
          <span>Bước 3: Báo cáo thu hoạch</span>
        </button>
      </div>

      {/* SUB-TAB 1: TÌNH HUỐNG THỰC TẾ & TƯ LIỆU ĐA PHƯƠNG TIỆN */}
      {subTab === 'step1' && (
        <div className="space-y-5 p-5 rounded-2xl bg-slate-800/80 border border-slate-700">
          <div className="flex items-center gap-2 text-teal-300 font-extrabold text-xs uppercase tracking-wider">
            <Layers className="w-4 h-4" />
            <span>Bước 1 — Tình huống thực tế & Tư liệu minh họa</span>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Tiêu đề tình huống / Mục tiêu vận dụng:</label>
              <input
                type="text"
                value={objective}
                onChange={(e) => {
                  setObjective(e.target.value);
                  onObjectiveChange(e.target.value);
                }}
                className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-teal-500"
                placeholder="Ví dụ: Tình huống ứng dụng an toàn thông tin khi sử dụng Internet..."
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Nội dung mô tả bối cảnh / Tình huống (Văn bản hướng dẫn):</label>
              <textarea
                rows={3}
                value={teacherActivities}
                onChange={(e) => {
                  setTeacherActivities(e.target.value);
                  onTeacherActivitiesChange(e.target.value);
                }}
                className="w-full p-3 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white leading-relaxed focus:outline-none focus:border-teal-500"
                placeholder="Mô tả chi tiết tình huống thực tế để học sinh phân tích, suy nghĩ và giải quyết..."
              />
            </div>

            {/* PHẦN TƯ LIỆU MINH HỌA - ĐA DẠNG PHƯƠNG THỨC */}
            <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-700/80 space-y-3.5">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pb-2 border-b border-slate-800">
                <div>
                  <span className="text-xs font-extrabold text-teal-400 uppercase tracking-wide flex items-center gap-1.5">
                    <Film className="w-4 h-4 text-teal-400" /> Tư liệu minh họa tình huống (Video / Hình ảnh)
                  </span>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Hỗ trợ dán đường dẫn Video YouTube/MP4, tải file Video MP4 từ máy tính, dán link Ảnh hoặc tải file Ảnh.
                  </p>
                </div>

                {materials && (
                  <button
                    type="button"
                    onClick={handleClearMaterials}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-rose-400 hover:text-white bg-rose-500/10 hover:bg-rose-600 rounded-lg transition-colors border border-rose-500/20 cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Xóa tư liệu</span>
                  </button>
                )}
              </div>

              {/* 4 PHƯƠNG THỨC CHỌN TƯ LIỆU */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={() => setMediaMode('video_url')}
                  className={`p-2.5 rounded-xl border text-left transition-all flex flex-col gap-1 cursor-pointer ${
                    mediaMode === 'video_url'
                      ? 'bg-teal-500/20 border-teal-500 text-teal-300 font-bold shadow-xs'
                      : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:border-slate-600'
                  }`}
                >
                  <span className="flex items-center gap-1.5 text-xs">
                    <Link2 className="w-3.5 h-3.5 text-teal-400" />
                    <span>Link Video (URL)</span>
                  </span>
                  <span className="text-[10px] text-slate-400 font-normal">YouTube / Link .mp4</span>
                </button>

                <button
                  type="button"
                  onClick={() => setMediaMode('video_upload')}
                  className={`p-2.5 rounded-xl border text-left transition-all flex flex-col gap-1 cursor-pointer ${
                    mediaMode === 'video_upload'
                      ? 'bg-teal-500/20 border-teal-500 text-teal-300 font-bold shadow-xs'
                      : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:border-slate-600'
                  }`}
                >
                  <span className="flex items-center gap-1.5 text-xs">
                    <Upload className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Tải Video MP4</span>
                  </span>
                  <span className="text-[10px] text-slate-400 font-normal">File từ máy tính</span>
                </button>

                <button
                  type="button"
                  onClick={() => setMediaMode('image_url')}
                  className={`p-2.5 rounded-xl border text-left transition-all flex flex-col gap-1 cursor-pointer ${
                    mediaMode === 'image_url'
                      ? 'bg-teal-500/20 border-teal-500 text-teal-300 font-bold shadow-xs'
                      : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:border-slate-600'
                  }`}
                >
                  <span className="flex items-center gap-1.5 text-xs">
                    <ImageIcon className="w-3.5 h-3.5 text-amber-400" />
                    <span>Link Hình ảnh (URL)</span>
                  </span>
                  <span className="text-[10px] text-slate-400 font-normal">Đường dẫn ảnh online</span>
                </button>

                <button
                  type="button"
                  onClick={() => setMediaMode('image_upload')}
                  className={`p-2.5 rounded-xl border text-left transition-all flex flex-col gap-1 cursor-pointer ${
                    mediaMode === 'image_upload'
                      ? 'bg-teal-500/20 border-teal-500 text-teal-300 font-bold shadow-xs'
                      : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:border-slate-600'
                  }`}
                >
                  <span className="flex items-center gap-1.5 text-xs">
                    <Upload className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Tải Ảnh từ máy</span>
                  </span>
                  <span className="text-[10px] text-slate-400 font-normal">PNG, JPG, WebP</span>
                </button>
              </div>

              {/* INPUT FIELDS THEO MODE ĐƯỢC CHỌN */}
              <div className="pt-1">
                {/* MODE 1: LINK VIDEO (URL) */}
                {mediaMode === 'video_url' && (
                  <div className="space-y-2">
                    <label className="block text-[11px] font-semibold text-slate-300">
                      Đường dẫn Video (YouTube hoặc link file MP4 trực tiếp):
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={materials && !materials.startsWith('data:') ? materials : ''}
                        onChange={(e) => handleUpdateMaterials(e.target.value)}
                        placeholder="Ví dụ: https://www.youtube.com/watch?v=... hoặc https://...video.mp4"
                        className="w-full pl-9 pr-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-teal-500 font-mono"
                      />
                      <Video className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                    </div>
                    <div className="flex items-center gap-1 text-[11px] text-slate-400">
                      <span>💡 Gợi ý: Hỗ trợ link video YouTube công khai, link YouTube Shorts hoặc link direct file .mp4.</span>
                    </div>
                  </div>
                )}

                {/* MODE 2: TẢI FILE VIDEO MP4 LÊN */}
                {mediaMode === 'video_upload' && (
                  <div className="space-y-2">
                    <label className="block text-[11px] font-semibold text-slate-300">
                      Chọn tệp Video MP4 từ máy tính:
                    </label>
                    <div className="flex flex-col sm:flex-row items-center gap-3">
                      <input
                        ref={videoFileInputRef}
                        type="file"
                        accept="video/mp4,video/webm,video/ogg,video/*"
                        onChange={handleVideoFileUpload}
                        className="hidden"
                        id="video-upload-input"
                      />
                      <label
                        htmlFor="video-upload-input"
                        className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-indigo-600/30"
                      >
                        <Upload className="w-4 h-4" />
                        <span>Chọn Video MP4 từ máy tính</span>
                      </label>

                      {isUploading && (
                        <div className="flex items-center gap-2 text-xs text-indigo-300 animate-pulse font-medium">
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>{uploadProgressMsg || 'Đang xử lý tải video...'}</span>
                        </div>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Hệ thống tự động lưu trữ định dạng chuẩn (Base64 / CDN) giúp học sinh phát video trực tiếp mượt mà. Khuyến nghị video dưới 30MB.
                    </p>
                  </div>
                )}

                {/* MODE 3: LINK HÌNH ẢNH (URL) */}
                {mediaMode === 'image_url' && (
                  <div className="space-y-2">
                    <label className="block text-[11px] font-semibold text-slate-300">
                      Đường dẫn Hình ảnh trực tuyến (Image URL):
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={materials && !materials.startsWith('data:') ? materials : ''}
                        onChange={(e) => handleUpdateMaterials(e.target.value)}
                        placeholder="Ví dụ: https://images.unsplash.com/... hoặc link ảnh PNG, JPG..."
                        className="w-full pl-9 pr-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-teal-500 font-mono"
                      />
                      <ImageIcon className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                    </div>
                  </div>
                )}

                {/* MODE 4: TẢI FILE ẢNH TỪ MÁY TÍNH */}
                {mediaMode === 'image_upload' && (
                  <div className="space-y-2">
                    <label className="block text-[11px] font-semibold text-slate-300">
                      Chọn file Ảnh từ thiết bị của bạn:
                    </label>
                    <div className="flex flex-col sm:flex-row items-center gap-3">
                      <input
                        ref={imageFileInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                        onChange={handleImageFileUpload}
                        className="hidden"
                        id="image-upload-input"
                      />
                      <label
                        htmlFor="image-upload-input"
                        className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-emerald-600/30"
                      >
                        <Upload className="w-4 h-4" />
                        <span>Chọn file Ảnh từ máy tính</span>
                      </label>

                      {isUploading && (
                        <div className="flex items-center gap-2 text-xs text-emerald-300 animate-pulse font-medium">
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>{uploadProgressMsg || 'Đang xử lý ảnh...'}</span>
                        </div>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Hỗ trợ mọi định dạng ảnh phổ biến (PNG, JPG, WebP). Ảnh tải lên sẽ được hiển thị sắc nét với tỷ lệ phù hợp.
                    </p>
                  </div>
                )}

                {uploadError && (
                  <div className="mt-2 p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                    <span>{uploadError}</span>
                  </div>
                )}
              </div>

              {/* KHUNG XEM TRƯỚC TRỰC QUAN (LIVE PREVIEW) */}
              <div className="mt-3 pt-3 border-t border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-extrabold text-teal-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Eye className="w-3.5 h-3.5 text-teal-400" />
                    Khung xem trước trực quan (Preview):
                  </span>

                  {materials.trim() && (
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-500/20 text-teal-300 border border-teal-500/30">
                        {detectedType === 'youtube' && '🎬 YouTube Video'}
                        {detectedType === 'video' && '🎥 Video MP4'}
                        {detectedType === 'image' && '🖼️ Hình ảnh'}
                        {detectedType === 'text' && '📝 Văn bản'}
                      </span>
                      {materials.startsWith('http') && (
                        <a
                          href={materials}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] text-slate-400 hover:text-white flex items-center gap-0.5 underline"
                        >
                          <ExternalLink className="w-3 h-3" /> Mở link
                        </a>
                      )}
                    </div>
                  )}
                </div>

                {materials.trim() ? (
                  <div className="rounded-xl border border-slate-700 bg-slate-950 p-2 overflow-hidden shadow-inner flex flex-col items-center justify-center">
                    {/* YOUTUBE EMBED PLAYER */}
                    {detectedType === 'youtube' && (
                      <div className="w-full aspect-video rounded-lg overflow-hidden bg-black shadow-md">
                        <iframe
                          src={getYouTubeEmbedUrl(materials)}
                          title="Xem trước Video YouTube"
                          className="w-full h-full border-0"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                        />
                      </div>
                    )}

                    {/* MP4 VIDEO PLAYER */}
                    {detectedType === 'video' && (
                      <div className="w-full flex justify-center bg-black rounded-lg overflow-hidden">
                        <video
                          src={materials}
                          controls
                          playsInline
                          preload="metadata"
                          className="w-full max-h-[320px] rounded-lg"
                        >
                          Trình duyệt không hỗ trợ xem trước video này.
                        </video>
                      </div>
                    )}

                    {/* IMAGE PREVIEW */}
                    {detectedType === 'image' && (
                      <div className="w-full flex items-center justify-center bg-slate-900/60 p-2 rounded-lg">
                        <img
                          src={materials}
                          alt="Xem trước hình ảnh tư liệu"
                          className="max-h-[300px] max-w-full object-contain rounded-lg shadow-sm"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                    )}

                    {/* TEXT PREVIEW */}
                    {detectedType === 'text' && (
                      <div className="w-full p-3 bg-slate-900 rounded-lg text-xs text-slate-200 font-mono break-all">
                        {materials}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-6 rounded-xl border border-dashed border-slate-700/80 bg-slate-900/40 text-center space-y-1.5">
                    <div className="w-9 h-9 mx-auto rounded-full bg-slate-800 text-slate-400 flex items-center justify-center">
                      <Film className="w-4 h-4" />
                    </div>
                    <p className="text-xs text-slate-400 font-medium">Chưa có tư liệu minh họa nào được thêm</p>
                    <p className="text-[11px] text-slate-500">
                      Chọn một trong 4 phương thức phía trên để thêm Video hoặc Hình ảnh cho tình huống vận dụng.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 2: HƯỚNG GIẢI QUYẾT / CÂU HỎI TƯƠNG TÁC */}
      {subTab === 'step2' && (
        <div className="space-y-4 p-5 rounded-2xl bg-slate-800/80 border border-slate-700">
          <div className="flex items-center gap-2 text-teal-300 font-extrabold text-xs uppercase tracking-wider">
            <Sparkles className="w-4 h-4" />
            <span>Bước 2 — Hướng giải quyết / Câu hỏi tương tác</span>
          </div>
          <p className="text-xs text-slate-400">
            Soạn thảo danh sách câu hỏi vận dụng, lựa chọn phương án và thiết lập đáp án đúng cho học sinh.
          </p>

          <TeacherQuestionsListEditor
            title="DANH SÁCH CÂU HỎI VẬN DỤNG"
            questions={questions}
            questionsBank={questionsBank}
            onQuestionsChange={handleQuestionsChange}
            defaultSubject={defaultSubject}
            defaultGrade={defaultGrade}
            targetSection="apply"
            targetTitle="Thêm vào Vận dụng"
          />
        </div>
      )}

      {/* SUB-TAB 3: BÁO CÁO THU HOẠCH */}
      {subTab === 'step3' && (
        <div className="space-y-4 p-5 rounded-2xl bg-slate-800/80 border border-slate-700">
          <div className="flex items-center gap-2 text-teal-300 font-extrabold text-xs uppercase tracking-wider">
            <FileText className="w-4 h-4" />
            <span>Bước 3 — Báo cáo thu hoạch & Tổng kết</span>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Hướng dẫn / Yêu cầu viết báo cáo thu hoạch:</label>
              <textarea
                rows={4}
                value={studentActivities}
                onChange={(e) => {
                  setStudentActivities(e.target.value);
                  onStudentActivitiesChange(e.target.value);
                }}
                className="w-full p-3 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white leading-relaxed focus:outline-none focus:border-teal-500"
                placeholder="Nhập yêu cầu học sinh trình bày kết quả thu hoạch..."
              />
            </div>

            <div className="p-4 bg-slate-900 rounded-xl border border-slate-700 flex items-center justify-between">
              <label className="flex items-center gap-3 text-xs text-slate-200 cursor-pointer font-medium">
                <input
                  type="checkbox"
                  checked={requireAttachment}
                  onChange={(e) => {
                    setRequireAttachment(e.target.checked);
                    onRequireAttachmentChange(e.target.checked);
                  }}
                  className="w-4 h-4 rounded text-teal-500 focus:ring-teal-400 bg-slate-800 border-slate-700"
                />
                <span className="flex items-center gap-2">
                  <CheckSquare className="w-4 h-4 text-teal-400" />
                  <span>Yêu cầu học sinh đính kèm ảnh minh chứng / sản phẩm thực hành thực tế</span>
                </span>
              </label>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                <Award className="w-3.5 h-3.5 text-amber-400" /> Lời chúc mừng / Khen thưởng khi hoàn thành bài học:
              </label>
              <input
                type="text"
                value={congratMessage}
                onChange={(e) => {
                  setCongratMessage(e.target.value);
                  onCongratMessageChange(e.target.value);
                }}
                className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-teal-500"
                placeholder="Ví dụ: Chúc mừng các em đã hoàn thành xuất sắc bài thực hành!"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
