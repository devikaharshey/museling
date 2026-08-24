# Payments & entitlement rebuild

## What we're building (from your answers)

- **One entitlement**: Founding access. Gates group chat send + being matched.
- **Three ways to get it**:
  - **£5 / month** — auto-renewing subscription
  - **£50 / year** — auto-renewing subscription
  - **£70 lifetime** — one-time, never expires
- **Renewal UX**: when access is < 7 days from expiry or already expired, show a full-page paywall inside the group chat + a banner in Inbox with the 3 options.
- **Account page**: single "Manage billing" route linking to Stripe Billing Portal + a read-only list of past charges.
- **Everything credit-related and every legacy plan is removed** from code + UI.

## Product catalog (Stripe)

Create three new prices with these lookup keys (batch_create_product):

| lookup_key                   | amount | recurring | eligible for full compliance |
| ---------------------------- | ------ | --------- | ---------------------------- |
| `museling_founding_monthly`  | 500    | month     | yes (SaaS `txcd_10103001`)   |
| `museling_founding_yearly`   | 5000   | year      | yes                          |
| `museling_founding_lifetime` | 7000   | –         | yes                          |

The existing `museling_founding_5` price stays in Stripe (grandfathered — anyone who already bought keeps their 60 days), but it is removed from the app's `ALLOWED_PRICE_IDS`. `museling_group_fee_onetime`, `museling_unlimited_monthly`, and all `museling_topup_*` prices you can archive in Stripe at your leisure.

## Schema changes (single migration)

```text
profiles
  + founding_plan text            -- 'monthly' | 'yearly' | 'lifetime' | null
  + founding_lifetime bool default false
  + founding_stripe_subscription_id text
  (founding_expires_at is reused; lifetime = NULL sentinel with founding_lifetime=true)

drop:
  - credit_balance_pence
  - credit_topups table
  - credit_ledger table (already unused)

has_active_founding(_user_id) rewrite:
  return founding_lifetime = true
      OR (founding_expires_at is not null AND founding_expires_at > now())
```

Migration also drops the credits tables' RLS / grants cleanly.

## Webhook (`api/public/payments/webhook.ts`)

New event handling:

- `checkout.session.completed` with `priceId = museling_founding_lifetime` → set `founding_lifetime=true`, `founding_plan='lifetime'`, clear `founding_expires_at`. Idempotent via stripe_session_id already recorded.
- `customer.subscription.created|updated` with lookup_key `museling_founding_monthly|yearly` → upsert `subscriptions` row **and** mirror onto profile: `founding_plan`, `founding_stripe_subscription_id`, `founding_expires_at = current_period_end`.
- `customer.subscription.deleted` → clear `founding_plan` and `founding_stripe_subscription_id`. Leave `founding_expires_at` in place so access lasts until period end.
- `invoice.payment_failed` → surface a notification but do not revoke; Stripe retries.
- Idempotency: for lifetime, no-op if `founding_lifetime` already true; for subs, upsert on `stripe_subscription_id`.
- The legacy `museling_founding_5` branch stays, but for new users the app never opens that checkout.

## Server functions (`payments.functions.ts`)

Replace the current file with:

- `createFoundingCheckout({ plan: 'monthly'|'yearly'|'lifetime', returnUrl })` — one function, three branches. Uses `resolveOrCreateCustomer`. Adds `managed_payments: { enabled: true }` (SaaS, seller in UK — eligible).
- `createPortalSession({ returnUrl })` — kept, sources customer id from `subscriptions` then `profiles`.
- `getFoundingBilling({ environment })` — reads Stripe: current subscription (if any), lifetime flag from profile, list of invoices/charges. Uses the `stripe-read-data` pattern.
- Remove `ALLOWED_PRICE_IDS` legacy entries; remove `groupId` param (replaced below).

Delete entirely: `credits.functions.ts`, `TopupCheckout.tsx`, `topup.tsx`, `credits.ts`.

## Routes

- **New** `src/routes/_authenticated/join.tsx` — three-tier paywall (£5/mo · £50/yr · £70 lifetime) with embedded Stripe checkout for whichever plan is picked. Accepts `?back=` to return the user to where they came from. Replaces `founding-invite.$groupId.tsx` (which becomes a thin redirect to `/join?back=/groups/…`).
- **New** `src/routes/_authenticated/billing.tsx` — "Manage billing" (portal link + invoice list). Linked from Profile.
- **Update** `groups.$id.tsx` — when `has_active_founding` is false, render the paywall in-place instead of allowing input.
- **Update** `inbox.tsx` — expiry banner when < 7 days left or already expired, linking to `/join`.
- **Update** `profile.tsx` — remove `CreditCard` component + "Credits" stat; add "Membership" row showing plan + next renewal (or "Lifetime") and a "Manage billing" link.
- **Delete** `topup.tsx`, `TopupCheckout.tsx`, `PaymentTestModeBanner` reference to legacy checks (banner logic stays, since it's about pk_test vs pk_live).
- `checkout-return.tsx` — remove the credit-balance polling branch; keep the `redirect` branch (used by all three new plans).

## Admin

`admin.founding.tsx` still matches groups and sends invites, but its notification link changes from `/founding-invite/:groupId` to `/join?back=/groups/:groupId`. `inviteFoundingGroup` message copy changes to "Unlock the group chat with a Museling membership".

## Cleanup

- Remove `credit_balance_pence`, `getCreditState`, credit ledger references from all remaining files (`profile.tsx`, `inbox.tsx`, wallet chips, `signup.tsx` if any).
- Remove `museling_group_fee_onetime` / `museling_unlimited_monthly` from `ALLOWED_PRICE_IDS`, banner, and `StripeEmbeddedCheckout.tsx`.
- `invites.functions.ts` shim already re-exports meetups — keep as-is.
- Regenerate Supabase types.

## Test plan (preview)

1. **Sign up fresh** → land on `/discover`. Profile shows no membership.
2. Mark yourself going on any concert with "Open to meeting others". Admin (you) opens `/admin/founding` → suggest group → invite. Notification arrives.
3. Click the notification → `/join`. Try each of the three checkouts with Stripe test card **`4242 4242 4242 4242`**, any future expiry, any CVC, any postcode.
4. After each checkout, `/checkout-return?redirect=/groups/:id` should redirect and you should be able to send messages.
5. Verify in `/billing`: monthly + yearly show renewal date and a working "Manage billing" button; lifetime shows "Lifetime access · never expires" and no portal button (nothing to manage).
6. In Billing Portal, cancel the monthly sub → webhook clears `founding_plan` but access persists until period end. In Inbox, expiry banner appears once period_end < 7 days away.
7. Failed payment: card `4000 0000 0000 0341`. Should insert a notification but not revoke chat access.
8. Reload the site — old test users with `credit_balance_pence > 0` should just see empty membership (credits gone) and be prompted to `/join` before chatting.

## Technical notes

- All new Stripe calls use `createStripeClient(env)` and return `{ error }` on failure so TanStack's middleware doesn't swallow the message.
- Managed payments (`managed_payments: { enabled: true }`) enabled on all three checkouts — Museling is a UK seller, digital service, eligible.
- The lifetime purchase writes both a Customer (searchable by `metadata.userId`) and stamps `stripe_customer_id` on the profile, so the billing portal works even without an active subscription.
- Signature verification, `/api/public/*` prefix, and the env-gated webhook secrets are unchanged.
