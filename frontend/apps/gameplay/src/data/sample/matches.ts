import type { Match } from "../schedule";

export const sampleMatches: Match[] = [
    {
        id: "qf-1",
        date: "2025-06-14",
        startTime: "09:30",
        round: "Quarterfinal 1",
        status: "FINISHED",
        players: [
            {
                id: "p1", name: "A. Voss", seed: 1, score: 24, rank: 1,
                roundScores: { "Khởi động": 10, "Giải mã": 6, "Bứt phá": 4, "Về đích": 4 }
            },
            {
                id: "p7", name: "D. Chen", seed: 8, score: 21, rank: 2,
                roundScores: { "Khởi động": 8, "Giải mã": 5, "Bứt phá": 5, "Về đích": 6 }
            },
            {
                id: "p5", name: "P. Okafor", seed: 4, score: 15, rank: 3,
                roundScores: { "Khởi động": 6, "Giải mã": 4, "Bứt phá": 3, "Về đích": 2 }
            },
            {
                id: "p8", name: "R. Lindqvist", seed: 5, score: 12, rank: 4,
                roundScores: { "Khởi động": 4, "Giải mã": 4, "Bứt phá": 2, "Về đích": 2 }
            },
        ],
    },
    {
        id: "qf-2",
        date: "2025-06-14",
        startTime: "11:00",
        round: "Quarterfinal 2",
        status: "FINISHED",
        players: [
            {
                id: "p2", name: "M. Tanaka", seed: 2, score: 26, rank: 1,
                roundScores: { "Khởi động": 10, "Giải mã": 6, "Bứt phá": 6, "Về đích": 4 }
            },
            {
                id: "p4", name: "L. Ruiz", seed: 7, score: 20, rank: 2,
                roundScores: { "Khởi động": 8, "Giải mã": 5, "Bứt phá": 4, "Về đích": 3 }
            },
            {
                id: "p6", name: "S. Novak", seed: 3, score: 14, rank: 3,
                roundScores: { "Khởi động": 6, "Giải mã": 4, "Bứt phá": 2, "Về đích": 2 }
            },
            {
                id: "p3", name: "K. Ibrahim", seed: 6, score: 10, rank: 4,
                roundScores: { "Khởi động": 4, "Giải mã": 3, "Bứt phá": 2, "Về đích": 1 }
            },
        ],
    },
    {
        id: "sf-a",
        date: "2025-06-14",
        startTime: "14:00",
        round: "Semifinal A",
        status: "LIVE",
        players: [
            {
                id: "p2", name: "M. Tanaka", seed: 2, score: 18, rank: 1,
                roundScores: { "Khởi động": 8, "Giải mã": 4, "Bứt phá": 4, "Về đích": 2 }
            },
            {
                id: "p1", name: "A. Voss", seed: 1, score: 18, rank: 2,
                roundScores: { "Khởi động": 6, "Giải mã": 5, "Bứt phá": 2, "Về đích": 5 }
            },
            {
                id: "p7", name: "D. Chen", seed: 8, score: 11, rank: 3,
                roundScores: { "Khởi động": 4, "Giải mã": 3, "Bứt phá": 2, "Về đích": 2 }
            },
            {
                id: "p4", name: "L. Ruiz", seed: 7, score: 9, rank: 4,
                roundScores: { "Khởi động": 4, "Giải mã": 2, "Bứt phá": 2, "Về đích": 1 }
            },
        ],
    },
    {
        id: "sf-b",
        date: "2025-06-15",
        startTime: "10:00",
        round: "Semifinal B",
        status: "UPCOMING",
        players: [
            { id: "p3", name: "K. Ibrahim", seed: 3 },
            { id: "p6", name: "S. Novak", seed: 4 },
            { id: "p5", name: "P. Okafor", seed: 5 },
            { id: "p8", name: "R. Lindqvist", seed: 6 },
        ],
    },
    {
        id: "bronze",
        date: "2025-06-15",
        startTime: "12:30",
        round: "Bronze match",
        status: "UPCOMING",
        players: [
            { id: "p4", name: "L. Ruiz", seed: 7 },
            { id: "p6", name: "S. Novak", seed: 4 },
            { id: "p8", name: "R. Lindqvist", seed: 6 },
        ],
    },
    {
        id: "final",
        date: "2025-06-15",
        startTime: "15:00",
        round: "Grand Final",
        status: "UPCOMING",
        players: [
            { id: "p2", name: "M. Tanaka", seed: 2 },
            { id: "p1", name: "A. Voss", seed: 1 },
            { id: "p7", name: "D. Chen", seed: 8 },
            { id: "p3", name: "K. Ibrahim", seed: 3 },
        ],
    },
]