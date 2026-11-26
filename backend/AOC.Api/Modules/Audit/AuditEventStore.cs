using Microsoft.EntityFrameworkCore;
using AOC.Api.Http;
using AOC.Infrastructure.Data;
using AOC.Infrastructure.Data.Entities;

namespace AOC.Api.Modules.Audit;

public sealed class AuditEventStore(AOCDbContext db)
{
    public async Task<PageResult<AuditEventRow>> ListAsync(AuditFilter filter, Page page)
    {
        var query = await FilteredAsync(filter);
        var total = await query.CountAsync();
        var items = await Project(query
                .OrderByDescending(e => e.CreatedAt)
                .ThenByDescending(e => e.Id)
                .Skip(page.Offset)
                .Take(page.Limit))
            .ToListAsync();

        return Pagination.Result(items, total, page);
    }

    private async Task<IQueryable<AuditEventEntity>> FilteredAsync(AuditFilter filter)
    {
        var query = db.AuditEvents.AsNoTracking();

        if (filter.Actions.Count > 0)
        {
            var actions = filter.Actions.ToArray();
            query = query.Where(e => actions.Contains(e.Action));
        }

        if (filter.ActorId is { } actorId)
            query = query.Where(e => e.ActorId == actorId);

        if (filter.TargetId is { } targetId)
            query = query.Where(e => e.TargetId == targetId);

        if (filter.MatchId is { } matchId)
            query = query.Where(e => e.MatchId == matchId);

        if (filter.From is { } from)
            query = query.Where(e => e.CreatedAt >= from);

        if (filter.To is { } to)
            query = query.Where(e => e.CreatedAt <= to);

        if (filter.Search is { } term)
            query = await SearchAsync(query, term);

        return query;
    }

    private async Task<IQueryable<AuditEventEntity>> SearchAsync(
        IQueryable<AuditEventEntity> query, string term)
    {
        var pattern = LikePattern(term);
        var detailMatches = await db.Database.SqlQueryRaw<Guid>(
                "SELECT \"id\" AS \"Value\" FROM \"audit_events\" WHERE \"details\"::text ILIKE {0}",
                pattern)
            .ToListAsync();

        return query.Where(e =>
            EF.Functions.ILike(e.Action, pattern)
            || (e.Ip != null && EF.Functions.ILike(e.Ip, pattern))
            || db.Users.Any(u => u.Id == e.ActorId
                                 && (EF.Functions.ILike(u.Username, pattern)
                                     || EF.Functions.ILike(u.DisplayName, pattern)))
            || db.Users.Any(u => u.Id == e.TargetId
                                 && (EF.Functions.ILike(u.Username, pattern)
                                     || EF.Functions.ILike(u.DisplayName, pattern)))
            || detailMatches.Contains(e.Id));
    }

    private IQueryable<AuditEventRow> Project(IQueryable<AuditEventEntity> query)
        => query.Select(e => new AuditEventRow(
            e.Id,
            e.Action,
            e.ActorId,
            db.Users.Where(u => u.Id == e.ActorId).Select(u => u.DisplayName).FirstOrDefault(),
            e.TargetId,
            db.Users.Where(u => u.Id == e.TargetId).Select(u => u.DisplayName).FirstOrDefault(),
            e.MatchId,
            e.Details,
            e.Ip,
            e.UserAgent,
            e.CreatedAt));

    private static string LikePattern(string term)
        => "%" + term
            .Replace("\\", "\\\\")
            .Replace("%", "\\%")
            .Replace("_", "\\_") + "%";
}
