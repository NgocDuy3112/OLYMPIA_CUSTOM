using System.Text.Json;

namespace AOC.Api.Modules.Live;

internal static class JsonApiOptions
{
    public static readonly JsonSerializerOptions Options = Http.JsonApi.Options;
}
