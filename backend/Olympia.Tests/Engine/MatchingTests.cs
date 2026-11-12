using Olympia.Domain.Contracts;
using Olympia.Domain.Engine;
using Xunit;

namespace Olympia.Tests.Engine;

public class MatchingTests
{
    [Fact]
    public void NormalizeText_Trims()
    {
        Assert.Equal("abc", Matching.NormalizeText("  abc  "));
    }

    [Fact]
    public void NormalizeText_IgnoresCase()
    {
        Assert.Equal("abc", Matching.NormalizeText("ABC"));
    }

    [Fact]
    public void NormalizeText_KeepsDiacritics()
    {
        Assert.Equal("hà nội", Matching.NormalizeText("Hà Nội"));
        Assert.Equal("điện biên phủ", Matching.NormalizeText("  Điện Biên Phủ "));
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
        new(["Hà Nội"]);

    [Theory]
    [InlineData("Hà Nội", true)]
    [InlineData("  Hà Nội  ", true)]
    [InlineData("hà nội", true)]
    [InlineData("ha noi", false)]
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

    private static readonly QuestionPayload.Keyword KeywordPayload =
        new("Điện Biên Phủ");

    [Theory]
    [InlineData("  điện biên phủ ", true)]
    [InlineData("ĐIỆN BIÊN PHỦ", true)]
    [InlineData("dien bien phu", false)]
    [InlineData("dien bien", false)]
    [InlineData("", false)]
    public void AutoMatch_Keyword(string text, bool expected)
    {
        Assert.Equal(expected,
            Matching.AutoMatch(QuestionKind.KEYWORD, KeywordPayload, new SubmittedAnswerValue.Text(text)));
    }
}
