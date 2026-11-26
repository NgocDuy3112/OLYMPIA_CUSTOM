using AOC.Infrastructure.Email;
using Xunit;

namespace AOC.Tests.Email;

public class EmailQueueTests
{
    [Fact]
    public async Task Sending_through_the_queue_hands_the_message_to_the_background_worker()
    {
        var queue = new EmailQueue();
        var service = new QueuedEmailService(queue, new SmtpEmailService());

        await service.SendAsync("player@example.com", "Mã đặt lại mật khẩu AOC", "<b>12345678</b>");

        var message = await queue.Reader.ReadAsync().AsTask().WaitAsync(TimeSpan.FromSeconds(5));
        Assert.Equal("player@example.com", message.To);
        Assert.Equal("Mã đặt lại mật khẩu AOC", message.Subject);
        Assert.Equal("<b>12345678</b>", message.HtmlBody);
    }
}
