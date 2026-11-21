using AOC.Infrastructure.Data.Entities;

namespace AOC.Api.Modules.Questions;

public class SourceCells
{
    public string Question { get; set; } = "";
    public string Answer { get; set; } = "";
    public string Explanation { get; set; } = "";
    public string Note { get; set; } = "";
    public string Media { get; set; } = "";
}

public sealed class ParsedEntry(
    ExcelImport.MappedRow mapped,
    ExcelImport.RowSummary summary,
    SourceCells cells)
{
    public ExcelImport.MappedRow Mapped { get; set; } = mapped;
    public ExcelImport.RowSummary Summary { get; } = summary;
    public SourceCells Cells { get; } = cells;
    public AOC.Infrastructure.Media.MediaAttachment? Attachment { get; set; }
}
