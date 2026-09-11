function line(level: string, msg: string, meta?: object): string {
  return meta ? `[${level}] ${msg} ${JSON.stringify(meta)}` : `[${level}] ${msg}`;
}

export const log = {
  info: (msg: string, meta?: object) => console.log(line("info", msg, meta)),
  warn: (msg: string, meta?: object) => console.warn(line("warn", msg, meta)),
  error: (msg: string, meta?: object) => console.error(line("error", msg, meta)),
};
