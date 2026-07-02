// Shared helpers for the Stripe-related serverless functions.
// Keeping this in one place avoids re-deriving the Supabase admin client
// and the "find which user owns this Stripe customer" logic three times.
const Stripe = require("stripe");
const { createClient } = require("@supabase/supabase-js");

function getStripe(){
  if(!process.env.STRIPE_SECRET_KEY){
    throw new Error("STRIPE_SECRET_KEY is not set. Add it in your Vercel project's Environment Variables.");
  }
  return new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });
}

// Uses the SERVICE ROLE key — this bypasses Row Level Security, which is
// exactly what we want here since these functions run on the server and
// need to write subscription status for arbitrary users. Never expose the
// service role key to the browser.
function getSupabaseAdmin(){
  if(!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY){
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set. Add them in your Vercel project's Environment Variables.");
  }
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function siteUrl(req){
  return process.env.SITE_URL || (req.headers.origin) || `https://${req.headers.host}`;
}

// Given a Stripe customer id, figure out which Supabase user it belongs to.
// Tries our own subscriptions table first (fast path, set during checkout),
// falls back to the Stripe customer's metadata (set when we created them).
async function findUserIdByCustomer(stripe, supabaseAdmin, customerId){
  const { data } = await supabaseAdmin
    .from("subscriptions")
    .select("user_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  if(data && data.user_id) return data.user_id;

  const customer = await stripe.customers.retrieve(customerId);
  return (customer && customer.metadata && customer.metadata.supabase_user_id) || null;
}

module.exports = { getStripe, getSupabaseAdmin, siteUrl, findUserIdByCustomer };
