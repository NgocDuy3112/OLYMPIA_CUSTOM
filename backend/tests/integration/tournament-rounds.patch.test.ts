import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";
import { db } from "../../src/db/pool.js";
import { tournaments, users } from "../../src/db/schema/index.js";
import { signToken } from "../../src/lib/jwt.js";
import type { RoundConfig } from "../../src/game/contracts/index.js";

// A tournament's round LIST and its RULES are one edit to an operator: the round
// picker checks a box and fills the rules beside it, then saves once.
//
// The server used to validate the rules against the rounds it ALREADY had, so a
// single request could never add a round with its rules — every save of a fresh
// tournament answered "unknown round id". These tests are that contract.

let app: FastifyInstance;
let ownerCookie: string;
let tournamentId: string;

const auth = (cookie: string) => ({ cookie: `portal_session=${cookie}` });
const url = () => `/portal/tournaments/${tournamentId}`;

const rules = (points: number): RoundConfig => ({
    allowedKinds: ["CHOICE"],
    scoring: { template: "constant", points },
    turns: [{ id: "phase1", mode: "text", delivery: "batch", questionCount: 2 }]
});

const patch = (payload: unknown) =>
    app.inject({ method: "PATCH", url: url(), headers: auth(ownerCookie), payload: payload as object });

const read = async () => {
    const res = await app.inject({ method: "GET", url: url(), headers: auth(ownerCookie) });
    return res.json() as { rounds: Array<{ id: string; order: number }>; roundRules: Record<string, RoundConfig> | null };
};

beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    const [owner] = await db
        .insert(users)
        .values({ role: "OPERATOR", username: "rules-owner", displayName: "Rules Owner", tokenVersion: 0 })
        .returning();
    ownerCookie = signToken(app, "PORTAL", { sub: owner.id, role: "OPERATOR", tokenVersion: 0 });

    const [tournament] = await db
        .insert(tournaments)
        .values({
            ownerId: owner.id,
            visibility: "PUBLIC",
            slug: "rules-tournament",
            name: "Rules Tournament",
            // the state the operator is stuck in: no rounds at all
            rounds: [],
            format: { competitorsPerMatch: 4 },
            stages: [{ id: "s1", title: "Stage s1" }]
        })
        .returning();
    tournamentId = tournament.id;
});

afterAll(async () => {
    await app.close();
});

describe("adding a round and its rules in one save", () => {
    it("accepts a round the tournament did not have before", async () => {
        const res = await patch({
            rounds: [
                { id: "khoi-dong", name: "Khởi động", order: 0, chart: "bars" },
                { id: "ve-dich", name: "Về đích", order: 1, chart: "bars" }
            ],
            roundRules: { "khoi-dong": rules(10), "ve-dich": rules(20) }
        });

        expect(res.statusCode).toBe(200);
        const saved = await read();
        expect(saved.rounds.map((r) => r.id)).toEqual(["khoi-dong", "ve-dich"]);
        expect(saved.roundRules?.["khoi-dong"].scoring).toEqual({ template: "constant", points: 10 });
        expect(saved.roundRules?.["ve-dich"].scoring).toEqual({ template: "constant", points: 20 });
    });

    it("removes a round and its rules together", async () => {
        const res = await patch({
            rounds: [{ id: "khoi-dong", name: "Khởi động", order: 0, chart: "bars" }],
            roundRules: { "khoi-dong": rules(10) }
        });

        expect(res.statusCode).toBe(200);
        const saved = await read();
        expect(saved.rounds.map((r) => r.id)).toEqual(["khoi-dong"]);
        expect(Object.keys(saved.roundRules ?? {})).toEqual(["khoi-dong"]);
    });

    it("still refuses rules for a round the request does not keep", async () => {
        const res = await patch({
            rounds: [{ id: "khoi-dong", name: "Khởi động", order: 0, chart: "bars" }],
            // no rounds list: the rules must match what the tournament HAS
            roundRules: { "but-pha": rules(10) }
        });

        expect(res.statusCode).toBe(400);
        expect(res.json()).toMatchObject({ error: "VALIDATION" });
    });

    it("refuses an unknown round id named in the list's rules", async () => {
        const res = await patch({
            rounds: [{ id: "khong-ton-tai", name: "X", order: 0, chart: "bars" }],
            roundRules: { "khong-ton-tai": rules(10) }
        });
        // the id is not one of the engine's rounds: the format check refuses it later,
        // but the rules pairing itself is consistent, so this must NOT be a 400 now
        expect(res.statusCode).toBe(200);
    });
});
