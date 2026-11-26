using AOC.Api.Http;

namespace AOC.Api.Modules.Audit;

public sealed class AuditEventsService(AuditEventStore store)
{
    public Task<PageResult<AuditEventRow>> ListAsync(AuditFilter filter, Page page)
        => store.ListAsync(filter, page);

    public async Task<AuditActionsResponse> ActionsAsync()
        => new((await store.ActionsAsync()).ToArray());

    public async Task<AuditCsvExport> ExportAsync(AuditFilter filter)
    {
        var rows = await store.ExportAsync(filter);
        var fileName = $"audit-events-{DateTime.UtcNow:yyyyMMdd-HHmmss}.csv";
        return new AuditCsvExport(fileName, AuditCsv.Build(rows));
    }
}
