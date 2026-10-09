// Relationship, wish, dialogue, event and decor content. Pure data (builders live in decor.js).

// ---- friendship levels. Points alone are not enough: deeper levels also need days visited and varied interactions. ----
export const LEVEL_AT = [0, 22, 45, 75, 110, 155, 200];
export const LEVEL_DAYS = [0, 1, 2, 3, 4, 5, 5];       // different days you spent time with them
export const LEVEL_KINDS = [0, 2, 2, 3, 4, 4, 5];      // different kinds of interaction (gift, emote, wish, hangout, hello...)
export const LEVEL_NAME = ['Shy', 'Friend', 'Buddy', 'Pal', 'Close pal', 'Dear friend', 'Best friend'];
export const MAX_LEVEL = LEVEL_AT.length - 1;
// mem = { days: [dates], kinds: {name:count} }
export function levelOf(pts = 0, mem = null) {
  let l = 0;
  for (let i = 1; i <= MAX_LEVEL; i++) {
    if (pts < LEVEL_AT[i]) break;
    if (mem && ((mem.days || []).length < LEVEL_DAYS[i] || Object.keys(mem.kinds || {}).length < LEVEL_KINDS[i])) break;
    l = i;
  }
  return l;
}

// ---- wishes: each friend asks for something small. type: gift (color key like 'berry:red'), hat, emote ----
export const WISHES = {
  Puffle: [{ type: 'hat', hat: 'flower', text: 'I would love to see you in a flower crown!' }, { type: 'gift', key: 'gem:pink', n: 2, text: 'Could you find me 2 pink gems?' }, { type: 'emote', name: 'wave', text: 'Wave at me! Hee hee.' }],
  Bloop: [{ type: 'gift', key: 'berry:purple', n: 3, text: 'I am craving 3 purple berries!' }, { type: 'emote', name: 'cheer', text: 'Cheer for me! Please?' }, { type: 'hat', hat: 'beanie', text: 'A cosy beanie would be so nice on you.' }],
  Sunny: [{ type: 'gift', key: 'gem:yellow', n: 2, text: 'Bring me 2 shiny yellow stars!' }, { type: 'emote', name: 'dance', text: 'Dance with me in the sun!' }, { type: 'hat', hat: 'straw', text: 'A straw hat would look sunny on you.' }],
  Mochi: [{ type: 'hat', hat: 'cat', text: 'Wear cat ears for me, nya?' }, { type: 'emote', name: 'sit', text: 'Let us sit together for a bit.' }, { type: 'gift', key: 'berry:purple', n: 2, text: 'Two purple berries, please?' }],
  Leafy: [{ type: 'gift', key: 'gem:green', n: 2, text: 'I want 2 green clovers!' }, { type: 'hat', hat: 'flower', text: 'Flowers! Wear a flower crown!' }, { type: 'emote', name: 'wave', text: 'Wave hello to the trees with me.' }],
  Bobo: [{ type: 'gift', key: 'berry:red', n: 3, text: 'Bobo wants 3 red berries!' }, { type: 'emote', name: 'cheer', text: 'Big cheer, big hug!' }, { type: 'hat', hat: 'cap', text: 'A cap! You would look so cool.' }],
  Pengu: [{ type: 'emote', name: 'dance', text: 'Waddle-dance with me!' }, { type: 'gift', key: 'gem:blue', n: 2, text: 'Two blue diamonds, if you please.' }, { type: 'hat', hat: 'beanie', text: 'It is chilly. A beanie, perhaps?' }],
  Fluff: [{ type: 'emote', name: 'dance', text: 'Fluff would like a dance...' }, { type: 'gift', key: 'berry:red', n: 2, text: 'Two red berries... only if you can.' }, { type: 'hat', hat: 'party', text: 'A party hat! Is it a party?' }],
};

// ---- dialogue. tier: 0 stranger, 1 friend (L1-2), 2 buddy (L3-4), 3 best (L5-6) ----
export const LINES = {
  Puffle: [['Oh! A visitor!', 'Hop hop... hello?'], ['Hi hi! I hopped here for you!', 'Meadows are better with friends.'], ['I saved the softest clover for you!', 'You smell like sunshine.'], ['You are my favourite hopper-friend!', 'Let us nap in the meadow forever.']],
  Bloop: [['Bloop? Bloop...', '*splish*'], ['Bloop! You came back!', 'I made you a little song.'], ['Splish splash, best friends!', 'The pond sings your name.'], ['You are the best drop in the whole sea!', 'Bloop bloop BLOOP!']],
  Sunny: [['Peep? Oh, hi!', 'It is a warm day...'], ['Peep peep! A friend!', 'Follow me into the light!'], ['You make the sun brighter!', 'I found a warm spot for us.'], ['Best day ever, every day with you!', 'You are my sunshine.']],
  Mochi: [['...mrow?', 'Sleepy... but hello.'], ['Mrrow. You can stay.', 'Pet? Okay, one pet.'], ['You are so squishy-warm, nya.', 'I purr only for you.'], ['Best friend, nya. Forever and ever.', 'Take a nap with me?']],
  Leafy: [['Rustle... oh!', 'I am just a little sprout.'], ['The leaves told me you were coming!', 'Hi! I am growing!'], ['Look how tall I got, thanks to you!', 'Every flower knows your name.'], ['You are the sunshine to my sprout!', 'The whole forest is smiling.']],
  Bobo: [['Hmm? Oh, hello there.', 'Bobo is a bit shy.'], ['Bobo likes you!', 'Hugs? Maybe later.'], ['Bobo saved honey for you!', 'You are a good friend, yes.'], ['Biggest hug for my best friend!', 'Bobo will always be here.']],
  Pengu: [['Pweh? Hello...', 'Waddle waddle.'], ['Pweh! A new friend!', 'I slid here just for you.'], ['Pengu loves your company!', 'Let us waddle together!'], ['Best friend, best waddle!', 'Pweh pweh pweh!']],
  Fluff: [['...b-baa?', 'Oh, um, hello.'], ['Baa... you are nice.', 'I will stay close, okay?'], ['You make me feel fluffier.', 'I am not shy with you.'], ['You are my whole cloud, friend.', 'Baaa, baaa, I love you.']],
};
// Personality kit used to generate extra lines per tier (6+ lines per species per tier).
const P = {
  Puffle: { noise: 'Hop hop', pal: 'friend', quirk: 'bounce through the clover', fav: 'sunny meadows' },
  Bloop: { noise: 'Bloop', pal: 'splashy pal', quirk: 'hum by the pond', fav: 'puddles' },
  Sunny: { noise: 'Peep', pal: 'sunshine', quirk: 'chase warm spots', fav: 'the daylight' },
  Mochi: { noise: 'Mrrow', pal: 'human', quirk: 'nap in a sunbeam', fav: 'soft cushions' },
  Leafy: { noise: 'Rustle', pal: 'gardener', quirk: 'listen to the trees', fav: 'fresh rain' },
  Bobo: { noise: 'Hmm', pal: 'pal', quirk: 'look for honey', fav: 'big hugs' },
  Pengu: { noise: 'Pweh', pal: 'waddle-buddy', quirk: 'slide down hills', fav: 'cool breezes' },
  Fluff: { noise: 'Baa', pal: 'friend', quirk: 'float like a cloud', fav: 'quiet corners' },
};
const T = [
  (p) => [`${p.noise}... hello?`, `Oh! Are you looking at me?`, `I like to ${p.quirk}. Alone. Mostly.`, `Is that a gift? ...No? Okay.`, `Maybe I will say hi tomorrow.`, `${p.noise}. The island is big, huh.`],
  (p) => [`${p.noise}! It is you, ${p.pal}!`, `I was just about to ${p.quirk}. Come along!`, `Do you like ${p.fav}? I love ${p.fav}.`, `You came back! That makes me happy.`, `Stay a little? There is no hurry.`, `${p.noise} ${p.noise}! Hello hello!`],
  (p) => [`Today I ${p.quirk} and thought of you.`, `${p.fav[0].toUpperCase() + p.fav.slice(1)} are better with you around.`, `${p.noise}! Want to hang out for a bit?`, `I saved a nice spot, just for us.`, `You always know what I like. How?`, `Let us make today a good one, ${p.pal}.`],
  (p) => [`You are my very best friend. ${p.noise}!`, `I could ${p.quirk} with you forever.`, `Remember when we met? I do. Every bit.`, `Whatever you do, ${p.pal}, I am proud of you.`, `The island feels like home because of you.`, `${p.noise}! Hugs? Hugs.`],
];
export function allLines(sp, tier) { const base = LINES[sp]?.[tier] || [], gen = T[tier](P[sp] || P.Puffle); return [...base, ...gen]; }
export const tierOf = (lvl) => (lvl <= 0 ? 0 : lvl <= 2 ? 1 : lvl <= 4 ? 2 : 3);

// ---- daily events keyed by day number. Always gentle bonuses, never scarcity. ----
export const EVENTS = [
  { id: 'petalrain', icon: '🌸', name: 'Petal Rain Day', blurb: 'Petals drift down from the sky. Every gem is worth +1 petal today!' },
  { id: 'berry', icon: '🍓', name: 'Berry Bonanza', blurb: 'The berries are extra juicy. Berries give +2 petals today!' },
  { id: 'firefly', icon: '✨', name: 'Firefly Night', blurb: 'Fireflies glow after dark. A cosy bonus quest is waiting.' },
  { id: 'cuddle', icon: '💞', name: 'Cuddle Day', blurb: 'Friends feel extra close. Friendship grows 1.5x faster today!' },
  { id: 'picnic', icon: '🧺', name: 'Picnic Day', blurb: 'Everyone brought snacks. Your daily gift is doubled!' },
];
export const eventFor = (day) => EVENTS[(Math.max(1, day) - 1) % EVENTS.length];

// ---- economy ----
export const GEM_VALUE = { pink: 1, blue: 1, green: 2, yellow: 3 };
export const COMBO_BONUS = { 5: 3, 10: 6, 15: 10 }; // collecting gems within 2s of each other

// ---- decor ----
// cat: Furniture | Garden | Lights | Structures | Paths. charm = Island Charm. kind: 'solid' | 'flat' | 'kit' (modular house piece).
// line:true pieces can be placed in a row by walking in Line mode. layer/elev are for kit pieces that stack.
export const DECOR_CATS = [{ id: 'Furniture', icon: '🪑' }, { id: 'Garden', icon: '🌷' }, { id: 'Lights', icon: '🏮' }, { id: 'Structures', icon: '🏡' }, { id: 'Paths', icon: '🪨' }, { id: 'Build kit', icon: '🧱' }];
const D = (id, name, icon, price, charm, cat, extra = {}) => ({ id, name, icon, price, charm, cat, kind: 'solid', ...extra });
export const DECOR = [
  D('d_path', 'Stone Path', '🪨', 10, 1, 'Paths', { kind: 'flat', line: true }),
  D('d_stones', 'Stepping Stones', '🟤', 12, 1, 'Paths', { kind: 'flat', line: true }),
  D('d_fence', 'Picket Fence', '🪵', 15, 1, 'Paths', { line: true }),
  D('d_sign', 'Signpost', '🪧', 30, 1, 'Furniture'),
  D('d_mailbox', 'Mailbox', '📮', 35, 2, 'Furniture'),
  D('d_lantern', 'Lantern', '🏮', 40, 2, 'Lights'),
  D('d_flowerbed', 'Flower Bed', '🌷', 50, 3, 'Garden'),
  D('d_bench', 'Cosy Bench', '🪑', 60, 3, 'Furniture'),
  D('d_table', 'Tea Table', '🫖', 75, 4, 'Furniture'),
  D('d_sapling', 'Cherry Sapling', '🌸', 70, 4, 'Garden'),
  D('d_hedge', 'Round Hedge', '🌳', 45, 2, 'Garden', { line: true }),
  D('d_mushlamp', 'Mushroom Lamp', '🍄', 80, 4, 'Lights'),
  D('d_lamppost', 'Lamp Post', '💡', 95, 4, 'Lights'),
  D('d_picnic', 'Picnic Blanket', '🧺', 90, 4, 'Furniture', { kind: 'flat' }),
  D('d_fairy', 'Fairy Ring', '🧚', 120, 6, 'Garden', { kind: 'flat' }),
  D('d_bridge', 'Garden Bridge', '🌉', 250, 9, 'Structures'),
  D('d_well', 'Wishing Well', '⛲', 300, 10, 'Structures'),
  D('d_gazebo', 'Gazebo', '⛺', 380, 13, 'Structures'),
  D('d_arch', 'Rainbow Arch', '🌈', 400, 14, 'Structures'),
  D('d_windmill', 'Windmill', '🌬️', 650, 20, 'Structures'),
  D('d_house', 'Little House', '🏡', 900, 30, 'Structures'),
  D('b_floor', 'Wood Floor', '🟫', 25, 1, 'Build kit', { kind: 'kit', layer: 0, elev: 0, line: true }),
  D('b_wall', 'Cottage Wall', '🧱', 30, 2, 'Build kit', { kind: 'kit', layer: 1, elev: 0 }),
  D('b_door', 'Doorway', '🚪', 40, 3, 'Build kit', { kind: 'kit', layer: 1, elev: 0 }),
  D('b_roof', 'Roof Piece', '🔺', 55, 3, 'Build kit', { kind: 'kit', layer: 2, elev: 2.0 }),
];
export const PLUSH_COLORS = { Puffle: '#ffa9cf', Bloop: '#86dcff', Sunny: '#ffe36e', Mochi: '#c9a9ff', Leafy: '#a6e585', Bobo: '#ffb766', Pengu: '#5fc4cf', Fluff: '#fff7fb' };
for (const sp of Object.keys(PLUSH_COLORS)) DECOR.push({ id: 'd_plush_' + sp, name: `${sp} Plushie`, icon: '🧸', price: 0, charm: 5, cat: 'Furniture', kind: 'solid', gift: `${sp} best friends`, species: sp });
export const DECOR_BY_ID = Object.fromEntries(DECOR.map(d => [d.id, d]));

// Island Charm milestones (total charm of placed decor).
export const CHARM_MS = [
  { at: 10, petals: 20, text: 'A cosy corner' }, { at: 25, petals: 40, text: 'A lovely little garden' },
  { at: 50, petals: 80, text: 'A charming island', item: 'tr_leaf' }, { at: 100, petals: 150, text: 'A dreamy island paradise' },
  { at: 200, petals: 300, text: 'The most charming island ever', item: 'hat_halo' },
];
