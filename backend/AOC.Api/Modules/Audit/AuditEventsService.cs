using AOC.Api.Http;

namespace AOC.Api.Modules.Audit;

public sealed class AuditEventsService(AuditEventStore store)
{
    public Task<PageResult<AuditEventRow>> ListAsync(AuditFilter filter, Page page)
        => store.ListAsync(filter, page);

    public async Task<AuditActionsResponse> ActionsAsync()
        => new((await store.ActionsAsync()).ToArray());
}
