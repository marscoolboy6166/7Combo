-- ============================================================
-- 7Combo — seed data
-- Real Thai 7-Eleven products with approximate prices (THB).
-- Safe to re-run: all inserts use ON CONFLICT / existence guards.
-- ============================================================

-- Defensive: ensure columns added in later schema versions exist,
-- so seeding works even against a database created from an older schema.
alter table public.combos add column if not exists author_name text;

-- ---------- products ----------
insert into public.products (slug, name_en, name_th, category, price_thb, description, emoji, cities) values
  -- Drinks
  ('oishi-green-tea-honey-lemon', 'Oishi Green Tea Honey-Lemon', 'โออิชิ ชาเขียว น้ำผึ้งมะนาว', 'drink', 20, 'The classic bottled green tea — half sweetness, always chilled.', '🍵', '{all}'),
  ('ichitan-green-tea', 'Ichitan Green Tea Original', 'อิชิตัง ชาเขียว', 'drink', 15, 'Smooth bottled green tea, great mixed into tea hacks.', '🍵', '{all}'),
  ('cha-tra-mue-thai-milk-tea', 'Cha Tra Mue Thai Milk Tea (bottle)', 'ชาตรามือ', 'drink', 29, 'The famous hand-numbered Thai tea, bottled and chilled.', '🧋', '{all}'),
  ('meiji-fresh-milk', 'Meiji Fresh Milk', 'นมสดเมจิ', 'drink', 17, 'Plain pasteurized fresh milk, small bottle.', '🥛', '{all}'),
  ('meiji-chocolate-milk', 'Meiji Chocolate Milk', 'นมเมจิ ช็อกโกแลต', 'drink', 15, 'Thai childhood in a bottle. Chug-worthy.', '🥛', '{all}'),
  ('dutch-mill-yoghurt-drink', 'Dutch Mill Yoghurt Drink (Strawberry)', 'ดัชมิลล์ โยเกิร์ตดริ้งค์ สตรอว์เบอร์รี', 'drink', 12, 'Sweet tangy drinking yoghurt.', '🧃', '{all}'),
  ('lactasoy-original', 'Lactasoy Original Soy Milk', 'นมเต้าหู้ แลคตาซอย', 'drink', 10, 'The tiny boxed soy milk everyone grabs.', '🥛', '{all}'),
  ('krating-daeng', 'Krating Daeng (Red Bull, glass bottle)', 'กระทิงแดง', 'drink', 15, 'The original sweet energy tonic in the little brown bottle.', '⚡', '{all}'),
  ('v-energy-drink', 'V Energy Drink', 'พลังงานวี', 'drink', 20, 'Big can, big caffeine, very Thai.', '⚡', '{all}'),
  ('espresso-chang', 'Espresso Chang Canned Coffee', 'เอสเปรสโซ ช้าง', 'drink', 15, 'Sweet canned espresso — fridge-cold is the move.', '☕', '{all}'),
  ('pokka-mocha-coffee', 'Pokka Mocha Coffee', 'พ็อกกา โมคา', 'drink', 18, 'Smooth canned mocha coffee.', '☕', '{all}'),
  ('coca-cola', 'Coca-Cola', 'โคคา-โคลา', 'drink', 15, 'You know this one.', '🥤', '{all}'),
  ('coke-zero', 'Coke Zero', 'โค้ก ซีโร่', 'drink', 15, 'Same fizz, zero sugar.', '🥤', '{all}'),
  ('singha-soda-water', 'Singha Soda Water', 'น้ำโซดา สิงห์', 'drink', 14, 'Big bottle of soda water — the base of many hacks.', '🫧', '{all}'),

  -- Snacks
  ('lays-salted-plum', 'Lay''s Norwegian Salted Plum', 'เลย์ พลัมเค็ม', 'chips', 20, 'Sweet-salty-umami chips, weirdly addictive.', '🥔', '{all}'),
  ('lays-nori-seaweed', 'Lay''s Nori Seaweed', 'เลย์ สาหร่ายโนริ', 'chips', 20, 'Seaweed-flavored chips, savory and crisp.', '🥔', '{all}'),
  ('doritos-nacho-cheese', 'Doritos Nacho Cheese', 'โดริโตส นาโชชีส', 'chips', 25, 'Bold cheese triangles.', '🌽', '{all}'),
  ('taro-fish-snack', 'Taro Fish Snack (Original)', 'ทาโร่ ปลาแท้', 'snack', 10, 'Paper-thin crispy fish sheets. A combo-maker''s best friend.', '🐟', '{all}'),
  ('oriental-kitchen-squid-snack', 'Oriental Kitchen Squid Snack', 'สาหร่ายปลาหมึก', 'snack', 10, 'Crunchy squid sheets, salty ocean flavor.', '🦑', '{all}'),
  ('tao-kae-noi-crispy-seaweed', 'Tao Kae Noi Crispy Seaweed', 'ท๊อป สาหร่ายทอดกรอบ', 'snack', 10, 'Brittle, oil-roasted seaweed sheets.', '🌿', '{all}'),
  ('koh-kae-coconut-peanuts', 'Koh-Kae Coconut Cream Peanuts', 'โก๋แก่ กะทิ', 'snack', 15, 'Classic crunchy coated peanuts.', '🥜', '{all}'),
  ('calbee-shrimp-chips', 'Calbee Shrimp Chips', 'คาลบี กุ้ง', 'chips', 20, 'Puffed prawn crisps.', '🍤', '{all}'),
  ('pretz-tomato', 'Pretz Tomato', 'เพรทซ์ รสมะเขือเทศ', 'chips', 10, 'Skinny pretzel sticks, tomato flavor.', '🥨', '{all}'),
  ('kitkat', 'KitKat Original', 'คิทแคท', 'candy', 15, 'Chilled, it snaps better.', '🍫', '{all}'),
  ('snickers', 'Snickers', 'สนิกเกอร์', 'candy', 20, 'Peanuts, caramel, nougat.', '🍫', '{all}'),
  ('pocky-strawberry', 'Pocky Strawberry', 'พอคกี้ สตรอว์เบอร์รี', 'candy', 15, 'Biscuit sticks, strawberry cream.', '🍓', '{all}'),

  -- Sauces
  ('maepranom-sweet-chili', 'Maepranom Sweet Chili Sauce', 'น้ำจิ้มไก่ แม่ประนอม', 'sauce', 32, 'Thailand''s chicken-dipping sweet chili.', '🌶️', '{all}'),
  ('sriraja-panich-sriracha', 'Sriraja Panich Sriracha', 'ศรีราชาพานิช', 'sauce', 35, 'The original Thai sriracha — tangy, garlicky heat.', '🌶️', '{all}'),
  ('sriracha-mayo-packet', 'Sriracha Mayo Packet', 'มายองเนสศรีราชา', 'sauce', 10, 'Squeeze packet of spicy mayo — the cheat code.', '🥫', '{all}'),
  ('squid-brand-fish-sauce', 'Squid Brand Fish Sauce (mini)', 'น้ำปลาตราปลาหมึก', 'sauce', 20, 'Umami bomb in a small bottle.', '🐟', '{all}'),
  ('maggi-seasoning', 'Maggi Seasoning (mini)', 'ซอสปรุงรส มักกี้', 'sauce', 18, 'A few drops fix everything savory.', '🟡', '{all}'),
  ('mayonnaise', 'Mayonnaise (Kewpie-style)', 'มายองเนส', 'sauce', 35, 'Rich, tangy mayo — half of every good dip.', '🥫', '{all}'),
  ('suki-sauce', 'Suki Sauce', 'น้ำจิ้มสุกี้', 'sauce', 30, 'Sweet-spicy sukiyaki dip.', '🥫', '{all}'),
  ('mala-hotpot-sauce', 'Mala Hotpot Sauce', 'ซอสหม่าล่า', 'sauce', 45, 'Numbing Sichuan heat in a pouch.', '🔥', '{bangkok,chiangmai,phuket}'),
  ('nam-prik-kapi', 'Shrimp Paste Chili Dip (Nam Prik Kapi)', 'น้ำพริกกะปิ', 'sauce', 28, 'Pungent, salty, beloved.', '🦐', '{all}'),
  ('parmesan-powder', 'Parmesan Cheese Powder Shaker', 'ผงชีสพาร์เมซาน', 'sauce', 25, 'Shaker of cheesy umami dust.', '🧀', '{all}'),

  -- Ready to eat
  ('imitation-crab-sticks', 'Imitation Crab Sticks (chilled)', 'เกาไหร่ / ปูอัด', 'ready-to-eat', 20, 'Chilled shredded crab sticks — the dippable legend.', '🦀', '{all}'),
  ('edamame', 'Edamame (chilled pack)', 'เอดามาเมะ', 'ready-to-eat', 25, 'Salted soybean pods, ready to snack.', '🫛', '{bangkok,chiangmai,phuket,pattaya}'),
  ('hard-boiled-eggs', 'Hard-Boiled Eggs 2-pack', 'ไข่ต้มสุก 2 ฟอง', 'ready-to-eat', 15, 'Protein on the go.', '🥚', '{all}'),
  ('onigiri-tuna-mayo', 'Onigiri Tuna Mayo', 'โอนิกิริ ทูน่ามายองเนส', 'ready-to-eat', 25, 'Triangular rice ball, tuna mayo center.', '🍙', '{all}'),
  ('salmon-sushi-pack', 'Salmon Sushi Pack', 'ซูชิแซลมอน', 'ready-to-eat', 49, 'A little box of nigiri.', '🍣', '{bangkok,chiangmai,phuket}'),
  ('toastie-ham-cheese', 'Toastie Ham & Cheese', 'แซนด์วิชชีสแฮมอบ', 'ready-to-eat', 35, 'Grilled ham-and-cheese sandwich from the hot case.', '🥪', '{all}'),
  ('chicken-basil-rice', 'Chicken Basil Rice Box', 'ข้าวกะเพราไก่ไข่ดาว', 'ready-to-eat', 45, 'Khao krapao with a fried egg, microwave and go.', '🍱', '{all}'),
  ('hot-dog-roller', 'Hot Dog on the Roller', 'ฮอทดอก', 'ready-to-eat', 15, 'The spinning rollers deliver.', '🌭', '{all}'),
  ('pork-salapao', 'Pork Salapao (Steamed Bun)', 'ซาลาเปาไส้หมู', 'ready-to-eat', 15, 'Fluffy steamed bun, savory pork filling.', '🥟', '{all}'),
  ('hot-case-chicken-wings', 'Hot Case Chicken Wings', 'ปีกไก่ทอด', 'ready-to-eat', 35, 'Fried wings in the warming case.', '🍗', '{all}'),
  ('fresh-salad-cup', 'Fresh Salad Cup', 'สลัดผัก', 'ready-to-eat', 45, 'Crunchy vegetables with a little dressing.', '🥗', '{all}'),
  ('tuna-in-water-can', 'Tuna in Water (can)', 'ทูน่าน้ำเกลือ', 'ready-to-eat', 45, 'Pull-tab tuna, protein for hacks.', '🐟', '{all}'),
  ('quail-eggs', 'Quail Eggs (boiled, pack)', 'ไข่นกกระทาต้ม', 'ready-to-eat', 12, 'Tiny eggs, big snack energy.', '🥚', '{all}'),
  ('butter-croissant', 'Butter Croissant', 'ครัวซองต์เนย', 'ready-to-eat', 15, 'Flaky, buttery, always near the till.', '🥐', '{all}'),

  -- Frozen
  ('fish-roe-tobiko', 'Fish Roe (Tobiko) Pack', 'ไข่ปลาโทบิโกะ', 'frozen', 39, 'Little poppy fish roe — the viral dip starter.', '🔴', '{bangkok,chiangmai,phuket}'),
  ('shrimp-wontons', 'Shrimp Wontons (frozen)', 'เกี๊ยวกุ้ง', 'frozen', 35, 'Boil-at-home or hack in-store.', '🥟', '{all}'),
  ('fish-tofu-balls', 'Fish Tofu Balls', 'ลูกชิ้นปลา', 'frozen', 30, 'Bouncy fish balls for noodle hacks.', '🐟', '{all}'),
  ('frozen-fries', 'French Fries (frozen)', 'เฟรนช์ฟรายส์', 'frozen', 35, 'Air-fry at home for instant fries.', '🍟', '{all}'),
  ('chicken-karaage', 'Chicken Karaage (frozen)', 'ไก่คาราอาเงะ', 'frozen', 45, 'Japanese-style fried chicken bites.', '🍗', '{bangkok,chiangmai}'),
  ('coconut-ice-cream-cup', 'Coconut Ice Cream Cup', 'ไอศกรีมกะทิ', 'frozen', 15, 'Cold, creamy, coconutty.', '🥥', '{all}'),
  ('vanilla-ice-cream-cup', 'Vanilla Ice Cream Cup', 'ไอศกรีมวานิลลา', 'frozen', 15, 'The affogato base of champions.', '🍦', '{all}'),
  ('mochi-ice-cream', 'Mochi Ice Cream 3-pack', 'โมจิไอศกรีม', 'frozen', 29, 'Chewy mochi shells, cold centers.', '🍡', '{all}'),

  -- Instant noodles
  ('mama-tom-yum', 'Mama Tom Yum Goong (instant)', 'มาม่า ต้มยำกุ้ง', 'instant-noodles', 14, 'The national noodle. Accept no substitutes.', '🍜', '{all}'),
  ('mama-mala', 'Mama Mala (instant)', 'มาม่า หม่าล่า', 'instant-noodles', 16, 'The spicy-numbing cousin of classic Mama.', '🍜', '{bangkok,chiangmai,phuket,pattaya}'),
  ('mama-pa-lo', 'Mama Pa-Lo (stewed pork)', 'มาม่า พะโล้หมู', 'instant-noodles', 14, 'Five-spice stewed pork flavor.', '🍜', '{all}'),
  ('wai-wai-oriental', 'Wai Wai Oriental Style', 'ไวไว', 'instant-noodles', 12, 'The other classic — softer noodles, mellow broth.', '🍜', '{all}'),
  ('yentafo-instant', 'Yen Ta Fo Instant Noodles', 'เย็นตาโฟ บะหมี่เกี๊ยว', 'instant-noodles', 15, 'Pink sauce noodle soup, sweet-savory.', '🍜', '{all}'),
  ('nissin-cup-seafood', 'Nissin Cup Noodles Seafood', 'คัพนู้ดเดิลส์ ซีฟู้ด', 'instant-noodles', 20, 'Cup format, seafood broth.', '🍜', '{all}'),
  ('tom-yum-kung-cup', 'Tom Yum Kung Cup Noodles', 'ต้มยำกุ้งคัพ', 'instant-noodles', 18, 'Cup-sized tom yum with dried shrimp.', '🍜', '{all}'),
  ('instant-jok', 'Instant Jok (rice porridge)', 'โจ๊กกึ่งสำเร็จรูป', 'instant-noodles', 14, 'Breakfast porridge in a pouch.', '🥣', '{all}'),
  ('pad-thai-instant', 'Pad Thai Instant Bowl', 'ผัดไทยกึ่งสำเร็จรูป', 'instant-noodles', 22, 'National dish, instant-ified.', '🍤', '{all}'),

  -- Desserts
  ('mango-sticky-rice', 'Mango Sticky Rice (chilled)', 'ข้าวเหนียวมะม่วง', 'dessert', 45, 'Seasonal chilled classic.', '🥭', '{all}'),
  ('red-bean-bun', 'Red Bean Bun', 'ขนมปังไส้ถั่วแดง', 'dessert', 15, 'Soft bun, sweet red bean paste.', '🍞', '{all}'),
  ('thai-tea-custard-bread', 'Thai Tea Custard Bread', 'ขนมปังชาไทยคัสตาร์ด', 'dessert', 25, 'Soft bread, Thai-tea custard core.', '🍞', '{bangkok,chiangmai}'),
  ('meiji-yoghurt-cup', 'Meiji Yoghurt Cup (Original)', 'โยเกิร์ตเมจิ', 'dessert', 15, 'Chilled spoonable yoghurt.', '🥛', '{all}'),
  ('coffee-pudding', 'Coffee Pudding Cup', 'พุดดิ้งกาแฟ', 'dessert', 12, 'Silky coffee jelly-ish pudding.', '🍮', '{all}'),
  ('butter-roll-bread', 'Butter Roll Bread', 'ขนมปังเนย', 'dessert', 12, 'Pillowy rolls — combo building material.', '🍞', '{all}'),
  ('banana-cake-pack', 'Banana Cake Pack', 'เค้กกล้วย', 'dessert', 15, 'Steamed banana cake in a foil cup.', '🍌', '{all}')
on conflict (slug) do update set
  name_en = excluded.name_en,
  name_th = excluded.name_th,
  category = excluded.category,
  price_thb = excluded.price_thb,
  description = excluded.description,
  emoji = excluded.emoji,
  cities = excluded.cities,
  is_active = true;

-- ---------- example combos ----------
-- Combo 1: the viral crab-stick dip
insert into public.combos (slug, title, description, steps)
select 'crab-stick-fish-roe-dip',
       'Crab Stick Fish Roe Dip',
       'The legendary viral hack: poppy fish roe folded into creamy mayo, dipped with ice-cold crab sticks. Salty, creamy, crunchy-poppy — dangerously snackable.',
       E'1. Chill the crab sticks and fish roe first — cold is essential.\n2. Squeeze the fish roe into a cup and add 2 big spoons of mayo.\n3. Stir until it turns sunset-pink and uniform.\n4. Peel the crab sticks, twist into bundles, and dip.'
where not exists (select 1 from public.combos where slug = 'crab-stick-fish-roe-dip');

insert into public.combo_items (combo_id, product_id, quantity, notes)
select c.id, p.id, v.quantity, v.notes
from public.combos c
join (values
  ('fish-roe-tobiko', 1, 'the star of the show'),
  ('mayonnaise', 1, null),
  ('imitation-crab-sticks', 2, 'keep them ice cold')
) as v(slug, quantity, notes) on true
join public.products p on p.slug = v.slug
where c.slug = 'crab-stick-fish-roe-dip'
  and not exists (select 1 from public.combo_items where combo_id = c.id);

-- Combo 2: Mama fries
insert into public.combos (slug, title, description, steps)
select 'mama-tom-yum-crunch',
       'Mama Tom Yum Crunch',
       'Upgraded instant noodles: tom yum broth topped with crushed Taro fish snack for a crispy, savory finish. Costs under ฿25 and eats like a full meal.',
       E'1. Buy a Mama Tom Yum and a Taro fish snack.\n2. Crush the Taro packet inside its bag.\n3. Make the Mama with hot water at the counter.\n4. Pour half the crushed Taro over the noodles. Save the rest to snack on.'
where not exists (select 1 from public.combos where slug = 'mama-tom-yum-crunch');

insert into public.combo_items (combo_id, product_id, quantity, notes)
select c.id, p.id, v.quantity, v.notes
from public.combos c
join (values
  ('mama-tom-yum', 1, null),
  ('taro-fish-snack', 1, 'crush it for the topping')
) as v(slug, quantity, notes) on true
join public.products p on p.slug = v.slug
where c.slug = 'mama-tom-yum-crunch'
  and not exists (select 1 from public.combo_items where combo_id = c.id);

-- Combo 3: Thai tea affogato
insert into public.combos (slug, title, description, steps)
select 'thai-tea-affogato',
       'Thai Tea Affogato',
       'Dessert hack: chilled vanilla ice cream drowned in Cha Tra Mue Thai milk tea. Sweet, milky, ice-cold — a 2-ingredient dessert that looks fancy.',
       E'1. Grab a vanilla ice cream cup and a chilled Cha Tra Mue bottle.\n2. Open the ice cream and leave it in the cup.\n3. Pour the Thai tea slowly over the top.\n4. Wait 60 seconds, then eat before it fully melts.'
where not exists (select 1 from public.combos where slug = 'thai-tea-affogato');

insert into public.combo_items (combo_id, product_id, quantity, notes)
select c.id, p.id, v.quantity, v.notes
from public.combos c
join (values
  ('vanilla-ice-cream-cup', 1, null),
  ('cha-tra-mue-thai-milk-tea', 1, 'pour over the ice cream')
) as v(slug, quantity, notes) on true
join public.products p on p.slug = v.slug
where c.slug = 'thai-tea-affogato'
  and not exists (select 1 from public.combo_items where combo_id = c.id);

-- Combo 4: Mala noodle upgrade
insert into public.combos (slug, title, description, steps)
select 'mama-mala-protein-bomb',
       'Mama Mala Protein Bomb',
       'Mala instant noodles upgraded with a boiled egg and fish tofu balls. Numbing heat meets soft yolk and bouncy fish balls — a proper meal for under ฿70.',
       E'1. Start the Mama Mala with hot water and cover for 3 minutes.\n2. Halve the boiled eggs.\n3. Stir in the fish tofu balls while the noodles soften.\n4. Top with eggs and an extra drizzle of mala sauce.'
where not exists (select 1 from public.combos where slug = 'mama-mala-protein-bomb');

insert into public.combo_items (combo_id, product_id, quantity, notes)
select c.id, p.id, v.quantity, v.notes
from public.combos c
join (values
  ('mama-mala', 1, null),
  ('hard-boiled-eggs', 1, 'halved on top'),
  ('fish-tofu-balls', 1, 'stir in while hot')
) as v(slug, quantity, notes) on true
join public.products p on p.slug = v.slug
where c.slug = 'mama-mala-protein-bomb'
  and not exists (select 1 from public.combo_items where combo_id = c.id);

-- Combo 5: sriracha mayo crab roll
insert into public.combos (slug, title, description, steps)
select 'sriracha-mayo-crab-roll',
       'Sriracha Mayo Crab Roll',
       'Fake it: butter roll bread stuffed with crab sticks and sriracha mayo. Spicy, creamy, crunchy — a 3-ingredient "sushi roll" you can assemble on the go.',
       E'1. Mix the sriracha mayo packet with half the mayo.\n2. Toss the crab sticks through the sauce.\n3. Split the butter roll and stuff it.\n4. Wrap in the Lay''s bag crumbs for extra crunch. (Optional but elite.)'
where not exists (select 1 from public.combos where slug = 'sriracha-mayo-crab-roll');

insert into public.combo_items (combo_id, product_id, quantity, notes)
select c.id, p.id, v.quantity, v.notes
from public.combos c
join (values
  ('sriracha-mayo-packet', 1, null),
  ('mayonnaise', 1, 'use half'),
  ('imitation-crab-sticks', 1, null),
  ('butter-roll-bread', 1, null)
) as v(slug, quantity, notes) on true
join public.products p on p.slug = v.slug
where c.slug = 'sriracha-mayo-crab-roll'
  and not exists (select 1 from public.combo_items where combo_id = c.id);

-- Combo 6: izakaya plate
insert into public.combos (slug, title, description, steps)
select 'chiang-mai-izakaya-plate',
       'Chiang Mai Izakaya Plate',
       'Edamame + salted plum chips + shrimp chips + green tea. A salty-snack grazing board that feels like a Japanese izakaya for under ฿80.',
       E'1. Chill everything first.\n2. Arrange edamame, Lay''s salted plum, and shrimp chips on the hotel desk.\n3. Pour the Oishi green tea over ice.\n4. Salt the edamame with the leftover chip crumbs. Trust the process.'
where not exists (select 1 from public.combos where slug = 'chiang-mai-izakaya-plate');

insert into public.combo_items (combo_id, product_id, quantity, notes)
select c.id, p.id, v.quantity, v.notes
from public.combos c
join (values
  ('edamame', 1, null),
  ('lays-salted-plum', 1, null),
  ('calbee-shrimp-chips', 1, null),
  ('oishi-green-tea-honey-lemon', 1, 'over ice')
) as v(slug, quantity, notes) on true
join public.products p on p.slug = v.slug
where c.slug = 'chiang-mai-izakaya-plate'
  and not exists (select 1 from public.combo_items where combo_id = c.id);

-- Combo 7: mango sticky rice sundae
insert into public.combos (slug, title, description, steps)
select 'mango-sticky-rice-sundae',
       'Mango Sticky Rice Sundae',
       'Warm the sticky rice, scoop the coconut ice cream on top. Cold coconut cream melts into the sweet rice — the Thai dessert, sundae-fied.',
       E'1. Ask the counter to microwave the mango sticky rice for 30 seconds.\n2. Scoop the coconut ice cream on top.\n3. Let it melt into the rice for a minute.\n4. Eat with the little wooden spoon. Thank us later.'
where not exists (select 1 from public.combos where slug = 'mango-sticky-rice-sundae');

insert into public.combo_items (combo_id, product_id, quantity, notes)
select c.id, p.id, v.quantity, v.notes
from public.combos c
join (values
  ('mango-sticky-rice', 1, 'microwave 30s first'),
  ('coconut-ice-cream-cup', 1, 'scoop on top')
) as v(slug, quantity, notes) on true
join public.products p on p.slug = v.slug
where c.slug = 'mango-sticky-rice-sundae'
  and not exists (select 1 from public.combo_items where combo_id = c.id);

-- Combo 8: suki noodle remix
insert into public.combos (slug, title, description, steps)
select 'sukiyaki-wai-wai-remix',
       'Sukiyaki Wai Wai Remix',
       'Drain most of the Wai Wai broth, then stir in suki sauce for a thick, glossy, sweet-spicy "dry" noodle. Add quail eggs for texture.',
       E'1. Make the Wai Wai with a little less water than usual.\n2. Drain about half the broth.\n3. Squeeze in the whole suki sauce sachet and stir.\n4. Halve the quail eggs on top and mix through.'
where not exists (select 1 from public.combos where slug = 'sukiyaki-wai-wai-remix');

insert into public.combo_items (combo_id, product_id, quantity, notes)
select c.id, p.id, v.quantity, v.notes
from public.combos c
join (values
  ('wai-wai-oriental', 1, null),
  ('suki-sauce', 1, 'use the whole sachet'),
  ('quail-eggs', 1, 'halved on top')
) as v(slug, quantity, notes) on true
join public.products p on p.slug = v.slug
where c.slug = 'sukiyaki-wai-wai-remix'
  and not exists (select 1 from public.combo_items where combo_id = c.id);

-- Stamp the seeded combos' display author (only where not already set,
-- so re-running never overwrites real user names).
update public.combos set author_name = 'Team 7Combo' where author_name is null;
