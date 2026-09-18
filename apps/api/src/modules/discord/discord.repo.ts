import { and, eq } from "drizzle-orm";
import {
  db,
  tournaments,
  tournamentPlayers,
  users,
} from "@oc/db";

export interface DiscordTournamentRow {
  id: string;
  tournamentCode: string;
  discordGuildId: string | null;
  discordRoleMap: string | null;
  discordNotifyChannelId: string | null;
}

export interface DiscordMemberRow {
  userCode: string;
  userName: string;
  role: string;
  discordUserId: string | null;
  discordNickname: string | null;
}

export interface DiscordPlayerRow {
  discordUserId: string | null;
  discordNickname: string | null;
  userName: string;
}

export interface DiscordRepo {
  findTournamentByCode(code: string): Promise<DiscordTournamentRow | null>;
  findMembership(
    tournamentId: string,
    playerId: string,
  ): Promise<{ role: string } | null>;
  listTournamentMembers(tournamentId: string): Promise<DiscordMemberRow[]>;
  findMemberByUserCode(
    tournamentId: string,
    userCode: string,
  ): Promise<DiscordMemberRow | null>;
  updateNicknameByDiscordId(
    tournamentId: string,
    discordUserId: string,
    nickname: string,
  ): Promise<void>;
  listPlayerDiscord(tournamentId: string): Promise<DiscordPlayerRow[]>;
}

export const drizzleDiscordRepo: DiscordRepo = {
  async findTournamentByCode(code: string) {
    const rows = await db
      .select({
        id: tournaments.id,
        tournamentCode: tournaments.tournamentCode,
        discordGuildId: tournaments.discordGuildId,
        discordRoleMap: tournaments.discordRoleMap,
        discordNotifyChannelId: tournaments.discordNotifyChannelId,
      })
      .from(tournaments)
      .where(
        and(
          eq(tournaments.tournamentCode, code),
          eq(tournaments.isDeleted, false),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  },

  async findMembership(tournamentId: string, playerId: string) {
    const rows = await db
      .select({ role: tournamentPlayers.role })
      .from(tournamentPlayers)
      .where(
        and(
          eq(tournamentPlayers.tournamentId, tournamentId),
          eq(tournamentPlayers.playerId, playerId),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  },

  async listTournamentMembers(tournamentId: string) {
    return db
      .select({
        userCode: users.userCode,
        userName: users.userName,
        role: tournamentPlayers.role,
        discordUserId: tournamentPlayers.discordUserId,
        discordNickname: tournamentPlayers.discordNickname,
      })
      .from(tournamentPlayers)
      .innerJoin(users, eq(tournamentPlayers.playerId, users.id))
      .where(eq(tournamentPlayers.tournamentId, tournamentId));
  },

  async findMemberByUserCode(tournamentId: string, userCode: string) {
    const rows = await db
      .select({
        userCode: users.userCode,
        userName: users.userName,
        role: tournamentPlayers.role,
        discordUserId: tournamentPlayers.discordUserId,
        discordNickname: tournamentPlayers.discordNickname,
      })
      .from(tournamentPlayers)
      .innerJoin(users, eq(tournamentPlayers.playerId, users.id))
      .where(
        and(
          eq(tournamentPlayers.tournamentId, tournamentId),
          eq(users.userCode, userCode),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  },

  async updateNicknameByDiscordId(
    tournamentId: string,
    discordUserId: string,
    nickname: string,
  ) {
    await db
      .update(tournamentPlayers)
      .set({ discordNickname: nickname })
      .where(
        and(
          eq(tournamentPlayers.tournamentId, tournamentId),
          eq(tournamentPlayers.discordUserId, discordUserId),
        ),
      );
  },

  async listPlayerDiscord(tournamentId: string) {
    return db
      .select({
        discordUserId: tournamentPlayers.discordUserId,
        discordNickname: tournamentPlayers.discordNickname,
        userName: users.userName,
      })
      .from(tournamentPlayers)
      .innerJoin(users, eq(tournamentPlayers.playerId, users.id))
      .where(
        and(
          eq(tournamentPlayers.tournamentId, tournamentId),
          eq(tournamentPlayers.role, "player"),
        ),
      );
  },
};

export function createInMemoryDiscordRepo(
  seedTournaments: DiscordTournamentRow[] = [],
  seedMembers: Array<DiscordMemberRow & { tournamentId: string }> = [],
): DiscordRepo & {
  tournaments: DiscordTournamentRow[];
  membersByTournament: Map<string, DiscordMemberRow[]>;
} {
  const tournamentList = [...seedTournaments];
  const membersByTournament = new Map<string, DiscordMemberRow[]>();
  for (const m of seedMembers) {
    const { tournamentId, ...rest } = m;
    const list = membersByTournament.get(tournamentId) ?? [];
    list.push({ ...rest });
    membersByTournament.set(tournamentId, list);
  }
  return {
    tournaments: tournamentList,
    membersByTournament,
    async findTournamentByCode(code) {
      return tournamentList.find((t) => t.tournamentCode === code) ?? null;
    },
    async findMembership(tournamentId, playerId) {
      // In-memory members carry userCode only; match playerId against userCode.
      const list = membersByTournament.get(tournamentId) ?? [];
      const found = list.find((m) => m.userCode === playerId);
      return found ? { role: found.role } : null;
    },
    async listTournamentMembers(tournamentId) {
      return [...(membersByTournament.get(tournamentId) ?? [])];
    },
    async findMemberByUserCode(tournamentId, userCode) {
      const list = membersByTournament.get(tournamentId) ?? [];
      return list.find((m) => m.userCode === userCode) ?? null;
    },
    async updateNicknameByDiscordId(tournamentId, discordUserId, nickname) {
      const list = membersByTournament.get(tournamentId) ?? [];
      for (const m of list) {
        if (m.discordUserId === discordUserId) m.discordNickname = nickname;
      }
    },
    async listPlayerDiscord(tournamentId) {
      const list = membersByTournament.get(tournamentId) ?? [];
      return list
        .filter((m) => m.role === "player")
        .map((m) => ({
          discordUserId: m.discordUserId,
          discordNickname: m.discordNickname,
          userName: m.userName,
        }));
    },
  };
}
