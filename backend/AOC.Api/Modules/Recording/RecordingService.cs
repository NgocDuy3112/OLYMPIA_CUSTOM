using Livekit.Server.Sdk.Dotnet;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using AOC.Api.Http;
using AOC.Api.Modules.Tournaments;
using AOC.Infrastructure.Configuration;
using AOC.Infrastructure.Data;
using AOC.Infrastructure.Data.Entities;

namespace AOC.Api.Modules.Recording;

/// <summary>Port of recording/index.ts — LiveKit egress lifecycle for matches.</summary>
public sealed class RecordingService(AOCDbContext db, ILogger<RecordingService> logger)
{
    private const int FinalizePollMs = 5_000;
    private const int FinalizeMaxAttempts = 180; // 15 min: a large MP4 uploading to S3

    private static EgressServiceClient EgressClient()
    {
        var livekit = AppConfig.Instance.Livekit;
        var url = livekit.InternalUrl ?? livekit.Url;
        if (string.IsNullOrEmpty(url) || string.IsNullOrEmpty(livekit.ApiKey) || string.IsNullOrEmpty(livekit.ApiSecret))
            throw new RecordingError(
                "livekit is not configured (LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET)", 503);
        return new EgressServiceClient(url, livekit.ApiKey, livekit.ApiSecret);
    }

    /// <summary>The audience /record page rendered headless by egress.</summary>
    public static string RecordPageUrl(string tournamentId, string matchId)
    {
        var baseUrl = AppConfig.Instance.RecordPageBaseUrl
            ?? throw new RecordingError(
                "RECORD_PAGE_BASE_URL is not set — point it at the audience app origin", 503);
        return $"{baseUrl.TrimEnd('/')}/record/{tournamentId}/{matchId}";
    }

    private static string ObjectUrl(string key)
    {
        var s3 = AppConfig.Instance.S3;
        var baseUrl = (s3.Endpoint ?? $"https://s3.{s3.Region}.amazonaws.com").TrimEnd('/');
        return $"{baseUrl}/{s3.Bucket}/{key}";
    }

    public static bool IsTerminal(EgressStatus status) =>
        status is EgressStatus.EgressComplete or EgressStatus.EgressFailed
            or EgressStatus.EgressAborted or EgressStatus.EgressLimitReached;

    public static string EgressStatusLabel(EgressStatus status) => status switch
    {
        EgressStatus.EgressStarting => "STARTING",
        EgressStatus.EgressActive => "ACTIVE",
        EgressStatus.EgressEnding => "ENDING",
        EgressStatus.EgressComplete => "COMPLETE",
        EgressStatus.EgressFailed => "FAILED",
        EgressStatus.EgressAborted => "ABORTED",
        EgressStatus.EgressLimitReached => "LIMIT_REACHED",
        _ => "UNKNOWN"
    };

    private async Task<RecordingEntity?> FindActiveRecordingAsync(Guid matchId)
        => await db.Recordings.AsNoTracking()
            .FirstOrDefaultAsync(r => r.MatchId == matchId && r.Status == RecordingStatus.RECORDING);

    private static async Task<MatchEntity> RequireMatchRowAsync(AOCDbContext db, Guid tournamentId, Guid matchId)
    {
        var match = await db.Matches.AsNoTracking()
            .FirstOrDefaultAsync(m => m.Id == matchId && m.TournamentId == tournamentId);
        if (match is null) throw new RecordingError("match not found", 404);
        return match;
    }

    /// <summary>
    /// Read the job's true state and fold it into the row — a row must never stay
    /// RECORDING once its job is terminal (the partial unique index would wedge
    /// every future start for that match).
    /// </summary>
    private async Task<RecordingEntity> ReconcileAsync(RecordingEntity row)
    {
        if (row.Status != RecordingStatus.RECORDING || row.EgressId is null) return row;

        EgressInfo? info;
        try
        {
            var response = await EgressClient().ListEgress(new ListEgressRequest { EgressId = row.EgressId });
            info = response.Items.FirstOrDefault(i => i.EgressId == row.EgressId);
        }
        catch
        {
            return row; // egress unreachable — retry on next read
        }

        if (info is null)
        {
            row.Status = RecordingStatus.FAILED;
            row.StoppedAt = DateTime.UtcNow;
            row.Error = "egress job disappeared";
            await db.SaveChangesAsync();
            return row;
        }

        if (!IsTerminal(info.Status)) return row;
        if (info.Status == EgressStatus.EgressComplete)
        {
            row.Status = RecordingStatus.STOPPED;
            row.StoppedAt = DateTime.UtcNow;
        }
        else
        {
            row.Status = RecordingStatus.FAILED;
            row.StoppedAt = DateTime.UtcNow;
            row.Error = string.IsNullOrEmpty(info.Error) ? EgressStatusLabel(info.Status) : info.Error;
        }
        await db.SaveChangesAsync();
        return row;
    }

    private async Task ReconcileByEgressIdAsync(string egressId)
    {
        var row = await db.Recordings.AsNoTracking().FirstOrDefaultAsync(r => r.EgressId == egressId);
        if (row is null) return;
        var tracked = await db.Recordings.FirstAsync(r => r.Id == row.Id);
        await ReconcileAsync(tracked);
    }

    /// <summary>Poll after stopEgress until the upload finishes (file appears async).</summary>
    private async Task FinalizeLaterAsync(string egressId)
    {
        for (var attempt = 0; attempt < FinalizeMaxAttempts; attempt++)
        {
            await Task.Delay(FinalizePollMs);
            try
            {
                var response = await EgressClient().ListEgress(new ListEgressRequest { EgressId = egressId });
                var info = response.Items.FirstOrDefault(i => i.EgressId == egressId);
                if (info is null || IsTerminal(info.Status))
                {
                    await ReconcileByEgressIdAsync(egressId);
                    return;
                }
            }
            catch
            {
                // transient — next round
            }
        }
        // Give up quietly; reconcile-on-read finishes the job on the next GET.
    }

    public sealed record StartOptions(Guid? StartedBy = null);

    public async Task<RecordingEntity> StartRecordingAsync(string tournamentId, string matchId, StartOptions? options = null)
    {
        var tid = Guid.Parse(tournamentId);
        var mid = Guid.Parse(matchId);
        await RequireMatchRowAsync(db, tid, mid);

        var match = await db.Matches.AsNoTracking().FirstAsync(m => m.Id == mid);
        if (match.Status != MatchStatus.LIVE) throw new RecordingError("match is not LIVE", 409);
        if (await FindActiveRecordingAsync(mid) is not null)
            throw new RecordingError("recording already in progress", 409);

        var url = RecordPageUrl(tournamentId, matchId);
        var s3Key = $"recordings/{matchId}/{DateTime.UtcNow:yyyy-MM-ddTHH-mm-ss-fff}.mp4";

        EgressInfo info;
        try
        {
            info = await EgressClient().StartWebEgress(new WebEgressRequest
            {
                Url = url,
                FileOutputs =
                {
                    new EncodedFileOutput
                    {
                        FileType = EncodedFileType.Mp4,
                        Filepath = s3Key
                    }
                }
            });
        }
        catch (Exception err)
        {
            // Keep the failure visible: a FAILED row costs nothing and the
            // partial unique index only guards RECORDING ones.
            db.Recordings.Add(new RecordingEntity
            {
                MatchId = mid,
                Status = RecordingStatus.FAILED,
                S3Key = s3Key,
                StartedBy = options?.StartedBy,
                Error = err.Message
            });
            try { await db.SaveChangesAsync(); } catch { /* already visible */ }
            throw new RecordingError($"egress refused to start: {err.Message}", 502);
        }

        try
        {
            var row = new RecordingEntity
            {
                MatchId = mid,
                EgressId = info.EgressId,
                Status = RecordingStatus.RECORDING,
                S3Key = s3Key,
                StartedBy = options?.StartedBy
            };
            db.Recordings.Add(row);
            await db.SaveChangesAsync();
            return row;
        }
        catch (DbUpdateException err)
        {
            // Lost the race against a concurrent start — undo the egress job.
            try { await EgressClient().StopEgress(new StopEgressRequest { EgressId = info.EgressId }); }
            catch { /* best effort */ }
            if (err.InnerException is PostgresException { SqlState: "23505" })
                throw new RecordingError("recording already in progress", 409);
            throw;
        }
    }

    public sealed record StopResult(RecordingEntity Row, EgressStatus? EgressStatus);

    public async Task<StopResult> StopRecordingAsync(string matchId)
    {
        var mid = Guid.Parse(matchId);
        var active = await FindActiveRecordingAsync(mid);
        if (active?.EgressId is null) throw new RecordingError("no recording in progress", 409);

        EgressInfo info;
        try
        {
            info = await EgressClient().StopEgress(new StopEgressRequest { EgressId = active.EgressId });
        }
        catch (Exception err)
        {
            // The job may already be dead — reconcile instead of failing.
            var tracked = await db.Recordings.FirstAsync(r => r.Id == active.Id);
            var row = await ReconcileAsync(tracked);
            if (row.Status != RecordingStatus.RECORDING)
                return new StopResult(row, null);
            throw new RecordingError($"could not stop the recording: {err.Message}", 502);
        }

        if (IsTerminal(info.Status))
        {
            var tracked = await db.Recordings.FirstAsync(r => r.Id == active.Id);
            return new StopResult(await ReconcileAsync(tracked), info.Status);
        }

        _ = Task.Run(() => FinalizeLaterAsync(active.EgressId));
        var current = await db.Recordings.AsNoTracking().FirstAsync(r => r.Id == active.Id);
        return new StopResult(current, info.Status);
    }

    public async Task<List<object>> ListRecordingsAsync(string tournamentId, string matchId)
    {
        var tid = Guid.Parse(tournamentId);
        var mid = Guid.Parse(matchId);
        await RequireMatchRowAsync(db, tid, mid);

        var rows = await db.Recordings.AsNoTracking()
            .Where(r => r.MatchId == mid)
            .OrderByDescending(r => r.StartedAt)
            .ToListAsync();

        var items = new List<object>();
        foreach (var row in rows)
        {
            var tracked = await db.Recordings.FirstAsync(r => r.Id == row.Id);
            var fresh = await ReconcileAsync(tracked);

            string? url = null;
            if (fresh.Status == RecordingStatus.STOPPED
                && !string.IsNullOrEmpty(fresh.S3Key)
                && !string.IsNullOrEmpty(AppConfig.Instance.S3.Bucket))
            {
                url = ObjectUrl(fresh.S3Key);
            }

            items.Add(new
            {
                fresh.Id,
                fresh.MatchId,
                fresh.EgressId,
                Status = fresh.Status.ToString(),
                fresh.S3Key,
                fresh.StartedBy,
                fresh.StartedAt,
                fresh.StoppedAt,
                fresh.Error,
                Url = url
            });
        }
        return items;
    }

    // ---- lifecycle hooks (never block the show) --------------------------------

    public async Task AutoStartRecordingAsync(string tournamentId, string matchId)
    {
        try
        {
            await StartRecordingAsync(tournamentId, matchId);
        }
        catch (Exception err)
        {
            logger.LogError(err, "[recording] auto-start failed for match {MatchId}", matchId);
        }
    }

    public async Task AutoStopRecordingAsync(string matchId)
    {
        try
        {
            await StopRecordingAsync(matchId);
        }
        catch (RecordingError)
        {
            // nothing was recording
        }
        catch (Exception err)
        {
            logger.LogError(err, "[recording] auto-stop failed for match {MatchId}", matchId);
        }
    }
}
