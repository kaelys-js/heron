import { loadPlaybook } from '$lib/server/negotiation-playbook';

export async function load() {
  return { playbook: loadPlaybook() };
}
