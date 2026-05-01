const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

app.use('/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());
app.use(express.static(__dirname + '/public'));

app.post('/signup', async (req, res) => {
  const { email, password, plan } = req.body;
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) return res.json({ error: error.message });
  await supabase.auth.admin.updateUserById(data.user.id, {
    user_metadata: { plan: plan || 'free' }
  });
  res.json({ success: true });
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return res.json({ error: 'Invalid email or password.' });
  res.json({ access_token: data.session.access_token, user: data.user });
});

app.post('/create-checkout-session', async (req, res) => {
  const { plan } = req.body;
  const priceId = plan === 'agency'
    ? process.env.STRIPE_AGENCY_PRICE_ID
    : process.env.STRIPE_PRO_PRICE_ID;
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.APP_URL}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.APP_URL}/pricing.html`,
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error('Stripe error:', err);
    res.status(500).json({ error: 'Could not create checkout session.' });
  }
});

app.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    console.log('New subscriber:', session.customer_email);
  }
  res.json({ received: true });
});

app.listen(PORT, () => console.log(`PostFlow running on port ${PORT}`));
