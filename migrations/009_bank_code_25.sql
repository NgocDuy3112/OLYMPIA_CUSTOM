-- 009: bankCode hạ về varchar(25) — bỏ mức50 (overkill; scheme import
-- QB_<ROUND>_<DDMMYYYY>_<NN> chỉ ~15 ký tự).
-- Chạy được cả2 trạng thái:
--   - DB chưa apply 008 (đang25) → no-op an toàn
--   - DB đã apply 008 (đang50)   → thu về25
-- Lỗi nếu tồn tại bank_code >25 ký tự (cửa sổ {1,47} chưa từng xài import).
ALTER TABLE "question_bank" ALTER COLUMN "bank_code" TYPE varchar(25);
ALTER TABLE "question_set_items" ALTER COLUMN "bank_code" TYPE varchar(25);
