/**
 * Per-visa application questionnaires (Client Information Questionnaire style).
 *
 * When an applicant starts an application we collect the same core information
 * a professional intake would (identity, contact, education, English, work,
 * visa history, declarations) plus a section tailored to the visa category.
 *
 * Field types the front end understands:
 *   text | textarea | date | select | multiselect | boolean | number
 */

import { findVisa } from './visas.js';

const YESNO = ['Yes', 'No'];

const ENGLISH_TESTS = ['IELTS', 'PTE Academic', 'TOEFL iBT', 'OET', 'Cambridge C1/C2', 'None yet'];

const CORE_SECTIONS = [
  {
    id: 'personal',
    title: 'Personal details',
    icon: '🪪',
    fields: [
      { id: 'fullName', label: 'Full name (as in passport)', type: 'text', required: true },
      { id: 'dob', label: 'Date of birth', type: 'date', required: true },
      { id: 'nationality', label: 'Citizenship / nationality', type: 'text', required: true },
      { id: 'passportNumber', label: 'Passport number', type: 'text', required: true },
      { id: 'passportExpiry', label: 'Passport expiry date', type: 'date' },
      {
        id: 'maritalStatus',
        label: 'Relationship status',
        type: 'select',
        options: ['Single', 'Married', 'De facto', 'Divorced', 'Widowed'],
      },
      { id: 'dependants', label: 'Dependants coming with you (children etc.)', type: 'number' },
    ],
  },
  {
    id: 'contact',
    title: 'Contact & location',
    icon: '📍',
    fields: [
      { id: 'email', label: 'Email', type: 'text', required: true },
      { id: 'phone', label: 'Phone (with country code)', type: 'text' },
      { id: 'country', label: 'Country you live in now', type: 'text', required: true },
      {
        id: 'inAustralia',
        label: 'Are you currently in Australia?',
        type: 'select',
        options: YESNO,
        required: true,
      },
      {
        id: 'currentVisa',
        label: 'If in Australia — your current visa (subclass and expiry)',
        type: 'text',
        showIf: { inAustralia: 'Yes' },
      },
    ],
  },
  {
    id: 'education',
    title: 'Education history',
    icon: '🎓',
    fields: [
      {
        id: 'highestQualification',
        label: 'Highest completed qualification',
        type: 'select',
        options: ['Secondary school', 'Certificate/Diploma', 'Bachelor degree', 'Master degree', 'Doctorate', 'Other'],
      },
      { id: 'educationDetail', label: 'Qualifications (course, institution, country, year)', type: 'textarea', help: 'One per line is fine.' },
      { id: 'studyGap', label: 'Any gap in study/work of 6+ months? If so, briefly explain', type: 'textarea' },
    ],
  },
  {
    id: 'english',
    title: 'English language',
    icon: '🗣️',
    fields: [
      { id: 'englishTest', label: 'English test taken (or planned)', type: 'select', options: ENGLISH_TESTS },
      { id: 'englishScore', label: 'Overall score (if taken)', type: 'text' },
      { id: 'englishDate', label: 'Test date (tests are valid for a limited period)', type: 'date' },
    ],
  },
  {
    id: 'work',
    title: 'Work history',
    icon: '💼',
    fields: [
      { id: 'occupation', label: 'Current/most recent occupation', type: 'text' },
      { id: 'yearsExperience', label: 'Years of relevant work experience', type: 'number' },
      { id: 'workDetail', label: 'Roles (title, employer, country, dates)', type: 'textarea', help: 'Most recent first.' },
    ],
  },
  {
    id: 'history',
    title: 'Visa & travel history',
    icon: '🛂',
    fields: [
      { id: 'visaRefusal', label: 'Ever had a visa refused or cancelled (any country)?', type: 'select', options: YESNO, required: true },
      { id: 'refusalDetail', label: 'If yes — which visa, when, and why', type: 'textarea', showIf: { visaRefusal: 'Yes' } },
      { id: 'ausTravel', label: 'Previous visits to Australia (visa + dates)', type: 'textarea' },
    ],
  },
  {
    id: 'declarations',
    title: 'Health & character',
    icon: '🛡️',
    fields: [
      { id: 'healthCondition', label: 'Any significant health conditions we should plan around?', type: 'select', options: YESNO },
      { id: 'charge', label: 'Any criminal convictions or pending charges (any country)?', type: 'select', options: YESNO },
      { id: 'declareDetail', label: 'If yes to either — brief detail (kept confidential)', type: 'textarea', showIf: { anyYes: ['healthCondition', 'charge'] } },
      {
        id: 'truthful',
        label: 'I confirm the information above is true and complete. Honest answers protect your application — non-disclosure is a common refusal reason.',
        type: 'boolean',
        required: true,
      },
    ],
  },
];

const CATEGORY_SECTIONS = {
  Study: {
    id: 'study',
    title: 'Your study plans',
    icon: '📚',
    fields: [
      { id: 'courseLevel', label: 'What do you want to study?', type: 'select', options: ['English course (ELICOS)', 'Vocational (Cert/Diploma)', 'Bachelor', 'Master', 'PhD/Research', 'School'], required: true },
      { id: 'courseField', label: 'Field of study (e.g. IT, nursing, business)', type: 'text', required: true },
      { id: 'hasOffer', label: 'Do you already have an offer or CoE?', type: 'select', options: ['Yes — CoE', 'Yes — offer letter', 'Not yet'] },
      { id: 'preferredCity', label: 'Preferred cities/regions (if any)', type: 'text' },
      { id: 'funds', label: 'Funds available for tuition + living (AUD, approx.)', type: 'text', required: true },
      { id: 'whoPays', label: 'Who is funding your studies?', type: 'select', options: ['Myself/savings', 'Parents/family', 'Loan', 'Scholarship', 'Employer', 'Mix'] },
      { id: 'whyAustralia', label: 'Why Australia, and why this course? (drafts your Genuine Student answer)', type: 'textarea', required: true },
      { id: 'careerPlan', label: 'What will this course lead to for you?', type: 'textarea' },
    ],
  },
  'Skilled & Work': {
    id: 'skilled',
    title: 'Your skilled profile',
    icon: '🛠️',
    fields: [
      { id: 'nominatedOccupation', label: 'Occupation you plan to nominate (ANZSCO if known)', type: 'text', required: true },
      { id: 'skillsAssessment', label: 'Skills assessment status', type: 'select', options: ['Positive assessment held', 'Applied — waiting', 'Not started'], required: true },
      { id: 'ageBand', label: 'Age band (points depend on it)', type: 'select', options: ['18–24', '25–32', '33–39', '40–44', '45+'] },
      { id: 'statePreference', label: 'Open to state nomination or regional areas? Which states?', type: 'text' },
      { id: 'employerSponsor', label: 'Do you have an Australian employer willing to sponsor you?', type: 'select', options: YESNO },
      { id: 'partnerSkills', label: 'Partner with skills/English (possible extra points)?', type: 'select', options: ['Yes', 'No', 'Not applicable'] },
    ],
  },
  'Family & Partner': {
    id: 'partner',
    title: 'Your relationship & sponsor',
    icon: '❤️',
    fields: [
      { id: 'sponsorStatus', label: 'Your partner/sponsor is…', type: 'select', options: ['Australian citizen', 'Permanent resident', 'Eligible NZ citizen', 'Not sure'], required: true },
      { id: 'relationshipType', label: 'Relationship type', type: 'select', options: ['Married', 'De facto (12+ months)', 'De facto (registered)', 'Engaged (fiancé/e)'], required: true },
      { id: 'togetherSince', label: 'When did the relationship start?', type: 'date' },
      { id: 'livedTogether', label: 'Have you lived together? For how long?', type: 'text' },
      { id: 'evidence', label: 'Evidence you can show (joint finances, lease, photos, travel, statements…)', type: 'textarea' },
      { id: 'priorSponsorship', label: 'Has your sponsor sponsored a partner before?', type: 'select', options: ['Yes', 'No', 'Not sure'] },
    ],
  },
  Visitor: {
    id: 'visit',
    title: 'Your visit',
    icon: '🌏',
    fields: [
      { id: 'visitPurpose', label: 'Purpose of visit', type: 'select', options: ['Tourism', 'Visiting family/friends', 'Business visitor', 'Working holiday'], required: true },
      { id: 'visitLength', label: 'How long do you plan to stay?', type: 'select', options: ['Up to 1 month', '1–3 months', '3–6 months', '6–12 months'] },
      { id: 'visitFunds', label: 'Funds available for the trip (AUD, approx.)', type: 'text' },
      { id: 'ties', label: 'Your ties at home (job, family, property, study) — reasons you will return', type: 'textarea', required: true },
      { id: 'inviter', label: 'If visiting someone — who, and their status in Australia', type: 'text' },
    ],
  },
  'Business & Investment': {
    id: 'business',
    title: 'Your business profile',
    icon: '📈',
    fields: [
      { id: 'businessBackground', label: 'Your business/investment background (ownership %, turnover, years)', type: 'textarea', required: true },
      { id: 'netAssets', label: 'Approximate net business + personal assets (AUD)', type: 'text' },
      { id: 'intent', label: 'What do you plan to do in Australia (establish, buy, invest)?', type: 'textarea', required: true },
      { id: 'stateInterest', label: 'States/territories of interest', type: 'text' },
    ],
  },
  'Residence & Other': {
    id: 'residence',
    title: 'Your circumstances',
    icon: '🏠',
    fields: [
      { id: 'currentStatus', label: 'Your current status (visa held, time in Australia)', type: 'textarea', required: true },
      { id: 'goal', label: 'What outcome are you seeking?', type: 'textarea', required: true },
    ],
  },
};

/**
 * Build the questionnaire for a visa: intro + core sections + category section.
 */
export function getQuestionnaire(visaCode) {
  const visa = findVisa(visaCode);
  if (!visa) return null;
  const category = CATEGORY_SECTIONS[visa.category];
  const sections = [...CORE_SECTIONS];
  if (category) sections.splice(2, 0, category); // early, right after contact
  return {
    visaCode: visa.code,
    visaName: visa.name,
    category: visa.category,
    intro:
      `This questionnaire mirrors a professional migration intake. Answer honestly — including refusals and gaps — ` +
      `because full disclosure protects your application. Nothing here is sent to the government; it prepares your file and our advice.`,
    estimatedMinutes: 8,
    sections,
  };
}

/** Basic server-side validation: required fields (respecting showIf) must be answered. */
export function validateResponses(questionnaire, answers = {}) {
  const missing = [];
  for (const section of questionnaire.sections) {
    for (const f of section.fields) {
      if (!f.required) continue;
      if (f.showIf && !showIfMet(f.showIf, answers)) continue;
      const v = answers[f.id];
      const empty = v == null || v === '' || (f.type === 'boolean' && v !== true && v !== 'true');
      if (empty) missing.push({ section: section.title, field: f.label, id: f.id });
    }
  }
  return missing;
}

function showIfMet(cond, answers) {
  if (cond.anyYes) return cond.anyYes.some((id) => answers[id] === 'Yes');
  return Object.entries(cond).every(([k, v]) => answers[k] === v);
}
