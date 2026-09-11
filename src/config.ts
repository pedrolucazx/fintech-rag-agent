try {
  process.loadEnvFile();
} catch {
  // .env not present — rely on real environment variables (e.g. CI)
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
