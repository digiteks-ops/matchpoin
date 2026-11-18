# SUPABASE_SETUP.md

Supabase Configuration Guide for MATCHPOIN

## Overview

MATCHPOIN uses Supabase for:
- **Authentication** (Auth) - User registration, login, email verification, password reset
- **Storage** - Avatars, match evidence, tournament documents
- **Realtime** - Notification delivery (MySQL is the source of truth)

---

## 1. Supabase Dashboard Settings

### 1.1 Project Setup
1. Create a new Supabase project at https://supabase.com/dashboard
2. Note your **Project URL** and **anon/public key** from Settings → API
3. Note your **service_role key** from Settings → API (keep secret, server-side only)

### 1.2 Authentication Providers
Configure in **Authentication → Providers**:

| Provider | Status | Notes |
|----------|--------|-------|
| Email | Enabled | Default, used for magic link / password |
| Google | Optional | Configure OAuth consent screen in Google Cloud |
| Facebook | Optional | Configure in Facebook Developers |

**Redirect URLs** (add to each provider):
- Development: `http://localhost:3000/auth/callback`
- Production: `https://your-domain.com/auth/callback`

**Supabase Callback URL** (for provider console):
- `https://<project-ref>.supabase.co/auth/v1/callback`

### 1.3 Email Templates
Configure in **Authentication → Email Templates**:

**Confirm signup:**
```
Subject: Verifikasi Email MATCHPOIN

<h2>Selamat Datang di MATCHPOIN!</h2>
<p>Klik tautan di bawah untuk memverifikasi alamat email Anda:</p>
<p><a href="{{ .ConfirmationURL }}">Verifikasi Email</a></p>
<p>Tautan ini berlaku selama 24 jam.</p>
```

**Reset password:**
```
Subject: Reset Kata Sandi MATCHPOIN

<h2>Permintaan Reset Kata Sandi</h2>
<p>Klik tautan di bawah untuk membuat kata sandi baru:</p>
<p><a href="{{ .ConfirmationURL }}">Reset Kata Sandi</a></p>
<p>Tautan ini berlaku selama 24 jam.</p>
```

**Magic link:**
```
Subject: Tautan Masuk MATCHPOIN

<h2>Masuk ke MATCHPOIN</h2>
<p>Klik tautan di bawah untuk masuk tanpa kata sandi:</p>
<p><a href="{{ .ConfirmationURL }}">Masuk Sekarang</a></p>
<p>Tautan ini berlaku selama 24 jam.</p>
```

### 1.4 Auth Settings
- **Site URL**: `http://localhost:3000` (dev) / `https://your-domain.com` (prod)
- **Redirect URLs**: Add `http://localhost:3000/**` and `https://your-domain.com/**`
- **Email confirmations**: Enabled
- **Secure email change**: Enabled
- **Phone confirmations**: Disabled (unless needed)
- **Enable signup**: Enabled
- **Enable email sign-in**: Enabled
- **Minimum password length**: 6 (or per policy)
- **Password strength**: Set per your policy

---

## 2. Storage Buckets

Create three buckets in **Storage → Buckets**:

### 2.1 `avatars`
- **Public bucket**: Yes
- **File size limit**: 5 MB
- **Allowed MIME types**: `image/jpeg`, `image/png`, `image/webp`
- **RLS Policies**:
  ```sql
  -- Public read
  CREATE POLICY "Public read avatars" ON storage.objects
    FOR SELECT USING (bucket_id = 'avatars');
  
  -- Users can upload their own avatar
  CREATE POLICY "Users upload own avatar" ON storage.objects
    FOR INSERT WITH CHECK (
      bucket_id = 'avatars' AND
      auth.uid()::text = (storage.foldername(name))[1]
    );
  
  -- Users can update/delete their own avatar
  CREATE POLICY "Users update own avatar" ON storage.objects
    FOR UPDATE USING (
      bucket_id = 'avatars' AND
      auth.uid()::text = (storage.foldername(name))[1]
    );
  
  CREATE POLICY "Users delete own avatar" ON storage.objects
    FOR DELETE USING (
      bucket_id = 'avatars' AND
      auth.uid()::text = (storage.foldername(name))[1]
    );
  ```

### 2.2 `match-evidence`
- **Public bucket**: No (private)
- **File size limit**: 1 MB per file
- **Allowed MIME types**: `image/jpeg`, `image/png`, `image/webp`
- **RLS Policies**:
  ```sql
  -- Users can upload evidence for matches they participate in
  CREATE POLICY "Participants upload evidence" ON storage.objects
    FOR INSERT WITH CHECK (
      bucket_id = 'match-evidence' AND
      EXISTS (
        SELECT 1 FROM match_participants mp
        WHERE mp.match_id = (storage.foldername(name))[2]
        AND mp.user_id = auth.uid()
        AND mp.left_at IS NULL
      )
    );
  
  -- Participants and organizers can read evidence
  CREATE POLICY "Participants read evidence" ON storage.objects
    FOR SELECT USING (
      bucket_id = 'match-evidence' AND
      EXISTS (
        SELECT 1 FROM match_participants mp
        WHERE mp.match_id = (storage.foldername(name))[2]
        AND mp.user_id = auth.uid()
        AND mp.left_at IS NULL
      )
    );
  
  -- Organizers can delete evidence
  CREATE POLICY "Organizers delete evidence" ON storage.objects
    FOR DELETE USING (
      bucket_id = 'match-evidence' AND
      EXISTS (
        SELECT 1 FROM matches m
        WHERE m.id = (storage.foldername(name))[2]
        AND m.organizer_id = auth.uid()
      )
    );
  ```

### 2.3 `tournament-documents`
- **Public bucket**: No (private)
- **File size limit**: 10 MB per file
- **Allowed MIME types**: `application/pdf`, `image/jpeg`, `image/png`, `image/webp`
- **RLS Policies**:
  ```sql
  -- Tournament participants can upload documents
  CREATE POLICY "Participants upload tournament docs" ON storage.objects
    FOR INSERT WITH CHECK (
      bucket_id = 'tournament-documents' AND
      EXISTS (
        SELECT 1 FROM tournament_participants tp
        WHERE tp.tournament_id = (storage.foldername(name))[2]
        AND tp.user_id = auth.uid()
        AND tp.status <> 'rejected'
      )
    );
  
  -- Participants and organizers can read documents
  CREATE POLICY "Participants read tournament docs" ON storage.objects
    FOR SELECT USING (
      bucket_id = 'tournament-documents' AND
      EXISTS (
        SELECT 1 FROM tournament_participants tp
        WHERE tp.tournament_id = (storage.foldername(name))[2]
        AND tp.user_id = auth.uid()
        AND tp.status <> 'rejected'
      )
    );
  ```

---

## 3. Realtime

### 3.1 Enable Realtime
In **Database → Replication**, enable for:
- `notifications` table
- `match_participants` table (optional, for live match updates)

### 3.2 Client Configuration
The app uses Supabase Realtime for notification broadcasting:
- Channels: `user-notifications:{userId}`
- Events: `notification` (broadcast)

### 3.3 Fallback
If Realtime is unavailable, the app gracefully falls back to polling (not yet implemented - marked for future work).

---

## 4. Database (MySQL)

MATCHPOIN uses MySQL 8.0+ as the primary business database. Supabase PostgreSQL is NOT used for business data.

### 4.1 Connection
Set `DATABASE_URL` in environment:
```
mysql://user:password@host:port/database?ssl={"rejectUnauthorized":true}
```

### 4.2 TLS Requirements
- **Production**: Must use verified TLS (`rejectUnauthorized: true`)
- **Local development**: Can use `ssl=false` or `ssl=skip-verify` for localhost
- Never use `rejectUnauthorized: false` in production

### 4.3 Migrations
Run with: `npm run db:migrate`

---

## 5. SMTP (Password Reset)

If using custom SMTP instead of Supabase Auth email:

### 5.1 Environment Variables
```
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your-smtp-username
SMTP_PASSWORD=your-smtp-password
SMTP_FROM=noreply@yourdomain.com
SMTP_SECURE=false
```

### 5.2 Supabase Auth SMTP (Alternative)
Configure in **Settings → SMTP**:
- Host, Port, User, Password
- Sender name: `MATCHPOIN`
- Sender email: `noreply@yourdomain.com`

---

## 6. Environment Variables

### 6.1 Required (.env.local)
```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Storage
SUPABASE_STORAGE_AVATARS_BUCKET=avatars
SUPABASE_STORAGE_EVIDENCE_BUCKET=match-evidence
SUPABASE_STORAGE_TOURNAMENT_BUCKET=tournament-documents

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_ENV=development
NEXT_PUBLIC_DEFAULT_TIMEZONE=Asia/Makassar

# MySQL
DATABASE_URL=mysql://user:pass@localhost:3306/matchpoin?ssl={"rejectUnauthorized":true}

# Super Admin Bootstrap (set once, then remove)
MATCHPOIN_BOOTSTRAP_SECRET=your-long-random-secret

# SMTP (if not using Supabase Auth email)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=user
SMTP_PASSWORD=pass
SMTP_FROM=noreply@yourdomain.com
SMTP_SECURE=false
```

### 6.2 Vercel Deployment
Add all variables to Vercel Project Settings → Environment Variables.
Mark `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `SMTP_PASSWORD`, `MATCHPOIN_BOOTSTRAP_SECRET` as **Sensitive**.

---

## 7. Verification Checklist

### Pre-deployment
- [ ] Supabase project created
- [ ] Auth providers configured
- [ ] Email templates customized
- [ ] Storage buckets created with RLS policies
- [ ] Realtime enabled for `notifications` table
- [ ] MySQL 8.0+ database accessible with TLS
- [ ] Migrations applied (`npm run db:migrate`)
- [ ] Super Admin bootstrapped (`npm run db:bootstrap-super-admin`)
- [ ] Environment variables set in Vercel
- [ ] SMTP configured (Supabase or custom)
- [ ] DNS configured for production domain

### Post-deployment
- [ ] Test registration flow
- [ ] Test email verification
- [ ] Test login/logout
- [ ] Test password reset
- [ ] Test avatar upload
- [ ] Test match evidence upload
- [ ] Test tournament document upload
- [ ] Test realtime notifications
- [ ] Verify Super Admin access
- [ ] Verify admin exclusion from player lists

---

## 8. Troubleshooting

### Auth Issues
- **Email not sending**: Check Supabase Auth logs, verify SMTP settings
- **OAuth redirect mismatch**: Ensure redirect URLs match exactly in provider console and Supabase
- **Session not persisting**: Check cookie settings, ensure `SameSite=Lax` for auth cookies

### Storage Issues
- **Upload fails**: Check bucket RLS policies, verify bucket exists
- **Signed URL expires**: Default TTL is 5 min (upload) / 1 hr (read)
- **CORS errors**: Add your domain to Supabase Storage CORS settings

### Realtime Issues
- **Notifications not arriving**: Check Realtime enabled for `notifications` table, verify channel subscription
- **Connection drops**: App should handle reconnection (currently best-effort)

### MySQL Issues
- **TLS handshake fails**: Verify `DATABASE_URL` SSL params, check certificate
- **Connection timeout**: Check firewall, VPC, security groups
- **Migration fails**: Check MySQL version (8.0+), run migrations in order

---

## 9. Security Notes

- Never commit `.env.local` or real secrets
- Rotate `SUPABASE_SERVICE_ROLE_KEY` periodically
- Use `MATCHPOIN_BOOTSTRAP_SECRET` once, then remove
- Keep `DATABASE_URL` out of browser bundles (no `NEXT_PUBLIC_`)
- Regularly audit RLS policies on storage buckets
- Monitor Supabase Auth logs for suspicious activity