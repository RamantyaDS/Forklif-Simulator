// The loads the 4FD240 handles in the port. Each is a box for collisions with its centre of mass, its friction on
// the steel forks and how the forks get under it: a base frame or skid sitting on timbers (forks go in between the
// timbers, under the load), or pallet / fork pockets built into the load itself (`lift0` above its bottom).

export type CargoModel = 'genset' | 'coil' | 'pipes' | 'timber' | 'cement' | 'trafo' | 'container';

export interface CargoDef {
  id: CargoModel;
  name: string;
  hx: number; // half length along the load's own x
  hz: number; // half depth along its z (the forks go in along z)
  h: number;
  mass: number; // kg
  cg: { x: number; y: number; z: number }; // centre of mass in the load frame (bottom centre origin)
  mu: number; // static friction on dry forks (sliding uses 0.77 of it)
  lift0: number; // height of the lifting surface above the load's bottom (pallet / fork pockets), 0 = base frame
  groundOk: boolean; // may stand straight on the ground (the forks come out of the pockets)
  pockets?: { c: number; w: number }; // fork pockets: centres ± c along the load's x, each w wide
  info: string;
}

export const CARGOS: Record<CargoModel, CargoDef> = {
  genset: {
    id: 'genset',
    name: 'Genset 2250 kVA',
    hx: 2.95,
    hz: 1.1,
    h: 2.55,
    mass: 14800,
    // engine toward the radiator end (−x), the heavy alternator at +x
    cg: { x: 0.13, y: 1.05, z: 0 },
    mu: 0.35,
    lift0: 0,
    groundOk: false,
    info: 'Open set 5,9 × 2,2 × 2,55 m, 14,8 t, rangka dasar baja di atas balok kayu.',
  },
  coil: {
    id: 'coil',
    name: 'Coil baja',
    hx: 0.8,
    hz: 0.95,
    h: 1.9,
    mass: 16000,
    cg: { x: 0, y: 0.95, z: 0 },
    mu: 0.2, // steel on steel, oily: slides easily
    lift0: 0,
    groundOk: false,
    info: 'Gulungan pelat baja Ø 1,9 m × 1,6 m, 16 t, rebah di atas dua balok. Baja di atas garpu baja licin: rem dan belok halus.',
  },
  pipes: {
    id: 'pipes',
    name: 'Bundel pipa baja',
    hx: 3.0,
    hz: 0.65,
    h: 0.8,
    mass: 9000,
    cg: { x: 0, y: 0.4, z: 0 },
    mu: 0.25,
    lift0: 0,
    groundOk: false,
    info: 'Pipa 6 m diikat strapping, 9 t, di atas tiga balok. Panjang ke samping: hati-hati menyenggol saat belok.',
  },
  timber: {
    id: 'timber',
    name: 'Bundel kayu gergajian',
    hx: 2.4,
    hz: 0.6,
    h: 1.1,
    mass: 6500,
    cg: { x: 0, y: 0.55, z: 0 },
    mu: 0.5,
    lift0: 0,
    groundOk: false,
    info: 'Kayu meranti 4,8 m diikat, 6,5 t, di atas balok penyangga.',
  },
  cement: {
    id: 'cement',
    name: 'Palet semen (4 palet)',
    hx: 1.0,
    hz: 1.0,
    h: 1.75,
    mass: 6000,
    cg: { x: 0, y: 0.85, z: 0 },
    mu: 0.5,
    lift0: 0.15,
    groundOk: true,
    info: '4 palet × 30 sak 50 kg, 6 t. Garpu masuk ke lubang palet (tinggi 15 cm) dekat lantai.',
  },
  trafo: {
    id: 'trafo',
    name: 'Trafo daya 20 MVA',
    hx: 1.9,
    hz: 1.15,
    h: 2.9,
    mass: 21500,
    // the tap changer and conservator make it heavier at +x and high up
    cg: { x: 0.25, y: 1.25, z: 0 },
    mu: 0.35,
    lift0: 0,
    groundOk: false,
    info: '21,5 t, hampir kapasitas penuh. Pusat berat tinggi dan tidak di tengah: angkat rendah, jalan pelan.',
  },
  container: {
    id: 'container',
    name: 'Kontainer 20 ft kosong',
    hx: 3.03,
    hz: 1.22,
    h: 2.59,
    mass: 2300,
    cg: { x: 0, y: 1.1, z: 0 },
    mu: 0.3,
    lift0: 0.13,
    groundOk: true,
    pockets: { c: 1.025, w: 0.36 },
    info: 'Kontainer kosong 2,3 t. Hanya boleh diangkat lewat fork pocket (jarak tengah 2050 mm): lebarkan garpu dulu.',
  },
};
