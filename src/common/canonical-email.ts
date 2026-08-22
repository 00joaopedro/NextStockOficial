import { BadRequestException } from '@nestjs/common';

/** Canonical identity used by Supabase Auth and every local identity claim. */
export function canonicalizeEmail(value?: string): string {
  if (typeof value !== 'string') throw new BadRequestException('email and password are required');
  const email = value.trim().normalize('NFC').toLocaleLowerCase('en-US');
  if (!email || email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadRequestException('email and password are required');
  return email;
}
