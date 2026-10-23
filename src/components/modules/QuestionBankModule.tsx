import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { SUBJECTS, GRADES, CLASSES_BY_GRADE, ALL_CLASSES, EXAM_TYPES, isMultipleResponse } from '../../lib/constants';
import { getSubjectColorStyles } from '../../utils/subjectColors';
import { StatCard } from '../common/StatCard';
import { PaginationControl } from '../common/PaginationControl';
import {
  Database,
  Plus,
  FileSpreadsheet,
  Download,
  Filter,
  Search,
  Trash2,
  Edit3,
  Edit2,
  Copy,
  CheckCircle2,
  Upload,
  Sparkles,
  FileText,
  Sliders,
  Check,
  ArrowRight,
  ArrowLeft,
  ChevronUp,
  ChevronDown,
  ChevronRight,
  Info,
  LayoutGrid,
  PenTool,
  BookOpen,
  UserCheck,
  Users,
  X,
  AlertCircle,
  Share2
} from 'lucide-react';
import { QuestionItem, CognitiveLevel, UserRole } from '../../types';
import { PRIMARY_SCHOOL_SUBJECTS } from '../../services/mockData';
import { QUESTION_TYPES, getQuestionTypeLabel, matchesQuestionType, normalizeQuestionType, getCorrectOrderingSequence } from '../../lib/constants';
import { sanitizeQuestionForFirestore, fetchQuestionsFromFirestore, subscribeToQuestionsFromFirestore, getLocalCachedQuestions, deleteQuestionFromFirestore, deleteQuestionsBatchFromFirestore, saveQuestionsBatchToFirestore, downloadQuestionsAsJSON, downloadQuestionsAsCSV } from '../../services/questionStorageService';
import { downloadQuestionBankTemplate, exportQuestionBankToExcel } from '../../services/excelService';
import { generateExamQuestionsAI, cleanRawExamText } from '../../services/geminiService';
import { TECHNOLOGY_GRADE3_FINAL_EXAM_BLUEPRINT } from '../../config/examBlueprints';
import { QuestionAiModal } from './QuestionAiModal';
import { ManualQuestionBankModal } from './ManualQuestionBankModal';
import { ShareContentModal } from './ShareContentModal';
import { ConfirmDeleteModal } from '../common/ConfirmDeleteModal';
import { CognitiveLevelBadge } from '../../theme/tokens';
import { cleanQuestionMath } from '../../utils/mathFormatter';
import { resolveCurrentTeacherProfile } from '../../services/teacherStorageService';
import { extractGradeDigit } from '../../services/classStorageService';
import { auth } from '../../services/firebase';

/**
 * Chuẩn hóa hàm lọc Khối: Khối 4 nhận diện toàn bộ câu hỏi có grade là "Khối 4", "4", "4C", "Lớp 4", v.v.
 */
export const isQuestionMatchingGrade = (questionGrade?: string, filterGrade?: string): boolean => {
  if (!filterGrade || filterGrade === 'Tất cả các khối' || filterGrade === 'all') return true;
  if (!questionGrade) return false;
  if (questionGrade.trim().toLowerCase() === filterGrade.trim().toLowerCase()) return true;

  const fDigit = extractGradeDigit(filterGrade);
  const qDigit = extractGradeDigit(questionGrade);
  if (fDigit && qDigit) {
    return fDigit === qDigit;
  }
  return questionGrade.toLowerCase().includes(filterGrade.toLowerCase()) || filterGrade.toLowerCase().includes(questionGrade.toLowerCase());
};

const getSampleFileContent = (subject: string, grade: string): string => {
  const normSubject = subject.toLowerCase();
  if (normSubject.includes('tin học')) {
    return `ĐỀ ÔN TẬP CHUẨN ĐẦU RA MÔN TIN HỌC - ${grade.toUpperCase()}
Chủ đề: Thông tin và quyết định (GDPT 2018)

[CÂU 1] (Nhận biết - Trắc nghiệm đơn)
Thông tin thời tiết cho biết hôm nay trời sẽ mưa lớn. Theo em, em cần đưa ra quyết định nào sau đây là hợp lý nhất?
A. Mang theo áo mưa hoặc ô (dù).
B. Rủ bạn ra sân trường đá bóng không cần che chắn.
C. Mặc quần áo mỏng nhẹ và đi giày vải trắng.
D. Không cần quan tâm đến thời tiết.
*ĐÁP ÁN: A
*GIẢI THÍCH: Khi biết trời mưa lớn, quyết định mang theo áo mưa hoặc ô giúp tránh bị ướt và bảo vệ sức khỏe tốt nhất.

[CÂU 2] (Thông hiểu - Chọn nhiều đáp án)
Đâu là những ví dụ cho thấy con người cần phải xử lý thông tin trước khi đưa ra quyết định? (Chọn các đáp án đúng)
A. Nhìn thấy đèn giao thông chuyển sang màu đỏ, em dừng xe lại.
B. Nghe tiếng trống trường tập trung, các bạn học sinh xếp hàng vào lớp.
C. Cầm một hòn đá nặng trên tay mà không suy nghĩ gì.
D. Nhìn thấy biển báo "Trơn trượt", em đi chậm và cẩn thận hơn để tránh ngã.
*ĐÁP ÁN: A, B, D
*GIẢI THÍCH: Nhìn đèn đỏ dừng xe; nghe tiếng trống xếp hàng; nhìn biển báo trơn trượt đi chậm đều là các quyết định dựa trên xử lý thông tin.

[CÂU 3] (Nhận biết - Đúng / Sai)
Xác định tính Đúng hoặc Sai cho các phát biểu sau về thông tin và quyết định:
1. "Thông tin thu nhận được từ thế giới xung quanh giúp con người đưa ra quyết định đúng đắn." [Đúng]
2. "Quyết định của chúng ta không cần phải dựa vào thông tin thực tế." [Sai]
3. "Khi nghe tiếng còi xe cứu thương đang hú, quyết định nhường đường là một quyết định dựa trên thông tin âm thanh." [Đúng]
*ĐÁP ÁN: 1-Đúng, 2-Sai, 3-Đúng

[CÂU 4] (Thông hiểu - Điền khuyết)
Điền từ thích hợp vào chỗ trống: "Trước khi ra đường vào buổi trưa nắng gắt, em nhận được thông tin trời rất nắng nóng. Thông tin đó giúp em đưa ra quyết định mang theo mũ, áo chống nắng và uống đủ nước để bảo vệ..."
*ĐÁP ÁN: sức khỏe

[CÂU 5] (Thông hiểu - Sắp xếp)
Em hãy sắp xếp các bước sau theo đúng thứ tự từ lúc nhận được thông tin đến khi đưa ra hành động/quyết định:
1. Xử lý và suy nghĩ về thông tin vừa nhận được.
2. Đưa ra quyết định (làm gì hoặc không làm gì).
3. Thu nhận thông tin từ môi trường xung quanh (nhìn, nghe, sờ,...).
4. Thực hiện hành động theo quyết định.
*ĐÁP ÁN: 3 -> 1 -> 2 -> 4

[CÂU 6] (Thông hiểu - Nối cặp)
Nối tình huống ở cột A với quyết định tương ứng ở cột B:
Cột A (Tình huống thông tin):
1. Thấy bài tập cô giao có câu hỏi khó chưa hiểu.
2. Nhận được thông báo an toàn giao thông từ nhà trường.
3. Nghe tiếng chuông báo thức reo vào buổi sáng.
Cột B (Quyết định hành động):
a. Nhờ thầy cô hoặc cha mẹ giải thích thêm.
b. Đội mũ bảo hiểm trước khi ngồi lên xe máy.
c. Tắt chuông và thức dậy chuẩn bị đi học.
*ĐÁP ÁN: 1-a, 2-b, 3-c

[CÂU 7] (Vận dụng - Phân loại)
Hãy phân loại các hành động sau thành hai nhóm:
Nhóm A (Quyết định đúng đắn dựa trên thông tin)
Nhóm B (Quyết định chưa phù hợp)
Các hành động cần phân loại:
- Thấy biển báo "Khu vực nước sâu, nguy hiểm", Nam quyết định không xuống tắm hồ. (Nhóm A)
- Trời đang mưa to sấm chớp, Lan quyết định ra gốc cây đứng trú mưa. (Nhóm B)
- Nhìn thấy đèn xanh, người đi bộ qua đường đúng phần đường quy định. (Nhóm A)
- Ngửi thấy mùi khét trong nhà bếp, Minh cứ tiếp tục đi ngủ không báo cho ai. (Nhóm B)

[CÂU 8] (Vận dụng - Trắc nghiệm đơn)
Hà đang sử dụng máy tính thì màn hình bỗng xuất hiện bảng thông báo lỗi và máy bị đứng hình (đơ). Nếu là Hà, em sẽ đưa ra quyết định xử lý bước đầu như thế nào cho an toàn và hợp lý?
A. Tự ý dùng tuốc nơ vít tháo tung thùng máy tính ra xem bên trong.
B. Lấy nước xịt trực tiếp vào màn hình để làm mát máy.
C. Báo ngay cho thầy cô giáo hoặc người lớn biết để được hỗ trợ kiểm tra.
D. Cố gắng đập mạnh vào bàn phím nhiều lần cho máy chạy lại.
*ĐÁP ÁN: C

[CÂU 9] (Vận dụng cao - Tự luận ngắn)
Đọc tình huống: "Em đang đi trong siêu thị thì vô tình bị lạc mất bố mẹ. Em nhớ lại thông tin bố mẹ đã dặn từ trước: 'Nếu bị lạc, hãy đứng yên tại chỗ hoặc tìm chú bảo vệ để nhờ trợ giúp'." Dựa vào thông tin trên, quyết định sáng suốt nhất của em ngay lúc đó là gì?
*ĐÁP ÁN: Đứng yên tại vị trí bị lạc để bố mẹ dễ tìm kiếm hoặc nhanh chóng tìm người hỗ trợ đồng phục bảo vệ để phát loa thông báo.

[CÂU 10] (Vận dụng cao - Tự luận phân tích)
Em hãy nêu một ví dụ thực tế trong cuộc sống hàng ngày ở trường học của em, trong đó cho thấy thông tin em nhận được đã giúp em đưa ra một quyết định chính xác để đảm bảo an toàn hoặc học tập tốt hơn.
*ĐÁP ÁN: Khi nghe tiếng trống trường báo giờ vào học, em dừng chơi đùa và xếp hàng nhanh chóng để vào lớp. Thông tin âm thanh giúp em chuẩn bị tư thế học tập đúng nội quy học đường.`;
  }

  if (normSubject.includes('toán')) {
    return `ĐỀ ÔN TẬP CHUẨN ĐẦU RA MÔN TOÁN - ${grade.toUpperCase()}
Chủ đề: Phép nhân và phép chia phạm vi 1000

[CÂU 1] (Nhận biết - Trắc nghiệm đơn)
Một hộp bút chì màu có 8 chiếc bút. Hỏi 6 hộp bút như thế có tất cả bao nhiêu chiếc bút chì màu?
A. 48 chiếc
B. 14 chiếc
C. 40 chiếc
D. 32 chiếc
*ĐÁP ÁN: A
*GIẢI THÍCH: Thực hiện phép nhân số lượng bút trong một hộp với số hộp: 8 x 6 = 48 chiếc.

[CÂU 2] (Thông hiểu - Chọn nhiều đáp án)
Trong các biểu thức sau, những biểu thức nào có giá trị lớn hơn 50? (Chọn các đáp án đúng)
A. 9 x 6
B. 8 x 7
C. 7 x 6
D. 9 x 7
*ĐÁP ÁN: A, B, D
*GIẢI THÍCH: 9 x 6 = 54 (>50); 8 x 7 = 56 (>50); 7 x 6 = 42 (<50); 9 x 7 = 63 (>50).

[CÂU 3] (Nhận biết - Đúng / Sai)
Xác định tính Đúng hoặc Sai cho các phát biểu toán học sau:
1. "Số 0 nhân với bất kỳ số nào cũng bằng chính số đó." [Sai]
2. "Số nào chia cho 1 cũng bằng chính số đó." [Đúng]
3. "Phép chia cho 0 là phép tính không có nghĩa." [Đúng]
*ĐÁP ÁN: 1-Sai, 2-Đúng, 3-Đúng

[CÂU 4] (Thông hiểu - Điền khuyết)
Hãy điền số thích hợp vào chỗ trống: "Một cửa hàng có 45 quả cam, cửa hàng đã bán đi 1/5 số cam đó. Số quả cam cửa hàng đã bán là ______ quả."
*ĐÁP ÁN: 9

[CÂU 5] (Thông hiểu - Sắp xếp)
Sắp xếp các biểu thức sau theo thứ tự giá trị tăng dần từ nhỏ đến lớn:
1. 24 : 3
2. 54 : 6
3. 32 : 8
4. 40 : 10
*ĐÁP ÁN: 3 -> 4 -> 1 -> 2

[CÂU 6] (Thông hiểu - Nối cặp)
Nối phép tính ở cột A với kết quả tương ứng ở cột B:
Cột A:
1. 7 x 8
2. 64 : 8
3. 9 x 5
Cột B:
a. 56
b. 8
c. 45
*ĐÁP ÁN: 1-a, 2-b, 3-c

[CÂU 7] (Vận dụng - Phân loại)
Phân loại các số sau thành hai nhóm:
Nhóm A (Số chia hết cho 5)
Nhóm B (Số không chia hết cho 5)
Các số cần phân loại:
- 15 (Nhóm A)
- 27 (Nhóm B)
- 40 (Nhóm A)
- 33 (Nhóm B)

[CÂU 8] (Vận dụng - Trắc nghiệm đơn)
Một người nông dân thu hoạch được 56 quả bưởi. Người đó muốn xếp đều số bưởi này vào 7 chiếc giỏ. Hỏi mỗi chiếc giỏ đựng được bao nhiêu quả bưởi?
A. 6 quả
B. 8 quả
C. 7 quả
D. 9 quả
*ĐÁP ÁN: B

[CÂU 9] (Vận dụng cao - Tự luận ngắn)
Nhà Lan nuôi 4 chuồng thỏ, mỗi chuồng có 5 con thỏ. Hôm nay mẹ mua thêm 6 con thỏ nữa và nhốt đều vào các chuồng đó. Hỏi hiện tại mỗi chuồng thỏ có bao nhiêu con?
*ĐÁP ÁN: Tổng số thỏ ban đầu là: 4 x 5 = 20 con. Tổng số thỏ sau khi thêm là: 20 + 6 = 26 con. Nhốt đều vào 4 chuồng thì mỗi chuồng sẽ có: 26 : 4 = 6 con thỏ (dư 2 con).

[CÂU 10] (Vận dụng cao - Tự luận phân tích)
Em hãy giải thích tại sao khi nhân một số tự nhiên với 10, ta chỉ việc viết thêm một chữ số 0 vào bên phải số đó. Nêu một ví dụ minh họa cụ thể.
*ĐÁP ÁN: Khi nhân một số với 10 tức là ta đã tăng giá trị của mỗi chữ số lên 10 lần (hàng đơn vị thành hàng chục, hàng chục thành hàng trăm...). Việc thêm chữ số 0 vào bên phải giúp dịch chuyển tất cả các chữ số sang bên trái một hàng, giữ nguyên giá trị tỉ lệ tương quan. Ví dụ: 5 x 10 = 50.`;
  }

  return `ĐỀ ÔN TẬP CHUẨN ĐẦU RA MÔN ${subject.toUpperCase()} - ${grade.toUpperCase()}
Chủ đề: Tự nhiên, Xã hội và Khoa học đời sống

[CÂU 1] (Nhận biết - Trắc nghiệm đơn)
Cơ quan nào trong cơ thể con người thực hiện chức năng hô hấp, giúp chúng ta lấy khí ô-xy và thải khí các-bô-níc?
A. Tim
B. Dạ dày
C. Phổi
D. Thận
*ĐÁP ÁN: C
*GIẢI THÍCH: Phổi là cơ quan chính trong hệ hô hấp giúp trao đổi khí cho cơ thể.

[CÂU 2] (Thông hiểu - Chọn nhiều đáp án)
Đâu là những việc làm giúp bảo vệ môi trường nước xung quanh chúng ta? (Chọn các đáp án đúng)
A. Vứt rác thải bừa bãi xuống ao, hồ, sông ngòi.
B. Sử dụng tiết kiệm nước sạch hàng ngày.
C. Không xả nước thải bẩn chưa qua xử lý trực tiếp ra sông hồ.
D. Thu gom và phân loại rác thải nhựa đúng nơi quy định.
*ĐÁP ÁN: B, C, D
*GIẢI THÍCH: Tiết kiệm nước, lọc nước thải và thu gom rác giúp nguồn nước luôn trong sạch và bền vững.

[CÂU 3] (Nhận biết - Đúng / Sai)
Xác định tính Đúng hoặc Sai cho các phát biểu khoa học đời sống dưới đây:
1. "Mặt trời quay xung quanh Trái đất hàng ngày từ đông sang tây." [Sai]
2. "Cây xanh có khả năng tự tổng hợp chất dinh dưỡng nhờ quá trình quang hợp dưới ánh sáng mặt trời." [Đúng]
3. "Động vật cần thức ăn, nước uống và không khí để duy trì sự sống." [Đúng]
*ĐÁP ÁN: 1-Sai, 2-Đúng, 3-Đúng

[CÂU 4] (Thông hiểu - Điền khuyết)
Hãy điền từ thích hợp vào chỗ trống: "Nước tồn tại ở ba thể: thể lỏng, thể khí (hơi) và thể _________ khi nhiệt độ xuống dưới 0 độ C."
*ĐÁP ÁN: rắn

[CÂU 5] (Thông hiểu - Sắp xếp)
Hãy sắp xếp các giai đoạn phát triển của một cây đậu theo đúng vòng đời sinh trưởng tự nhiên:
1. Cây non lớn dần và ra hoa, kết quả.
2. Hạt đậu hút nước, nứt vỏ và nảy mầm.
3. Hạt đậu già rơi xuống đất ẩm.
4. Mầm đậu phát triển thành cây con có lá mầm.
*ĐÁP ÁN: 3 -> 2 -> 4 -> 1

[CÂU 6] (Thông hiểu - Nối cặp)
Nối bộ phận của cây ở cột A với chức năng tương ứng ở cột B:
Cột A:
1. Rễ cây
2. Lá cây
3. Thân cây
Cột B:
a. Hút nước và các chất khoáng từ lòng đất.
b. Thực hiện chức năng quang hợp và trao đổi khí.
c. Vận chuyển nhựa và các chất dinh dưỡng đi nuôi cây.
*ĐÁP ÁN: 1-a, 2-b, 3-c

[CÂU 7] (Vận dụng - Phân loại)
Phân loại các con vật sau thành hai nhóm sinh sống:
Nhóm A (Động vật sống dưới nước)
Nhóm B (Động vật sống trên cạn)
Các động vật cần phân loại:
- Cá chép (Nhóm A)
- Con hổ (Nhóm B)
- Con tôm (Nhóm A)
- Con hươu cao cổ (Nhóm B)

[CÂU 8] (Vận dụng - Trắc nghiệm đơn)
Tại sao chúng ta không nên ăn quá nhiều đồ ăn ngọt như bánh kẹo, nước ngọt có ga vào buổi tối trước khi đi ngủ?
A. Làm răng bị sâu, tăng cân mất kiểm soát và gây khó ngủ do thừa năng lượng.
B. Giúp răng chắc khỏe và sạch đẹp hơn.
C. Làm cơ thể bị thiếu hụt nước trầm trọng.
D. Làm cho mắt bị mỏi và giảm thị lực.
*ĐÁP ÁN: A

[CÂU 9] (Vận dụng cao - Tự luận ngắn)
Hãy nêu những biện pháp đơn giản mà em và gia đình có thể thực hiện tại nhà để góp phần tiết kiệm năng lượng điện hàng ngày.
*ĐÁP ÁN: Tắt các thiết bị điện khi không sử dụng, tận dụng ánh sáng và gió tự nhiên, sử dụng bóng đèn tiết kiệm điện (LED), điều chỉnh nhiệt độ điều hòa ở mức hợp lý (từ 25 đến 26 độ C).

[CÂU 10] (Vận dụng cao - Tự luận phân tích)
Giải thích tại sao rừng xanh được ví như "lá phổi xanh" của Trái đất. Hãy kêu gọi hành động bảo vệ rừng trong 2 câu ngắn gọn.
*ĐÁP ÁN: Rừng cây hấp thụ lượng lớn khí các-bô-níc và thải ra khí ô-xy thông qua quá trình quang hợp, giúp lọc bụi bẩn và điều hòa khí hậu toàn cầu giống như cơ chế lọc khí của phổi người.`;
};

interface QuestionBankModuleProps {
  questions: QuestionItem[];
  onSaveQuestion: (question: QuestionItem) => Promise<void> | void;
  onSaveQuestions?: (questions: QuestionItem[]) => Promise<void> | void;
  onDeleteQuestion: (id: string) => Promise<void> | void;
  onBatchDeleteQuestions?: (ids: string[]) => Promise<void> | void;
  userRole: UserRole;
  onAssignHomework?: (config: any) => void;
  onCreateExam?: (examData: any) => void;
  onCreateGame?: (gameData: any) => void;
  onNavigate?: (module: string) => void;
}

export const QuestionBankModule: React.FC<QuestionBankModuleProps> = ({
  questions,
  onSaveQuestion,
  onSaveQuestions,
  onDeleteQuestion,
  onBatchDeleteQuestions,
  userRole,
  onAssignHomework,
  onCreateExam,
  onCreateGame,
  onNavigate
}) => {
  const authEmail = (typeof window !== 'undefined' ? (auth?.currentUser?.email || localStorage.getItem('eduplay_teacher_email')) : null);
  const activeTeacherProfile = useMemo(() => resolveCurrentTeacherProfile(authEmail), [authEmail]);
  const isAdmin = userRole === 'admin' || activeTeacherProfile.userRole === 'admin' || (activeTeacherProfile.role || '').toLowerCase().includes('admin');

  const isQuestionOwner = useCallback((q: QuestionItem): boolean => {
    if (isAdmin) return true;
    const currentId = activeTeacherProfile.id; // e.g. 'gv-06', 'gv-12'
    if (q.teacherId && q.teacherId === currentId) return true;
    if (q.createdBy && q.createdBy === currentId) return true;
    if (q.authorName && (q.authorName.includes(activeTeacherProfile.name) || activeTeacherProfile.name.includes(q.authorName))) return true;
    if (q.authorType === 'my') return true;
    return false;
  }, [isAdmin, activeTeacherProfile.id, activeTeacherProfile.name]);

  // Danh sách câu hỏi đồng bộ trực tiếp từ Firestore 'questions' và cache
  const [internalQuestions, setInternalQuestions] = useState<QuestionItem[]>(() => {
    if (questions && questions.length > 50) return questions;
    const cached = getLocalCachedQuestions();
    return cached && cached.length > 0 ? cached : (questions || []);
  });

  // Tải toàn bộ danh sách câu hỏi thực tế từ Firestore collection 'questions' (đặc biệt các câu hỏi của Khối 4)
  useEffect(() => {
    let isMounted = true;
    fetchQuestionsFromFirestore().then((remoteQuestions) => {
      if (isMounted && remoteQuestions && remoteQuestions.length > 0) {
        setInternalQuestions(remoteQuestions);
      }
    });

    const unsubscribe = subscribeToQuestionsFromFirestore((liveQuestions) => {
      if (isMounted && liveQuestions && liveQuestions.length > 0) {
        setInternalQuestions(liveQuestions);
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  // Cập nhật khi prop questions từ component cha truyền xuống
  useEffect(() => {
    if (questions && questions.length > 0) {
      setInternalQuestions((prev) => {
        if (questions.length >= prev.length) return questions;
        const idSet = new Set(questions.map((q) => q.id));
        return [...questions, ...prev.filter((p) => !idSet.has(p.id))];
      });
    }
  }, [questions]);

  const [searchTerm, setSearchTerm] = useState('');
  const [gradeFilter, setGradeFilter] = useState('Tất cả các khối');
  const [subjectFilter, setSubjectFilter] = useState('Tất cả các môn');
  const [levelFilter, setLevelFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [lessonFilter, setLessonFilter] = useState('all');
  const [resourceTab, setResourceTab] = useState<'all' | 'my' | 'colleague'>('all');

  // Pagination states
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [editingQuestions, setEditingQuestions] = useState<Partial<QuestionItem>[] | undefined>(undefined);
  const [editingLessonName, setEditingLessonName] = useState<string | undefined>(undefined);
  const [editingGrade, setEditingGrade] = useState<string | undefined>(undefined);
  const [editingSubject, setEditingSubject] = useState<string | undefined>(undefined);
  const [sharingQuestion, setSharingQuestion] = useState<{ id?: string; title: string; grade?: string; subject?: string } | null>(null);

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const handleSaveManualQuestions = async (newQuestions: QuestionItem[]) => {
    try {
      const sanitized = newQuestions.map(q => sanitizeQuestionForFirestore(q));
      if (onSaveQuestions) {
        await onSaveQuestions(sanitized);
      } else {
        for (const q of sanitized) {
          await onSaveQuestion(q);
        }
      }
      if (sanitized.length > 0) {
        setSubjectFilter(sanitized[0].subject);
        setGradeFilter(sanitized[0].grade);
        setLessonFilter(sanitized[0].lessonName);
      }
      setIsManualModalOpen(false);
      showToast("Đã lưu thành công dữ liệu câu hỏi!", "success");
    } catch (error) {
      console.error('Error saving manual questions:', error);
      showToast("Lưu câu hỏi thất bại, vui lòng kiểm tra lại!", "error");
    }
  };

  // Quick Create Modal States
  const [activeQuickTab, setActiveQuickTab] = useState<1 | 2 | 3>(1);
  const [quickGrade, setQuickGrade] = useState('Khối 4');
  const [quickSubject, setQuickSubject] = useState('Toán');
  const [quickExamType, setQuickExamType] = useState('Thường xuyên');
  const [quickLevelSelection, setQuickLevelSelection] = useState('all3');
  const [quickCount, setQuickCount] = useState(10);
  const [quickLevels, setQuickLevels] = useState<CognitiveLevel[]>(['nhan_biet', 'thong_hieu']);
  const [quickTypes, setQuickTypes] = useState<string[]>(['Trắc nghiệm đơn', 'Chọn nhiều đáp án đúng']);
  const [quickLessonName, setQuickLessonName] = useState('');
  const [lessonNameError, setLessonNameError] = useState(false);

  // Source modes and status
  const [quickSourceMode, setQuickSourceMode] = useState<'standard' | 'paste' | 'file'>('paste');
  const [quickRawText, setQuickRawText] = useState('');
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [uploadedFileContent, setUploadedFileContent] = useState<string>('');
  const [uploadedFileBase64, setUploadedFileBase64] = useState<string>('');
  const [uploadedFileType, setUploadedFileType] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);

  // AI Preview & Verification State
  const [previewQuestions, setPreviewQuestions] = useState<QuestionItem[]>([]);
  const [isPreviewStep, setIsPreviewStep] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Expanded cards and Selected cards state
  const [expandedQuestionIds, setExpandedQuestionIds] = useState<string[]>([]);
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([]);
  const [deletingQuestion, setDeletingQuestion] = useState<QuestionItem | null>(null);
  const [isBatchDeleting, setIsBatchDeleting] = useState(false);
  const [batchDeleteTargetIds, setBatchDeleteTargetIds] = useState<string[]>([]);
  const [isDeletingBatchProgress, setIsDeletingBatchProgress] = useState(false);
  const [batchDeleteProgressText, setBatchDeleteProgressText] = useState<string>('');
  const [batchDeleteError, setBatchDeleteError] = useState<string | null>(null);

  const [isDeletingSingleProgress, setIsDeletingSingleProgress] = useState(false);
  const [singleDeleteError, setSingleDeleteError] = useState<string | null>(null);

  const handleTriggerBatchDelete = (type: 'selected' | 'all') => {
    let targetIds: string[] = [];
    if (type === 'selected') {
      targetIds = selectedQuestionIds;
    } else {
      targetIds = filteredQuestions.map(q => q.id);
    }

    if (targetIds.length === 0) {
      showToast("Không có câu hỏi nào để xóa!", "error");
      return;
    }

    setBatchDeleteError(null);
    setBatchDeleteProgressText('');
    setBatchDeleteTargetIds(targetIds);
    setIsBatchDeleting(true);
  };

  const handleConfirmBatchDelete = async () => {
    if (!batchDeleteTargetIds || batchDeleteTargetIds.length === 0) return;
    const targetCount = batchDeleteTargetIds.length;
    const targetSet = new Set(batchDeleteTargetIds);

    setIsDeletingBatchProgress(true);
    setBatchDeleteError(null);
    setBatchDeleteProgressText(`Đã xóa 0/${targetCount}`);

    // Backup questions for optimistic rollback
    const backupQuestions = [...internalQuestions];
    const backupSelected = [...selectedQuestionIds];

    // Optimistically update UI immediately (hide selected questions from list)
    setInternalQuestions(prev => prev.filter(q => !targetSet.has(q.id)));
    setSelectedQuestionIds(prev => prev.filter(id => !targetSet.has(id)));

    try {
      await deleteQuestionsBatchFromFirestore(batchDeleteTargetIds, (deletedSoFar, total) => {
        setBatchDeleteProgressText(`Đã xóa ${deletedSoFar}/${total}`);
      });

      if (onBatchDeleteQuestions) {
        try {
          await onBatchDeleteQuestions(batchDeleteTargetIds);
        } catch (callbackErr) {
          console.warn("Parent onBatchDeleteQuestions callback error:", callbackErr);
        }
      } else if (onDeleteQuestion) {
        for (const id of batchDeleteTargetIds) {
          try {
            await onDeleteQuestion(id);
          } catch (callbackErr) {}
        }
      }

      // Success: auto close modal and reset state
      setIsBatchDeleting(false);
      setBatchDeleteTargetIds([]);
      setBatchDeleteProgressText('');
      setBatchDeleteError(null);

      showToast(`Đã xóa thành công ${targetCount} câu hỏi`, "success");
    } catch (err: any) {
      console.error("Lỗi khi xóa hàng loạt câu hỏi:", err);

      let errorText = err?.message || "Có lỗi xảy ra khi xóa câu hỏi từ CSDL!";
      try {
        const parsed = JSON.parse(errorText);
        if (parsed?.error) {
          errorText = parsed.error;
        }
      } catch {}

      // Rollback list if deletion failed
      setInternalQuestions(backupQuestions);
      setSelectedQuestionIds(backupSelected);

      setBatchDeleteError(errorText);
      showToast(`Lỗi khi xóa câu hỏi: ${errorText}`, "error");
    } finally {
      setIsDeletingBatchProgress(false);
    }
  };

  const handleConfirmSingleDelete = async () => {
    if (!deletingQuestion) return;
    if (!isQuestionOwner(deletingQuestion)) {
      showToast('⚠️ Bạn không có quyền xóa nội dung này!', 'error');
      setDeletingQuestion(null);
      return;
    }

    const qId = deletingQuestion.id;
    setIsDeletingSingleProgress(true);
    setSingleDeleteError(null);

    const backupQuestions = [...internalQuestions];
    const backupSelected = [...selectedQuestionIds];

    // Optimistically remove from list
    setInternalQuestions(prev => prev.filter(q => q.id !== qId));
    setSelectedQuestionIds(prev => prev.filter(id => id !== qId));

    try {
      await deleteQuestionFromFirestore(qId);
      if (onDeleteQuestion) {
        try {
          await onDeleteQuestion(qId);
        } catch (callbackErr) {
          console.warn("Parent onDeleteQuestion callback error:", callbackErr);
        }
      }
      setDeletingQuestion(null);
      setSingleDeleteError(null);
      showToast("Đã xóa thành công 1 câu hỏi", "success");
    } catch (err: any) {
      console.error("Lỗi khi xóa câu hỏi:", err);

      let errorText = err?.message || "Xóa câu hỏi thất bại!";
      try {
        const parsed = JSON.parse(errorText);
        if (parsed?.error) {
          errorText = parsed.error;
        }
      } catch {}

      // Rollback
      setInternalQuestions(backupQuestions);
      setSelectedQuestionIds(backupSelected);

      setSingleDeleteError(errorText);
      showToast(`Không thể xóa câu hỏi: ${errorText}`, "error");
    } finally {
      setIsDeletingSingleProgress(false);
    }
  };

  const handleToggleExpand = (id: string) => {
    setExpandedQuestionIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleToggleSelectQuestion = (id: string) => {
    setSelectedQuestionIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleDuplicateQuestion = async (q: QuestionItem) => {
    const newId = `q-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const newCode = `${q.code}-COPY`;
    const duplicated: QuestionItem = {
      ...q,
      id: newId,
      code: newCode,
      content: `${q.content} (Bản sao)`,
      teacherId: activeTeacherProfile.id,
      teacherName: activeTeacherProfile.name,
      teacherEmail: activeTeacherProfile.email,
      createdBy: activeTeacherProfile.id,
      authorName: activeTeacherProfile.name,
      authorType: 'my'
    };
    try {
      await onSaveQuestion(duplicated);
      showToast("Đã sao chép câu hỏi thành công!", "success");
    } catch (err) {
      showToast("Sao chép câu hỏi thất bại!", "error");
    }
  };

  const handleEditQuestion = (q: QuestionItem) => {
    if (!isQuestionOwner(q)) {
      showToast('⚠️ Bạn không có quyền chỉnh sửa câu hỏi này!', 'error');
      return;
    }
    setEditingSubject(q.subject || 'Toán');
    setEditingGrade(q.grade || 'Khối 3');
    setEditingLessonName(q.lessonName || '');
    setEditingQuestions([q]);
    setIsManualModalOpen(true);
  };

  const getQuestionTypeLabel = (type: string) => {
    switch (type) {
      case 'multiple_choice':
      case 'Trắc nghiệm':
        return 'Trắc nghiệm đơn';
      case 'multiple_response':
        return 'Chọn nhiều đáp án';
      case 'true_false':
        return 'Đúng / Sai';
      case 'fill_blank':
        return 'Điền khuyết';
      case 'ordering':
      case 'Sắp xếp thứ tự':
        return 'Sắp xếp';
      case 'matching':
      case 'Nối cặp':
        return 'Nối cặp';
      case 'classification':
      case 'Phân loại':
        return 'Phân loại';
      case 'essay':
      case 'Tự luận':
        return 'Tự luận';
      default:
        return type || 'Khác';
    }
  };

  const [saveError, setSaveError] = useState<string | null>(null);

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setIsPreviewStep(false);
    setPreviewQuestions([]);
    setQuickRawText('');
    setUploadedFileName(null);
    setUploadedFileContent('');
    setUploadedFileBase64('');
    setUploadedFileType('');
    setSaveError(null);
  };

  const handleConfirmSave = async () => {
    if (previewQuestions.length === 0) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      const sanitizedQuestions: QuestionItem[] = previewQuestions.map((q, idx) => {
        const fallbackCode = `CH-${(quickSubject || 'TOAN').toUpperCase().slice(0, 3)}-${Date.now().toString().slice(-4)}-${idx + 1}`;
        const raw = {
          ...q,
          id: q.id || `q-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 5)}`,
          code: q.code || fallbackCode,
          subject: quickSubject || q.subject || 'Toán',
          grade: quickGrade || q.grade || 'Khối 3',
          level: q.level || 'nhan_biet',
          type: normalizeQuestionType(q.type),
          lessonName: quickLessonName || q.lessonName || 'Bài học',
          content: q.content,
          explanation: q.explanation || 'Giải thích sư phạm cho câu hỏi.',
          createdAt: q.createdAt || Date.now()
        };
        return sanitizeQuestionForFirestore(raw);
      });

      if (onSaveQuestions) {
        await onSaveQuestions(sanitizedQuestions);
      } else {
        await saveQuestionsBatchToFirestore(sanitizedQuestions);
      }
      
      // Set appropriate filters to display the newly imported exam/questions
      setSubjectFilter(quickSubject);
      setGradeFilter(quickGrade);
      if (quickLessonName) {
        setLessonFilter(quickLessonName);
      }
      
      handleCloseModal();
      showToast(`Đã lưu thành công ${sanitizedQuestions.length} câu hỏi vào hệ thống!`, "success");
    } catch (error: any) {
      console.error('Error saving questions to database:', error);
      const errorMessage = error?.message || (typeof error === 'string' ? error : 'Firebase từ chối ghi hoặc gián đoạn kết nối CSDL.');
      setSaveError(errorMessage);
      showToast(`Lỗi khi lưu vào CSDL: ${errorMessage}`, "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownloadBackup = (format: 'json' | 'excel') => {
    if (previewQuestions.length === 0) return;
    const fileName = `cau_hoi_ai_${quickSubject || 'toan'}_${Date.now()}`;
    if (format === 'json') {
      downloadQuestionsAsJSON(previewQuestions, `${fileName}.json`);
      showToast(`Đã tải bản sao JSON (${previewQuestions.length} câu hỏi)!`, "success");
    } else {
      downloadQuestionsAsCSV(previewQuestions, `${fileName}.csv`);
      showToast(`Đã tải bản sao Excel/CSV (${previewQuestions.length} câu hỏi)!`, "success");
    }
  };

  // Manual entry fields (supports multiple question cards)
  const [manualQuestionsList, setManualQuestionsList] = useState<Array<{
    id: number;
    type: string;
    content: string;
    options: Array<{ label: string; text: string; isCorrect: boolean }>;
    explanation: string;
    tfStatements?: Array<{ statement: string; isTrue: boolean }>;
    blankText?: string;
    orderSteps?: string[];
    essayGuide?: string;
    classificationGroups?: string[];
    classificationItems?: Array<{ name: string; group: string }>;
  }>>([
    {
      id: 1,
      type: 'multiple_choice',
      content: '',
      options: [
        { label: 'A', text: '', isCorrect: true },
        { label: 'B', text: '', isCorrect: false },
        { label: 'C', text: '', isCorrect: false },
        { label: 'D', text: '', isCorrect: false }
      ],
      explanation: ''
    }
  ]);

  const [orderingOptionsState, setOrderingOptionsState] = useState<Record<string, string[]>>({});

  const handleMoveOption = (questionId: string, index: number, direction: 'up' | 'down', currentOptions: string[]) => {
    const opts = [...(orderingOptionsState[questionId] || currentOptions)];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= opts.length) return;
    const temp = opts[index];
    opts[index] = opts[targetIndex];
    opts[targetIndex] = temp;
    setOrderingOptionsState({ ...orderingOptionsState, [questionId]: opts });
  };

  const activeQuestionsList = internalQuestions && internalQuestions.length > 0 ? internalQuestions : (questions || []);

  // Get unique list of lessons for current subject & grade filter
  const availableLessons = Array.from(
    new Set(
      activeQuestionsList
        .filter((q) => isQuestionMatchingGrade(q.grade, gradeFilter) && (subjectFilter === 'Tất cả các môn' || q.subject === subjectFilter))
        .map((q) => q.lessonName)
        .filter(Boolean)
    )
  ) as string[];

  const allQuestionsCount = activeQuestionsList.length;
  const myQuestionsCount = activeQuestionsList.filter(q => q.authorType === 'my' || !q.authorType || q.authorName?.includes('Thủ') || q.authorName?.includes('Hoài') || !q.authorName).length;
  const colleagueQuestionsCount = activeQuestionsList.filter(q => q.authorType === 'colleague' || (q.authorType !== 'my' && !!q.authorName && !q.authorName.includes('Thủ') && !q.authorName.includes('Hoài'))).length;

  const qBankTotal = activeQuestionsList.length;
  const qBankNb = activeQuestionsList.filter(q => q.level === 'nhan_biet').length;
  const qBankTh = activeQuestionsList.filter(q => q.level === 'thong_hieu').length;
  const qBankVd = activeQuestionsList.filter(q => q.level === 'van_dung').length;
  const qBankVdc = activeQuestionsList.filter(q => q.level === 'van_dung_cao').length;

  const qBankNbPercent = qBankTotal > 0 ? Math.round((qBankNb / qBankTotal) * 100) : 0;
  const qBankThPercent = qBankTotal > 0 ? Math.round((qBankTh / qBankTotal) * 100) : 0;
  const qBankVdPercent = qBankTotal > 0 ? Math.round((qBankVd / qBankTotal) * 100) : 0;
  const qBankVdcPercent = qBankTotal > 0 ? Math.round((qBankVdc / qBankTotal) * 100) : 0;

  const filteredQuestions = activeQuestionsList.filter((q) => {
    // 3 Category Tab filter
    if (resourceTab === 'my') {
      const isMy = q.authorType === 'my' || (!q.authorType && (q.authorName?.includes('Thủ') || q.authorName?.includes('Hoài') || !q.authorName));
      if (!isMy) return false;
    } else if (resourceTab === 'colleague') {
      const isColleague = q.authorType === 'colleague' || (q.authorType !== 'my' && !!q.authorName && !q.authorName.includes('Thủ') && !q.authorName.includes('Hoài'));
      if (!isColleague) return false;
    }

    const matchesSearch =
      q.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
      q.code.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesGrade = isQuestionMatchingGrade(q.grade, gradeFilter);
    const matchesSubject = subjectFilter === 'Tất cả các môn' || q.subject === subjectFilter;
    const matchesLevel = levelFilter === 'all' || q.level === levelFilter;
    const matchesLesson = lessonFilter === 'all' || q.lessonName === lessonFilter;
    const matchesType = matchesQuestionType(q.type, typeFilter);
    return matchesSearch && matchesGrade && matchesSubject && matchesLevel && matchesLesson && matchesType;
  });

  // Reset current page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, gradeFilter, subjectFilter, levelFilter, typeFilter, lessonFilter, resourceTab]);

  // Pagination calculations
  const totalQuestions = filteredQuestions.length;
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedQuestions = filteredQuestions.slice(startIndex, startIndex + pageSize);

  const handleImportPreset10Questions = () => {
    const presetQuestions: QuestionItem[] = [
      {
        id: `q-preset-1-${Date.now()}`,
        code: 'CH-TH3-01',
        subject: 'Tin học',
        grade: 'Khối 3',
        level: 'nhan_biet',
        type: 'multiple_choice',
        lessonName: 'Thông tin và quyết định',
        content: 'Thông tin thời tiết cho biết hôm nay trời sẽ mưa lớn. Theo em, em cần đưa ra quyết định nào sau đây là hợp lý nhất?',
        options: [
          'A. Mang theo áo mưa hoặc ô (dù).',
          'B. Rủ bạn ra sân trường đá bóng không cần che chắn.',
          'C. Mặc quần áo mỏng nhẹ và đi giày vải trắng.',
          'D. Không cần quan tâm đến thời tiết.'
        ],
        correctAnswer: 'A',
        explanation: 'Khi biết trời mưa lớn, quyết định mang theo áo mưa hoặc ô giúp tránh bị ướt và bảo vệ sức khỏe tốt nhất.'
      },
      {
        id: `q-preset-2-${Date.now()}`,
        code: 'CH-TH3-02',
        subject: 'Tin học',
        grade: 'Khối 3',
        level: 'thong_hieu',
        type: 'multiple_response',
        lessonName: 'Thông tin và quyết định',
        content: 'Đâu là những ví dụ cho thấy con người cần phải xử lý thông tin trước khi đưa ra quyết định? (Chọn các đáp án đúng)',
        options: [
          'A. Nhìn thấy đèn giao thông chuyển sang màu đỏ, em dừng xe lại.',
          'B. Nghe tiếng trống trường tập trung, các bạn học sinh xếp hàng vào lớp.',
          'C. Cầm một hòn đá nặng trên tay mà không suy nghĩ gì.',
          'D. Nhìn thấy biển báo "Trơn trượt", em đi chậm và cẩn thận hơn để tránh ngã.'
        ],
        correctAnswer: 'A, B, D',
        explanation: 'Nhìn đèn đỏ (xử lý thông tin đèn) dừng xe; nghe tiếng trống (xử lý thông tin âm thanh) xếp hàng; nhìn biển báo trơn trượt (xử lý thông tin hình ảnh) đi chậm đều là quyết định dựa trên xử lý thông tin.'
      },
      {
        id: `q-preset-3-${Date.now()}`,
        code: 'CH-TH3-03',
        subject: 'Tin học',
        grade: 'Khối 3',
        level: 'nhan_biet',
        type: 'true_false',
        lessonName: 'Thông tin và quyết định',
        content: 'Xác định tính Đúng hoặc Sai cho các phát biểu sau về thông tin và quyết định:',
        statements: [
          { statement: 'Thông tin thu nhận được từ thế giới xung quanh giúp con người đưa ra quyết định đúng đắn.', isCorrect: true, explanation: 'ĐÚNG. Thông tin chuẩn xác giúp chúng ta lựa chọn hành động tối ưu.' },
          { statement: 'Quyết định của chúng ta không cần phải dựa vào thông tin thực tế.', isCorrect: false, explanation: 'SAI. Quyết định không dựa vào thực tế khách quan rất dễ gặp sai lầm và nguy hiểm.' },
          { statement: 'Khi nghe tiếng còi xe cứu thương đang hú, quyết định nhường đường là một quyết định dựa trên thông tin âm thanh.', isCorrect: true, explanation: 'ĐÚNG. Tiếng còi xe cứu thương là nguồn thông tin âm thanh báo khẩn cấp để ta đưa ra quyết định nhường đường.' }
        ],
        correctAnswer: '1-Đúng, 2-Sai, 3-Đúng',
        explanation: 'Thông tin từ thế giới xung quanh đóng vai trò nền tảng giúp định hình và tối ưu hóa các quyết định thực tế.'
      },
      {
        id: `q-preset-4-${Date.now()}`,
        code: 'CH-TH3-04',
        subject: 'Tin học',
        grade: 'Khối 3',
        level: 'thong_hieu',
        type: 'fill_blank',
        lessonName: 'Thông tin và quyết định',
        content: 'Điền từ thích hợp vào chỗ trống: "Trước khi ra đường vào buổi trưa nắng gắt, em nhận được thông tin trời rất nắng nóng. Thông tin đó giúp em đưa ra quyết định mang theo mũ, áo chống nắng và uống đủ nước để bảo vệ..."',
        correctAnswer: 'sức khỏe',
        explanation: 'Cụm từ "bảo vệ sức khỏe" hoặc "bản thân" là phù hợp nhất để hoàn thành ý nghĩa câu hỏi sư phạm.'
      },
      {
        id: `q-preset-5-${Date.now()}`,
        code: 'CH-TH3-05',
        subject: 'Tin học',
        grade: 'Khối 3',
        level: 'thong_hieu',
        type: 'ordering',
        lessonName: 'Thông tin và quyết định',
        content: 'Em hãy sắp xếp các bước sau theo đúng thứ tự từ lúc nhận được thông tin đến khi đưa ra hành động/quyết định:',
        options: [
          'Thu nhận thông tin từ môi trường xung quanh (nhìn, nghe, sờ,...).',
          'Xử lý và suy nghĩ về thông tin vừa nhận được.',
          'Đưa ra quyết định (làm gì hoặc không làm gì).',
          'Thực hiện hành động theo quyết định.'
        ],
        correctAnswer: '1 -> 2 -> 3 -> 4',
        explanation: 'Quy trình xử lý hành vi con người: 1 (Thu nhận thông tin) -> 2 (Xử lý và suy nghĩ) -> 3 (Đưa ra quyết định) -> 4 (Thực hiện hành động).'
      },
      {
        id: `q-preset-6-${Date.now()}`,
        code: 'CH-TH3-06',
        subject: 'Tin học',
        grade: 'Khối 3',
        level: 'thong_hieu',
        type: 'matching',
        lessonName: 'Thông tin và quyết định',
        content: 'Nối tình huống ở cột A với quyết định tương ứng ở cột B:',
        matchingPairs: [
          { left: 'Thấy bài tập cô giao có câu hỏi khó chưa hiểu.', right: 'Nhờ thầy cô hoặc cha mẹ giải thích thêm.' },
          { left: 'Nhận được thông báo an toàn giao thông từ nhà trường.', right: 'Đội mũ bảo hiểm trước khi ngồi lên xe máy.' },
          { left: 'Nghe tiếng chuông báo thức reo vào buổi sáng.', right: 'Tắt chuông và thức dậy chuẩn bị đi học.' }
        ],
        correctAnswer: '1 - Nhờ thầy cô hoặc cha mẹ giải thích thêm; 2 - Đội mũ bảo hiểm trước khi ngồi lên xe máy; 3 - Tắt chuông và thức dậy chuẩn bị đi học',
        explanation: 'Bài tập khó nối với nhờ trợ giúp; thông báo an toàn nối với đội mũ bảo hiểm; chuông báo thức nối với thức dậy đi học.'
      },
      {
        id: `q-preset-7-${Date.now()}`,
        code: 'CH-TH3-07',
        subject: 'Tin học',
        grade: 'Khối 3',
        level: 'van_dung',
        type: 'classification',
        lessonName: 'Thông tin và quyết định',
        content: 'Hãy phân loại các hành động sau thành hai nhóm: Nhóm A (Quyết định đúng đắn dựa trên thông tin) và Nhóm B (Quyết định chưa phù hợp).',
        classificationGroups: ['Nhóm A (Quyết định đúng đắn dựa trên thông tin)', 'Nhóm B (Quyết định chưa phù hợp)'],
        classificationItems: [
          { name: 'Thấy biển báo "Khu vực nước sâu, nguy hiểm", Nam quyết định không xuống tắm hồ.', group: 'Nhóm A (Quyết định đúng đắn dựa trên thông tin)' },
          { name: 'Trời đang mưa to sấm chớp, Lan quyết định ra gốc cây đứng trú mưa.', group: 'Nhóm B (Quyết định chưa phù hợp)' },
          { name: 'Nhìn thấy đèn xanh, người đi bộ qua đường đúng phần đường quy định.', group: 'Nhóm A (Quyết định đúng đắn dựa trên thông tin)' },
          { name: 'Ngửi thấy mùi khét trong nhà bếp, Minh cứ tiếp tục đi ngủ không báo cho ai.', group: 'Nhóm B (Quyết định chưa phù hợp)' }
        ],
        correctAnswer: 'Nhóm A: a, c; Nhóm B: b, d',
        explanation: 'Trú mưa gốc cây rất nguy hiểm do dễ sét đánh; ngửi khét đi ngủ gây nguy cơ hỏa hoạn.'
      },
      {
        id: `q-preset-8-${Date.now()}`,
        code: 'CH-TH3-08',
        subject: 'Tin học',
        grade: 'Khối 3',
        level: 'van_dung',
        type: 'multiple_choice',
        lessonName: 'Thông tin và quyết định',
        content: 'Hà đang sử dụng máy tính thì màn hình bỗng xuất hiện bảng thông báo lỗi và máy bị đứng hình (đơ). Nếu là Hà, em sẽ đưa ra quyết định xử lý bước đầu như thế nào cho an toàn và hợp lý?',
        options: [
          'A. Tự ý dùng tuốc nơ vít tháo tung thùng máy tính ra xem bên trong.',
          'B. Lấy nước xịt trực tiếp vào màn hình để làm mát máy.',
          'C. Báo ngay cho thầy cô giáo hoặc người lớn biết để được hỗ trợ kiểm tra.',
          'D. Cố gắng đập mạnh vào bàn phím nhiều lần cho máy chạy lại.'
        ],
        correctAnswer: 'C',
        explanation: 'Khi thiết bị trường học hỏng, lựa chọn an toàn và thông minh nhất là báo thầy cô kỹ thuật hỗ trợ thay vì tự ý xử lý gây chập điện.'
      },
      {
        id: `q-preset-9-${Date.now()}`,
        code: 'CH-TH3-09',
        subject: 'Tin học',
        grade: 'Khối 3',
        level: 'van_dung_cao',
        type: 'essay',
        lessonName: 'Thông tin và quyết định',
        content: 'Đọc tình huống: "Em đang đi trong siêu thị thì vô tình bị lạc mất bố mẹ. Em nhớ lại thông tin bố mẹ đã dặn từ trước: \'Nếu bị lạc, hãy đứng yên tại chỗ hoặc tìm chú bảo vệ để nhờ trợ giúp\'." Dựa vào thông tin trên, quyết định sáng suốt nhất của em ngay lúc đó là gì?',
        correctAnswer: 'Đứng yên tại vị trí bị lạc để bố mẹ dễ tìm kiếm hoặc nhanh chóng tìm người hỗ trợ đồng phục bảo vệ để phát loa thông báo.',
        explanation: 'Bình tĩnh tuân theo chỉ dẫn định sẵn là phản xạ an toàn cực kỳ thiết yếu cho trẻ nhỏ khi lạc nơi công cộng.'
      },
      {
        id: `q-preset-10-${Date.now()}`,
        code: 'CH-TH3-10',
        subject: 'Tin học',
        grade: 'Khối 3',
        level: 'van_dung_cao',
        type: 'essay',
        lessonName: 'Thông tin và quyết định',
        content: 'Em hãy nêu một ví dụ thực tế trong cuộc sống hàng ngày ở trường học của em, trong đó cho thấy thông tin em nhận được đã giúp em đưa ra một quyết định chính xác để đảm bảo an toàn hoặc học tập tốt hơn.',
        correctAnswer: 'Ví dụ: Khi nghe tiếng trống trường báo giờ vào học, em dừng chơi đùa và xếp hàng nhanh chóng để vào lớp. Thông tin âm thanh giúp em chuẩn bị tư thế học tập đúng nội quy học đường.',
        explanation: 'Học sinh vận dụng liên hệ từ các tình huống đa giác quan (chuông báo, biển hiệu, lời nhắc nhở của thầy cô).'
      }
    ];

    setPreviewQuestions(presetQuestions);
    setQuickLessonName('Thông tin và quyết định');
    setQuickSubject('Tin học');
    setQuickGrade('Khối 3');
    setIsPreviewStep(true);
  };

  const handleStartCreateExam = async () => {
    let effectiveLessonName = quickLessonName.trim();
    if (!effectiveLessonName) {
      if (uploadedFileName) {
        effectiveLessonName = uploadedFileName.replace(/\.[^/.]+$/, "");
        setQuickLessonName(effectiveLessonName);
      } else if (quickSourceMode === 'standard') {
        effectiveLessonName = `Đề kiểm tra ${quickSubject} ${quickGrade}`;
        setQuickLessonName(effectiveLessonName);
      } else if (quickSourceMode === 'paste' && quickRawText.trim()) {
        effectiveLessonName = `Đề kiểm tra trích xuất môn ${quickSubject}`;
        setQuickLessonName(effectiveLessonName);
      } else {
        setLessonNameError(true);
        setGenerationError('Vui lòng nhập chủ đề đề thi hoặc tên bài học trước khi tạo đề.');
        return;
      }
    }
    setLessonNameError(false);
    setIsGenerating(true);
    setGenerationError(null);

    try {
      let generatedQuestions: QuestionItem[] = [];

      if (quickSourceMode === 'standard') {
        const standardTopicPrompt = `Đề kiểm tra ${quickExamType} môn ${quickSubject} ${quickGrade}. Chủ đề: ${effectiveLessonName}. Mức độ: ${quickLevelSelection === 'all3' ? 'Cả 3 mức độ (Nhận biết, Thông hiểu, Vận dụng)' : quickLevelSelection === 'all4' ? 'Cả 4 mức độ (Nhận biết, Thông hiểu, Vận dụng, Vận dụng cao)' : quickLevelSelection}. Số lượng: ${quickCount} câu hỏi chuẩn sư phạm bám sát chương trình GDPT 2018.`;
        generatedQuestions = await generateExamQuestionsAI(
          quickSubject,
          quickGrade,
          standardTopicPrompt,
          quickCount,
          undefined,
          TECHNOLOGY_GRADE3_FINAL_EXAM_BLUEPRINT
        );
      } else if (quickSourceMode === 'paste') {
        if (!quickRawText.trim()) {
          throw new Error('Vui lòng nhập hoặc dán nội dung đề mẫu vào ô văn bản.');
        }
        generatedQuestions = await generateExamQuestionsAI(
          quickSubject,
          quickGrade,
          quickRawText.trim(),
          quickCount
        );
      } else if (quickSourceMode === 'file') {
        if (!uploadedFileName && !uploadedFileContent && !uploadedFileBase64) {
          throw new Error('Vui lòng chọn hoặc kéo thả tệp PDF / Word / TXT / Excel để tạo đề.');
        }
        
        generatedQuestions = await generateExamQuestionsAI(
          quickSubject,
          quickGrade,
          effectiveLessonName,
          quickCount,
          {
            base64: uploadedFileBase64,
            mimeType: uploadedFileType || (uploadedFileName?.endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream'),
            name: uploadedFileName || 'Tài liệu đề thi',
            text: uploadedFileContent
          }
        );
      } else if (quickSourceMode === 'manual') {
        manualQuestionsList.forEach((mq, idx) => {
          const correctOpt = mq.options?.find(o => o.isCorrect);
          const newQ: QuestionItem = {
            id: `q-manual-${Date.now()}-${idx}`,
            code: `CH-${quickSubject.toUpperCase().slice(0, 3)}-${Date.now().toString().slice(-4)}-${idx + 1}`,
            subject: quickSubject,
            grade: quickGrade,
            level: (quickLevels[idx % quickLevels.length] || 'nhan_biet') as CognitiveLevel,
            type: mq.type as any,
            lessonName: effectiveLessonName || 'Bài 1: Ôn tập',
            content: mq.content || `Câu hỏi thủ công ${idx + 1}`,
            options: mq.options ? mq.options.map(o => `${o.label}. ${o.text}`) : undefined,
            correctAnswer: correctOpt ? correctOpt.label : (mq.type === 'essay' ? (mq.essayGuide || 'Gợi ý chấm tự luận') : 'A'),
            explanation: mq.explanation || 'Giải thích sư phạm cho câu hỏi.',
            statements: mq.tfStatements ? mq.tfStatements.map(st => ({ statement: st.statement, isCorrect: st.isTrue })) : undefined,
            classificationGroups: mq.classificationGroups,
            classificationItems: mq.classificationItems,
          };
          generatedQuestions.push(newQ);
        });
      }

      if (generatedQuestions.length > 0) {
        generatedQuestions.forEach(q => {
          q.lessonName = effectiveLessonName;
        });
        setPreviewQuestions(generatedQuestions);
        setIsPreviewStep(true);
      } else {
        throw new Error('Không có câu hỏi nào được tạo thành công.');
      }
    } catch (error: any) {
      console.error(error);
      setGenerationError(error.message || 'Có lỗi xảy ra trong quá trình tạo câu hỏi với AI.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleImportSampleExcel = async () => {
    const sampleImport: QuestionItem[] = [
      {
        id: `q-imp-${Date.now()}-1`,
        code: 'EXCEL-TOAN-01',
        subject: 'Toán',
        grade: 'Khối 3',
        level: 'nhan_biet',
        type: 'multiple_choice',
        lessonName: 'Phép cộng có nhớ trong phạm vi 1000',
        content: 'Kết quả của phép tính 125 + 342 là:',
        options: ['A. 467', 'B. 457', 'C. 477', 'D. 367'],
        correctAnswer: 'A',
        explanation: '125 + 342 = 467.'
      },
      {
        id: `q-imp-${Date.now()}-2`,
        code: 'EXCEL-TIN-01',
        subject: 'Tin học',
        grade: 'Khối 3',
        level: 'thong_hieu',
        type: 'multiple_choice',
        lessonName: 'Các bộ phận cơ bản của máy tính',
        content: 'Thiết bị nào sau đây dùng để hiển thị hình ảnh khi máy tính hoạt động?',
        options: ['A. Màn hình', 'B. Bàn phím', 'C. Chuột máy tính', 'D. Loa'],
        correctAnswer: 'A',
        explanation: 'Màn hình là thiết bị xuất hiển thị hình ảnh.'
      }
    ];

    if (onSaveQuestions) {
      await onSaveQuestions(sampleImport);
    } else {
      for (const q of sampleImport) {
        await onSaveQuestion(q);
      }
    }
    setIsImportModalOpen(false);
  };

  const handleExportExcel = () => {
    exportQuestionBankToExcel(questions, 'Ngan_Hang_Cau_Hoi_Truc_Khang_Chuan.xlsx');
  };

  const handleDownloadTemplate = () => {
    const subj = subjectFilter !== 'all' ? subjectFilter : 'Toán';
    const grd = gradeFilter !== 'Tất cả các khối' ? gradeFilter : 'Khối 3';
    downloadQuestionBankTemplate(subj, grd);
  };

  const getLevelBadge = (lvl: CognitiveLevel) => {
    return <CognitiveLevelBadge level={lvl} />;
  };

  return (
<>
    <div className="space-y-6">
      
      {/* Header */}
      <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-md text-xs font-medium bg-[#EEF2FF] text-[#4F46E5] border border-[#C7D2FE]">
              Phân Loại 4 Mức Độ Nhận Thức
            </span>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mt-1 font-heading">
            Phân Hệ Ngân Hàng Câu Hỏi Sư Phạm
          </h2>
          <p className="text-sm text-gray-500 mt-0.5 max-w-4xl leading-relaxed">
            Lưu trữ, lọc theo môn học, phân loại Nhận biết - Thông hiểu - Vận dụng - VD Cao
          </p>
        </div>
      </div>

      {/* 3 Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          variant="blue"
          title="Tổng câu hỏi trong ngân hàng"
          value={`${activeQuestionsList.length} Câu hỏi`}
          subtext="Dữ liệu động từ hệ thống"
          icon={Database}
        />

        <StatCard
          variant="green"
          title="Phân bố theo mức độ"
          value={`${qBankNbPercent}% / ${qBankThPercent}% / ${qBankVdPercent}% / ${qBankVdcPercent}%`}
          subtext="Nhận biết / Thông hiểu / Vận dụng / VD cao"
          icon={Sliders}
        />

        <StatCard
          variant="purple"
          title="Câu hỏi của tôi vs đồng nghiệp"
          value={`${myQuestionsCount} / ${colleagueQuestionsCount} Câu hỏi`}
          subtext="Của tôi / Đồng nghiệp đóng góp"
          icon={Users}
        />
      </div>

      {/* 3 Resource Tabs & Action Buttons Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-gray-200 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setResourceTab('all')}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
              resourceTab === 'all'
                ? 'bg-[#4F46E5] text-white shadow-xs'
                : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
            }`}
          >
            <BookOpen className="w-4 h-4" /> Tất cả câu hỏi ({allQuestionsCount})
          </button>

          <button
            onClick={() => setResourceTab('my')}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
              resourceTab === 'my'
                ? 'bg-[#4F46E5] text-white shadow-xs'
                : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
            }`}
          >
            <UserCheck className="w-4 h-4" /> Câu hỏi của tôi ({myQuestionsCount})
          </button>

          <button
            onClick={() => setResourceTab('colleague')}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
              resourceTab === 'colleague'
                ? 'bg-[#4F46E5] text-white shadow-xs'
                : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
            }`}
          >
            <Users className="w-4 h-4" /> Câu hỏi của đồng nghiệp ({colleagueQuestionsCount})
          </button>
        </div>

        {userRole !== 'student' && (
          <div className="flex items-center gap-2.5 shrink-0 self-end sm:self-auto">
            <button
              onClick={() => {
                setEditingQuestions(undefined);
                setEditingLessonName(undefined);
                setEditingGrade(undefined);
                setEditingSubject(undefined);
                setIsManualModalOpen(true);
              }}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs sm:text-sm font-semibold shadow-md shadow-emerald-200/50 flex items-center gap-1.5 transition-all cursor-pointer shrink-0"
            >
              <PenTool className="w-4 h-4 text-emerald-100" />
              <span>Tạo câu hỏi thủ công</span>
            </button>

            <button
              onClick={() => {
                setIsModalOpen(true);
                setQuickSourceMode('paste');
              }}
              className="px-4 py-2 bg-[#7C3AED] hover:bg-[#6D28D9] text-white rounded-xl text-xs sm:text-sm font-semibold shadow-md shadow-purple-200/50 flex items-center gap-1.5 transition-all cursor-pointer shrink-0"
            >
              <Sparkles className="w-4 h-4 text-amber-300" />
              <span>Tạo câu hỏi với AI</span>
            </button>
          </div>
        )}
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Tìm kiếm theo từ khóa hoặc mã CH..."
            className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-50 font-normal text-gray-900"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
          
          <select
            value={gradeFilter}
            onChange={(e) => {
              setGradeFilter(e.target.value);
              setLessonFilter('all');
            }}
            className="px-3 py-2 text-sm rounded-xl border border-gray-200 bg-gray-50 font-medium text-gray-800 cursor-pointer"
          >
            <option value="Tất cả các khối">Tất cả các khối</option>
            {GRADES.map(grade => <option key={grade} value={grade}>{grade}</option>)}
          </select>
          <select
            value={subjectFilter}
            onChange={(e) => {
              setSubjectFilter(e.target.value);
              setLessonFilter('all');
            }}
            className="px-3 py-2 text-sm rounded-xl border border-gray-200 bg-gray-50 font-medium text-gray-800 cursor-pointer"
          >
            <option value="Tất cả các môn">Tất cả các môn</option>
            {SUBJECTS.map(subject => <option key={subject} value={subject}>{subject}</option>)}
          </select>
          <select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
            className="px-3 py-2 text-sm rounded-xl border border-gray-200 bg-gray-50 font-medium text-gray-800 cursor-pointer"
          >
            <option value="all">Tất cả mức độ</option>
            <option value="nhan_biet">Nhận biết</option>
            <option value="thong_hieu">Thông hiểu</option>
            <option value="van_dung">Vận dụng</option>
            <option value="van_dung_cao">Vận dụng cao</option>
          </select>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-3 py-2 text-sm rounded-xl border border-gray-200 bg-gray-50 font-medium text-gray-800 cursor-pointer"
          >
            <option value="all">Tất cả Loại câu hỏi</option>
            {QUESTION_TYPES.map(qt => (
              <option key={qt.id} value={qt.id}>{qt.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Header Bar - Hiển thị X / Y câu hỏi & Nút Xóa Hàng Loạt / Xóa Tất Cả */}
      <div className="bg-white px-5 py-3.5 rounded-2xl border border-gray-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-3 cursor-pointer select-none text-sm font-medium text-gray-700">
          <input
            type="checkbox"
            checked={filteredQuestions.length > 0 && filteredQuestions.every(q => selectedQuestionIds.includes(q.id))}
            onChange={() => {
              const allFilteredSelected = filteredQuestions.length > 0 && filteredQuestions.every(q => selectedQuestionIds.includes(q.id));
              if (allFilteredSelected) {
                const filteredIds = new Set(filteredQuestions.map(q => q.id));
                setSelectedQuestionIds(prev => prev.filter(id => !filteredIds.has(id)));
              } else {
                const newSelected = Array.from(new Set([...selectedQuestionIds, ...filteredQuestions.map(q => q.id)]));
                setSelectedQuestionIds(newSelected);
              }
            }}
            className="w-4 h-4 rounded text-[#4F46E5] border-gray-300 focus:ring-[#4F46E5] cursor-pointer"
          />
          <span className="text-gray-600">
            Hiển thị <strong className="text-gray-900 font-semibold">{filteredQuestions.length}</strong> / {activeQuestionsList.length} câu hỏi
          </span>
        </label>

        <div className="flex items-center gap-2 flex-wrap">
          {selectedQuestionIds.length > 0 ? (
            <button
              onClick={() => handleTriggerBatchDelete('selected')}
              className="px-3.5 py-1.5 text-white bg-red-600 hover:bg-red-700 active:scale-95 border border-red-700 rounded-xl font-semibold shadow-xs transition-all text-xs sm:text-sm cursor-pointer flex items-center gap-1.5"
            >
              <Trash2 className="w-4 h-4" />
              <span>Xóa {selectedQuestionIds.length} câu đã chọn</span>
            </button>
          ) : (
            filteredQuestions.length > 0 && userRole !== 'student' && (
              <button
                onClick={() => handleTriggerBatchDelete('all')}
                className="px-3.5 py-1.5 text-red-600 hover:text-white bg-red-50 hover:bg-red-600 active:scale-95 border border-red-200 hover:border-red-600 rounded-xl font-semibold shadow-2xs transition-all text-xs sm:text-sm cursor-pointer flex items-center gap-1.5 group"
                title="Xóa toàn bộ câu hỏi đang hiển thị theo bộ lọc"
              >
                <Trash2 className="w-4 h-4 text-red-600 group-hover:text-white transition-colors" />
                <span>Xóa tất cả ({filteredQuestions.length} câu)</span>
              </button>
            )
          )}

          {selectedQuestionIds.length > 0 && (
            <button
              onClick={() => {
                const selectedList = filteredQuestions.filter(q => selectedQuestionIds.includes(q.id));
                const grade = selectedList[0]?.grade;
                const subject = selectedList[0]?.subject;
                setSharingQuestion({
                  id: `batch-${Date.now()}`,
                  title: `Bộ ${selectedQuestionIds.length} câu hỏi ôn tập chuyên môn`,
                  grade,
                  subject
                });
              }}
              className="px-3.5 py-1.5 text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded-xl font-medium transition-all text-xs sm:text-sm cursor-pointer flex items-center gap-1.5"
            >
              <Share2 className="w-4 h-4" /> Chia sẻ bộ ({selectedQuestionIds.length})
            </button>
          )}
        </div>
      </div>

      {/* Question Card List (Non-Column Layout) */}
      <div className="space-y-3">
        {paginatedQuestions.map((rawQ) => {
          const q = cleanQuestionMath(rawQ);
          const isExpanded = expandedQuestionIds.includes(q.id);
          const isSelected = selectedQuestionIds.includes(q.id);
          const subjColor = getSubjectColorStyles(q.subject);

          return (
            <div
              key={q.id}
              className={`bg-white rounded-2xl border border-gray-200 ${subjColor.cardBorderHover} p-5 shadow-xs transition-all space-y-3`}
            >
              {/* Dòng tiêu đề đầu thẻ - Cấp 4: 12-13px (text-xs), font-medium */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => handleToggleSelectQuestion(q.id)}
                    className="w-4 h-4 rounded text-[#4F46E5] border-gray-300 focus:ring-[#4F46E5] cursor-pointer"
                  />
                  {/* Mã câu hỏi */}
                  <span className="px-2.5 py-0.5 rounded-md text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200 tracking-wide">
                    {q.code || 'CH-001'}
                  </span>
                  {/* Nhãn loại câu hỏi */}
                  <span className="px-2.5 py-0.5 rounded-md text-xs font-medium bg-[#EEF2FF] text-[#4F46E5] border border-[#C7D2FE]">
                    {q.type === 'multiple_choice' ? 'Lựa chọn' : getQuestionTypeLabel(q.type)}
                  </span>
                  {/* Nhãn Môn & Khối - Dynamic Subject Color */}
                  {q.subject && (
                    <span className={`px-2.5 py-0.5 rounded-md text-xs font-bold uppercase ${subjColor.badgeClass}`}>
                      {q.subject} {q.grade ? `• ${q.grade}` : ''}
                    </span>
                  )}
                  {/* Nhãn mức độ */}
                  <CognitiveLevelBadge level={q.level} />
                </div>

                {/* Cụm nút thao tác nhanh - chỉ hiển thị cho chủ sở hữu hoặc admin */}
                {isQuestionOwner(q) && (
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      title="Chỉnh sửa câu hỏi"
                      onClick={() => handleEditQuestion(q)}
                      className="p-1.5 rounded-lg border border-[#C7D2FE] bg-[#EEF2FF] text-[#4F46E5] hover:bg-indigo-100 transition-colors cursor-pointer"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      title="Nhân bản câu hỏi"
                      onClick={() => handleDuplicateQuestion(q)}
                      className="p-1.5 rounded-lg border border-[#BAE6FD] bg-[#F0F9FF] text-[#0284C7] hover:bg-sky-100 transition-colors cursor-pointer"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                    <button
                      title="Chia sẻ câu hỏi"
                      onClick={() => setSharingQuestion({
                        id: q.id,
                        title: q.content,
                        grade: q.grade,
                        subject: q.subject
                      })}
                      className="p-1.5 rounded-lg border border-sky-200 bg-sky-50 text-sky-600 hover:bg-sky-100 transition-colors cursor-pointer"
                    >
                      <Share2 className="w-4 h-4" />
                    </button>
                    <button
                      title="Xóa câu hỏi"
                      onClick={() => setDeletingQuestion(q)}
                      className="p-1.5 rounded-lg border border-[#FECACA] bg-[#FEF2F2] text-[#DC2626] hover:bg-rose-100 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              {/* Dòng nội dung câu hỏi chính - Cấp 2: 16px (text-base), font-medium */}
              <div className="text-base font-medium text-gray-900 leading-relaxed pl-7">
                {q.content}
              </div>

              {/* Nút mở rộng/thu gọn câu trả lời - Cấp 3: 14px (text-sm), font-medium */}
              <div className="pl-7">
                <button
                  onClick={() => handleToggleExpand(q.id)}
                  className="inline-flex items-center gap-1 text-sm font-medium text-[#4F46E5] hover:text-[#4338CA] cursor-pointer select-none transition-colors group"
                >
                  <span>{isExpanded ? 'Thu nhỏ câu trả lời' : 'Duyệt trước câu trả lời'}</span>
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-[#4F46E5] transition-transform" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-[#4F46E5] transition-transform group-hover:translate-x-0.5" />
                  )}
                </button>
              </div>

              {/* Phần mở rộng hiển thị chi tiết các phương án & giải thích - Cấp 3: 14px (text-sm), font-normal/medium */}
              {isExpanded && (
                <div className="pt-3 border-t border-slate-100 space-y-3 pl-7">
                  <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                    ĐÁP ÁN VÀ TÙY CHỌN:
                  </div>

                  {/* Options List */}
                  {q.options && q.options.length > 0 && q.type !== 'fill_blank' && q.type !== 'essay' && q.type !== 'ordering' && q.type !== 'sắp xếp' && q.type !== 'sap_xep' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {q.options.map((opt, optIndex) => {
                        const labelMatch = opt.match(/^([A-D])\.\s*(.*)/i);
                        const label = labelMatch
                          ? labelMatch[1].toUpperCase()
                          : ['A', 'B', 'C', 'D'][optIndex] || String.fromCharCode(65 + optIndex);
                        const text = labelMatch ? labelMatch[2] : opt;

                        const isMultiple = isMultipleResponse(q.type);
                        const correctLetters = (q.correctAnswer || '').toUpperCase();
                        const isCorrect = isMultiple
                          ? correctLetters.includes(label)
                          : ((q.correctAnswer &&
                              (q.correctAnswer.toUpperCase().split(/[,;\s]+/).includes(label) ||
                                opt.trim().startsWith(q.correctAnswer.trim()) ||
                                q.correctAnswer.trim() === label)) ||
                            false);

                        return (
                          <div
                            key={optIndex}
                            className={`rounded-2xl border px-4 py-3 flex items-center justify-between gap-3 text-sm transition-all ${
                              isCorrect
                                ? 'border-[#86EFAC] bg-[#F0FDF4] text-[#166534] font-medium shadow-2xs'
                                : 'border-gray-200 bg-white text-gray-700 font-normal'
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <span
                                className={`w-6 h-6 ${isMultiple ? 'rounded-md' : 'rounded-full'} font-medium text-xs flex items-center justify-center flex-shrink-0 ${
                                  isCorrect ? 'bg-[#16A34A] text-white' : 'bg-gray-100 text-gray-600'
                                }`}
                              >
                                {isMultiple && isCorrect ? <Check className="w-3.5 h-3.5" /> : label}
                              </span>
                              <span className="truncate">{text}</span>
                            </div>
                            {isCorrect && (
                              <CheckCircle2 className="w-5 h-5 text-[#16A34A] flex-shrink-0" />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* True / False */}
                  {q.type === 'true_false' && (
                    q.statements && q.statements.length > 0 ? (
                      <div className="space-y-2 pt-1 border border-slate-200 rounded-xl overflow-hidden bg-white">
                        <table className="w-full text-left border-collapse text-sm">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold">
                              <th className="p-2.5 border-r border-slate-200">Nhận định</th>
                              <th className="p-2.5 w-24 text-center">Đúng / Sai</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200">
                            {q.statements.map((st, sIdx) => (
                              <tr key={sIdx}>
                                <td className="p-2.5 border-r border-slate-200 font-normal text-slate-800">
                                  {sIdx + 1}. {st.statement}
                                </td>
                                <td className="p-2.5 text-center align-middle font-medium">
                                  {st.isCorrect ? (
                                    <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded text-xs font-medium">ĐÚNG</span>
                                  ) : (
                                    <span className="px-2.5 py-1 bg-rose-100 text-rose-800 rounded text-xs font-medium">SAI</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-3">
                        <div
                          className={`rounded-2xl border p-3 flex items-center justify-between text-sm ${
                            q.correctAnswer === 'A' || q.correctAnswer?.toLowerCase().includes('đúng')
                              ? 'border-[#86EFAC] bg-[#F0FDF4] text-[#166534] font-medium'
                              : 'border-gray-200 bg-white text-gray-700 font-normal'
                          }`}
                        >
                          <span>A. Đúng</span>
                          {(q.correctAnswer === 'A' || q.correctAnswer?.toLowerCase().includes('đúng')) && (
                            <CheckCircle2 className="w-4 h-4 text-[#16A34A]" />
                          )}
                        </div>
                        <div
                          className={`rounded-2xl border p-3 flex items-center justify-between text-sm ${
                            q.correctAnswer === 'B' || q.correctAnswer?.toLowerCase().includes('sai')
                              ? 'border-[#86EFAC] bg-[#F0FDF4] text-[#166534] font-medium'
                              : 'border-gray-200 bg-white text-gray-700 font-normal'
                          }`}
                        >
                          <span>B. Sai</span>
                          {(q.correctAnswer === 'B' || q.correctAnswer?.toLowerCase().includes('sai')) && (
                            <CheckCircle2 className="w-4 h-4 text-[#16A34A]" />
                          )}
                        </div>
                      </div>
                    )
                  )}

                  {/* Fill blank */}
                  {q.type === 'fill_blank' && (
                    <div className="bg-[#FFFBEB] border border-[#FDE68A] p-3.5 rounded-xl text-sm flex items-center gap-2">
                      <span className="font-medium text-[#92400E]">Từ khóa / Đáp án cần điền:</span>
                      <span className="px-3 py-1 px-3 py-1 bg-white border border-[#FDE68A] font-medium text-[#166534] rounded-lg shadow-2xs">
                        {q.correctAnswer || (q.options ? q.options[0] : 'Chưa có đáp án')}
                      </span>
                    </div>
                  )}

                  {/* Essay */}
                  {q.type === 'essay' && (
                    <div className="bg-gray-50 border border-gray-200 p-3.5 rounded-xl text-sm">
                      <div className="font-medium text-gray-800 mb-1">Dàn ý & Tiêu chí chấm tự luận:</div>
                      <p className="text-gray-600 leading-relaxed whitespace-pre-line font-normal">
                        {q.correctAnswer || q.explanation || 'Giáo viên chấm điểm dựa trên mức độ hoàn thành và tính sáng tạo của học sinh.'}
                      </p>
                    </div>
                  )}

                  {/* Matching / Nối cặp */}
                  {((q.type === 'matching' || q.type === 'nối cặp' || q.type === 'noi_cap' || (q.matchingPairs && q.matchingPairs.length > 0)) && (!q.statements || q.statements.length === 0)) && q.matchingPairs && (
                    <div className="space-y-4 pt-1">
                      {/* Badge Dạng câu hỏi */}
                      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-[11px] font-black uppercase tracking-wider">
                        <span>DẠNG: KÉO THẢ NỐI (MATCHING)</span>
                      </div>

                      {/* Hai cột hiển thị song song (Cột A & Cột B) */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Cột A */}
                        <div className="bg-[#FFFBEB]/40 border-2 border-dashed border-[#FCD34D] rounded-2xl p-4 space-y-3">
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FEF3C7] border border-[#FDE68A] text-[#92400E] text-[10px] font-black uppercase tracking-wider">
                            <span>📌 CỘT A (CHỌN ĐỂ NỐI)</span>
                          </span>
                          <div className="space-y-2">
                            {q.matchingPairs.map((pair, pIdx) => (
                              <div key={pIdx} className="p-3 bg-white border border-slate-200 rounded-xl flex items-center justify-between gap-3 text-xs shadow-xs">
                                <span className="font-semibold text-slate-800">{pIdx + 1}. {pair.left}</span>
                                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                  ✓ Đã nối: {pair.right}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Cột B */}
                        <div className="bg-[#EFF6FF]/40 border-2 border-dashed border-[#93C5FD] rounded-2xl p-4 space-y-3">
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#DBEAFE] border border-[#BFDBFE] text-[#1E40AF] text-[10px] font-black uppercase tracking-wider">
                            <span>🎯 CỘT B (BẤM ĐỂ GHÉP VỀ)</span>
                          </span>
                          <div className="space-y-2">
                            {q.matchingPairs.map((pair, pIdx) => (
                              <div key={pIdx} className="p-3 bg-white border border-slate-200 rounded-xl flex items-center justify-between gap-3 text-xs shadow-xs">
                                <span className="font-semibold text-slate-800">{String.fromCharCode(97 + pIdx)}. {pair.right}</span>
                                <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                                  ✓ ĐƯỢC NỐI TỪ: {pair.left}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Khối CÁC CẶP GHÉP NỐI HIỆN TẠI */}
                      <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
                        <div className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                          <span>🔗</span>
                          <span>CÁC CẶP GHÉP NỐI HIỆN TẠI:</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                          {q.matchingPairs.map((pair, pIdx) => (
                            <div key={pIdx} className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs flex items-center justify-between gap-2">
                              <span className="font-bold text-indigo-900 truncate">{pair.left}</span>
                              <span className="text-indigo-600 font-bold shrink-0">→</span>
                              <span className="font-bold text-emerald-900 truncate">{pair.right}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Khối BẢNG ĐÁP ÁN CHUẨN */}
                      <div className="bg-[#F0FDF4] border border-[#DCFCE7] rounded-2xl p-4 space-y-3">
                        <div className="text-xs font-black text-[#166534] flex items-center gap-1">
                          <span>✓</span>
                          <span>BẢNG ĐÁP ÁN CHUẨN (MATCHING ANSWER KEY):</span>
                        </div>
                        <div className="overflow-hidden border border-[#DCFCE7] rounded-xl bg-white">
                          <table className="w-full text-left border-collapse text-xs">
                            <thead>
                              <tr className="bg-emerald-50 border-b border-[#DCFCE7] text-[#166534] font-bold">
                                <th className="p-2.5 border-r border-[#DCFCE7] w-12 text-center">STT</th>
                                <th className="p-2.5 border-r border-[#DCFCE7]">Cột A (Nội dung)</th>
                                <th className="p-2.5">Cột B (Đáp án tương ứng)</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-emerald-100">
                              {q.matchingPairs.map((pair, pIdx) => (
                                <tr key={pIdx}>
                                  <td className="p-2.5 border-r border-emerald-100 text-center font-bold text-emerald-800">
                                    {pIdx + 1}
                                  </td>
                                  <td className="p-2.5 border-r border-emerald-100 font-medium text-slate-800">
                                    {pair.left}
                                  </td>
                                  <td className="p-2.5 font-bold text-[#166534]">
                                    {pair.right}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Classification */}
                  {(q.type === 'classification' || q.type === 'phân loại' || q.type === 'phan_loai') && (
                    <div className="space-y-4 pt-1">
                      {/* Badge Dạng câu hỏi */}
                      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-[11px] font-black uppercase tracking-wider">
                        <span>DẠNG: GHÉP NHÓM (CATEGORIZATION)</span>
                      </div>

                      {/* 2 Khung nhóm hiển thị side-by-side */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {(q.classificationGroups || ['Nhóm 1', 'Nhóm 2']).map((groupName, gIdx) => {
                          const bgClass = gIdx === 0 ? 'bg-[#FFFBEB]/40 border-[#FCD34D]' : 'bg-[#EFF6FF]/40 border-[#93C5FD]';
                          const badgeClass = gIdx === 0 ? 'bg-[#FEF3C7] border-[#FDE68A] text-[#92400E]' : 'bg-[#DBEAFE] border-[#BFDBFE] text-[#1E40AF]';
                          const emoji = gIdx === 0 ? '🌿' : '⚙️';
                          
                          return (
                            <div key={gIdx} className={`border-2 border-dashed rounded-2xl p-4 flex flex-col items-center justify-center text-center min-h-[140px] ${bgClass}`}>
                              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-[10px] font-black uppercase tracking-wider mb-3 ${badgeClass}`}>
                                <span>{emoji} {groupName.toUpperCase()}</span>
                              </span>
                              <div className="text-slate-400 text-xs italic font-medium">
                                Bấm phân nhóm vật phẩm bên dưới...
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Danh sách vật phẩm chờ xếp nhóm */}
                      <div className="space-y-2.5">
                        <div className="text-xs font-black text-slate-500 uppercase tracking-wider">
                          Vật phẩm chờ xếp nhóm:
                        </div>
                        <div className="space-y-2">
                          {(q.classificationItems || []).map((item, iIdx) => (
                            <div key={iIdx} className="p-3 bg-white border border-slate-200 rounded-xl flex items-center justify-between gap-3 text-xs shadow-xs">
                              <span className="font-semibold text-slate-800">{item.name}</span>
                              <div className="flex items-center gap-2">
                                {(q.classificationGroups || ['Nhóm 1', 'Nhóm 2']).map((groupName, gIdx) => {
                                  const isCorrectGroup = item.group === groupName;
                                  const emoji = gIdx === 0 ? '🌿' : '⚙️';
                                  const btnClass = isCorrectGroup
                                    ? gIdx === 0 
                                      ? 'bg-[#FEF3C7] border-[#FCD34D] text-[#92400E] font-black ring-2 ring-[#FEF3C7]' 
                                      : 'bg-[#DBEAFE] border-[#93C5FD] text-[#1E40AF] font-black ring-2 ring-[#DBEAFE]'
                                    : 'bg-white border-slate-200 text-slate-400 hover:bg-slate-50';
                                  
                                  return (
                                    <span
                                      key={gIdx}
                                      className={`px-3 py-1.5 rounded-lg border text-[10px] uppercase tracking-wider transition-all flex items-center gap-1 ${btnClass}`}
                                    >
                                      <span>{emoji} + {groupName.split(' ')[0] || groupName}</span>
                                    </span>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Đáp án chuẩn phân loại */}
                      <div className="bg-[#F0FDF4] border border-[#DCFCE7] rounded-2xl p-4 space-y-3">
                        <div className="text-xs font-black text-[#166534] flex items-center gap-1">
                          <span>✓</span>
                          <span>ĐÁP ÁN CHUẨN PHÂN LOẠI:</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {(q.classificationGroups || ['Nhóm 1', 'Nhóm 2']).map((groupName, gIdx) => {
                            const groupItems = (q.classificationItems || []).filter(item => item.group === groupName);
                            const emoji = gIdx === 0 ? '🌿' : '⚙️';
                            
                            return (
                              <div key={gIdx} className="bg-white/80 p-3.5 rounded-xl border border-[#DCFCE7] space-y-1.5 text-xs">
                                <span className="font-extrabold text-[#15803D] uppercase tracking-wider flex items-center gap-1">
                                  <span>{emoji} {groupName}:</span>
                                </span>
                                <div className="font-semibold text-slate-700 leading-relaxed">
                                  {groupItems.length > 0 
                                    ? groupItems.map(item => item.name).join(', ') 
                                    : 'Không có vật phẩm nào thuộc nhóm này.'}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Ordering / Sắp xếp thứ tự */}
                  {(q.type === 'ordering' || q.type === 'sắp xếp' || q.type === 'sap_xep' || q.type === 'sắp xếp thứ tự') && (
                    <div className="space-y-4 pt-1">
                      {/* Badge Dạng câu hỏi */}
                      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-[11px] font-black uppercase tracking-wider">
                        <span>DẠNG: SẮP XẾP THỨ TỰ ĐÚNG (ORDERING)</span>
                      </div>

                      {/* Khối BẢNG ĐÁP ÁN CHUẨN SẮP XẾP */}
                      <div className="bg-[#F0FDF4] border border-[#DCFCE7] rounded-2xl p-4 space-y-3">
                        <div className="text-xs font-black text-[#166534] flex items-center gap-1">
                          <span>✓</span>
                          <span>THỨ TỰ CÁC BƯỚC CHUẨN (CORRECT SEQUENCE):</span>
                        </div>
                        <div className="space-y-2">
                          {getCorrectOrderingSequence(q).map((opt, oIdx) => (
                            <div key={oIdx} className="p-3 bg-white border border-[#DCFCE7] rounded-xl flex items-center gap-3 text-xs shadow-2xs">
                              <span className="w-6 h-6 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-black shrink-0 text-xs">
                                {oIdx + 1}
                              </span>
                              <span className="font-semibold text-slate-800">{opt}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Hướng dẫn sư phạm / Giải thích */}
                  <div className="bg-[#F0F9FF] border border-[#BAE6FD] rounded-xl p-3.5 flex items-start gap-2.5 text-sm text-gray-700 leading-relaxed font-normal">
                    <Info className="w-5 h-5 text-[#0284C7] flex-shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-[#0369A1] font-medium">Hướng dẫn sư phạm: </strong>
                      <span>
                        {q.explanation ||
                          `Hãy tích câu hỏi này vào bộ đề thi kiểm tra định kỳ hoặc gửi nhanh cho học sinh làm bài tập về nhà để đánh giá năng lực mức độ ${
                            q.level === 'nhan_biet' ? 'Dễ' : q.level === 'thong_hieu' ? 'Trung bình' : 'Khó'
                          }.`}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {filteredQuestions.length === 0 && (
          <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center text-gray-500 text-sm font-medium space-y-2">
            <Database className="w-8 h-8 text-gray-300 mx-auto" />
            <p>Không tìm thấy câu hỏi nào phù hợp với bộ lọc tìm kiếm hiện tại.</p>
          </div>
        )}

        {filteredQuestions.length > 0 && (
          <div className="bg-white px-5 py-3.5 rounded-2xl border border-gray-200 shadow-xs">
            <PaginationControl
              currentPage={currentPage}
              pageSize={pageSize}
              totalItems={filteredQuestions.length}
              onPageChange={setCurrentPage}
              onPageSizeChange={setPageSize}
              pageSizeOptions={[10, 20, 50]}
              itemLabel="câu hỏi"
              className="border-t-0 pt-0"
            />
          </div>
        )}
      </div>
    </div>

    {/* Modal AI Question Generation */}
    <QuestionAiModal
      isOpen={isModalOpen}
      onClose={handleCloseModal}
      quickLessonName={quickLessonName}
      setQuickLessonName={setQuickLessonName}
      quickGrade={quickGrade}
      setQuickGrade={setQuickGrade}
      quickSubject={quickSubject}
      setQuickSubject={setQuickSubject}
      quickExamType={quickExamType}
      setQuickExamType={setQuickExamType}
      quickLevelSelection={quickLevelSelection}
      setQuickLevelSelection={setQuickLevelSelection}
      quickSourceMode={quickSourceMode}
      setQuickSourceMode={setQuickSourceMode}
      quickCount={quickCount}
      setQuickCount={setQuickCount}
      quickRawText={quickRawText}
      setQuickRawText={setQuickRawText}
      uploadedFileName={uploadedFileName}
      setUploadedFileName={setUploadedFileName}
      setUploadedFileContent={setUploadedFileContent}
      uploadedFileBase64={uploadedFileBase64}
      setUploadedFileBase64={setUploadedFileBase64}
      uploadedFileType={uploadedFileType}
      setUploadedFileType={setUploadedFileType}
      lessonNameError={lessonNameError}
      setLessonNameError={setLessonNameError}
      isGenerating={isGenerating}
      isSaving={isSaving}
      saveError={saveError}
      onDownloadBackup={handleDownloadBackup}
      generationError={generationError}
      isPreviewStep={isPreviewStep}
      setIsPreviewStep={setIsPreviewStep}
      previewQuestions={previewQuestions}
      handleStartCreateExam={handleStartCreateExam}
      handleConfirmSave={handleConfirmSave}
      GRADES={GRADES}
      SUBJECTS={SUBJECTS}
      EXAM_TYPES={EXAM_TYPES}
      blueprint={TECHNOLOGY_GRADE3_FINAL_EXAM_BLUEPRINT}
    />

      {/* IMPORT EXCEL MODAL */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold text-slate-900 font-heading flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-emerald-600" /> Nhập Danh Sách Câu Hỏi Từ Excel
              </h3>
              <button
                onClick={() => setIsImportModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Nhập hàng loạt câu hỏi trắc nghiệm & tự luận vào ngân hàng dữ liệu theo định dạng Excel (.xlsx) chuẩn Dạy & Học Số PK Trực Khang.
            </p>

            <div className="bg-amber-50 p-3 rounded-xl border border-amber-200 flex items-center justify-between gap-2">
              <div className="text-xs text-amber-900 font-medium">
                Chưa có file mẫu Excel chuẩn?
              </div>
              <button
                onClick={handleDownloadTemplate}
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer active:scale-95 shadow-2xs"
              >
                <Download className="w-3.5 h-3.5" /> Tải mẫu .xlsx
              </button>
            </div>

            <div
              onClick={handleImportSampleExcel}
              className="border-2 border-dashed border-emerald-200 rounded-2xl p-6 text-center bg-emerald-50/50 space-y-2 cursor-pointer hover:bg-emerald-50 transition-colors"
            >
              <Upload className="w-8 h-8 text-emerald-600 mx-auto" />
              <div className="text-xs font-bold text-slate-800">
                Kéo thả file Excel (.xlsx) hoặc bấm để nạp dữ liệu mẫu
              </div>
              <p className="text-[10px] text-slate-500 font-medium">
                Hỗ trợ định dạng chuẩn: .xlsx (Microsoft Excel 2007+)
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setIsImportModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg cursor-pointer"
              >
                Đóng
              </button>
              <button
                onClick={handleImportSampleExcel}
                className="px-5 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-sm cursor-pointer active:scale-95"
              >
                Nạp Dữ Liệu Mẫu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL SOẠN ĐỀ THỦ CÔNG */}
      <ManualQuestionBankModal
        isOpen={isManualModalOpen}
        onClose={() => setIsManualModalOpen(false)}
        onSaveQuestions={handleSaveManualQuestions}
        initialQuestions={editingQuestions}
        initialLessonName={editingLessonName}
        initialGrade={editingGrade}
        initialSubject={editingSubject}
      />

      {/* MODAL CHIA SẺ CÂU HỎI */}
      <ShareContentModal
        isOpen={!!sharingQuestion}
        onClose={() => setSharingQuestion(null)}
        contentType="question"
        content={sharingQuestion ? {
          id: sharingQuestion.id,
          title: sharingQuestion.title,
          grade: sharingQuestion.grade,
          subject: sharingQuestion.subject
        } : null}
        onConfirmShare={(payload) => {
          alert("Đã chia sẻ thành công câu hỏi: " + payload.title);
          setSharingQuestion(null);
        }}
      />

      {/* MODAL XÁC NHẬN XÓA CÂU HỎI ĐƠN */}
      <ConfirmDeleteModal
        isOpen={!!deletingQuestion}
        onClose={() => {
          setDeletingQuestion(null);
          setSingleDeleteError(null);
          setIsDeletingSingleProgress(false);
        }}
        onConfirm={handleConfirmSingleDelete}
        onRetry={handleConfirmSingleDelete}
        title="Xác nhận xóa câu hỏi"
        confirmLabel="Đồng ý xóa"
        cancelLabel="Hủy bỏ"
        itemType="câu hỏi"
        itemName={deletingQuestion?.content ? (deletingQuestion.content.length > 60 ? deletingQuestion.content.substring(0, 60) + '...' : deletingQuestion.content) : undefined}
        isDeleting={isDeletingSingleProgress}
        errorMessage={singleDeleteError}
      />

      {/* MODAL XÁC NHẬN XÓA HÀNG LOẠT / XÓA TẤT CẢ CÂU HỎI */}
      <ConfirmDeleteModal
        isOpen={isBatchDeleting}
        onClose={() => {
          setIsBatchDeleting(false);
          setBatchDeleteTargetIds([]);
          setBatchDeleteError(null);
          setBatchDeleteProgressText('');
          setIsDeletingBatchProgress(false);
        }}
        onConfirm={handleConfirmBatchDelete}
        onRetry={handleConfirmBatchDelete}
        title="Cảnh báo xóa vĩnh viễn"
        confirmLabel="Đồng ý xóa"
        cancelLabel="Hủy bỏ"
        description={`Bạn có chắc chắn muốn xóa vĩnh viễn ${batchDeleteTargetIds.length} câu hỏi này không? Thao tác này không thể hoàn tác.`}
        isDeleting={isDeletingBatchProgress}
        deleteProgress={batchDeleteProgressText}
        errorMessage={batchDeleteError}
      />

      {toast && (
        <div className={`fixed bottom-6 right-6 z-[100] text-white px-5 py-3.5 rounded-2xl shadow-2xl border flex items-center gap-3 animate-slide-up backdrop-blur-md ${toast.type === 'error' ? 'bg-rose-600 border-rose-400 text-white' : 'bg-emerald-600 border-emerald-400 text-white'}`}>
          {toast.type === 'error' ? (
            <AlertCircle className="w-5 h-5 text-white shrink-0" />
          ) : (
            <CheckCircle2 className="w-5 h-5 text-white shrink-0" />
          )}
          <span className="text-xs font-extrabold tracking-wide">{toast.message}</span>
        </div>
      )}

    </>
  );
};
