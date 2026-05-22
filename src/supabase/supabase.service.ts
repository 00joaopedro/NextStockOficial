import { Injectable } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService {
  public readonly anon: SupabaseClient;
  public readonly admin: SupabaseClient;

  constructor() {
    const url = process.env.SUPABASE_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !anonKey || !serviceKey) {
      throw new Error(
        'Missing Supabase env vars (SUPABASE_URL / SUPABASE_ANON_KEY or SUPABASE_PUBLISHABLE_KEY / SUPABASE_SERVICE_ROLE_KEY).',
      );
    }

    this.anon = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    this.admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
}