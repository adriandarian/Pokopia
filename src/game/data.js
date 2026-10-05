// Static content: species, wardrobe, quest templates.
export const SPECIES = [
  { id: 'Puffle', color: '#ff9ecb', blurb: 'Soft as a marshmallow. Loves sunny meadows.' },
  { id: 'Bloop', color: '#7fd7ff', blurb: 'Hops near the water and hums little songs.' },
  { id: 'Sunny', color: '#ffe066', blurb: 'Glows warmly and follows the daylight.' },
  { id: 'Mochi', color: '#c7a6ff', blurb: 'Sleepy and squishy. Best friend material.' },
  { id: 'Fluffo', color: '#ffb48a', blurb: 'A shy cloud-cat. Hasn\'t been seen yet!', hidden: true },
  { id: 'Minty', color: '#8ee6b8', blurb: 'Smells like fresh leaves after rain.', hidden: true },
  { id: 'Twinkle', color: '#fff0a8', blurb: 'Only comes out when the stars are shiny.', hidden: true },
  { id: 'Berry', color: '#ff7a9a', blurb: 'Collects berries and shares them.', hidden: true },
];

export const WARDROBE = [
  { id: 'hat_none', slot: 'hat', name: 'No hat', icon: '🙂', price: 0 },
  { id: 'hat_party', slot: 'hat', name: 'Party Hat', icon: '🎉', price: 15 },
  { id: 'hat_crown', slot: 'hat', name: 'Little Crown', icon: '👑', price: 40 },
  { id: 'hat_straw', slot: 'hat', name: 'Straw Hat', icon: '👒', price: 25 },
  { id: 'hat_cat', slot: 'hat', name: 'Cat Ears', icon: '🐱', price: 30 },
  { id: 'hat_flower', slot: 'hat', name: 'Flower Pot', icon: '🌷', price: 20 },
  { id: 'col_red', slot: 'color', name: 'Cherry', icon: '🍒', price: 0, value: '#ff6b6b' },
  { id: 'col_mint', slot: 'color', name: 'Mint', icon: '🌿', price: 10, value: '#5fd9a8' },
  { id: 'col_sky', slot: 'color', name: 'Sky', icon: '☁️', price: 10, value: '#5db8ff' },
  { id: 'col_sun', slot: 'color', name: 'Sunshine', icon: '🌻', price: 10, value: '#ffd24a' },
  { id: 'col_grape', slot: 'color', name: 'Grape', icon: '🍇', price: 15, value: '#a77bff' },
  { id: 'col_candy', slot: 'color', name: 'Candy', icon: '🍬', price: 15, value: '#ff8fcf' },
];

// Quest templates. `ev` is the event type that progresses it.
export const QUEST_POOL = [
  { id: 'gems10', ev: 'collect', goal: 10, icon: '💎', title: 'Gem Gatherer', desc: 'Collect 10 gems', reward: 12 },
  { id: 'gems25', ev: 'collect', goal: 25, icon: '✨', title: 'Sparkle Sack', desc: 'Collect 25 gems', reward: 25 },
  { id: 'befriend1', ev: 'befriend', goal: 1, icon: '💕', title: 'New Friend', desc: 'Befriend a creature', reward: 15 },
  { id: 'befriend3', ev: 'befriend', goal: 3, icon: '🫶', title: 'Popular Pal', desc: 'Befriend 3 creatures', reward: 30 },
  { id: 'discover2', ev: 'discover', goal: 2, icon: '🔍', title: 'Curious Explorer', desc: 'Discover 2 new creatures', reward: 20 },
  { id: 'gems5', ev: 'collect', goal: 5, icon: '🌸', title: 'Petal Picker', desc: 'Collect 5 gems', reward: 6 },
];
