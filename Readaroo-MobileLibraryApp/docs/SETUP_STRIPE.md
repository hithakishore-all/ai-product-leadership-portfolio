# Set up Stripe (test mode)

Optional. Without a key, Readaroo simulates each charge and labels it `simulated`. With a test key, each library-funded instant borrow becomes a real Stripe **meter event** in your test account. No real money moves: Readaroo refuses to start with a live key.

Do [SETUP_POSTGRES.md](SETUP_POSTGRES.md) first.

## 1. Create a Stripe account

Sign up at [dashboard.stripe.com/register](https://dashboard.stripe.com/register). You don't need to activate payments to use test mode.

## 2. Copy your test secret key

1. In the Stripe dashboard, turn on **Test mode** (toggle at the top right).
2. Go to **Developers → API keys**.
3. Next to **Secret key**, click **Reveal test key**. It starts with `sk_test_`.

For extra safety you can instead create a **restricted key** (`rk_test_…`) with write access to *Billing meters*, *Meter events* and *Customers* only.

## 3. Paste it into `.env` yourself

Copy the key, then on a Mac:

```bash
echo "STRIPE_SECRET_KEY=$(pbpaste)" >> .env
```

On Windows or Linux, open `.env` in a text editor and paste it after `STRIPE_SECRET_KEY=`. Don't share the key in chat, email or a commit. To check it landed without printing it:

```bash
grep -c '^STRIPE_SECRET_KEY=sk_test_\|^STRIPE_SECRET_KEY=rk_test_' .env   # prints 1 when set
```

## 4. Create the meter and test customers

```bash
npm run stripe:setup
```

This:

1. creates (or reuses) a billing meter named `readaroo_instant_borrow` that sums the `value` of each event, in cents;
2. creates (or reuses) one test customer per library, tagged `synthetic: true`;
3. saves each customer id on its library in Postgres.

Expected output:

```
Created meter mtr_... (readaroo_instant_borrow)
Maple County Library: cus_...
Riverbend City Library: cus_...
Stripe test mode is ready. Restart the app; the footer should say "Stripe: test mode".
```

## 5. Try it

1. `npm start`, open http://127.0.0.1:3000.
2. Demo guide → **R3** → **Open** → **Borrow instantly**.
3. In Stripe (test mode) open **Billing → Meters → Readaroo instant borrows**. Within a minute or two you'll see a 249-cent event for Maple County Library.

Each event carries the identifier `borrow:<borrow id>`, so Stripe ignores an accidental duplicate. If Stripe can't be reached, Readaroo cancels the borrow and gives the budget back.

## Turning a meter into an invoice (optional)

To bill a library monthly, create a **Product** with a **usage-based price** of $0.01 per unit attached to the `readaroo_instant_borrow` meter, then a **subscription** for each library customer. Readaroo doesn't need any of this to run.

Problems? See [TROUBLESHOOTING.md](TROUBLESHOOTING.md#stripe).
