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

export const config = {
  get telegramBotToken() {
    return required("TELEGRAM_BOT_TOKEN");
  },
  get nvidiaApiKey() {
    return required("NVIDIA_API_KEY");
  },
};
