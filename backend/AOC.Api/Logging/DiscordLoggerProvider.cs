using System.Collections.Concurrent;
using System.Net.Http.Json;
using System.Text;
using Microsoft.Extensions.Logging;
using AOC.Infrastructure.Configuration;

namespace AOC.Api.Logging;

/// <summary>
/// Mirrors WARNING+ console lines to a Discord webhook so the crew sees failures
/// in the channel they are already watching. Console remains the system of record;
/// this is a loud copy, not a second source of truth.
///
/// Three hard rules, because a logger must never make the show worse:
///  1. never throws — a failed delivery is dropped silently;
///  2. never blocks the request path — lines go into a bounded in-memory queue,
///     drained by one timer, at most ONE webhook post per window;
///  3. never logs its own failures — no recursion.
/// </summary>
public sealed class DiscordLoggerProvider : ILoggerProvider
{
    /// <summary>Discord's per-message content cap.</summary>
    public const int ContentLimit = 2000;

    private static readonly TimeSpan FlushEvery = TimeSpan.FromSeconds(5);
    private const int QueueCap = 200;
    private const int LinesPerFlush = 40;
    private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(10) };

    private readonly string? _webhook;
    private readonly LogLevel _min;
    private readonly Func<string, CancellationToken, Task> _send;
    private readonly ConcurrentQueue<string> _queue = new();
    private readonly Timer? _timer;
    private int _dropped;

    public DiscordLoggerProvider(DiscordLogOptions options)
        : this(options, (content, token) => PostAsync(options.WebhookUrl!, content, token))
    {
    }

    /// <summary>Test seam: capture the rendered payload instead of posting it.</summary>
    public DiscordLoggerProvider(DiscordLogOptions options, Func<string, CancellationToken, Task> send)
    {
        _webhook = options.WebhookUrl;
        _min = ParseLevel(options.Level);
        _send = send;
        if (_webhook is null) return;
        _timer = new Timer(_ => _ = FlushAsync(), null, FlushEvery, FlushEvery);
    }

    public ILogger CreateLogger(string categoryName) => new DiscordLogger(this, categoryName);

    /// <summary>Level gate: unconfigured webhook = completely inert.</summary>
    public bool IsLevelEnabled(LogLevel level) => _webhook is not null && level >= _min;

    /// <summary>Append one rendered line to the queue (drops the oldest when full).</summary>
    public void Enqueue(string line)
    {
        if (_queue.Count >= QueueCap && _queue.TryDequeue(out _))
            Interlocked.Increment(ref _dropped);
        _queue.Enqueue(line);
    }

    /// <summary>Drain the queue into ONE webhook message. Called by the timer every
    ///  five seconds — and by tests, directly. Failures are swallowed by design.</summary>
    public async Task FlushAsync(CancellationToken cancellationToken = default)
    {
        if (_webhook is null) return;

        var lines = new List<string>(LinesPerFlush);
        while (lines.Count < LinesPerFlush && _queue.TryDequeue(out var line))
            lines.Add(line);
        if (lines.Count == 0) return;

        var dropped = Interlocked.Exchange(ref _dropped, 0);
        // prepend: truncation eats the tail, and the fact that lines were lost
        // must never be the part that disappears
        if (dropped > 0) lines.Insert(0, $"⚠ {dropped} older line(s) dropped");

        try
        {
            await _send(Render(lines), cancellationToken);
        }
        catch
        {
            // a logger that complains about logging is worse than silence
        }
    }

    /// <summary>Join lines into one message, hard-truncated to Discord's cap.</summary>
    public static string Render(IReadOnlyList<string> lines)
    {
        var text = string.Join('\n', lines);
        return text.Length <= ContentLimit - 8 ? text : text[..(ContentLimit - 8)] + " …";
    }

    public void Dispose() => _timer?.Dispose();

    private static LogLevel ParseLevel(string raw) =>
        Enum.TryParse(raw, ignoreCase: true, out LogLevel level) ? level : LogLevel.Warning;

    private static async Task PostAsync(string webhook, string content, CancellationToken cancellationToken)
    {
        // The URL is the secret — never log it, only post to it.
        var response = await Http.PostAsJsonAsync(webhook, new { content }, cancellationToken);
        response.EnsureSuccessStatusCode();
    }

    private sealed class DiscordLogger(DiscordLoggerProvider owner, string category) : ILogger
    {
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

        public bool IsEnabled(LogLevel level) => owner.IsLevelEnabled(level);

        public void Log<TState>(
            LogLevel level,
            EventId eventId,
            TState state,
            Exception? exception,
            Func<TState, Exception?, string> formatter)
        {
            if (!IsEnabled(level)) return;

            var line = new StringBuilder(ContentLimit);
            line.Append('`').Append(DateTime.UtcNow.ToString("HH:mm:ss")).Append(" UTC` ");
            line.Append(level switch
            {
                LogLevel.Error or LogLevel.Critical => "🟥 ",
                LogLevel.Warning => "🟧 ",
                _ => "▫️ "
            });
            line.Append("**[").Append(level).Append("]** `").Append(ShortName(category)).Append("`\n");
            line.Append(formatter(state, exception));
            if (exception is not null)
                line.Append('\n').Append(exception.GetType().Name).Append(": ").Append(exception.Message);

            owner.Enqueue(line.ToString());
        }

        /// <summary>AOC.Api.Questions.ExcelImport → ExcelImport: enough to place it.</summary>
        private static string ShortName(string category)
        {
            var parts = category.Split('.', StringSplitOptions.RemoveEmptyEntries);
            return parts.Length <= 1 ? category : $"{parts[^2]}.{parts[^1]}";
        }
    }
}
