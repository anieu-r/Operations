/**
 * Official payment information.
 *
 * KEY PRINCIPLE: government visa application charges must be paid DIRECTLY to the
 * Department of Home Affairs (via ImmiAccount) or other official bodies. AusWise
 * never collects government fees on the government's behalf. This module exposes
 * the official channels so users always pay the right body directly.
 */

export const officialBodies = [
  {
    id: 'home-affairs-immiaccount',
    name: 'Department of Home Affairs — ImmiAccount',
    role: 'Pay your Visa Application Charge (VAC) when you lodge online',
    methods: ['Credit/debit card (Visa, Mastercard, Amex, etc.)', 'PayPal', 'BPAY', 'UnionPay'],
    note:
      'Online applications are paid as the final step of lodging in ImmiAccount. Card and PayPal payments may incur a surcharge. All charges are in AUD.',
    url: 'https://online.immi.gov.au/lusc/login',
    payHelpUrl:
      'https://immi.homeaffairs.gov.au/help-support/applying-online-or-on-paper/online/how-to-pay',
    primary: true,
  },
  {
    id: 'home-affairs-paper',
    name: 'Department of Home Affairs — Paper application payments',
    role: 'Pre-pay paper applications via the "Pre-pay Paper Service" in ImmiAccount',
    methods: ['Card', 'PayPal', 'BPAY'],
    note:
      'For paper lodgements, pre-pay using Manage Payments in ImmiAccount and include the receipt with your application.',
    url: 'https://immi.homeaffairs.gov.au/help-support/applying-online-or-on-paper/on-paper/how-to-pay',
    primary: false,
  },
  {
    id: 'vac-pricing',
    name: 'Visa pricing estimator',
    role: 'Check the current, exact Visa Application Charge for your subclass',
    methods: [],
    note:
      'Charges change (often on 1 July). Always confirm the live figure for your subclass and applicants before you pay.',
    url: 'https://immi.homeaffairs.gov.au/visas/getting-a-visa/fees-and-charges/current-visa-pricing',
    primary: false,
  },
  {
    id: 'skills-assessment',
    name: 'Skills assessing authorities',
    role: 'Pay your skills assessment fee directly to the relevant assessing authority',
    methods: ['Varies by authority'],
    note:
      'Assessing authorities (e.g. ACS, Engineers Australia, VETASSESS, AHPRA) are separate bodies — pay them directly.',
    url: 'https://immi.homeaffairs.gov.au/visas/working-in-australia/skills-assessment',
    primary: false,
  },
  {
    id: 'health-exams',
    name: 'Panel physicians (immigration health)',
    role: 'Pay for your immigration medical examination directly to the panel clinic',
    methods: ['Paid to the clinic'],
    note: 'Health examinations are arranged through Bupa/IME and paid to the examining clinic.',
    url: 'https://immi.homeaffairs.gov.au/help-support/meeting-our-requirements/health',
    primary: false,
  },
  {
    id: 'english-tests',
    name: 'English test providers',
    role: 'Pay your English test fee directly to the test provider',
    methods: ['Paid to provider'],
    note: 'IELTS, PTE Academic, TOEFL iBT and OET are booked and paid directly with each provider.',
    url: 'https://immi.homeaffairs.gov.au/help-support/meeting-our-requirements/english-language',
    primary: false,
  },
];

export const safetyTips = [
  'AusWise never asks you to pay government Visa Application Charges to us — you pay Home Affairs directly via ImmiAccount.',
  'The Department of Home Affairs will never ask for payment by gift cards, cryptocurrency or money transfer.',
  'Always confirm the current charge for your subclass on the official pricing page before paying.',
  'Keep your ImmiAccount receipt and Transaction Reference Number (TRN) safe.',
  'Only use registered migration agents (check the OMARA register) or Australian legal practitioners for paid immigration assistance.',
];

export const omaraRegisterUrl = 'https://www.mara.gov.au/';
