import React from 'react';
import { createRoot } from 'react-dom/client';
import { Activity, ArrowUpRight, Gauge, Medal, Route, ShieldCheck, Target, TrendingUp, Zap } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import './styles.css';

const metrics = {
  career: {
    games: 117,
    pa: 259,
    runs: 52,
    rbi: 33,
    walks: 52,
    hbp: 8,
    stolenBases: 26,
    caughtStealing: 7,
    sbSuccess: 78.79,
    avg: 0.198,
    obp: 0.385,
    slg: 0.223,
    ops: 0.609,
    hits: 39,
    singles: 34,
    doubles: 5,
    triples: 0,
    homeRuns: 0,
    strikeouts: 88,
    strikeoutsLooking: 25,
  },
  spring2026: {
    games: 26,
    pa: 77,
    avg: 0.175,
    obp: 0.382,
    walks: 18,
    runs: 10,
    rbi: 9,
    stolenBases: 7,
    caughtStealing: 1,
    sbSuccess: 87.5,
  },
  summer2025: {
    games: 16,
    avg: 0.36,
    obp: 0.484,
    slg: 0.4,
    ops: 0.884,
    hits: 9,
    rbi: 7,
    runs: 9,
    stolenBases: 5,
  },
  pitchingCareer: {
    innings: 39.1,
    battersFaced: 242,
    pitchesPerInning: 21.2,
    pitchesPerBf: 3.45,
    strikeRate: 52.1,
    firstPitchStrike: 49.59,
    weakContact: 64.6,
    groundBall: 48.41,
    hardHit: 35.4,
    fip: 6.562,
    homeRunsAllowed: 4,
    babip: 0.382,
    baRisp: 0.408,
  },
  pitchingSpring2026: {
    innings: 14.1,
    battersFaced: 81,
    pitchesPerInning: 18.4,
    strikeRate: 53.41,
    bbPerInning: 0.558,
    weakContact: 72.22,
    groundBall: 52.94,
    fip: 5.92,
  },
};

const priorityCards = [
  {
    icon: Target,
    title: 'Overall Coach Takeaway',
    body: 'KG creates value by reaching base, running aggressively, scoring runs, drawing walks, applying pressure, providing pitching depth, and generating weak contact as a pitcher.',
  },
  {
    icon: ArrowUpRight,
    title: 'Next Level Comes From',
    body: 'Reduce strikeouts, raise batting average through more balls in play, add doubles and gap power, improve first-pitch strike rate, lower walks per inning, and develop a put-away pitch.',
  },
  {
    icon: ShieldCheck,
    title: 'Final Profile Statement',
    body: 'A disciplined, speed-first athlete with strong on-base instincts and developing two-way value. The clearest jump comes from plate-contact consistency and sharper mound command.',
  },
];

const offensiveBars = [
  { name: 'AVG', value: 198, label: '.198' },
  { name: 'OBP', value: 385, label: '.385' },
  { name: 'SLG', value: 223, label: '.223' },
  { name: 'OPS', value: 609, label: '.609' },
];

const sampleComparison = [
  { name: 'Career AVG', value: 198 },
  { name: 'Summer AVG', value: 360 },
  { name: 'Career OBP', value: 385 },
  { name: 'Summer OBP', value: 484 },
  { name: 'Career OPS', value: 609 },
  { name: 'Summer OPS', value: 884 },
];

const pitchTrend = [
  { name: 'Strike %', Career: 52.1, 'Spring 2026': 53.41 },
  { name: 'Weak Contact %', Career: 64.6, 'Spring 2026': 72.22 },
  { name: 'Ground Ball %', Career: 48.41, 'Spring 2026': 52.94 },
];

const developmentData = [
  { name: 'Contact', value: 88, detail: '88 career strikeouts' },
  { name: 'Looking Ks', value: 25, detail: '25 looking strikeouts' },
  { name: 'Gap Power', value: 5, detail: '5 doubles, no triples/HR' },
  { name: '1st Pitch', value: 49.59, detail: '49.59% first-pitch strike' },
  { name: 'Command', value: 55.8, detail: '.558 BB/INN in Spring 2026' },
];

function StatCard({ label, value, note, icon: Icon }) {
  return (
    <article className="stat-card">
      <div className="stat-topline">
        <span>{label}</span>
        <Icon size={18} />
      </div>
      <strong>{value}</strong>
      <p>{note}</p>
    </article>
  );
}

function PriorityCard({ icon: Icon, title, body }) {
  return (
    <article className="priority-card">
      <div className="priority-icon"><Icon size={22} /></div>
      <div>
        <h3>{title}</h3>
        <p>{body}</p>
      </div>
    </article>
  );
}

function Progress({ label, value, max = 100, note }) {
  return (
    <div className="progress-row">
      <div className="progress-label"><span>{label}</span><strong>{value}%</strong></div>
      <div className="progress-track"><div style={{ width: `${Math.min(value / max * 100, 100)}%` }} /></div>
      {note && <small>{note}</small>}
    </div>
  );
}

function App() {
  const sbRadial = [{ name: 'Career SB Success', value: metrics.career.sbSuccess, fill: '#38bdf8' }];
  const sb2026Radial = [{ name: '2026 SB Success', value: metrics.spring2026.sbSuccess, fill: '#22c55e' }];

  return (
    <main>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Player Development Dashboard</p>
          <h1>Kaden “KG” Green</h1>
          <p className="hero-text">On-base, speed, utility athlete with developing two-way value. This dashboard leads with the coach-facing takeaways first, then drills into offensive, baserunning, and pitching evidence.</p>
        </div>
        <div className="hero-panel">
          <span>Career Slash</span>
          <strong>.198 / .385 / .223</strong>
          <p>.609 OPS with a strong AVG-to-OBP separation driven by discipline and free bases.</p>
        </div>
      </section>

      <section className="priority-grid">
        {priorityCards.map((card) => <PriorityCard key={card.title} {...card} />)}
      </section>

      <section className="stats-grid">
        <StatCard label="Career Games" value="117" note="Broad sample across offensive and utility usage" icon={Medal} />
        <StatCard label="Plate Appearances" value="259" note="52 walks and 8 HBP create 60 free-base events" icon={Activity} />
        <StatCard label="Runs Created Pressure" value="52 R / 33 RBI" note="Value shows up through run creation, not raw power" icon={TrendingUp} />
        <StatCard label="Career Steals" value="26 SB" note="78.79% career success rate" icon={Route} />
      </section>

      <section className="dashboard-grid two-col">
        <article className="panel large-panel">
          <div className="section-heading">
            <span>Offensive Identity</span>
            <h2>Plate discipline is the foundation.</h2>
            <p>KG gets on base at a rate significantly higher than his batting average, which makes him useful as a table-setter and pressure runner even while contact consistency develops.</p>
          </div>
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={offensiveBars}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="name" stroke="#94a3b8" />
                <YAxis hide domain={[0, 900]} />
                <Tooltip formatter={(value, name, props) => props.payload.label} contentStyle={{ background: '#020617', border: '1px solid #1e293b', borderRadius: 12 }} />
                <Bar dataKey="value" radius={[10, 10, 0, 0]}>
                  {offensiveBars.map((entry, index) => <Cell key={entry.name} fill={index === 1 ? '#22c55e' : '#38bdf8'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="panel">
          <div className="section-heading compact">
            <span>Baserunning Impact</span>
            <h2>Pressure once aboard.</h2>
          </div>
          <div className="radial-pair">
            <div>
              <ResponsiveContainer width="100%" height={170}>
                <RadialBarChart innerRadius="72%" outerRadius="100%" data={sbRadial} startAngle={90} endAngle={-270}>
                  <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                  <RadialBar dataKey="value" cornerRadius={12} />
                </RadialBarChart>
              </ResponsiveContainer>
              <strong>78.79%</strong><span>Career SB</span>
            </div>
            <div>
              <ResponsiveContainer width="100%" height={170}>
                <RadialBarChart innerRadius="72%" outerRadius="100%" data={sb2026Radial} startAngle={90} endAngle={-270}>
                  <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                  <RadialBar dataKey="value" cornerRadius={12} />
                </RadialBarChart>
              </ResponsiveContainer>
              <strong>87.5%</strong><span>Spring 2026 SB</span>
            </div>
          </div>
          <p className="panel-note">The 2026 steal efficiency jump shows smarter pressure and improved decision-making on the bases.</p>
        </article>
      </section>

      <section className="dashboard-grid two-col reverse-on-mobile">
        <article className="panel">
          <div className="section-heading compact">
            <span>Best Offensive Sample</span>
            <h2>Summer 2025 showed the upside.</h2>
            <p>When contact and on-base skill converged, KG posted a complete offensive stretch: .360 AVG, .484 OBP, .400 SLG, and .884 OPS over 16 games.</p>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={sampleComparison}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="name" stroke="#94a3b8" interval={0} angle={-18} textAnchor="end" height={70} />
              <YAxis hide domain={[0, 950]} />
              <Tooltip contentStyle={{ background: '#020617', border: '1px solid #1e293b', borderRadius: 12 }} formatter={(v) => `.${String(v).padStart(3, '0')}`} />
              <Line type="monotone" dataKey="value" stroke="#22c55e" strokeWidth={3} dot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </article>

        <article className="panel accent-panel">
          <div className="section-heading compact">
            <span>Current 2026 Snapshot</span>
            <h2>Mixed average, useful production.</h2>
          </div>
          <div className="snapshot-list">
            <div><strong>.175 AVG</strong><span>contact still developing</span></div>
            <div><strong>.382 OBP</strong><span>walks keep value alive</span></div>
            <div><strong>18 BB</strong><span>through 77 plate appearances</span></div>
            <div><strong>10 R / 9 RBI</strong><span>production remains present</span></div>
            <div><strong>7 SB / 1 CS</strong><span>87.5% success rate</span></div>
          </div>
        </article>
      </section>

      <section className="dashboard-grid two-col">
        <article className="panel large-panel">
          <div className="section-heading">
            <span>Pitching Trend</span>
            <h2>Better efficiency and contact management in Spring 2026.</h2>
            <p>Compared to the career pitching line, Spring 2026 shows better pitches per inning, improved weak-contact production, stronger ground-ball rate, and slightly better strike efficiency.</p>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={pitchTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="name" stroke="#94a3b8" />
              <YAxis domain={[0, 80]} stroke="#94a3b8" />
              <Tooltip contentStyle={{ background: '#020617', border: '1px solid #1e293b', borderRadius: 12 }} />
              <Bar dataKey="Career" fill="#38bdf8" radius={[8, 8, 0, 0]} />
              <Bar dataKey="Spring 2026" fill="#22c55e" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </article>

        <article className="panel">
          <div className="section-heading compact">
            <span>Pitching Executive Summary</span>
            <h2>Contact-management arm with command runway.</h2>
          </div>
          <Progress label="Career Strike Rate" value={52.1} note="Needs command growth" />
          <Progress label="First-Pitch Strike" value={49.59} note="Primary mound development lever" />
          <Progress label="Weak Contact" value={64.6} note="Strong foundation" />
          <Progress label="Ground Ball" value={48.41} note="Useful contact profile" />
        </article>
      </section>

      <section className="panel development-panel">
        <div className="section-heading">
          <span>Development Priorities</span>
          <h2>The next jump is specific, measurable, and trainable.</h2>
          <p>KG already owns the discipline and speed traits. The ceiling moves when he turns more plate appearances into balls in play, adds gap contact, and sharpens the first-pitch strike profile on the mound.</p>
        </div>
        <div className="priority-bars">
          {developmentData.map((item) => (
            <div className="dev-item" key={item.name}>
              <div><strong>{item.name}</strong><span>{item.detail}</span></div>
              <div className="dev-track"><i style={{ width: `${Math.min(item.value, 100)}%` }} /></div>
            </div>
          ))}
        </div>
      </section>

      <section className="closing-grid">
        <article className="panel closing-card">
          <Zap size={28} />
          <h2>Player-use translation</h2>
          <p>Keep the walk discipline. Attack earlier in advantage counts. Shorten with two strikes. Turn OBP into stolen-base pressure. On the mound, win pitch one and finish hitters with a true out pitch.</p>
        </article>
        <article className="panel closing-card">
          <Gauge size={28} />
          <h2>Coach-use translation</h2>
          <p>Use KG where pressure matters: table-setter, pinch-runner, utility defender, and developing contact-management pitcher. Track strikeout rate, looking Ks, doubles, first-pitch strikes, and BB/INN every cycle.</p>
        </article>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
