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
    games: 83,
    pa: 211,
    atBats: 139,
    runs: 97,
    rbi: 38,
    walks: 60,
    hbp: 8,
    stolenBases: 93,
    caughtStealing: 7,
    sbSuccess: 93.0,
    avg: 0.396,
    obp: 0.591,
    slg: 0.518,
    ops: 1.109,
    hits: 55,
    doubles: 6,
    triples: 4,
    homeRuns: 1,
    strikeouts: 14,
    strikeoutsLooking: 7,
    walkToStrikeout: 4.29,
  },
  spring2026: {
    games: 14,
    pa: 43,
    atBats: 29,
    avg: 0.552,
    obp: 0.698,
    slg: 0.966,
    ops: 1.663,
    hits: 16,
    rbi: 11,
    runs: 24,
    walks: 12,
    strikeouts: 3,
    stolenBases: 14,
    sbSuccess: 93.33,
    doubles: 3,
    triples: 3,
    homeRuns: 1,
  },
  pitchingCareer: {
    innings: 59.1,
    battersFaced: 348,
    pitchesPerInning: 21.3,
    pitchesPerBf: 3.638,
    strikeRate: 52.21,
    firstPitchStrike: 49.43,
    walksPerInning: 0.927,
    swingMiss: 10.19,
    kPerBf: 0.184,
    kbb: 1.164,
    weakContact: 68.42,
    groundBall: 61.65,
    goAo: 2.63,
    lineDrive: 14.83,
    fip: 5.213,
  },
  pitchingSpring2026: {
    strikeRate: 48.59,
    firstPitchStrike: 37.5,
    weakContact: 67.65,
    groundBall: 64.71,
    homeRunsAllowed: 3,
  },
};

const priorityCards = [
  {
    icon: Target,
    title: 'Overall Coach Takeaway',
    body: 'Kendall is a high-value offensive player with high average, elite on-base skill, low strikeouts, aggressive efficient baserunning, emerging power, strong run production, and two-way pitching upside.',
  },
  {
    icon: ArrowUpRight,
    title: 'Next Level Separator',
    body: 'The 2026 power jump is the separator. If Kendall sustains even part of the slugging growth while keeping the walk rate, contact discipline, and steal efficiency, the profile becomes complete.',
  },
  {
    icon: ShieldCheck,
    title: 'Final Profile Statement',
    body: 'A dynamic, high-OBP, speed-driven athlete with advanced plate discipline and rising power. Offensively, Kendall profiles as a true run-creation engine.',
  },
];

const offensiveBars = [
  { name: 'AVG', value: 396, label: '.396' },
  { name: 'OBP', value: 591, label: '.591' },
  { name: 'SLG', value: 518, label: '.518' },
  { name: 'OPS', value: 1109, label: '1.109' },
];

const sampleComparison = [
  { name: 'Career AVG', value: 396 },
  { name: '2026 AVG', value: 552 },
  { name: 'Career OBP', value: 591 },
  { name: '2026 OBP', value: 698 },
  { name: 'Career OPS', value: 1109 },
  { name: '2026 OPS', value: 1663 },
];

const pitchTrend = [
  { name: 'Strike %', Career: 52.21, 'Spring 2026': 48.59 },
  { name: '1st Pitch %', Career: 49.43, 'Spring 2026': 37.5 },
  { name: 'Weak Contact %', Career: 68.42, 'Spring 2026': 67.65 },
  { name: 'Ground Ball %', Career: 61.65, 'Spring 2026': 64.71 },
];

const developmentData = [
  { name: 'First Pitch Strike', value: 37.5, detail: 'Raise Spring 2026 37.50% above 55%' },
  { name: 'Walk Control', value: 92.7, detail: '.927 career walks per inning' },
  { name: 'Power Sustain', value: 96.6, detail: '.966 SLG in Spring 2026 breakout' },
  { name: 'Finish Innings', value: 21.3, detail: '21.3 career pitches per inning' },
  { name: 'HR Damage', value: 30, detail: '3 HR allowed in Spring 2026 pitching sample' },
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
          <h1>Kendall “KG” Green</h1>
          <p className="hero-text">High-impact offensive player with standout value in on-base production, speed, contact discipline, and run creation. This version leads with the coach-facing conclusions, then drills into the evidence.</p>
        </div>
        <div className="hero-panel">
          <span>Career Slash</span>
          <strong>.396 / .591 / .518</strong>
          <p>1.109 OPS with elite on-base production, rare walk-to-strikeout control, and sustained baserunning pressure.</p>
        </div>
      </section>

      <section className="priority-grid">
        {priorityCards.map((card) => <PriorityCard key={card.title} {...card} />)}
      </section>

      <section className="stats-grid">
        <StatCard label="Career Games" value="83" note="Offensive impact built across three tracked seasons" icon={Medal} />
        <StatCard label="Run Creation" value="97 R" note="More than one run per game across the career sample" icon={Activity} />
        <StatCard label="Plate Control" value="60 BB / 14 K" note="4.29 walks per strikeout with only 7 looking Ks" icon={TrendingUp} />
        <StatCard label="Career Steals" value="93 SB" note="93.00% career stolen-base success rate" icon={Route} />
      </section>

      <section className="dashboard-grid two-col">
        <article className="panel large-panel">
          <div className="section-heading">
            <span>Offensive Identity</span>
            <h2>Elite on-base engine with rising impact.</h2>
            <p>Kendall gets on base, rarely strikes out, runs aggressively, and turns plate appearances into pressure. The profile fits a true top-of-the-order catalyst.</p>
          </div>
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={offensiveBars}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="name" stroke="#94a3b8" />
                <YAxis hide domain={[0, 1700]} />
                <Tooltip formatter={(value, name, props) => props.payload.label} contentStyle={{ background: '#020617', border: '1px solid #1e293b', borderRadius: 12 }} />
                <Bar dataKey="value" radius={[10, 10, 0, 0]}>
                  {offensiveBars.map((entry, index) => <Cell key={entry.name} fill={index === 3 ? '#22c55e' : '#38bdf8'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="panel">
          <div className="section-heading compact">
            <span>Speed / Baserunning Impact</span>
            <h2>Elite and sustained.</h2>
          </div>
          <div className="radial-pair">
            <div>
              <ResponsiveContainer width="100%" height={170}>
                <RadialBarChart innerRadius="72%" outerRadius="100%" data={sbRadial} startAngle={90} endAngle={-270}>
                  <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                  <RadialBar dataKey="value" cornerRadius={12} />
                </RadialBarChart>
              </ResponsiveContainer>
              <strong>93.00%</strong><span>Career SB</span>
            </div>
            <div>
              <ResponsiveContainer width="100%" height={170}>
                <RadialBarChart innerRadius="72%" outerRadius="100%" data={sb2026Radial} startAngle={90} endAngle={-270}>
                  <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                  <RadialBar dataKey="value" cornerRadius={12} />
                </RadialBarChart>
              </ResponsiveContainer>
              <strong>93.33%</strong><span>Spring 2026 SB</span>
            </div>
          </div>
          <p className="panel-note">Fall 2024: 37 SB at 94.87%. Spring 2025: 42 SB at 91.30%. Spring 2026: 14 SB at 93.33%.</p>
        </article>
      </section>

      <section className="dashboard-grid two-col reverse-on-mobile">
        <article className="panel">
          <div className="section-heading compact">
            <span>Best Season Snapshot</span>
            <h2>Spring 2026 is the breakout signal.</h2>
            <p>The short-season sample shows high average, elite OBP, extra-base power, run scoring, speed, and minimal strikeouts.</p>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={sampleComparison}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="name" stroke="#94a3b8" interval={0} angle={-18} textAnchor="end" height={70} />
              <YAxis hide domain={[0, 1700]} />
              <Tooltip contentStyle={{ background: '#020617', border: '1px solid #1e293b', borderRadius: 12 }} formatter={(v) => v > 999 ? `${(v / 1000).toFixed(3)}` : `.${String(v).padStart(3, '0')}`} />
              <Line type="monotone" dataKey="value" stroke="#22c55e" strokeWidth={3} dot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </article>

        <article className="panel accent-panel">
          <div className="section-heading compact">
            <span>Spring 2026 Snapshot</span>
            <h2>Dominant offensive sample.</h2>
          </div>
          <div className="snapshot-list">
            <div><strong>.552 AVG</strong><span>16 hits in 29 at-bats</span></div>
            <div><strong>.698 OBP</strong><span>12 walks and only 3 strikeouts</span></div>
            <div><strong>.966 SLG</strong><span>3 doubles, 3 triples, 1 home run</span></div>
            <div><strong>24 R / 11 RBI</strong><span>major run-creation output in 14 games</span></div>
            <div><strong>14 SB</strong><span>93.33% success rate</span></div>
          </div>
        </article>
      </section>

      <section className="dashboard-grid two-col">
        <article className="panel large-panel">
          <div className="section-heading">
            <span>Pitching Trend</span>
            <h2>Ground-ball strength with command refinement needed.</h2>
            <p>Kendall keeps the ball on the ground and creates weak contact. The current pitching gap is command: first-pitch strikes, overall strike consistency, walk control, and limiting home-run damage.</p>
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
            <h2>Weak-contact ground-ball pitcher.</h2>
          </div>
          <Progress label="Career Strike Rate" value={52.21} note="Needs consistency growth" />
          <Progress label="First-Pitch Strike" value={49.43} note="Raise above 55%" />
          <Progress label="Weak Contact" value={68.42} note="Clear pitching strength" />
          <Progress label="Ground Ball" value={61.65} note="Strong contact-management profile" />
        </article>
      </section>

      <section className="panel development-panel">
        <div className="section-heading">
          <span>Development Priorities</span>
          <h2>The offense is already strong. The next layer is sustain and command.</h2>
          <p>Keep the elite plate discipline and baserunning pressure intact. Sustain part of the 2026 power jump. On the mound, push first-pitch strikes above 55%, reduce walks, and finish innings with fewer pitches.</p>
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
          <p>Protect the zone control. Keep pressure on pitchers with walks, contact, and steals. Hunt pitches that can become doubles, triples, and hard line drives without giving back the low strikeout rate.</p>
        </article>
        <article className="panel closing-card">
          <Gauge size={28} />
          <h2>Coach-use translation</h2>
          <p>Use Kendall as a top-of-order engine. Track OBP, walk-to-strikeout ratio, extra-base hit rate, runs per game, first-pitch strike rate, walks per inning, and home-run damage every cycle.</p>
        </article>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
