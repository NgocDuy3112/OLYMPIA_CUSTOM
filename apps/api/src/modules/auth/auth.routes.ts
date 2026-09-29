import type { FastifyInstance } from "fastify";
import {
  googleRedirect,
  googleCallback,
  getMe,
  logout,
  signup,
  login,
  staffLogin,
  serviceSession,
} from "./auth.service.js";
import {
  drizzleUserRepo,
  type UserRepo,
} from "../user/user.repo.js";

export async function authRoutes(
  app: FastifyInstance,
  opts: { repo?: UserRepo } = {},
) {
  const repo = opts.repo ?? drizzleUserRepo;
  app.get("/auth/google", googleRedirect);
  app.get("/auth/google/callback", googleCallback(app, repo));
  app.post("/auth/signup", signup(app, repo));
  app.post("/auth/login", login(app, repo));
  app.post("/auth/staff-login", staffLogin(app));
  // Server-to-server (MCP): userCode → sid. Guard Bearer MCP_SERVICE_TOKEN.
  app.post("/auth/service/session", serviceSession(app, repo));
  app.get("/auth/me", getMe(app));
  app.post("/auth/logout", logout(app));
}
