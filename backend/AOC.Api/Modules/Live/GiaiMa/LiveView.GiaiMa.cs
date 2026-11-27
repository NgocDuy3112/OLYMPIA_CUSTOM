using System.Text.Json;
using AOC.Api.Shared;
using AOC.Infrastructure.Data;
using AOC.Domain.Contracts;
using AOC.Domain.Gameplay;
using AOC.Domain.Gameplay.Turns;

namespace AOC.Api.Modules.Live;

public static partial class LiveView
{
    private static Dictionary<string, object?> GiaiMaView(ViewInput input, GiaiMaState state)
    {
        var player = state.Players.FirstOrDefault(p => p.Id == input.UserId);
        var open = new List<object?>();
        var hintsLocked = state.HintWindow.Locked;
        var openHintContent = QuestionOf(input, state.OpenHint!);
        if (hintsLocked && !string.IsNullOrEmpty(input.UserId))
        {
            var row = input.Submitted.FirstOrDefault(s => s.QuestionId == state.OpenHint);
            var hintVerdict = row?.Verdict;
            if (hintVerdict != Verdict.CORRECT) openHintContent = null;
        }

        if (state.OpenHint is not null)
        {
            open.Add(OpenEntry(state.OpenHint,
                DeadlineWhileOpen(state.HintWindow, input.Now), openHintContent));
        }

        var keywordQuestion = (input.Questions ?? []).FirstOrDefault(q => q.Kind == QuestionKind.KEYWORD);
        var keywordCompact = "";
        var keywordKind = "mixed";
        if (keywordQuestion?.Payload is QuestionPayload.Keyword kwPayload)
        {
            keywordCompact = kwPayload.Code.Replace(" ", "");
            keywordKind = keywordCompact.Length == 0 ? "mixed"
                : keywordCompact.All(char.IsDigit) ? "digits"
                : keywordCompact.All(char.IsLetter) ? "letters"
                : "mixed";
        }
        var keywordRevealed = state.RevealedAnswer is not null && keywordQuestion is not null
            && state.RevealedAnswer == keywordQuestion.Id;

        string answerState = "none";
        string? openQuestionId = null;
        if (open.Count > 0)
        {
            openQuestionId = ((Dictionary<string, object?>)open[0]!)["questionId"]!.ToString()!;
            answerState = StateOf(input.Submitted, openQuestionId);
        }

        var hintTiles = (input.Questions ?? [])
            .Where(q => q.Kind == QuestionKind.TEXT && q.RoundId == "giai-ma")
            .OrderBy(q => q.Position)
            .Select((q, index) => new { q.Id, Tile = index })
            .ToDictionary(x => x.Id, x => x.Tile);
        var openTile = state.OpenHint is not null && hintTiles.TryGetValue(state.OpenHint, out var tile)
            ? tile
            : (int?) null;

        var me = new Dictionary<string, object?>
        {
            ["verdicts"] = VerdictsOf(input.Submitted),
            ["openTile"] = openTile,
            ["pickedTiles"] = state.Picked
                .Where(p => hintTiles.ContainsKey(p))
                .Select(p => hintTiles[p])
                .ToList(),
            ["keywordLocked"] = player?.KeywordLocked ?? false,
            ["eliminated"] = player?.Eliminated ?? false,
            ["keywordValue"] = player is null ? null : GiaiMaTurn.KeywordValueFor(state, input.UserId),
            ["revealedHints"] = (player?.Revealed ?? []).Select(questionId => (object)new Dictionary<string, object?>
            {
                ["questionId"] = questionId,
                ["question"] = QuestionOf(input, questionId)
            }).ToList(),
            ["hintsRevealed"] = player?.HintsRevealed ?? 0,
            ["answerState"] = answerState,
            ["mySubmission"] = MySubmissionOf(
                input.Submitted, openQuestionId, QuestionMatchOf(input, openQuestionId)),
            ["myKeywordSubmission"] = keywordQuestion is null
                ? null
                : MySubmissionOf(input.Submitted, keywordQuestion.Id,
                    QuestionMatchOf(input, keywordQuestion.Id))
        };

        var keywordDeadlineAt = GiaiMaTurn.KeywordWindowRunning(state, input.Now)
            ? state.KeywordClosesAt
            : null;
        var view = Base(input.MatchId, input.RoundId, input.Version,
            state.Step, open, RankTable(input.Table, input.TieBreak), me);
        view["selectedPlayerId"] = null;
        view["keywordDeadlineAt"] = keywordDeadlineAt;
        view["keywordCountdownClosed"] = state.KeywordClosesAt is not null
            && !GiaiMaTurn.KeywordWindowRunning(state, input.Now);
        view["keywordLength"] = keywordCompact.Length;
        view["keywordKind"] = keywordKind;
        if (keywordQuestion is null)
        {
            view["keyword"] = null;
        }
        else
        {
            view["keyword"] = new Dictionary<string, object?>
            {
                ["questionId"] = keywordQuestion.Id,
                ["question"] = QuestionView.Sanitize(keywordQuestion)
            };
        }
        if (keywordRevealed && keywordQuestion!.Payload is QuestionPayload.Keyword keywordPayload)
        {
            view["keywordCode"] = keywordPayload.Code;
        }
        var hintAnswers = new Dictionary<string, object?>();
        var hintVerdicts = new Dictionary<string, object?>();
        var consoleView = string.IsNullOrEmpty(input.UserId);
        foreach (var pair in hintTiles)
        {
            var isPicked = state.Picked.Contains(pair.Key);
            var row = consoleView || !isPicked
                ? null
                : input.Submitted.FirstOrDefault(s => s.QuestionId == pair.Key);
            var verdict = row?.Verdict;
            if (isPicked) hintVerdicts[$"{pair.Value}"] = verdict?.ToString();

            // opened hints: console always, the answering player when correct.
            // after the keyword is revealed: every hint's answer, everyone.
            var show = keywordRevealed || (isPicked && (consoleView || verdict == Verdict.CORRECT));
            var question = (input.Questions ?? []).FirstOrDefault(q => q.Id == pair.Key);
            if (show && question?.Payload is QuestionPayload.Text textPayload && textPayload.AcceptedAnswers.Count > 0)
                hintAnswers[$"{pair.Value}"] = textPayload.AcceptedAnswers[0];
        }
        view["hintAnswers"] = hintAnswers;

        var meHintVerdicts = new Dictionary<string, object?>(hintVerdicts);
        me["hintVerdicts"] = meHintVerdicts;
        return view;
    }
}
