/** Structured JSON logs (one line per event) for the hosting provider's log collector. Never log secrets or tokens. */
type Fields = Record<string, unknown>;

function write(level: "info" | "warn" | "error", event: string, fields?: Fields) {
  const line = JSON.stringify({ t: new Date().toISOString(), level, event, ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else if (process.env.LOG_QUIET !== "1") console.log(line);
}

export const log = {
  info: (event: string, fields?: Fields) => write("info", event, fields),
  warn: (event: string, fields?: Fields) => write("warn", event, fields),
  error: (event: string, fields?: Fields) => write("error", event, fields),
};
