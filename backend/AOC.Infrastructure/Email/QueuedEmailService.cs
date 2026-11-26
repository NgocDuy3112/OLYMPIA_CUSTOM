namespace AOC.Infrastructure.Email;

public sealed class QueuedEmailService(EmailQueue queue, SmtpEmailService smtp) : IEmailService
{
    public bool IsConfigured => smtp.IsConfigured;

    public Task SendAsync(string to, string subject, string htmlBody,
        CancellationToken cancellationToken = default)
    {
        if (!queue.Enqueue(new EmailMessage(to, subject, htmlBody)))
            throw new InvalidOperationException("the email queue is closed");
        return Task.CompletedTask;
    }
}
