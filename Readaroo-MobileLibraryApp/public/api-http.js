// HTTP adapter used by the real app. The HTML demo swaps this for an in-page engine.
window.ReadarooAPI = {
  files: true, // the server can hand out files such as calendar invites
  async call(method, path, query, body, opts) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query || {})) if (v !== undefined && v !== null && v !== '') qs.set(k, v);
    const url = path + (qs.toString() ? `?${qs}` : '');
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        keepalive: Boolean(opts && opts.keepalive), // lets a save finish even as the page closes
      });
      return { status: res.status, body: await res.json() };
    } catch (err) {
      return { status: 0, body: { error: 'Cannot reach the Readaroo server. Is it still running?' } };
    }
  },
};
