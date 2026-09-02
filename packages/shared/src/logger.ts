/**
 * Structured logger — one JSON object per line, written to stdout (info/debug) or
 * stderr (warn/error). docs/10-target-architecture.md §9 calls for a correlation id
 * per job run persisted to `app_events`; `child()` carries fixed fields (e.g.
 * `correlationId`) onto every subsequent call without repeating them at each call site.
 *
 * In production these lines are the whole record: the Windows service captures the process's
 * stdout/stderr into `DATA_DIR\logs\` and WinSW rotates them (doc 14 §5 step 7). Nothing reads
 * them back afterwards, so a line that serialises badly is a line that is simply gone. Three
 * things are therefore handled here rather than at each call site (all three added 2026-09-03):
 *
 * - **`Error` values.** `JSON.stringify(new Error('boom'))` is `{}` — `name`, `message` and
 *   `stack` are all non-enumerable. Every `logger.error('...', { error })` in this repository
 *   was writing an empty object where the cause of the failure should have been. Errors are
 *   expanded explicitly, `cause` chain included.
 * - **`bigint` values.** Money is `bigint` in this codebase (CLAUDE.md), and `JSON.stringify`
 *   *throws* on one. A log call is the last place that may throw: it would turn a logged
 *   failure into an unlogged crash. They are written as decimal strings.
 * - **Secrets.** Marketplace credentials travel in request/response objects that end up attached
 *   to errors. A key whose *name* says it carries a credential is replaced with `[redacted]`
 *   before it can reach a log file or `app_events`.
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

/**
 * Key names whose *value* is never safe to write. Matched case-insensitively against the whole
 * key, so `apiSecret`, `API_KEY` and `x-authorization` are all caught. Deliberately matched on
 * the name rather than on the value's shape: guessing at "does this string look like a token?"
 * both misses real secrets and mangles ordinary data.
 */
const SENSITIVE_KEY =
  /(pass(word|phrase)?|secret|token|api[-_]?key|authorization|credential|cookie|private[-_]?key|signature)/i;

const REDACTED = '[redacted]';

/** Bound on how deep a nested value is walked; anything deeper is summarised, not dropped. */
const MAX_DEPTH = 6;

function serialiseError(error: Error, depth: number, seen: WeakSet<object>): LogFields {
  const record: LogFields = {
    name: error.name,
    message: error.message,
    stack: error.stack,
  };
  if (error.cause !== undefined) {
    record.cause = sanitise(error.cause, depth + 1, seen);
  }
  // Adapters attach their own fields to errors (status codes, marketplace payloads); those are
  // enumerable and are exactly what makes a production failure diagnosable.
  for (const key of Object.keys(error)) {
    if (key in record) continue;
    record[key] = SENSITIVE_KEY.test(key)
      ? REDACTED
      : sanitise((error as unknown as LogFields)[key], depth + 1, seen);
  }
  return record;
}

function sanitise(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (value === null || value === undefined) return value;

  switch (typeof value) {
    case 'bigint':
      return value.toString();
    case 'function':
      return `[function ${value.name || 'anonymous'}]`;
    case 'symbol':
      return value.toString();
    case 'string':
    case 'number':
    case 'boolean':
      return value;
    default:
      break;
  }

  if (value instanceof Date) return value.toISOString();

  if (value instanceof Error) {
    if (seen.has(value)) return '[circular]';
    if (depth > MAX_DEPTH) return `${value.name}: ${value.message}`;
    seen.add(value);
    return serialiseError(value, depth, seen);
  }

  const object = value as object;
  if (seen.has(object)) return '[circular]';
  if (depth > MAX_DEPTH) return '[truncated]';
  seen.add(object);

  if (Array.isArray(value)) {
    return value.map((item) => sanitise(item, depth + 1, seen));
  }
  if (value instanceof Map) {
    return Object.fromEntries(
      [...value.entries()].map(([key, item]) => [
        String(key),
        SENSITIVE_KEY.test(String(key)) ? REDACTED : sanitise(item, depth + 1, seen),
      ]),
    );
  }
  if (value instanceof Set) {
    return [...value.values()].map((item) => sanitise(item, depth + 1, seen));
  }

  const result: LogFields = {};
  for (const [key, item] of Object.entries(value as LogFields)) {
    result[key] = SENSITIVE_KEY.test(key) ? REDACTED : sanitise(item, depth + 1, seen);
  }
  return result;
}

/**
 * The same treatment `logger.*` fields get, exposed for callers that must hand a value to
 * something other than a `Logger` — the process-level crash handlers, which also write the
 * failure to `app_events`.
 */
export function sanitiseLogValue(value: unknown): unknown {
  return sanitise(value, 0, new WeakSet<object>());
}

function write(
  sink: LogSink,
  level: LogLevel,
  now: () => string,
  name: string,
  bindings: LogFields,
  message: string,
  fields: LogFields | undefined,
): void {
  const seen = new WeakSet<object>();
  const record: LogFields = {
    time: now(),
    level,
    name,
    ...(sanitise(bindings, 0, seen) as LogFields),
    message,
    ...(fields ? (sanitise(fields, 0, seen) as LogFields) : {}),
  };
  try {
    sink(JSON.stringify(record));
  } catch (error) {
    // Last resort. Losing one field's detail is survivable; losing the fact that anything was
    // logged at all is not — that is the failure this module exists to prevent.
    sink(
      JSON.stringify({
        time: record.time,
        level,
        name,
        message,
        logSerialisationError: error instanceof Error ? error.message : String(error),
      }),
    );
  }
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
