/**
 * Structured logger — one JSON object per line, written to stdout (info/debug) or
 * stderr (warn/error). docs/10-target-architecture.md §9 calls for a correlation id
 * per job run persisted to `app_events`; `child()` carries fixed fields (e.g.
 * `correlationId`) onto every subsequent call without repeating them at each call site.
 */

export type LogFields = Record<string, unknown>;

export type Logger = {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
  child(bindings: LogFields): Logger;
};

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogSink = (line: string) => void;

export type LoggerOptions = {
  name: string;
  /** Overridable for tests; defaults to console.log / console.error. */
  sinks?: { out: LogSink; err: LogSink };
  /** Overridable for tests so log output is deterministic. */
  now?: () => string;
};

const defaultNow = (): string => new Date().toISOString();

function write(
  sink: LogSink,
  level: LogLevel,
  now: () => string,
  name: string,
  bindings: LogFields,
  message: string,
  fields: LogFields | undefined,
): void {
  const record = {
    time: now(),
    level,
    name,
    ...bindings,
    message,
    ...fields,
  };
  sink(JSON.stringify(record));
}

export function createLogger(options: LoggerOptions, bindings: LogFields = {}): Logger {
  const out = options.sinks?.out ?? ((line: string) => console.log(line));
  const err = options.sinks?.err ?? ((line: string) => console.error(line));
  const now = options.now ?? defaultNow;

  return {
    debug: (message, fields) => write(out, 'debug', now, options.name, bindings, message, fields),
    info: (message, fields) => write(out, 'info', now, options.name, bindings, message, fields),
    warn: (message, fields) => write(err, 'warn', now, options.name, bindings, message, fields),
    error: (message, fields) => write(err, 'error', now, options.name, bindings, message, fields),
    child: (childBindings) => createLogger(options, { ...bindings, ...childBindings }),
  };
}
