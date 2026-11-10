using Olympia.Domain.Contracts;
using Olympia.Domain.Engine;
using Xunit;

namespace Olympia.Tests.Engine;

public class MatchingTests
{
    private static Normalize N(bool caseSensitive = false, bool trim = true, bool stripAccents = true)
        => new(caseSensitive, trim, stripAccents);

    [Fact]
    public void Normalize_TrimsWhenAsked()
    {
        Assert.Equal("abc", Matching.NormalizeText("  abc  ", N()));
    }

    [Fact]
    public void Normalize_IsCaseInsensitiveByDefault()
    {
        Assert.Equal("abc", Matching.NormalizeText("ABC", N()));
    }

    [Fact]
    public void Normalize_KeepsCaseWhenCaseSensitive()
    {
        Assert.Equal("ABC", Matching.NormalizeText("ABC", N(caseSensitive: true)));
    }

    [Fact]
    public void Normalize_StripsVietnameseDiacritics()
    {
        Assert.Equal("dien bien phu", Matching.NormalizeText("Điện Biên Phủ", N()));
        Assert.Equal("ha noi", Matching.NormalizeText("Hà Nội", N()));
    }

    [Fact]
    public void Normalize_CanLeaveDiacriticsIntact()
    {
        Assert.Equal("hà nội", Matching.NormalizeText("Hà Nội", N(stripAccents: false)));
    }

    private static readonly QuestionPayload.Choice ChoicePayload = new(
        [
            new ChoiceOption("a", "A"),
            new ChoiceOption("b", "B"),
            new ChoiceOption("c", "C")
        ],
        ["a", "c"]);

    [Theory]
    [InlineData(new[] { "c", "a" }, true)]
    [InlineData(new[] { "c", "a", "a" }, true)]
    [InlineData(new[] { "a" }, false)]
    [InlineData(new[] { "a", "b", "c" }, false)]
    public void AutoMatch_Choice(string[] picked, bool expected)
    {
        Assert.Equal(expected,
            Matching.AutoMatch(QuestionKind.CHOICE, ChoicePayload, new SubmittedAnswerValue.Picked([.. picked])));
    }

    [Fact]
    public void AutoMatch_Choice_RejectsEmptyAndText()
    {
        Assert.False(Matching.AutoMatch(QuestionKind.CHOICE, ChoicePayload,
            new SubmittedAnswerValue.Picked([])));
        Assert.False(Matching.AutoMatch(QuestionKind.CHOICE, ChoicePayload,
            new SubmittedAnswerValue.Text("a,c")));
    }

    private static readonly QuestionPayload.Text TextPayload =
        new(["Hà Nội"], N());

    [Theory]
    [InlineData("Hà Nội", true)]
    [InlineData("  ha noi  ", true)]
    [InlineData("Hải Phòng", false)]
    [InlineData("", false)]
    public void AutoMatch_Text(string text, bool expected)
    {
        Assert.Equal(expected,
            Matching.AutoMatch(QuestionKind.TEXT, TextPayload, new SubmittedAnswerValue.Text(text)));
    }

    [Fact]
    public void AutoMatch_Text_RejectsPickedValue()
    {
        Assert.False(Matching.AutoMatch(QuestionKind.TEXT, TextPayload,
            new SubmittedAnswerValue.Picked(["Hà Nội"])));
    }

    [Fact]
    public void AutoMatch_Text_RespectsCaseSensitive()
    {
        var strict = new QuestionPayload.Text(["Ha Noi"], N(caseSensitive: true, stripAccents: false));
        Assert.False(Matching.AutoMatch(QuestionKind.TEXT, strict, new SubmittedAnswerValue.Text("ha noi")));
        Assert.True(Matching.AutoMatch(QuestionKind.TEXT, strict, new SubmittedAnswerValue.Text("Ha Noi")));
    }

    private static readonly QuestionPayload.Keyword KeywordPayload =
        new("Điện Biên Phủ", N());

    [Theory]
    [InlineData("dien bien phu", true)]
    [InlineData("ĐIỆN BIÊN PHỦ", true)]
    [InlineData("dien bien", false)]
    [InlineData("", false)]
    public void AutoMatch_Keyword(string text, bool expected)
    {
        Assert.Equal(expected,
            Matching.AutoMatch(QuestionKind.KEYWORD, KeywordPayload, new SubmittedAnswerValue.Text(text)));
    }
}
