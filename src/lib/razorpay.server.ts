import Razorpay from "razorpay";

const getEnv = (key: string): string => {
  const value = process.env[key];

  if (!value) {
    throw new Error(`${key} is not configured`);
  }

  return value;
};

export function createRazorpayClient(): Razorpay {
  return new Razorpay({
    key_id: getEnv("RAZORPAY_KEY_ID"),
    key_secret: getEnv("RAZORPAY_KEY_SECRET"),
  });
}

export function getRazorpayKeyId(): string {
  return getEnv("RAZORPAY_KEY_ID");
}
