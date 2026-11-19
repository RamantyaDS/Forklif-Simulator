// The jobs: seven loads with their own pick-up and set-down places, the daily pre-use check (P2H) and an SIO-style
// operator test course. Each builds a world layout (world.ts) and the step texts the panel shows.
import { CARGOS, type CargoModel } from './cargo';
import { applyLayout, box, timbersUnder, TIMBER, TRUCK, type Layout } from './world';

export type JobId = 'genset' | 'coil' | 'pipes' | 'timber' | 'cement' | 'trafo' | 'container' | 'p2h' | 'sio';

export interface Checkpoint {
  x: number;
  z: number;
  r: number;
  dir?: 'F' | 'R';
  stop?: boolean; // must stand still here with the forks down
  loaded?: boolean; // must carry the load through it
  label: string;
}

export interface Job {
  id: JobId;
  title: string;
  short: string;
  cargo: CargoModel;
  steps: [string, string, string];
  intro: string;
  checkpoints?: Checkpoint[]; // SIO: before and after the placing (index `placeAfter` splits them)
  placeAfter?: number;
  layout: () => Layout;
}

const DECK_Y = TRUCK.deckTop;
const T = TIMBER.t;
const truckLoad = { x: -3, z: 0, yaw: 0 };

export const JOBS: Job[] = [
  {
    id: 'genset',
    title: 'Turunkan genset 2250 kVA',
    short: 'Genset',
    cargo: 'genset',
    steps: ['Angkat genset dari truk', 'Bawa ke area letak', 'Letakkan di bantalan & lepas garpu'],
    intro: 'Turunkan genset Traknus 2250 kVA (14,8 t) dari truk flatbed ke bantalan kayu di area letak.',
    layout: () => ({
      load: CARGOS.genset,
      start: { ...truckLoad, y: DECK_Y + T },
      pad: { x: -24, z: 16, yaw: 0, y: T, label: 'AREA LETAK GENSET' },
      forklift: { x: -3, z: 12, heading: Math.PI },
      timbers: [...timbersUnder('truck', -3, 0, 0, [-2.6, 0, 2.6], DECK_Y, 2.2), ...timbersUnder('pad', -24, 16, 0, [-2.6, 0, 2.6], 0, 2.2)],
      supports: [],
      cones: [],
    }),
  },
  {
    id: 'coil',
    title: 'Pindahkan coil baja 16 t',
    short: 'Coil baja',
    cargo: 'coil',
    steps: ['Angkat coil dari truk', 'Bawa ke gudang coil', 'Letakkan di dua balok'],
    intro: 'Coil baja 16 t di atas truk. Baja di atas garpu baja licin (gesek 0,2): tilt mundur, rem dan belok halus, atau coil meluncur jatuh.',
    layout: () => ({
      load: CARGOS.coil,
      start: { ...truckLoad, y: DECK_Y + T },
      pad: { x: -38, z: 12, yaw: 0, y: T, w: 3.4, d: 3.0, tolerance: 0.4, label: 'AREA COIL' },
      forklift: { x: -3, z: 12, heading: Math.PI },
      timbers: [...timbersUnder('truck', -3, 0, 0, [-0.62, 0.62], DECK_Y, 1.9), ...timbersUnder('pad', -38, 12, 0, [-0.62, 0.62], 0, 1.9)],
      supports: [],
      cones: [],
    }),
  },
  {
    id: 'pipes',
    title: 'Muat bundel pipa ke truk',
    short: 'Pipa',
    cargo: 'pipes',
    steps: ['Angkat bundel pipa dari tumpukan', 'Bawa ke truk flatbed', 'Letakkan di balok atas bak truk'],
    intro: 'Bundel pipa 6 m (9 t) di lantai. Muat ke bak truk flatbed di atas balok: garpu harus di atas lantai bak 1,55 m saat masuk.',
    layout: () => ({
      load: CARGOS.pipes,
      start: { x: -20, z: 30, yaw: 0, y: T },
      pad: { x: -3, z: 0, yaw: 0, y: DECK_Y + T, w: 7.0, d: 2.4, tolerance: 0.7, label: '' },
      forklift: { x: -20, z: 42, heading: Math.PI },
      timbers: [...timbersUnder('stack', -20, 30, 0, [-2.2, 0, 2.2], 0, 1.3), ...timbersUnder('truck', -3, 0, 0, [-2.2, 0, 2.2], DECK_Y, 2.4)],
      supports: [],
      cones: [],
    }),
  },
  {
    id: 'timber',
    title: 'Antar kayu ke gudang',
    short: 'Kayu',
    cargo: 'timber',
    steps: ['Angkat bundel kayu', 'Bawa ke depan gudang', 'Letakkan di balok penyangga'],
    intro: 'Bundel kayu gergajian 6,5 t di lapangan timur. Antar ke depan pintu gudang, letakkan di atas balok penyangga.',
    layout: () => ({
      load: CARGOS.timber,
      start: { x: 6, z: 34, yaw: 0, y: T },
      pad: { x: -40, z: 30, yaw: 0, y: T, w: 6.0, d: 2.6, label: 'GUDANG' },
      forklift: { x: 6, z: 46, heading: Math.PI },
      timbers: [...timbersUnder('src', 6, 34, 0, [-1.8, 0, 1.8], 0, 1.2), ...timbersUnder('pad', -40, 30, 0, [-1.8, 0, 1.8], 0, 1.2)],
      supports: [],
      cones: [],
    }),
  },
  {
    id: 'cement',
    title: 'Susun palet semen bertingkat',
    short: 'Palet semen',
    cargo: 'cement',
    steps: ['Masukkan garpu ke lubang palet', 'Bawa ke tumpukan', 'Susun di atas tumpukan palet'],
    intro: 'Empat palet semen (6 t). Garpu masuk lubang palet dekat lantai, lalu susun di atas tumpukan palet setinggi 1,75 m.',
    layout: () => ({
      load: CARGOS.cement,
      start: { x: -12, z: 30, yaw: 0, y: 0 },
      pad: { x: -30, z: 40, yaw: 0, y: 1.75, w: 2.4, d: 2.4, tolerance: 0.25, yawTol: (6 * Math.PI) / 180, label: 'TUMPUKAN PALET' },
      forklift: { x: -12, z: 42, heading: Math.PI },
      timbers: [],
      supports: [{ ...box('pallets', -30, 40, 2.0, 2.0, 0, 1.75), kind: 'pallets' }],
      cones: [],
    }),
  },
  {
    id: 'trafo',
    title: 'Pasang trafo di pondasi',
    short: 'Trafo',
    cargo: 'trafo',
    steps: ['Angkat trafo dari truk', 'Bawa pelan ke pondasi', 'Letakkan di balok atas pondasi'],
    intro: 'Trafo 21,5 t: hampir kapasitas penuh, pusat berat tinggi dan bergeser. Angkat rendah, tilt mundur, jalan pelan ke pondasi beton.',
    layout: () => ({
      load: CARGOS.trafo,
      start: { ...truckLoad, y: DECK_Y + T },
      pad: { x: -26, z: 34, yaw: 0, y: 0.5 + T, w: 4.6, d: 3.0, tolerance: 0.35, label: 'PONDASI TRAFO' },
      forklift: { x: -3, z: 12, heading: Math.PI },
      // the plinth is a little shallower than the trafo so the mast foot clears its edge
      timbers: [...timbersUnder('truck', -3, 0, 0, [-1.4, 1.4], DECK_Y, 2.3), ...timbersUnder('pad', -26, 34, 0, [-1.4, 1.4], 0.5, 2.2)],
      supports: [{ ...box('plinth', -26, 34, 4.4, 2.2, 0, 0.5), kind: 'plinth' }],
      cones: [],
    }),
  },
  {
    id: 'container',
    title: 'Tumpuk kontainer kosong',
    short: 'Kontainer',
    cargo: 'container',
    steps: ['Lebarkan garpu, masuk fork pocket', 'Bawa ke tumpukan', 'Taruh di atas kontainer bawah'],
    intro: 'Kontainer 20 ft kosong (2,3 t). Lebarkan garpu sampai pas fork pocket (jarak 2050 mm), angkat, lalu tumpuk di atas kontainer lain setinggi 2,59 m.',
    layout: () => ({
      load: CARGOS.container,
      start: { x: 0, z: 30, yaw: 0, y: 0 },
      pad: { x: -16, z: 42, yaw: 0, y: 2.59, w: 6.4, d: 2.8, tolerance: 0.3, yawTol: (4 * Math.PI) / 180, label: '' },
      forklift: { x: 0, z: 20, heading: 0 },
      timbers: [],
      supports: [{ ...box('base-container', -16, 42, 6.06, 2.44, 0, 2.59), kind: 'container' }],
      cones: [],
    }),
  },
  {
    id: 'p2h',
    title: 'P2H: pemeriksaan harian',
    short: 'P2H',
    cargo: 'genset',
    steps: ['Periksa keliling unit', 'Uji klakson, lampu, angin rem', 'Nilai layak / tidak layak'],
    intro: 'Pemeriksaan Pra-Penggunaan Harian (P2H) sebelum unit dipakai. Klik tiap titik periksa di forklift, lihat kondisinya, nilai Layak atau Tidak Layak. Ada 2–3 kerusakan tersembunyi.',
    layout: () => ({ ...JOBS[0].layout(), forklift: { x: -14, z: 20, heading: Math.PI * 0.75 } }),
  },
  {
    id: 'sio',
    title: 'Latihan ujian SIO',
    short: 'Ujian SIO',
    cargo: 'cement',
    steps: ['Angkat palet, slalom 3 cone', 'Letakkan palet di kotak sasaran', 'Mundur lewat lorong, berhenti di kotak finish'],
    intro: 'Latihan ujian praktik Surat Izin Operator: angkat palet, slalom membawa beban, letakkan tepat di kotak, mundur lewat lorong sempit, berhenti di kotak finish. Tiap cone tersenggol mengurangi nilai.',
    placeAfter: 3,
    checkpoints: [
      { x: -20, z: 38, r: 2.6, loaded: true, label: 'Slalom 1 (lewat utara cone)' },
      { x: -10, z: 30, r: 2.6, loaded: true, label: 'Slalom 2 (lewat selatan cone)' },
      { x: 0, z: 38, r: 2.6, loaded: true, label: 'Slalom 3 (lewat utara cone)' },
      { x: 4, z: 46, r: 2.4, dir: 'R', label: 'Lorong mundur 1' },
      { x: -6, z: 46, r: 2.4, dir: 'R', label: 'Lorong mundur 2' },
      { x: -16, z: 46, r: 1.2, stop: true, label: 'Berhenti di kotak finish, garpu turun' },
    ],
    layout: () => {
      const cones: [number, number][] = [
        [-20, 34],
        [-10, 34],
        [0, 34],
      ];
      // corridor edges of the slalom and the narrow reverse lane (4.2 m wide)
      for (let x = -26; x <= 6; x += 4) cones.push([x, 27.5], [x, 40.5]);
      for (let x = 10; x >= -10; x -= 2.5) cones.push([x, 43.9], [x, 48.1]);
      // finish box corners
      cones.push([-18, 44.2], [-14, 44.2], [-18, 47.8], [-14, 47.8]);
      return {
        load: CARGOS.cement,
        start: { x: -30, z: 30, yaw: 0, y: 0 },
        pad: { x: 10, z: 34, yaw: 0, y: 0, w: 2.6, d: 2.6, tolerance: 0.35, yawTol: (8 * Math.PI) / 180, label: 'SASARAN' },
        forklift: { x: -30, z: 40, heading: Math.PI },
        timbers: [],
        supports: [],
        cones,
      };
    },
  },
];

export const JOB: { cur: Job } = { cur: JOBS[0] };

export function setJob(id: JobId) {
  JOB.cur = JOBS.find((j) => j.id === id) ?? JOBS[0];
  applyLayout(JOB.cur.layout());
}

setJob('genset');
