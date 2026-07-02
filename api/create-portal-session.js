// POST /api/create-portal-session
// Body: { userId }
// Returns: { url } — Stripe's hosted "manage my subscription" page, where
// customers can update their card, change plans, or cancel — no custom UI
// needed on our end.
const { getStripe, getSupabaseAdmin, siteUrl } = require("./_stripeClient");

module.exports = async (req, res) => {
  if(req.method !== "POST"){
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  try{
    const { userId } = req.body || {};
    if(!userId){
      res.status(400).json({ error: "Missing userId" });
      return;
    }
    const stripe = getStripe();
    const supabaseAdmin = getSupabaseAdmin();

    const { data } = await supabaseAdmin
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", userId)
      .maybeSingle();

    if(!data || !data.stripe_customer_id){
      res.status(404).json({ error: "No Stripe customer found for this account yet — subscribe first." });
      return;
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: data.stripe_customer_id,
      return_url: `${siteUrl(req)}/#/settings`,
    });

    res.status(200).json({ url: portalSession.url });
  }catch(err){
    console.error("create-portal-session error:", err);
    res.status(500).json({ error: err.message || "Internal error" });
  }
};
