import { wrap, badRequest } from '$lib/server/api-helpers';
import { readSkillBody } from '$lib/server/skills';

export const GET = wrap('skills', async ({ params }: { params: { id: string } }) => {
  const body = readSkillBody(params.id);
  if (body == null) badRequest('Skill not found: ' + params.id);
  return { id: params.id, body };
});
