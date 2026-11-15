/**
 * Cấu trúc dữ liệu chuẩn Thông tư 27/2020/TT-BGDĐT
 * CHỈ ÁP DỤNG CHO CÁC MÔN KIỂM TRA ĐỊNH KÌ BẰNG ĐIỂM SỐ CẤP TIỂU HỌC (THANG ĐIỂM 10,0)
 */

export type KhoiLopTieuHoc = '1' | '2' | '3' | '4' | '5';

/**
 * Danh sách môn học đánh giá định kì bằng điểm số kết hợp nhận xét theo Thông tư 27/2020/TT-BGDĐT.
 * Tuyệt đối không bao gồm các môn đánh giá bằng nhận xét (Đạo đức, Âm nhạc, Mĩ thuật, GDTC, HĐTN, TN&XH).
 */
export type MonHocChamDiem =
  | 'Toán'
  | 'Tiếng Việt'
  | 'Tiếng Anh'
  | 'Tin học'
  | 'Công nghệ'
  | 'Lịch sử và Địa lí'
  | 'Khoa học';

/**
 * Hằng số ánh xạ danh sách môn học có bài kiểm tra định kì chấm điểm theo từng khối lớp Tiểu học
 */
export const SUBJECTS_BY_GRADE: Record<KhoiLopTieuHoc, MonHocChamDiem[]> = {
  '1': ['Toán', 'Tiếng Việt'],
  '2': ['Toán', 'Tiếng Việt'],
  '3': ['Toán', 'Tiếng Việt', 'Tiếng Anh', 'Tin học', 'Công nghệ'],
  '4': [
    'Toán',
    'Tiếng Việt',
    'Tiếng Anh',
    'Tin học',
    'Công nghệ',
    'Khoa học',
    'Lịch sử và Địa lí',
  ],
  '5': [
    'Toán',
    'Tiếng Việt',
    'Tiếng Anh',
    'Tin học',
    'Công nghệ',
    'Khoa học',
    'Lịch sử và Địa lí',
  ],
};

export type ThoiDiemKiemTra =
  | 'Giữa học kì I'
  | 'Cuối học kì I'
  | 'Giữa học kì II'
  | 'Cuối năm học';

export type ThoiGianLamBai = 35 | 40;

export type BoSachGiaoKhoa =
  | 'Kết nối tri thức với cuộc sống'
  | 'Cánh diều'
  | 'Chân trời sáng tạo';

export type DangCauHoiTracNghiem =
  | 'multiple_choice'
  | 'fill_blank'
  | 'matching'
  | 'true_false';

export type PhanCauHoi = 'TRAC_NGHIEM' | 'TU_LUAN';

export type MucDoNhanThucTT27 = 'Mức 1' | 'Mức 2' | 'Mức 3';

export type HinhThucCauHoi =
  | 'Trắc nghiệm 4 lựa chọn'
  | 'Điền khuyết'
  | 'Nối'
  | 'Đúng - Sai'
  | 'Tự luận';

export interface AIExamConfig {
  khoiLop: KhoiLopTieuHoc;
  monHoc: MonHocChamDiem;
  thoiDiemKiemTra: ThoiDiemKiemTra;
  thoiGianLamBai: ThoiGianLamBai;
  boSachGiaoKhoa: BoSachGiaoKhoa;
  soCauTracNghiem: number;
  soCauTuLuan: number;
  dangCauHoiTracNghiem: DangCauHoiTracNghiem[];
  chuDeKienThuc: string;
  muc1_NhanBiet: number;
  muc2_KetNoi: number;
  muc3_VanDung: number;
  ghiChuThem: string;
}

export interface MatrixRow {
  tt: number;
  machKienThuc: string;
  m1_tn_cau: number;
  m1_tn_diem: number;
  m1_tl_cau: number;
  m1_tl_diem: number;
  m2_tn_cau: number;
  m2_tn_diem: number;
  m2_tl_cau: number;
  m2_tl_diem: number;
  m3_tn_cau: number;
  m3_tn_diem: number;
  m3_tl_cau: number;
  m3_tl_diem: number;
  tongSoCau: number;
  tongDiem: number;
  tyLePhanTram: number;
}

export interface SpecificationRow {
  tt: number;
  machKienThuc: string;
  donViKienThucYCCD: string;
  soCauMuc1: number;
  soCauMuc2: number;
  soCauMuc3: number;
  moTaChiTietTheoCau: string[];
}

export interface AIExamQuestion {
  soThuTu: number;
  phan: PhanCauHoi;
  mucDo: MucDoNhanThucTT27;
  hinhThuc: HinhThucCauHoi;
  diem: number;
  noiDungCauHoi: string;
  luaChon?: string[];
  cotA?: string[];
  cotB?: string[];
  dapAnChinhXac: string;
  huongDanCham: string;
}

export interface GeneratedAIExamPackage {
  config: AIExamConfig;
  matrixRows: MatrixRow[];
  specificationRows: SpecificationRow[];
  questions: AIExamQuestion[];
}

export interface SavedAIMatrixExamRecord {
  id: string;
  title: string;
  createdAt: string;
  packageData: GeneratedAIExamPackage;
}

