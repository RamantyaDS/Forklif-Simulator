// The 4FD240's integrated monitor, drawn as an overlay: tachometer, speed, direction and gear, brake air pressure,
// fuel and coolant, the datasheet's warning lamps; plus a load panel (weight from lift pressure, load centre against
// the load chart, fork height and tilt) and the stability triangle with the projected centre of mass.
import { TRIANGLE, cgOnForks } from '../sim/forklift';
import { SPEC, capacityAt } from '../sim/spec';
import { GENSET } from '../sim/world';
import { fk, useUI } from '../store';

function Gauge({ value, max, label, unit, red, low, size = 112, ticks = 5, fmt = (v: number) => `${Math.round(v)}` }: { value: number; max: number; label: string; unit: string; red?: number; low?: number; size?: number; ticks?: number; fmt?: (v: number) => string }) {
  const a0 = -220;
  const a1 = 40;
  const ang = (v: number) => ((a0 + (a1 - a0) * Math.max(0, Math.min(1, v / max))) * Math.PI) / 180;
  const pt = (v: number, r: number) => [60 + Math.cos(ang(v)) * r, 60 + Math.sin(ang(v)) * r];
  const arc = (v0: number, v1: number, r: number) => {
    const [x0, y0] = pt(v0, r);
    const [x1, y1] = pt(v1, r);
    const large = ang(v1) - ang(v0) > Math.PI ? 1 : 0;
    return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`;
  };
  const [nx, ny] = pt(value, 44);
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} className="gauge" role="img" aria-label={`${label} ${fmt(value)} ${unit}`}>
      <circle cx="60" cy="60" r="57" fill="#0d1013" stroke="#2c3036" strokeWidth="3" />
      {red !== undefined && <path d={arc(red, max, 50)} stroke="#e0533c" strokeWidth="5" fill="none" />}
      {low !== undefined && <path d={arc(0, low, 50)} stroke="#e0533c" strokeWidth="5" fill="none" />}
      {low !== undefined && <path d={arc(low, max, 50)} stroke="#2fb36b" strokeWidth="5" fill="none" />}
      {Array.from({ length: ticks * 2 + 1 }, (_, i) => {
        const v = (max * i) / (ticks * 2);
        const [x1, y1] = pt(v, i % 2 ? 47 : 43);
        const [x2, y2] = pt(v, 52);
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#d8dde2" strokeWidth={i % 2 ? 1 : 2} />;
      })}
      {Array.from({ length: ticks + 1 }, (_, i) => {
        const v = (max * i) / ticks;
        const [x, y] = pt(v, 34);
        return (
          <text key={i} x={x} y={y + 3} fill="#d8dde2" fontSize="8" textAnchor="middle">
            {fmt(v)}
          </text>
        );
      })}
      <text x="60" y="84" fill="#8b949c" fontSize="7" textAnchor="middle">
        {unit}
      </text>
      <text x="60" y="98" fill="#e7edf1" fontSize="9" textAnchor="middle">
        {label}
      </text>
      <line x1="60" y1="60" x2={nx} y2={ny} stroke="#ff5a2a" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="60" cy="60" r="4" fill="#333" />
    </svg>
  );
}

function Lamp({ on, color, label, title }: { on: boolean; color: string; label: string; title: string }) {
  return (
    <span className={`lamp ${on ? 'on' : ''}`} style={{ ['--c' as string]: color }} title={title}>
      {label}
    </span>
  );
}

function Bar({ v, label, text, color }: { v: number; label: string; text: string; color?: string }) {
  return (
    <div className="bar">
      <small>{label}</small>
      <i>
        <span style={{ width: `${Math.max(0, Math.min(1, v)) * 100}%`, background: color }} />
      </i>
      <em>{text}</em>
    </div>
  );
}

/** Plan view of the stability triangle with the projected centre of mass, in the truck's frame (forks up). */
function Triangle() {
  const sc = 17;
  const tx = (x: number) => 60 - x * sc;
  const ty = (z: number) => 16 - z * sc;
  const pts = TRIANGLE.map(([x, z]) => `${tx(x)},${ty(z)}`).join(' ');
  const r = Math.min(1, fk.risk);
  const col = r < 0.5 ? '#2fd27a' : r < 0.8 ? '#ffc21a' : '#ff3b2f';
  return (
    <svg viewBox="0 0 120 120" width="104" height="104" className="tri" role="img" aria-label={`Stabilitas: ${Math.round(r * 100)}% menuju batas`}>
      {/* truck outline */}
      <rect x={tx(SPEC.width / 2)} y={ty(0.6)} width={SPEC.width * sc} height={(SPEC.wheelbase + SPEC.rearOverhang + 0.6) * sc} rx="6" fill="none" stroke="#3a434b" />
      {/* front axle */}
      <line x1={tx(1.5)} y1={ty(0)} x2={tx(-1.5)} y2={ty(0)} stroke="#58626b" strokeWidth="2" />
      <polygon points={pts} fill={col} fillOpacity="0.18" stroke={col} strokeWidth="1.5" />
      <circle cx={tx(fk.proj.x)} cy={ty(fk.proj.z)} r="4.5" fill={col} stroke="#000" strokeWidth="0.8" />
      <text x="60" y="117" fill="#93a2ad" fontSize="8" textAnchor="middle">
        segitiga stabilitas
      </text>
    </svg>
  );
}

export function Dashboard() {
  useUI((s) => s.tick);
  const dir = fk.dir === 'F' ? 'MAJU' : fk.dir === 'R' ? 'MUNDUR' : 'NETRAL';
  const kg = Math.max(0, (fk.pressure * 1e5 * SPEC.liftArea) / 2 / 9.81 - SPEC.carriageMass);
  const loaded = fk.cargo.state === 'forks';
  const centre = loaded ? Math.max(0, cgOnForks(fk).a) : 0;
  const cap = capacityAt(centre);
  const use = loaded ? GENSET.mass / cap : 0;
  const running = fk.engine === 'running';
  const tiltDeg = (fk.tilt * 180) / Math.PI;
  return (
    <div className="dash" aria-label="Dashboard">
      <Gauge value={fk.rpm / 100} max={30} label="mesin" unit="×100 rpm" red={24.5} ticks={6} />
      <div className="dash-mid">
        <div className="speed">
          <b>{Math.abs(fk.v * 3.6).toFixed(0)}</b>
          <span>km/j</span>
        </div>
        <div className={`dir dir-${fk.dir}`}>
          {dir}
          {fk.dir === 'F' ? ` · ${fk.gear}` : ''}
        </div>
        <div className="lamps">
          <Lamp on={fk.parkOn} color="#ff3b2f" label="P" title="Rem parkir" />
          <Lamp on={fk.air < 5.5} color="#ff3b2f" label="UDARA" title="Tekanan angin rem rendah" />
          <Lamp on={fk.engine !== 'off' && !running} color="#ffc21a" label="PANAS" title="Pre-heat (quick glow)" />
          <Lamp on={!running && fk.engine === 'off'} color="#ff3b2f" label="OLI" title="Tekanan oli mesin" />
          <Lamp on={!running && fk.engine === 'off'} color="#ff3b2f" label="AKI" title="Pengisian aki" />
          <Lamp on={fk.coolant > 100} color="#ff3b2f" label="SUHU" title="Suhu air mesin" />
          <Lamp on={fk.fuel < 40} color="#ffc21a" label="BBM" title="Solar hampir habis" />
          <Lamp on={fk.assists.sas && fk.risk > 0.8} color="#ff3b2f" label="SAS" title="Sistem stabilitas: mendekati batas" />
          <Lamp on={fk.lights} color="#2fd27a" label="LAMPU" title="Lampu kerja" />
        </div>
      </div>
      <Gauge value={fk.air} max={10} label="angin rem" unit="bar" low={5.5} ticks={5} size={96} fmt={(v) => v.toFixed(0)} />
      <div className="dash-bars">
        <Bar v={fk.fuel / SPEC.fuelL} label="Solar" text={`${Math.round(fk.fuel)} L`} />
        <Bar v={(fk.coolant - 30) / 80} label="Suhu air" text={`${Math.round(fk.coolant)} °C`} color={fk.coolant > 100 ? '#e0533c' : undefined} />
        <Bar v={fk.load} label="Beban mesin" text={`${Math.round(fk.load * 100)}%`} />
        <small className="hm">{fk.hours.toFixed(1)} jam</small>
      </div>
      <div className="dash-load">
        <div className="weigh">
          <span>Timbangan garpu</span>
          <b>{(kg / 1000).toFixed(1)} t</b>
          <small>{Math.round(fk.pressure)} bar</small>
        </div>
        <Bar v={use} label="Load chart" text={loaded ? `${Math.round(use * 100)}% dari ${(cap / 1000).toFixed(1)} t @ ${Math.round(centre * 1000)} mm` : 'garpu kosong'} color={use > 1 ? '#e0533c' : use > 0.85 ? '#ffc21a' : undefined} />
        <div className="mast-info">
          <span>
            Tinggi garpu <b>{(fk.lift + SPEC.forkT).toFixed(2)} m</b>
          </span>
          <span>
            Tilt <b>{tiltDeg >= 0 ? `${tiltDeg.toFixed(1)}° mundur` : `${(-tiltDeg).toFixed(1)}° maju`}</b>
          </span>
          <span>
            Lebar garpu <b>{fk.spread.toFixed(2)} m</b>
          </span>
        </div>
      </div>
      <Triangle />
    </div>
  );
}
