# Hypothesis Scoper

A simple web application for product managers to convert ideas into hypotheses and then into execution scopes. Perfect for structured thinking and team handoffs.

## Features

- **Idea Input**: Paste your raw brain dump or idea
- **Hypothesis Generation**: Convert ideas to structured hypotheses using AI
- **Scope Generation**: Convert hypotheses to execution scopes with one click
- **Confluence-Friendly**: Copy outputs directly to Confluence without formatting issues
- **Simple UI**: Clean, focused interface optimized for productivity

## Setup

### Local Development

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Create `.env` file:**
   ```
   OPENAI_API_KEY=your_openai_api_key_here
   PORT=3000
   ```

3. **Start the server:**
   ```bash
   npm start
   ```

4. **Open your browser:**
   Navigate to `http://localhost:3000`

## Deployment to Railway

### Via GitHub

1. **Push your code to GitHub:**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin your-github-repo-url
   git push -u origin main
   ```

2. **Connect to Railway:**
   - Go to [Railway](https://railway.app)
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Choose your repository

3. **Add Environment Variable:**
   - In Railway dashboard, go to your project
   - Click on "Variables"
   - Add `OPENAI_API_KEY` with your OpenAI API key
   - Railway will automatically set `PORT`

4. **Deploy:**
   - Railway will automatically deploy on push to main branch
   - Your app will be available at the provided Railway URL

### Manual Railway Setup

If you prefer to deploy without GitHub:

1. Install Railway CLI:
   ```bash
   npm install -g @railway/cli
   ```

2. Login:
   ```bash
   railway login
   ```

3. Initialize project:
   ```bash
   railway init
   ```

4. Set environment variable:
   ```bash
   railway variables set OPENAI_API_KEY=your_key_here
   ```

5. Deploy:
   ```bash
   railway up
   ```

## Usage

1. **Enter Your Idea**: Paste your raw brain dump or product idea in the text area
2. **Generate Hypothesis**: Click "Generate Hypothesis" to convert your idea into structured hypotheses
3. **Copy Hypothesis**: Use "Copy to Clipboard" to paste into Confluence
4. **Generate Scope**: Click "Generate Scope" to convert the hypothesis into an execution scope
5. **Copy Scope**: Use "Copy to Clipboard" to paste the scope into Confluence

## Environment Variables

Create a `.env` file in the project root (see `.env.example` for template):

**Required:**
- `OPENAI_API_KEY`: Your OpenAI API key

**Optional (for Confluence export feature):**
- `CONFLUENCE_DOMAIN`: Your Confluence domain (e.g., `yourcompany.atlassian.net`)
- `CONFLUENCE_EMAIL`: Your Confluence account email
- `CONFLUENCE_API_TOKEN`: Your Confluence API token ([create one here](https://id.atlassian.com/manage-profile/security/api-tokens))
- `CONFLUENCE_SPACE_KEY`: Your Confluence space key (e.g., `NM`, `PROD`, `ENG`)

**Optional (for Supabase authentication):**
- `SUPABASE_URL`: Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Your Supabase service role key

**Optional (for Beehiiv newsletter integration):**
- `BEEHIV_API_KEY` or `BEEHIIV_API_KEY`: Your Beehiiv API key
- `BEEHIV_PUBLICATION_ID` or `BEEHIIV_PUBLICATION_ID`: Your Beehiiv publication ID (with `pub_` prefix for v2)

**Other:**
- `PORT` (optional): Server port (defaults to 3000)

**Note:** Never commit your `.env` file - it's already in `.gitignore`.

## Project Structure

```
.
├── server.js          # Express server and API endpoints
├── package.json       # Dependencies and scripts
├── railway.json       # Railway deployment configuration
├── public/
│   ├── index.html    # Main UI
│   ├── styles.css    # Styling
│   └── app.js        # Frontend JavaScript
└── README.md         # This file
```

## Notes

- Outputs are formatted as plain text for easy copying to Confluence
- The application uses GPT-4 for high-quality hypothesis and scope generation
- All prompts are pre-configured based on proven product management frameworks

