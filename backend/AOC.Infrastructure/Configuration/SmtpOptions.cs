namespace AOC.Infrastructure.Configuration;

public sealed record SmtpOptions(
    string? Host,
    int Port,
    string? User,
    string? Password,
    string? From)
{
    public bool Configured => !string.IsNullOrEmpty(Host);
}
