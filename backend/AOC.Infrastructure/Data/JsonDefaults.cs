using System.Text.Json;
using System.Text.Json.Serialization;
using AOC.Domain.Contracts;

namespace AOC.Infrastructure.Data;


public enum UserRole { ADMIN, OPERATOR, PLAYER }

public enum MatchStatus { UPCOMING, LIVE, FINISHED }

public enum MatchKind { STANDARD }

public enum MatchEventKind { PICK, BUZZ, POWER }

public enum Visibility { PUBLIC, PRIVATE }

public enum QuestionStatus { DRAFT, PENDING, PUBLISHED, ARCHIVED }

public enum PlayerGroup { A, B }

public static class JsonDefaults
{
    public static readonly JsonSerializerOptions Options = Create();

    private static JsonSerializerOptions Create()
    {
        var options = new JsonSerializerOptions(JsonSerializerDefaults.Web)
        {
            DefaultIgnoreCondition = JsonIgnoreCondition.Never,
            PropertyNameCaseInsensitive = true
        };
        options.Converters.Add(new JsonStringEnumConverter());
        return options;
    }

    public static JsonElement Serialize<T>(T value) => JsonSerializer.SerializeToElement(value, Options);

    public static JsonElement Serialize(object value) => JsonSerializer.SerializeToElement(value, value.GetType(), Options);

    public static T? Deserialize<T>(JsonElement element)
        => element.ValueKind is JsonValueKind.Undefined or JsonValueKind.Null
            ? default
            : element.Deserialize<T>(Options);

    public static readonly JsonElement EmptyObject = JsonSerializer.SerializeToElement(new { });
}
