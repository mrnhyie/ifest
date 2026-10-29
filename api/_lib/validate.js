const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const CATS = new Set(['hackathon', 'robot_wars', 'pitch']);
const INST_TYPES = new Set([
  'University', 'Technical University', 'College', 'Senior High School',
  'Bootcamp / Training provider', 'Independent / self-taught', 'Other',
]);
const STATUSES = new Set(['enrolled', 'recent_grad', 'non_tertiary']);
const ROLES = new Set(['participant', 'audience', 'sponsor', 'security', 'other']);

function req(cond, msg) {
  if (!cond) throw new Error(msg);
}

function oneOf(v, ...opts) {
  return opts.includes(v);
}

function hasText(s) {
  return typeof s === 'string' && s.trim() !== '';
}

export function validate(p) {
  if (p.attendingAs && p.attendingAs !== 'participant') {
    if (!ROLES.has(p.attendingAs)) throw new Error(`unknown attendee role: ${p.attendingAs}`);
    const g = p.guest || {};
    req(hasText(g.name), 'guest: full name is required');
    req(EMAIL_RE.test((g.email || '').trim()), 'guest: valid email is required');
    req(hasText(g.phone), 'guest: phone is required');
    req(Array.isArray(g.days) && g.days.length > 0, 'guest: select at least one attendance day');
    if ((p.attendingAs === 'sponsor' || p.attendingAs === 'security') && !hasText(g.org)) {
      throw new Error(`guest: organisation is required for ${p.attendingAs} registrations`);
    }
    return;
  }

  if (!Array.isArray(p.categories) || p.categories.length === 0) {
    throw new Error('select at least one competition');
  }
  const has = new Set();
  for (const c of p.categories) {
    if (!CATS.has(c)) throw new Error(`unknown category: ${c}`);
    has.add(c);
  }
  if (has.has('hackathon') && has.has('robot_wars')) {
    throw new Error('AI Hackathon and Robot Wars are mutually exclusive (both run on Days 2-4)');
  }

  const t = p.team || {};
  req(hasText(t.name), 'team name is required');
  req(hasText(t.institution), "team lead's institution is required");
  if (t.size < 2 || t.size > 5) throw new Error('team must have 2 to 5 members');
  req(hasText(t.leadName) && hasText(t.leadPhone), 'team lead name and phone are required');
  req(EMAIL_RE.test((t.leadEmail || '').trim()), 'team lead email is invalid');
  req(hasText(t.leadProgram) && hasText(t.leadLevel), 'team lead programme and study status are required');

  const members = p.members || [];
  if (members.length !== t.size) throw new Error(`please provide details for all ${t.size} members`);
  members.forEach((m, i) => {
    const at = `member ${i + 1}`;
    if (!hasText(m.name) || !EMAIL_RE.test((m.email || '').trim()) || !hasText(m.phone)) {
      throw new Error(`${at}: name, valid email and phone are required`);
    }
    if (!STATUSES.has(m.status)) {
      throw new Error(`${at}: select whether they are enrolled, recently graduated, or not in tertiary`);
    }
    if (m.status !== 'non_tertiary') {
      if (!hasText(m.institution) || !INST_TYPES.has(m.institutionType)) {
        throw new Error(`${at}: institution and institution type are required`);
      }
    } else if (hasText(m.institution) && !INST_TYPES.has(m.institutionType)) {
      throw new Error(`${at}: choose an institution type, or leave the institution blank`);
    }
    if (!hasText(m.program) || !hasText(m.level)) {
      throw new Error(`${at}: programme and level/year are required`);
    }
    if (m.status === 'enrolled' && !hasText(m.studentId)) {
      throw new Error(`${at}: student ID number is required for enrolled students`);
    }
  });

  const d = p.declarations || {};
  req(d.eligible, 'declaration required: all members are enrolled students, recent graduates, or non-tertiary students');
  req(d.ids, 'declaration required: IDs will be verified at registration');
  req(d.ip, 'declaration required: originality and IP rules');
  req(d.conduct, 'declaration required: code of conduct');
  req(d.media, 'declaration required: consent for photos and videos');

  if (has.has('hackathon')) {
    const h = p.hackathon;
    if (!h) throw new Error('AI Hackathon section is missing');
    if (!Array.isArray(h.focusAreas) || h.focusAreas.length === 0) {
      throw new Error('hackathon: select at least one focus area');
    }
    req(h.laptopsAll === 'yes' || h.laptopsAll === 'no', 'hackathon: answer the laptops question');
    req(h.noPrebuilt === true, 'hackathon: you must confirm no pre-built product');
    req(h.liveDemo === true, 'hackathon: you must confirm the prototype will run live');
  }

  if (has.has('robot_wars')) {
    const b = p.robotWars;
    if (!b) throw new Error('Robot Wars section is missing');
    req(hasText(b.robotName), 'robot wars: robot name is required');
    req(oneOf(b.robotType, 'Remote-controlled', 'Autonomous', 'Hybrid'), 'robot wars: invalid robot type');
    for (const wp of b.weapons || []) {
      if (!oneOf(wp, 'Pusher', 'Wedge', 'Lifter', 'Flipper', 'None')) {
        throw new Error(`robot wars: invalid weapon type ${wp}`);
      }
    }
    if (!(b.weightKg > 0 && b.weightKg <= 5)) throw new Error('robot wars: weight must be >0 and at most 5 kg');
    if (!(b.boxSideCm > 0 && b.boxSideCm <= 30)) throw new Error('robot wars: robot must fit in a 30x30x30 cm box at match start');
    const ext = b.extensionCm ?? 0;
    if (ext < 0 || ext > 60) throw new Error('robot wars: maximum extension after start is limited to 60 cm');
    if (!(b.batteryV > 0 && b.batteryV <= 14.8)) throw new Error('robot wars: battery voltage must be at most 14.8 V (4S LiPo or equivalent)');
    req(b.killSwitch === 'yes', 'robot wars: an accessible kill switch that cuts all power is mandatory');
    req(oneOf(b.wireless, 'yes', 'no', 'na'), 'robot wars: answer the wireless control question');
    if (b.lipoCount < 0) throw new Error('robot wars: invalid LiPo battery count');
    req(oneOf(b.buildStatus, 'already built', 'in progress', 'will be built on site'), 'robot wars: invalid build status');
    req(b.noFire === true, 'robot wars: safety declaration required (no fire/flammables/explosives)');
    req(b.noProjectiles === true, 'robot wars: safety declaration required (no projectiles/nets/tethers)');
    req(b.noJammer === true, 'robot wars: safety declaration required (no jammers/interference)');
    req(b.noHighVoltage === true, 'robot wars: safety declaration required (no high-voltage weapons)');
    req(b.noBlades === true, 'robot wars: safety declaration required (no bladed or spinning weapons)');
    req(b.inspection === true, 'robot wars: you must confirm presenting the robot for technical inspection');
  }

  if (has.has('pitch')) {
    const c = p.pitch;
    if (!c) throw new Error('Innovation Pitch section is missing');
    req(hasText(c.projectName) && hasText(c.tagline), 'pitch: project name and one-line description are required');
    req(
      oneOf(c.sector, 'FinTech', 'HealthTech', 'AgriTech', 'EdTech', 'ClimateTech / Clean Energy', 'Other'),
      'pitch: invalid sector'
    );
    req(hasText(c.sdgPrimary), 'pitch: primary SDG is required');
    for (const [v, label] of [
      [c.problem, 'problem statement'],
      [c.affected, 'who is affected'],
      [c.whyExisting, 'why existing solutions fall short'],
      [c.impact, 'expected measurable impact'],
    ]) {
      req(hasText(v), `pitch: ${label} is required`);
    }
    req(oneOf(c.stage, 'Working prototype', 'Partial MVP', 'Live product with users'), 'pitch: invalid prototype stage');
    req(
      typeof c.demoUrl === 'string' && (c.demoUrl.startsWith('http://') || c.demoUrl.startsWith('https://')),
      'pitch: a demo/repository/video link is required (mockups alone do not count)'
    );
    req(oneOf(c.demoStyle, 'Live', 'Short walkthrough'), 'pitch: select a preferred demo style');
    req(c.studentLed === true, 'pitch: the pitching team must be student-led');
    if (c.existingStartup === 'yes') req(hasText(c.startupDetails), 'pitch: provide founding date and non-student co-founder details');
    if (!Array.isArray(c.ask) || c.ask.length === 0) throw new Error("pitch: select at least one item for 'the ask'");
  }

  const l = p.logistics || {};
  req(l.travel === 'yes' || l.travel === 'no', 'logistics: answer the travel/accommodation question');
  req(hasText(l.emergencyName) && hasText(l.emergencyPhone), 'logistics: emergency contact name and phone are required');
  req(
    typeof l.arrivalDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(l.arrivalDate) && !Number.isNaN(Date.parse(l.arrivalDate)),
    'logistics: expected arrival date is required'
  );
}
