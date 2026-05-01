export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/config.js') {
      const config = {
        SUPABASE_URL:        env.SUPABASE_URL        || '',
        SUPABASE_ANON:       env.SUPABASE_ANON       || '',
        PAYSTACK_PUBLIC_KEY: env.PAYSTACK_PUBLIC_KEY || '',
        N8N_WEBHOOK_URL:     env.N8N_WEBHOOK_URL     || '',
      };
      const body = `window.PPCONFIG = ${JSON.stringify(config)};`;
      return new Response(body, {
        headers: { 'Content-Type': 'application/javascript; charset=utf-8' },
      });
    }

    return env.ASSETS.fetch(request);
  }
};
