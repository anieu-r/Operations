/**
 * Statement of Purpose (SOP) / Genuine Student statement builder.
 *
 * Takes a small set of plain-language answers and assembles a well-structured,
 * editable draft plus tailored tips. This is a drafting aid only — applicants
 * must review, personalise and ensure every statement is true.
 */

const PURPOSE_LABEL = {
  study: 'study',
  skilled: 'skilled migration',
  partner: 'a partner/family visa',
  work: 'employer-sponsored work',
  visit: 'a visit to Australia',
  business: 'a business/investment visa',
};

function clean(s) {
  return (s || '').toString().trim();
}

function sentenceList(items) {
  const arr = items.filter(Boolean);
  if (arr.length === 0) return '';
  if (arr.length === 1) return arr[0];
  return `${arr.slice(0, -1).join(', ')} and ${arr[arr.length - 1]}`;
}

const TONE = {
  formal: {
    open: 'I am writing this Statement of Purpose to support my application for',
    close:
      'I confirm that the information in this statement is true and correct. I respectfully request that my application be considered favourably. Thank you for taking the time to review my Statement of Purpose.',
  },
  warm: {
    open: 'I would like to share my story and purpose in support of my application for',
    close:
      'Everything I have written here is true and reflects my genuine intentions. Thank you sincerely for reading my statement and considering my application.',
  },
};

/**
 * @param {object} input
 *   fullName, nationality, purpose, visaCode, course, institution, occupation,
 *   employer, ties (home-country ties), funds, goals, partnerName, extra,
 *   tone ('formal'|'warm'), length ('concise'|'standard'|'detailed')
 */
export function buildSOP(input = {}) {
  const name = clean(input.fullName) || 'I';
  const nationality = clean(input.nationality);
  const purpose = clean(input.purpose) || 'study';
  const purposeLabel = PURPOSE_LABEL[purpose] || 'my application';
  const visaCode = clean(input.visaCode);
  const course = clean(input.course);
  const institution = clean(input.institution);
  const occupation = clean(input.occupation);
  const employer = clean(input.employer);
  const ties = clean(input.ties);
  const funds = clean(input.funds);
  const goals = clean(input.goals);
  const partnerName = clean(input.partnerName);
  const extra = clean(input.extra);
  const tone = TONE[clean(input.tone)] ? clean(input.tone) : 'formal';
  const length = ['concise', 'standard', 'detailed'].includes(clean(input.length))
    ? clean(input.length)
    : 'standard';

  const intro = [];
  intro.push(
    `My name is ${name}${nationality ? `, a citizen of ${nationality}` : ''}. ` +
      `${TONE[tone].open} ${purposeLabel}` +
      `${visaCode ? ` (subclass ${visaCode})` : ''} to Australia.`
  );
  if (length !== 'concise') {
    intro.push(
      `In this statement I explain my background, my reasons for choosing Australia, my plans, and how I meet the requirements of this visa.`
    );
  }

  const body = [];

  if (purpose === 'study') {
    body.push({
      heading: 'My chosen course and institution',
      text: sentenceList([
        course && `I have been accepted to study ${course}`,
        institution && `at ${institution}`,
      ])
        ? `${sentenceList([
            course && `I have been accepted into ${course}`,
            institution && `at ${institution}`,
          ])}. I chose this course because it aligns with my academic background and the career I want to build. Australia offers globally recognised qualifications and high-quality teaching, which is why I selected it over other study destinations.`
        : `I have carefully chosen a course and institution in Australia that align with my academic background and career goals. Australia offers globally recognised qualifications and high-quality teaching.`,
    });
    body.push({
      heading: 'Why Australia and this course',
      text: `I researched my options and chose Australia because of its strong reputation in my field, the quality of its institutions, and the relevance of the curriculum to my goals. ${goals ? `After completing my studies I intend to ${goals}.` : 'After completing my studies I intend to apply the knowledge I gain to advance my career.'}`,
    });
    body.push({
      heading: 'Financial capacity',
      text: funds
        ? `I have the financial capacity to support my studies and stay. ${funds}.`
        : `I have arranged sufficient funds to cover my tuition, living costs and travel, and I can provide documentary evidence of these funds.`,
    });
    body.push({
      heading: 'My ties and intention to comply',
      text: ties
        ? `I have genuine ties to my home country: ${ties}. I understand the conditions of my visa and I intend to comply with them fully, including any work-hour limits and the requirement to maintain my enrolment and health cover.`
        : `I have genuine ties to my home country and a clear intention to comply with all conditions of my visa, including maintaining enrolment, health cover and any work-hour limits.`,
    });
  } else if (purpose === 'skilled' || purpose === 'work') {
    body.push({
      heading: 'My profession and experience',
      text: sentenceList([
        occupation && `I am a ${occupation}`,
        employer && `currently working with ${employer}`,
      ])
        ? `${sentenceList([
            occupation && `I am a ${occupation}`,
            employer && `currently working with ${employer}`,
          ])}. My skills and experience are in demand and I have evidence of my qualifications and employment history.`
        : `I am a skilled professional with relevant qualifications and work experience, supported by documentary evidence and (where required) a positive skills assessment.`,
    });
    body.push({
      heading: 'Why I am applying for this visa',
      text: `${visaCode ? `I am applying for the subclass ${visaCode} visa because it matches my occupation and circumstances. ` : ''}${goals ? `My goal in Australia is to ${goals}.` : 'My goal is to contribute my skills to the Australian labour market and build a long-term future here where the pathway allows.'}`,
    });
    body.push({
      heading: 'How I meet the requirements',
      text: `I meet the core requirements for this visa, including the relevant skills, English language ability, and health and character requirements. I can provide a skills assessment, English test results and employment references as evidence.`,
    });
  } else if (purpose === 'partner') {
    body.push({
      heading: 'Our relationship',
      text: `${partnerName ? `My partner, ${partnerName}, and I` : 'My partner and I'} are in a genuine and continuing relationship. We are committed to a shared life together and can demonstrate this through the financial, household, social and commitment aspects of our relationship.`,
    });
    body.push({
      heading: 'How our relationship developed',
      text: `I describe in this statement how we met, how our relationship developed over time, the milestones we have shared, and our plans for the future together in Australia.`,
    });
    body.push({
      heading: 'Evidence we can provide',
      text: `We can provide evidence across the four aspects assessed for partner visas: shared finances, shared household, the social recognition of our relationship, and the nature of our commitment to each other.`,
    });
  } else if (purpose === 'visit') {
    body.push({
      heading: 'Purpose and length of my visit',
      text: `${goals ? `The purpose of my visit is to ${goals}.` : 'The purpose of my visit is tourism and/or visiting family for a short, defined period.'} I intend to stay only for the period of my visit and then return home.`,
    });
    body.push({
      heading: 'My ties and intention to return',
      text: ties
        ? `I have strong ties to my home country that ensure I will return: ${ties}.`
        : `I have strong ties to my home country — such as employment, family and commitments — that ensure I will return at the end of my visit.`,
    });
    body.push({
      heading: 'Funds for my visit',
      text: funds
        ? `I can fund my visit. ${funds}.`
        : `I have sufficient funds to cover my travel, accommodation and expenses for the visit, and I can provide evidence of these funds.`,
    });
  } else if (purpose === 'business') {
    body.push({
      heading: 'My business background',
      text: `${occupation ? `I am an experienced ${occupation}. ` : ''}I have a track record of managing or owning a business / making qualifying investments, with documentary evidence of my assets and business activity.`,
    });
    body.push({
      heading: 'My plans in Australia',
      text: goals
        ? `In Australia I plan to ${goals}.`
        : `I plan to establish or invest in a business in Australia, creating economic benefit in line with the requirements of this visa.`,
    });
  }

  if (extra) {
    body.push({ heading: 'Additional information', text: extra });
  }

  // Length shaping: detailed adds guided elaboration prompts the writer fills
  // in; concise trims the generic connective sentences.
  if (length === 'detailed') {
    body.push({
      heading: 'Supporting details (fill these in)',
      text:
        '[Add 2–3 specific examples with dates and numbers: an achievement, a project, a turning point that led you here. Specific beats general — one real example is worth a page of adjectives.]',
    });
  }

  const conclusion = TONE[tone].close;

  const draft = assemble(intro, body, conclusion, name);
  const words = draft.split(/\s+/).filter(Boolean).length;
  const tips = tipsFor(purpose);
  const checklist = checklistFor(purpose);

  return {
    draft,
    sections: [{ heading: 'Introduction', text: intro.join(' ') }, ...body, { heading: 'Declaration', text: conclusion }],
    wordCount: words,
    tone,
    length,
    tips,
    checklist,
    wordCountTarget: '500–1000 words for most visas',
  };
}

function assemble(intro, body, conclusion, name) {
  const parts = [];
  parts.push('STATEMENT OF PURPOSE');
  parts.push('');
  parts.push(intro.join(' '));
  parts.push('');
  for (const section of body) {
    parts.push(section.heading.toUpperCase());
    parts.push(section.text);
    parts.push('');
  }
  parts.push('DECLARATION');
  parts.push(conclusion);
  parts.push('');
  parts.push(name && name !== 'I' ? `Sincerely,\n${name}` : 'Sincerely,');
  return parts.join('\n');
}

function tipsFor(purpose) {
  const common = [
    'Be honest and specific — never copy a template or exaggerate. Decision-makers read thousands of statements.',
    'Use clear, simple sentences and short paragraphs with headings.',
    'Back every claim with evidence you can actually provide.',
    'Address the visa’s requirements directly so the assessor can tick each box.',
    'Proofread, keep a consistent tense, and stay within the suggested length.',
  ];
  const extra = {
    study: [
      'Clearly answer: why this course, why this provider, why Australia (not another country), and why now.',
      'Explain how the course fits your past study/work and your future career back home.',
      'Show strong home-country ties and a realistic post-study plan.',
    ],
    skilled: [
      'Map your experience to your nominated occupation (ANZSCO code) and skills assessment.',
      'Quantify achievements (years, projects, responsibilities, outcomes).',
    ],
    work: [
      'Explain the role, why your skills fit, and how you meet the salary threshold.',
      'Reference your employer’s nomination and your relevant experience.',
    ],
    partner: [
      'Cover all four aspects: financial, household, social, and commitment.',
      'Tell your story chronologically with dates and milestones.',
    ],
    visit: [
      'Emphasise a genuine, temporary purpose and strong reasons to return home.',
      'Show funds and a clear, realistic itinerary.',
    ],
    business: [
      'Detail your business/investment history with figures and evidence.',
      'Explain the economic benefit your activity brings to Australia.',
    ],
  };
  return [...(extra[purpose] || []), ...common];
}

function checklistFor(purpose) {
  const base = [
    'Statement is truthful and matches your other documents',
    'Within the suggested word count',
    'Addresses each requirement of the visa',
    'Signed and dated',
  ];
  const map = {
    study: ['Confirmation of Enrolment referenced', 'Funds evidence ready', 'Home-country ties explained'],
    skilled: ['Skills assessment & ANZSCO occupation referenced', 'Employment evidence ready'],
    work: ['Employer nomination referenced', 'Salary threshold addressed'],
    partner: ['All four relationship aspects covered', 'Timeline of relationship included'],
    visit: ['Itinerary attached', 'Funds evidence ready', 'Intention to return shown'],
    business: ['Business/investment evidence ready', 'Asset evidence ready'],
  };
  return [...(map[purpose] || []), ...base];
}
