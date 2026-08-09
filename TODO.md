# TODO — ZIP Import with Preview

## Mục tiêu

Thêm cơ chế **preview trước khi import** cho flow upload ZIP (Excel + media). Admin sẽ thấy trước danh sách câu hỏi trước khi commit vào DB.

## Flow hiện tại

```
Upload ZIP → upload media S3 → parse Excel → commit DB (ngay lập tức)
```

## Flow mới (2 bước)

```
Bước 1: Upload ZIP → upload media S3 → parse Excel → TRẢ JSON PREVIEW (chưa commit DB)
Bước 2: Admin xem preview → bấm "Xác nhận" → commit DB
```

---

## Backend

### 1. Endpoint mới: `POST /questions/zip/preview/`

**File:** `backend/app/routes/question.py` + `backend/app/core/question.py`

- Nhận ZIP file (multipart form)
- Parse ZIP → tìm file Excel `{match_code}.xlsx`
- Upload media files hợp lệ lên S3 (idempotent)
- Parse Excel bằng openpyxl → build danh sách câu hỏi
- **KHÔNG commit DB**
- Return JSON:

```json
{
  "status": "success",
  "data": {
    "match_code": "OC3_M01T",
    "questions": [
      {
        "question_code": "OC3_Q_KD_1_1",
        "content": "...",
        "answer": "...",
        "explanation": "...",
        "media_url": "OC3_M01T/image.png"
      }
    ],
    "media_uploaded": ["image.png", "clip.mp4"],
    "media_failed": []
  }
}
```

### 2. Endpoint mới: `POST /questions/zip/confirm/`

**File:** `backend/app/routes/question.py` + `backend/app/core/question.py`

- Nhận ZIP file (multipart form) — parse lại Excel
- Media đã có trên S3 từ bước preview → skip (hoặc upload lại, idempotent)
- Gọi `post_questions_from_excel_to_db(match_code, excel_file, session, overwrite=True)`
- Return y hệt endpoint ZIP hiện tại

### 3. Giữ nguyên `POST /questions/zip/` (backward-compatible)

---

## Frontend

### File: `frontend/src/pages/admin/AGameManagingPage.tsx`

### State mới

```ts
const [previewData, setPreviewData] = useState<PreviewResponse | null>(null);
const [previewFile, setPreviewFile] = useState<File | null>(null);
const [showPreviewModal, setShowPreviewModal] = useState(false);
const [previewLoading, setPreviewLoading] = useState(false);
const [confirmingImport, setConfirmingImport] = useState(false);
```

### Flow mới

1. User chọn ZIP từ dropdown → `handleZipUpload(file)`
2. Gọi `POST /questions/zip/preview/` với file
3. Hiển thị preview modal:
   - Table đầy đủ: `#`, `Mã câu hỏi`, `Nội dung`, `Đáp án`, `Giải thích`, `Media` (icon)
   - Warning banner: "⚠️ Import sẽ xóa tất cả câu hỏi hiện tại"
   - Footer: thống kê (X câu hỏi, Y media ok, Z media lỗi)
   - Nút "Huỷ" + nút "Xác nhận import"
4. Bấm "Xác nhận" → gọi `POST /questions/zip/confirm/`
5. Alert kết quả → refresh → đóng modal

### Question board đơn giản

- Bảng câu hỏi hiện tại: hiển thị full URL trong cột Media
- **Đổi thành:** câu nào có `media_url` thì hiển thị icon 📎 (Paperclip), hover hiện tooltip S3 key

---

## Files cần sửa

| File | Thay đổi |
|------|----------|
| `backend/app/routes/question.py` | Thêm 2 endpoint: `zip/preview/`, `zip/confirm/` |
| `backend/app/core/question.py` | Tách logic zip preview, refactor hàm hiện tại |
| `frontend/src/pages/admin/AGameManagingPage.tsx` | Thêm preview modal, sửa flow ZIP, đơn giản hóa cột Media |

---

## Verification

1. Upload ZIP test → verify preview modal hiển thị đúng danh sách câu hỏi
2. Bấm Huỷ → verify không có gì thay đổi trong DB
3. Upload lại → bấm Xác nhận → verify câu hỏi + media xuất hiện trong DB
4. Upload ZIP mới cho cùng match_code → verify overwrite hoạt động
5. Endpoint `/questions/zip/` cũ vẫn hoạt động bình thường
