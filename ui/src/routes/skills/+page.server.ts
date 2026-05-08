import { listSkills } from '$lib/server/skills';

export async function load({ url }: { url: URL }) {
  const includeSystem = url.searchParams.get('system') === '1';
  return { skills: listSkills(includeSystem) };
}
