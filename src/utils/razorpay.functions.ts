import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import crypto from "node:crypto";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createRazorpayClient, getRazorpayKeyId } from "@/lib/razorpay.server";

export const RAZORPAY_PLANS = {
  invite: {
    amount: 500, // ₹5.00
    name: "Museling Founding Invite Pass",
    description: "60 days access",
  },
  monthly: {
    amount: 500, // ₹5.00
    name: "Museling Monthly Membership",
    description: "Monthly membership",
  },
  yearly: {
    amount: 5000, // ₹50.00
    name: "Museling Yearly Membership",
    description: "Yearly membership",
  },
  lifetime: {
    amount: 7000, // ₹70.00
    name: "Museling Lifetime Membership",
    description: "Lifetime membership",
  },
} as const;

export type RazorpayPlan = keyof typeof RAZORPAY_PLANS;

type CreateOrderResult =
  | {
      success: true;
      orderId: string;
      amount: number;
      currency: string;
      keyId: string;
    }
  | {
      success: false;
      error: string;
    };

type VerifyPaymentResult =
  | {
      success: true;
      paymentId: string;
      orderId: string;
      plan: RazorpayPlan;
    }
  | {
      success: false;
      error: string;
    };

/**
 * Creates a Razorpay order on the server.
 *
 * The server determines the amount.
 * The frontend never supplies the amount.
 */
export const createRazorpayOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        plan: z.enum(["invite", "monthly", "yearly", "lifetime"]),
        groupId: z.string().uuid().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<CreateOrderResult> => {
    try {
      const { userId, supabase } = context;

      const {
        data: { user },
      } = await supabase.auth.getUser();

      const plan = RAZORPAY_PLANS[data.plan];

      const razorpay = createRazorpayClient();

      /*
       * Razorpay receipt has a maximum length of 40 characters
       * in practice, so keep this deliberately short.
       */
      const shortUserId = userId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 12);

      const receipt = `ml_${shortUserId}_${Date.now()}`;

      const order = await razorpay.orders.create({
        amount: plan.amount,
        currency: "INR",
        receipt,
        notes: {
          userId,
          plan: data.plan,
          ...(data.groupId ? { groupId: data.groupId } : {}),
          ...(user?.email ? { email: user.email } : {}),
        },
      });

      return {
        success: true,
        orderId: order.id,
        amount: Number(order.amount),
        currency: order.currency,
        keyId: getRazorpayKeyId(),
      };
    } catch (error) {
      console.error("Razorpay order creation failed:", error);

      return {
        success: false,
        error: error instanceof Error ? error.message : "Unable to create Razorpay order.",
      };
    }
  });

/**
 * Verifies a Razorpay payment and activates the membership.
 *
 * IMPORTANT:
 * Membership is granted ONLY after:
 *
 * 1. Razorpay signature is verified.
 * 2. Payment is fetched directly from Razorpay.
 * 3. Payment is captured/authorized successfully.
 * 4. The Razorpay order belongs to the authenticated user.
 * 5. The plan comes from the server-side Razorpay order notes.
 */
export const verifyRazorpayPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        razorpayOrderId: z.string().min(1),
        razorpayPaymentId: z.string().min(1),
        razorpaySignature: z.string().min(1),

        /*
         * Kept for the frontend API, but we do NOT trust this
         * value when activating the membership.
         */
        plan: z.enum(["invite", "monthly", "yearly", "lifetime"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<VerifyPaymentResult> => {
    try {
      const { userId, supabase } = context;

      const secret = process.env.RAZORPAY_KEY_SECRET;

      if (!secret) {
        throw new Error("RAZORPAY_KEY_SECRET is not configured");
      }

      const razorpay = createRazorpayClient();

      /*
       * ---------------------------------------------------------
       * 1. Verify Razorpay signature
       * ---------------------------------------------------------
       */

      const generatedSignature = crypto
        .createHmac("sha256", secret)
        .update(`${data.razorpayOrderId}|${data.razorpayPaymentId}`)
        .digest("hex");

      const received = Buffer.from(data.razorpaySignature, "utf8");

      const expected = Buffer.from(generatedSignature, "utf8");

      if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) {
        return {
          success: false,
          error: "Invalid Razorpay payment signature.",
        };
      }

      /*
       * ---------------------------------------------------------
       * 2. Fetch the payment directly from Razorpay
       * ---------------------------------------------------------
       */

      const payment = await razorpay.payments.fetch(data.razorpayPaymentId);

      /*
       * Payment must belong to the same order.
       */
      if (payment.order_id !== data.razorpayOrderId) {
        return {
          success: false,
          error: "Payment does not belong to the supplied Razorpay order.",
        };
      }

      /*
       * ---------------------------------------------------------
       * 3. Check payment status
       * ---------------------------------------------------------
       */

      if (payment.status !== "captured" && payment.status !== "authorized") {
        return {
          success: false,
          error: `Payment is not successful. Current status: ${payment.status}`,
        };
      }

      /*
       * ---------------------------------------------------------
       * 4. Fetch the Razorpay order
       * ---------------------------------------------------------
       */

      const order = await razorpay.orders.fetch(data.razorpayOrderId);

      /*
       * ---------------------------------------------------------
       * 5. Verify the order belongs to this user
       * ---------------------------------------------------------
       */

      const orderUserId = order.notes?.userId;

      if (!orderUserId || orderUserId !== userId) {
        return {
          success: false,
          error: "This Razorpay order does not belong to the current user.",
        };
      }

      /*
       * ---------------------------------------------------------
       * 6. Determine plan from the SERVER-SIDE order
       * ---------------------------------------------------------
       */

      const serverPlan = order.notes?.plan as RazorpayPlan | undefined;

      if (!serverPlan || !Object.prototype.hasOwnProperty.call(RAZORPAY_PLANS, serverPlan)) {
        return {
          success: false,
          error: "Unable to determine the purchased membership plan.",
        };
      }

      /*
       * Make sure the frontend-selected plan matches the
       * server-side order.
       */
      if (serverPlan !== data.plan) {
        return {
          success: false,
          error: "Selected membership plan does not match the Razorpay order.",
        };
      }

      const plan = serverPlan;

      /*
       * ---------------------------------------------------------
       * 7. Verify amount
       * ---------------------------------------------------------
       */

      const expectedAmount = RAZORPAY_PLANS[plan].amount;

      if (Number(payment.amount) !== expectedAmount) {
        return {
          success: false,
          error: "Payment amount does not match the selected membership plan.",
        };
      }

      /*
       * ---------------------------------------------------------
       * 8. Check whether this payment was already processed
       * ---------------------------------------------------------
       */

      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("razorpay_payment_id, founding_plan, founding_lifetime, founding_expires_at")
        .eq("id", userId)
        .maybeSingle();

      const existing = (existingProfile ?? {}) as {
        razorpay_payment_id?: string | null;
        founding_plan?: RazorpayPlan | null;
        founding_lifetime?: boolean;
        founding_expires_at?: string | null;
      };

      /*
       * If this exact payment has already been processed,
       * don't add another 60 days / rewrite the membership.
       */
      if (existing.razorpay_payment_id === data.razorpayPaymentId) {
        return {
          success: true,
          paymentId: data.razorpayPaymentId,
          orderId: data.razorpayOrderId,
          plan,
        };
      }

      /*
       * ---------------------------------------------------------
       * 9. Calculate membership entitlement
       * ---------------------------------------------------------
       */

      const now = new Date();

      let foundingExpiresAt: string | null = null;
      let foundingLifetime = false;

      if (plan === "lifetime") {
        foundingLifetime = true;
        foundingExpiresAt = null;
      } else if (plan === "invite") {
        /*
         * Invite pass = 60 days.
         *
         * If the user already has an active invite membership,
         * extend from the existing expiry instead of throwing
         * away the remaining time.
         */
        const existingExpiry = existing.founding_expires_at
          ? new Date(existing.founding_expires_at)
          : null;

        const base =
          existingExpiry && !Number.isNaN(existingExpiry.getTime()) && existingExpiry > now
            ? existingExpiry
            : now;

        foundingExpiresAt = new Date(base.getTime() + 60 * 24 * 60 * 60 * 1000).toISOString();
      } else {
        /*
         * Razorpay one-time implementation currently creates
         * these plans as payments rather than subscriptions.
         *
         * For now, give them the corresponding membership period.
         */
        if (plan === "monthly") {
          foundingExpiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
        }

        if (plan === "yearly") {
          foundingExpiresAt = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString();
        }
      }

      /*
       * ---------------------------------------------------------
       * 10. Save payment + membership
       * ---------------------------------------------------------
       */

      const profileUpdate = {
        founding_plan: plan,
        founding_lifetime: foundingLifetime,

        founding_paid_at: now.toISOString(),
        founding_expires_at: foundingExpiresAt,

        razorpay_order_id: data.razorpayOrderId,
        razorpay_payment_id: data.razorpayPaymentId,
        razorpay_payment_amount: Number(payment.amount),
        razorpay_payment_currency: payment.currency,
        razorpay_payment_status: payment.status,
        razorpay_paid_at: now.toISOString(),

        signup_complete: true,
      };

      const { error: updateError } = await supabase
        .from("profiles")
        .update(profileUpdate)
        .eq("id", userId);

      if (updateError) {
        console.error("Failed to save Razorpay membership:", updateError);

        throw new Error(
          `Payment verified but membership could not be saved: ${updateError.message}`,
        );
      }

      /*
       * ---------------------------------------------------------
       * 11. Success
       * ---------------------------------------------------------
       */

      console.log("Razorpay payment verified and membership activated:", {
        userId,
        orderId: data.razorpayOrderId,
        paymentId: data.razorpayPaymentId,
        plan,
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
      });

      return {
        success: true,
        paymentId: data.razorpayPaymentId,
        orderId: data.razorpayOrderId,
        plan,
      };
    } catch (error) {
      console.error("Razorpay payment verification failed:", error);

      return {
        success: false,
        error: error instanceof Error ? error.message : "Unable to verify Razorpay payment.",
      };
    }
  });
