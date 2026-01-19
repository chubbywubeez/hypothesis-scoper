# Deployment Guide for Railway

This guide will help you deploy the Hypothesis Scoper to Railway via GitHub.

## Step 1: Create GitHub Repository

1. Go to [GitHub](https://github.com) and sign in
2. Click the "+" icon in the top right → "New repository"
3. Name it (e.g., `hypothesis-scoper`)
4. Set it to **Public** or **Private** (your choice)
5. **DO NOT** initialize with README, .gitignore, or license (we already have these)
6. Click "Create repository"

## Step 2: Push to GitHub

Run these commands in your project directory:

```bash
# Add GitHub remote (replace YOUR_USERNAME and REPO_NAME)
git remote add origin https://github.com/YOUR_USERNAME/REPO_NAME.git

# Rename main branch if needed
git branch -M main

# Push to GitHub
git push -u origin main
```

**OR** if you prefer SSH:
```bash
git remote add origin git@github.com:YOUR_USERNAME/REPO_NAME.git
git branch -M main
git push -u origin main
```

## Step 3: Deploy to Railway

1. **Sign up/Login to Railway**
   - Go to [railway.app](https://railway.app)
   - Sign in with your GitHub account (recommended)

2. **Create New Project**
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Choose your `hypothesis-scoper` repository
   - Railway will automatically detect the Node.js project

3. **Add Environment Variables**
   - In your Railway project dashboard, click on your service
   - Go to the "Variables" tab
   - Click "New Variable" for each of the following:
   
   **Required:**
   - `OPENAI_API_KEY` = `your_actual_openai_api_key_here`
   
   **For Confluence Export Feature (optional):**
   - `CONFLUENCE_DOMAIN` = `yourcompany.atlassian.net` (e.g., `theahamomentspace.atlassian.net`)
   - `CONFLUENCE_EMAIL` = `your.email@company.com`
   - `CONFLUENCE_API_TOKEN` = `your_confluence_api_token_here`
   - `CONFLUENCE_SPACE_KEY` = `YOUR_SPACE_KEY` (e.g., `NM`)
   
   - Click "Add" after each variable

4. **Deploy**
   - Railway will automatically start deploying when you connect the repo
   - The `PORT` environment variable is automatically set by Railway (no need to add it)
   - Wait for deployment to complete (usually 1-2 minutes)

5. **Get Your URL**
   - Once deployed, Railway will provide a public URL
   - Click on your service → "Settings" → "Generate Domain" (or use the auto-generated one)
   - Your app will be live at that URL!

## Step 4: Connect Custom Domain (Optional)

To connect your own domain to your Railway deployment:

1. **In Railway Dashboard:**
   - Go to your project → Click on your service
   - Navigate to "Settings" tab
   - Scroll down to "Domains" section
   - Click "Custom Domain" or "Add Domain"
   - Enter your domain name (e.g., `yourdomain.com` or `www.yourdomain.com`)
   - Railway will provide you with DNS records to configure

2. **Configure DNS Records:**
   Railway will give you one of these options:

   **Option A: CNAME Record (Recommended for subdomains)**
   - Type: `CNAME`
   - Name: `www` (or your subdomain)
   - Value: Railway will provide this (e.g., `your-app.up.railway.app`)
   - TTL: `3600` (or default)

   **Option B: A Record (For root domain)**
   - Type: `A`
   - Name: `@` (or leave blank for root domain)
   - Value: Railway will provide IP addresses (usually 2-4 IPs)
   - TTL: `3600` (or default)

3. **Where to Add DNS Records:**
   - Log into your domain registrar (GoDaddy, Namecheap, Cloudflare, etc.)
   - Navigate to DNS Management / DNS Settings
   - Add the records Railway provided
   - Save changes

4. **Wait for DNS Propagation:**
   - DNS changes can take 5 minutes to 48 hours to propagate
   - Usually takes 15-30 minutes
   - You can check propagation status at: https://www.whatsmydns.net

5. **Verify Domain:**
   - Railway will automatically verify your domain once DNS propagates
   - You'll see a green checkmark when it's verified
   - Your app will then be accessible at your custom domain!

**Important Notes:**
- If using Cloudflare, make sure SSL/TLS encryption mode is set to "Full" or "Full (strict)"
- For root domains (yourdomain.com), Railway may require you to use A records
- For subdomains (www.yourdomain.com), CNAME records work best
- Railway automatically provides SSL certificates via Let's Encrypt

## Step 5: Verify Deployment

1. Visit your Railway URL (or custom domain if configured)
2. You should see the landing page with "Stop building the wrong thing."
3. Click "Turn my idea into a plan" to go to the login screen
4. Test by logging in and entering an idea to generate a hypothesis
5. Make sure your OpenAI API key is working

## Future Updates

To deploy updates:
```bash
git add .
git commit -m "Your commit message"
git push
```

Railway will automatically detect the push and redeploy!

## Troubleshooting

**Build fails:**
- Check that `package.json` has all dependencies
- Verify `railway.json` configuration is correct
- Check Railway build logs for specific errors

**App doesn't work:**
- Verify `OPENAI_API_KEY` is set correctly in Railway variables
- Check Railway logs for runtime errors
- Ensure the port is correctly configured (Railway sets this automatically)

**Environment variables:**
- Railway automatically sets `PORT` - you don't need to add it
- **Required:** `OPENAI_API_KEY` - your OpenAI API key
- **Optional (for Confluence export):** `CONFLUENCE_DOMAIN`, `CONFLUENCE_EMAIL`, `CONFLUENCE_API_TOKEN`, `CONFLUENCE_SPACE_KEY`
- Never commit `.env` file (it's in `.gitignore`)
- See `.env.example` for the format of environment variables