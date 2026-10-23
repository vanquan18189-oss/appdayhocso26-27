import { db } from './firebase';

/**
 * Khởi tạo hệ thống kết nối Firestore.
 * Đã vô hiệu hóa toàn bộ việc tự động gieo mầm dữ liệu mẫu (seed data)
 * để database mới hoàn toàn trống rỗng, sẵn sàng cho người dùng tự nhập liệu.
 */
export async function initializeAndSyncAllCollections(): Promise<{ success: boolean; message: string }> {
  try {
    if (!db) {
      return { success: false, message: 'Chưa khởi tạo kết nối Firestore' };
    }

    // Không tự động chèn dữ liệu mẫu vào class_rosters, elearning_lessons, questions
    return {
      success: true,
      message: 'Hệ thống kết nối Firestore sạch sẵn sàng, không tự động nạp dữ liệu mẫu.'
    };
  } catch (err: any) {
    const msg = err?.message || String(err);
    console.warn('Lỗi kiểm tra kết nối Firestore:', err);
    return {
      success: false,
      message: msg
    };
  }
}
