import * as winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import {
  CHANNELS,
  ERROR_FILE_DAYS,
  LOG_DIR,
  LOG_LEVEL,
  LogChannel,
} from './logging.constants';
import { isSecretKey, REDACTED, scrubAny, scrubString } from './scrub-secrets';

/**
 * Winston equivalent of the ScrubSecrets tap: every record, on every
 * transport, is scrubbed before it is written. A secret scrubbed from the
 * file but not stdout (or vice versa) is a secret in a second store.
 */
const scrubFormat = winston.format((info) => {
  if (typeof info.message === 'string') {
    info.message = scrubString(info.message);
  } else {
    info.message = scrubAny(info.message);
  }
  for (const key of Object.keys(info)) {
    if (key === 'level' || key === 'message' || key === 'timestamp') continue;
    // scrubAny only inspects the value — a top-level `token` field needs the
    // key-name check too, same as Laravel's deep() pass over the record.
    info[key] = isSecretKey(key) ? REDACTED : scrubAny(info[key]);
  }
  return info;
});

const fileFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  scrubFormat(),
  winston.format.json(),
);

const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  scrubFormat(),
  winston.format.printf((info) => {
    const { timestamp, level, message, channel, context, stack, ...rest } =
      info as winston.Logform.TransformableInfo & {
        channel?: string;
        context?: string;
        stack?: string;
      };
    const meta = Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : '';
    const ctx = context ? ` (${context})` : '';
    const ch = channel && channel !== 'app' ? ` [${channel}]` : '';
    return `${timestamp} ${level.toUpperCase()}${ch}${ctx}: ${stack || message}${meta}`;
  }),
);

function dailyFile(filename: string, days: number, level?: string) {
  return new DailyRotateFile({
    dirname: LOG_DIR,
    filename: `${filename}-%DATE%.log`,
    datePattern: 'YYYY-MM-DD',
    maxFiles: `${days}d`,
    maxSize: '20m',
    zippedArchive: true,
    level,
    format: fileFormat,
  });
}

const consoleTransport = new winston.transports.Console({
  format: consoleFormat,
});

// One shared sink instance so every channel logger appends to the same
// rotated error file rather than each opening its own handle.
const sharedErrorFile = dailyFile('error', ERROR_FILE_DAYS, 'error');

const crashFile = (name: string) =>
  new DailyRotateFile({
    dirname: LOG_DIR,
    filename: `${name}-%DATE%.log`,
    datePattern: 'YYYY-MM-DD',
    maxFiles: '30d',
    zippedArchive: true,
    format: fileFormat,
  });

export function buildChannelLogger(name: LogChannel): winston.Logger {
  const transports: winston.transport[] = [
    dailyFile(name, CHANNELS[name]),
    consoleTransport,
  ];
  // Every channel's error+ records also land in error-YYYY-MM-DD.log — the
  // file equivalent of Laravel's alert_monitor catching every Log::error().
  transports.push(sharedErrorFile);

  const logger = winston.createLogger({
    level: LOG_LEVEL,
    defaultMeta: { channel: name },
    transports,
  });

  if (name === 'app') {
    // Process-level crashes would otherwise exist only inside docker logs,
    // and docker logs die with the container on the next deploy.
    logger.exceptions.handle(crashFile('exceptions'), consoleTransport);
    logger.rejections.handle(crashFile('rejections'), consoleTransport);
  }

  return logger;
}
