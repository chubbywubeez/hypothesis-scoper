# Local Testing with ngrok

This guide will help you test the Supabase integration locally before pushing to production.

## Step 1: Create Your .env File

Create a `.env` file in the project root with these values:

```env
# OpenAI Configuration (Required)
OPENAI_API_KEY=your_actual_openai_key_here

# Supabase Configuration (Required for auth/save features)
SUPABASE_URL=https://dknnmknfegjwgfvqmndf.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sb_secret_dMPhXGIhKA357bujnYemPQ_t1LM27lC

# Confluence Configuration (Optional - only for internal users)
# CONFLUENCE_DOMAIN=yourcompany.atlassian.net
# CONFLUENCE_EMAIL=your.email@company.com
# CONFLUENCE_API_TOKEN=your_confluence_api_token
# CONFLUENCE_SPACE_KEY=YOUR_SPACE_KEY

# Server Configuration
PORT=3000
NODE_ENV=development
```

**Important:** Replace `your_actual_openai_key_here` with your real OpenAI API key.

## Step 2: Install Dependencies (if needed)

```bash
npm install
```

## Step 3: Start the Local Server

```bash
npm start
```

Or:

```bash
node server.js
```

You should see:
```
Server running on port 3000
Supabase client initialized
OpenAI API Key configured: Yes
```

## Step 4: Set Up ngrok

### Install ngrok (if not already installed):

1. Download from [ngrok.com](https://ngrok.com/download)
2. Or use Homebrew: `brew install ngrok`
3. Or use npm: `npm install -g ngrok`

### Start ngrok:

Open a **new terminal window** and run:

```bash
ngrok http 3000
```

You'll see output like:
```
Forwarding  https://xxxx-xx-xx-xx-xx.ngrok-free.app -> http://localhost:3000
```

Copy the **HTTPS URL** (the one starting with `https://`).

## Step 5: Test Your Local Setup

1. Open your ngrok URL in a browser (e.g., `https://xxxx-xx-xx-xx-xx.ngrok-free.app`)
2. You should see the Hypothesis Scoper interface

### Test Authentication:
1. Click "Login" → "Sign Up" tab
2. Create a test account
3. Should automatically log you in

### Test Save Functionality:
1. Generate a hypothesis
2. Click "Save Hypothesis" (for customers)
3. Should show success message

### Test My Scopes:
1. Click "My Scopes" button in header
2. Should show your saved scopes

### Test Internal User (optional):
1. In Supabase SQL Editor, run:
   ```sql
   UPDATE profiles 
   SET role = 'internal' 
   WHERE email = 'your-test-email@example.com';
   ```
2. Logout and login again
3. Should see "Export to Confluence" buttons instead of "Save"

## Step 6: Check Server Logs

Watch your terminal where the server is running for:
- Authentication requests
- Database operations
- Any errors

## Troubleshooting

**"Supabase not configured" error:**
- Check that `.env` file exists and has the correct values
- Make sure you're running `node server.js` from the project root
- Verify the SUPABASE_URL doesn't have a trailing slash

**"Cannot connect to Supabase" error:**
- Check your internet connection
- Verify the SUPABASE_URL is correct
- Check Supabase dashboard to ensure project is active

**ngrok connection issues:**
- Make sure ngrok is pointing to port 3000
- Try restarting ngrok
- Check that your local server is running on port 3000

**CORS errors:**
- The server has CORS enabled, so this shouldn't be an issue
- If you see CORS errors, check the server logs

## What to Test Before Pushing

✅ User signup and login
✅ Saving scopes (customer role)
✅ Viewing saved scopes
✅ Deleting saved scopes
✅ Role-based UI (Save vs Export buttons)
✅ Internal user Confluence export (if you set up a test internal user)
✅ Token persistence (refresh page, should stay logged in)

## After Testing

Once everything works locally:
1. Commit your changes (but NOT the `.env` file - it's already in .gitignore)
2. Push to GitHub
3. Railway will automatically deploy
4. Test on production to make sure it works there too
