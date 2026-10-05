// Relationship, wish, dialogue, event and decor content. Pure data (builders live in decor.js).

// ---- friendship levels (points per species). Level 1 = "Friend" (the creature follows you). ----
export const LEVEL_AT = [0, 16, 36, 65, 105, 165, 260];
export const LEVEL_NAME = ['Shy', 'Friend', 'Buddy', 'Pal', 'Close pal', 'Dear friend', 'Best friend'];
export const MAX_LEVEL = LEVEL_AT.length - 1;
export const levelOf = (pts = 0) => LEVEL_AT.reduce((l, n, i) => (pts >= n ? i : l), 0);

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
// charm = contribution to Island Charm. kind: 'solid' blocks neighbours, 'flat' can overlap.
export const DECOR = [
  { id: 'd_path', name: 'Stone Path', icon: '🪨', price: 10, charm: 1, kind: 'flat' },
  { id: 'd_fence', name: 'Picket Fence', icon: '🚧', price: 15, charm: 1, kind: 'solid' },
  { id: 'd_sign', name: 'Signpost', icon: '🪧', price: 30, charm: 1, kind: 'solid' },
  { id: 'd_lantern', name: 'Lantern', icon: '🏮', price: 40, charm: 2, kind: 'solid' },
  { id: 'd_flowerbed', name: 'Flower Bed', icon: '🌷', price: 50, charm: 3, kind: 'solid' },
  { id: 'd_bench', name: 'Cosy Bench', icon: '🪑', price: 60, charm: 3, kind: 'solid' },
  { id: 'd_sapling', name: 'Cherry Sapling', icon: '🌸', price: 70, charm: 4, kind: 'solid' },
  { id: 'd_mushlamp', name: 'Mushroom Lamp', icon: '🍄', price: 80, charm: 4, kind: 'solid' },
  { id: 'd_picnic', name: 'Picnic Blanket', icon: '🧺', price: 90, charm: 4, kind: 'flat' },
  { id: 'd_fairy', name: 'Fairy Ring', icon: '🧚', price: 120, charm: 6, kind: 'flat' },
  { id: 'd_bridge', name: 'Garden Bridge', icon: '🌉', price: 250, charm: 9, kind: 'solid' },
  { id: 'd_well', name: 'Wishing Well', icon: '⛲', price: 300, charm: 10, kind: 'solid' },
  { id: 'd_arch', name: 'Rainbow Arch', icon: '🌈', price: 400, charm: 14, kind: 'solid' },
  { id: 'd_windmill', name: 'Windmill', icon: '🌬️', price: 650, charm: 20, kind: 'solid' },
  { id: 'd_house', name: 'Little House', icon: '🏡', price: 900, charm: 30, kind: 'solid' },
];
export const PLUSH_COLORS = { Puffle: '#ffa9cf', Bloop: '#86dcff', Sunny: '#ffe36e', Mochi: '#c9a9ff', Leafy: '#a6e585', Bobo: '#ffb766', Pengu: '#5fc4cf', Fluff: '#fff7fb' };
for (const sp of Object.keys(PLUSH_COLORS)) DECOR.push({ id: 'd_plush_' + sp, name: `${sp} Plushie`, icon: '🧸', price: 0, charm: 5, kind: 'solid', gift: `${sp} best friends`, species: sp });
export const DECOR_BY_ID = Object.fromEntries(DECOR.map(d => [d.id, d]));

// Island Charm milestones (total charm of placed decor).
export const CHARM_MS = [
  { at: 10, petals: 20, text: 'A cosy corner' }, { at: 25, petals: 40, text: 'A lovely little garden' },
  { at: 50, petals: 80, text: 'A charming island', item: 'tr_leaf' }, { at: 100, petals: 150, text: 'A dreamy island paradise' },
  { at: 200, petals: 300, text: 'The most charming island ever', item: 'hat_halo' },
];
