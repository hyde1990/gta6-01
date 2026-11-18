// Sunset Bay — tuning, city layout and the four story missions.
// Everything here is original: the city of Solmar Bay, its people and its story
// belong to this game alone.
export const CONFIG = {
  seed: 1337,
  // City grid: BLOCKS x BLOCKS blocks, each BLOCK metres wide, separated by
  // roads ROAD metres wide. The grid is centred on (0,0); the ocean lies west.
  blocks: 7,
  block: 34,
  road: 14,
  // Avenues run north-south, streets east-west; lane offset keeps traffic right.
  lane: 3.2,
  // Player / car tuning.
  walkSpeed: 7,
  runSpeed: 11,
  carAccel: 26,
  carBrake: 42,
  carMaxSpeed: 46,
  carReverseMax: 14,
  carTurn: 1.9,
  // Wanted: stars 0..5, police pressure grows with them.
  wantedDecaySeconds: 26,
  maxPolice: 6,
  // Mission rewards.
  rewards: [500, 800, 1000, 2000],
};

// The story: four jobs for Mama Rosa. Each step is a place to reach (and,
// for some, an action key to press). Coordinates are city metres.
export const MISSIONS = [
  {
    id: 'pickup',
    title: 'JOB 1 — THE PICKUP',
    story: 'Mama Rosa needs a package from the docks. Go to the yellow marker and press E.',
    steps: [
      { text: 'Go to the docks and pick up the package (E)', x: -150, z: 130, action: 'pickup' },
      { text: 'Deliver the package to the garage on Marlin Street', x: 96, z: -48, action: 'deliver' },
    ],
    reward: 500,
  },
  {
    id: 'taxi',
    title: 'JOB 2 — TAXI RUSH',
    story: 'A fare is waiting outside the Coral Hotel. Pick them up, then beat the clock to the airport.',
    steps: [
      { text: 'Pick up the fare at the Coral Hotel (E)', x: 48, z: 96, action: 'pickup' },
      { text: 'Drop the fare at the airport — fast! (90 seconds)', x: 150, z: -130, action: 'deliver', timer: 90 },
    ],
    reward: 800,
  },
  {
    id: 'heat',
    title: 'JOB 3 — LOSE THE HEAT',
    story: 'The job went loud. Three stars and the whole department on your tail. Reach the hideout — do not get busted.',
    steps: [
      { text: 'Escape the police and reach the hideout', x: -96, z: -96, action: 'deliver', wanted: 3, timer: 120 },
    ],
    reward: 1000,
  },
  {
    id: 'getaway',
    title: 'JOB 4 — THE GETAWAY',
    story: 'One last car: a gold coupe parked by the marina. Steal it, lose four stars of heat, and bring it to the chop shop.',
    steps: [
      { text: 'Steal the gold coupe at the marina (E)', x: -150, z: -48, action: 'steal', wanted: 0 },
      { text: 'Deliver the gold coupe to the chop shop', x: 130, z: 48, action: 'deliver', wanted: 4 },
    ],
    reward: 2000,
  },
];

export const CITY_NAMES = {
  city: 'Solmar Bay',
  streets: ['Marlin St', 'Coral Ave', 'Palm Row', 'Harbor Rd', 'Sunset Blvd', 'Dune St', 'Bayview Ave'],
  districts: ['Old Marina', 'Coral Heights', 'The Docks', 'Palm Row', 'Airport Flats', 'Downtown Solmar'],
};

export const CAR_COLORS = [0xd83a34, 0x2e6fd8, 0xf2c230, 0x3aa655, 0x8a5fbf, 0xe8e8e8, 0x222831, 0xff7f2a, 0x2ec4b6, 0xc9a227];
export const PED_SHIRTS = [0xff6b6b, 0x4ecdc4, 0xffe66d, 0x95e1d3, 0xf38181, 0xaa96da, 0xfcbad3, 0xa8e6cf];
