// Static content: species (names match src/chars/species.js), wardrobe, quest templates, milestones.
// Currency is petals, earned only by playing. Nothing here is purchasable with real money.
export const SPECIES = [
  { id: 'Puffle', icon: '🐰', color: '#ffa9cf', fav: { berry: 'red', gem: 'pink' }, blurb: 'Soft as a marshmallow. Loves sunny meadows.' },
  { id: 'Bloop', icon: '💧', color: '#7fd7ff', fav: { berry: 'purple', gem: 'blue' }, blurb: 'A bouncy droplet that hums little songs.' },
  { id: 'Sunny', icon: '🐥', color: '#ffe066', fav: { berry: 'red', gem: 'yellow' }, blurb: 'Glows warmly and follows the daylight.' },
  { id: 'Mochi', icon: '🐱', color: '#c7a6ff', fav: { berry: 'purple', gem: 'pink' }, blurb: 'Sleepy and squishy. Best friend material.' },
  { id: 'Leafy', icon: '🌱', color: '#9ae27a', fav: { berry: 'purple', gem: 'green' }, blurb: 'Smells like fresh leaves after rain.' },
  { id: 'Bobo', icon: '🐻', color: '#ffb561', fav: { berry: 'red', gem: 'yellow' }, blurb: 'A big warm hugger with a honey-sweet heart.' },
  { id: 'Pengu', icon: '🐧', color: '#6fd0d6', fav: { berry: 'purple', gem: 'blue' }, blurb: 'Waddles everywhere, even on sand.' },
  { id: 'Fluff', icon: '🐑', color: '#ffd9ee', fav: { berry: 'red', gem: 'pink' }, blurb: 'A shy little cloud. Very, very fluffy.' },
];
export const BY_ID = Object.fromEntries(SPECIES.map(s => [s.id, s]));

// Item colour identification (matches colours used in src/creatures.js Collectibles).
export const BERRY_COLORS = { '#ff4d6d': 'red', '#9a6bff': 'purple' };
export const GEM_COLORS = { '#ff6fb0': 'pink', '#6fd0ff': 'blue', '#ffe066': 'yellow', '#8cf0b0': 'green' };
export const COLOR_ICON = { red: '🍓', purple: '🍇', pink: '💗', blue: '🔷', yellow: '⭐', green: '🍀' };
export const COLOR_SWATCH = { red: '#ff4d6d', purple: '#9a6bff', pink: '#ff6fb0', blue: '#6fd0ff', yellow: '#ffe066', green: '#8cf0b0' };

// slots: hat, shirt, hair, pack, sticker, trail.  `hero` = hat id understood by player.setOutfit; `value` = colour.
// `gift:'milestone id'` items cannot be bought; they unlock by playing (see MILESTONES).
const H = (id, name, icon, price, extra = {}) => ({ id: 'hat_' + id, slot: 'hat', name, icon, price, ...extra });
const C = (slot, id, name, icon, price, value) => ({ id: `${slot}_${id}`, slot, name, icon, price, value });
export const WARDROBE = [
  H('none', 'No hat', '🙂', 0),
  H('cap', 'Cap', '🧢', 30, { hero: 'cap' }),
  H('straw', 'Straw Hat', '👒', 50, { hero: 'straw' }),
  H('beanie', 'Cosy Beanie', '🧶', 80, { hero: 'beanie' }),
  H('flower', 'Flower Crown', '🌼', 120, { hero: 'flower' }),
  H('party', 'Party Hat', '🎉', 150, { hero: 'party' }),
  H('cat', 'Cat Ears', '🐱', 200, { hero: 'cat' }),
  H('wizard', 'Wizard Hat', '🧙', 350, { hero: 'wizard' }),
  H('crown', 'Little Crown', '👑', 450, { hero: 'crown' }),
  H('halo', 'Golden Halo', '😇', 0, { gift: 'm_journal', hero: 'halo' }),
  // shirt colours
  { id: 'col_red', slot: 'shirt', name: 'Cherry', icon: '🍒', price: 0, value: '#ff7a7a' },
  C('shirt', 'mint', 'Mint', '🌿', 40, '#5fd9a8'), C('shirt', 'sky', 'Sky', '☁️', 40, '#5db8ff'),
  C('shirt', 'sun', 'Sunshine', '🌻', 60, '#ffd24a'), C('shirt', 'grape', 'Grape', '🍇', 80, '#a77bff'),
  C('shirt', 'candy', 'Candy', '🍬', 80, '#ff8fcf'), C('shirt', 'ocean', 'Ocean', '🌊', 120, '#2f7fd8'),
  C('shirt', 'snow', 'Snowball', '⛄', 120, '#f4f8ff'), C('shirt', 'midnight', 'Midnight', '🌙', 200, '#3a3f7a'),
  { id: 'shirt_sunset', slot: 'shirt', name: 'Sunset', icon: '🌅', price: 0, value: '#ff9a5a', gift: 'm_gems100' },
  // hair colours
  { id: 'hair_brown', slot: 'hair', name: 'Cocoa', icon: '🍫', price: 0, value: '#6b4429' },
  C('hair', 'black', 'Ink', '🖤', 30, '#2b2430'), C('hair', 'blonde', 'Honey', '🍯', 60, '#f0c76a'),
  C('hair', 'ginger', 'Ginger', '🥕', 80, '#d96a2a'), C('hair', 'pink', 'Bubblegum', '🩷', 150, '#ff8fc0'),
  C('hair', 'blue', 'Blueberry', '🫐', 150, '#5f8dff'), C('hair', 'mint', 'Spearmint', '🍃', 200, '#6fe0b8'),
  C('hair', 'silver', 'Moonbeam', '🌕', 250, '#d8dcec'),
  // backpacks
  { id: 'pack_gold', slot: 'pack', name: 'Gold Pack', icon: '🎒', price: 0, value: '#ffc94d' },
  { id: 'pack_none', slot: 'pack', name: 'No pack', icon: '🚫', price: 0, value: null },
  C('pack', 'red', 'Red Pack', '❤️', 60, '#ff6b6b'), C('pack', 'teal', 'Teal Pack', '🩵', 60, '#3fc7b8'),
  C('pack', 'pink', 'Pink Pack', '🎀', 100, '#ff9ed0'), C('pack', 'navy', 'Navy Pack', '🌌', 100, '#3b4a9a'),
  // face stickers
  { id: 'st_none', slot: 'sticker', name: 'Clean face', icon: '🙂', price: 0, kind: null },
  { id: 'st_blush', slot: 'sticker', name: 'Rosy Blush', icon: '😊', price: 50, kind: 'blush' },
  { id: 'st_freckle', slot: 'sticker', name: 'Freckles', icon: '✨', price: 80, kind: 'freckle' },
  { id: 'st_heart', slot: 'sticker', name: 'Heart Cheeks', icon: '💕', price: 0, kind: 'heart', gift: 'm_friend3' },
  { id: 'st_star', slot: 'sticker', name: 'Star Cheeks', icon: '⭐', price: 0, kind: 'star', gift: 'm_bond3' },
  { id: 'st_flower', slot: 'sticker', name: 'Daisy Cheeks', icon: '🌼', price: 140, kind: 'flower' },
  // trails
  { id: 'tr_none', slot: 'trail', name: 'No trail', icon: '🚫', price: 0 },
  { id: 'tr_leaf', slot: 'trail', name: 'Leaf Trail', icon: '🍃', price: 150, trail: 'leaf' },
  { id: 'tr_sparkle', slot: 'trail', name: 'Sparkles', icon: '✨', price: 250, trail: 'sparkle' },
  { id: 'tr_petal', slot: 'trail', name: 'Petal Trail', icon: '🌸', price: 350, trail: 'petal' },
  { id: 'tr_heart', slot: 'trail', name: 'Heart Trail', icon: '💖', price: 500, trail: 'heart' },
  { id: 'tr_star', slot: 'trail', name: 'Star Dust', icon: '🌟', price: 700, trail: 'star' },
  { id: 'tr_rainbow', slot: 'trail', name: 'Rainbow Trail', icon: '🌈', price: 0, trail: 'rainbow', gift: 'm_friend8' },
];
export const SLOTS = [
  { id: 'hat', label: '👒 Hats' }, { id: 'shirt', label: '👕 Shirts' }, { id: 'hair', label: '💇 Hair' },
  { id: 'pack', label: '🎒 Packs' }, { id: 'sticker', label: '😊 Faces' }, { id: 'trail', label: '✨ Trails' },
];
export const DEFAULT_EQUIP = { hat: 'hat_none', shirt: 'col_red', hair: 'hair_brown', pack: 'pack_gold', sticker: 'st_none', trail: 'tr_none' };
export const DEFAULT_OWNED = ['hat_none', 'col_red', 'hair_brown', 'pack_gold', 'pack_none', 'st_none', 'tr_none'];

// Milestones: automatic rewards for playing. test(summary) -> bool.
export const MILESTONES = [
  { id: 'm_dis4', text: 'Discovered 4 creatures', test: s => s.discovered >= 4, petals: 25 },
  { id: 'm_friend3', text: 'Made 3 friends', test: s => s.friends >= 3, petals: 20, item: 'st_heart' },
  { id: 'm_gems100', text: 'Collected 100 gems', test: s => s.gems >= 100, petals: 30, item: 'shirt_sunset' },
  { id: 'm_bond3', text: 'Best-friend level with a creature', test: s => s.maxBond >= 3, petals: 40, item: 'st_star' },
  { id: 'm_journal', text: 'Journal complete: discovered all 8!', test: s => s.discovered >= 8, petals: 100, item: 'hat_halo' },
  { id: 'm_friend8', text: 'Befriended every species!', test: s => s.friends >= 8, petals: 150, item: 'tr_rainbow' },
];
// Friendship levels by gifts given to a species: level N reached at BOND_AT[N] gifts.
export const BOND_AT = [0, 1, 4, 9];

// Quest templates. `ev` = event; `match(e)` optional filter; `group` ensures a varied daily set.
const bf = SPECIES.map(s => ({ id: 'bf_' + s.id, group: 'befriendX', ev: 'befriend', match: e => e.species === s.id, goal: 1, icon: s.icon, title: `Meet ${s.id}`, desc: `Befriend a ${s.id}`, reward: 25 }));
const col = ['pink', 'blue', 'yellow', 'green'].map(c => ({ id: 'gc_' + c, group: 'colour', ev: 'pickup', match: e => e.kind === 'gem' && e.colorName === c, goal: 4, icon: COLOR_ICON[c], title: `${c[0].toUpperCase() + c.slice(1)} Hunt`, desc: `Collect 4 ${c} gems`, reward: 14 }));
export const QUEST_POOL = [
  { id: 'gems12', group: 'gems', ev: 'collect', goal: 12, icon: '💎', title: 'Gem Gatherer', desc: 'Collect 12 sparkles', reward: 10 },
  { id: 'gems30', group: 'gems', ev: 'collect', goal: 30, icon: '✨', title: 'Sparkle Sack', desc: 'Collect 30 sparkles', reward: 24 },
  { id: 'berry3', group: 'berries', ev: 'pickup', match: e => e.kind === 'berry', goal: 3, icon: '🍓', title: 'Berry Basket', desc: 'Pick 3 berries', reward: 10 },
  { id: 'gift2', group: 'gift', ev: 'gift', goal: 2, icon: '🎁', title: 'Kind Heart', desc: 'Give 2 gifts to creatures', reward: 16 },
  { id: 'gift_loved', group: 'gift', ev: 'gift', match: e => e.loved, goal: 1, icon: '💝', title: 'Perfect Present', desc: 'Give a creature its favourite', reward: 22 },
  { id: 'befriend1', group: 'befriend', ev: 'befriend', goal: 1, icon: '💕', title: 'New Friend', desc: 'Befriend a creature', reward: 15 },
  { id: 'befriend3', group: 'befriend', ev: 'befriend', goal: 3, icon: '🫶', title: 'Popular Pal', desc: 'Befriend 3 creatures', reward: 34 },
  { id: 'discover2', group: 'discover', ev: 'discover', match: e => !e.repeat, goal: 2, icon: '🔍', title: 'Curious Explorer', desc: 'Discover 2 new species', reward: 20 },
  { id: 'explore4', group: 'explore', ev: 'explore', goal: 4, icon: '🧭', title: 'Wanderer', desc: 'Visit 4 new corners of the island', reward: 18 },
  { id: 'explore8', group: 'explore', ev: 'explore', goal: 8, icon: '🗺️', title: 'Island Hopper', desc: 'Visit 8 new corners of the island', reward: 32 },
  { id: 'wear', group: 'wear', ev: 'equip', match: e => e.slot === 'hat' && e.id !== 'hat_none', goal: 1, icon: '🎩', title: 'Dress Up', desc: 'Put on a hat', reward: 8 },
  { id: 'emote', group: 'emote', ev: 'emote', goal: 2, icon: '💃', title: 'Show Off', desc: 'Do 2 emotes', reward: 8 },
  { id: 'decor2', group: 'decor', ev: 'place', goal: 2, icon: '🏡', title: 'Home Sweet Home', desc: 'Place 2 decorations on your island', reward: 22 },
  { id: 'decorbuy', group: 'decorbuy', ev: 'decorbuy', goal: 1, icon: '🛍️', title: 'Window Shopping', desc: 'Buy a decoration', reward: 12 },
  { id: 'wish1', group: 'wish', ev: 'wish', goal: 1, icon: '🌟', title: 'Wish Granter', desc: 'Grant a friend’s wish', reward: 30 },
  { id: 'level2', group: 'level', ev: 'levelup', goal: 1, icon: '💞', title: 'Growing Closer', desc: 'Deepen a friendship level', reward: 30 },
  { id: 'ev_firefly', group: 'event', ev: 'emote', match: e => e.name === 'dance', goal: 1, icon: '✨', title: 'Firefly Dance', desc: 'Dance under the fireflies', reward: 40 },
  ...bf, ...col,
];

// Rotating featured creature: one per day, cycles through the species. Bonus petals only; never expires anything.
export const featuredSpecies = (day) => SPECIES[(Math.max(1, day) - 1) % SPECIES.length];
