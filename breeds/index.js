// Breed guides for the breed pages (/boerboel-for-sale.html), keyed by the
// slug in PET_BREEDS (worker.js). Each guide has:
//   facts:  short facts shown as a table, labelled by FACT_LABELS
//   about, temperament, care, health, nigeria:  a paragraph each
// The text is general guidance about the breed, written for buyers in Nigeria;
// it is not a promise about any one animal. Kept out of the public assets by
// .assetsignore and bundled into the Worker.

import dogs1 from './dogs-1.js';
import dogs2 from './dogs-2.js';
import catsBirds from './cats-birds.js';
import rabbitsFish from './rabbits-fish.js';

export const BREED_GUIDES = { ...dogs1, ...dogs2, ...catsBirds, ...rabbitsFish };

// In the order they are shown
export const FACT_LABELS = {
  origin: 'Origin',
  size: 'Size',
  weight: 'Weight',
  height: 'Height',
  life: 'Life span',
  coat: 'Coat',
  talk: 'Talking ability',
  water: 'Water',
  tank: 'Tank or pond',
  heat: 'Copes with heat',
};
