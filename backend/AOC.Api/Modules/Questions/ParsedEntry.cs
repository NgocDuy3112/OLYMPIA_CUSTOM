using AOC.Infrastructure.Data.Entities;

namespace AOC.Api.Modules.Questions;

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
