using AOC.Api.Shared;
using AOC.Domain.Contracts;
using Xunit;

namespace AOC.Tests.Questions;

public class AnswerRowDisplayTests
{
    [Fact]
    public void TextValue_ShowsTheTypedAnswer()
    {
        Assert.Equal("Hà Nội", QuestionView.AnswerRowDisplay(new AnswerValue.Text("Hà Nội"), null));
    }

    [Fact]
    public void BlankText_ShowsNothing()
    {
        Assert.Null(QuestionView.AnswerRowDisplay(new AnswerValue.Text("   "), null));
    }

    [Fact]
    public void PickedWithoutQuestion_FallsBackToRawIds()
    {
        Assert.Equal("a, b", QuestionView.AnswerRowDisplay(new AnswerValue.Picked(["a", "b"]), null));
    }

    [Fact]
    public void PickedOnAChoiceQuestion_MapsToOptionTexts()
    {
        var question = new MatchQuestion
        {
            Id = "q1",
            RoundId = "ve-dich",
            TurnId = "phase1",
            Position = 1,
            Mode = QuestionMode.text,
            Kind = QuestionKind.CHOICE,
            QuestionText = "Thủ đô?",
            Points = 20,
            Payload = new QuestionPayload.Choice(
                [new ChoiceOption("a", "Hà Nội"), new ChoiceOption("b", "Đà Nẵng")],
                ["a"]),
            SourceId = "s1",
        };

        Assert.Equal(
            "Hà Nội, Đà Nẵng",
            QuestionView.AnswerRowDisplay(new AnswerValue.Picked(["a", "b"]), question));
    }

    [Fact]
    public void OralValue_HasNoTextToShow()
    {
        Assert.Null(QuestionView.AnswerRowDisplay(new AnswerValue.Oral(), null));
    }
}
