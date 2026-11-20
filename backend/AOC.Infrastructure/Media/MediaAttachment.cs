namespace AOC.Infrastructure.Media;

public sealed record MediaAttachment(string Filename, string? ContentType, byte[] Content);
