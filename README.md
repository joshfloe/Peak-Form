# PeakForm — setup guide

This is the paid version of PeakForm: real accounts, data synced across devices, and a subscription paywall. Everything is written and ready — you just need to create three free accounts and paste some keys in. None of these steps can be done for you; each service requires you personally to sign up (that's true of any app that touches real payments or user data).

Budget about 20–30 minutes for all of this the first time.

## What you're setting up

- **Supabase** — your database and login system (free tier is plenty to start)
- **Stripe** — payment processing (free to create, they only take a cut once you're actually charging people)
- **Vercel** — hosting for the app and its backend (free tier is plenty to start)

## Step 1 — Create your Supabase project

1. Go to [supabase.com](https://supabase.com) → sign up → **New Project**. Pick any name/region, save the database password somewhere safe.
2. Once it's created, go to **Project Settings → API**. You'll need two values from here in a minute: the **Project URL** and the **anon/public key**.
3. Go to **SQL Editor → New Query**, paste in the entire contents of `supabase/schema.sql` from this folder, and click **Run**. This creates the two tables the app needs and locks them down so users can only ever see their own data.
4. (Optional, recommended while testing with friends) Go to **Authentication → Providers → Email** and turn **off** "Confirm email" so test accounts can log in immediately without clicking an email link. Turn it back on before a real public launch.

## Step 2 — Create your Stripe product

1. Go to [stripe.com](https://stripe.com) → sign up. You can do everything below in **Test mode** first (toggle in the top right) and switch to live mode later without changing any code.
2. Go to **Product catalog → Add product**. Name it "PeakForm Membership", set a recurring price (e.g. $6.99/month), save it. Click into the price you just made and copy its **Price ID** (starts with `price_`).
3. Go to **Developers → API keys** and copy the **Secret key** (starts with `sk_`).
4. You'll set up the webhook (Developers → Webhooks) in Step 4, after you have a live URL to point it at.

## Step 3 — Add your public keys to the app

Open `index.html` in this folder, find this near the top of the `<script>` section:

```js
const SUPABASE_URL = "YOUR_SUPABASE_PROJECT_URL";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";
```

Replace both with the values from Step 1.2. These two are safe to be public — they only ever act within whatever the logged-in user is allowed to do.

## Step 4 — Deploy to Vercel

1. Go to [vercel.com](https://vercel.com) → sign up → **Add New Project** → import this folder (either connect it to a GitHub repo, or use the Vercel CLI: `npm i -g vercel` then `vercel` from inside this folder).
2. Before or during deploy, go to your Vercel project's **Settings → Environment Variables** and add everything listed in `.env.example`:
   - `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (from Supabase → Project Settings → API — the service role key is secret, different from the anon key)
   - `STRIPE_SECRET_KEY` and `STRIPE_PRICE_ID` (from Step 2)
   - `STRIPE_WEBHOOK_SECRET` — leave blank for now, you'll get this in the next step
3. Deploy. You'll get a URL like `https://peakform-yourname.vercel.app`.
4. Back in Stripe → **Developers → Webhooks → Add endpoint**. URL: `https://your-deployed-url.vercel.app/api/stripe-webhook`. Select these events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`. Save, then copy the **Signing secret** (starts with `whsec_`) into Vercel's `STRIPE_WEBHOOK_SECRET` environment variable, and redeploy so it takes effect.

## Step 5 — Test it

1. Open your deployed URL. You should see the sign-up screen.
2. Create an account, then you'll land on the paywall. Click **Start Free Trial** — you'll be sent to Stripe's real checkout page (use [a Stripe test card](https://docs.stripe.com/testing) like `4242 4242 4242 4242`, any future expiry, any CVC, if you're still in Test mode).
3. After paying, you're redirected back and should land in onboarding within a few seconds (there's a brief wait while Stripe's webhook reaches your app).
4. Try Settings → Billing & Account → **Manage Subscription** — that opens Stripe's own portal to cancel/update the card.
5. Log in on a second device or incognito window with the same account — your data should follow you there.

## Sending this to your friends right now, before finishing setup

If you just want to share the free local version while you work through the steps above, that still works exactly as before — nothing in this file breaks it until you fill in the Supabase keys in Step 3. `index.html` alone (opened directly, no deployment) behaves like the original no-account version.

## Notes on what's built vs. what to decide later

- **One subscription tier, $6.99/month, 7-day trial.** Change the price/trial length anytime in the Stripe Dashboard — no code changes needed. To offer multiple tiers later, that's a bigger change (multiple Price IDs, a plan-picker UI) — ask and I'll build it.
- **The paywall gates everything**, including onboarding — nobody sees the app itself until they start a trial. If you'd rather let people explore the free running/lifting/nutrition plans before paying, that's a one-line change to move the paywall check after onboarding instead of before — happy to make that swap if you'd prefer it.
- **Garmin/Apple Watch** import (file upload) works unchanged from the free version. A live, automatic sync would need Garmin's developer API program and more backend code — a real follow-up project, not something bolted on here.
- I could not test this against real Supabase/Stripe from where I built it (that environment has no general internet access) — I traced through the code by hand against both platforms' documented APIs and mocked Stripe/Supabase in a browser to verify the sign-up → paywall → subscribe → unlock flow end to end, but **your first live run-through in Step 5 is the real test**. If something doesn't behave as expected, send me what you're seeing and I'll fix it.
