# Media API

**Tag**: `Media`

Proxy endpoint for streaming media files (images, audio, video) from Google Drive.

---

## Table of Contents

- [GET `/media/drive/`](#get-mediadrive)

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
