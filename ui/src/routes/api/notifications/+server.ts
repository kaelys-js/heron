/**
 * Recent activity events.
 *
 * @module
 */

import { wrap } from '$lib/server/api-helpers';
import { bus } from '$lib/server/events';

export const GET = wrap('notifications', async () => ({ events: bus.recent() }));
