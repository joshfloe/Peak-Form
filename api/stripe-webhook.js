// POST /api/stripe-webhook
// Configure this exact URL (https://your-app.vercel.app/api/stripe-webhook)
// in the Stripe Dashboard under Developers → Webhooks, subscribed to:
//   checkout.session.completed, customer.subscription.updated,
//   customer.subscription.deleted
//
// This is the ONLY place subscription status gets written, and it always
// verifies Stripe's signature first — never trust webhook data otherwise,
// since the endpoint is public.
const { getStripe, getSupabaseAdmin, findUserIdByCustomer } = require("./_stripeClient");

function readRawBody(req){
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function upsertFromSubscription(supabaseAdmin, userId, stripeSubscription){
  await supabaseAdmin.from("subscriptions").upsert({
    user_id: userId,
    stripe_customer_id: stripeSubscription.customer,
    stripe_subscription_id: stripeSubscription.id,
    status: stripeSubscription.status, // trialing | active | past_due | canceled | ...
    price_id: stripeSubscription.items.data[0] && stripeSubscription.items.data[0].price.id,
    current_period_end: new Date(stripeSubscription.current_period_end * 1000).toISOString(),
  });
}

async function handler(req, res) {
  if(req.method !== "POST"){
    res.status(405).send("Method not allowed");
    return;
  }

  let stripe, supabaseAdmin;
  try{
    stripe = getStripe();
    supabaseAdmin = getSupabaseAdmin();
  }catch(err){
    console.error("stripe-webhook config error:", err);
    res.status(500).send("Server not configured");
    return;
  }

  if(!process.env.STRIPE_WEBHOOK_SECRET){
    console.error("STRIPE_WEBHOOK_SECRET is not set.");
    res.status(500).send("Server not configured");
    return;
  }

  let event;
  try{
    const rawBody = await readRawBody(req);
    event = stripe.webhooks.constructEvent(rawBody, req.headers["stripe-signature"], process.env.STRIPE_WEBHOOK_SECRET);
  }catch(err){
    console.error("Webhook signature verification failed:", err.message);
    res.status(400).send(`Webhook Error: ${err.message}`);
    return;
  }

  try{
    switch(event.type){
      case "checkout.session.completed": {
        const session = event.data.object;
        const userId = (session.metadata && session.metadata.supabase_user_id)
          || await findUserIdByCustomer(stripe, supabaseAdmin, session.customer);
        if(userId && session.subscription){
          const sub = await stripe.subscriptions.retrieve(session.subscription);
          await upsertFromSubscription(supabaseAdmin, userId, sub);
        }
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.created": {
        const sub = event.data.object;
        const userId = (sub.metadata && sub.metadata.supabase_user_id)
          || await findUserIdByCustomer(stripe, supabaseAdmin, sub.customer);
        if(userId) await upsertFromSubscription(supabaseAdmin, userId, sub);
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object;
        const userId = await findUserIdByCustomer(stripe, supabaseAdmin, sub.customer);
        if(userId){
          await supabaseAdmin.from("subscriptions").upsert({
            user_id: userId,
            stripe_customer_id: sub.customer,
            stripe_subscription_id: sub.id,
            status: "canceled",
          });
        }
        break;
      }
      default:
        // Ignore anything we don't care about.
        break;
    }
    res.status(200).json({ received: true });
  }catch(err){
    console.error("stripe-webhook handling error:", err);
    // Return 500 so Stripe retries this event automatically.
    res.status(500).send("Webhook handler error");
  }
}

module.exports = handler;
// Stripe requires the exact raw request bytes to verify the signature, so
// we turn off Vercel's automatic JSON body parsing for this function. This
// MUST be set on the same object `module.exports` points to, and AFTER the
// assignment above — setting it earlier and then reassigning module.exports
// would silently drop it.
module.exports.config = { api: { bodyParser: false } };
