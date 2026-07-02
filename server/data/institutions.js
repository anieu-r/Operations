/**
 * Australian education institutions directory.
 *
 * Factual, public information only (name, type, location, official website).
 * We deliberately avoid rankings and marketing claims — students should verify
 * courses and providers on the official CRICOS register, which is linked
 * everywhere. Institutions can register interest to manage their listing.
 */

export const CRICOS_SEARCH_URL = 'https://cricos.education.gov.au/';
export const STUDY_AUSTRALIA_URL = 'https://www.studyaustralia.gov.au/';

export const institutions = [
  // Group of Eight universities
  { id: 'unimelb', name: 'The University of Melbourne', type: 'University', state: 'VIC', city: 'Melbourne', url: 'https://www.unimelb.edu.au/', tags: ['Group of Eight', 'Research'] },
  { id: 'usyd', name: 'The University of Sydney', type: 'University', state: 'NSW', city: 'Sydney', url: 'https://www.sydney.edu.au/', tags: ['Group of Eight', 'Research'] },
  { id: 'anu', name: 'Australian National University', type: 'University', state: 'ACT', city: 'Canberra', url: 'https://www.anu.edu.au/', tags: ['Group of Eight', 'Research'] },
  { id: 'unsw', name: 'UNSW Sydney', type: 'University', state: 'NSW', city: 'Sydney', url: 'https://www.unsw.edu.au/', tags: ['Group of Eight', 'Research'] },
  { id: 'uq', name: 'The University of Queensland', type: 'University', state: 'QLD', city: 'Brisbane', url: 'https://www.uq.edu.au/', tags: ['Group of Eight', 'Research'] },
  { id: 'monash', name: 'Monash University', type: 'University', state: 'VIC', city: 'Melbourne', url: 'https://www.monash.edu/', tags: ['Group of Eight', 'Research'] },
  { id: 'uwa', name: 'The University of Western Australia', type: 'University', state: 'WA', city: 'Perth', url: 'https://www.uwa.edu.au/', tags: ['Group of Eight', 'Research'] },
  { id: 'adelaide', name: 'The University of Adelaide', type: 'University', state: 'SA', city: 'Adelaide', url: 'https://www.adelaide.edu.au/', tags: ['Group of Eight', 'Research'] },
  // Other well-known universities
  { id: 'uts', name: 'University of Technology Sydney', type: 'University', state: 'NSW', city: 'Sydney', url: 'https://www.uts.edu.au/', tags: ['Technology'] },
  { id: 'rmit', name: 'RMIT University', type: 'University', state: 'VIC', city: 'Melbourne', url: 'https://www.rmit.edu.au/', tags: ['Technology', 'Design'] },
  { id: 'qut', name: 'Queensland University of Technology', type: 'University', state: 'QLD', city: 'Brisbane', url: 'https://www.qut.edu.au/', tags: ['Technology'] },
  { id: 'macquarie', name: 'Macquarie University', type: 'University', state: 'NSW', city: 'Sydney', url: 'https://www.mq.edu.au/', tags: [] },
  { id: 'deakin', name: 'Deakin University', type: 'University', state: 'VIC', city: 'Melbourne / Geelong', url: 'https://www.deakin.edu.au/', tags: [] },
  { id: 'griffith', name: 'Griffith University', type: 'University', state: 'QLD', city: 'Brisbane / Gold Coast', url: 'https://www.griffith.edu.au/', tags: [] },
  { id: 'curtin', name: 'Curtin University', type: 'University', state: 'WA', city: 'Perth', url: 'https://www.curtin.edu.au/', tags: [] },
  { id: 'wollongong', name: 'University of Wollongong', type: 'University', state: 'NSW', city: 'Wollongong', url: 'https://www.uow.edu.au/', tags: ['Regional'] },
  { id: 'newcastle', name: 'University of Newcastle', type: 'University', state: 'NSW', city: 'Newcastle', url: 'https://www.newcastle.edu.au/', tags: ['Regional'] },
  { id: 'latrobe', name: 'La Trobe University', type: 'University', state: 'VIC', city: 'Melbourne / regional VIC', url: 'https://www.latrobe.edu.au/', tags: ['Regional options'] },
  { id: 'swinburne', name: 'Swinburne University of Technology', type: 'University', state: 'VIC', city: 'Melbourne', url: 'https://www.swinburne.edu.au/', tags: ['Technology'] },
  { id: 'unisa', name: 'University of South Australia', type: 'University', state: 'SA', city: 'Adelaide', url: 'https://www.unisa.edu.au/', tags: [] },
  { id: 'utas', name: 'University of Tasmania', type: 'University', state: 'TAS', city: 'Hobart / Launceston', url: 'https://www.utas.edu.au/', tags: ['Regional'] },
  { id: 'cdu', name: 'Charles Darwin University', type: 'University', state: 'NT', city: 'Darwin', url: 'https://www.cdu.edu.au/', tags: ['Regional'] },
  // VET / TAFE sector (public vocational providers)
  { id: 'tafensw', name: 'TAFE NSW', type: 'TAFE / Vocational', state: 'NSW', city: 'Statewide', url: 'https://www.tafensw.edu.au/', tags: ['Vocational', 'Public provider'] },
  { id: 'tafeqld', name: 'TAFE Queensland', type: 'TAFE / Vocational', state: 'QLD', city: 'Statewide', url: 'https://tafeqld.edu.au/', tags: ['Vocational', 'Public provider'] },
  { id: 'tafevic', name: 'TAFE Victoria network', type: 'TAFE / Vocational', state: 'VIC', city: 'Statewide', url: 'https://www.vic.gov.au/tafe', tags: ['Vocational', 'Public provider'] },
  { id: 'tafesa', name: 'TAFE SA', type: 'TAFE / Vocational', state: 'SA', city: 'Statewide', url: 'https://www.tafesa.edu.au/', tags: ['Vocational', 'Public provider'] },
];

export const states = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'];
export const institutionTypes = ['University', 'TAFE / Vocational'];

export function filterInstitutions({ q, state, type } = {}) {
  let rows = institutions;
  if (state) rows = rows.filter((i) => i.state === state);
  if (type) rows = rows.filter((i) => i.type === type);
  if (q) {
    const n = q.toLowerCase();
    rows = rows.filter((i) => [i.name, i.city, i.state, i.type, ...(i.tags || [])].join(' ').toLowerCase().includes(n));
  }
  return rows;
}
