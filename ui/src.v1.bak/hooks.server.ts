import { bootOnce } from '$lib/server/orchestrator';

// Run once on server startup
bootOnce();

export const handle = async ({ event, resolve }) => resolve(event);
