import type { FastifyInstance } from "fastify";
import {
  googleRedirect,
  googleCallback,
  getMe,
  logout,
  signup,
  login,
  staffLogin,
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
  app.get("/auth/me", getMe(app));
  app.post("/auth/logout", logout(app));
}
