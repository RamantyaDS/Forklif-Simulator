import { useEffect, type PointerEvent as RPointerEvent } from 'react';
import { CAMS, KEYS, PAD_KEYS, bindKeys, pad, toggleEngine, touch } from '../input';
import { Experience } from '../scene/Experience';
import { FpsWarn } from '../scene/FpsWarn';
import { FULL, setQuality } from '../scene/Adaptive';
import { finishP2h, setDir, togglePark, type Assists } from '../sim/forklift';
import { CARGOS } from '../sim/cargo';
import { JOB, JOBS } from '../sim/jobs';
import { P2H_ITEMS } from '../sim/p2h';
import { LOAD, PAD } from '../sim/world';
import { ensureAudio, setSound, soundOn, soundStatus } from '../sound';
import { chooseJob, fk, resetJob, saveAssists, setRain, useUI, type CamMode } from '../store';
import { Dashboard } from './Dashboard';

const CAM_LABEL: Record<CamMode, string> = { chase: 'Belakang', cab: 'Kabin', fork: 'Kamera garpu', orbit: 'Bebas', top: 'Atas' };

const ASSISTS: [keyof Assists, string, string][] = [
  ['sas', 'Sistem stabilitas (SAS)', 'Batasi kecepatan saat garpu tinggi atau forklift mendekati batas, dan bunyikan alarm sebelum terguling.'],
  ['autoAccel', 'Gas otomatis hidrolik', 'Mesin naik putaran sendiri saat mengangkat/tilt sambil berdiri (netral, rem parkir, atau inching).'],
  ['guide', 'Panduan', 'Petunjuk langkah demi langkah dan tanda tinggi garpu.'],
  ['dirGuard', 'Proteksi ganti arah', 'Tolak pindah maju/mundur saat masih melaju.'],
  ['airFull', 'Angin rem penuh saat mulai', 'Lewati menunggu kompresor mengisi tangki angin (berlaku setelah Ulangi).'],
];

/** A button that acts while held (mouse or touch). */
function Hold({ label, on, off, className }: { label: string; on: () => void; off: () => void; className?: string }) {
  const down = (e: RPointerEvent<HTMLButtonElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    on();
  };
  return (
    <button className={className} onPointerDown={down} onPointerUp={off} onPointerCancel={off} onLostPointerCapture={off}>
      {label}
    </button>
  );
}

function Panel() {
  const ui = useUI();
  if (!ui.panel) return null;
  const running = fk.engine === 'running';
  return (
    <aside className="panel">
      <h2>Mesin & rem</h2>
      <button className={`big ${running ? 'warn' : 'ok'}`} onClick={toggleEngine}>
        {fk.engine === 'off' ? '🔑 Hidupkan mesin' : fk.engine === 'starting' ? 'Starter…' : 'Matikan mesin'}
      </button>
      <div className="row">
        {(['F', 'N', 'R'] as const).map((d) => (
          <button key={d} className={fk.dir === d ? 'on' : ''} onClick={() => setDir(fk, d)}>
            {d === 'F' ? 'Maju' : d === 'R' ? 'Mundur' : 'N'}
          </button>
        ))}
      </div>
      <div className="row">
        <button className={fk.park ? 'on danger' : ''} onClick={() => togglePark(fk)}>
          {fk.parkOn ? 'Rem parkir: ON' : 'Rem parkir: lepas'}
        </button>
        <button className={fk.lights ? 'on' : ''} onClick={() => (fk.lights = !fk.lights)}>
          Lampu
        </button>
        <Hold label="Klakson" on={() => (fk.horn = true)} off={() => (fk.horn = false)} />
      </div>

      <h2>Hidrolik (tahan tombol)</h2>
      <div className="grid3">
        <Hold label="▲ Naik" on={() => (touch.lift = 1)} off={() => (touch.lift = 0)} />
        <Hold label="⟲ Tilt mundur" on={() => (touch.tilt = 1)} off={() => (touch.tilt = 0)} />
        <Hold label="↔ Lebar +" on={() => (touch.spread = 1)} off={() => (touch.spread = 0)} />
        <Hold label="▼ Turun" on={() => (touch.lift = -1)} off={() => (touch.lift = 0)} />
        <Hold label="⟳ Tilt maju" on={() => (touch.tilt = -1)} off={() => (touch.tilt = 0)} />
        <Hold label="↔ Lebar −" on={() => (touch.spread = -1)} off={() => (touch.spread = 0)} />
      </div>

      <h2>Bantuan</h2>
      {ASSISTS.map(([k, label, desc]) => (
        <label key={k} className="check" title={desc}>
          <input
            type="checkbox"
            checked={fk.assists[k]}
            onChange={(e) => {
              fk.assists[k] = e.target.checked;
              saveAssists();
              ui.bump();
            }}
          />
          <span>{label}</span>
        </label>
      ))}
      <label className="check">
        <input type="checkbox" checked={ui.overlay} onChange={(e) => ui.set({ overlay: e.target.checked })} />
        <span>Tampilkan segitiga stabilitas (X)</span>
      </label>

      <h2>Kamera</h2>
      <div className="row wrap">
        {CAMS.map((c) => (
          <button key={c} className={ui.cam === c ? 'on' : ''} onClick={() => ui.set({ cam: c })}>
            {CAM_LABEL[c]}
          </button>
        ))}
      </div>
      <div className="row">
        <button className={ui.night ? 'on' : ''} onClick={() => ui.set({ night: !ui.night })}>
          {ui.night ? '🌙 Malam' : '☀ Siang'}
        </button>
        <button className={ui.rain ? 'on' : ''} onClick={() => setRain(!ui.rain)} title="Hujan: lantai licin, rem bisa mengunci, muatan lebih mudah bergeser">
          {ui.rain ? '🌧 Hujan' : '⛅ Cerah'}
        </button>
        <button className={ui.xray ? 'on' : ''} onClick={() => ui.set({ xray: !ui.xray })} title="Lihat aliran oli hidrolik dan angin rem">
          X-ray
        </button>
        <button
          onClick={() => {
            setSound(!soundOn());
            ui.bump();
          }}
        >
          {soundOn() ? '🔊 Suara' : '🔇 Bisu'}
        </button>
        <button onClick={() => ui.set({ help: !ui.help })}>⌨ Tombol</button>
      </div>
      <div className="row">
        <button className={!FULL ? 'on' : ''} onClick={() => FULL && setQuality(false)} title="Resolusi 1×, tanpa ambient occlusion dan bloom: lancar di laptop">
          Grafis ringan
        </button>
        <button className={FULL ? 'on' : ''} onClick={() => !FULL && setQuality(true)} title="Resolusi tinggi, ambient occlusion, bloom, bayangan tajam (halaman dimuat ulang)">
          Mode penuh
        </button>
      </div>
      {ui.started && !soundStatus.ok && soundStatus.text.startsWith('gagal') && <p className="snd bad">Suara: {soundStatus.text}</p>}
    </aside>
  );
}

/** The fork window for getting under the load: fork underside between these heights (m). */
function forkWindow() {
  const c = fk.cargo;
  if (LOAD.lift0 > 0) return [c.y, c.y + LOAD.lift0 - 0.1];
  return [c.y - 0.2, c.y - 0.1];
}

/** What to do next, from the job's phase and the truck's state. */
function hint() {
  const c = fk.cargo;
  const name = LOAD.name.toLowerCase();
  const job = JOB.cur;
  if (fk.phase === 'failed') return fk.tipped ? 'Forklift terguling. Tekan Ulangi.' : c.state === 'falling' || c.state === 'fallen' ? 'Muatan jatuh. Tekan Ulangi.' : 'Gagal. Tekan Ulangi.';
  if (fk.phase === 'p2h') return 'Klik nomor-nomor di forklift, baca kondisinya, nilai Layak atau Tidak Layak. Klakson, lampu dan angin rem perlu mesin hidup.';
  if (fk.engine === 'off') return 'Hidupkan mesin (tuas arah di N).';
  if (fk.parkOn && fk.air < 5.5) return `Tunggu angin rem naik ke 5,5 bar (sekarang ${fk.air.toFixed(1)}), lalu lepas rem parkir (P).`;
  if (fk.parkOn) return 'Lepas rem parkir (P), pilih Maju (Q), lalu gas pelan.';
  if (job.checkpoints && fk.phase !== 'pickup' && fk.phase !== 'done') {
    const cp = job.checkpoints[Math.min(fk.cp, job.checkpoints.length - 1)];
    if (fk.cp < (job.placeAfter ?? 0) && c.state === 'forks') return `Ikuti lingkaran hijau: ${cp.label}. Garpu rendah (±30 cm), jangan senggol cone.`;
    if (fk.cp < (job.placeAfter ?? 0) && c.state === 'forks') return '';
    if (fk.phase === 'course' || fk.placed) return cp.dir === 'R' ? `Pilih MUNDUR (Z), lewati lorong cone: ${cp.label}. Lihat ke belakang, pelan.` : `${cp.label}: berhenti di dalam kotak, garpu di bawah 40 cm.`;
  }
  if (fk.phase === 'pickup') {
    const [lo, hi] = forkWindow();
    const fork = fk.lift;
    if (LOAD.pockets && Math.abs(fk.spread - (LOAD.pockets.c * 2 + 0.31)) > 0.1) return `Lebarkan garpu sampai ±${(LOAD.pockets.c * 2 + 0.31).toFixed(2)} m (sekarang ${fk.spread.toFixed(2)} m) supaya pas lubang fork pocket.`;
    if (fork < lo - 0.005 || fork > hi + 0.005) return `Atur tinggi garpu: bagian bawah garpu antara ${lo.toFixed(2)} dan ${hi.toFixed(2)} m (sekarang ${fork.toFixed(2)} m)${LOAD.lift0 ? ' supaya masuk lubang' : ', di atas alas dan di bawah rangka muatan'}.`;
    if (LOAD.id === 'coil' && fk.spread > 1.05) return 'Sempitkan garpu (Lebar −) supaya muat di antara dua balok di bawah coil.';
    return `Tinggi garpu pas. Masukkan garpu pelan-pelan, pusatkan di bawah ${name} (tanda titik berat bila ada), lalu angkat (R).`;
  }
  if (fk.phase === 'carry' && c.state === 'forks') {
    if (fk.tilt < 0.05) return `Tilt mundur (T) supaya ${name} bersandar ke carriage. Mundur pelan.`;
    if (fk.lift > 0.6 + (PAD.y > 1 ? 0 : 0) && Math.abs(fk.v) > 0.3 && Math.hypot(fk.x - PAD.x, fk.z - PAD.z) > 12) return 'Turunkan garpu ke ±30 cm sebelum berjalan jauh: pusat berat rendah = stabil.';
    if (PAD.y > 0.5 && Math.hypot(fk.x - PAD.x, fk.z - PAD.z) < 9) return `Berhenti, angkat sampai bawah muatan di atas ${PAD.y.toFixed(2)} m, maju pelan, luruskan, lalu turunkan (F). Ikuti isyarat spotter.`;
    return job.id === 'pipes' ? 'Bawa ke truk. Garpu harus masuk dalam: tiang tidak bisa melewati tepi bak, jadi bundel harus di tengah garpu.' : 'Bawa ke tempat sasaran (panah kuning), luruskan, lalu turunkan pelan (F). Ikuti isyarat spotter.';
  }
  if (fk.phase === 'place') return 'Muatan sudah turun. Tilt maju sedikit, lalu mundur pelan sampai garpu keluar.';
  return '';
}

function JobPicker() {
  const ui = useUI();
  if (!ui.jobs) return null;
  return (
    <div className="jobs" role="dialog" aria-label="Pilih misi">
      <button className="x" onClick={() => ui.set({ jobs: false })} aria-label="Tutup">
        ×
      </button>
      <h2>Pilih misi</h2>
      <div className="jobgrid">
        {JOBS.map((j) => {
          const c = CARGOS[j.cargo];
          return (
            <button key={j.id} className={`jobcard${JOB.cur.id === j.id ? ' on' : ''}`} onClick={() => chooseJob(j.id)}>
              <b>{j.title}</b>
              {j.id !== 'p2h' && (
                <span className="tag">
                  {c.name} · {(c.mass / 1000).toFixed(1).replace('.', ',')} t
                </span>
              )}
              <span>{j.intro}</span>
            </button>
          );
        })}
      </div>
      <p className="dim">Cuaca (hujan) dan malam bisa diatur di panel kiri, berlaku untuk semua misi.</p>
    </div>
  );
}

function Mission() {
  useUI((s) => s.tick);
  const show = fk.assists.guide;
  const job = JOB.cur;
  const steps = job.steps;
  const idx = fk.phase === 'p2h' ? 0 : fk.phase === 'course' ? 2 : ['pickup', 'carry', 'place', 'done'].indexOf(fk.phase);
  const m = Math.floor(fk.time / 60);
  const sec = Math.floor(fk.time % 60);
  const answered = P2H_ITEMS.filter((i) => fk.answers[i.id]).length;
  return (
    <section className="mission" aria-label="Tugas">
      <header>
        <b>{job.title}</b>
        <span>
          {m}:{String(sec).padStart(2, '0')}
        </span>
      </header>
      <ol>
        {steps.map((label, i) => (
          <li key={label} className={i < idx || fk.phase === 'done' ? 'done' : i === idx ? 'now' : ''}>
            {label}
          </li>
        ))}
      </ol>
      {job.checkpoints && (
        <div className="cps">
          {job.checkpoints.map((c, i) => (
            <span key={i} className={i < fk.cp ? 'done' : i === fk.cp ? 'now' : ''} title={c.label}>
              {i + 1}
            </span>
          ))}
        </div>
      )}
      <div className="mstats">
        {fk.phase === 'p2h' ? (
          <span>
            Diperiksa {answered}/{P2H_ITEMS.length}
          </span>
        ) : (
          <>
            <span>{LOAD.name}</span>
            <span>Tabrakan {fk.bumps}</span>
            {job.checkpoints && <span>Cone {fk.cones}</span>}
            <span>Kerusakan {Math.round(fk.damage)}%</span>
            <span>Stabilitas terburuk {Math.round(fk.maxRisk * 100)}%</span>
          </>
        )}
      </div>
      {show && <p className="hint">{hint()}</p>}
      <div className="row">
        <button className="small" onClick={resetJob}>
          ↺ Ulangi
        </button>
        <button className="small" onClick={() => useUI.getState().set({ jobs: true })}>
          ☰ Pilih misi
        </button>
        {fk.phase === 'p2h' && (
          <button className="small ok" disabled={answered < P2H_ITEMS.length} onClick={() => finishP2h(fk, P2H_ITEMS.map((i) => i.id))}>
            ✓ Selesai periksa
          </button>
        )}
      </div>
    </section>
  );
}

/** P2H: what the operator finds at the selected point, and the verdict buttons. */
function P2hCard() {
  const ui = useUI();
  const it = P2H_ITEMS.find((i) => i.id === ui.p2hOpen);
  if (!it || fk.phase !== 'p2h') return null;
  const bad = fk.defects.includes(it.id);
  let finding = bad ? it.bad : it.ok;
  if (it.needs === 'engine' && fk.engine !== 'running') finding = 'Perlu mesin hidup untuk diperiksa (tombol Hidupkan mesin).';
  if (it.id === 'horn' && fk.engine === 'running') finding = fk.horn ? (bad ? 'Ditekan… tidak ada suara.' : 'TEEET! Klakson bunyi keras.') : 'Tekan dan tahan Klakson (B) untuk menguji.';
  if (it.id === 'lamp' && !fk.lights) finding = 'Nyalakan Lampu dulu (tombol Lampu / tombol L).';
  if (it.id === 'air' && fk.engine === 'running') finding = `Manometer angin: ${fk.air.toFixed(1)} bar. ${fk.air >= 8.2 ? 'Kompresor berhenti di 8,3 bar.' : 'Tunggu jarum naik… (perlu ±1 menit; normal sampai 8,3 bar).'}`;
  const set = (v: 'ok' | 'bad') => {
    fk.answers[it.id] = v;
    const next = P2H_ITEMS.find((i) => !fk.answers[i.id]);
    ui.set({ p2hOpen: next ? next.id : '' });
  };
  return (
    <div className="p2hcard" role="dialog" aria-label={it.label}>
      <button className="x" onClick={() => ui.set({ p2hOpen: '' })} aria-label="Tutup">
        ×
      </button>
      <h3>
        {P2H_ITEMS.indexOf(it) + 1}. {it.label}
      </h3>
      <p>{finding}</p>
      <div className="row">
        <button className={fk.answers[it.id] === 'ok' ? 'on' : ''} onClick={() => set('ok')}>
          ✓ Layak
        </button>
        <button className={fk.answers[it.id] === 'bad' ? 'on danger' : ''} onClick={() => set('bad')}>
          ✗ Tidak layak
        </button>
      </div>
    </div>
  );
}

function Result() {
  useUI((s) => s.tick);
  const r = fk.result;
  if (fk.phase !== 'done' || !r) return null;
  const job = JOB.cur;
  return (
    <div className="result" role="dialog" aria-label="Hasil">
      <h2>{'★'.repeat(r.stars) + '☆'.repeat(3 - r.stars)}</h2>
      {job.id === 'p2h' ? (
        <>
          <p>
            Nilai P2H: <b>{r.score}</b> / 100. Kerusakan tersembunyi: {fk.defects.map((d) => P2H_ITEMS.find((i) => i.id === d)?.label).join(', ')}.
          </p>
          {r.notes && r.notes.length > 0 ? (
            <ul>
              {r.notes.map((id) => {
                const it = P2H_ITEMS.find((i) => i.id === id)!;
                const bad = fk.defects.includes(id);
                return (
                  <li key={id}>
                    <b>{it.label}</b>: {bad ? `seharusnya TIDAK LAYAK. ${it.bad}` : 'kondisinya baik, seharusnya Layak.'}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p>Semua penilaian benar. Unit dengan kerusakan tidak boleh dioperasikan sampai diperbaiki dan dilaporkan ke mekanik.</p>
          )}
        </>
      ) : (
        <>
          <p>{job.checkpoints ? `Nilai ujian: ${r.score} / 100 (lulus ≥ 70)` : `${LOAD.name} terpasang di tempat tujuan.`}</p>
          <ul>
            <li>
              Meleset dari tengah sasaran: <b>{Math.round(r.dist * 100)} cm</b>
            </li>
            <li>
              Selisih arah: <b>{((r.yaw * 180) / Math.PI).toFixed(1)}°</b>
            </li>
            <li>
              Waktu: <b>{Math.floor(fk.time / 60)} menit {Math.floor(fk.time % 60)} detik</b>
            </li>
            <li>
              Tabrakan {fk.bumps}
              {job.checkpoints ? ` · cone tersenggol ${fk.cones}` : ''} · kerusakan {Math.round(fk.damage)}% · stabilitas terburuk {Math.round(fk.maxRisk * 100)}%
            </li>
          </ul>
        </>
      )}
      <div className="row">
        <button className="big ok" onClick={resetJob}>
          Main lagi
        </button>
        <button className="big" onClick={() => useUI.getState().set({ jobs: true })}>
          Misi lain
        </button>
      </div>
    </div>
  );
}

function Toast() {
  const { toast, toastUntil } = useUI();
  useUI((s) => s.tick);
  if (!toast || performance.now() > toastUntil) return null;
  return (
    <div className="toast" role="status">
      {toast}
    </div>
  );
}

function Help() {
  const ui = useUI();
  if (!ui.help) return null;
  return (
    <div className="help" role="dialog" aria-label="Tombol">
      <button className="x" onClick={() => ui.set({ help: false })} aria-label="Tutup">
        ×
      </button>
      <h3>Keyboard & mouse</h3>
      <dl>
        {KEYS.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <h3>Gamepad {pad.connected ? '(terhubung)' : '(colok lalu tekan tombol apa saja)'}</h3>
      <dl>
        {PAD_KEYS.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <p className="credit">
        Data: datasheet Toyota 4FD150–230 dan halaman Traknus 4FD240. Suara: rekaman diesel John Deere 5820 dan pompa hidrolik Komatsu 941 oleh Work With Sounds /
        Werstas (CC BY 4.0), start mesin bus diesel oleh Evan0512 (CC BY-SA 4.0), dari Wikimedia Commons; mesin 6 silinder Hino disintesis.
      </p>
    </div>
  );
}

/** Phone controls: steering pad and pedals at the bottom, hydraulics and direction on the right. */
function Touch() {
  const steer = (e: RPointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    touch.steer = Math.max(-1, Math.min(1, -((e.clientX - r.left) / r.width - 0.5) * 2.2));
  };
  const hold = (k: 'gas' | 'brake' | 'inch' | 'lift' | 'tilt', v: number) => ({
    onPointerDown: (e: RPointerEvent<HTMLButtonElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      touch[k] = v;
    },
    onPointerUp: () => (touch[k] = 0),
    onPointerCancel: () => (touch[k] = 0),
    onLostPointerCapture: () => (touch[k] = 0),
  });
  return (
    <div className="touch">
      <div
        className="steerpad"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          steer(e);
        }}
        onPointerMove={(e) => e.buttons && steer(e)}
        onPointerUp={() => (touch.steer = 0)}
        onPointerCancel={() => (touch.steer = 0)}
      >
        ◀ setir ▶
      </div>
      <div className="tpad">
        <div className="tdir">
          {(['F', 'N', 'R'] as const).map((d) => (
            <button key={d} className={fk.dir === d ? 'on' : ''} onClick={() => setDir(fk, d)}>
              {d === 'F' ? 'MAJU' : d === 'R' ? 'MUNDUR' : 'N'}
            </button>
          ))}
        </div>
        <div className="thyd">
          <button {...hold('lift', 1)}>▲</button>
          <button {...hold('tilt', 1)}>⟲</button>
          <button {...hold('lift', -1)}>▼</button>
          <button {...hold('tilt', -1)}>⟳</button>
        </div>
        <div className="tped">
          <button {...hold('inch', 1)}>Inch</button>
          <button {...hold('brake', 1)}>Rem</button>
          <button className="gas" {...hold('gas', 1)}>
            Gas
          </button>
        </div>
      </div>
    </div>
  );
}

export function App() {
  const started = useUI((s) => s.started);
  useEffect(() => bindKeys(), []);
  return (
    <>
      <Experience />
      <FpsWarn />
      <Hud />
      {!started && <Intro />}
    </>
  );
}

/** Everything on screen over the 3D view; the Traknus World shows this while the player drives the forklift. */
export function Hud() {
  const panel = useUI((s) => s.panel);
  return (
    <>
      <header className="brand">
        <button className="menu" onClick={() => useUI.getState().set({ panel: !panel })} aria-label={panel ? 'Sembunyikan panel' : 'Tampilkan panel'}>
          {panel ? '◀' : '☰'}
        </button>
        <div>
          <h1>Toyota 4FD240</h1>
          <p>Simulator forklift 24 ton · pelabuhan</p>
        </div>
      </header>
      <Panel />
      <Mission />
      <Dashboard />
      <Toast />
      <Help />
      <Touch />
      <Result />
      <JobPicker />
      <P2hCard />
    </>
  );
}

function Intro() {
  return (
    <div className="intro">
      <div>
        <h1>Simulator Forklift Toyota 4FD240</h1>
        <p>
          Forklift diesel 24 ton (Hino 159 kW, torque converter, rem angin, garpu 2,44 m) di pelabuhan yang hidup: pekerja lalu-lalang, terminal tractor,
          spotter memberi isyarat. Tujuh muatan (genset, coil baja, pipa, kayu, palet semen, trafo, kontainer), pemeriksaan harian P2H dan latihan ujian SIO.
          Jangan menabrak, menjatuhkan muatan, atau terguling.
        </p>
        <ol>
          <li>Hidupkan mesin (tuas arah di N), tunggu angin rem naik, lepas rem parkir.</li>
          <li>Atur tinggi dan lebar garpu sesuai muatan, masukkan pelan, angkat, tilt mundur.</li>
          <li>Bawa dengan garpu rendah, letakkan di sasaran (ikuti isyarat spotter), lalu keluarkan garpu.</li>
          <li>Ganti misi lewat tombol “Pilih misi”. Hujan, malam dan X-ray ada di panel kiri.</li>
        </ol>
        <p className="dim">Keyboard + mouse, gamepad, atau layar sentuh. Garis segitiga di tanah menunjukkan batas stabilitas.</p>
        <button
          className="big ok"
          onClick={() => {
            void ensureAudio();
            useUI.getState().set({ started: true });
          }}
        >
          Mulai (suara aktif)
        </button>
      </div>
    </div>
  );
}
