namespace AOC.Infrastructure.Configuration;

public sealed record S3Options(
    string? Endpoint,
    string Region,
    string? Bucket,
    string? AccessKeyId,
    string? SecretAccessKey)
{
    public bool Configured =>
        !string.IsNullOrEmpty(Bucket) && !string.IsNullOrEmpty(AccessKeyId)
        && !string.IsNullOrEmpty(SecretAccessKey);
}
