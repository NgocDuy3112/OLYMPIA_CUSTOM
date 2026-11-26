using System.Threading.Channels;

namespace AOC.Infrastructure.Email;

public sealed class EmailQueue
{
    private readonly Channel<EmailMessage> _queue = Channel.CreateUnbounded<EmailMessage>(
        new UnboundedChannelOptions { SingleReader = true });

    public bool Enqueue(EmailMessage message) => _queue.Writer.TryWrite(message);

    public ChannelReader<EmailMessage> Reader => _queue.Reader;
}
