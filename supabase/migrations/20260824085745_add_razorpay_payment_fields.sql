ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS razorpay_order_id text,
  ADD COLUMN IF NOT EXISTS razorpay_payment_id text,
  ADD COLUMN IF NOT EXISTS razorpay_payment_amount integer,
  ADD COLUMN IF NOT EXISTS razorpay_payment_currency text,
  ADD COLUMN IF NOT EXISTS razorpay_payment_status text,
  ADD COLUMN IF NOT EXISTS razorpay_paid_at timestamptz;