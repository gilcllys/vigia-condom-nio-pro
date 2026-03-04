import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://rvgrxtzqkygjxlwlmvvn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ2Z3J4dHpxa3lnanhsd2xtdnZuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2MjM3NDIsImV4cCI6MjA4ODE5OTc0Mn0.yAwonPOWyK1NxgS73rEKXuY2iNCVjEQ9tchS8vIYBOs';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
