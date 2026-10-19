/**
 * Error handling. Tools throw `UserError` (or plain errors); the shell shows a
 * friendly message and keeps the raw technical detail behind the debug panel.
 */

export class UserError extends Error {
  readonly detail?: string;

  constructor(message: string, detail?: string) {
    super(message);
    this.name = 'UserError';
    this.detail = detail;
  }
}

export class UnsupportedFileError extends UserError {
  constructor(name: string, expected: string) {
    super(
      `"${name}" is not a supported file for this tool.`,
      `Expected one of: ${expected}`,
    );
    this.name = 'UnsupportedFileError';
  }
}

export function toUserMessage(error: unknown): string {
  if (error instanceof UserError) return error.message;
  if (error instanceof Error) {
    const raw = error.message || error.name;
    if (/out of memory|allocation failed/i.test(raw)) {
      return 'This file is too large to process in the browser. Try a smaller version.';
    }
    if (/createImageBitmap|decode|image/i.test(raw) && /fail|error|invalid/i.test(raw)) {
      return 'This image could not be decoded. The file may be corrupt or in an unsupported format.';
    }
    if (/network|fetch|load/i.test(raw) && /fail|error/i.test(raw)) {
      return 'A required resource could not be loaded. Check your connection and try again.';
    }
    return raw;
  }
  return 'Something went wrong while processing this file.';
}

export function toErrorDetail(error: unknown): string | undefined {
  if (error instanceof UserError) return error.detail ?? error.stack;
  if (error instanceof Error) return error.stack ?? error.message;
  if (error === undefined || error === null) return undefined;
  return String(error);
}

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new UserError(message);
}
