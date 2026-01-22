// Express server for Hypothesis Scoper
// Handles API calls to OpenAI for hypothesis and scope generation

const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');
const https = require('https');
const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());

// IMPORTANT: Stripe webhook must be BEFORE express.json() middleware
// because Stripe needs the raw body for signature verification
// Stripe Webhook endpoint (for handling subscription events)
// This endpoint should be called by Stripe when subscription events occur
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  console.log('=== STRIPE WEBHOOK RECEIVED ===');
  console.log('Timestamp:', new Date().toISOString());
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  
  if (!webhookSecret) {
    console.error('❌ Stripe webhook secret not configured');
    return res.status(400).send('Webhook secret not configured');
  }
  
  console.log('Webhook secret configured:', webhookSecret ? 'Yes' : 'No');
  console.log('Signature header present:', sig ? 'Yes' : 'No');
  
  let event;
  
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    console.log('✅ Webhook signature verified');
    console.log('Event type:', event.type);
    console.log('Event ID:', event.id);
  } catch (err) {
    console.error('❌ Webhook signature verification failed:', err.message);
    console.error('Error details:', err);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  
  // Handle the event
  try {
    console.log('Processing event type:', event.type);
    
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const userId = session.metadata?.userId;
      
      console.log('Checkout session completed');
      console.log('Session ID:', session.id);
      console.log('User ID from metadata:', userId);
      console.log('Subscription ID:', session.subscription);
      console.log('Customer email:', session.customer_email);
      
      if (userId && supabase) {
        // Get subscription details
        const subscriptionId = session.subscription;
        const customerEmail = session.customer_email;
        
        console.log('Attempting to update profile for user:', userId);
        console.log('Subscription ID:', subscriptionId);
        console.log('Customer email:', customerEmail);
        
        // Get actual subscription status from Stripe (to handle 'trialing' status)
        let subscriptionStatus = 'active'; // Default
        if (subscriptionId && process.env.STRIPE_SECRET_KEY) {
          try {
            const subscription = await stripe.subscriptions.retrieve(subscriptionId);
            subscriptionStatus = subscription.status; // Can be 'trialing', 'active', etc.
            console.log('Subscription status from Stripe:', subscriptionStatus);
          } catch (err) {
            console.warn('Could not retrieve subscription from Stripe:', err.message);
          }
        }
        
        // First, check if the profile exists
        const { data: existingProfile, error: readError } = await supabase
          .from('profiles')
          .select('id, email, subscription_status, subscription_id')
          .eq('id', userId)
          .maybeSingle(); // Use maybeSingle() instead of single() to avoid error when no rows
        
        if (readError && readError.code !== 'PGRST116') {
          // PGRST116 is "no rows" which is expected if profile doesn't exist
          console.error('❌ Error reading profile:', readError);
        }
        
        // If profile doesn't exist, create it first
        if (!existingProfile) {
          console.warn('⚠️ Profile does not exist for user:', userId);
          console.log('Creating profile for user...');
          
          // Verify the user exists in auth.users first
          try {
            const { data: authUser, error: authError } = await supabase.auth.admin.getUserById(userId);
            
            if (authError) {
              console.error('❌ User does not exist in auth.users:', authError);
              console.error('Cannot create profile for non-existent user');
        } else {
              console.log('✅ User exists in auth.users:', authUser.user.email);
              
              // Create the profile
              // Map Stripe status: 'trialing' or 'active' both grant access
              const dbStatus = (subscriptionStatus === 'trialing' || subscriptionStatus === 'active') ? 'active' : 'inactive';
              
              const profileData = {
                id: userId,
                email: customerEmail || authUser.user.email || 'unknown@example.com',
                role: 'customer',
                subscription_status: dbStatus,
                subscription_id: subscriptionId,
                subscription_started_at: new Date().toISOString(),
                subscription_updated_at: new Date().toISOString(),
                terms_accepted: true, // Assume terms accepted if they completed checkout
                terms_accepted_at: new Date().toISOString()
              };
              
              console.log('Creating profile with data:', JSON.stringify(profileData, null, 2));
              
              const { data: newProfile, error: createError } = await supabase
                .from('profiles')
                .insert(profileData)
                .select();
              
              if (createError) {
                console.error('❌ Error creating profile:', createError);
                console.error('Error code:', createError.code);
                console.error('Error message:', createError.message);
                console.error('Error details:', createError.details);
                console.error('Error hint:', createError.hint);
              } else if (!newProfile || newProfile.length === 0) {
                console.error('❌ Profile creation returned no rows - RLS policy may be blocking insert');
              } else {
                console.log(`✅ Profile created successfully for user: ${userId}`);
                console.log('Created profile:', JSON.stringify(newProfile, null, 2));
              }
            }
          } catch (authErr) {
            console.error('❌ Error checking auth user:', authErr);
          }
        } else {
          // Profile exists, update it
          console.log('✅ Profile exists, updating subscription info');
          console.log('Current profile:', JSON.stringify(existingProfile, null, 2));
        
        // Update user profile with subscription info
          // Map Stripe status: 'trialing' or 'active' both grant access
          const dbStatus = (subscriptionStatus === 'trialing' || subscriptionStatus === 'active') ? 'active' : 'inactive';
          
          // Do UPDATE without .select() first, then verify separately
          const { error } = await supabase
          .from('profiles')
          .update({
            subscription_status: dbStatus,
            subscription_id: subscriptionId,
              subscription_started_at: existingProfile.subscription_started_at || new Date().toISOString(),
              subscription_updated_at: new Date().toISOString()
          })
            .eq('id', userId);
        
        if (error) {
          console.error('❌ Error updating profile:', error);
          console.error('Error code:', error.code);
          console.error('Error message:', error.message);
          console.error('Error details:', error.details);
          console.error('Error hint:', error.hint);
        } else {
            // Update completed without error, verify by reading
            console.log('✅ Update completed without error, verifying...');
            console.log('Expected dbStatus:', dbStatus);
            console.log('Expected subscription_id:', subscriptionId);
            
            const { data: verifyData, error: verifyError } = await supabase
              .from('profiles')
              .select('id, email, subscription_status, subscription_id, subscription_updated_at')
              .eq('id', userId)
              .single();
            
            if (verifyError) {
              console.error('❌ Error reading updated row:', verifyError);
            } else if (verifyData) {
              console.log('✅ Verification read successful');
              console.log('Actual subscription_status:', verifyData.subscription_status);
              console.log('Actual subscription_id:', verifyData.subscription_id);
              
              if (verifyData.subscription_status === dbStatus && verifyData.subscription_id === subscriptionId) {
                console.log(`✅ Subscription activated for user: ${userId}`);
                console.log('Updated profile:', JSON.stringify(verifyData, null, 2));
              } else {
                console.warn('⚠️ Update may not have worked - values do not match');
                console.warn('Expected status:', dbStatus, 'Got:', verifyData.subscription_status);
                console.warn('Expected subscription_id:', subscriptionId, 'Got:', verifyData.subscription_id);
              }
            } else {
              console.error('❌ Verification returned no data - RLS may be blocking select');
            }
          }
        }
      } else {
        console.warn('⚠️ Missing userId or supabase not configured');
        console.warn('userId:', userId);
        console.warn('supabase configured:', !!supabase);
      }
    } else if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object;
      
      console.log('=== SUBSCRIPTION UPDATE/DELETE EVENT ===');
      console.log('Subscription ID:', subscription.id);
      console.log('Subscription status:', subscription.status);
      console.log('Customer ID:', subscription.customer);
      
      if (supabase) {
        console.log('✅ Supabase client available');
        
        // First, try to find user by subscription ID
        console.log('Step 1: Searching for user by subscription_id:', subscription.id);
        const { data: profiles, error: findError } = await supabase
          .from('profiles')
          .select('id, email, subscription_id, subscription_status')
          .eq('subscription_id', subscription.id)
          .limit(1);
        
        if (findError) {
          console.error('❌ Error finding user by subscription ID:', findError);
          console.error('Error code:', findError.code);
          console.error('Error message:', findError.message);
          console.error('Error details:', findError.details);
        } else {
          console.log('Query result - Profiles found:', profiles ? profiles.length : 0);
          if (profiles && profiles.length > 0) {
            console.log('Found profiles:', JSON.stringify(profiles, null, 2));
          }
        }
        
        if (profiles && profiles.length > 0) {
          const userId = profiles[0].id;
          const userEmail = profiles[0].email;
          // Map Stripe status: 'trialing' or 'active' both grant access
          const status = (subscription.status === 'trialing' || subscription.status === 'active') ? 'active' : 'inactive';
          
          console.log(`✅ Found user by subscription ID: ${userId} (${userEmail})`);
          console.log(`Updating subscription status to: ${status}`);
          
          // Update subscription status
          // Do UPDATE without .select() first, then verify separately
          console.log('Attempting UPDATE with service role...');
          console.log('User ID to update:', userId);
          console.log('New status:', status);
          
          const { error: updateError } = await supabase
            .from('profiles')
            .update({
              subscription_status: status,
              subscription_updated_at: new Date().toISOString()
            })
            .eq('id', userId);
          
          if (updateError) {
            console.error('❌ Error updating subscription status:', updateError);
            console.error('Error code:', updateError.code);
            console.error('Error message:', updateError.message);
            console.error('Error details:', updateError.details);
            console.error('Error hint:', updateError.hint);
          } else {
            // Update completed without error, verify by reading
            console.log('✅ Update completed without error, verifying...');
            const { data: verifyData, error: verifyError } = await supabase
              .from('profiles')
              .select('id, email, subscription_status, subscription_id, subscription_updated_at')
              .eq('id', userId)
              .single();
            
            if (verifyError) {
              console.error('❌ Error reading updated row:', verifyError);
            } else if (verifyData && verifyData.subscription_status === status) {
              console.log(`✅ Successfully updated subscription ${status} for user: ${userId}`);
              console.log('Updated profile:', JSON.stringify(verifyData, null, 2));
            } else {
              console.warn('⚠️ Update may not have worked - status does not match');
              console.warn('Expected:', status, 'Got:', verifyData?.subscription_status);
            }
          }
        } else {
          console.warn('⚠️ No user found with subscription ID:', subscription.id);
          console.log('Step 2: Attempting to find user by customer email from Stripe...');
          
          // Fallback: Try to find user by customer email from Stripe
          // We need to get the customer object from Stripe to get the email
          try {
            if (subscription.customer) {
              console.log('Retrieving customer from Stripe:', subscription.customer);
              const customer = await stripe.customers.retrieve(subscription.customer);
              const customerEmail = customer.email;
              
              console.log('Customer retrieved from Stripe');
              console.log('Customer email:', customerEmail);
              console.log('Customer ID:', customer.id);
              
              if (customerEmail) {
                // Find user by email (case-insensitive search)
                console.log('Step 3: Searching for user by email in database:', customerEmail);
                const { data: emailProfiles, error: emailError } = await supabase
                  .from('profiles')
                  .select('id, email, subscription_id, subscription_status')
                  .ilike('email', customerEmail)
                  .limit(1);
                
                if (emailError) {
                  console.error('❌ Error finding user by email:', emailError);
                  console.error('Error code:', emailError.code);
                  console.error('Error message:', emailError.message);
                  console.error('Error details:', emailError.details);
                } else {
                  console.log('Email query result - Profiles found:', emailProfiles ? emailProfiles.length : 0);
                  if (emailProfiles && emailProfiles.length > 0) {
                    console.log('Found profiles by email:', JSON.stringify(emailProfiles, null, 2));
                  }
                }
                
                if (emailProfiles && emailProfiles.length > 0) {
                  const userId = emailProfiles[0].id;
                  // Map Stripe status: 'trialing' or 'active' both grant access
                  const status = (subscription.status === 'trialing' || subscription.status === 'active') ? 'active' : 'inactive';
                  
                  console.log(`✅ Found user by email: ${userId}`);
                  console.log(`Current subscription_id in DB: ${emailProfiles[0].subscription_id || 'NULL'}`);
                  console.log(`Updating subscription_id to: ${subscription.id}`);
                  console.log(`Updating subscription_status to: ${status}`);
                  
                  // Update with subscription ID and status
                  // Verify we're using service role key
                  console.log('Verifying Supabase client configuration...');
                  console.log('Service role key present:', !!process.env.SUPABASE_SERVICE_ROLE_KEY);
                  console.log('Service role key length:', process.env.SUPABASE_SERVICE_ROLE_KEY ? process.env.SUPABASE_SERVICE_ROLE_KEY.length : 0);
                  console.log('Supabase URL:', process.env.SUPABASE_URL);
                  
                  // Try the update
                  console.log('Attempting UPDATE operation...');
                  console.log('User ID:', userId);
                  console.log('New subscription_status:', status);
                  console.log('New subscription_id:', subscription.id);
                  
                  // Try UPDATE without .select() first to see if it actually updates
                  const { error: updateError } = await supabase
                    .from('profiles')
                    .update({
                      subscription_status: status,
                      subscription_id: subscription.id,
                      subscription_updated_at: new Date().toISOString()
                    })
                    .eq('id', userId);
                  
                  console.log('Update operation completed (without select)');
                  console.log('Update error:', updateError ? JSON.stringify(updateError, null, 2) : 'NULL');
                  
                  if (updateError) {
                    console.error('❌ Error updating subscription status:', updateError);
                    console.error('Error code:', updateError.code);
                    console.error('Error message:', updateError.message);
                    console.error('Error details:', updateError.details);
                    console.error('Error hint:', updateError.hint);
                    console.error('This suggests an RLS policy issue or database constraint violation');
                  } else {
                    // Update succeeded, now verify by reading the row
                    console.log('✅ Update completed without error, verifying by reading row...');
                    const { data: verifyData, error: verifyError } = await supabase
                      .from('profiles')
                      .select('id, email, subscription_status, subscription_id, subscription_updated_at')
                      .eq('id', userId)
                      .single();
                    
                    if (verifyError) {
                      console.error('❌ Error reading updated row:', verifyError);
                    } else if (verifyData) {
                      console.log(`✅ Successfully updated subscription ${status} for user: ${userId} (found by email)`);
                      console.log('Updated profile:', JSON.stringify(verifyData, null, 2));
                      
                      // Verify the update actually happened
                      if (verifyData.subscription_status === status && verifyData.subscription_id === subscription.id) {
                        console.log('✅ Update verified - subscription status and ID match expected values');
                      } else {
                        console.warn('⚠️ Update may not have worked - values do not match');
                        console.warn('Expected status:', status, 'Got:', verifyData.subscription_status);
                        console.warn('Expected subscription_id:', subscription.id, 'Got:', verifyData.subscription_id);
                      }
                    } else {
                      console.error('❌ Update completed but cannot read updated row');
                    }
                  }
                } else {
                  console.warn('⚠️ No user found with email:', customerEmail);
                  console.log('Step 4: Attempting to find user in auth.users and create profile...');
                  
                  // Try to find the user in auth.users by email
                  try {
                    // List users by email (Supabase Admin API)
                    const { data: authUsers, error: listUsersError } = await supabase.auth.admin.listUsers();
                    
                    if (listUsersError) {
                      console.error('❌ Error listing auth users:', listUsersError);
                    } else {
                      // Find user by email (case-insensitive)
                      const matchingUser = authUsers.users.find(
                        u => u.email && u.email.toLowerCase() === customerEmail.toLowerCase()
                      );
                      
                      if (matchingUser) {
                        console.log(`✅ Found user in auth.users: ${matchingUser.id}`);
                        console.log('Creating profile for this user...');
                        
                        // Map Stripe status: 'trialing' or 'active' both grant access
                        const status = (subscription.status === 'trialing' || subscription.status === 'active') ? 'active' : 'inactive';
                        const profileData = {
                          id: matchingUser.id,
                          email: customerEmail,
                          role: 'customer',
                          subscription_status: status,
                          subscription_id: subscription.id,
                          subscription_started_at: new Date().toISOString(),
                          subscription_updated_at: new Date().toISOString(),
                          terms_accepted: true, // Assume terms accepted if they have a subscription
                          terms_accepted_at: new Date().toISOString()
                        };
                        
                        console.log('Creating profile with data:', JSON.stringify(profileData, null, 2));
                        
                        const { data: newProfile, error: createError } = await supabase
                          .from('profiles')
                          .insert(profileData)
                          .select();
                        
                        if (createError) {
                          console.error('❌ Error creating profile:', createError);
                          console.error('Error code:', createError.code);
                          console.error('Error message:', createError.message);
                          console.error('Error details:', createError.details);
                          console.error('Error hint:', createError.hint);
                        } else if (!newProfile || newProfile.length === 0) {
                          console.error('❌ Profile creation returned no rows - RLS policy may be blocking insert');
                        } else {
                          console.log(`✅ Profile created successfully for user: ${matchingUser.id}`);
                          console.log('Created profile:', JSON.stringify(newProfile, null, 2));
                        }
                      } else {
                        console.warn('⚠️ No user found in auth.users with email:', customerEmail);
                        console.warn('This could mean:');
                        console.warn('  1. The user profile was not created in the database');
                        console.warn('  2. The email in Stripe does not match the email in the database');
                        console.warn('  3. The user signed up with a different email');
                        console.warn('  4. The user does not exist in auth.users');
                        
                        // List all profiles to help debug
                        console.log('Listing sample profiles in database for debugging...');
                        const { data: allProfiles, error: listError } = await supabase
                          .from('profiles')
                          .select('id, email, subscription_id')
                          .limit(10);
                        
                        if (listError) {
                          console.error('❌ Error listing profiles:', listError);
                        } else {
                          console.log('Sample profiles in database:', JSON.stringify(allProfiles, null, 2));
                        }
                      }
                    }
                  } catch (authErr) {
                    console.error('❌ Error searching auth users:', authErr);
                  }
                }
              } else {
                console.warn('⚠️ Customer has no email in Stripe');
              }
            } else {
              console.warn('⚠️ Subscription has no customer ID');
            }
          } catch (stripeError) {
            console.error('❌ Error retrieving customer from Stripe:', stripeError);
            console.error('Stripe error message:', stripeError.message);
            console.error('Stripe error type:', stripeError.type);
          }
        }
      } else {
        console.warn('⚠️ Supabase not configured - cannot update subscription');
      }
    } else {
      console.log('Unhandled event type:', event.type);
    }
    
    console.log('=== WEBHOOK PROCESSING COMPLETE ===');
    res.json({ received: true });
  } catch (error) {
    console.error('❌ Webhook handler error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
});

// Test endpoint to verify webhook URL is accessible
app.get('/api/stripe/webhook', (req, res) => {
  res.status(200).json({ 
    message: 'Webhook endpoint is accessible',
    endpoint: '/api/stripe/webhook',
    method: 'POST',
    note: 'This endpoint only accepts POST requests from Stripe. Use POST method for webhooks.'
  });
});

// Now apply JSON parsing middleware for all other routes
app.use(express.json());

// Note: API routes are defined below, before static file serving

// Debug: Log environment info (first few chars only for security)
console.log('=== ENVIRONMENT DEBUG ===');
console.log('PORT:', process.env.PORT);
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('Total env vars:', Object.keys(process.env).length);
console.log('Has OPENAI_API_KEY:', !!process.env.OPENAI_API_KEY);
console.log('OPENAI_API_KEY length:', process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.length : 0);
console.log('=======================');

// Check for required environment variables
// Note: We check this early so the app fails fast if misconfigured
if (!process.env.OPENAI_API_KEY) {
  console.error('========================================');
  console.error('ERROR: OPENAI_API_KEY environment variable is not set!');
  console.error('========================================');
  console.error('Please add OPENAI_API_KEY to your .env file (locally) or Railway environment variables (deployment).');
  console.error('Debug: All env vars:', Object.keys(process.env).filter(k => k.includes('OPENAI')).join(', ') || 'None found');
  console.error('Total environment variables available:', Object.keys(process.env).length);
  console.error('========================================');
  console.error('Server will exit with code 1');
  console.error('========================================');
  // Exit with error code - this will crash the container
  // Railway will show this as a failed deployment
  process.exit(1);
}

// Warn about missing Confluence credentials (optional feature, so we don't exit)
if (!process.env.CONFLUENCE_DOMAIN || !process.env.CONFLUENCE_EMAIL || !process.env.CONFLUENCE_API_TOKEN || !process.env.CONFLUENCE_SPACE_KEY) {
  console.warn('WARNING: Confluence credentials not set. Confluence export feature will not work.');
  console.warn('Required: CONFLUENCE_DOMAIN, CONFLUENCE_EMAIL, CONFLUENCE_API_TOKEN, CONFLUENCE_SPACE_KEY');
}

// Initialize Supabase client
// Note: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY should be set in environment variables
let supabase = null;
if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
  supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false
      },
      // Explicitly set db schema to public
      db: {
        schema: 'public'
      },
      // Explicitly set headers to ensure service role key is used for all requests
      global: {
        headers: {
          'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
        }
      }
    }
  );
  console.log('Supabase client initialized');
  console.log('Using service role key (should bypass RLS):', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'Yes' : 'No');
  console.log('Service role key length:', process.env.SUPABASE_SERVICE_ROLE_KEY ? process.env.SUPABASE_SERVICE_ROLE_KEY.length : 0);
  console.log('Service role key starts with:', process.env.SUPABASE_SERVICE_ROLE_KEY ? process.env.SUPABASE_SERVICE_ROLE_KEY.substring(0, 20) : 'N/A');
} else {
  console.warn('WARNING: Supabase credentials not set. Authentication and save features will not work.');
  console.warn('Required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
}

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Initialize Resend client for sending emails
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
if (resend) {
  console.log('Resend client initialized');
} else {
  console.warn('WARNING: RESEND_API_KEY not set. Password reset emails will not work.');
}

// Prompt DSL: Hypothesis + Scope prompts are now built from reusable sections.
// This keeps server.js smaller and makes prompt editing safer.
const { buildHypothesisPrompt, buildScopePrompt } = require('./prompts/promptDsl');

// API endpoint: Convert idea to hypothesis (with streaming)
app.post('/api/generate-hypothesis', async (req, res) => {
  try {
    const { idea } = req.body;

    // Validate input
    if (!idea || idea.trim().length === 0) {
      return res.status(400).json({ error: 'Idea input is required' });
    }

    // Build prompt via our lightweight prompt DSL.
    // This keeps the prompt maintainable while preserving the same content/structure.
    const fullPrompt = buildHypothesisPrompt(idea);

    // Set headers for SSE streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Get user ID from auth header if available (for tracking)
    let userId = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      try {
        const { data: { user } } = await supabase?.auth.getUser(token) || { data: { user: null } };
        userId = user?.id || null;
      } catch (e) {
        // Ignore auth errors for tracking
      }
    }

    // Call OpenAI API with streaming
    const stream = await openai.chat.completions.create({
      model: 'gpt-5.2',
      messages: [
        {
          role: 'user',
          content: fullPrompt
        }
      ],
      temperature: 0.7,
      max_completion_tokens: 8000,
      stream: true
    });

    // Stream the response and collect for tracking
    let fullResponse = '';
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        fullResponse += content;
        // Send chunk as SSE
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    // Track generation (after streaming completes)
    if (userId) {
      // Estimate tokens: ~4 characters per token
      const estimatedTokens = Math.ceil((fullPrompt.length + fullResponse.length) / 4);
      await trackGeneration(userId, 'hypothesis', estimatedTokens, fullPrompt.length, fullResponse.length);
    }

    // Send completion signal
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (error) {
    console.error('Error generating hypothesis:', error);
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
  }
});

// API endpoint: Convert hypothesis to scope (with streaming)
app.post('/api/generate-scope', async (req, res) => {
  try {
    const { hypothesis, idea } = req.body;

    // Validate input
    if (!hypothesis || hypothesis.trim().length === 0) {
      return res.status(400).json({ error: 'Hypothesis input is required' });
    }

    // Build input context (include original idea if provided, otherwise just hypothesis)
    const inputContext = idea 
      ? `${idea}\n\n---\n\nHypothesis:\n${hypothesis}`
      : hypothesis;

    // Build prompt via our lightweight prompt DSL.
    // This keeps the prompt maintainable while preserving the same content/structure.
    const fullPrompt = buildScopePrompt(inputContext, hypothesis);

    // Set headers for SSE streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Get user ID from auth header if available (for tracking)
    let userId = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      try {
        const { data: { user } } = await supabase?.auth.getUser(token) || { data: { user: null } };
        userId = user?.id || null;
      } catch (e) {
        // Ignore auth errors for tracking
      }
    }

    // Call OpenAI API with streaming
    const stream = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: fullPrompt
        }
      ],
      temperature: 0.7,
      max_completion_tokens: 8000,
      stream: true
    });

    // Stream the response and collect for tracking
    let fullResponse = '';
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        fullResponse += content;
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    // Track generation (after streaming completes)
    if (userId) {
      // Estimate tokens: ~4 characters per token
      const estimatedTokens = Math.ceil((fullPrompt.length + fullResponse.length) / 4);
      await trackGeneration(userId, 'scope', estimatedTokens, fullPrompt.length, fullResponse.length);
    }

    // Send completion signal
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (error) {
    console.error('Error generating scope:', error);
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
  }
});

// API endpoint: Quick Scope - Generate both hypothesis and scope at once
app.post('/api/quick-scope', async (req, res) => {
  // Set headers for SSE streaming first (before any validation)
  // This ensures we can send errors in SSE format if needed
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const { idea } = req.body;

    // Validate input - send errors in SSE format
    if (!idea || idea.trim().length === 0) {
      res.write(`data: ${JSON.stringify({ error: 'Idea input is required' })}\n\n`);
      res.end();
      return;
    }

    // Quick Scope Prompt - combines hypothesis and scope in one output
    const QUICK_SCOPE_PROMPT = `You are a Senior Product Manager and Systems Designer.

I am going to give you a raw, unstructured idea about a product, feature, or system.

Your job is to produce a clear, actionable output that maps out both the hypotheses and execution scope in one document.

OUTPUT STRUCTURE (MUST FOLLOW EXACTLY):

Hypothesis

What are we trying to prove with this? Give me 2-5 hypothesis. How do we validate this was a success. What are we testing for?

User Story

As the Product/System, I want ___ so that ___

As the Primary Operator/Persona, I want ___ so that ___

As the End User, I want ___ so that ___

Ideal Solution 

List out all the crazy ideals for the dream solution. Do not include the MVP.

MVP

🟢 Required 

🟡 Like to have

🔴 Nice to have 

Definition of done

How can we objectively measure when we are done

Actions

Give a bullet by bullet list of task necessary to complete the task

INPUT

Here is the idea:

{INPUT_PLACEHOLDER}`;

    // Replace placeholder with actual idea
    const fullPrompt = QUICK_SCOPE_PROMPT.replace('{INPUT_PLACEHOLDER}', idea.trim());

    // Get user ID from auth header if available (for tracking)
    let userId = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      try {
        const { data: { user } } = await supabase?.auth.getUser(token) || { data: { user: null } };
        userId = user?.id || null;
      } catch (e) {
        // Ignore auth errors for tracking
      }
    }

    // Call OpenAI API with streaming
    const stream = await openai.chat.completions.create({
      model: 'gpt-5.2',
      messages: [
        {
          role: 'user',
          content: fullPrompt
        }
      ],
      temperature: 0.7,
      max_completion_tokens: 8000,
      stream: true
    });

    // Stream the response and collect for tracking
    let buffer = '';
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        buffer += content;
        // Send chunk as SSE
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    // Track generation (after streaming completes)
    if (userId) {
      // Estimate tokens: ~4 characters per token
      const estimatedTokens = Math.ceil((fullPrompt.length + buffer.length) / 4);
      await trackGeneration(userId, 'quick_scope', estimatedTokens, fullPrompt.length, buffer.length);
    }

    // Send completion signal
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (error) {
    console.error('Error generating quick scope:', error);
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
  }
});

// API endpoint: Advanced conversation - ChatGPT-like dialogue
// This endpoint handles the conversation in Advanced Mode
app.post('/api/advanced-conversation', async (req, res) => {
  // Set headers for SSE streaming
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    // Check authentication and subscription
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.write(`data: ${JSON.stringify({ error: 'Authentication required' })}\n\n`);
      res.end();
      return;
    }
    
    const token = authHeader.substring(7);
    
    if (!supabase) {
      res.write(`data: ${JSON.stringify({ error: 'Server configuration error' })}\n\n`);
      res.end();
      return;
    }
    
    // Verify token and get user
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      res.write(`data: ${JSON.stringify({ error: 'Invalid or expired token' })}\n\n`);
      res.end();
      return;
    }
    
    // Get user profile to check role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    
    // Check if user has access to Advanced Mode
    const hasAccess = await hasAdvancedModeAccess(user.id, profile?.role || 'customer');
    
    if (!hasAccess) {
      res.write(`data: ${JSON.stringify({ error: 'Subscription required. Please upgrade to access Advanced Mode.' })}\n\n`);
      res.end();
      return;
    }
    
    const { conversation } = req.body;

    // Validate input
    if (!conversation || !Array.isArray(conversation) || conversation.length === 0) {
      res.write(`data: ${JSON.stringify({ error: 'Conversation is required' })}\n\n`);
      res.end();
      return;
    }

    // Create system message for the assistant
    // Senior Operator AI persona - direct, structured, execution-focused
    const systemMessage = `SYSTEM PERSONA: "Senior Operator AI"
Core Identity

You are a senior product, systems, and execution operator.
You think in constraints, tradeoffs, and falsifiable outcomes.
You optimize for leverage, clarity, and shipping, not vibes.

You are allergic to fluff, abstraction, and motivational filler.

Operating Principles

Truth over comfort. Always.

Clarity beats cleverness.

Execution beats ideation.

Constraints create strategy.

If it cannot fail, it is not a real test.

If it cannot ship, it is noise.

You default to skepticism. You assume the idea is wrong until proven otherwise.

Communication Style

Direct.

Concise.

Structured.

Zero hand-holding.

No corporate platitudes.

No inspirational language unless explicitly requested.

Short paragraphs.

Lists over prose.

Declarative statements over questions.

You do not hedge language unless uncertainty is real and material.

You do not mirror the user emotionally. You stay grounded and analytical.

You never use em dashes. Use periods or commas only.

Tone

Calm.

Confident.

Slightly confrontational when needed.

Respectful but not deferential.

Feels like a senior advisor who has seen this fail before.

You are allowed to say:

"This won't work."

"You're optimizing the wrong thing."

"This is premature."

"This is a distraction."

You are not allowed to say:

"It depends" without immediately defining what it depends on.

"Great idea" without qualification.

"You could consider" when there is a clearer recommendation.

Thinking Model

You think in:

Systems.

First principles.

Failure modes.

Second-order effects.

Opportunity cost.

User behavior, not user intent.

You explicitly separate:

Strategy vs execution

MVP vs nice-to-have

Signal vs vanity metrics

Hypothesis vs assumption

Output Expectations

When given a task, you default to producing:

Clear structure

Explicit scope

Tradeoffs

Success and failure definitions

What is excluded and why

If the input is vague, you still produce an answer and call out assumptions instead of blocking.

Relationship to the User

You treat the user as a high-agency builder, not a beginner.
You assume they want leverage, not reassurance.
You push back when they are lying to themselves.

You optimize for:

Faster decisions

Fewer regrets

Fewer rewrites

Cleaner execution

Forbidden Behaviors

No motivational speeches.

No filler summaries.

No rephrasing the user's idea just to sound smart.

No softening hard truths.

No pretending uncertainty is wisdom.

Default Questioning Pattern

You only ask questions when:

A missing constraint would materially change the answer.

A decision cannot be made without it.

Otherwise, you make a call.

Final Instruction

Act like the AI version of a senior product lead, execution coach, and systems thinker combined.

Your job is not to be liked.
Your job is to make the outcome better.

Your goal in this conversation is to help the user refine their product idea into a well-structured hypothesis. Be direct. Challenge assumptions. Push for clarity on constraints, users, success metrics, and failure modes. When they have enough context, tell them they're ready to generate the hypothesis.`;

    // Build messages array with system message + conversation history
    const messages = [
      {
        role: 'system',
        content: systemMessage
      },
      ...conversation.map(msg => ({
        role: msg.role,
        content: msg.content
      }))
    ];

    // Call OpenAI API with streaming
    const stream = await openai.chat.completions.create({
      model: 'gpt-5.2',
      messages: messages,
      temperature: 0.7,
      max_completion_tokens: 2000,
      stream: true
    });

    // Stream the response and collect for tracking
    let fullResponse = '';
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        fullResponse += content;
        // Send chunk as SSE
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    // Track generation (after streaming completes)
    // Note: We track this as 'advanced_conversation' type
    if (user.id) {
      // Estimate tokens: ~4 characters per token
      const conversationText = JSON.stringify(conversation);
      const estimatedTokens = Math.ceil((conversationText.length + fullResponse.length) / 4);
      await trackGeneration(user.id, 'advanced_conversation', estimatedTokens, conversationText.length, fullResponse.length);
    }

    // Send completion signal
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (error) {
    console.error('Error in advanced conversation:', error);
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
  }
});

// API endpoint: Generate hypothesis from advanced conversation (with streaming)
// This endpoint takes the conversation history and generates a hypothesis
app.post('/api/generate-hypothesis-advanced', async (req, res) => {
  // Set headers for SSE streaming
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    // Check authentication and subscription
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.write(`data: ${JSON.stringify({ error: 'Authentication required' })}\n\n`);
      res.end();
      return;
    }
    
    const token = authHeader.substring(7);
    
    if (!supabase) {
      res.write(`data: ${JSON.stringify({ error: 'Server configuration error' })}\n\n`);
      res.end();
      return;
    }
    
    // Verify token and get user
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      res.write(`data: ${JSON.stringify({ error: 'Invalid or expired token' })}\n\n`);
      res.end();
      return;
    }
    
    // Get user profile to check role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    
    // Check if user has access to Advanced Mode
    const hasAccess = await hasAdvancedModeAccess(user.id, profile?.role || 'customer');
    
    if (!hasAccess) {
      res.write(`data: ${JSON.stringify({ error: 'Subscription required. Please upgrade to access Advanced Mode.' })}\n\n`);
      res.end();
      return;
    }
    
    const { conversation } = req.body;

    // Validate input
    if (!conversation || !Array.isArray(conversation) || conversation.length === 0) {
      res.write(`data: ${JSON.stringify({ error: 'Conversation is required' })}\n\n`);
      res.end();
      return;
    }

    // Convert conversation to a summary/context string
    // This gives the hypothesis prompt the full context from the conversation
    const conversationContext = conversation
      .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
      .join('\n\n');

    // Create a prompt that includes the conversation context
    // Use the same HYPOTHESIS_PROMPT structure but with conversation context
    const fullPrompt = `Role & Framing

You are a Senior Growth Product Manager and Experimentation Lead.

I am going to give you a conversation where a user discussed their product idea with an assistant. This conversation contains refined context about their idea.

Your job is to:
- Derive the correct hypotheses from first principles
- Make those hypotheses visible immediately
- Define the simplest possible real-world test for each hypothesis
- Protect from premature scope and overbuilding
- Produce an output that can be understood at a glance by a busy stakeholder

Assume:
- This is early-stage
- We care more about learning than polish
- Every hypothesis must be falsifiable
- If something fails, we want to know why, not guess

OUTPUT RULES (NON-NEGOTIABLE)
- Do not guess missing data
- Do not invent metrics I didn't imply
- If information is missing, ask targeted questions at the end
- Hypotheses must be visible before explanation
- Prefer simple tests over perfect ones
- Optimize for clarity first, depth second

STEP 0 — EXECUTIVE HYPOTHESIS SNAPSHOT (REQUIRED)

This section must fit on one screen and be readable in under 60 seconds.

0.1 What We're Testing (Plain English)
One sentence describing the core bet behind this project.

0.2 Top 3 Hypotheses (Ranked by Leverage)
Hypothesis A (Highest Leverage)
If we [action], then [outcome], because [mechanism].

Hypothesis B
If we [action], then [outcome], because [mechanism].

Hypothesis C
If we [action], then [outcome], because [mechanism].

0.3 What Success Looks Like (Concrete)
Hypothesis A succeeds if: …
Hypothesis B succeeds if: …
Hypothesis C succeeds if: …

0.4 What Failure Would Mean (Learning, Not Blame)
If A fails, we learn: …
If B fails, we learn: …
If C fails, we learn: …

0.5 Build / Don't Build (Now)
Build now (minimum required):
…
Do NOT build yet (even if tempting):
…

Only after this snapshot is complete should you continue.

STEP 1 — UNDERLYING BELIEF EXTRACTION (NO JUDGMENT)
From the conversation, list clearly:

1.1 Implicit beliefs about users
(What must be true about user behavior or psychology for this to work?)

1.2 Assumptions about friction and value
(Where is the user assuming users will tolerate effort? Where do they believe value is created?)

1.3 Unvalidated leaps of logic
(Where is the user jumping from idea → outcome without proof?)

Do not validate yet. Just surface.

STEP 2 — SYSTEM-LEVEL HYPOTHESES (NORTH STAR)
State 2–3 system-level hypotheses that must be true if the entire system works.

Format exactly:
System Hypothesis #1
If we [system-level change], then [core outcome] will improve, because [fundamental behavioral or psychological mechanism].

Avoid feature language.
This is about cause and effect.

STEP 3 — STAGE-LEVEL HYPOTHESES (PER MAJOR STEP)
Break the system into its major stages
(e.g. Ad → Landing → Questions → Brain Dump → Gate → Output).

For each stage, provide:

3.1 Job of this stage
(What must this stage prove or create to justify the next?)

3.2 Primary hypothesis
If we [specific action at this stage], then [local signal] will change, because [mechanism].

3.3 Energy required from the user
(Low / Medium / High — and why)

3.4 Strongest signal that the stage worked
(Behavioral proof, not vanity metrics)

STEP 4 — SIMPLEST POSSIBLE FALSIFICATION TEST
For each hypothesis:

4.1 What must happen to support it
(Observable behavior)

4.2 What would clearly invalidate it
(Outcome that forces us to reject the assumption)

4.3 The simplest real-world test
Constraints:
- No heavy infrastructure
- No long timelines
- Testable within days or small samples

If a hypothesis cannot be simply falsified, flag it.

STEP 5 — SCOPE BOUNDARIES (ANTI-OVERBUILD)
Based on the hypotheses:

5.1 What is required to test them
(Minimum viable system)

5.2 What is nice but unjustified right now

5.3 What should explicitly not be built yet

This section exists to protect focus.

STEP 6 — FAILURE & DROP-OFF INTERPRETATION
For each stage:

Most likely reason users fail here
What that failure teaches us
Whether it invalidates:
- the stage hypothesis
- the system hypothesis
- or just execution

Failure must produce learning.

STEP 7 — METRICS (ONLY AFTER THINKING)
Only after all reasoning:

Primary success metrics
Secondary diagnostics
Guardrails ("do no harm")

If metrics are unclear, ask clarifying questions instead of guessing.

FINAL CHECK (REQUIRED)
End by answering:
"If this fails, what will we know that we don't know today?"

If the answer is vague, tighten the hypotheses.

INPUT

Here is the conversation about the product idea:

-------------------------------------
${conversationContext}
-------------------------------------`;

    // Call OpenAI API with streaming
    const stream = await openai.chat.completions.create({
      model: 'gpt-5.2',
      messages: [
        {
          role: 'user',
          content: fullPrompt
        }
      ],
      temperature: 0.7,
      max_completion_tokens: 8000,
      stream: true
    });

    // Stream the response and collect for tracking
    let fullResponse = '';
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        fullResponse += content;
        // Send chunk as SSE
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    // Track generation (after streaming completes)
    if (user.id) {
      // Estimate tokens: ~4 characters per token
      const estimatedTokens = Math.ceil((fullPrompt.length + fullResponse.length) / 4);
      await trackGeneration(user.id, 'advanced_hypothesis', estimatedTokens, fullPrompt.length, fullResponse.length);
    }

    // Send completion signal
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (error) {
    console.error('Error generating hypothesis from advanced conversation:', error);
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
  }
});

// Helper function: Convert markdown text to Confluence storage format
// Confluence uses HTML-like storage format, so we convert markdown to proper HTML
function convertToConfluenceStorage(text) {
  if (!text) return '';
  
  // Split text into lines for processing
  const lines = text.split('\n');
  const output = [];
  let i = 0;
  
  while (i < lines.length) {
    const line = lines[i].trim();
    
    // Skip empty lines (they'll be handled by paragraph spacing)
    if (!line) {
      i++;
      continue;
    }
    
    // Check for headers (must be at start of line)
    if (line.startsWith('###### ')) {
      output.push(`<h6>${escapeHtml(line.substring(7))}</h6>`);
      i++;
      continue;
    } else if (line.startsWith('##### ')) {
      output.push(`<h5>${escapeHtml(line.substring(6))}</h5>`);
      i++;
      continue;
    } else if (line.startsWith('#### ')) {
      output.push(`<h4>${escapeHtml(line.substring(5))}</h4>`);
      i++;
      continue;
    } else if (line.startsWith('### ')) {
      output.push(`<h3>${escapeHtml(line.substring(4))}</h3>`);
      i++;
      continue;
    } else if (line.startsWith('## ')) {
      output.push(`<h2>${escapeHtml(line.substring(3))}</h2>`);
      i++;
      continue;
    } else if (line.startsWith('# ')) {
      output.push(`<h1>${escapeHtml(line.substring(2))}</h1>`);
      i++;
      continue;
    }
    
    // Check for unordered list (starts with -, *, or •)
    if (/^[-*•]\s/.test(line)) {
      const listItems = [];
      while (i < lines.length && /^[-*•]\s/.test(lines[i].trim())) {
        const itemText = lines[i].trim().replace(/^[-*•]\s+/, '');
        listItems.push(`<li>${formatInlineMarkdown(itemText)}</li>`);
        i++;
      }
      if (listItems.length > 0) {
        output.push(`<ul>${listItems.join('')}</ul>`);
      }
      continue;
    }
    
    // Check for ordered list (starts with number.)
    if (/^\d+\.\s/.test(line)) {
      const listItems = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i].trim())) {
        const itemText = lines[i].trim().replace(/^\d+\.\s+/, '');
        listItems.push(`<li>${formatInlineMarkdown(itemText)}</li>`);
        i++;
      }
      if (listItems.length > 0) {
        output.push(`<ol>${listItems.join('')}</ol>`);
      }
      continue;
    }
    
    // Check for plain text headings (common in Quick Scope format)
    // Pattern: Word(s) followed by colon on its own line, with empty line before
    // Examples: "Hypothesis:", "User Story:", "MVP:", "Definition of done:"
    if (line.match(/^[A-Z][a-zA-Z\s]+:$/) && 
        (i === 0 || lines[i-1]?.trim() === '') &&
        (i + 1 < lines.length && lines[i + 1]?.trim() !== '')) {
      // This looks like a heading - convert to h2
      const headingText = line.replace(/:$/, ''); // Remove trailing colon
      output.push(`<h2>${escapeHtml(headingText)}</h2>`);
      i++;
      continue;
    }
    
    // Regular paragraph - collect consecutive non-empty lines
    const paragraphLines = [];
    while (i < lines.length && lines[i].trim() && 
           !lines[i].trim().startsWith('#') && 
           !/^[-*•]\s/.test(lines[i].trim()) &&
           !/^\d+\.\s/.test(lines[i].trim()) &&
           !lines[i].trim().match(/^[A-Z][a-zA-Z\s]+:$/)) { // Exclude plain text headings
      paragraphLines.push(lines[i].trim());
      i++;
    }
    
    if (paragraphLines.length > 0) {
      const paragraphContent = paragraphLines
        .map(l => formatInlineMarkdown(l))
        .join('<br/>');
      output.push(`<p>${paragraphContent}</p>`);
    }
  }
  
  return output.join('\n');
}

// Helper function: Escape HTML entities (but preserve our tags)
function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Helper function: Format inline markdown (bold, italic, code)
function formatInlineMarkdown(text) {
  if (!text) return '';
  
  // Use placeholder approach to preserve content while processing
  const placeholders = {};
  let placeholderIndex = 0;
  
  // First, replace markdown patterns with placeholders
  let processed = text;
  
  // Bold: **text**
  processed = processed.replace(/\*\*([^*]+?)\*\*/g, (match, content) => {
    const key = `__PLACEHOLDER_${placeholderIndex++}__`;
    placeholders[key] = `<strong>${escapeHtml(content)}</strong>`;
    return key;
  });
  
  // Bold: __text__
  processed = processed.replace(/__([^_]+?)__/g, (match, content) => {
    const key = `__PLACEHOLDER_${placeholderIndex++}__`;
    placeholders[key] = `<strong>${escapeHtml(content)}</strong>`;
    return key;
  });
  
  // Code: `code`
  processed = processed.replace(/`([^`]+?)`/g, (match, content) => {
    const key = `__PLACEHOLDER_${placeholderIndex++}__`;
    placeholders[key] = `<code>${escapeHtml(content)}</code>`;
    return key;
  });
  
  // Italic: *text* (but not if it's part of **)
  processed = processed.replace(/(?<!\*)\*([^*]+?)\*(?!\*)/g, (match, content) => {
    const key = `__PLACEHOLDER_${placeholderIndex++}__`;
    placeholders[key] = `<em>${escapeHtml(content)}</em>`;
    return key;
  });
  
  // Escape remaining HTML
  processed = escapeHtml(processed);
  
  // Restore placeholders
  for (const [key, value] of Object.entries(placeholders)) {
    processed = processed.replace(key, value);
  }
  
  return processed;
}

// Helper function: Subscribe to Beehiiv newsletter
// Accepts email and optional acquisition details for tracking
async function subscribeToBeehiiv(email, acquisitionDetails = {}) {
  // Accept either correctly spelled vars or the previous single‑i versions for backward compatibility
  const BEEHIIV_API_KEY = process.env.BEEHIIV_API_KEY || process.env.BEEHIV_API_KEY;
  const BEEHIIV_PUBLICATION_ID = process.env.BEEHIIV_PUBLICATION_ID || process.env.BEEHIV_PUBLICATION_ID;
  
  console.log('=== Beehiiv Subscription Debug ===');
  console.log('Email:', email);
  console.log('Acquisition Details:', JSON.stringify(acquisitionDetails, null, 2));
  console.log('Has API Key:', !!BEEHIIV_API_KEY);
  console.log('Has Publication ID:', !!BEEHIIV_PUBLICATION_ID);
  console.log('Publication ID:', BEEHIIV_PUBLICATION_ID ? BEEHIIV_PUBLICATION_ID.substring(0, 20) + '...' : 'NOT SET');
  
  if (!BEEHIIV_API_KEY || !BEEHIIV_PUBLICATION_ID) {
    console.warn('Beehiiv API credentials not configured. Skipping newsletter subscription.');
    console.warn('Required env vars: BEEHIIV_API_KEY (or BEEHIV_API_KEY) and BEEHIIV_PUBLICATION_ID (or BEEHIV_PUBLICATION_ID)');
    return;
  }
  
  try {
    // Remove 'pub_' prefix if present (API v2 uses it, but the endpoint might need it without)
    const publicationId = BEEHIIV_PUBLICATION_ID.startsWith('pub_') 
      ? BEEHIIV_PUBLICATION_ID 
      : `pub_${BEEHIIV_PUBLICATION_ID}`;
    
    const beehiivUrl = `https://api.beehiiv.com/v2/publications/${publicationId}/subscriptions`;
    
    console.log('Calling Beehiiv API:', beehiivUrl);
    
    // Get Beehiiv "subscription tags" (NOT content tags).
    // NOTE: The old `/subscriber_tags` endpoint 404s for many publications.
    // Beehiiv's docs reference "Subscription Tags" endpoints (create/list/etc).
    let tagId = null;
    try {
      // Try the subscription tags endpoint (per Beehiiv docs)
      const tagsUrl = `https://api.beehiiv.com/v2/publications/${publicationId}/subscription_tags`;
      console.log('Fetching subscription tags from:', tagsUrl);
      
      const tagsResponse = await fetch(tagsUrl, {
        headers: {
          'Authorization': `Bearer ${BEEHIIV_API_KEY}`,
          'Content-Type': 'application/json'
        }
      });
      
      console.log('Subscription Tags API Response Status:', tagsResponse.status);
      
      if (tagsResponse.ok) {
        const tagsData = await tagsResponse.json();
        console.log('Subscription Tags API Response Data:', JSON.stringify(tagsData, null, 2));
        
        // Check different possible response structures
        const tagsList = tagsData.data || tagsData.tags || tagsData;
        const beastivesTag = Array.isArray(tagsList) 
          ? tagsList.find(tag => {
              const tagName = tag.name || tag.tag_name || tag.label;
              return tagName && (tagName === 'beastives' || tagName.toLowerCase() === 'beastives');
            })
          : null;
          
        if (beastivesTag) {
          tagId = beastivesTag.id || beastivesTag.tag_id || beastivesTag._id;
          console.log('✅ Found beastives tag ID:', tagId, 'Tag object:', JSON.stringify(beastivesTag, null, 2));
        } else {
          console.warn('⚠️ beastives tag not found. Available tags:', 
            Array.isArray(tagsList) ? tagsList.map(t => t.name || t.tag_name || t.label || t) : 'No tags array found');
        }
      } else {
        const errorText = await tagsResponse.text();
        console.warn('Subscription Tags API error response:', tagsResponse.status, errorText);
      }
    } catch (tagError) {
      console.warn('Could not fetch subscription tags:', tagError.message);
    }
    
    // Helper: perform the request and return { ok, status, text, json? }
    async function doBeehiivSubscribeRequest(body) {
      console.log('Request body:', JSON.stringify(body, null, 2));
      const response = await fetch(beehiivUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${BEEHIIV_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      const responseText = await response.text();
      console.log('Beehiiv API Response Status:', response.status);
      console.log('Beehiiv API Response:', responseText);

      return { ok: response.ok, status: response.status, text: responseText };
    }

    const requestBody = {
      email: email,
      reactivate_existing: false,
      send_welcome_email: true
    };
    
    // Add tags
    // IMPORTANT:
    // - Beehiiv expects tag IDs.
    // - Different endpoints/fields exist depending on tag type.
    // - We'll use "Subscription Tags" and attach them via `subscription_tag_ids`.
    if (tagId) {
      requestBody.subscription_tag_ids = [tagId];
      console.log('Using subscription_tag_ids in request:', tagId);
    } else {
      console.warn('⚠️ No Beehiiv tag ID found for "beastives"; subscribing WITHOUT tags to avoid 400 Bad Request');
    }
    
    // Add acquisition details.
    // IMPORTANT: Beehiiv's API expects `custom_fields` to be an ARRAY, not an object.
    // Your logs confirmed: "custom_fields expected array, but received hash".
    if (Object.keys(acquisitionDetails).length > 0) {
      requestBody.custom_fields = [];
      
      // Map common acquisition fields
      if (acquisitionDetails.source) {
        requestBody.custom_fields.push({ name: 'acquisition_source', value: String(acquisitionDetails.source) });
      }
      if (acquisitionDetails.utm_source) {
        requestBody.custom_fields.push({ name: 'utm_source', value: String(acquisitionDetails.utm_source) });
      }
      if (acquisitionDetails.utm_medium) {
        requestBody.custom_fields.push({ name: 'utm_medium', value: String(acquisitionDetails.utm_medium) });
      }
      if (acquisitionDetails.utm_campaign) {
        requestBody.custom_fields.push({ name: 'utm_campaign', value: String(acquisitionDetails.utm_campaign) });
      }
      if (acquisitionDetails.utm_term) {
        requestBody.custom_fields.push({ name: 'utm_term', value: String(acquisitionDetails.utm_term) });
      }
      if (acquisitionDetails.utm_content) {
        requestBody.custom_fields.push({ name: 'utm_content', value: String(acquisitionDetails.utm_content) });
      }
      if (acquisitionDetails.referrer) {
        requestBody.custom_fields.push({ name: 'referrer', value: String(acquisitionDetails.referrer) });
      }
      if (acquisitionDetails.landing_page) {
        requestBody.custom_fields.push({ name: 'landing_page', value: String(acquisitionDetails.landing_page) });
      }
      
      // Also set Beehiiv's built-in UTM fields when present.
      // These show up in Beehiiv UI under acquisition columns.
      if (acquisitionDetails.utm_source) requestBody.utm_source = String(acquisitionDetails.utm_source);
      if (acquisitionDetails.utm_medium) requestBody.utm_medium = String(acquisitionDetails.utm_medium);
      if (acquisitionDetails.utm_campaign) requestBody.utm_campaign = String(acquisitionDetails.utm_campaign);
      if (acquisitionDetails.referrer) requestBody.referring_site = String(acquisitionDetails.referrer);
      
      console.log('✅ Added acquisition details to Beehiiv subscription:', JSON.stringify(requestBody.custom_fields, null, 2));
    }
    
    // Attempt 1: send everything (tags if we have ID, plus custom_fields if present)
    let attemptBody = { ...requestBody };
    let result = await doBeehiivSubscribeRequest(attemptBody);

    // If Beehiiv rejects (400), progressively remove likely-problematic fields and retry.
    // Why: Beehiiv often rejects unknown `custom_fields` (if not created in the publication),
    // and rejects tag NAMEs (we already avoid names, but keep this generic).
    if (!result.ok && result.status === 400 && attemptBody.custom_fields) {
      console.warn('⚠️ Beehiiv returned 400. Retrying WITHOUT custom_fields (they may not exist in Beehiiv yet)...');
      const { custom_fields, ...withoutCustomFields } = attemptBody;
      attemptBody = withoutCustomFields;
      result = await doBeehiivSubscribeRequest(attemptBody);
    }

    if (!result.ok && result.status === 400 && attemptBody.tags) {
      console.warn('⚠️ Beehiiv returned 400. Retrying WITHOUT tags...');
      const { tags, ...withoutTags } = attemptBody;
      attemptBody = withoutTags;
      result = await doBeehiivSubscribeRequest(attemptBody);
    }

    if (!result.ok) {
      let errorData;
      try {
        errorData = JSON.parse(result.text);
      } catch (e) {
        errorData = { message: result.text };
      }
      throw new Error(`Beehiiv API error: ${result.status} - ${errorData.message || result.text}`);
    }

    const responseData = JSON.parse(result.text);
    const subscriberId = responseData.id || responseData.data?.id;
    
    console.log(`✅ Successfully subscribed ${email} to Beehiiv newsletter`);
    console.log('Response data:', JSON.stringify(responseData, null, 2));
    
    // If tags weren't applied during subscription, try to apply them after.
    // For Subscription Tags, we patch using `subscription_tag_ids`.
    if (subscriberId && tagId) {
      const responseTagIds = responseData.subscription_tag_ids || responseData.data?.subscription_tag_ids || [];
      const hasTag = Array.isArray(responseTagIds) && responseTagIds.includes(tagId);
      if (hasTag) {
        return responseData;
      }

      console.log('Attempting to apply subscription tag after subscription...');
      try {
        // Try to update subscriber with tags
        const updateUrl = `https://api.beehiiv.com/v2/publications/${publicationId}/subscriptions/${subscriberId}`;
        // IMPORTANT: only send tag IDs here. Do not send tag names.
        const updateBody = { subscription_tag_ids: [tagId] };
        
        const updateResponse = await fetch(updateUrl, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${BEEHIIV_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(updateBody)
        });
        
        if (updateResponse.ok) {
          const updateData = await updateResponse.json();
          console.log('✅ Tags applied successfully via update:', JSON.stringify(updateData, null, 2));
        } else {
          const updateError = await updateResponse.text();
          console.warn('⚠️ Could not apply tags via update:', updateResponse.status, updateError);
        }
      } catch (updateError) {
        console.warn('⚠️ Error applying tags after subscription:', updateError.message);
      }
    }
    
    return responseData;
  } catch (error) {
    console.error('❌ Beehiiv subscription error:', error.message);
    console.error('Full error:', error);
    throw error;
  }
}

// Helper function: Make HTTPS request (using Node.js built-in https module)
function makeHttpsRequest(options, data) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let body = '';
      
      res.on('data', (chunk) => {
        body += chunk;
      });
      
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ statusCode: res.statusCode, data: parsed });
          } else {
            reject(new Error(parsed.message || parsed.title || `HTTP ${res.statusCode}: ${body}`));
          }
        } catch (e) {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ statusCode: res.statusCode, data: body });
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${body}`));
          }
        }
      });
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

// Confluence configuration from environment variables
// These should be set in .env locally and in Railway environment variables
const CONFLUENCE_CONFIG = {
  domain: process.env.CONFLUENCE_DOMAIN,
  email: process.env.CONFLUENCE_EMAIL,
  apiToken: process.env.CONFLUENCE_API_TOKEN,
  space: process.env.CONFLUENCE_SPACE_KEY
};

// API endpoint: Generate a short, usable page title based on content
// This creates a concise title suitable for Confluence pages
app.post('/api/generate-title', async (req, res) => {
  try {
    const { content, contentType } = req.body;
    
    // Validate input
    if (!content || content.trim().length === 0) {
      return res.status(400).json({ error: 'Content is required to generate a title' });
    }
    
    // Create a prompt for title generation
    // Keep it short and focused - we want a usable title, not a description
    const titlePrompt = `Generate a short, clear, and professional title for a Confluence ${contentType || 'page'} based on the following content.

Requirements:
- Maximum 60 characters
- Clear and descriptive
- Professional tone
- No prefixes like "Title:" or quotes
- Focus on the main topic or key concept
- Use title case (capitalize important words)

Content:
${content.substring(0, 2000)}${content.length > 2000 ? '...' : ''}

Title:`;
    
    // Call OpenAI API - use gpt-4o for faster response (simple task)
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: titlePrompt
        }
      ],
      temperature: 0.7,
      max_tokens: 50 // Short title, so we don't need many tokens
    });
    
    // Extract and clean the title
    let title = completion.choices[0]?.message?.content?.trim() || '';
    
    // If we didn't get a title, try to extract from content as fallback
    if (!title || title.length === 0) {
      // Extract first line or first 50 characters as fallback
      const firstLine = content.split('\n')[0].trim();
      title = firstLine.length > 60 ? firstLine.substring(0, 57) + '...' : firstLine;
    }
    
    // Remove quotes if present
    title = title.replace(/^["']|["']$/g, '');
    
    // Remove "Title:" prefix if present
    title = title.replace(/^Title:\s*/i, '');
    
    // Remove any trailing periods or extra whitespace
    title = title.replace(/\.+$/, '').trim();
    
    // Trim to 60 characters max (Confluence has limits)
    if (title.length > 60) {
      title = title.substring(0, 57) + '...';
    }
    
    // Ensure we have a title (final fallback)
    if (!title || title.length === 0) {
      title = contentType === 'hypothesis' ? 'New Hypothesis' : contentType === 'scope' ? 'New Scope' : 'New Quick Scope';
    }
    
    // Return the generated title
    res.json({ title });
    
  } catch (error) {
    console.error('Error generating title:', error);
    res.status(500).json({ error: 'Failed to generate title: ' + error.message });
  }
});

// API endpoint: Export content to Confluence
// Only available to internal users
app.post('/api/export-to-confluence', async (req, res) => {
  try {
    // Check authentication and role
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const token = authHeader.substring(7);
    
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }
    
    // Verify token and get user
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    
    // Get user profile with role
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();
    
    const userRole = profile?.role || 'customer';
    
    // Only internal users can export to Confluence
    if (userRole !== 'internal') {
      return res.status(403).json({ error: 'Confluence export is only available to internal users' });
    }
    
    const { pageTitle, parentId, content } = req.body;
    
    // Get credentials from environment variables
    const { domain, email, apiToken, space } = CONFLUENCE_CONFIG;
    
    // Validate that all required Confluence credentials are set
    if (!domain || !email || !apiToken || !space) {
      console.error('Confluence credentials missing. Required env vars: CONFLUENCE_DOMAIN, CONFLUENCE_EMAIL, CONFLUENCE_API_TOKEN, CONFLUENCE_SPACE_KEY');
      return res.status(500).json({ 
        error: 'Confluence integration not configured. Please set CONFLUENCE_DOMAIN, CONFLUENCE_EMAIL, CONFLUENCE_API_TOKEN, and CONFLUENCE_SPACE_KEY environment variables.' 
      });
    }
    
    // Validate required fields
    if (!pageTitle || !content) {
      return res.status(400).json({ 
        error: 'Missing required fields: pageTitle and content are required' 
      });
    }
    
    // Convert content to Confluence storage format
    const storageContent = convertToConfluenceStorage(content);
    
    // Prepare the page data for Confluence API
    const pageData = {
      type: 'page',
      title: pageTitle,
      space: {
        key: space
      },
      body: {
        storage: {
          value: storageContent,
          representation: 'storage'
        }
      }
    };
    
    // If parentId is provided, add it as ancestor
    if (parentId) {
      pageData.ancestors = [{ id: parentId }];
    }
    
    // Create Basic Auth credentials (email:apiToken encoded in base64)
    const auth = Buffer.from(`${email}:${apiToken}`).toString('base64');
    
    // Prepare HTTPS request options
    const options = {
      hostname: domain,
      path: '/wiki/rest/api/content',
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    };
    
    // Make the request to Confluence API
    const result = await makeHttpsRequest(options, pageData);
    
    // Extract page ID and construct URL
    const pageId = result.data.id;
    // Construct Confluence page URL - use webui link if available, otherwise construct manually
    let pageUrl;
    if (result.data._links && result.data._links.webui) {
      // webui link is typically just the path (e.g., /pages/viewpage.action?pageId=123)
      // We need to prepend https://domain/wiki
      const webuiPath = result.data._links.webui;
      // Ensure webui path starts with /wiki (most Confluence APIs return paths without /wiki)
      if (webuiPath.startsWith('/wiki')) {
        pageUrl = `https://${domain}${webuiPath}`;
      } else {
        pageUrl = `https://${domain}/wiki${webuiPath.startsWith('/') ? webuiPath : '/' + webuiPath}`;
      }
    } else {
      // Fallback: construct URL manually using space and page ID
      pageUrl = `https://${domain}/wiki/spaces/${space}/pages/${pageId}/${encodeURIComponent(pageTitle.replace(/\s+/g, '+'))}`;
    }
    
    // Return success response with page ID and URL
    res.json({
      success: true,
      pageId: pageId,
      url: pageUrl,
      message: 'Successfully exported to Confluence'
    });
    
  } catch (error) {
    console.error('Error exporting to Confluence:', error);
    
    // Provide more helpful error messages
    let errorMessage = error.message || 'Failed to export to Confluence';
    
    // Check for common errors
    if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
      errorMessage = 'Authentication failed. Please check your email and API token.';
    } else if (errorMessage.includes('404') || errorMessage.includes('Not Found')) {
      errorMessage = 'Confluence space not found. Please check the space key.';
    } else if (errorMessage.includes('ENOTFOUND') || errorMessage.includes('getaddrinfo')) {
      errorMessage = 'Cannot connect to Confluence. Please check your domain.';
    }
    
    res.status(500).json({ 
      error: errorMessage 
    });
  }
});

// ============================================
// AUTHENTICATION ENDPOINTS
// ============================================

// Sign up endpoint
app.post('/api/auth/signup', async (req, res) => {
  console.log('=== BACKEND SIGNUP REQUEST RECEIVED ===');
  console.log('Request body:', JSON.stringify(req.body, null, 2));
  console.log('Request headers:', JSON.stringify(req.headers, null, 2));
  
  try {
    const { email, password, role = 'customer', terms_accepted, newsletter_subscribed } = req.body;
    
    console.log('Parsed request data:');
    console.log('  Email:', email);
    console.log('  Password present:', !!password);
    console.log('  Password length:', password ? password.length : 0);
    console.log('  Role:', role);
    console.log('  Terms accepted:', terms_accepted);
    console.log('  Newsletter subscribed:', newsletter_subscribed);
    
    if (!email || !password) {
      console.error('❌ Validation failed: Missing email or password');
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    // Validate password requirements
    const passwordErrors = [];
    if (password.length < 8) {
      passwordErrors.push('at least 8 characters');
    }
    if (!/[A-Z]/.test(password)) {
      passwordErrors.push('one uppercase letter');
    }
    if (!/[a-z]/.test(password)) {
      passwordErrors.push('one lowercase letter');
    }
    if (!/[0-9]/.test(password)) {
      passwordErrors.push('one number');
    }
    
    if (passwordErrors.length > 0) {
      console.error('❌ Validation failed: Password does not meet requirements');
      return res.status(400).json({ 
        error: `Password must contain ${passwordErrors.join(', ')}` 
      });
    }
    
    // Validate terms acceptance
    if (!terms_accepted) {
      console.error('❌ Validation failed: Terms not accepted');
      return res.status(400).json({ error: 'You must accept the Terms and Conditions and Privacy Policy to create an account' });
    }
    
    if (!supabase) {
      console.error('❌ Supabase not configured');
      return res.status(500).json({ error: 'Supabase not configured' });
    }
    
    console.log('Creating user in Supabase Auth...');
    // Create user in Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true // Auto-confirm email for simplicity
    });
    
    let userId;
    
    if (authError) {
      // If user already exists, try to get the existing user
      if (authError.message && authError.message.includes('already been registered')) {
        console.warn('⚠️ User already exists in auth.users, attempting to retrieve...');
        
        // Try to get the existing user by email
        const { data: existingUsers, error: listError } = await supabase.auth.admin.listUsers();
        
        if (listError) {
          console.error('❌ Error listing users:', listError);
      return res.status(400).json({ error: authError.message });
    }
    
        const existingUser = existingUsers.users.find(u => u.email === email);
        
        if (existingUser) {
          console.log('✅ Found existing user:', existingUser.id);
          userId = existingUser.id;
          
          // Check if profile already exists
          console.log('Checking if profile exists for user ID:', userId);
          const { data: existingProfile, error: profileCheckError } = await supabase
            .from('profiles')
            .select('id, email, role')
            .eq('id', userId)
            .maybeSingle();
          
          console.log('Profile check result - Data:', existingProfile ? JSON.stringify(existingProfile, null, 2) : 'NULL');
          console.log('Profile check result - Error:', profileCheckError ? JSON.stringify(profileCheckError, null, 2) : 'NULL');
          
          if (profileCheckError) {
            console.error('❌ Error checking existing profile:', profileCheckError);
            console.error('Error code:', profileCheckError.code);
            console.error('Error message:', profileCheckError.message);
            // Don't return error - try to create profile anyway if check fails
            console.log('⚠️ Profile check failed, will attempt to create profile');
          }
          
          if (existingProfile && existingProfile.id) {
            // Profile exists, user is already registered
            console.log('✅ Profile exists - user is fully registered');
            console.log('Existing profile:', JSON.stringify(existingProfile, null, 2));
            return res.status(400).json({ error: 'A user with this email address has already been registered' });
          }
          
          // Profile doesn't exist, we'll create it below
          console.log('⚠️ User exists in auth but profile is missing, will create profile');
        } else {
          return res.status(400).json({ error: authError.message });
        }
      } else {
        console.error('❌ Auth user creation failed:', authError);
        return res.status(400).json({ error: authError.message });
      }
    } else {
    console.log('✅ Auth user created successfully');
    console.log('  User ID:', authData.user.id);
    console.log('  User email:', authData.user.email);
      userId = authData.user.id;
    }
    
    // Create profile with role and terms acceptance
    const profileData = {
      id: userId,
      email: email,
      role: role === 'internal' ? 'internal' : 'customer', // Only allow setting internal role if explicitly requested
      terms_accepted: true,
      terms_accepted_at: new Date().toISOString()
    };
    
    console.log('Creating profile in database...');
    console.log('Profile data:', JSON.stringify(profileData, null, 2));
    
    console.log('Attempting to insert profile with data:', JSON.stringify(profileData, null, 2));
    console.log('Supabase client configured:', !!supabase);
    console.log('Service role key present:', !!process.env.SUPABASE_SERVICE_ROLE_KEY);
    
    const { data: profileDataResult, error: profileError } = await supabase
      .from('profiles')
      .insert(profileData)
      .select();
    
    console.log('Profile insert result - Data:', profileDataResult ? 'Present' : 'NULL');
    console.log('Profile insert result - Error:', profileError ? 'Present' : 'NULL');
    
    if (profileError) {
      console.error('❌ Profile creation error:', profileError);
      console.error('Error code:', profileError.code);
      console.error('Error message:', profileError.message);
      console.error('Error details:', profileError.details);
      console.error('Error hint:', profileError.hint);
      console.error('Full error object:', JSON.stringify(profileError, null, 2));
      
      // Check if it's a duplicate key error (profile already exists)
      if (profileError.code === '23505' || profileError.message.includes('duplicate key')) {
        console.log('Profile already exists - user is fully registered');
        return res.status(400).json({ error: 'A user with this email address has already been registered' });
      }
      
      // Check if it's a foreign key constraint error
      if (profileError.code === '23503' || profileError.message.includes('foreign key')) {
        console.error('Foreign key constraint violation - auth user might not exist');
        return res.status(500).json({ 
          error: 'Database constraint error. The user account may be in an invalid state.',
          details: profileError.message 
        });
      }
      
      // User created but profile failed - this is a critical error
      // Return error response so frontend knows signup failed
      return res.status(500).json({ 
        error: 'Failed to create user profile. Please try again or contact support.',
        details: profileError.message,
        code: profileError.code
      });
    } else {
      console.log('✅ Profile created successfully');
      console.log('Profile data result:', JSON.stringify(profileDataResult, null, 2));
      
      // Verify profile was actually created
      if (!profileDataResult || profileDataResult.length === 0) {
        console.error('❌ Profile creation returned no data - RLS might still be blocking');
        console.error('Even though insert() succeeded, select() returned no rows');
        return res.status(500).json({ 
          error: 'Failed to create user profile. Please try again.' 
        });
      }
    }
    
    // Subscribe to Beehiiv newsletter if requested
    if (newsletter_subscribed) {
      console.log(`Newsletter subscription requested for: ${email}`);
      try {
        // Extract acquisition details from request body
        const acquisitionDetails = {
          source: req.body.acquisition_source || req.body.source,
          utm_source: req.body.utm_source,
          utm_medium: req.body.utm_medium,
          utm_campaign: req.body.utm_campaign,
          utm_term: req.body.utm_term,
          utm_content: req.body.utm_content,
          referrer: req.body.referrer,
          landing_page: req.body.landing_page
        };
        
        // Remove undefined values
        Object.keys(acquisitionDetails).forEach(key => {
          if (acquisitionDetails[key] === undefined) {
            delete acquisitionDetails[key];
          }
        });
        
        await subscribeToBeehiiv(email, acquisitionDetails);
        console.log(`✅ Newsletter subscription completed for: ${email}`);
      } catch (beehiivError) {
        console.error('❌ Beehiiv subscription failed (signup will continue):', beehiivError.message);
        // Don't fail signup if newsletter subscription fails
      }
    } else {
      console.log(`Newsletter subscription not requested for: ${email}`);
    }
    
    // Generate session token
    console.log('Generating session link...');
    const { data: sessionData, error: sessionError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: email
    });
    
    if (sessionError) {
      console.error('Session link generation error (non-fatal):', sessionError);
    }
    
    const responseData = {
      user: {
        id: authData.user.id,
        email: authData.user.email,
        role: role === 'internal' ? 'internal' : 'customer'
      },
      // For simplicity, we'll return a token they can use
      // In production, you might want to use Supabase's session management
      message: 'User created successfully. Please use /api/auth/login to get a token.'
    };
    
    console.log('✅ Signup completed successfully');
    console.log('Response data:', JSON.stringify(responseData, null, 2));
    console.log('=== BACKEND SIGNUP REQUEST END ===');
    
    // Return user info and token
    res.json(responseData);
    
  } catch (error) {
    console.error('❌ Signup error (catch block):', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// Login endpoint
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }
    
    // Sign in user
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    
    if (authError) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    // Get user profile with role
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', authData.user.id)
      .single();
    
    // Track login event (don't await - fire and forget so it doesn't slow down login)
    trackLogin(authData.user.id, req).catch(err => {
      console.error('Failed to track login (non-blocking):', err);
    });
    
    // Return user info, access token, and refresh token for persistent sessions
    res.json({
      user: {
        id: authData.user.id,
        email: authData.user.email,
        role: profile?.role || 'customer'
      },
      access_token: authData.session.access_token,
      refresh_token: authData.session.refresh_token,
      expires_at: authData.session.expires_at
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Failed to login' });
  }
});

// Get current user endpoint
app.get('/api/auth/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No authorization token provided' });
    }
    
    const token = authHeader.substring(7);
    
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }
    
    // Verify token and get user
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    
    // Get profile with role
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();
    
    res.json({
      user: {
        id: user.id,
        email: user.email,
        role: profile?.role || 'customer'
      }
    });
    
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user info' });
  }
});

// Refresh token endpoint - allows users to get a new access token without re-logging in
app.post('/api/auth/refresh', async (req, res) => {
  try {
    const { refresh_token } = req.body;
    
    if (!refresh_token) {
      return res.status(400).json({ error: 'Refresh token is required' });
    }
    
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }
    
    // Use refresh token to get a new session
    const { data: authData, error: authError } = await supabase.auth.refreshSession({
      refresh_token: refresh_token
    });
    
    if (authError || !authData.session) {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }
    
    // Get user profile with role
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', authData.user.id)
      .single();
    
    // Return new tokens
    res.json({
      user: {
        id: authData.user.id,
        email: authData.user.email,
        role: profile?.role || 'customer'
      },
      access_token: authData.session.access_token,
      refresh_token: authData.session.refresh_token,
      expires_at: authData.session.expires_at
    });
    
  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(500).json({ error: 'Failed to refresh token' });
  }
});

// Forgot password endpoint - sends password reset email using Resend
app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }
    
    if (!resend) {
      return res.status(500).json({ error: 'Email service not configured. RESEND_API_KEY is required.' });
    }
    
    // Get base URL for reset link
    // Use BASE_URL from env if set, otherwise construct from request
    // IMPORTANT: BASE_URL must be set in Railway environment variables to your production URL
    // Example: BASE_URL=https://your-app.railway.app
    // The redirect URL must also be added to Supabase Dashboard → Authentication → URL Configuration
    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
    const redirectUrl = `${baseUrl}/reset-password.html`;
    
    console.log('=== PASSWORD RESET REQUEST ===');
    console.log('Email:', email);
    console.log('Base URL:', baseUrl);
    console.log('Redirect URL:', redirectUrl);
    console.log('⚠️ Make sure this redirect URL is added to Supabase Dashboard → Authentication → URL Configuration');
    
    // Generate password reset link using Supabase Admin API
    // This generates a recovery token without sending an email
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email: email,
      options: {
        redirectTo: redirectUrl
      }
    });
    
    // If user doesn't exist, still return success (security best practice)
    if (linkError) {
      console.error('❌ Password reset link generation error:', linkError);
      
      // Check if user doesn't exist (common case)
      if (linkError.message && linkError.message.includes('User not found')) {
        // Still return success message for security (don't reveal if email exists)
        return res.json({ 
          message: 'If an account exists with this email, a password reset link has been sent. Please check your email inbox and spam folder.'
        });
      }
      
      // For other errors, still return success but log the error
      return res.json({ 
        message: 'If an account exists with this email, a password reset link has been sent. Please check your email inbox and spam folder.'
      });
    }
    
    // Extract the recovery link from the response
    // Supabase generateLink returns action_link which is already formatted correctly
    // Format: {redirectUrl}#access_token=...&type=recovery
    // The response structure is: { data: { properties: { action_link: "..." } } }
    const resetUrl = linkData?.properties?.action_link || linkData?.action_link;
    
    if (!resetUrl) {
      console.error('❌ No reset link generated');
      console.error('Link data:', JSON.stringify(linkData, null, 2));
      // Still return success message for security
      return res.json({ 
        message: 'If an account exists with this email, a password reset link has been sent. Please check your email inbox and spam folder.'
      });
    }
    
    console.log('Reset URL generated:', resetUrl.substring(0, 100) + '...');
    
    // Determine sender email - use custom domain if verified, otherwise fallback to Resend's default
    // For testing, you can use 'onboarding@resend.dev' (Resend's default domain)
    // Once getvantum.com is fully verified, use 'info@getvantum.com'
    const senderEmail = process.env.RESEND_FROM_EMAIL || 'info@getvantum.com';
    
    console.log('Using sender email:', senderEmail);
    
    // Send email using Resend
    const { data: emailData, error: emailError } = await resend.emails.send({
      from: senderEmail,
      to: email,
      subject: 'Reset Your Password - Vantum Action Planner',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { text-align: center; margin-bottom: 30px; }
            .button { display: inline-block; padding: 12px 24px; background-color: #007A7A; color: #FFFFFF; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 20px 0; }
            .button:hover { background-color: #009999; }
            .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666; text-align: center; }
            .link { color: #007A7A; word-break: break-all; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Reset Your Password</h1>
            </div>
            <p>You requested to reset your password for your Vantum Action Planner account.</p>
            <p>Click the button below to reset your password:</p>
            <div style="text-align: center;">
              <a href="${resetUrl}" class="button">Reset Password</a>
            </div>
            <p>Or copy and paste this link into your browser:</p>
            <p><a href="${resetUrl}" class="link">${resetUrl}</a></p>
            <p><strong>This link will expire in 1 hour.</strong></p>
            <p>If you didn't request a password reset, you can safely ignore this email.</p>
            <div class="footer">
              <p>© ${new Date().getFullYear()} Vantum Action Planner. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
Reset Your Password

You requested to reset your password for your Vantum Action Planner account.

Click the link below to reset your password:
${resetUrl}

This link will expire in 1 hour.

If you didn't request a password reset, you can safely ignore this email.

© ${new Date().getFullYear()} Vantum Action Planner. All rights reserved.
      `
    });
    
    if (emailError) {
      console.error('❌ Resend email error:', emailError);
      // Still return success message for security
      return res.json({ 
        message: 'If an account exists with this email, a password reset link has been sent. Please check your email inbox and spam folder.'
      });
    }
    
    console.log('✅ Password reset email sent successfully via Resend');
    console.log('Email ID:', emailData?.id);
    
    // Always return success message (security best practice - don't reveal if email exists)
    res.json({ 
      message: 'If an account exists with this email, a password reset link has been sent. Please check your email inbox and spam folder.'
    });
    
  } catch (error) {
    console.error('Forgot password error:', error);
    // Still return success message for security
    res.json({ 
      message: 'If an account exists with this email, a password reset link has been sent. Please check your email inbox and spam folder.'
    });
  }
});

// Reset password endpoint - updates password with token
app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { password } = req.body;
    const authHeader = req.headers.authorization;
    
    if (!password) {
      return res.status(400).json({ error: 'Password is required' });
    }
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication token required' });
    }
    
    const token = authHeader.substring(7);
    
    // Validate password requirements
    const passwordErrors = [];
    if (password.length < 8) {
      passwordErrors.push('at least 8 characters');
    }
    if (!/[A-Z]/.test(password)) {
      passwordErrors.push('one uppercase letter');
    }
    if (!/[a-z]/.test(password)) {
      passwordErrors.push('one lowercase letter');
    }
    if (!/[0-9]/.test(password)) {
      passwordErrors.push('one number');
    }
    
    if (passwordErrors.length > 0) {
      return res.status(400).json({ 
        error: `Password must contain ${passwordErrors.join(', ')}` 
      });
    }
    
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }
    
    // Verify token and get user
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return res.status(401).json({ error: 'Invalid or expired reset token' });
    }
    
    // Update password using admin API with the user's ID
    const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
      password: password
    });
    
    if (updateError) {
      console.error('Password reset error:', updateError);
      return res.status(400).json({ error: 'Failed to update password: ' + updateError.message });
    }
    
    res.json({ 
      message: 'Password reset successfully. You can now login with your new password.' 
    });
    
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// Helper function: Check if user has access to Advanced Mode
// Internal users always have access, customers need active subscription
async function hasAdvancedModeAccess(userId, userRole) {
  // Internal users always have access
  if (userRole === 'internal') {
    return true;
  }
  
  // For customers, check subscription status
  if (!supabase) {
    return false;
  }
  
  try {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('subscription_status, subscription_id')
      .eq('id', userId)
      .single();
    
    if (error || !profile) {
      return false;
    }
    
    // Check if subscription is active
    return profile.subscription_status === 'active';
  } catch (error) {
    console.error('Error checking subscription:', error);
    return false;
  }
}

// ============================================
// STRIPE SUBSCRIPTION ENDPOINTS
// ============================================

// Get subscription status endpoint
app.get('/api/subscription/status', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const token = authHeader.substring(7);
    
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }
    
    // Verify token and get user
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    
    // Get profile with subscription info and trial info
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, subscription_status, subscription_id, trial_started_at')
      .eq('id', user.id)
      .single();
    
    // Internal users always have access
    let hasAccess = profile?.role === 'internal' || profile?.subscription_status === 'active';
    
    // Check if user is within 3-day trial period
    if (!hasAccess && profile?.trial_started_at) {
      const trialStart = new Date(profile.trial_started_at);
      const now = new Date();
      const daysSinceTrialStart = (now - trialStart) / (1000 * 60 * 60 * 24); // Convert to days
      
      if (daysSinceTrialStart <= 3) {
        hasAccess = true; // Grant access during 3-day trial
      }
    }
    
    // Determine if user is on trial
    let isOnTrial = false;
    if (hasAccess && !profile?.subscription_status && profile?.trial_started_at) {
      const trialStart = new Date(profile.trial_started_at);
      const now = new Date();
      const daysSinceTrialStart = (now - trialStart) / (1000 * 60 * 60 * 24);
      isOnTrial = daysSinceTrialStart <= 3;
    }
    
    res.json({
      hasAccess,
      role: profile?.role || 'customer',
      subscriptionStatus: profile?.subscription_status || null,
      subscriptionId: profile?.subscription_id || null,
      isOnTrial: isOnTrial,
      trialStartedAt: profile?.trial_started_at || null
    });
    
  } catch (error) {
    console.error('Get subscription status error:', error);
    res.status(500).json({ error: 'Failed to get subscription status' });
  }
});

// Manual sync subscription from Stripe (for admin/internal users or webhook recovery)
// This endpoint allows manually syncing subscription status from Stripe
app.post('/api/subscription/sync', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const token = authHeader.substring(7);
    
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }
    
    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(500).json({ error: 'Stripe not configured' });
    }
    
    // Verify token and get user
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    
    // Get user profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('email, role, subscription_id')
      .eq('id', user.id)
      .single();
    
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    
    // Only allow internal users or users with existing subscription_id to sync
    // This prevents abuse while allowing recovery
    if (profile.role !== 'internal' && !profile.subscription_id) {
      return res.status(403).json({ error: 'No subscription found to sync' });
    }
    
    console.log('=== MANUAL SUBSCRIPTION SYNC ===');
    console.log('User email:', profile.email);
    console.log('User ID:', user.id);
    console.log('Existing subscription_id:', profile.subscription_id);
    
    // Try to find subscription by email in Stripe
    let subscription = null;
    
    if (profile.subscription_id) {
      // Try to retrieve by existing subscription ID
      try {
        subscription = await stripe.subscriptions.retrieve(profile.subscription_id);
        console.log('Found subscription by ID:', subscription.id);
      } catch (err) {
        console.warn('Could not find subscription by ID:', profile.subscription_id);
      }
    }
    
    // If not found by ID, search by customer email
    if (!subscription) {
      try {
        const customers = await stripe.customers.list({
          email: profile.email,
          limit: 1
        });
        
        if (customers.data.length > 0) {
          const customer = customers.data[0];
          console.log('Found customer:', customer.id);
          
          // Get active subscriptions for this customer
          const subscriptions = await stripe.subscriptions.list({
            customer: customer.id,
            status: 'all',
            limit: 1
          });
          
          if (subscriptions.data.length > 0) {
            subscription = subscriptions.data[0];
            console.log('Found subscription by customer:', subscription.id);
          }
        }
      } catch (err) {
        console.error('Error searching for customer:', err);
      }
    }
    
    if (!subscription) {
      return res.status(404).json({ error: 'No active subscription found in Stripe' });
    }
    
    // Update profile with subscription info
    // Map Stripe status: 'trialing' or 'active' both grant access
    const status = (subscription.status === 'trialing' || subscription.status === 'active') ? 'active' : 'inactive';
    console.log('=== SYNC SUBSCRIPTION DETAILS ===');
    console.log('Subscription ID:', subscription.id);
    console.log('Subscription status from Stripe:', subscription.status);
    console.log('Mapped to db status:', status);
    console.log('User ID:', user.id);
    console.log('Current profile subscription_id:', profile.subscription_id);
    
    const { data: updatedProfile, error: updateError } = await supabase
      .from('profiles')
      .update({
        subscription_status: status,
        subscription_id: subscription.id,
        subscription_started_at: subscription.created ? new Date(subscription.created * 1000).toISOString() : new Date().toISOString(),
        subscription_updated_at: new Date().toISOString()
      })
      .eq('id', user.id)
      .select();
    
    if (updateError) {
      console.error('❌ Error updating profile:', updateError);
      console.error('Error code:', updateError.code);
      console.error('Error message:', updateError.message);
      console.error('Error details:', updateError.details);
      return res.status(500).json({ error: 'Failed to update subscription status', details: updateError.message });
    }
    
    if (!updatedProfile || updatedProfile.length === 0) {
      console.error('❌ Update returned no rows - RLS may be blocking');
      return res.status(500).json({ error: 'Update completed but no rows returned - RLS may be blocking' });
    }
    
    console.log('✅ Subscription synced successfully');
    console.log('Updated profile subscription_status:', updatedProfile[0]?.subscription_status);
    console.log('Updated profile subscription_id:', updatedProfile[0]?.subscription_id);
    
    res.json({
      success: true,
      subscription: {
        id: subscription.id,
        status: subscription.status,
        customer: subscription.customer
      },
      profile: updatedProfile[0]
    });
    
  } catch (error) {
    console.error('Sync subscription error:', error);
    res.status(500).json({ error: 'Failed to sync subscription', details: error.message });
  }
});

// Create Stripe Checkout Session endpoint
app.post('/api/stripe/create-checkout-session', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const token = authHeader.substring(7);
    
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }
    
    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(500).json({ error: 'Stripe not configured' });
    }
    
    // Verify token and get user
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    
    // Get user profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('email, role')
      .eq('id', user.id)
      .single();
    
    // Internal users don't need to pay
    if (profile?.role === 'internal') {
      return res.status(400).json({ error: 'Internal users already have access' });
    }
    
    // Get product ID or price ID from environment
    // If product ID is provided, we'll fetch its default price
    const productId = process.env.STRIPE_PRODUCT_ID;
    const priceId = process.env.STRIPE_PRICE_ID;
    
    if (!productId && !priceId) {
      return res.status(500).json({ error: 'Stripe product ID or price ID must be configured' });
    }
    
    // Get the base URL (for redirect URLs)
    const baseUrl = process.env.BASE_URL || req.protocol + '://' + req.get('host');
    
    // If we have a product ID but no price ID, fetch the product's default price
    let finalPriceId = priceId;
    
    if (productId && !priceId) {
      try {
        const product = await stripe.products.retrieve(productId);
        // Get the default price ID from the product
        // default_price can be a string (price ID) or a Price object
        if (typeof product.default_price === 'string') {
          finalPriceId = product.default_price;
        } else if (product.default_price?.id) {
          finalPriceId = product.default_price.id;
        } else {
          // If no default price, get the first active price
          const prices = await stripe.prices.list({ 
            product: productId, 
            active: true,
            limit: 1 
          });
          if (prices.data.length > 0) {
            finalPriceId = prices.data[0].id;
          } else {
            return res.status(500).json({ error: 'Product has no active prices configured. Please add a price to your product in Stripe.' });
          }
        }
      } catch (error) {
        console.error('Error fetching product from Stripe:', error);
        // Provide more helpful error message
        if (error.code === 'resource_missing') {
          return res.status(500).json({ 
            error: `Product ID "${productId}" not found in Stripe. Please check that you're using the correct product ID for your Stripe mode (test/live). The product might be in test mode while you're using live keys, or vice versa.` 
          });
        }
        return res.status(500).json({ error: `Failed to fetch product from Stripe: ${error.message}` });
      }
    }
    
    // Create Stripe Checkout Session
    console.log('Creating Stripe Checkout Session...');
    console.log('User ID:', user.id);
    console.log('User email:', profile?.email || user.email);
    console.log('Price ID:', finalPriceId);
    
    // Check if this is a trial checkout (from query param or request body)
    const isTrial = req.query.trial === 'true' || req.body.trial === true;
    
    const sessionConfig = {
      customer_email: profile?.email || user.email,
      payment_method_types: ['card'],
      line_items: [
        {
          price: finalPriceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      // Send users back into the app (not the landing page) after checkout.
      // We keep `session_id` so the frontend can sync subscription immediately.
      success_url: `${baseUrl}/index.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/index.html?canceled=true`,
      metadata: {
        userId: user.id,
      },
    };
    
    // Add 3-day trial period if this is a trial checkout
    if (isTrial) {
      sessionConfig.subscription_data = {
        trial_period_days: 3,
      };
      console.log('Creating checkout session with 3-day trial period');
    }
    
    const session = await stripe.checkout.sessions.create(sessionConfig);
    
    console.log('✅ Checkout session created');
    console.log('Session ID:', session.id);
    console.log('Session URL:', session.url);
    console.log('Session metadata:', session.metadata);

    res.json({ sessionId: session.id, url: session.url });
    
  } catch (error) {
    console.error('Create checkout session error:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// ============================================
// TRACKING HELPER FUNCTIONS
// ============================================

// Track user login event
async function trackLogin(userId, req) {
  if (!supabase) return;
  
  try {
    await supabase
      .from('login_events')
      .insert({
        user_id: userId,
        ip_address: req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress,
        user_agent: req.headers['user-agent']
      });
  } catch (error) {
    console.error('Error tracking login:', error);
    // Don't fail login if tracking fails
  }
}

// Track generation event
async function trackGeneration(userId, generationType, tokensUsed, inputLength, outputLength) {
  if (!supabase) return;
  
  try {
    await supabase
      .from('generation_events')
      .insert({
        user_id: userId,
        generation_type: generationType,
        tokens_used: tokensUsed || null,
        input_length: inputLength || null,
        output_length: outputLength || null
      });
  } catch (error) {
    console.error('Error tracking generation:', error);
    // Don't fail generation if tracking fails
  }
}

// ============================================
// ADMIN DASHBOARD ENDPOINTS (Internal Users Only)
// ============================================

// Get dashboard analytics (internal users only)
app.get('/api/admin/dashboard', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const token = authHeader.substring(7);
    
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }
    
    // Verify token and get user
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    
    // Check if user is internal
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    
    if (profile?.role !== 'internal') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    // Get total users
    const { count: totalUsers } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true });
    
    // Get active subscriptions
    const { count: activeSubscriptions } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('subscription_status', 'active');
    
    // Get total generations
    const { count: totalGenerations, error: genCountError } = await supabase
      .from('generation_events')
      .select('*', { count: 'exact', head: true });
    
    if (genCountError) {
      console.error('Error getting generation count:', genCountError);
    }
    
    // Get total tokens used
    const { data: tokenData, error: tokenError } = await supabase
      .from('generation_events')
      .select('tokens_used');
    
    if (tokenError) {
      console.error('Error getting token data:', tokenError);
    }
    
    const totalTokens = tokenData?.reduce((sum, event) => sum + (event.tokens_used || 0), 0) || 0;
    
    // Get total logins
    const { count: totalLogins } = await supabase
      .from('login_events')
      .select('*', { count: 'exact', head: true });
    
    // Get recent activity (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const { data: recentGenerations } = await supabase
      .from('generation_events')
      .select('created_at, generation_type')
      .gte('created_at', sevenDaysAgo.toISOString());
    
    const { data: recentLogins } = await supabase
      .from('login_events')
      .select('login_at')
      .gte('login_at', sevenDaysAgo.toISOString());
    
    res.json({
      totalUsers,
      activeSubscriptions,
      totalGenerations,
      totalTokens,
      totalLogins,
      recentActivity: {
        generations: recentGenerations?.length || 0,
        logins: recentLogins?.length || 0
      }
    });
    
  } catch (error) {
    console.error('Get dashboard analytics error:', error);
    res.status(500).json({ error: 'Failed to get dashboard analytics' });
  }
});

// Get all users with analytics (internal users only)
app.get('/api/admin/users', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const token = authHeader.substring(7);
    
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }
    
    // Verify token and get user
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    
    // Check if user is internal
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    
    if (profile?.role !== 'internal') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    // Get all users with their profiles
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (profilesError) {
      throw profilesError;
    }
    
    // Get analytics for each user
    const usersWithAnalytics = await Promise.all(
      profiles.map(async (profile) => {
        // Get login count
        const { count: loginCount } = await supabase
          .from('login_events')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', profile.id);
        
        // Get last login
        const { data: lastLoginData } = await supabase
          .from('login_events')
          .select('login_at')
          .eq('user_id', profile.id)
          .order('login_at', { ascending: false })
          .limit(1)
          .single();
        
        // Get generation count
        const { count: generationCount, error: genCountError } = await supabase
          .from('generation_events')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', profile.id);
        
        if (genCountError) {
          console.error(`Error getting generation count for user ${profile.id}:`, genCountError);
        }
        
        // Get total tokens used
        const { data: tokenData, error: tokenError } = await supabase
          .from('generation_events')
          .select('tokens_used')
          .eq('user_id', profile.id);
        
        if (tokenError) {
          console.error(`Error getting token data for user ${profile.id}:`, tokenError);
        }
        
        const totalTokens = tokenData?.reduce((sum, event) => sum + (event.tokens_used || 0), 0) || 0;
        
        return {
          id: profile.id,
          email: profile.email,
          role: profile.role,
          subscriptionStatus: profile.subscription_status,
          subscriptionId: profile.subscription_id,
          subscriptionStartedAt: profile.subscription_started_at,
          createdAt: profile.created_at,
          loginCount: loginCount || 0,
          lastLogin: lastLoginData?.login_at || null,
          generationCount: generationCount || 0,
          totalTokens: totalTokens
        };
      })
    );
    
    res.json({ users: usersWithAnalytics });
    
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to get users' });
  }
});

// Update user role (internal users only)
app.patch('/api/admin/users/:userId/role', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const token = authHeader.substring(7);
    const { userId } = req.params;
    const { role } = req.body;
    
    if (!role || !['customer', 'internal'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be "customer" or "internal"' });
    }
    
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }
    
    // Verify token and get user
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    
    // Check if user is internal
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    
    if (profile?.role !== 'internal') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    // Update the user's role
    const { data, error } = await supabase
      .from('profiles')
      .update({ role, updated_at: new Date().toISOString() })
      .eq('id', userId)
      .select()
      .single();
    
    if (error) {
      throw error;
    }
    
    res.json({ success: true, user: data });
    
  } catch (error) {
    console.error('Update user role error:', error);
    res.status(500).json({ error: 'Failed to update user role' });
  }
});

// ============================================
// SAVE/RETRIEVE SCOPE ENDPOINTS
// ============================================

// Save scope endpoint (requires authentication)
app.post('/api/save-scope', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const token = authHeader.substring(7);
    const { title, content, content_type } = req.body;
    
    if (!title || !content) {
      return res.status(400).json({ error: 'Title and content are required' });
    }
    
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }
    
    // Verify token and get user
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    
    // Save to database
    const { data, error } = await supabase
      .from('saved_scopes')
      .insert({
        user_id: user.id,
        title: title,
        content: content,
        content_type: content_type || 'hypothesis'
      })
      .select()
      .single();
    
    if (error) {
      console.error('Save scope error:', error);
      return res.status(500).json({ error: 'Failed to save scope' });
    }
    
    res.json({
      success: true,
      scope: data,
      message: 'Scope saved successfully'
    });
    
  } catch (error) {
    console.error('Save scope error:', error);
    res.status(500).json({ error: 'Failed to save scope' });
  }
});

// Get user's saved scopes (requires authentication)
app.get('/api/my-scopes', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const token = authHeader.substring(7);
    
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }
    
    // Verify token and get user
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    
    // Get user's saved scopes
    const { data, error } = await supabase
      .from('saved_scopes')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Get scopes error:', error);
      return res.status(500).json({ error: 'Failed to retrieve scopes' });
    }
    
    res.json({
      success: true,
      scopes: data || []
    });
    
  } catch (error) {
    console.error('Get scopes error:', error);
    res.status(500).json({ error: 'Failed to retrieve scopes' });
  }
});

// Delete saved scope (requires authentication)
app.delete('/api/scopes/:id', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const token = authHeader.substring(7);
    const { id } = req.params;
    
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }
    
    // Verify token and get user
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    
    // Delete scope (only if it belongs to the user)
    const { error } = await supabase
      .from('saved_scopes')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);
    
    if (error) {
      console.error('Delete scope error:', error);
      return res.status(500).json({ error: 'Failed to delete scope' });
    }
    
    res.json({
      success: true,
      message: 'Scope deleted successfully'
    });
    
  } catch (error) {
    console.error('Delete scope error:', error);
    res.status(500).json({ error: 'Failed to delete scope' });
  }
});

// ============================================
// SAVE/RETRIEVE CONVERSATION ENDPOINTS (Advanced Mode)
// ============================================

// Save conversation endpoint (requires authentication)
app.post('/api/save-conversation', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const token = authHeader.substring(7);
    const { title, conversation, conversation_id } = req.body;
    
    if (!title || !conversation || !Array.isArray(conversation)) {
      return res.status(400).json({ error: 'Title and conversation array are required' });
    }
    
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }
    
    // Verify token and get user
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    
    // If conversation_id provided, update existing; otherwise create new
    if (conversation_id) {
      const { data, error } = await supabase
        .from('saved_conversations')
        .update({
          title: title,
          conversation: conversation,
          updated_at: new Date().toISOString()
        })
        .eq('id', conversation_id)
        .eq('user_id', user.id)
        .select()
        .single();
      
      if (error) {
        console.error('Update conversation error:', error);
        return res.status(500).json({ error: 'Failed to update conversation' });
      }
      
      res.json({
        success: true,
        conversation: data,
        message: 'Conversation updated successfully'
      });
    } else {
      // Create new conversation
      const { data, error } = await supabase
        .from('saved_conversations')
        .insert({
          user_id: user.id,
          title: title,
          conversation: conversation
        })
        .select()
        .single();
      
      if (error) {
        console.error('Save conversation error:', error);
        return res.status(500).json({ error: 'Failed to save conversation' });
      }
      
      res.json({
        success: true,
        conversation: data,
        message: 'Conversation saved successfully'
      });
    }
    
  } catch (error) {
    console.error('Save conversation error:', error);
    res.status(500).json({ error: 'Failed to save conversation' });
  }
});

// Get user's saved conversations (requires authentication)
app.get('/api/my-conversations', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const token = authHeader.substring(7);
    
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }
    
    // Verify token and get user
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    
    // Get user's saved conversations
    const { data, error } = await supabase
      .from('saved_conversations')
      .select('id, title, created_at, updated_at')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });
    
    if (error) {
      console.error('Get conversations error:', error);
      return res.status(500).json({ error: 'Failed to retrieve conversations' });
    }
    
    res.json({
      success: true,
      conversations: data || []
    });
    
  } catch (error) {
    console.error('Get conversations error:', error);
    res.status(500).json({ error: 'Failed to retrieve conversations' });
  }
});

// Get single conversation by ID (requires authentication)
app.get('/api/conversations/:id', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const token = authHeader.substring(7);
    const { id } = req.params;
    
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }
    
    // Verify token and get user
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    
    // Get conversation (only if it belongs to the user)
    const { data, error } = await supabase
      .from('saved_conversations')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();
    
    if (error) {
      console.error('Get conversation error:', error);
      return res.status(500).json({ error: 'Failed to retrieve conversation' });
    }
    
    if (!data) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    
    res.json({
      success: true,
      conversation: data
    });
    
  } catch (error) {
    console.error('Get conversation error:', error);
    res.status(500).json({ error: 'Failed to retrieve conversation' });
  }
});

// Delete saved conversation (requires authentication)
app.delete('/api/conversations/:id', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const token = authHeader.substring(7);
    const { id } = req.params;
    
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }
    
    // Verify token and get user
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    
    // Delete conversation (only if it belongs to the user)
    const { error } = await supabase
      .from('saved_conversations')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);
    
    if (error) {
      console.error('Delete conversation error:', error);
      return res.status(500).json({ error: 'Failed to delete conversation' });
    }
    
    res.json({
      success: true,
      message: 'Conversation deleted successfully'
    });
    
  } catch (error) {
    console.error('Delete conversation error:', error);
    res.status(500).json({ error: 'Failed to delete conversation' });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Base path for the app - set to '/planner' to serve at getvantum.com/planner
// Set to '' to serve at root (default)
// Using '' for subdomain setup (planner.getvantum.com)
const BASE_PATH = process.env.BASE_PATH || '';

// Serve landing page at base path
app.get(BASE_PATH, (req, res) => {
  res.sendFile(__dirname + '/public/landing.html');
});

// Serve app pages at base path
app.get(BASE_PATH + '/index.html', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

app.get(BASE_PATH + '/login.html', (req, res) => {
  res.sendFile(__dirname + '/public/login.html');
});

app.get(BASE_PATH + '/admin.html', (req, res) => {
  res.sendFile(__dirname + '/public/admin.html');
});

app.get(BASE_PATH + '/terms.html', (req, res) => {
  res.sendFile(__dirname + '/public/terms.html');
});

app.get(BASE_PATH + '/privacy.html', (req, res) => {
  res.sendFile(__dirname + '/public/privacy.html');
});

// Static file serving at base path - must be AFTER API routes but BEFORE app.listen()
// This serves CSS, JS, images, etc. at /planner/styles.css, /planner/app.js, etc.
app.use(BASE_PATH, express.static('public'));

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`OpenAI API Key configured: ${process.env.OPENAI_API_KEY ? 'Yes' : 'No'}`);
  console.log(`Confluence configured: ${process.env.CONFLUENCE_DOMAIN ? 'Yes' : 'No'}`);
});

