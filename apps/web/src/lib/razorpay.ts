// Razorpay Checkout in the browser: loads checkout.js once and resolves with the
// payment ids (or null if the client closes the window). The server verifies the
// signature; nothing here is trusted on its own.
import type { Checkout } from '@/lib/ib-api';

const SRC = 'https://checkout.razorpay.com/v1/checkout.js';
let loading: Promise<void> | null = null;

type RazorpayCtor = new (o: Record<string, unknown>) => { open: () => void; on: (e: string, cb: () => void) => void };

function load(): Promise<void> {
  if ((window as unknown as { Razorpay?: RazorpayCtor }).Razorpay) return Promise.resolve();
  loading ??= new Promise((ok, bad) => {
    const s = document.createElement('script');
    s.src = SRC; s.async = true;
    s.onload = () => ok();
    s.onerror = () => { loading = null; bad(new Error('Couldn’t load the payment window. Check your connection.')); };
    document.head.appendChild(s);
  });
  return loading;
}

export async function payWithRazorpay(co: Checkout): Promise<{ orderId: string; paymentId: string; signature: string } | null> {
  await load();
  const Rzp = (window as unknown as { Razorpay: RazorpayCtor }).Razorpay;
  return new Promise(resolve => {
    const r = new Rzp({
      key: co.keyId, order_id: co.orderId, amount: co.amount, currency: co.currency, name: co.name, description: co.description, prefill: co.prefill,
      theme: { color: '#08C465' },
      handler: (res: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) =>
        resolve({ orderId: res.razorpay_order_id, paymentId: res.razorpay_payment_id, signature: res.razorpay_signature }),
      modal: { ondismiss: () => resolve(null) },
    });
    r.open();
  });
}
