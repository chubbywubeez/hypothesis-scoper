# Email Setup Guide for Password Reset

## How Password Reset Emails Work

Password reset emails are sent using **Resend** (not Supabase's built-in email service). The backend uses Supabase to generate the reset token, then sends the email via Resend.

## Step 1: Set Up Resend

1. Sign up for a Resend account at [resend.com](https://resend.com)
2. Get your API key from the Resend dashboard
3. Add your domain `getvantum.com` to Resend and verify it
4. Set up the sender email `info@getvantum.com` in Resend

## Step 2: Configure Environment Variables

**For Production (Railway):**

Add the following to your Railway environment variables:

```env
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxx
BASE_URL=https://your-app.railway.app
RESEND_FROM_EMAIL=info@getvantum.com
```

**Important:** 
- `RESEND_API_KEY` is required for password reset emails to work
- `BASE_URL` must be your exact Railway production URL (e.g., `https://hypothesis-scoper-production.up.railway.app`)
- No trailing slash in `BASE_URL`
- After adding these, Railway will automatically redeploy

**Optional:** If your domain isn't verified yet, you can temporarily use Resend's default domain:
```env
RESEND_FROM_EMAIL=onboarding@resend.dev
```

**For Local Development (optional):**
```env
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxx
BASE_URL=http://localhost:3000
```

## Step 3: Set Up Redirect URL in Supabase

Even though we're using Resend for emails, Supabase still needs to know about redirect URLs:

1. Go to your [Supabase Dashboard](https://supabase.com/dashboard/project/dknnmknfegjwgfvqmndf)
2. Navigate to **Authentication** → **URL Configuration**
3. Under **Redirect URLs**, add your production URL:
   - **Production:** `https://your-app.railway.app/reset-password.html`
   - Replace `your-app.railway.app` with your actual Railway domain
   - **Important:** The URL must match exactly what's in your `BASE_URL` environment variable + `/reset-password.html`
4. Click **Save**

**Example:** If your Railway URL is `https://hypothesis-scoper-production.up.railway.app`, add:
```
https://hypothesis-scoper-production.up.railway.app/reset-password.html
```

## Step 4: Install Dependencies

Make sure the Resend package is installed:

```bash
npm install resend
```

The package.json should include:
```json
{
  "dependencies": {
    "resend": "^3.2.0"
  }
}
```

## Testing Password Reset (Production)

**Before Testing:**
1. ✅ Verify `BASE_URL` is set in Railway to your production URL
2. ✅ Verify `RESEND_API_KEY` is set in Railway
3. ✅ Verify `RESEND_FROM_EMAIL` is set (or will use default `info@getvantum.com`)
4. ✅ Verify production redirect URL is added to Supabase Dashboard
5. ✅ Verify `getvantum.com` domain is verified in Resend (or use `onboarding@resend.dev` temporarily)

**Testing Steps:**
1. Go to your production app (e.g., `https://your-app.railway.app`)
2. Click "Forgot password?" on the login page
3. Enter your email address
4. Click "Reset Password"
5. You should see: "If an account exists with this email, a password reset link has been sent. Please check your email inbox and spam folder."
6. Check your email inbox (and spam folder) for the reset link
7. The email will be sent from `info@getvantum.com` (or `onboarding@resend.dev` if using default)
8. Click the link - it should go to `https://your-app.railway.app/reset-password.html#access_token=...&type=recovery`
9. Enter your new password
10. You should be redirected to login after successful reset

## Troubleshooting

**No email received:**
- Check spam/junk folder
- Verify email address is correct
- Verify `RESEND_API_KEY` is set correctly in environment variables
- Check Resend dashboard → Logs for email delivery status
- Verify `info@getvantum.com` domain is verified in Resend
- Check server logs for any errors

**Email link doesn't work / OTP expired error:**

This error (`otp_expired` or `access_denied`) usually means:

1. **Redirect URL not whitelisted in Supabase:**
   - Go to Supabase Dashboard → Authentication → URL Configuration
   - Add `http://localhost:3000/reset-password.html` for local development
   - Add your production URL (e.g., `https://your-app.railway.app/reset-password.html`) for production
   - **Important:** The exact URL must match what's in your `BASE_URL` environment variable

2. **BASE_URL mismatch:**
   - Verify `BASE_URL` in your `.env` file matches where you're accessing the app
   - For local: `BASE_URL=http://localhost:3000`
   - For production: `BASE_URL=https://your-app.railway.app`
   - Restart your server after changing `BASE_URL`

3. **Link expired:**
   - Password reset links expire after 1 hour
   - Request a new password reset if the link is old

4. **Other checks:**
   - Make sure `/reset-password.html` file exists in your `public` folder
   - Verify the link format includes `#access_token=...&type=recovery`
   - Check server logs to see what redirect URL was generated

**"Email service not configured" error:**
- Verify `RESEND_API_KEY` is set in your environment variables
- Restart your server after adding the environment variable
- Check server logs for Resend initialization messages

**Wrong sender email address:**
- Emails are sent from `info@getvantum.com` (default in server.js, can be overridden with RESEND_FROM_EMAIL env var)
- Verify this email address is verified in your Resend account
- Make sure the domain `getvantum.com` is added and verified in Resend

**Resend API errors:**

**Domain verification error (403 - domain not verified):**
Even if DNS records show as "Verified" in Resend, the domain might not be fully activated. Try these steps:

1. **Check domain status in Resend:**
   - Go to [Resend Domains](https://resend.com/domains)
   - Find `getvantum.com` in your domains list
   - Look for a "Verify Domain" or "Activate" button and click it
   - Wait a few minutes for verification to complete

2. **Verify DNS records are correct:**
   - Make sure all DNS records (DKIM, SPF, MX) show as "Verified" (green checkmarks)
   - DNS propagation can take up to 48 hours - wait if records were recently added
   - Double-check that records match exactly what Resend shows

3. **Use Resend's default domain for testing (temporary fix):**
   - Add `RESEND_FROM_EMAIL=onboarding@resend.dev` to your environment variables
   - This uses Resend's default domain which works immediately
   - Once your domain is verified, remove this variable to use `info@getvantum.com`

4. **Check Resend domain status:**
   - The domain should show as "Active" or "Verified" (not just DNS records verified)
   - There may be a separate "Enable Sending" toggle that needs to be turned on
   - Check if there's a domain status indicator showing "Ready" or "Active"

5. **Contact Resend support:**
   - If DNS records are verified but domain still shows as unverified, contact Resend support
   - They can manually verify your domain if needed

**Other Resend API errors:**
- Check Resend dashboard → API Keys to ensure your key is active
- Verify your Resend account has sufficient credits
- Check Resend dashboard → Logs for detailed error messages
- Ensure `info@getvantum.com` is a verified sender in Resend

## How It Works

1. User clicks "Forgot password?" and enters their email
2. Backend calls `supabase.auth.admin.generateLink()` to generate a recovery token
3. Backend sends email via Resend with the reset link
4. Email is sent from `info@getvantum.com` with a formatted HTML email
5. The link goes to: `{BASE_URL}/reset-password.html#access_token=...&type=recovery`
6. The reset password page extracts the token from the URL hash
7. User enters new password
8. Backend verifies token and updates password using Supabase Admin API

## Email Template

The password reset email includes:
- Professional HTML formatting
- Clear "Reset Password" button
- Plain text fallback
- Link expiration notice (1 hour)
- Security notice if user didn't request reset

The email template is defined in `server.js` in the `/api/auth/forgot-password` endpoint.
