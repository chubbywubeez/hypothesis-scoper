-- Create saved_conversations table for Advanced Mode chat history
CREATE TABLE IF NOT EXISTS saved_conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  conversation JSONB NOT NULL, -- Store the full conversation array
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE saved_conversations ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own conversations
CREATE POLICY "Users can view own conversations" ON saved_conversations
  FOR SELECT USING (auth.uid() = user_id);

-- Policy: Users can insert their own conversations
CREATE POLICY "Users can insert own conversations" ON saved_conversations
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own conversations
CREATE POLICY "Users can update own conversations" ON saved_conversations
  FOR UPDATE USING (auth.uid() = user_id);

-- Policy: Users can delete their own conversations
CREATE POLICY "Users can delete own conversations" ON saved_conversations
  FOR DELETE USING (auth.uid() = user_id);

-- Policy: Service role can do anything (for backend operations)
CREATE POLICY "Service role full access" ON saved_conversations
  FOR ALL USING (auth.role() = 'service_role');

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS saved_conversations_user_id_idx ON saved_conversations(user_id);
CREATE INDEX IF NOT EXISTS saved_conversations_created_at_idx ON saved_conversations(created_at);
CREATE INDEX IF NOT EXISTS saved_conversations_updated_at_idx ON saved_conversations(updated_at);
