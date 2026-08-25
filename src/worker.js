export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/health') {
      return Response.json({
        ok: true,
        game: 'jungle-evolve',
        version: '0.1.0',
      });
    }

    return env.ASSETS.fetch(request);
  },
};
