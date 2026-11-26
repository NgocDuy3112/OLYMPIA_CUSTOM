using System.Globalization;
using System.Text;

namespace AOC.Api.Modules.Audit;

public static class AuditCsv
{
    private static readonly string[] Columns =
    [
        "id", "createdAt", "action", "actorId", "actorName", "targetId", "targetName",
        "matchId", "ip", "userAgent", "details"
    ];

    public static string Build(IReadOnlyList<AuditEventRow> rows)
    {
        var csv = new StringBuilder();
        csv.Append(string.Join(',', Columns)).Append("\r\n");
        foreach (var row in rows)
        {
            csv.Append(string.Join(',',
                    Cell(row.Id.ToString()),
                    Cell(row.CreatedAt.ToString("yyyy-MM-ddTHH:mm:ss.fffZ", CultureInfo.InvariantCulture)),
                    Cell(row.Action),
                    Cell(row.ActorId?.ToString()),
                    Cell(row.ActorName),
                    Cell(row.TargetId?.ToString()),
                    Cell(row.TargetName),
                    Cell(row.MatchId?.ToString()),
                    Cell(row.Ip),
                    TextCell(row.UserAgent),
                    TextCell(row.Details?.GetRawText())))
                .Append("\r\n");
        }

        return csv.ToString();
    }

    private static string Cell(string? value)
    {
        if (string.IsNullOrEmpty(value)) return "";
        var escaped = value.Replace("\"", "\"\"");
        return NeedsQuotes(value) ? $"\"{escaped}\"" : escaped;
    }

    private static string TextCell(string? value)
    {
        if (string.IsNullOrEmpty(value)) return "";
        return Cell(IsFormulaLead(value[0]) ? "'" + value : value);
    }

    private static bool NeedsQuotes(string value)
        => value.Contains(',') || value.Contains('"') || value.Contains('\n') || value.Contains('\r');

    private static bool IsFormulaLead(char value) => value is '=' or '+' or '-' or '@';
}
