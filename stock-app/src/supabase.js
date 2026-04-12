import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://xdijtuqqmxxsreffkdsk.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhkaWp0dXFxbXh4c3JlZmZrZHNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4NjQ4NjQsImV4cCI6MjA5MTQ0MDg2NH0.z-r61NPYoTumjokxljnDUMG-lQGfjmZMbqjk7x91dyQ'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
