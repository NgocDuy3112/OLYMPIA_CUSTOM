using Amazon.S3;
using Amazon.S3.Model;
using Olympia.Infrastructure.Configuration;

namespace Olympia.Infrastructure.Media;

public enum MediaKind
{
    image,
    audio,
    video
}

public sealed record StoredMedia(string Url, MediaKind Type);

public sealed record MediaAttachment(string Filename, string? ContentType, byte[] Content);

/// <summary>Port of lib/media.ts — S3-backed media storage with kind sniffing.</summary>
public static class MediaStorage
{
    private static readonly Dictionary<string, MediaKind> KindByExtension = new(StringComparer.OrdinalIgnoreCase)
    {
        ["png"] = MediaKind.image, ["jpg"] = MediaKind.image, ["jpeg"] = MediaKind.image,
        ["gif"] = MediaKind.image, ["webp"] = MediaKind.image, ["bmp"] = MediaKind.image,
        ["svg"] = MediaKind.image, ["heic"] = MediaKind.image,
        ["mp3"] = MediaKind.audio, ["wav"] = MediaKind.audio, ["ogg"] = MediaKind.audio,
        ["m4a"] = MediaKind.audio, ["aac"] = MediaKind.audio, ["flac"] = MediaKind.audio,
        ["opus"] = MediaKind.audio,
        ["mp4"] = MediaKind.video, ["webm"] = MediaKind.video, ["mov"] = MediaKind.video,
        ["mkv"] = MediaKind.video, ["avi"] = MediaKind.video, ["m4v"] = MediaKind.video
    };

    private static readonly Dictionary<string, string> ContentTypeByExtension = new(StringComparer.OrdinalIgnoreCase)
    {
        ["png"] = "image/png", ["jpg"] = "image/jpeg", ["jpeg"] = "image/jpeg",
        ["gif"] = "image/gif", ["webp"] = "image/webp", ["bmp"] = "image/bmp",
        ["svg"] = "image/svg+xml", ["heic"] = "image/heic",
        ["mp3"] = "audio/mpeg", ["wav"] = "audio/wav", ["ogg"] = "audio/ogg",
        ["m4a"] = "audio/mp4", ["aac"] = "audio/aac", ["flac"] = "audio/flac",
        ["opus"] = "audio/opus",
        ["mp4"] = "video/mp4", ["webm"] = "video/webm", ["mov"] = "video/quicktime",
        ["mkv"] = "video/x-matroska", ["avi"] = "video/x-msvideo", ["m4v"] = "video/x-m4v"
    };

    public static string Basename(string value)
    {
        var parts = value.Split(new[] { '\\', '/' }, StringSplitOptions.RemoveEmptyEntries);
        return parts.Length > 0 ? parts[^1] : value;
    }

    public static string ExtensionOf(string filename)
    {
        var name = Basename(filename);
        var dot = name.LastIndexOf('.');
        return dot > 0 ? name[(dot + 1)..].ToLowerInvariant() : "";
    }

    public static MediaKind? KindFor(string filename, string? contentType)
    {
        if (KindByExtension.TryGetValue(ExtensionOf(filename), out var fromExtension))
            return fromExtension;

        var prefix = (contentType ?? "").Split('/')[0];
        return prefix switch
        {
            "image" => MediaKind.image,
            "audio" => MediaKind.audio,
            "video" => MediaKind.video,
            _ => null
        };
    }

    public static string ContentTypeFor(string filename, string? declared)
    {
        if (!string.IsNullOrEmpty(declared)) return declared;
        return ContentTypeByExtension.TryGetValue(ExtensionOf(filename), out var ct)
            ? ct
            : "application/octet-stream";
    }

    public static MediaAttachment? FindAttachment(IEnumerable<MediaAttachment> attachments, string reference)
    {
        var wanted = Basename(reference).ToLowerInvariant();
        return attachments.FirstOrDefault(f => Basename(f.Filename).ToLowerInvariant() == wanted);
    }

    public static bool MediaStorageConfigured() => AppConfig.Instance.S3.Configured;

    private static AmazonS3Client? _client;

    private static AmazonS3Client S3()
    {
        if (_client is null)
        {
            var s3 = AppConfig.Instance.S3;
            var config = new AmazonS3Config
            {
                RegionEndpoint = Amazon.RegionEndpoint.GetBySystemName(s3.Region),
                ForcePathStyle = s3.Endpoint is not null,
                // SDK v4 defaults to WHEN_SUPPORTED: it signs x-amz-checksum-* headers
                // that Vietnix's S3 rejects with a bodyless 403, leaving
                // AmazonS3Exception.Message empty. Checksums only when required —
                // the same behavior as the aws CLI, which uploads fine.
                RequestChecksumCalculation = Amazon.Runtime.RequestChecksumCalculation.WHEN_REQUIRED
            };
            if (s3.Endpoint is not null)
                config.ServiceURL = s3.Endpoint;
            _client = new AmazonS3Client(s3.AccessKeyId, s3.SecretAccessKey, config);
        }
        return _client;
    }

    private static string SafeName(string filename)
    {
        var name = Basename(filename);
        var cleaned = new string(name.Select(c => char.IsLetterOrDigit(c) || c is '_' or '.' or '-' ? c : '_').ToArray());
        var sliced = cleaned.Length > 100 ? cleaned[^100..] : cleaned;
        return string.IsNullOrEmpty(sliced) ? "file" : sliced;
    }

    private static string PublicUrl(string key)
    {
        var s3 = AppConfig.Instance.S3;
        var baseUri = (s3.Endpoint ?? $"https://s3.{s3.Region}.amazonaws.com").TrimEnd('/');
        return $"{baseUri}/{s3.Bucket}/{key}";
    }

    public static async Task<StoredMedia> StoreMediaAsync(MediaAttachment file)
    {
        var type = KindFor(file.Filename, file.ContentType)
            ?? throw new InvalidOperationException(
                $"\"{file.Filename}\" names no media type — expected an image/audio/video extension or MIME type");

        var s3 = AppConfig.Instance.S3;
        if (!s3.Configured)
            throw new InvalidOperationException(
                "media storage is not configured (S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY)");

        var key = $"media/{Guid.NewGuid()}/{SafeName(file.Filename)}";
        var request = new PutObjectRequest
        {
            BucketName = s3.Bucket,
            Key = key,
            InputStream = new MemoryStream(file.Content),
            ContentType = file.ContentType,
            // Vietnix's S3 rejects the SDK v4 default aws-chunked transfer encoding
            // with a bodyless 403 AccessDenied. A plain Content-Length PUT (what the
            // aws CLI sends) succeeds for every size — measured0/4 vs4/4.
            UseChunkEncoding = false
        };
        await S3().PutObjectAsync(request);

        return new StoredMedia(PublicUrl(key), type);
    }
}
