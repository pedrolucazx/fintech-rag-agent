import { Bot } from "grammy";
import { config } from "./config.js";
import { runHarness } from "./harness.js";
import { log } from "./logger.js";
import { isRateLimited } from "./rateLimit.js";

const bot = new Bot(config.telegramBotToken);

bot.on("message:text", async (ctx) => {
  const chatId = String(ctx.chat.id);
  const startedAt = Date.now();
  log.info("message received", { chatId, length: ctx.message.text.length });
  if (isRateLimited(chatId)) {
    log.warn("chat rate limited", { chatId });
    await ctx.reply("Você está enviando mensagens rápido demais, espera um pouco e tenta de novo.");
    return;
  }
  try {
    const reply = await runHarness(chatId, ctx.message.text);
    await ctx.reply(reply);
    log.info("message replied", { chatId, durationMs: Date.now() - startedAt });
  } catch (err) {
    log.error("harness failed", { chatId, durationMs: Date.now() - startedAt, err: String(err) });
    await ctx.reply(
      "Não consegui processar agora, tenta de novo em instantes.",
    );
  }
});

bot.start();
log.info("bot started");
