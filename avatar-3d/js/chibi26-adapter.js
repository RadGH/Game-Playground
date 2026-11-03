import { DEFAULT_AVATAR } from '../../avatar-2d/js/render.js';

// Match Chibi 3's permissive look conversion: preserve future slot fields and ids while filling shared defaults.
export function normalizeForChibi26(look = {}) {
  const out = JSON.parse(JSON.stringify(DEFAULT_AVATAR));
  for (const [key, value] of Object.entries(look || {})) {
    if (value && typeof value === 'object' && !Array.isArray(value) && out[key] && typeof out[key] === 'object') {
      Object.assign(out[key], JSON.parse(JSON.stringify(value)));
    } else if (value !== undefined) out[key] = JSON.parse(JSON.stringify(value));
  }
  if (out.body) out.body.v = 2.6;
  return out;
}
