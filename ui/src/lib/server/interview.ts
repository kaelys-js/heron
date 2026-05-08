import path from 'node:path';
import { ROOT, readSafe } from './files';
import { complete } from './ai';

export function loadModeFile(name: string): string {
  return readSafe(path.join(ROOT, 'modes', name));
}

export async function generateInterviewPrep(reportFile: string, archetypeOverride?: string): Promise<string> {
  const reportContent = readSafe(path.join(ROOT, 'reports', reportFile));
  const cv = readSafe(path.join(ROOT, 'cv.md'));
  const interviewPrepMode = loadModeFile('interview-prep.md');
  const sys = 'You are a senior interview-prep coach. Use the report (Block A/B/F) to produce a focused brief.\n\n' + (interviewPrepMode || 'Generate a comprehensive interview prep brief.');
  const user = '# Report\n' + reportContent + '\n\n# CV\n' + cv.slice(0, 3000) + '\n\n# Task\nProduce a Markdown brief: 8-12 likely questions, STAR map, 5-topic study plan, 3 talking points, red flags, 5 questions to ask back.' + (archetypeOverride ? '\n\nReframe for archetype: ' + archetypeOverride : '');
  return complete(sys, user, { maxTokens: 16000, thinking: true });
}

export async function generateNegotiationBrief(reportFile: string, offerDetails: string): Promise<string> {
  const reportContent = readSafe(path.join(ROOT, 'reports', reportFile));
  const profile = readSafe(path.join(ROOT, 'config', 'profile.yml'));
  const negMode = loadModeFile('negotiation.md');
  const sys = 'You are a senior compensation and negotiation coach.\n\n' + (negMode || '');
  const user = '# Report\n' + reportContent + '\n\n# Profile\n' + profile + '\n\n# Offer\n' + offerDetails + '\n\nProduce: percentile table, leverage stance, draft email, 2 alternates, recruiter response handling.';
  return complete(sys, user, { maxTokens: 16000, thinking: true });
}
