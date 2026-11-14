export interface PrimarySubjectCatalogItem {
  id: string;
  label: string;
  dropdownLabel: string;
  aiSubjectName: string;
  emoji: string;
  gradeRangeHint?: string;
  suggestionsByGrade: Record<string, string[]>;
}

export const PRIMARY_SUBJECTS_CATALOG: PrimarySubjectCatalogItem[] = [
  {
    id: 'toan',
    label: 'Toán',
    dropdownLabel: 'Toán',
    aiSubjectName: 'Toán',
    emoji: '🧮',
    suggestionsByGrade: {
      'Khối 1': [
        'Phép cộng trong phạm vi 10',
        'Phép trừ trong phạm vi 10',
        'Nhận biết hình vuông, hình tròn, hình tam giác',
        'Các số đến 100 và so sánh số',
      ],
      'Khối 2': [
        'Phép cộng, trừ có nhớ trong phạm vi 100',
        'Bảng nhân 2 và bảng nhân 5',
        'Xem đồng hồ và ngày, giờ',
        'Đơn vị đo độ dài: cm, dm, m',
      ],
      'Khối 3': [
        'Bảng nhân 4 và bảng chia 4',
        'Phép cộng, trừ trong phạm vi 1000',
        'Chu vi hình vuông và hình chữ nhật',
        'Xem đồng hồ và đơn vị đo độ dài, khối lượng',
      ],
      'Khối 4': [
        'Phân số và tính chất cơ bản của phân số',
        'Phép cộng, trừ, nhân, chia phân số',
        'Tìm hai số khi biết tổng và hiệu',
        'Diện tích hình chữ nhật, hình bình hành',
      ],
      'Khối 5': [
        'Số thập phân và các phép tính với số thập phân',
        'Tỉ số phần trăm và giải toán thực tế',
        'Diện tích hình tam giác, hình thang, hình tròn',
        'Chuyển động đều: vận tốc, quãng đường, thời gian',
      ],
    },
  },
  {
    id: 'tieng_viet',
    label: 'Tiếng Việt',
    dropdownLabel: 'Tiếng Việt',
    aiSubjectName: 'Tiếng Việt',
    emoji: '📖',
    suggestionsByGrade: {
      'Khối 1': [
        'Nhận biết vần và ghép tiếng đơn giản',
        'Phân biệt chữ cái và thanh điệu tiếng Việt',
        'Đọc hiểu câu ngắn về gia đình, bạn bè',
        'Điền âm đầu c/k, g/gh, ng/ngh phù hợp',
      ],
      'Khối 2': [
        'Từ chỉ sự vật, hoạt động, đặc điểm',
        'Chính tả phân biệt s/x và ch/tr',
        'Đặt câu giới thiệu Ai là gì? và Ai làm gì?',
        'Dấu chấm, dấu chấm hỏi, dấu chấm than',
      ],
      'Khối 3': [
        'Từ ngữ chỉ đặc điểm và biện pháp so sánh',
        'Mở rộng vốn từ Thiên nhiên và Bảo vệ môi trường',
        'Câu kể, câu hỏi và câu cảm trong đoạn văn',
        'Chính tả phân biệt l/n, r/d/gi',
      ],
      'Khối 4': [
        'Danh từ, động từ, tính từ trong câu',
        'Biện pháp nhân hóa và đặt câu có nhân hóa',
        'Thành phần chủ ngữ, vị ngữ trong câu kể',
        'Mở rộng vốn từ Nhân hậu - Đoàn kết',
      ],
      'Khối 5': [
        'Từ đồng nghĩa, từ trái nghĩa và từ đồng âm',
        'Đại từ, kết từ và liên kết câu trong đoạn văn',
        'Câu ghép và các cặp quan hệ từ thường gặp',
        'Cảm thụ văn học và mở rộng vốn từ Hòa bình',
      ],
    },
  },
  {
    id: 'tieng_anh',
    label: 'Tiếng Anh',
    dropdownLabel: 'Tiếng Anh',
    aiSubjectName: 'Tiếng Anh',
    emoji: '🌍',
    suggestionsByGrade: {
      'Khối 1': [
        'Greetings & Alphabet (Chào hỏi và Bảng chữ cái)',
        'Colors & Numbers 1-10 (Màu sắc và Số đếm)',
        'Classroom Objects (Đồ dùng học tập)',
        'Animals Around Us (Động vật quen thuộc)',
      ],
      'Khối 2': [
        'My Family & Friends (Gia đình và Bạn bè)',
        'Parts of the Body (Các bộ phận cơ thể)',
        'Food & Drinks (Đồ ăn và Thức uống)',
        'Numbers 11-20 & Toys (Số đếm và Đồ chơi)',
      ],
      'Khối 3': [
        'School Things & Classroom Instructions',
        'My Family, Ages & Jobs',
        'Pets, Toys & Colors',
        'Daily Activities & Hobbies',
      ],
      'Khối 4': [
        'Countries, Nationalities & Dates',
        'School Subjects & Weekly Timetable',
        'Abilities (Can / Can’t) & Outdoor Activities',
        'Weather, Places & Telling the Time',
      ],
      'Khối 5': [
        'Past Simple & Summer Holidays',
        'Health Problems & Giving Advice',
        'Future Plans & Dream Jobs',
        'Stories, Festivals & Comparing Places',
      ],
    },
  },
  {
    id: 'tnxh',
    label: 'Tự nhiên & Xã hội',
    dropdownLabel: 'Tự nhiên & Xã hội (Khối 1–3)',
    aiSubjectName: 'Tự nhiên và Xã hội',
    emoji: '🌿',
    gradeRangeHint: 'Khối 1–3',
    suggestionsByGrade: {
      'Khối 1': [
        'Gia đình em và những người thân yêu',
        'Ngôi trường và lớp học của em',
        'Các giác quan và giữ gìn vệ sinh cơ thể',
        'Cây xanh, con vật quanh nhà và thời tiết',
      ],
      'Khối 2': [
        'Cơ quan vận động, hô hấp và tiêu hóa',
        'Giữ an toàn khi ở nhà và tham gia giao thông',
        'Môi trường sống của thực vật và động vật',
        'Nghề nghiệp của người dân trong cộng đồng',
      ],
      'Khối 3': [
        'Cơ quan tiêu hóa, tuần hoàn và thần kinh',
        'Truyền thống nhà trường và an toàn trường học',
        'Các bộ phận của thực vật và động vật',
        'Trái Đất, Mặt Trời và các đới khí hậu',
      ],
      'Khối 4': [
        'Ôn tập Tự nhiên và Xã hội: Gia đình & Cộng đồng',
        'Thực vật, động vật và bảo vệ thiên nhiên',
        'An toàn giao thông và phòng tránh thiên tai',
        'Chăm sóc sức khỏe cơ thể người',
      ],
      'Khối 5': [
        'Hệ sinh thái và bảo vệ môi trường xanh',
        'Kỹ năng an toàn trong cuộc sống hằng ngày',
        'Trái Đất và các hiện tượng tự nhiên',
        'Ôn tập kiến thức Tự nhiên và Xã hội Tiểu học',
      ],
    },
  },
  {
    id: 'khoa_hoc',
    label: 'Khoa học',
    dropdownLabel: 'Khoa học (Khối 4–5)',
    aiSubjectName: 'Khoa học',
    emoji: '🔬',
    gradeRangeHint: 'Khối 4–5',
    suggestionsByGrade: {
      'Khối 1': [
        'Khám phá nước, không khí và ánh sáng',
        'Quan sát thực vật và động vật quanh em',
        'Giữ gìn sức khỏe và ăn uống đủ chất',
        'Vật nổi, vật chìm và nam châm đơn giản',
      ],
      'Khối 2': [
        'Sự chuyển thể của nước trong tự nhiên',
        'Ánh sáng, bóng tối và âm thanh quanh em',
        'Nhu cầu sống của cây xanh và con vật',
        'Bảo vệ nguồn nước sạch và không khí',
      ],
      'Khối 3': [
        'Tính chất của nước và vòng tuần hoàn nước',
        'Không khí và vai trò đối với sự sống',
        'Âm thanh, ánh sáng và nhiệt trong đời sống',
        'Dinh dưỡng cân bằng cho học sinh Tiểu học',
      ],
      'Khối 4': [
        'Tính chất của nước và bảo vệ nguồn nước',
        'Không khí, gió và phòng chống bão',
        'Ánh sáng, âm thanh và nhiệt độ',
        'Nấm, vi khuẩn và dinh dưỡng ở người',
      ],
      'Khối 5': [
        'Đất, hỗn hợp, dung dịch và sự biến đổi chất',
        'Năng lượng điện, mạch điện đơn giản và an toàn điện',
        'Sự sinh sản ở thực vật có hoa và động vật',
        'Vi khuẩn có ích, có hại và chăm sóc sức khỏe tuổi dậy thì',
      ],
    },
  },
  {
    id: 'lich_su_dia_ly',
    label: 'Lịch sử & Địa lý',
    dropdownLabel: 'Lịch sử & Địa lý (Khối 4–5)',
    aiSubjectName: 'Lịch sử và Địa lý',
    emoji: '🗺️',
    gradeRangeHint: 'Khối 4–5',
    suggestionsByGrade: {
      'Khối 1': [
        'Tìm hiểu quê hương và nơi em đang sống',
        'Các ngày lễ lớn và truyền thống dân tộc',
        'Bản đồ đơn giản và phương hướng cơ bản',
        'Di tích lịch sử, danh lam thắng cảnh gần em',
      ],
      'Khối 2': [
        'Truyền thống văn hóa quê hương Việt Nam',
        'Phương hướng Đông - Tây - Nam - Bắc',
        'Những tấm gương anh hùng nhỏ tuổi',
        'Phong cảnh thiên nhiên ba miền đất nước',
      ],
      'Khối 3': [
        'Làm quen với bản đồ và các vùng miền Việt Nam',
        'Truyền thống dựng nước và giữ nước của dân tộc',
        'Lễ hội truyền thống và di sản văn hóa',
        'Bảo vệ cảnh quan thiên nhiên quê hương',
      ],
      'Khối 4': [
        'Vùng Trung du và miền núi Bắc Bộ, Đồng bằng Bắc Bộ',
        'Thăng Long - Hà Nội và Văn Miếu Quốc Tử Giám',
        'Vùng Duyên hải miền Trung và Phố cổ Hội An',
        'Tây Nguyên, Nam Bộ và Chiến thắng Bạch Đằng',
      ],
      'Khối 5': [
        'Vị trí địa lý, địa hình, khí hậu và biển đảo Việt Nam',
        'Nhà nước Văn Lang - Âu Lạc và triều đại Lý, Trần, Lê',
        'Cách mạng tháng Tám 1945 và Chiến dịch Điện Biên Phủ',
        'Các châu lục, đại dương và các nước láng giềng ASEAN',
      ],
    },
  },
  {
    id: 'dao_duc',
    label: 'Đạo đức',
    dropdownLabel: 'Đạo đức',
    aiSubjectName: 'Đạo đức',
    emoji: '💛',
    suggestionsByGrade: {
      'Khối 1': [
        'Yêu thương gia đình và lễ phép với người lớn',
        'Đi học đúng giờ và giữ gìn sách vở',
        'Thật thà, không nói dối và biết nhận lỗi',
        'Tự giác chăm sóc bản thân hằng ngày',
      ],
      'Khối 2': [
        'Quý trọng thời gian và nhận lỗi, sửa lỗi',
        'Kính trọng thầy cô giáo và yêu quý bạn bè',
        'Bảo quản đồ dùng cá nhân và gia đình',
        'Tìm kiếm sự hỗ trợ khi gặp khó khăn',
      ],
      'Khối 3': [
        'Tuân thủ quy định nơi công cộng và an toàn',
        'Ham học hỏi, tích cực hoàn thành nhiệm vụ',
        'Quan tâm hàng xóm láng giềng và giữ lời hứa',
        'Khám phá điểm mạnh của bản thân',
      ],
      'Khối 4': [
        'Biết ơn người lao động và cảm thông, giúp đỡ người khó khăn',
        'Yêu lao động và tiết kiệm tiền của, thời gian',
        'Thiết lập và duy trì tình bạn đẹp',
        'Quyền và bổn phận của trẻ em',
      ],
      'Khối 5': [
        'Biết ơn những người có công với quê hương, đất nước',
        'Tôn trọng sự khác biệt của mọi người',
        'Vượt qua khó khăn và bảo vệ cái đúng, cái tốt',
        'Bảo vệ môi trường sống và phòng tránh xâm hại',
      ],
    },
  },
  {
    id: 'tin_hoc',
    label: 'Tin học',
    dropdownLabel: 'Tin học',
    aiSubjectName: 'Tin học',
    emoji: '💻',
    suggestionsByGrade: {
      'Khối 1': [
        'Làm quen với máy tính và chuột, bàn phím',
        'Tư thế ngồi học máy tính đúng và an toàn',
        'Nhận biết thông tin xung quanh em',
        'Trò chơi rèn luyện thao tác chuột máy tính',
      ],
      'Khối 2': [
        'Các bộ phận cơ bản của máy tính',
        'Cách gõ phím đúng ngón trên hàng phím cơ sở',
        'Làm quen với phần mềm vẽ đơn giản',
        'Quy tắc sử dụng thiết bị số an toàn',
      ],
      'Khối 3': [
        'Thông tin và xử lý thông tin, các bộ phận máy tính',
        'Tổ chức thư mục, tệp và bảo vệ thông tin cá nhân',
        'Tìm kiếm thông tin trên trang Web an toàn',
        'Làm quen với bài trình chiếu PowerPoint và thuật toán',
      ],
      'Khối 4': [
        'Phần cứng, phần mềm và tạo bài trình chiếu sinh động',
        'Soạn thảo văn bản tiếng Việt và chèn hình ảnh',
        'Tìm kiếm thông tin trên Internet và bản quyền',
        'Lập trình trực quan Scratch: chuyển động và âm thanh',
      ],
      'Khối 5': [
        'Tìm kiếm và sử dụng thông tin có trách nhiệm trên mạng',
        'Định dạng văn bản và tạo bài trình chiếu hoàn chỉnh',
        'Cấu trúc rẽ nhánh và vòng lặp trong Scratch',
        'Tạo trò chơi hoặc câu chuyện nhỏ bằng Scratch',
      ],
    },
  },
  {
    id: 'cong_nghe',
    label: 'Công nghệ',
    dropdownLabel: 'Công nghệ',
    aiSubjectName: 'Công nghệ',
    emoji: '⚙️',
    suggestionsByGrade: {
      'Khối 1': [
        'Nhận biết đồ dùng gia đình an toàn',
        'Sản phẩm công nghệ và đối tượng tự nhiên',
        'Sử dụng đèn bàn và đồ dùng học tập đúng cách',
        'Gấp giấy thủ công đơn giản',
      ],
      'Khối 2': [
        'Đồ dùng điện trong gia đình và an toàn điện',
        'Làm đồ chơi dân gian từ vật liệu đơn giản',
        'Gấp, cắt dán sản phẩm thủ công sáng tạo',
        'Chăm sóc cây cảnh nhỏ trong lớp học',
      ],
      'Khối 3': [
        'Tự nhiên và công nghệ; sử dụng đèn học, quạt điện',
        'Sử dụng máy thu thanh, máy thu hình đúng cách',
        'An toàn với công nghệ trong gia đình',
        'Làm đồ dùng học tập và biển báo giao thông',
      ],
      'Khối 4': [
        'Lợi ích của hoa và cây cảnh quanh em',
        'Trồng và chăm sóc hoa, cây cảnh trong chậu',
        'Lắp ghép mô hình kỹ thuật: xích đu, xe đẩy, rô-bốt',
        'Làm đồ chơi dân gian: đèn lồng, chong chóng',
      ],
      'Khối 5': [
        'Vai trò của công nghệ và nhà sáng chế nổi tiếng',
        'Sử dụng tủ lạnh và điện thoại an toàn, văn minh',
        'Lắp ráp mô hình xe điện chạy bằng pin và điện mặt trời',
        'Thiết kế sản phẩm công nghệ thân thiện môi trường',
      ],
    },
  },
  {
    id: 'am_nhac',
    label: 'Âm nhạc',
    dropdownLabel: 'Âm nhạc',
    aiSubjectName: 'Âm nhạc',
    emoji: '🎵',
    suggestionsByGrade: {
      'Khối 1': [
        'Nhận biết âm thanh cao - thấp, dài - ngắn',
        'Nhạc cụ gõ quen thuộc: thanh phách, trống nhỏ',
        'Hát đúng giai điệu bài hát thiếu nhi lớp 1',
        'Vỗ tay theo nhịp và tiết tấu đơn giản',
      ],
      'Khối 2': [
        'Đọc tên các nốt nhạc Đồ, Rê, Mi, Pha, Son, La',
        'Nhận biết nhạc cụ dân tộc và nhạc cụ phương Tây',
        'Hát kết hợp gõ đệm theo phách, theo nhịp',
        'Kể chuyện âm nhạc và thưởng thức bài hát thiếu nhi',
      ],
      'Khối 3': [
        'Khuông nhạc, khóa Son và các hình nốt cơ bản',
        'Nhịp 2/4 và cách đánh nhịp, gõ đệm',
        'Nhạc cụ gõ và sáo recorder / kèn phím cơ bản',
        'Bài hát chủ đề Quê hương và Mái trường',
      ],
      'Khối 4': [
        'Đọc nhạc trên khuông và hình nốt móc đơn, dấu lặng',
        'Nhịp 3/4 và sắc thái to - nhỏ trong âm nhạc',
        'Tìm hiểu dân ca ba miền Bắc - Trung - Nam',
        'Giới thiệu nhạc sĩ nổi tiếng và tác phẩm thiếu nhi',
      ],
      'Khối 5': [
        'Nhịp 4/4 và các ký hiệu âm nhạc thường gặp',
        'Ôn tập tên các nốt nhạc và bài tập đọc nhạc',
        'Âm nhạc dân tộc và nhạc cụ truyền thống Việt Nam',
        'Hòa giọng, hát bè đơn giản và biểu diễn ca khúc',
      ],
    },
  },
  {
    id: 'my_thuat',
    label: 'Mỹ thuật',
    dropdownLabel: 'Mỹ thuật',
    aiSubjectName: 'Mỹ thuật',
    emoji: '🎨',
    suggestionsByGrade: {
      'Khối 1': [
        'Ba màu cơ bản: Đỏ, Vàng, Xanh lam',
        'Chấm, nét, hình cơ bản trong tranh vẽ',
        'Vẽ và xé dán ngôi nhà, cây xanh',
        'Nặn con vật quen thuộc bằng đất nặn',
      ],
      'Khối 2': [
        'Màu nóng, màu lạnh và cách pha màu cơ bản',
        'Tạo hình tranh phong cảnh thiên nhiên',
        'Cắt dán họa tiết trang trí đường diềm',
        'Vẽ chân dung người thân và bạn bè',
      ],
      'Khối 3': [
        'Màu sắc tương phản và đậm nhạt trong tranh',
        'Vẽ tranh đề tài Trường em và Ngày hội',
        'Tạo hình sản phẩm thủ công từ vật liệu tái chế',
        'Tìm hiểu nghệ thuật dân gian Đông Hồ',
      ],
      'Khối 4': [
        'Tỷ lệ khuôn mặt và vẽ chân dung biểu cảm',
        'Trang trí hình vuông, hình tròn và đồ vật',
        'Tạo hình 3D từ giấy bìa và vật liệu tìm được',
        'Di sản mỹ thuật truyền thống Việt Nam',
      ],
      'Khối 5': [
        'Luật xa gần và không gian trong tranh phong cảnh',
        'Thiết kế bưu thiếp, áp phích bảo vệ môi trường',
        'Tạo dáng và trang trí sản phẩm thủ công ứng dụng',
        'Tìm hiểu hội họa Việt Nam và thế giới',
      ],
    },
  },
  {
    id: 'gdtc',
    label: 'Giáo dục thể chất',
    dropdownLabel: 'Giáo dục thể chất',
    aiSubjectName: 'Giáo dục thể chất',
    emoji: '⚽',
    suggestionsByGrade: {
      'Khối 1': [
        'Đội hình đội ngũ: tập hợp hàng dọc, hàng ngang',
        'Tư thế vận động cơ bản và giữ thăng bằng',
        'Bài thể dục phát triển chung buổi sáng',
        'Vệ sinh thân thể trước và sau khi tập luyện',
      ],
      'Khối 2': [
        'Đứng nghiêm, đứng nghỉ, quay trái, quay phải',
        'Kỹ năng đi, chạy, nhảy đúng tư thế',
        'Trò chơi vận động phát triển sức nhanh, khéo léo',
        'An toàn khi tập luyện thể dục thể thao',
      ],
      'Khối 3': [
        'Biến đổi đội hình vòng tròn và dóng hàng thẳng',
        'Bài thể dục với cờ hoặc vòng thể dục',
        'Kỹ năng bật nhảy, ném bóng trúng đích',
        'Chế độ dinh dưỡng và uống nước khi vận động',
      ],
      'Khối 4': [
        'Tư thế cơ bản và kỹ thuật chạy cự ly ngắn',
        'Nhảy dây cá nhân và bật xa tại chỗ',
        'Làm quen môn thể thao tự chọn: Đá cầu / Bóng đá / Bơi',
        'Phòng tránh chấn thương khi chơi thể thao',
      ],
      'Khối 5': [
        'Kỹ thuật chạy bền và điều hòa nhịp thở',
        'Tung, bắt bóng và phối hợp đồng đội',
        'Kiến thức an toàn phòng chống đuối nước',
        'Lợi ích của rèn luyện thể thao hằng ngày',
      ],
    },
  },
  {
    id: 'hdtn',
    label: 'Hoạt động trải nghiệm',
    dropdownLabel: 'Hoạt động trải nghiệm',
    aiSubjectName: 'Hoạt động trải nghiệm',
    emoji: '🌱',
    suggestionsByGrade: {
      'Khối 1': [
        'Giới thiệu bản thân và làm quen bạn mới',
        'Sắp xếp góc học tập gọn gàng, ngăn nắp',
        'Yêu thương gia đình và nói lời cảm ơn, xin lỗi',
        'Giữ gìn trường lớp xanh - sạch - đẹp',
      ],
      'Khối 2': [
        'Nhận diện cảm xúc vui, buồn và cách kiềm chế tức giận',
        'Phân loại rác và bảo vệ cây xanh ở trường',
        'Kỹ năng tự phục vụ và sắp xếp thời gian biểu',
        'Chia sẻ, giúp đỡ bạn bè và người xung quanh',
      ],
      'Khối 3': [
        'Xây dựng nội quy lớp học và tinh thần hợp tác nhóm',
        'Kỹ năng phòng tránh nguy cơ bị lạc và bắt cóc',
        'Tìm hiểu nghề nghiệp truyền thống ở địa phương',
        'Tiết kiệm điện, nước và tái chế đồ dùng cũ',
      ],
      'Khối 4': [
        'Rèn luyện nếp sống tự lập và lập kế hoạch học tập',
        'Ứng xử văn minh trên mạng và nơi công cộng',
        'Phòng tránh tai nạn thương tích và hỏa hoạn',
        'Chăm sóc cảnh quan thiên nhiên và thiện nguyện',
      ],
      'Khối 5': [
        'Nhận thức sự thay đổi của bản thân và tự tin trước đám đông',
        'Kỹ năng làm việc nhóm và giải quyết mâu thuẫn hòa bình',
        'Tìm hiểu văn hóa nghề nghiệp và định hướng ước mơ',
        'Chuẩn bị tâm thế chuyển cấp lên Trung học cơ sở',
      ],
    },
  },
];

export function getSuggestionsForSubjectAndGrade(
  subjectItem: PrimarySubjectCatalogItem,
  grade: string
): string[] {
  return (
    subjectItem.suggestionsByGrade[grade] ||
    subjectItem.suggestionsByGrade['Khối 3'] ||
    Object.values(subjectItem.suggestionsByGrade)[0] ||
    []
  );
}
