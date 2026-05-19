/**
 * Compensation presets -- common salary brackets and walk-away minimums in
 * USD. The Combobox always allows free-text fallback, so anyone with
 * non-USD or off-curve numbers can type their own.
 *
 * Brackets are tied to common tech-industry levels so the description can
 * give a frame of reference ("Senior", "Staff") instead of just numbers.
 */

export type CompOption = { value: string; label: string; description: string };

export const TARGET_RANGE_OPTIONS: CompOption[] = [
  {
    value: '$60K-$90K',
    label: '$60K–$90K',
    description: 'Junior / Associate · entry into the industry',
  },
  { value: '$90K-$140K', label: '$90K–$140K', description: 'Mid · 3–5 yrs of focused experience' },
  {
    value: '$120K-$180K',
    label: '$120K–$180K',
    description: 'Senior · 5+ yrs · ICs leading single tracks',
  },
  { value: '$170K-$240K', label: '$170K–$240K', description: 'Staff · 8+ yrs · cross-team scope' },
  {
    value: '$220K-$320K',
    label: '$220K–$320K',
    description: 'Senior Staff · org-wide scope · principal-track',
  },
  {
    value: '$300K-$450K',
    label: '$300K–$450K',
    description: 'Principal · industry-recognised expertise',
  },
  {
    value: '$400K+',
    label: '$400K+',
    description: 'Distinguished / Sr. Principal · public-company exec band',
  },
];

export const WALKAWAY_OPTIONS: CompOption[] = [
  { value: '$60K USD', label: '$60K', description: 'Junior · realistic floor at entry-level' },
  { value: '$80K USD', label: '$80K', description: 'Mid · floor in non-coastal-US / Canada / EU' },
  {
    value: '$100K USD',
    label: '$100K',
    description: 'Mid · standard floor in major US tech metros',
  },
  { value: '$130K USD', label: '$130K', description: 'Senior · expected baseline for 5+ yrs' },
  { value: '$150K USD', label: '$150K', description: 'Senior · strong floor in US tech' },
  {
    value: '$180K USD',
    label: '$180K',
    description: 'Staff · typical floor for senior staff IC roles',
  },
  { value: '$220K USD', label: '$220K', description: 'Staff+ · principal-track minimum' },
  {
    value: '$280K USD',
    label: '$280K',
    description: 'Principal · public-company senior-leadership floor',
  },
];

/**
 * Location flexibility -- predefined phrasings the system already understands
 * when reasoning about remote/hybrid postings. Maps cleanly to the cover
 * letter "Are you open to relocation?" answer.
 */
export const LOCATION_FLEX_OPTIONS: CompOption[] = [
  {
    value: 'Remote-first, no relocation',
    label: 'Remote-first · no relocation',
    description: "Strict remote — won't move; happy with offsites.",
  },
  {
    value: 'Remote-first, open to occasional travel',
    label: 'Remote-first · occasional travel',
    description: 'Primary remote; cool with quarterly offsites or key in-person meetings.',
  },
  {
    value: 'Hybrid in current city only',
    label: 'Hybrid · current city only',
    description: "Will hybrid in if the office is local. Won't relocate.",
  },
  {
    value: 'Hybrid, open to relocation for the right role',
    label: 'Hybrid · open to relocation',
    description: 'Will move to a new city for hybrid work if the role is strong.',
  },
  {
    value: 'On-site, in current city only',
    label: 'On-site · current city only',
    description: "Will work fully on-site if the office is local. Won't relocate.",
  },
  {
    value: 'On-site, open to relocation',
    label: 'On-site · open to relocation',
    description: 'Will move for full-time on-site work for the right opportunity.',
  },
  {
    value: 'Fully open / case-by-case',
    label: 'Fully open · case-by-case',
    description: 'No fixed preference — evaluate each role on its merits.',
  },
];
