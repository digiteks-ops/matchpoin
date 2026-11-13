-- supabase/migrations/00002_create_profiles.sql
-- Create profiles table for MATCHPOIN V2
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    avatar_url TEXT,
    phone TEXT,
    whatsapp_number TEXT,
    city_id UUID REFERENCES public.cities(id) ON DELETE SET NULL,
    rating NUMERIC(4,2) NOT NULL DEFAULT 1.00 CHECK (rating >= 1.00 AND rating <= 5.00),
    is_premium BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Policy: owners can read/write their own profile
CREATE POLICY "owner full access"
    ON public.profiles
    FOR ALL
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- Policy: public can read limited fields (masked email/phone will be handled in UI)
CREATE POLICY "public read limited"
    ON public.profiles
    FOR SELECT
    USING (true);
