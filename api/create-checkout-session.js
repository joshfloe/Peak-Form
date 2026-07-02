// POST /api/create-checkout-session
// Body: { userId, email }
// Returns: { url } — redirect the browser to this Stripe-hosted page.
const { getStripe, getSupabaseAdmin, siteUrl } = require("./_stripeClient");

module.exports = async (req, res) => {
  if(req.method !== "POST"){
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  try{
    const { userId, email } = req.body || {};
    if(!userId || !email){
      res.status(400).json({ error: "Missing userId or email" });
      return;
    }
    if(!process.env.STRIPE_PRICE_ID){
      throw new Error("STRIPE_PRICE_ID is not set. Create a recurring Price in the Stripe Dashboard and add its ID to your Vercel environment variables.");
    }

    const stripe = getStripe();
    const supabaseAdmin = getSupabaseAdmin();
    const origin = siteUrl(req);

    // Reuse an existing Stripe customer for this user if we already made one
    // (e.g. they clicked "subscribe", backed out, and are trying again) so
    // we don't create a duplicate customer every attempt.
    const { data: existing } = await supabaseAdmin
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", userId)
      .maybeSingle();

    let customerId = existing && existing.stripe_customer_id;
    if(!customerId){
      const customer = await stripe.customers.create({
        email,
        metadata: { supabase_user_id: userId },
      });
      customerId = customer.id;
      // Pre-create/refresh a row so future webhook events always have
      // somewhere to land, even before the first successful payment.
      await supabaseAdmin.from("subscriptions").upsert({
        user_id: userId,
        stripe_customer_id: customerId,
        status: "none",
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
      // Metadata on subscription_data gets copied onto the actual
      // Subscription object Stripe creates — that's what the webhook
      // reads directly. Metadata on the session itself does NOT
      // propagate to the subscription automatically, so we set both:
      // the session's for checkout.session.completed, and this one for
      // every later customer.subscription.* event.
      subscription_data: { trial_period_days: 7, metadata: { supabase_user_id: userId } },
      success_url: `${origin}/?checkout=success`,
      cancel_url: `${origin}/?checkout=cancel`,
      metadata: { supabase_user_id: userId },
    });

    res.status(200).json({ url: session.url });
  }catch(err){
    console.error("create-checkout-session error:", err);
    res.status(500).json({ error: err.message || "Internal error" });
  }
};
