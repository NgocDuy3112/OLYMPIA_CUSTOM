-- 008: bankCode widen varchar(25) → varchar(50)
-- Lý do: import hàng loạt cần đuôi _NN chống trùng (cùng1 giây nhiều câu).
-- Cả2 bảng giữ bank_code: question_bank (unique + CHECK QB_) và question_set_items.
ALTER TABLE "question_bank" ALTER COLUMN "bank_code" TYPE varchar(50);
ALTER TABLE "question_set_items" ALTER COLUMN "bank_code" TYPE varchar(50);
