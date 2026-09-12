try {
  process.loadEnvFile();
} catch (err) {
  // Missing .env is fine (e.g. CI sets real env vars instead) — anything
  // else (a malformed .env, a permission error) should fail loudly, not
  // silently leave every var unset.
  if (!(err instanceof Error && "code" in err && err.code === "ENOENT")) {
    throw err;
  }
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name} (see .env.example)`);
  }
  return value;
}

function optional(name: string, defaultValue: string): string {
  return process.env[name] || defaultValue;
}

export const config = {
  get telegramBotToken() {
    return required("TELEGRAM_BOT_TOKEN");
  },
  get nvidiaApiKey() {
    return required("NVIDIA_API_KEY");
  },
  get nvidiaModel() {
    return optional("NVIDIA_MODEL", "nvidia/nemotron-3-super-120b-a12b");
  },
  get llmProvider() {
    return optional("LLM_PROVIDER", "nvidia");
  },
  get geminiModel() {
    return optional("GEMINI_MODEL", "gemini-2.5-flash");
  },
  get geminiApiKey() {
    return optional("GEMINI_API_KEY", "");
  },
  get embeddingsProvider() {
    return optional("EMBEDDINGS_PROVIDER", "xenova");
  },
  get voyageApiKey() {
    return optional("VOYAGE_API_KEY", "");
  },
};
