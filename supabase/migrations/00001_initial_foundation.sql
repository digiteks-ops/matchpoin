-- MATCHPOIN V2 — Initial Database Foundation Migration
-- Clean Rebuild for Makassar, Indonesia & Nationwide Expansion

-- 1. Cities Table (Makassar first launch, extensible nationwide)
CREATE TABLE IF NOT EXISTS public.cities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    province TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on cities
ALTER TABLE public.cities ENABLE ROW LEVEL SECURITY;

-- Allow public read access to active cities
CREATE POLICY "Allow public read access to active cities"
    ON public.cities
    FOR SELECT
    USING (is_active = true);

-- Seed initial launch city: Makassar, plus major metropolitan regions
INSERT INTO public.cities (name, province, is_active)
VALUES 
    ('Makassar', 'Sulawesi Selatan', true),
    ('Jakarta Selatan', 'DKI Jakarta', true),
    ('Surabaya', 'Jawa Timur', true),
    ('Bandung', 'Jawa Barat', true),
    ('Denpasar', 'Bali', true)
ON CONFLICT (name) DO NOTHING;

-- 2. Profiles Table
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    username TEXT UNIQUE,
    avatar_url TEXT,
    gender TEXT CHECK (gender IN ('male', 'female')),
    city_id UUID REFERENCES public.cities(id) ON DELETE SET NULL,
    tennis_hand TEXT CHECK (tennis_hand IN ('right', 'left', 'ambidextrous')) DEFAULT 'right',
    playing_style TEXT CHECK (playing_style IN ('aggressive_baseliner', 'serve_and_volley', 'all_court', 'counter_puncher', 'casual')) DEFAULT 'all_court',
    bio TEXT,
    matchpoin_rating NUMERIC(4, 2) NOT NULL DEFAULT 1.00 CHECK (matchpoin_rating >= 1.00 AND matchpoin_rating <= 10.00),
    is_provisional BOOLEAN NOT NULL DEFAULT true,
    matches_played INTEGER NOT NULL DEFAULT 0 CHECK (matches_played >= 0),
    matches_won INTEGER NOT NULL DEFAULT 0 CHECK (matches_won >= 0),
    matches_lost INTEGER NOT NULL DEFAULT 0 CHECK (matches_lost >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for performance & player discovery
CREATE INDEX IF NOT EXISTS idx_profiles_rating ON public.profiles(matchpoin_rating);
CREATE INDEX IF NOT EXISTS idx_profiles_city_id ON public.profiles(city_id);
CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles(username);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Guest and authenticated users can view public player profiles
CREATE POLICY "Public profiles are viewable by everyone"
    ON public.profiles
    FOR SELECT
    USING (true);

-- Authenticated users can insert their own profile
CREATE POLICY "Users can insert their own profile"
    ON public.profiles
    FOR INSERT
    WITH CHECK (auth.uid() = id);

-- Authenticated users can update their own profile
CREATE POLICY "Users can update their own profile"
    ON public.profiles
    FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- 3. Trigger for updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- 4. Automatic Profile Creation Trigger on Supabase Auth Signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    default_city_id UUID;
BEGIN
    -- Retrieve default Makassar city id
    SELECT id INTO default_city_id FROM public.cities WHERE name = 'Makassar' LIMIT 1;

    INSERT INTO public.profiles (
        id,
        email,
        full_name,
        username,
        avatar_url,
        city_id,
        matchpoin_rating,
        is_provisional
    )
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
        COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1) || '_' || substr(NEW.id::text, 1, 5)),
        NEW.raw_user_meta_data->>'avatar_url',
        default_city_id,
        1.00,
        true
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger execution on auth.users insert
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();
