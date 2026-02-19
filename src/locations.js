/**
 * Curated Drexel University campus locations for DrexelGuessr.
 * All coordinates are placed directly on streets/sidewalks with known
 * Google Street View coverage for maximum reliability.
 */
export const LOCATIONS = [
  {
    lat: 39.95691,
    lng: -75.18952,
    heading: 180,
    pitch: 5,
    name: "Korman Center",
    hint: "Where engineers gather",
  },
  {
    lat: 39.95480,
    lng: -75.18860,
    heading: 90,
    pitch: 0,
    name: "Hagerty Library",
    hint: "Knowledge lives here",
  },
  {
    lat: 39.95395,
    lng: -75.18790,
    heading: 315,
    pitch: 10,
    name: "Main Building",
    hint: "The heart of Drexel",
  },
  {
    lat: 39.95565,
    lng: -75.18880,
    heading: 180,
    pitch: 0,
    name: "Randell Hall",
    hint: "Where many classes are held",
  },
  {
    lat: 39.95720,
    lng: -75.18970,
    heading: 45,
    pitch: 0,
    name: "Daskalakis Athletic Center (DAC)",
    hint: "Fitness & athletics",
  },
  {
    lat: 39.95365,
    lng: -75.19070,
    heading: 0,
    pitch: 5,
    name: "LeBow College of Business",
    hint: "LeBow's home base",
  },
  {
    lat: 39.95515,
    lng: -75.19180,
    heading: 120,
    pitch: 0,
    name: "34th & Race Street",
    hint: "A busy intersection",
  },
  {
    lat: 39.95432,
    lng: -75.18645,
    heading: 270,
    pitch: 5,
    name: "33rd & Market Street",
    hint: "Gateway to campus",
  },
  {
    lat: 39.95600,
    lng: -75.18720,
    heading: 150,
    pitch: 0,
    name: "Chestnut Street",
    hint: "Between the quads",
  },
  {
    lat: 39.95755,
    lng: -75.19110,
    heading: 200,
    pitch: 10,
    name: "Race St Residences",
    hint: "Where freshmen live",
  },
  {
    lat: 39.95330,
    lng: -75.18930,
    heading: 60,
    pitch: 0,
    name: "Drexel Park",
    hint: "The green heart of campus",
  },
  {
    lat: 39.95445,
    lng: -75.19095,
    heading: 340,
    pitch: 0,
    name: "33rd & Arch Street",
    hint: "Near Powel Field",
  },
  {
    lat: 39.95650,
    lng: -75.18830,
    heading: 90,
    pitch: 5,
    name: "Bossone Research Center",
    hint: "Research happens here",
  },
  {
    lat: 39.95298,
    lng: -75.18750,
    heading: 15,
    pitch: 0,
    name: "Lancaster Walk",
    hint: "The iconic Drexel pathway",
  },
  {
    lat: 39.95545,
    lng: -75.19050,
    heading: 250,
    pitch: 0,
    name: "33rd & Powel Street",
    hint: "Field of play",
  },
  {
    lat: 39.95500,
    lng: -75.18710,
    heading: 300,
    pitch: 5,
    name: "MacAlister Hall",
    hint: "Humanities hub",
  },
  {
    lat: 39.95680,
    lng: -75.19195,
    heading: 130,
    pitch: 0,
    name: "34th & Race Street",
    hint: "North campus",
  },
  {
    lat: 39.95380,
    lng: -75.18555,
    heading: 45,
    pitch: 0,
    name: "Market Street near 32nd",
    hint: "Near the trains",
  },
  {
    lat: 39.95580,
    lng: -75.18610,
    heading: 200,
    pitch: 5,
    name: "32nd & Chestnut",
    hint: "East campus edge",
  },
  {
    lat: 39.95420,
    lng: -75.18980,
    heading: 70,
    pitch: 0,
    name: "33rd & Market Street (South)",
    hint: "Student life area",
  },
  // Indoor Locations
  {
    lat: 39.95388,
    lng: -75.18788,
    heading: 0,
    pitch: 10,
    name: "Main Building (Great Court)",
    hint: "The grandeur of Drexel",
    type: "indoor",
  },
  {
    lat: 39.95590,
    lng: -75.19130,
    heading: 270,
    pitch: 0,
    name: "Papadakis Integrated Sciences",
    hint: "Home of the Biowall",
    type: "indoor",
  },
];

/**
 * Select a random subset of locations (no repeats).
 * @param {number} count - Number of locations to pick
 * @returns {Array} Selected locations
 */
export function pickRandomLocations(count = 5) {
  const shuffled = [...LOCATIONS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}
