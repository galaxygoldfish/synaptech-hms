import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

// These are read at BUILD time — Vite inlines them into the bundle — so a
// deployment missing them produces a white page rather than a broken request:
// createClient throws while the module graph is still evaluating, and React
// never mounts. Saying which variable is missing, and that it has to be set
// where the build can see it, turns that into something readable in the
// console. On Cloudflare that means the build's variables, not the Worker's
// runtime ones, which never reach Vite.
const missing = [
  supabaseUrl ? null : 'VITE_SUPABASE_URL',
  supabaseAnonKey ? null : 'VITE_SUPABASE_ANON_KEY',
].filter(Boolean)

if (missing.length > 0) {
  throw new Error(
    `Missing ${missing.join(' and ')}. These are read at build time, so they must be set ` +
      `wherever the app is built — locally in .env.local, and in the deployment's BUILD ` +
      `variables (not its runtime variables). Rebuild after setting them.`,
  )
}

export const supabase = createClient(supabaseUrl!, supabaseAnonKey!)
