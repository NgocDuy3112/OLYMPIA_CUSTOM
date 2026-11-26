namespace AOC.Infrastructure.Email;

public sealed record EmailMessage(string To, string Subject, string HtmlBody);

public interface IEmailService
{
    bool IsConfigured { get; }

    Task SendAsync(string to, string subject, string htmlBody, CancellationToken cancellationToken = default);
}
