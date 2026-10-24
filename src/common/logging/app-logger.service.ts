import { Injectable, LoggerService } from '@nestjs/common';
import * as winston from 'winston';
import { CHANNELS, LogChannel } from './logging.constants';
import { buildChannelLogger } from './winston.factory';

/**
 * Laravel-style channel logging for Nest.
 *
 * Registered as the global logger via `app.useLogger(appLogger)` in main.ts —
 * every existing `new Logger(X.name)` call in the codebase routes through
 * here and lands in the 'app' channel with X.name as context.
 *
 * For channel routing (the `Log::channel('payments')` equivalent), inject
 * this service and call `.channel('payments').warn(...)`.
 */
@Injectable()
export class AppLogger implements LoggerService {
  private readonly loggers = new Map<LogChannel, winston.Logger>();

  constructor() {
    for (const name of Object.keys(CHANNELS) as LogChannel[]) {
      this.loggers.set(name, buildChannelLogger(name));
    }
  }

  /** `Log::channel('payments')` equivalent. Unknown names fall back to app. */
  channel(name: string): winston.Logger {
    return this.loggers.get(name as LogChannel) ?? this.app;
  }

  get app(): winston.Logger {
    return this.loggers.get('app')!;
  }

  // --- Nest LoggerService: receives every `new Logger(X.name)` call ---

  log(message: unknown, ...optionalParams: unknown[]) {
    this.write('info', message, optionalParams);
  }

  error(message: unknown, ...optionalParams: unknown[]) {
    // Nest calls error(message, stack?, context?). With two params the first
    // is the stack; with one it is whichever was supplied — a stack trace is
    // recognisable by its "    at" frames.
    let stack: string | undefined;
    let context: string | undefined;
    const rest = [...optionalParams];

    if (rest.length >= 2) {
      context = typeof rest[rest.length - 1] === 'string' ? (rest.pop() as string) : undefined;
      if (typeof rest[0] === 'string') stack = rest.shift() as string;
    } else if (rest.length === 1 && typeof rest[0] === 'string') {
      if (/\n\s+at\s/.test(rest[0])) stack = rest.shift() as string;
      else context = rest.shift() as string;
    }

    this.app.error(this.toMessage(message), {
      context,
      stack,
      extra: rest.length ? rest : undefined,
    });
  }

  warn(message: unknown, ...optionalParams: unknown[]) {
    this.write('warn', message, optionalParams);
  }

  debug(message: unknown, ...optionalParams: unknown[]) {
    this.write('debug', message, optionalParams);
  }

  verbose(message: unknown, ...optionalParams: unknown[]) {
    this.write('verbose', message, optionalParams);
  }

  fatal(message: unknown, ...optionalParams: unknown[]) {
    this.app.error(this.toMessage(message), {
      fatal: true,
      ...this.splitParams(optionalParams),
    });
  }

  private write(level: string, message: unknown, optionalParams: unknown[]) {
    this.app.log(level, this.toMessage(message), this.splitParams(optionalParams));
  }

  /**
   * Nest's built-in Logger passes (message, ...optionalParams) where the last
   * param is the context string. Everything else is request metadata.
   */
  private splitParams(optionalParams: unknown[]): {
    context?: string;
    extra?: unknown[];
  } {
    const rest = [...optionalParams];
    const context =
      rest.length && typeof rest[rest.length - 1] === 'string'
        ? (rest.pop() as string)
        : undefined;
    return { context, extra: rest.length ? rest : undefined };
  }

  private toMessage(message: unknown): string {
    return typeof message === 'string' ? message : JSON.stringify(message);
  }
}
