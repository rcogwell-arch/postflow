const express = require('express');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const app = express();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

app.use(cors());
app.use('/api/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());
app.use(express.static(__dirname + '/public'));

app.post('/api/create-checkout', async (req, res) => {
  const { priceId, email } = req.body;
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    customer_email: email,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${process.env.APP_URL}/dashboard?success=true`,
    cancel_url: `${process.env.APP_URL}/plans`,
  });
  res.json({ url: session.url });
});

app.post('/api/webhook', async (req, res) => {
  const event = stripe.webhooks.constructEvent(
    req.body,
    req.headers['stripe-signature'],
    process.env.STRIPE_WEBHOOK_SECRET
  );
  if (event.type === 'checkout.session.completed') {
    const { customer_email, customer } = event.data.object;
    await supabase.from('users').upsert(
      { email: customer_email, stripe_customer_id: customer, plan: 'pro' },
      { onConflict: 'email' }
    );
  }
  if (event.type === 'customer.subscription.deleted') {
    const c = await stripe.customers.retrieve(event.data.object.customer);
    await supabase.from('users').update({ plan: 'free' }).eq('email', c.email);
  }
  res.json({ received: true });
});

app.post('/api/billing-portal', async (req, res) => {
  const session = await stripe.billingPortal.sessions.create({
    customer: req.body.stripeCustomerId,
    return_url: `${process.env.APP_URL}/dashboard`,
  });
  res.json({ url: session.url });
});

app.listen(process.env.PORT || 3000, () => console.log('PostFlow running!'));
