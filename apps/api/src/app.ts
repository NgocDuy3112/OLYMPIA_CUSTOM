/**
 * createApp — assembles all Fastify plugins and routes.
 */

import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { registerCors } from "./plugins/cors.js";
import { registerWebSocket } from "./plugins/websocket.js";
import valkeyPlugin from "./plugins/valkey.js";
import s3Plugin from "./plugins/s3.js";
import { errorHandler } from "./utils/errors.js";
import { getEnv } from "./config/env.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { userRoutes } from "./modules/user/user.routes.js";
import { matchRoutes } from "./modules/match/match.routes.js";
import { questionRoutes } from "./modules/question/question.routes.js";
import { bankEventsRoutes } from "./modules/question/bank-events.js";
import { answerRoutes } from "./modules/answer/answer.routes.js";
import { recordRoutes } from "./modules/record/record.routes.js";
import { scoreboardRoutes } from "./modules/scoreboard/scoreboard.routes.js";
import { scoreReviewRoutes } from "./modules/score-review/score-review.routes.js";
import { agentRoutes } from "./modules/agent/agent.routes.js";
import { mediaRoutes } from "./modules/media/media.routes.js";
import { tournamentRoutes } from "./modules/tournament/tournament.routes.js";
import { templateRoutes } from "./modules/template/template.routes.js";
import { discordRoutes } from "./modules/discord/discord.routes.js";
import { checkpointRoutes } from "./modules/checkpoint/checkpoint.routes.js";
import { auditRoutes } from "./modules/audit/audit.routes.js";
import { qualifierRoutes } from "./modules/qualifier/qualifier.routes.js";
import { questionSetRoutes } from "./modules/question-set/question-set.routes.js";
import { metricsRoutes } from "./modules/metrics/metrics.routes.js";
import { startCheckpointJob } from "./state/checkpoint.service.js";
import { wsRoute } from "./modules/ws/ws.route.js";

export async function createApp() {
  const env = getEnv();
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      transport:
        env.NODE_ENV !== "production"
          ? { target: "pino-pretty", options: { colorize: true } }
          : undefined,
    },
  });

  // Type provider
  app.withTypeProvider<ZodTypeProvider>();

  // Plugins
  await app.register(cookie);
  await registerCors(app);
  await registerWebSocket(app);
  await app.register(valkeyPlugin);
  await app.register(s3Plugin);

  // Error handler
  app.setErrorHandler(errorHandler);

  // Health check
  app.get("/health", async () => ({ status: "healthy" }));

  // Prometheus metrics (no /api prefix — scraped on internal network)
  await app.register(metricsRoutes);

  // API routes
  await app.register(authRoutes, { prefix: "/api" });
  await app.register(userRoutes, { prefix: "/api" });
  await app.register(matchRoutes, { prefix: "/api" });
  await app.register(questionRoutes, { prefix: "/api" });
  await app.register(bankEventsRoutes, { prefix: "/api" });
  await app.register(answerRoutes, { prefix: "/api" });
  await app.register(recordRoutes, { prefix: "/api" });
  await app.register(scoreboardRoutes, { prefix: "/api" });
  await app.register(scoreReviewRoutes, { prefix: "/api" });
  await app.register(agentRoutes, { prefix: "/api" });
  await app.register(mediaRoutes, { prefix: "/api" });
  await app.register(tournamentRoutes, { prefix: "/api" });
  await app.register(templateRoutes, { prefix: "/api" });
  await app.register(discordRoutes, { prefix: "/api" });
  await app.register(checkpointRoutes, { prefix: "/api" });
  await app.register(auditRoutes, { prefix: "/api" });
  await app.register(qualifierRoutes, { prefix: "/api" });
  await app.register(questionSetRoutes, { prefix: "/api" });

  // Background: snapshot Valkey match state every 30s
  const checkpointJob = startCheckpointJob(app);
  app.addHook("onClose", async () => {
    checkpointJob.stop();
  });

  // WebSocket route
  await app.register(wsRoute);

  return app;
}
