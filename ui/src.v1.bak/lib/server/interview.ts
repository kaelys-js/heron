import path from 'node:path';
import fs from 'node:fs';
import { ROOT, readSafe } from './files';
import { complete } from './ai';

export function loadModeFile(name: string): string {
  return readSafe(path.join(ROOT, 'modes', name));
}

export async function generateInterviewPrep(reportPath: string, archetypeOverride?: string): Promise<string> {
  const reportContent = readSafe(path.join(ROOT, reportPath));
  const cv = readSafe(path.join(ROOT, 'cv.md'));
  const interviewPrepMode = loadModeFile('interview-prep.md');

  const systemPrompt = `You are a senior interview-prep coach for software engineering roles. The candidate is preparing for an interview at the company described in the report below. Use the report's Block A (role summary), Block B (CV match + gaps), and Block F (STAR stories) to produce a focused, no-fluff interview prep brief.

${interviewPrepMode || 'Generate a comprehensive interview prep brief.'}`;

  const user = `# Report (full A-G evaluation)

${reportContent}

# Candidate CV (cv.md)

${cv.slice(0, 3000)}

# Task

Generate an INTERVIEW PREP BRIEF with these sections:

1. **Likely 8-12 interview questions** (mix: 3 behavioral, 3 technical, 2 system design, 2 culture/motivation), tailored to THIS role's JD
2. **STAR stories to lead with** — pull from Block F, refine wording, mark which question each maps to
3. **Technical study plan** — 5 specific topics to review based on the JD stack (with one suggested resource per topic)
4. **Top 3 company-specific talking points** — recent news, team facts, mission angle
5. **Red flags to watch for** in the interview (hours culture? unclear role? unstable funding?) and how to ask
6. **Questions to ask the interviewer** — 5 sharp ones that signal seniority
${archetypeOverride ? `\n7. **Reframe for archetype:** ${archetypeOverride}` : ''}

Output as Markdown. Be specific, not generic. If the report lacks data for a section, say so explicitly.`;

  return complete(systemPrompt, user, { maxTokens: 3500 });
}

export async function generateNegotiationBrief(reportPath: string, offerDetails: string): Promise<string> {
  const reportContent = readSafe(path.join(ROOT, reportPath));
  const profile = readSafe(path.join(ROOT, 'config', 'profile.yml'));
  const negotiationMode = loadModeFile('negotiation.md');

  const systemPrompt = `You are a senior compensation and negotiation coach. The candidate has received an offer; produce a negotiation brief and counter-offer draft.

${negotiationMode || ''}`;

  const user = `# Report (full A-G evaluation including Block D comp research)

${reportContent}

# Candidate profile (config/profile.yml)

${profile}

# Offer details (from candidate)

${offerDetails}

# Task

Produce a NEGOTIATION BRIEF following the modes/negotiation.md structure:
1. Comp percentile table
2. Leverage stance (Strong / Moderate / Weak) with reasoning
3. Draft counter email (ready to copy-paste, customize ONLY where needed)
4. Two alternate stances
5. Likely recruiter responses + handling
6. Manual-checkpoint reminder for BG check disclosure

Output as Markdown.`;

  return complete(systemPrompt, user, { maxTokens: 3000 });
}
