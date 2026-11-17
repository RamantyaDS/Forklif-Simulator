import { useEffect, type PointerEvent as RPointerEvent } from 'react';
import { CAMS, KEYS, PAD_KEYS, bindKeys, pad, toggleEngine, touch } from '../input';
import { Experience } from '../scene/Experience';
import { setDir, togglePark, type Assists } from '../sim/forklift';
import { ensureAudio, setSound, soundOn, soundStatus } from '../sound';
import { fk, resetJob, saveAssists, useUI, type CamMode } from '../store';
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
      {ui.started && !soundStatus.ok && soundStatus.text.startsWith('gagal') && <p className="snd bad">Suara: {soundStatus.text}</p>}
    </aside>
  );
}

/** What to do next, from the job's phase and the truck's state. */
function hint() {
  const c = fk.cargo;
  if (fk.phase === 'failed') return fk.tipped ? 'Forklift terguling. Tekan Ulangi.' : 'Genset jatuh. Tekan Ulangi.';
  if (fk.engine === 'off') return 'Hidupkan mesin (tuas arah di N).';
  if (fk.parkOn && fk.air < 5.5) return `Tunggu angin rem naik ke 5,5 bar (sekarang ${fk.air.toFixed(1)}), lalu lepas rem parkir (P).`;
  if (fk.parkOn) return 'Lepas rem parkir (P), pilih Maju (Q), lalu gas pelan.';
  if (fk.phase === 'pickup') {
    const fork = fk.lift + 0.1;
    if (fork < 1.55 || fork > 1.75) return 'Dekati sisi truk. Atur tinggi garpu ±1,6 m: di atas lantai bak (1,55 m) dan di bawah rangka genset (1,75 m).';
    return 'Tinggi garpu pas. Masukkan garpu pelan-pelan di antara balok kayu, pusatkan di bawah titik berat (tanda kuning), lalu angkat (R).';
  }
  if (fk.phase === 'carry' && c.state === 'forks') {
    if (fk.tilt < 0.05) return 'Tilt mundur (T) supaya genset bersandar ke carriage. Mundur pelan dari truk.';
    if (fk.lift > 0.6 && Math.abs(fk.v) > 0.3) return 'Turunkan garpu ke ±30 cm sebelum berjalan jauh: pusat berat rendah = stabil.';
    return 'Bawa ke bantalan bermarka kuning (AREA LETAK GENSET), luruskan, lalu turunkan pelan (F).';
  }
  if (fk.phase === 'place') return 'Genset sudah turun. Tilt maju sedikit, lalu mundur pelan sampai garpu keluar dari bawah genset.';
  return '';
}

function Mission() {
  useUI((s) => s.tick);
  const show = fk.assists.guide;
  const steps = [
    ['pickup', 'Angkat genset dari truk'],
    ['carry', 'Bawa ke area letak'],
    ['place', 'Letakkan di bantalan & lepas garpu'],
  ];
  const idx = ['pickup', 'carry', 'place', 'done'].indexOf(fk.phase);
  const m = Math.floor(fk.time / 60);
  const sec = Math.floor(fk.time % 60);
  return (
    <section className="mission" aria-label="Tugas">
      <header>
        <b>Tugas: turunkan genset 2250 kVA</b>
        <span>
          {m}:{String(sec).padStart(2, '0')}
        </span>
      </header>
      <ol>
        {steps.map(([k, label], i) => (
          <li key={k} className={i < idx || fk.phase === 'done' ? 'done' : i === idx ? 'now' : ''}>
            {label}
          </li>
        ))}
      </ol>
      <div className="mstats">
        <span>Tabrakan {fk.bumps}</span>
        <span>Kerusakan {Math.round(fk.damage)}%</span>
        <span>Stabilitas terburuk {Math.round(fk.maxRisk * 100)}%</span>
      </div>
      {show && <p className="hint">{hint()}</p>}
      <button className="small" onClick={resetJob}>
        ↺ Ulangi
      </button>
    </section>
  );
}

function Result() {
  useUI((s) => s.tick);
  const r = fk.result;
  if (fk.phase !== 'done' || !r) return null;
  return (
    <div className="result" role="dialog" aria-label="Hasil">
      <h2>{'★'.repeat(r.stars) + '☆'.repeat(3 - r.stars)}</h2>
      <p>Genset terpasang di area letak.</p>
      <ul>
        <li>
          Meleset dari tengah bantalan: <b>{Math.round(r.dist * 100)} cm</b>
        </li>
        <li>
          Selisih arah: <b>{((r.yaw * 180) / Math.PI).toFixed(1)}°</b>
        </li>
        <li>
          Waktu: <b>{Math.floor(fk.time / 60)} menit {Math.floor(fk.time % 60)} detik</b>
        </li>
        <li>
          Tabrakan {fk.bumps} · kerusakan {Math.round(fk.damage)}% · stabilitas terburuk {Math.round(fk.maxRisk * 100)}%
        </li>
      </ul>
      <button className="big ok" onClick={resetJob}>
        Main lagi
      </button>
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
  const panel = useUI((s) => s.panel);
  useEffect(() => bindKeys(), []);
  return (
    <>
      <Experience />
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
      {!started && (
        <div className="intro">
          <div>
            <h1>Simulator Forklift Toyota 4FD240</h1>
            <p>
              Forklift diesel 24 ton (Hino 159 kW, torque converter, rem angin, garpu 2,44 m) di pelabuhan. Tugasnya: turunkan genset Traknus 2250 kVA seberat 14,8 ton
              dari truk flatbed dan letakkan di area yang ditandai, tanpa menabrak, tanpa menjatuhkan, dan tanpa terguling.
            </p>
            <ol>
              <li>Hidupkan mesin (tuas arah di N), tunggu angin rem naik, lepas rem parkir.</li>
              <li>Atur tinggi garpu di antara lantai bak dan rangka genset, masukkan pelan, angkat, tilt mundur.</li>
              <li>Bawa dengan garpu rendah, letakkan di atas balok kayu, lalu keluarkan garpu.</li>
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
      )}
    </>
  );
}
