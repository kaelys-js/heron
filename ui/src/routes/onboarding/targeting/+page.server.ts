/** Pre-fills the targeting form with anything the user already has in
 *  profile.yml + portals.yml so revisits are non-destructive. */
import { readProfile } from '$lib/server/profile';
import { readPortals } from '$lib/server/portals';

const DEFAULT_NEGATIVE = [
  'Junior', 'Intern', '.NET', 'Java ', 'iOS', 'Android', 'PHP', 'Ruby',
  'Embedded', 'Firmware', 'FPGA', 'ASIC', 'Blockchain', 'Web3', 'Crypto',
  'Salesforce Admin', 'SAP ', 'Oracle EBS', 'Mainframe', 'COBOL',
];

export async function load() {
  const profile = readProfile();
  const portals = readPortals();
  const tf = portals.title_filter;
  return {
    initial: {
      target_roles: profile.target_roles?.primary ?? [],
      positive: tf.positive.length > 0 ? tf.positive : [],
      negative: tf.negative.length > 0 ? tf.negative : DEFAULT_NEGATIVE,
      target_range: profile.compensation?.target_range ?? '',
      currency: profile.compensation?.currency ?? '',
      minimum: profile.compensation?.minimum ?? '',
      must_have: profile.preferences?.must_have ?? [],
      strong_plus: profile.preferences?.strong_plus ?? [],
      hard_no: profile.preferences?.hard_no ?? [],
    },
    bootstrappedFromTemplate: portals.source === 'template',
  };
}
