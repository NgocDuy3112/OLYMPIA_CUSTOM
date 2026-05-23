# Media API

**Tag**: `Media`

Endpoints for uploading media to S3 and proxying files from S3 or Google Drive.

---

## Table of Contents

- [POST `/media/upload/`](#post-mediaupload)
- [GET `/media/`](#get-media)
- [GET `/media/presign/`](#get-mediapresign)
- [GET `/media/drive/`](#get-mediadrive)

---

## POST `/media/upload/`

Upload a file to S3. The file is stored under `{match_code}/{filename}`.

### Request

| Property | Value |
|----------|-------|
| **URL** | `/media/upload/` |
| **Method** | `POST` |
| **Auth** | Admin role required |
| **Content-Type** | `multipart/form-data` |

### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `match_code` | string | ✅ | S3 key prefix (match code) |

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | file | ✅ | File to upload |

### Request Example

```bash
curl -X POST "http://localhost:8000/media/upload/?match_code=OC3_M001" \
  -H "Authorization: Bearer <token>" \
  -F "file=@question_image.png"
```

### Success Response

**Status**: `200 OK`

```json
{
  "status": "success",
  "message": "File uploaded successfully",
  "data": { "s3_key": "OC3_M001/question_image.png" }
}
```

---

## GET `/media/`

Fetch a file from S3 by key and redirect the client to a short-lived presigned URL.

### Request

| Property | Value |
|----------|-------|
| **URL** | `/media/` |
| **Method** | `GET` |
| **Auth** | Any authenticated user |

### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `key` | string | ✅ | S3 object key (e.g. `OC3_M001/image.png`) |

### Request Example

```bash
curl -X GET "http://localhost:8000/media/?key=OC3_M001/image.png" \
  -H "Authorization: Bearer <token>" \
  -L
```

### Success Response

**Status**: `302 Found` — redirects to presigned S3 URL.

---

## GET `/media/presign/`

Return a short-lived presigned S3 URL as JSON (instead of redirecting).

### Request

| Property | Value |
|----------|-------|
| **URL** | `/media/presign/` |
| **Method** | `GET` |
| **Auth** | Any authenticated user |

### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `key` | string | ✅ | S3 object key |

### Request Example

```bash
curl -X GET "http://localhost:8000/media/presign/?key=OC3_M001/image.png" \
  -H "Authorization: Bearer <token>"
```

### Success Response

**Status**: `200 OK`

```json
{
  "status": "success",
  "message": "Presigned URL generated",
  "data": { "url": "https://s3.example.com/olympia-custom/OC3_M001/image.png?X-Amz-..." }
}
```

---

## GET `/media/drive/`

Stream a media file from Google Drive through the backend proxy.

This endpoint authenticates with Google Drive using the server-side service credentials and streams the file content directly to the client. It must be used instead of linking to Google Drive URLs directly, both to enforce access control and to avoid CORS/authentication issues in the browser.

### Request

| Property | Value |
|----------|-------|
| **URL** | `/media/drive/` |
| **Method** | `GET` |
| **Auth** | Admin **or** Player role required |

### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `file_id` | string | ✅ | Google Drive file ID |

### Request Example

```bash
curl -X GET "http://localhost:8000/media/drive/?file_id=1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms" \
  -H "Authorization: Bearer <token>" \
  --output media.jpg
```

### Success Response

**Status**: `200 OK`

Returns the raw file bytes with the original `Content-Type` (e.g. `image/jpeg`, `audio/mpeg`, `video/mp4`).

| Header | Value |
|--------|-------|
| `Content-Type` | Resolved MIME type of the Drive file |
| `Cache-Control` | `private, max-age=3600` |
| `Content-Length` | File size in bytes |

### Supported MIME Types

| Category | MIME Types |
|----------|-----------|
| **Images** | `image/jpeg`, `image/png`, `image/gif`, `image/webp`, `image/svg+xml` |
| **Audio** | `audio/mpeg`, `audio/ogg`, `audio/wav`, `audio/webm`, `audio/mp4`, `audio/aac` |
| **Video** | `video/mp4`, `video/webm`, `video/ogg`, `video/quicktime` |

### Error Responses

| Status | Description |
|--------|-------------|
| `400` | File MIME type is not an allowed media type |
| `401` | Missing or invalid JWT token |
| `403` | Not an admin/player user, or Drive access denied |
| `404` | File not found in Google Drive |
| `500` | Unexpected server or Google API error |

### Notes

- The file is fully buffered in memory before streaming; very large files should be avoided.
- Client responses are cached for **1 hour** (`Cache-Control: private, max-age=3600`).
- The frontend `useDriveMedia` hook (`src/hooks/useDriveMedia.ts`) handles extracting the file ID from a Drive share URL, fetching via this endpoint, and returning a blob URL for use in `<img>`, `<audio>`, and `<video>` elements.
