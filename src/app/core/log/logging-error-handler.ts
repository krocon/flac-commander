import { ErrorHandler, inject, Injectable } from '@angular/core';
import { toAppError } from '../errors/app-error';
import { LogApi } from './log-api';

/** Errors nobody caught (templates, effects, unhandled rejections) go to the log file. */
@Injectable()
export class LoggingErrorHandler implements ErrorHandler {
  private readonly log = inject(LogApi);

  handleError(error: unknown): void {
    this.log.error(`unhandled: ${describeUnhandled(error)}`);
    console.error(error);
  }
}

export function describeUnhandled(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? `${error.name}: ${error.message}`;
  }
  const e = toAppError(error);
  return e.details ? `${e.code}: ${e.message} (${e.details})` : `${e.code}: ${e.message}`;
}
