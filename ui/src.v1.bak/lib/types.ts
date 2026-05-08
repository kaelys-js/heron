export type Status =
  | 'New' | 'Scoring' | 'Scored' | 'Ready'
  | 'Applied' | 'Screened' | 'Interview'
  | 'Offer' | 'Rejected' | 'Closed';

export type BgRisk = 'LOW' | 'MEDIUM' | 'HIGH' | 'BLOCKED' | undefined;

export type Job = {
  id: string;
  url: string;
  company: string;
  role: string;
  location: string;
  score?: number;
  geminiScore?: number;
  status: Status;
  bgRisk?: BgRisk;
  reportFile?: string;
  pdfFile?: string;
  notes?: string;
};

export const STATUS_ORDER: Status[] = [
  'New', 'Scoring', 'Scored', 'Ready',
  'Applied', 'Screened', 'Interview',
  'Offer', 'Rejected', 'Closed',
];
