import { BadRequestException } from '@nestjs/common';

/** Canonical identity used by Supabase Auth and every local identity claim. */
export function canonicalizeEmail(value?: string): string {
  const email = value?.trim().toLocaleLowerCase('en-US');
  if (!email) throw new BadRequestException('email and password are required');
  return email;
}
