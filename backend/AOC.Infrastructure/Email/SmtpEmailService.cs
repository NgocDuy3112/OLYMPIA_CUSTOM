using System.Net;
using System.Net.Mail;
using AOC.Infrastructure.Configuration;

namespace AOC.Infrastructure.Email;

public sealed class SmtpEmailService : IEmailService
{
    private readonly AppConfig _config = AppConfig.Instance;

    public bool IsConfigured =>
        !string.IsNullOrEmpty(_config.Smtp.Host) && !string.IsNullOrEmpty(_config.Smtp.From);

    public async Task SendAsync(string to, string subject, string htmlBody, CancellationToken cancellationToken = default)
    {
        var smtp = _config.Smtp;
        var host = smtp.Host;
        if (host is null)
            throw new InvalidOperationException("SMTP is not configured: SMTP_HOST is missing.");
        if (host.Length == 0)
            throw new InvalidOperationException("SMTP is not configured: SMTP_HOST is missing.");
        var from = smtp.From;
        if (from is null)
            throw new InvalidOperationException("SMTP is not configured: SMTP_FROM is missing.");
        if (from.Length == 0)
            throw new InvalidOperationException("SMTP is not configured: SMTP_FROM is missing.");
        using var client = new SmtpClient(host, smtp.Port);
        client.EnableSsl = true;
        if (smtp.User is { Length: > 0 } user)
            client.Credentials = new NetworkCredential(user, smtp.Password);
        using var message = new MailMessage(from, to, subject, htmlBody);
        message.IsBodyHtml = true;
        await client.SendMailAsync(message).WaitAsync(cancellationToken);
    }
}
