# Email Setup Guide for Password Reset

## How Password Reset Emails Work

Supabase automatically handles sending password reset emails when you call `resetPasswordForEmail()`. However, you need to configure a few things:

## Step 1: Configure Email Templates in Supabase

1. Go to your [Supabase Dashboard](https://supabase.com/dashboard/project/dknnmknfegjwgfvqmndf)
2. Navigate to **Authentication** → **Email Templates**
3. Find the **"Reset Password"** template
4. Make sure it's enabled and configured correctly
5. The template should include a link like: `{{ .ConfirmationURL }}`

## Step 2: Set Up Redirect URL in Supabase

1. In Supabase Dashboard, go to **Authentication** → **URL Configuration**
2. Add your production URL to **Redirect URLs**:
   - For production: `https://your-domain.com/reset-password.html`
   - For local testing: `http://localhost:3000/reset-password.html`
3. Also add your Railway URL if you're using Railway: `https://your-app.railway.app/reset-password.html`

## Step 3: Set BASE_URL Environment Variable

Make sure `BASE_URL` is set correctly in your Railway environment variables:

```env
BASE_URL=https://your-app.railway.app
```

Or for local development:
```env
BASE_URL=http://localhost:3000
```

**Important:** The `BASE_URL` must match the domain where your app is hosted. This is used to generate the reset link that gets sent in the email.

## Step 4: Email Provider Configuration

Supabase uses its own email service by default, but for production you may want to use a custom SMTP provider:

1. Go to **Project Settings** → **Auth** → **SMTP Settings**
2. Configure your SMTP provider (Gmail, SendGrid, Mailgun, etc.)
3. Or use Supabase's built-in email service (works out of the box)

## Testing Password Reset

1. Click "Forgot password?" on the login page
2. Enter your email address
3. Click "Send Reset Link"
4. You should see: "If an account exists with this email, a password reset link has been sent. Please check your email inbox and spam folder."
5. Check your email inbox (and spam folder) for the reset link
6. Click the link to go to the reset password page
7. Enter your new password

## Troubleshooting

**No email received:**
- Check spam/junk folder
- Verify email address is correct
- Check Supabase Dashboard → Authentication → Email Templates are enabled
- Verify BASE_URL is set correctly
- Check Supabase logs: Dashboard → Logs → Auth Logs

**Email link doesn't work:**
- Make sure the redirect URL is added in Supabase Dashboard → Authentication → URL Configuration
- Verify BASE_URL matches your actual domain
- Check that `/reset-password.html` file exists in your `public` folder

**"Email not configured" error:**
- Go to Supabase Dashboard → Project Settings → Auth → SMTP Settings
- Either configure custom SMTP or ensure Supabase's email service is enabled

## How It Works

1. User clicks "Forgot password?" and enters their email
2. Backend calls `supabase.auth.resetPasswordForEmail(email, { redirectTo: '...' })`
3. Supabase generates a secure token and sends an email with a link
4. The link goes to: `{BASE_URL}/reset-password.html#access_token=...&type=recovery`
5. The reset password page extracts the token from the URL hash
6. User enters new password
7. Backend verifies token and updates password using Supabase Admin API
