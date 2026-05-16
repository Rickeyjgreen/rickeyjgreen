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

const profiles = {
  kaden: {
    slug: 'kaden',
    name: 'Kaden “KG” Green',
    hero: 'On-base, speed, utility athlete with developing two-way value. This dashboard leads with the coach-facing takeaways first, then drills into offensive, baserunning, and pitching evidence.',
    slash: '.198 / .385 / .223',
    slashNote: '.609 OPS with a strong AVG-to-OBP separation driven by discipline and free bases.',
    priorityCards: [
      { icon: Target, title: 'Overall Coach Takeaway', body: 'KG creates value by reaching base, running aggressively, scoring runs, drawing walks, applying pressure, providing pitching depth, and generating weak contact as a pitcher.' },
      { icon: ArrowUpRight, title: 'Next Level Comes From', body: 'Reduce strikeouts, raise batting average through more balls in play, add doubles and gap power, improve first-pitch strike rate, lower walks per inning, and develop a put-away pitch.' },
      { icon: ShieldCheck, title: 'Final Profile Statement', body: 'A disciplined, speed-first athlete with strong on-base instincts and developing two-way value. The clearest jump comes from plate-contact consistency and sharper mound command.' },
    ],
    stats: [
      { label: 'Career Games', value: '117', note: 'Broad sample across offensive and utility usage', icon: Medal },
      { label: 'Plate Appearances', value: '259', note: '52 walks and 8 HBP create 60 free-base events', icon: Activity },
      { label: 'Runs Created Pressure', value: '52 R / 33 RBI', note: 'Value shows up through run creation, not raw power', icon: TrendingUp },
      { label: 'Career Steals', value: '26 SB', note: '78.79% career success rate', icon: Route },
    ],
    offensiveTitle: 'Plate discipline is the foundation.',
    offensiveText: 'KG gets on base at a rate significantly higher than his batting average, which makes him useful as a table-setter and pressure runner even while contact consistency develops.',
    offensiveBars: [
      { name: 'AVG', value: 198, label: '.198' },
      { name: 'OBP', value: 385, label: '.385' },
      { name: 'SLG', value: 223, label: '.223' },
      { name: 'OPS', value: 609, label: '.609' },
    ],
    offensiveMax: 900,
    baserunningTitle: 'Pressure once aboard.',
    sbCareer: 78.79,
    sbCurrent: 87.5,
    sbCareerLabel: '78.79%',
    sbCurrentLabel: '87.5%',
    baserunningNote: 'The 2026 steal efficiency jump shows smarter pressure and improved decision-making on the bases.',
    sampleLabel: 'Best Offensive Sample',
    sampleTitle: 'Summer 2025 showed the upside.',
    sampleText: 'When contact and on-base skill converged, KG posted a complete offensive stretch: .360 AVG, .484 OBP, .400 SLG, and .884 OPS over 16 games.',
    sampleComparison: [
      { name: 'Career AVG', value: 198 },
      { name: 'Summer AVG', value: 360 },
      { name: 'Career OBP', value: 385 },
      { name: 'Summer OBP', value: 484 },
      { name: 'Career OPS', value: 609 },
      { name: 'Summer OPS', value: 884 },
    ],
    sampleMax: 950,
    snapshotLabel: 'Current 2026 Snapshot',
    snapshotTitle: 'Mixed average, useful production.',
    snapshotItems: [
      ['.175 AVG', 'contact still developing'],
      ['.382 OBP', 'walks keep value alive'],
      ['18 BB', 'through 77 plate appearances'],
      ['10 R / 9 RBI', 'production remains present'],
      ['7 SB / 1 CS', '87.5% success rate'],
    ],
    pitchTitle: 'Better efficiency and contact management in Spring 2026.',
    pitchText: 'Compared to the career pitching line, Spring 2026 shows better pitches per inning, improved weak-contact production, stronger ground-ball rate, and slightly better strike efficiency.',
    pitchTrend: [
      { name: 'Strike %', Career: 52.1, 'Spring 2026': 53.41 },
      { name: 'Weak Contact %', Career: 64.6, 'Spring 2026': 72.22 },
      { name: 'Ground Ball %', Career: 48.41, 'Spring 2026': 52.94 },
    ],
    pitchSummaryTitle: 'Contact-management arm with command runway.',
    progress: [
      { label: 'Career Strike Rate', value: 52.1, note: 'Needs command growth' },
      { label: 'First-Pitch Strike', value: 49.59, note: 'Primary mound development lever' },
      { label: 'Weak Contact', value: 64.6, note: 'Strong foundation' },
      { label: 'Ground Ball', value: 48.41, note: 'Useful contact profile' },
    ],
    developmentTitle: 'The next jump is specific, measurable, and trainable.',
    developmentText: 'KG already owns the discipline and speed traits. The ceiling moves when he turns more plate appearances into balls in play, adds gap contact, and sharpens the first-pitch strike profile on the mound.',
    developmentData: [
      { name: 'Contact', value: 88, detail: '88 career strikeouts' },
      { name: 'Looking Ks', value: 25, detail: '25 looking strikeouts' },
      { name: 'Gap Power', value: 5, detail: '5 doubles, no triples/HR' },
      { name: '1st Pitch', value: 49.59, detail: '49.59% first-pitch strike' },
      { name: 'Command', value: 55.8, detail: '.558 BB/INN in Spring 2026' },
    ],
    playerUse: 'Keep the walk discipline. Attack earlier in advantage counts. Shorten with two strikes. Turn OBP into stolen-base pressure. On the mound, win pitch one and finish hitters with a true out pitch.',
    coachUse: 'Use KG where pressure matters: table-setter, pinch-runner, utility defender, and developing contact-management pitcher. Track strikeout rate, looking Ks, doubles, first-pitch strikes, and BB/INN every cycle.',
  },
  kendall: {
    slug: 'kendall',
    name: 'Kendall “KG” Green',
    hero: 'High-impact offensive player with standout value in on-base production, speed, contact discipline, and run creation. This dashboard leads with the coach-facing conclusions, then drills into the evidence.',
    slash: '.396 / .591 / .518',
    slashNote: '1.109 OPS with elite on-base production, rare walk-to-strikeout control, and sustained baserunning pressure.',
    priorityCards: [
      { icon: Target, title: 'Overall Coach Takeaway', body: 'Kendall is a high-value offensive player with high average, elite on-base skill, low strikeouts, aggressive efficient baserunning, emerging power, strong run production, and two-way pitching upside.' },
      { icon: ArrowUpRight, title: 'Next Level Separator', body: 'The 2026 power jump is the separator. If Kendall sustains even part of the slugging growth while keeping the walk rate, contact discipline, and steal efficiency, the profile becomes complete.' },
      { icon: ShieldCheck, title: 'Final Profile Statement', body: 'A dynamic, high-OBP, speed-driven athlete with advanced plate discipline and rising power. Offensively, Kendall profiles as a true run-creation engine.' },
    ],
    stats: [
      { label: 'Career Games', value: '83', note: 'Offensive impact built across three tracked seasons', icon: Medal },
      { label: 'Run Creation', value: '97 R', note: 'More than one run per game across the career sample', icon: Activity },
      { label: 'Plate Control', value: '60 BB / 14 K', note: '4.29 walks per strikeout with only 7 looking Ks', icon: TrendingUp },
      { label: 'Career Steals', value: '93 SB', note: '93.00% career stolen-base success rate', icon: Route },
    ],
    offensiveTitle: 'Elite on-base engine with rising impact.',
    offensiveText: 'Kendall gets on base, rarely strikes out, runs aggressively, and turns plate appearances into pressure. The profile fits a true top-of-the-order catalyst.',
    offensiveBars: [
      { name: 'AVG', value: 396, label: '.396' },
      { name: 'OBP', value: 591, label: '.591' },
      { name: 'SLG', value: 518, label: '.518' },
      { name: 'OPS', value: 1109, label: '1.109' },
    ],
    offensiveMax: 1700,
    baserunningTitle: 'Elite and sustained.',
    sbCareer: 93.0,
    sbCurrent: 93.33,
    sbCareerLabel: '93.00%',
    sbCurrentLabel: '93.33%',
    baserunningNote: 'Fall 2024: 37 SB at 94.87%. Spring 2025: 42 SB at 91.30%. Spring 2026: 14 SB at 93.33%.',
    sampleLabel: 'Best Season Snapshot',
    sampleTitle: 'Spring 2026 is the breakout signal.',
    sampleText: 'The short-season sample shows high average, elite OBP, extra-base power, run scoring, speed, and minimal strikeouts.',
    sampleComparison: [
      { name: 'Career AVG', value: 396 },
      { name: '2026 AVG', value: 552 },
      { name: 'Career OBP', value: 591 },
      { name: '2026 OBP', value: 698 },
      { name: 'Career OPS', value: 1109 },
      { name: '2026 OPS', value: 1663 },
    ],
    sampleMax: 1700,
    snapshotLabel: 'Spring 2026 Snapshot',
    snapshotTitle: 'Dominant offensive sample.',
    snapshotItems: [
      ['.552 AVG', '16 hits in 29 at-bats'],
      ['.698 OBP', '12 walks and only 3 strikeouts'],
      ['.966 SLG', '3 doubles, 3 triples, 1 home run'],
      ['24 R / 11 RBI', 'major run-creation output in 14 games'],
      ['14 SB', '93.33% success rate'],
    ],
    pitchTitle: 'Ground-ball strength with command refinement needed.',
    pitchText: 'Kendall keeps the ball on the ground and creates weak contact. The current pitching gap is command: first-pitch strikes, overall strike consistency, walk control, and limiting home-run damage.',
    pitchTrend: [
      { name: 'Strike %', Career: 52.21, 'Spring 2026': 48.59 },
      { name: '1st Pitch %', Career: 49.43, 'Spring 2026': 37.5 },
      { name: 'Weak Contact %', Career: 68.42, 'Spring 2026': 67.65 },
      { name: 'Ground Ball %', Career: 61.65, 'Spring 2026': 64.71 },
    ],
    pitchSummaryTitle: 'Weak-contact ground-ball pitcher.',
    progress: [
      { label: 'Career Strike Rate', value: 52.21, note: 'Needs consistency growth' },
      { label: 'First-Pitch Strike', value: 49.43, note: 'Raise above 55%' },
      { label: 'Weak Contact', value: 68.42, note: 'Clear pitching strength' },
      { label: 'Ground Ball', value: 61.65, note: 'Strong contact-management profile' },
    ],
    developmentTitle: 'The offense is already strong. The next layer is sustain and command.',
    developmentText: 'Keep the elite plate discipline and baserunning pressure intact. Sustain part of the 2026 power jump. On the mound, push first-pitch strikes above 55%, reduce walks, and finish innings with fewer pitches.',
    developmentData: [
      { name: 'First Pitch Strike', value: 37.5, detail: 'Raise Spring 2026 37.50% above 55%' },
      { name: 'Walk Control', value: 92.7, detail: '.927 career walks per inning' },
      { name: 'Power Sustain', value: 96.6, detail: '.966 SLG in Spring 2026 breakout' },
      { name: 'Finish Innings', value: 21.3, detail: '21.3 career pitches per inning' },
      { name: 'HR Damage', value: 30, detail: '3 HR allowed in Spring 2026 pitching sample' },
    ],
    playerUse: 'Protect the zone control. Keep pressure on pitchers with walks, contact, and steals. Hunt pitches that can become doubles, triples, and hard line drives without giving back the low strikeout rate.',
    coachUse: 'Use Kendall as a top-of-order engine. Track OBP, walk-to-strikeout ratio, extra-base hit rate, runs per game, first-pitch strike rate, walks per inning, and home-run damage every cycle.',
  },
};

function StatCard({ label, value, note, icon: Icon }) {
  return <article className="stat-card"><div className="stat-topline"><span>{label}</span><Icon size={18} /></div><strong>{value}</strong><p>{note}</p></article>;
}

function PriorityCard({ icon: Icon, title, body }) {
  return <article className="priority-card"><div className="priority-icon"><Icon size={22} /></div><div><h3>{title}</h3><p>{body}</p></div></article>;
}

function Progress({ label, value, max = 100, note }) {
  return <div className="progress-row"><div className="progress-label"><span>{label}</span><strong>{value}%</strong></div><div className="progress-track"><div style={{ width: `${Math.min((value / max) * 100, 100)}%` }} /></div>{note && <small>{note}</small>}</div>;
}

function Home() {
  return <main><section className="hero"><div className="hero-copy"><p className="eyebrow">Player Development Dashboards</p><h1>KG Green Dashboards</h1><p className="hero-text">Separate stable links for each athlete. Use the individual links below so one dashboard never overwrites the other.</p></div><div className="hero-panel"><span>Stable Links</span><strong>2 Dashboards</strong><p>Kaden and Kendall each have their own route.</p></div></section><section className="priority-grid"><a className="priority-card" href="/kaden"><div className="priority-icon"><Target size={22} /></div><div><h3>Kaden “KG” Green</h3><p>On-base, speed, utility athlete with developing two-way value.</p></div></a><a className="priority-card" href="/kendall"><div className="priority-icon"><Target size={22} /></div><div><h3>Kendall “KG” Green</h3><p>High-OBP, speed-driven athlete with advanced discipline and rising power.</p></div></a></section></main>;
}

function Dashboard({ profile }) {
  const sbRadial = [{ name: 'Career SB Success', value: profile.sbCareer, fill: '#38bdf8' }];
  const sbCurrentRadial = [{ name: 'Current SB Success', value: profile.sbCurrent, fill: '#22c55e' }];

  return <main>
    <nav className="route-nav"><a href="/">All dashboards</a><a href="/kaden">Kaden</a><a href="/kendall">Kendall</a></nav>
    <section className="hero"><div className="hero-copy"><p className="eyebrow">Player Development Dashboard</p><h1>{profile.name}</h1><p className="hero-text">{profile.hero}</p></div><div className="hero-panel"><span>Career Slash</span><strong>{profile.slash}</strong><p>{profile.slashNote}</p></div></section>
    <section className="priority-grid">{profile.priorityCards.map((card) => <PriorityCard key={card.title} {...card} />)}</section>
    <section className="stats-grid">{profile.stats.map((stat) => <StatCard key={stat.label} {...stat} />)}</section>
    <section className="dashboard-grid two-col"><article className="panel large-panel"><div className="section-heading"><span>Offensive Identity</span><h2>{profile.offensiveTitle}</h2><p>{profile.offensiveText}</p></div><div className="chart-wrap"><ResponsiveContainer width="100%" height={260}><BarChart data={profile.offensiveBars}><CartesianGrid strokeDasharray="3 3" stroke="#1e293b" /><XAxis dataKey="name" stroke="#94a3b8" /><YAxis hide domain={[0, profile.offensiveMax]} /><Tooltip formatter={(value, name, props) => props.payload.label} contentStyle={{ background: '#020617', border: '1px solid #1e293b', borderRadius: 12 }} /><Bar dataKey="value" radius={[10, 10, 0, 0]}>{profile.offensiveBars.map((entry, index) => <Cell key={entry.name} fill={index === 1 || index === 3 ? '#22c55e' : '#38bdf8'} />)}</Bar></BarChart></ResponsiveContainer></div></article><article className="panel"><div className="section-heading compact"><span>Speed / Baserunning Impact</span><h2>{profile.baserunningTitle}</h2></div><div className="radial-pair"><div><ResponsiveContainer width="100%" height={170}><RadialBarChart innerRadius="72%" outerRadius="100%" data={sbRadial} startAngle={90} endAngle={-270}><PolarAngleAxis type="number" domain={[0, 100]} tick={false} /><RadialBar dataKey="value" cornerRadius={12} /></RadialBarChart></ResponsiveContainer><strong>{profile.sbCareerLabel}</strong><span>Career SB</span></div><div><ResponsiveContainer width="100%" height={170}><RadialBarChart innerRadius="72%" outerRadius="100%" data={sbCurrentRadial} startAngle={90} endAngle={-270}><PolarAngleAxis type="number" domain={[0, 100]} tick={false} /><RadialBar dataKey="value" cornerRadius={12} /></RadialBarChart></ResponsiveContainer><strong>{profile.sbCurrentLabel}</strong><span>Current SB</span></div></div><p className="panel-note">{profile.baserunningNote}</p></article></section>
    <section className="dashboard-grid two-col reverse-on-mobile"><article className="panel"><div className="section-heading compact"><span>{profile.sampleLabel}</span><h2>{profile.sampleTitle}</h2><p>{profile.sampleText}</p></div><ResponsiveContainer width="100%" height={260}><LineChart data={profile.sampleComparison}><CartesianGrid strokeDasharray="3 3" stroke="#1e293b" /><XAxis dataKey="name" stroke="#94a3b8" interval={0} angle={-18} textAnchor="end" height={70} /><YAxis hide domain={[0, profile.sampleMax]} /><Tooltip contentStyle={{ background: '#020617', border: '1px solid #1e293b', borderRadius: 12 }} formatter={(v) => v > 999 ? `${(v / 1000).toFixed(3)}` : `.${String(v).padStart(3, '0')}`} /><Line type="monotone" dataKey="value" stroke="#22c55e" strokeWidth={3} dot={{ r: 5 }} /></LineChart></ResponsiveContainer></article><article className="panel accent-panel"><div className="section-heading compact"><span>{profile.snapshotLabel}</span><h2>{profile.snapshotTitle}</h2></div><div className="snapshot-list">{profile.snapshotItems.map(([value, note]) => <div key={value}><strong>{value}</strong><span>{note}</span></div>)}</div></article></section>
    <section className="dashboard-grid two-col"><article className="panel large-panel"><div className="section-heading"><span>Pitching Trend</span><h2>{profile.pitchTitle}</h2><p>{profile.pitchText}</p></div><ResponsiveContainer width="100%" height={300}><BarChart data={profile.pitchTrend}><CartesianGrid strokeDasharray="3 3" stroke="#1e293b" /><XAxis dataKey="name" stroke="#94a3b8" /><YAxis domain={[0, 80]} stroke="#94a3b8" /><Tooltip contentStyle={{ background: '#020617', border: '1px solid #1e293b', borderRadius: 12 }} /><Bar dataKey="Career" fill="#38bdf8" radius={[8, 8, 0, 0]} /><Bar dataKey="Spring 2026" fill="#22c55e" radius={[8, 8, 0, 0]} /></BarChart></ResponsiveContainer></article><article className="panel"><div className="section-heading compact"><span>Pitching Executive Summary</span><h2>{profile.pitchSummaryTitle}</h2></div>{profile.progress.map((item) => <Progress key={item.label} {...item} />)}</article></section>
    <section className="panel development-panel"><div className="section-heading"><span>Development Priorities</span><h2>{profile.developmentTitle}</h2><p>{profile.developmentText}</p></div><div className="priority-bars">{profile.developmentData.map((item) => <div className="dev-item" key={item.name}><div><strong>{item.name}</strong><span>{item.detail}</span></div><div className="dev-track"><i style={{ width: `${Math.min(item.value, 100)}%` }} /></div></div>)}</div></section>
    <section className="closing-grid"><article className="panel closing-card"><Zap size={28} /><h2>Player-use translation</h2><p>{profile.playerUse}</p></article><article className="panel closing-card"><Gauge size={28} /><h2>Coach-use translation</h2><p>{profile.coachUse}</p></article></section>
  </main>;
}

function App() {
  const path = window.location.pathname.toLowerCase();
  if (path.includes('kaden')) return <Dashboard profile={profiles.kaden} />;
  if (path.includes('kendall')) return <Dashboard profile={profiles.kendall} />;
  return <Home />;
}

createRoot(document.getElementById('root')).render(<App />);
