# PRODUCTION_SETUP.md

Production Deployment Guide for MATCHPOIN

## Overview

This guide covers deploying MATCHPOIN to production on Vercel with Supabase, MySQL, and optional SMTP.

---

## 1. Prerequisites

- Vercel account
- Supabase project (production)
- MySQL 8.0+ database (managed or self-hosted)
- Domain name (optional, can use Vercel subdomain)
- SMTP provider (if not using Supabase Auth email)

---

## 2. Vercel Deployment

### 2.1 Connect Repository
1. Push code to GitHub/GitLab/Bitbucket
2. Import project in Vercel
3. Select the repository
4. Framework preset: **Next.js** (auto-detected)

### 2.2 Build Settings
- **Build Command**: `npm run build` (default)
- **Output Directory**: `.next` (default)
- **Install Command**: `npm install` (default)
- **Node.js Version**: 20.x (specify in `.nvmrc` or Vercel settings)

### 2.3 Environment Variables
Add all variables from `.env.example` to Vercel Project Settings → Environment Variables.

**Required for Production:**

| Variable | Description | Sensitive |
|----------|-------------|-----------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | No |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key | No |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key | **Yes** |
| `SUPABASE_STORAGE_AVATARS_BUCKET` | Avatar bucket name | No |
| `SUPABASE_STORAGE_EVIDENCE_BUCKET` | Evidence bucket name | No |
| `SUPABASE_STORAGE_TOURNAMENT_BUCKET` | Tournament docs bucket name | No |
| `NEXT_PUBLIC_APP_URL` | Production app URL | No |
| `NEXT_PUBLIC_APP_ENV` | `production` | No |
| `NEXT_PUBLIC_DEFAULT_TIMEZONE` | `Asia/Makassar` | No |
| `DATABASE_URL` | MySQL connection string with TLS | **Yes** |
| `SMTP_HOST` | SMTP server host | No |
| `SMTP_PORT` | SMTP port (587/465) | No |
| `SMTP_USER` | SMTP username | **Yes** |
| `SMTP_PASSWORD` | SMTP password | **Yes** |
| `SMTP_FROM` | From email address | No |
| `SMTP_SECURE` | `true` for 465, `false` for 587 | No |

**Note**: `MATCHPOIN_BOOTSTRAP_SECRET` is only needed for one-time Super Admin bootstrap. Remove after use.

### 2.4 Deployment
1. Click **Deploy**
2. Wait for build to complete
3. Verify deployment at the Vercel URL

---

## 3. Custom Domain (Optional)

1. In Vercel Project Settings → Domains
2. Add your domain (e.g., `matchpoin.com`)
3. Configure DNS:
   - **A Record**: `@` → `76.76.21.21` (Vercel IP)
   - **CNAME**: `www` → `cname.vercel-dns.com`
4. Wait for SSL certificate provisioning
5. Update `NEXT_PUBLIC_APP_URL` to `https://your-domain.com`
5. Update Supabase Auth redirect URLs

---

## 4. Supabase Production Configuration

### 4.1 Auth Settings
- **Site URL**: `https://your-domain.com`
- **Redirect URLs**: `https://your-domain.com/**`
- **Email confirmations**: Enabled
- **Secure email change**: Enabled

### 4.2 Storage
- Verify all three buckets exist with RLS policies (see SUPABASE_SETUP.md)
- Test upload/download with production credentials

### 4.3 Realtime
- Enable Realtime for `notifications` table
- Verify channels work in production

### 4.4 Database (PostgreSQL)
MATCHPOIN uses MySQL as primary DB. Supabase PostgreSQL is only for Auth.
- No PostgreSQL migrations needed

---

## 5. MySQL Production Setup

### 5.1 Requirements
- MySQL 8.0+
- TLS/SSL enabled
- Network accessible from Vercel (or VPC peering if self-hosted)

### 5.2 Connection String Format
```
mysql://user:password@host:port/database?ssl={"rejectUnauthorized":true,"ca":"<base64-ca-cert>"}
```

**Options:**
- `rejectUnauthorized=true` (required for production)
- `ca` - Base64 encoded CA certificate (if using custom CA)
- `sslmode=VERIFY_IDENTITY` (alternative to ssl object)

### 5.3 Managed MySQL Providers
| Provider | TLS Config |
|----------|------------|
| PlanetScale | Built-in TLS, use `ssl={"rejectUnauthorized":true}` |
| AWS RDS | Download RDS CA cert, include in connection string |
| Google Cloud SQL | Use SSL proxy or download cert |
| Azure Database for MySQL | Built-in TLS, enforce SSL |
| DigitalOcean Managed DB | Download CA cert |
| Self-hosted | Generate certs, configure MySQL SSL |

### 5.4 Migrations
```bash
# Run locally with production .env.local
DATABASE_URL="mysql://..." npm run db:migrate
```

---

## 6. SMTP Configuration

### 6.1 Using Supabase Auth SMTP (Recommended)
1. In Supabase Dashboard → Settings → SMTP
2. Enable custom SMTP
3. Enter credentials from your SMTP provider
4. Supabase handles email delivery for auth flows

### 6.2 Using Custom SMTP (Alternative)
Set environment variables:
```env
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASSWORD=your-sendgrid-api-key
SMTP_FROM=noreply@yourdomain.com
SMTP_SECURE=false
```

### 6.3 Test Email Delivery
```bash
# Test with a simple script
node -e "
const nodemailer = require('nodemailer');
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: process.env.SMTP_SECURE === 'true',
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
});
transporter.sendMail({
  from: process.env.SMTP_FROM,
  to: 'test@example.com',
  subject: 'Test',
  text: 'Test email'
}).then(console.log).catch(console.error);
"
```

---

## 7. DNS Configuration

### 7.1 Required Records
| Type | Host | Value |
|------|------|-------|
| A | @ | 76.76.21.21 (Vercel) |
| CNAME | www | cname.vercel-dns.com |
| TXT | @ | `v=spf1 include:_spf.your-smtp.com ~all` |
| TXT | _dmarc | `v=DMARC1; p=quarantine; rua=mailto:dmarc@yourdomain.com` |

### 7.2 Optional
- **DKIM**: Configure in your SMTP provider, add CNAME records
- **CAA**: `0 issue "letsencrypt.org"`

---

## 8. SSL/TLS

- Vercel provides automatic SSL via Let's Encrypt
- Force HTTPS: Enabled by default on Vercel
- HSTS: Configured in `next.config.mjs` for production

---

## 9. Monitoring & Logging

### 9.1 Vercel Analytics
- Enable in Vercel Project Settings → Analytics
- Tracks Web Vitals, page views, etc.

### 9.2 Error Tracking
Consider integrating:
- **Sentry**: `npm install @sentry/nextjs`
- **LogRocket**: For session replay

### 9.3 Supabase Logs
- Auth logs: Dashboard → Authentication → Logs
- Database logs: Dashboard → Database → Logs
- Realtime logs: Dashboard → Realtime → Logs
- Storage logs: Dashboard → Storage → Logs

### 9.4 MySQL Monitoring
- Enable slow query log
- Monitor connections, query latency
- Set up alerts for connection pool exhaustion

---

## 10. Security Hardening

### 10.1 Headers (next.config.mjs)
```javascript
async headers() {
  return [{
    source: '/:path*',
    headers: [
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(self)' },
      { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' },
    ],
  }];
}
```

### 10.2 CSP (Optional)
Add Content Security Policy if needed:
```javascript
{ key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://*.supabase.co wss://*.supabase.co;" }
```

### 10.3 Rate Limiting
- Vercel: Built-in DDoS protection
- Supabase: Built-in rate limits on Auth endpoints
- Consider custom rate limiting for API routes

### 10.4 Secrets Management
- Never commit `.env.local` or real secrets
- Use Vercel Environment Variables for secrets
- Rotate `SUPABASE_SERVICE_ROLE_KEY` quarterly
- Rotate `DATABASE_URL` password periodically
- Audit `SUPABASE_SERVICE_ROLE_KEY` usage in code

---

## 11. Backup & Disaster Recovery

### 11.1 MySQL Backups
```bash
# Automated daily backup (cron)
mysqldump --single-transaction --routines --triggers -h host -u user -p db > backup_$(date +%F).sql

# Or use managed provider backup (PlanetScale, RDS, etc.)
```

### 11.2 Supabase Backups
- Supabase handles PostgreSQL backups automatically
- Point-in-time recovery available (7 days on Pro plan)

### 11.3 Storage Backups
- Supabase Storage is replicated
- Consider periodic download of critical assets

### 11.5 Recovery Plan
1. MySQL: Restore from latest dump, run migrations if needed
2. Supabase: Use point-in-time recovery
3. Vercel: Re-deploy from Git commit
4. DNS: Update if needed

---

## 12. Performance Optimization

### 12.1 Next.js
- Enable `output: 'standalone'` for smaller Docker images (if using containers)
- Use `next/image` for all images (already done)
- Enable `swcMinify: true` (default in Next.js 14)

### 12.2 Database
- Add indexes for common queries (already in migrations)
- Monitor slow queries
- Use connection pooling (mysql2 pool)

### 12.3 Caching
- Vercel Edge caching for static assets
- Consider Redis for session caching if needed

---

## 13. CI/CD Pipeline

### 13.1 GitHub Actions Example
```yaml
name: CI/CD
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm run test:rbac
      - run: npm run test:mysql-workflows
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}

  deploy:
    needs: test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          vercel-args: '--prod'
```

---

## 14. Go-Live Checklist

### Pre-Launch
- [ ] All tests pass (lint, typecheck, rbac, mysql-workflows)
- [ ] Production environment variables set in Vercel
- [ ] Supabase production project configured
- [ ] MySQL production database accessible with TLS
- [ ] Migrations applied to production MySQL
- [ ] Supabase Storage buckets created with RLS
- [ ] Realtime enabled for notifications
- [ ] SMTP configured and tested
- [ ] Custom domain DNS configured
- [ ] SSL certificate provisioned
- [ ] Super Admin bootstrapped on production
- [ ] Error tracking configured (Sentry, etc.)

### Launch
- [ ] Deploy to Vercel production
- [ ] Verify registration flow
- [ ] Verify email verification
- [ ] Verify login/logout
- [ ] Verify password reset
- [ ] Verify avatar upload
- [ ] Verify match creation and evidence upload
- [ ] Verify tournament registration and approval
- [ ] Verify Super Admin access
- [ ] Verify admin exclusion from player lists

### Post-Launch (Day 1)
- [ ] Monitor error rates
- [ ] Monitor database performance
- [ ] Monitor Supabase Auth logs
- [ ] Verify realtime notifications
- [ ] Check email delivery rates
- [ ] Verify no CORS errors

---

## 15. Rollback Plan

1. **Vercel**: Instant rollback to previous deployment in Vercel Dashboard
2. **MySQL**: Restore from backup, ensure migration compatibility
3. **Supabase**: Point-in-time recovery (if on Pro plan)
4. **DNS**: Revert DNS changes if needed

---

## 16. Support Contacts

| Service | Support |
|---------|---------|
| Vercel | vercel.com/support |
| Supabase | supabase.com/support |
| MySQL Provider | Provider-specific |
| SMTP Provider | Provider-specific |

---

*Last updated: 2026-11-18*
*Version: 1.0*