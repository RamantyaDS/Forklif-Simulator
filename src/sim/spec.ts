// Toyota 4FD240 (Traknus 4 Series, 24 t). Official: 24,000 kg at 1250 mm load centre, width 3045, length to fork
// face 6315, overhead guard 3460, outside turning radius 5900, Hino J08E-TM 7684 cc 159 kW at 2300 rpm, 750 Nm at
// 1600 rpm. The rest comes from Toyota's 4FD150–230 spec sheet (4FD230, its closest sibling), with the wheelbase,
// counterweight and weight scaled for the longer 4FD240 (marked "est.").
export const SPEC = {
  capacity: 24000, // kg
  loadCentre: 1.25, // m from the fork face
  mass: 35000, // kg service weight (est.: 4FD230 is 30,880 kg)
  carriageMass: 2600, // carriage, fork positioner and forks (est.), included in `mass`
  width: 3.045,
  wheelbase: 3.95, // est. (4FD230: 3650; the 4FD240 is 770 mm longer)
  loadDistance: 0.945, // front axle centre to fork face
  rearOverhang: 1.42, // rear axle to the back of the counterweight (est.)
  frontTread: 2.2,
  rearTread: 2.5,
  frontContact: 1.42, // outer dual tyre contact patch from the centreline
  wheelR: 0.62, // 14.00-24-20PR, loaded radius
  guardH: 3.46,
  mastH: 3.65, // mast lowered
  // body centre of mass without the carriage (est.: places the combined CG 2.25 m behind the front axle unladen,
  // which gives the 24 t at 1250 mm rating a 1.45 margin against tipping forward)
  bodyCg: { x: 0, y: 1.2, z: -2.47 },
  // mast
  pivot: { y: 0.75, z: 0.55 }, // tilt pivot (mast foot)
  maxLift: 3.0, // fork underside at the heel, so the fork tops reach 3.1 m
  tiltFwd: (6 * Math.PI) / 180,
  tiltBack: (12 * Math.PI) / 180,
  forkL: 2.44,
  forkW: 0.31,
  forkT: 0.1,
  spreadMin: 0.72, // outer edge to outer edge
  spreadMax: 2.75,
  // hydraulics: two lift cylinders lifting the carriage through 2:1 chains
  liftArea: 0.0289, // m², both cylinders
  reliefBar: 210,
  pumpCc: 120, // cm³ per revolution (est., gives 320 mm/s unladen at 2300 rpm)
  // engine and driveline
  idleRpm: 700,
  ratedRpm: 2300,
  highIdle: 2450,
  gears: [36, 16.5], // overall ratio, 1st and 2nd (est.: 15 and 27 km/h)
  reverse: 23.6, // 23 km/h
  eta: 0.88,
  fuelL: 400,
  maxSteer: 1.34, // rad, rear wheels: 5.9 m outside turning radius
};

// Hino J08E-TM full-load torque (Nm): 750 at 1600, 159 kW (660 Nm) at 2300, governor cut-off above.
const TORQUE: [number, number][] = [
  [500, 300],
  [800, 450],
  [1100, 600],
  [1400, 720],
  [1600, 750],
  [2000, 715],
  [2300, 660],
  [2450, 0],
];
export function maxTorque(rpm: number) {
  if (rpm <= TORQUE[0][0]) return TORQUE[0][1] * Math.max(0, rpm / TORQUE[0][0]);
  for (let i = 1; i < TORQUE.length; i++) {
    const [r0, t0] = TORQUE[i - 1];
    const [r1, t1] = TORQUE[i];
    if (rpm <= r1) return t0 + ((t1 - t0) * (rpm - r0)) / (r1 - r0);
  }
  return 0;
}

/** Rated capacity (kg) at a load centre (m from the fork face): the same moment about the front axle as 24 t at 1250. */
export const capacityAt = (centre: number) => Math.min(SPEC.capacity, (SPEC.capacity * (SPEC.loadCentre + SPEC.loadDistance)) / (Math.max(0, centre) + SPEC.loadDistance));

// Torque converter (2-stator): pump absorbs C·ω², stall at about 1800 rpm with full engine torque; torque ratio 3.0
// at stall falling to 1 at the coupling point.
export const CONVERTER = { C: 0.021, stallTr: 3.0, couple: 0.85 };
