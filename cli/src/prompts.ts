/**
 * Interactive prompt utilities using @clack/prompts.
 */
import { isCancel, cancel } from '@clack/prompts';

/**
 * Handles user cancellation (Ctrl+C) during prompts.
 * Exits gracefully with status code 0.
 */
export function handleCancel<T>(value: T | symbol): T {
  if (isCancel(value)) {
    cancel('Operation cancelled');
    process.exit(0);
  }
  return value as T;
}
