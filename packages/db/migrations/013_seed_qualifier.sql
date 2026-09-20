-- ============================================================
-- 013 seed sample qualifier (16 questions, position 1-16)
-- ============================================================
-- Template: copy + replace <TOURNAMENT_ID> with real tournament uuid.
-- Safe to re-run per tournament (ON CONFLICT DO NOTHING on code).
-- options JSONB 4-6 items, correct_option A-F within length.
--
-- Usage:
--   psql -U <user> -d <database> -v tid='<TOURNAMENT_ID>' \
--     -f packages/db/migrations/013_seed_qualifier.sql
-- ============================================================

BEGIN;

INSERT INTO qualifier_questions
  (tournament_id, question_code, content, options, correct_option, explanation, position)
VALUES
  (:'tid', 'VL_01', 'Thủ đô của Việt Nam là thành phố nào?', '["Hà Nội", "Huế", "Đà Nẵng", "TP. Hồ Chí Minh"]', 'A', 'Thủ đô từ năm 1976.', 1),
  (:'tid', 'VL_02', '2 + 2 x 3 bằng bao nhiêu?', '["6", "8", "10", "12"]', 'B', 'Nhân trước cộng sau.', 2),
  (:'tid', 'VL_03', 'Nguyên tố có ký hiệu O là gì?', '["Vàng", "Oxy", "Bạc", "Sắt"]', 'B', 'Số nguyên tử 8.', 3),
  (:'tid', 'VL_04', 'Tác giả Truyện Kiều là ai?', '["Hồ Xuân Hương", "Nguyễn Trãi", "Nguyễn Du", "Cao Bá Quát"]', 'C', 'Đại thi hào dân tộc.', 4),
  (:'tid', 'VL_05', 'Sông dài nhất Việt Nam?', '["Sông Hồng", "Sông Mekong", "Sông Đồng Nai", "Sông Cả"]', 'C', 'Khoảng 586 km.', 5),
  (:'tid', 'VL_06', 'Hành tinh gần Mặt Trời nhất?', '["Sao Kim", "Trái Đất", "Sao Thủy", "Sao Hỏa"]', 'C', 'Mercury.', 6),
  (:'tid', 'VL_07', 'Đạo hàm của x^2 là gì?', '["x", "2x", "x^2", "2"]', 'B', 'Công thức cơ bản.', 7),
  (:'tid', 'VL_08', 'Quá trình cây xanh tạo oxy gọi là gì?', '["Hô hấp", "Quang hợp", "Thoát hơi nước", "Thụ phấn"]', 'B', 'Photosynthesis.', 8),
  (:'tid', 'VL_09', 'Hiến pháp Việt Nam hiện hành ban hành năm nào?', '["1992", "2001", "2013", "2015"]', 'C', 'Hiến pháp 2013.', 9),
  (:'tid', 'VL_10', 'SEA Games 31 tổ chức ở quốc gia nào?', '["Thái Lan", "Việt Nam", "Indonesia", "Philippines"]', 'B', 'Hà Nội 2022.', 10),
  (:'tid', 'VL_11', 'Số nguyên tố nhỏ nhất là số nào?', '["0", "1", "2", "3"]', 'C', 'Số 2.', 11),
  (:'tid', 'VL_12', 'Đại dương lớn nhất thế giới?', '["Đại Tây Dương", "Ấn Độ Dương", "Bắc Băng Dương", "Thái Bình Dương"]', 'D', 'Pacific.', 12),
  (:'tid', 'VL_13', 'Năm nhuận có bao nhiêu ngày?', '["365", "366", "364", "367"]', 'B', 'Tháng 2 có 29 ngày.', 13),
  (:'tid', 'VL_14', 'Đơn vị đo cường độ dòng điện?', '["Volt", "Watt", "Ampere", "Ohm"]', 'C', 'Ký hiệu A.', 14),
  (:'tid', 'VL_15', 'Châu lục nhỏ nhất thế giới?', '["Châu Âu", "Châu Úc", "Nam Cực", "Nam Mỹ"]', 'B', 'Oceania.', 15),
  (:'tid', 'VL_16', 'Ngôn ngữ lập trình nào chạy trên trình duyệt?', '["Python", "JavaScript", "C++", "Rust", "Go"]', 'B', 'JS là ngôn ngữ web.', 16)
ON CONFLICT DO NOTHING;

COMMIT;
