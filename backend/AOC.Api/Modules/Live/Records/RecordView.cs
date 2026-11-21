namespace AOC.Api.Modules.Live;

internal sealed record RecordView<S>(LiveRecord<S> Inner) : ILiveRecordView<S>
{
    public int Version => Inner.Version;
    public string RoundId => Inner.RoundId;
    public S State => Inner.State;
    public Dictionary<string, S> Archive => Inner.Archive;
}
