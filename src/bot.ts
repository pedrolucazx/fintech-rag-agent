import { Bot } from "grammy";
import { config } from "./config.js";
import { runHarness } from "./harness.js";
import { log } from "./logger.js";

const bot = new Bot(config.telegramBotToken);

bot.on("message:text", async (ctx) => {
  const chatId = String(ctx.chat.id);
  try {
    const reply = await runHarness(chatId, ctx.message.text);
    await ctx.reply(reply);
  } catch (err) {
    log.error("harness failed", { err: String(err) });
    await ctx.reply("Não consegui processar agora, tenta de novo em instantes.");
  }
});

bot.start();
log.info("bot started");
