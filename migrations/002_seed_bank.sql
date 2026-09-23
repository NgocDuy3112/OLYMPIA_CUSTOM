-- ============================================================
-- 002 seed sample question bank (QB_* codes, pre-approved)
-- ============================================================
-- Sample rows covering KD_C / KD_R / GM / BP / VD round hints.
-- status approved so rows are pickable right away.
-- Safe to re-run (ON CONFLICT DO NOTHING on bank_code).
--
-- Usage:
--   psql -U <user> -d <database> -f migrations/002_seed_bank.sql
-- ============================================================

BEGIN;

INSERT INTO question_bank (bank_code, content, answer, explanation, round_hint, status) VALUES
  ('QB_KDC_001', 'Thủ đô của Việt Nam là thành phố nào?', 'Hà Nội', 'Thủ đô từ năm 1976.', 'KD_C', 'approved'),
  ('QB_KDC_002', '2 + 2 x 3 bằng bao nhiêu?', '8', 'Nhân trước cộng sau.', 'KD_C', 'approved'),
  ('QB_KDR_001', 'Nguyên tố hóa học có ký hiệu O là gì?', 'Oxy', 'Số nguyên tử 8.', 'KD_R', 'approved'),
  ('QB_KDR_002', 'Tác giả Truyện Kiều là ai?', 'Nguyễn Du', 'Đại thi hào dân tộc.', 'KD_R', 'approved'),
  ('QB_GM_001', 'Gợi ý: loài vật biểu tượng của năm 2026 (Bính Ngọ)?', 'Ngựa', 'Năm Ngọ cầm tinh con ngựa.', 'GM', 'approved'),
  ('QB_GM_002', 'Từ khóa 6 chữ: nơi diễn ra trận chung kết?', 'TRUONGQ', 'Placeholder mẫu.', 'GM', 'approved'),
  ('QB_BP_001', 'Sông dài nhất Việt Nam là sông nào?', 'Sông Đồng Nai', 'Dài khoảng 586 km.', 'BP', 'approved'),
  ('QB_BP_002', 'Hành tinh gần Mặt Trời nhất?', 'Sao Thủy', 'Mercury.', 'BP', 'approved'),
  ('QB_VD_TTTK_20', 'Đạo hàm của x^2 là gì?', '2x', 'Công thức cơ bản.', 'VD', 'approved'),
  ('QB_VD_TNSS_30', 'Quá trình cây xanh tạo oxy gọi là gì?', 'Quang hợp', 'Photosynthesis.', 'VD', 'approved'),
  ('QB_VD_XHPL_40', 'Hiến pháp Việt Nam hiện hành ban hành năm nào?', '2013', 'Hiến pháp 2013.', 'VD', 'approved'),
  ('QB_VD_VHTT_50', 'SEA Games 31 tổ chức ở quốc gia nào?', 'Việt Nam', 'Hà Nội 2022.', 'VD', 'approved')
ON CONFLICT (bank_code) DO NOTHING;

COMMIT;
