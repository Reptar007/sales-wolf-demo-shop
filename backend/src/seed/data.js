/**
 * Everything the demo starts from. Fictional throughout — no real brands, no
 * real people, no real card data (plan §3.5).
 *
 * Deterministic on purpose: the same product is out of stock after every reset,
 * so a QA Wolf flow written against it keeps passing until someone breaks it.
 */

export const CATEGORIES = [
  { slug: 'apparel', name: 'Apparel', description: 'Layers for every trail and every Tuesday.' },
  { slug: 'footwear', name: 'Footwear', description: 'Boots, trainers, and camp shoes.' },
  { slug: 'outdoor', name: 'Outdoor', description: 'Tents, packs, and the gear in between.' },
  { slug: 'home', name: 'Home', description: 'Den essentials for the pack.' },
  { slug: 'kitchen', name: 'Kitchen', description: 'Cook over flame or induction.' },
  { slug: 'tech', name: 'Tech', description: 'Gadgets that survive the wild.' },
];

const SIZES = ['S', 'M', 'L', 'XL'];
const SHOE_SIZES = ['7', '8', '9', '10', '11', '12'];

/**
 * [slug, name, priceCents, hue, description, variant shape, flags]
 * Variant shape: 'apparel' | 'shoes' | colors[] | null (single SKU).
 */
const PRODUCTS = {
  apparel: [
    [
      'howl-hoodie',
      'Howl Hoodie',
      6400,
      220,
      'Heavyweight brushed fleece with a kangaroo pocket big enough for trail snacks.',
      'apparel',
      ['featured'],
    ],
    [
      'moonrise-tee',
      'Moonrise Tee',
      2800,
      260,
      'Soft organic cotton tee with a moonrise print across the chest.',
      'apparel',
    ],
    [
      'alpha-rain-shell',
      'Alpha Rain Shell',
      14900,
      200,
      'Three-layer waterproof shell with pit zips and a helmet-compatible hood.',
      'apparel',
      ['featured'],
    ],
    [
      'packleader-vest',
      'Packleader Vest',
      8900,
      30,
      'Insulated vest that packs into its own chest pocket.',
      'apparel',
    ],
    [
      'den-joggers',
      'Den Joggers',
      5400,
      280,
      'Tapered joggers with a gusseted crotch for full range of movement.',
      'apparel',
    ],
    [
      'tundra-beanie',
      'Tundra Beanie',
      2400,
      10,
      'Merino-blend rib knit. Warm, itch-free, and machine washable.',
      ['Charcoal', 'Rust', 'Moss'],
    ],
    [
      'scout-flannel',
      'Scout Flannel Shirt',
      6200,
      0,
      'Brushed flannel in a classic buffalo check.',
      'apparel',
    ],
  ],
  footwear: [
    [
      'ridgeline-boot',
      'Ridgeline Hiking Boot',
      17900,
      25,
      'Waterproof leather boot with a grippy lugged outsole.',
      'shoes',
      ['featured'],
    ],
    [
      'trailhead-runner',
      'Trailhead Runner',
      12900,
      160,
      'Lightweight trail runner with a rock plate and quick-lace system.',
      'shoes',
    ],
    [
      'campfire-slide',
      'Campfire Slide',
      3900,
      40,
      'Recovery slide with a contoured footbed for post-hike feet.',
      'shoes',
    ],
    [
      'urban-prowler',
      'Urban Prowler Sneaker',
      9500,
      300,
      'Minimal everyday sneaker in suede and recycled mesh.',
      'shoes',
    ],
    [
      'snowpack-boot',
      'Snowpack Winter Boot',
      19900,
      190,
      'Insulated to -25°F with a removable felt liner.',
      'shoes',
    ],
    [
      'merino-hike-sock',
      'Merino Hike Sock (3-pack)',
      2600,
      120,
      'Cushioned merino socks that stay dry and odor-free.',
      ['Grey', 'Navy'],
    ],
    [
      'gaiter-pro',
      'Gaiter Pro',
      4500,
      90,
      'Breathable gaiters that keep scree and snow out of your boots.',
      null,
    ],
  ],
  outdoor: [
    [
      'lone-wolf-tent',
      'Lone Wolf 1P Tent',
      27900,
      100,
      'Ultralight single-wall tent that pitches with trekking poles.',
      null,
      ['featured'],
    ],
    [
      'pack-den-tent',
      'Pack Den 4P Tent',
      44900,
      130,
      'Roomy family tent with two doors and a full-coverage fly.',
      null,
    ],
    [
      'nightwatch-headlamp',
      'Nightwatch Headlamp',
      4900,
      50,
      '400-lumen rechargeable headlamp with a red night-vision mode.',
      null,
    ],
    [
      'ridge-pack-45',
      'Ridge Pack 45L',
      18900,
      150,
      'Ventilated backpacking pack with an adjustable torso.',
      ['Slate', 'Ember'],
    ],
    [
      'den-sleeping-bag',
      'Den Sleeping Bag 20°F',
      22900,
      230,
      'Recycled down bag with a draft collar and full-length zip.',
      null,
    ],
    [
      'trail-poles',
      'Carbon Trail Poles',
      13900,
      210,
      'Collapsible carbon poles with cork grips.',
      null,
    ],
    [
      'water-filter',
      'Clearstream Water Filter',
      3900,
      180,
      'Squeeze filter that removes 99.9999% of bacteria.',
      null,
    ],
  ],
  home: [
    [
      'fireside-throw',
      'Fireside Wool Throw',
      11900,
      15,
      'Lambswool throw woven in a tartan pattern.',
      ['Red', 'Forest'],
    ],
    [
      'howling-mug-set',
      'Howling Mug Set',
      3600,
      240,
      'Four stoneware mugs with a hand-glazed moon motif.',
      null,
    ],
    [
      'den-candle',
      'Den Candle',
      2800,
      35,
      'Cedar, smoke, and pine soy candle. 50-hour burn.',
      null,
    ],
    [
      'pack-photo-frame',
      'Pack Photo Frame',
      3200,
      60,
      'Reclaimed-wood frame that holds a 5×7 print.',
      null,
    ],
    [
      'moonlight-lamp',
      'Moonlight Lamp',
      7900,
      270,
      'Dimmable moon-textured lamp with a walnut base.',
      null,
    ],
    [
      'trail-map-print',
      'Trail Map Print',
      4400,
      110,
      'Archival topographic print of a fictional national park.',
      null,
    ],
    ['den-doormat', 'Den Doormat', 3400, 45, 'Coir doormat that says "Welcome to the Den".', null],
  ],
  kitchen: [
    [
      'cast-iron-skillet',
      'Cast Iron Skillet 10"',
      4900,
      5,
      'Pre-seasoned skillet that goes from campfire to oven.',
      null,
      ['featured'],
    ],
    [
      'camp-percolator',
      'Camp Percolator',
      5900,
      20,
      'Stainless percolator for strong camp coffee.',
      null,
    ],
    ['titanium-spork', 'Titanium Spork', 1200, 200, 'The only utensil you will ever pack.', null],
    [
      'trail-mix-sampler',
      'Trail Mix Sampler',
      2200,
      40,
      'Four small-batch trail mixes in resealable pouches.',
      null,
    ],
    [
      'ember-grill-tongs',
      'Ember Grill Tongs',
      2400,
      0,
      'Long-handled tongs with a locking hinge.',
      null,
    ],
    [
      'den-dutch-oven',
      'Den Dutch Oven',
      12900,
      350,
      'Enameled cast-iron Dutch oven, 5.5 quart.',
      ['Ink', 'Clay'],
    ],
    [
      'insulated-bottle',
      'Insulated Bottle 32oz',
      3800,
      170,
      'Keeps drinks cold for 24 hours or hot for 12.',
      ['Glacier', 'Pine', 'Dusk'],
    ],
  ],
  tech: [
    [
      'wolfpack-power-bank',
      'Wolfpack Power Bank',
      6900,
      210,
      '20,000 mAh bank with USB-C fast charging.',
      null,
      ['featured'],
    ],
    [
      'howl-speaker',
      'Howl Bluetooth Speaker',
      8900,
      250,
      'Waterproof speaker with 20-hour battery.',
      ['Black', 'Orange'],
    ],
    [
      'solar-panel',
      'Sunrise Solar Panel',
      11900,
      50,
      'Foldable 28W panel with two USB outputs.',
      null,
    ],
    [
      'trail-gps',
      'Trail GPS Watch',
      29900,
      190,
      'Multisport GPS watch with topo maps and 2-week battery.',
      null,
    ],
    [
      'camp-lantern',
      'Camp Lantern',
      5400,
      45,
      'Rechargeable lantern with a power-bank output.',
      null,
    ],
    [
      'ruggedized-case',
      'Ruggedized Phone Case',
      3900,
      230,
      'Drop-tested case with a lanyard loop.',
      null,
    ],
    [
      'emergency-radio',
      'Emergency Radio',
      6400,
      15,
      'Hand-crank weather radio with flashlight and charger.',
      null,
    ],
  ],
};

/** Hand-picked stock states, so the demo always shows each one. */
const STOCK_OVERRIDES = {
  'snowpack-boot': 0, // fully out of stock
  'pack-den-tent': 2, // "only 2 left"
  'trail-gps': 1,
  'gaiter-pro': 0,
};

const REVIEWERS = [
  'Avery M.',
  'Jordan K.',
  'Riley P.',
  'Sam T.',
  'Casey L.',
  'Morgan D.',
  'Quinn R.',
  'Drew S.',
];

const REVIEW_LINES = [
  [5, 'Exactly what I needed', 'Arrived quickly and the quality is better than I expected.'],
  [4, 'Solid, one small gripe', 'Works great. Sizing runs slightly small, so consider going up.'],
  [5, 'Pack favorite', 'Bought one for myself and two more as gifts.'],
  [3, 'Good, not great', 'Does the job, but I expected a little more for the price.'],
  [5, 'Survived a storm', 'Took this on a wet weekend trip and it held up perfectly.'],
  [2, 'Not for me', 'Quality is fine but it did not suit how I use it. Returned easily.'],
  [4, 'Would buy again', 'Comfortable, well made, and the color is great in person.'],
];

/** Small deterministic PRNG so every reset produces the same catalog. */
function seeded(n) {
  const x = Math.sin(n * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

function variantsFor(slug, shape, priceCents, index) {
  const forced = STOCK_OVERRIDES[slug];
  const stockAt = (i) =>
    forced !== undefined ? forced : 3 + Math.floor(seeded(index * 31 + i) * 40);
  const sku = (...parts) => [slug, ...parts].join('-').toUpperCase();

  if (shape === 'apparel') {
    return ['Black', 'Heather'].flatMap((color, c) =>
      SIZES.map((size, s) => ({
        sku: sku(color, size),
        size,
        color,
        priceCents: size === 'XL' ? priceCents + 400 : priceCents,
        stock: stockAt(c * 10 + s),
      })),
    );
  }
  if (shape === 'shoes') {
    return SHOE_SIZES.map((size, s) => ({
      sku: sku(size),
      size,
      color: null,
      priceCents,
      stock: stockAt(s),
    }));
  }
  if (Array.isArray(shape)) {
    return shape.map((color, c) => ({
      sku: sku(color),
      size: null,
      color,
      priceCents,
      stock: stockAt(c),
    }));
  }
  return [{ sku: sku('STD'), size: null, color: null, priceCents, stock: stockAt(0) }];
}

function reviewsFor(index) {
  const count = Math.floor(seeded(index * 7) * 6);
  return Array.from({ length: count }, (_, i) => {
    const [rating, title, body] = REVIEW_LINES[(index + i * 3) % REVIEW_LINES.length];
    return {
      author: REVIEWERS[(index + i) % REVIEWERS.length],
      rating,
      title,
      body,
      createdAt: new Date(Date.UTC(2026, 6, 1 + ((index * 5 + i * 11) % 60))),
    };
  });
}

export function buildProducts() {
  let index = 0;
  return Object.entries(PRODUCTS).flatMap(([categorySlug, rows]) =>
    rows.map(([slug, name, priceCents, hue, description, shape, flags = []]) => {
      index += 1;
      const reviews = reviewsFor(index);
      const ratingCount = reviews.length;
      const ratingAverage = ratingCount
        ? Math.round((reviews.reduce((sum, r) => sum + r.rating, 0) / ratingCount) * 10) / 10
        : 0;
      return {
        categorySlug,
        slug,
        name,
        description,
        basePriceCents: priceCents,
        hue,
        imageCount: 3,
        featured: flags.includes('featured'),
        ratingAverage,
        ratingCount,
        createdAt: new Date(Date.UTC(2026, 5, index)),
        variants: variantsFor(slug, shape, priceCents, index),
        reviews,
      };
    }),
  );
}

/**
 * Known credentials, printed in the README so any SE can pick the demo up cold.
 * These are fictional accounts on a `.test` domain, which can never receive mail.
 */
export const DEMO_PASSWORD = 'WolfMart!2026';

const order = (number, slug, status, daysAgo, quantity = 1) => ({
  number,
  slug,
  status,
  daysAgo,
  quantity,
});

/**
 * `demo@` is the generic account. Each SE also gets their own, so two people
 * demoing at once never share a cart or order history. Add a teammate by
 * adding a row; their order numbers just need to be unique.
 */
export const DEMO_USERS = [
  {
    email: 'demo@wolfmart.test',
    name: 'Dana Demo',
    history: [
      order('WM-100001', 'howl-hoodie', 'DELIVERED', 40),
      order('WM-100002', 'cast-iron-skillet', 'SHIPPED', 3, 2),
    ],
  },
  {
    email: 'sebastian@wolfmart.test',
    name: 'Sebastian',
    history: [
      order('WM-100011', 'lone-wolf-tent', 'DELIVERED', 25),
      order('WM-100012', 'howl-speaker', 'PROCESSING', 1),
    ],
  },
  {
    email: 'ricky@wolfmart.test',
    name: 'Ricky',
    history: [
      order('WM-100021', 'ridgeline-boot', 'DELIVERED', 32),
      order('WM-100022', 'insulated-bottle', 'SHIPPED', 4, 2),
    ],
  },
  {
    email: 'jun@wolfmart.test',
    name: 'Jun',
    history: [
      order('WM-100031', 'trail-gps', 'DELIVERED', 18),
      order('WM-100032', 'fireside-throw', 'PLACED', 0),
    ],
  },
  {
    email: 'becca@wolfmart.test',
    name: 'Becca',
    history: [
      order('WM-100041', 'alpha-rain-shell', 'DELIVERED', 21),
      order('WM-100042', 'camp-percolator', 'SHIPPED', 2),
    ],
  },
  {
    email: 'dion@wolfmart.test',
    name: 'Dion',
    history: [
      order('WM-100051', 'ridge-pack-45', 'DELIVERED', 35),
      order('WM-100052', 'wolfpack-power-bank', 'PROCESSING', 1, 2),
    ],
  },
  {
    email: 'ian@wolfmart.test',
    name: 'Ian',
    history: [
      order('WM-100061', 'den-sleeping-bag', 'DELIVERED', 28),
      order('WM-100062', 'moonlight-lamp', 'PLACED', 0),
    ],
  },
  // Empty accounts, for showing a first-time customer.
  { email: 'alpha@wolfmart.test', name: 'Alex Alpha' },
  { email: 'pack@wolfmart.test', name: 'Pat Pack' },
];

export const PROMO_CODES = [
  { code: 'WOLF10', description: '10% off your order', percentOff: 10 },
  {
    code: 'PACK20',
    description: '$20 off orders of $100 or more',
    amountOffCents: 2000,
    minSubtotalCents: 10000,
  },
  {
    code: 'HOWL2024',
    description: 'Last season’s code — expired',
    percentOff: 25,
    expiresAt: new Date(Date.UTC(2024, 11, 31)),
  },
];

/** Plan §6.4. `proves` is written to be read aloud on a call. */
export const CHAOS_FLAGS = [
  {
    key: 'checkout_500',
    label: 'Checkout returns 500',
    description: 'Placing an order fails with a server error.',
    proves: 'QA Wolf catches a failed order completion — the most expensive bug a store can ship.',
  },
  {
    key: 'cart_total_drift',
    label: 'Cart total drifts by $1',
    description: 'The order summary total is $1.00 higher than its line items add up to.',
    proves: 'Assertions on the order summary catch a pricing bug a human skims right past.',
  },
  {
    key: 'search_latency',
    label: 'Search takes 4 seconds',
    description: 'Every catalog search waits four seconds before responding.',
    proves: 'A performance regression shows up as a timeout before customers start complaining.',
  },
  {
    key: 'login_flake',
    label: 'Login fails 1 in 3',
    description: 'One sign-in attempt in three is rejected even with correct credentials.',
    proves: 'Flaky auth is flagged across runs instead of being dismissed as a one-off.',
  },
  {
    key: 'stock_race',
    label: 'Stock race at checkout',
    description: 'Items look in stock and add to cart, then checkout rejects them as sold out.',
    proves: 'A race condition at purchase time is caught end to end, not just at the API.',
  },
  {
    key: 'image_404',
    label: 'Product images 404',
    description: 'Every product image request returns 404.',
    proves: 'Broken assets are detected even when the page itself still loads.',
  },
  {
    key: 'promo_expired',
    label: 'Valid promo silently rejected',
    description: 'Valid promo codes appear to apply but no discount is taken.',
    proves: 'Discount logic regressions are caught by asserting the actual total.',
  },
];
