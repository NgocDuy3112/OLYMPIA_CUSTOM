using AOC.Infrastructure.Email;

namespace AOC.Api.Email;

public sealed class EmailDispatchService(
    EmailQueue queue,
    SmtpEmailService smtp,
    ILogger<EmailDispatchService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await foreach (var message in queue.Reader.ReadAllAsync(stoppingToken))
        {
            try
            {
                await smtp.SendAsync(message.To, message.Subject, message.HtmlBody, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                return;
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "queued email to {To} could not be sent", message.To);
            }
        }
    }
}
