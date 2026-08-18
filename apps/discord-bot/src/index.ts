import { startBot } from "./bot.js";

startBot().catch((err) => {
  console.error("Bot failed to start:", err);
  process.exit(1);
});
