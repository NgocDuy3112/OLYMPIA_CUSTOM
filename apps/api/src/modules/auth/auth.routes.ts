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

export async function authRoutes(app: FastifyInstance) {
  app.get("/auth/google", googleRedirect);
  app.get("/auth/google/callback", googleCallback(app));
  app.post("/auth/signup", signup(app));
  app.post("/auth/login", login(app));
  app.post("/auth/staff-login", staffLogin(app));
  app.get("/auth/me", getMe(app));
  app.post("/auth/logout", logout(app));
}
