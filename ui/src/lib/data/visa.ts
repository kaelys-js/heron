/**
 * Visa / work-authorization status options. The values are the strings
 * Claude reads in the eligibility block of every evaluation report -- so
 * they're written to be self-explanatory in narrative prose, not just codes.
 *
 * Free-text fallback ("Other / custom") lets users with unusual situations
 * type their own description; the rest of the system treats it as a string
 * regardless of source.
 */

export type VisaOption = {
  value: string;
  label: string;
  description: string;
};

export const VISA_OPTIONS: VisaOption[] = [
  {
    value: 'Citizen',
    label: 'Citizen',
    description: 'Citizen of the country you live in — no visa needed there.',
  },
  {
    value: 'Permanent resident',
    label: 'Permanent resident',
    description: 'Indefinite right to live + work without sponsorship.',
  },
  {
    value: 'Work permit (open)',
    label: 'Work permit · open',
    description:
      'Open / employer-agnostic work permit (e.g. CA Open Work Permit, UK Skilled Worker).',
  },
  {
    value: 'Work permit (employer-tied)',
    label: 'Work permit · employer-tied',
    description: 'Locked to a specific employer (e.g. US H-1B without portability).',
  },
  {
    value: 'TN (Canada/Mexico → US)',
    label: 'TN visa · USMCA',
    description: 'Canadian or Mexican professional eligible to work in the US under USMCA.',
  },
  {
    value: 'O-1',
    label: 'O-1 · extraordinary ability',
    description: 'US O-1 visa for extraordinary ability holders.',
  },
  {
    value: 'EAD (US)',
    label: 'EAD · employment authorization document',
    description: 'US Employment Authorization Document — work without employer sponsorship.',
  },
  {
    value: 'Working Holiday Visa',
    label: 'Working Holiday Visa',
    description: 'Temporary cross-border work visa (e.g. Australia / Canada / NZ schemes).',
  },
  {
    value: 'EU citizen / EU work rights',
    label: 'EU citizen / freedom of movement',
    description: 'Right to work across EU/EEA without sponsorship.',
  },
  {
    value: 'Requires sponsorship',
    label: 'Requires sponsorship',
    description:
      'Need the employer to sponsor a visa — only apply to roles that explicitly support this.',
  },
  {
    value: 'Other / custom',
    label: 'Other / custom (type your own)',
    description: "Your situation isn't in the list — describe it in plain English.",
  },
];

/**
 * On-site availability options. These map to phrases the system already
 * understands when it reasons about remote/hybrid/on-site postings, so
 * pick the closest one rather than free-text whenever possible.
 */
export type OnSiteOption = {
  value: string;
  label: string;
  description: string;
};

export const ONSITE_OPTIONS: OnSiteOption[] = [
  {
    value: 'Fully remote',
    label: 'Fully remote',
    description: "Won't come in. Open to occasional offsites + travel only.",
  },
  {
    value: 'Remote-first, occasional travel',
    label: 'Remote-first · occasional travel',
    description: 'Primary remote with quarterly offsites + travel for key meetings.',
  },
  {
    value: 'Hybrid (1 day/week)',
    label: 'Hybrid · 1 day/week',
    description: 'Light touch — 1 day a week if the office is local.',
  },
  {
    value: 'Hybrid (2-3 days/week)',
    label: 'Hybrid · 2–3 days/week',
    description: 'Standard hybrid — 2 to 3 days in-office per week.',
  },
  {
    value: 'Hybrid (4+ days/week)',
    label: 'Hybrid · 4+ days/week',
    description: 'Mostly in-office with one work-from-home day.',
  },
  {
    value: 'On-site',
    label: 'Fully on-site',
    description: 'Every business day in the office.',
  },
  {
    value: 'On-site (open to relocation)',
    label: 'On-site · open to relocation',
    description: 'Will move for the right opportunity — flag in cover letters.',
  },
  {
    value: 'Other / custom',
    label: 'Other / custom (type your own)',
    description: 'Describe your specific arrangement.',
  },
];
