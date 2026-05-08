import { json } from '@sveltejs/kit';
import { bus } from '$lib/server/events';

export const POST = async () => {
  bus.clear();
  return json({ ok: true });
};
