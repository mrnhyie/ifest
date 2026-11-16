export const SIZES = ['S', 'M', 'L', 'XL', 'XXL'];
export const COLORS = ['black', 'white'];
export const ROLES = ['participant', 'audience', 'sponsor', 'security', 'volunteer', 'organiser', 'other'];
export const PICKUPS = ['self', 'proxy'];
export const STATUSES = ['new', 'paid', 'collected'];
export const NETWORKS = ['mtn', 'telecel', 'at'];
export const UNIT_PRICE = 75;
export const MAX_ROWS = 25;
export const MAX_QTY = 10;
export const MAX_TOTAL = 60;

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const TEAM_CODE_RE = /^IF26-[A-Z0-9]{6}$/;

const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export function sizeRun(items) {
  const run = Object.fromEntries(SIZES.map(s => [s, 0]));
  for (const it of items) run[it.size] = (run[it.size] || 0) + it.qty;
  return run;
}

export function colorRun(items) {
  const run = Object.fromEntries(COLORS.map(c => [c, 0]));
  for (const it of items) run[it.color] = (run[it.color] || 0) + it.qty;
  return run;
}

export function validateRequest(p) {
  if (!p || typeof p !== 'object') throw new Error('invalid request');
  const name = text(p.name, 120);
  const email = text(p.email, 160).toLowerCase();
  const phone = text(p.phone, 40);
  if (!name) throw new Error('your full name is required');
  if (!EMAIL_RE.test(email)) throw new Error('a valid email is required');
  if (!phone) throw new Error('a phone number is required so we can reach you about collection');

  const role = ROLES.includes(p.role) ? p.role : 'other';
  const org = text(p.org, 160);
  const teamCode = text(p.teamCode, 20).toUpperCase();
  if (teamCode && !TEAM_CODE_RE.test(teamCode)) throw new Error('team code should look like IF26-XXXXXX');

  const raw = Array.isArray(p.items) ? p.items : [];
  if (!raw.length) throw new Error('add at least one shirt');
  if (raw.length > MAX_ROWS) throw new Error(`one request can hold at most ${MAX_ROWS} people — split it into two`);
  const items = raw.map((it, i) => {
    const who = text(it?.name, 120);
    const size = String(it?.size || '').toUpperCase();
    const color = String(it?.color || '').toLowerCase();
    const qty = Number(it?.qty);
    if (!who) throw new Error(`shirt ${i + 1}: say who it is for`);
    if (!SIZES.includes(size)) throw new Error(`shirt ${i + 1}: choose a size (${SIZES.join(', ')})`);
    if (!COLORS.includes(color)) throw new Error(`shirt ${i + 1}: choose black or white`);
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) throw new Error(`shirt ${i + 1}: quantity must be between 1 and ${MAX_QTY}`);
    return { name: who, size, color, qty };
  });
  const total = items.reduce((n, it) => n + it.qty, 0);
  if (total > MAX_TOTAL) throw new Error(`one request can hold at most ${MAX_TOTAL} shirts — split it into two`);

  const pickup = PICKUPS.includes(p.pickup) ? p.pickup : 'self';
  const collector = text(p.collector, 120);
  if (pickup === 'proxy' && !collector) throw new Error('name the person collecting on your behalf');

  const network = String(p.momoNetwork || '').toLowerCase();
  if (!NETWORKS.includes(network)) throw new Error('choose the mobile money network you paid from');
  const momoRef = text(p.momoRef, 60);
  if (momoRef.length < 4) throw new Error('the MoMo payment reference / transaction ID is required');
  const momoSender = text(p.momoSender, 40);

  if (!p.confirm) throw new Error('please confirm the details and the payment before submitting');

  return {
    name, email, phone, org, role, teamCode, items, total,
    unitPrice: UNIT_PRICE, amount: total * UNIT_PRICE,
    pickup, collector: pickup === 'proxy' ? collector : '',
    momoNetwork: network, momoRef, momoSender,
    notes: text(p.notes, 1000),
  };
}