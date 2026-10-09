/**
 * Local demo data (development only): one restaurant connected like a real POS would be — enrollment, menu sync,
 * image uploads, table sync — plus a promotion. Prints the table links. Refuses to run against a production database.
 *   npm run seed:demo
 */
import sharp from "sharp";

const dishes: [number, number, string, string, string, number, number | null, string, string][] = [
  // id, category, nameAr, nameEn, description, price, prep, emoji, color
  [10, 1, "برجر لحم كلاسيك", "Classic Beef Burger", "لحم بقري طازج 180غ، جبنة شيدر، خس، طماطم وصوص البيت", 4.5, 18, "🍔", "#b45309"],
  [11, 1, "برجر دجاج مقرمش", "Crispy Chicken Burger", "صدر دجاج متبل مقرمش مع صوص الثوم", 3.75, null, "🍗", "#c2410c"],
  [12, 1, "برجر مشروم سويس", "Mushroom Swiss", "فطر سوتيه وجبنة سويسرية", 5.25, 20, "🍄", "#78350f"],
  [20, 2, "بطاطا مقلية", "French Fries", "مقرمشة مع ملح البحر", 1.5, 8, "🍟", "#ca8a04"],
  [21, 2, "حلقات بصل", "Onion Rings", null as unknown as string, 1.75, 8, "🧅", "#a16207"],
  [30, 3, "عصير طازج", "Fresh Juice", "يُعصر عند الطلب", 2, 5, "🧃", "#ea580c"],
  [31, 3, "مياه معدنية", "Mineral Water", null as unknown as string, 0.35, 1, "💧", "#0284c7"],
  [32, 3, "قهوة مثلجة", "Iced Coffee", "إسبريسو مزدوج وحليب وثلج", 2.25, 6, "🧋", "#57534e"],
  [40, 4, "تشيز كيك", "Cheesecake", "صوص التوت البري", 2.75, 3, "🍰", "#db2777"],
];

async function image(emoji: string, color: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="900"><defs><radialGradient id="g" cx="50%" cy="40%" r="75%">
    <stop offset="0" stop-color="#ffffff" stop-opacity=".55"/><stop offset="1" stop-color="${color}"/></radialGradient></defs>
    <rect width="900" height="900" fill="url(#g)"/><text x="450" y="560" font-size="420" text-anchor="middle" font-family="Segoe UI Emoji, Noto Color Emoji">${emoji}</text></svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 85 }).toBuffer();
}

async function main() {
  if (process.env.DATABASE_URL?.startsWith("postgres") && process.env.ALLOW_DEMO_SEED !== "1") throw new Error("Refusing to seed a PostgreSQL database (set ALLOW_DEMO_SEED=1 to override).");
  const { getDb } = await import("../src/db");
  const { createAdmin } = await import("../src/server/admins");
  const admin = await import("../src/server/admin");
  const pos = await import("../src/server/pos");
  const { storeImage } = await import("../src/lib/media");
  const { sha256 } = await import("../src/lib/crypto");
  const db = await getDb();
  const actor = { type: "system" as const, id: "seed", ip: "local" };

  await createAdmin(db, "admin@sitekoom.local", "مدير المنصة", process.env.DEMO_ADMIN_PASSWORD ?? "ChangeMe-12345");

  const existing = await admin.listRestaurants(db, "demo-burger", "", 1);
  const r = existing.rows[0] ?? await admin.createRestaurant(db, { slug: "demo-burger", nameAr: "برجر الحي", nameEn: "Neighborhood Burger",
    descriptionAr: "برجر مشوي على الفحم وبطاطا طازجة", descriptionEn: "Charcoal-grilled burgers and fresh fries", phone: "0790777940", installationCode: "DEMO-0001" }, actor);
  await admin.updateService(db, r.id, { status: "active", serviceExpiresAt: "", orderingPaused: false }, actor);
  const { code } = await admin.createEnrollmentCode(db, r.id, actor);
  const enrolled = await pos.enroll(db, { code, installationCode: "DEMO-0001", deviceName: "Demo POS", appVersion: "dev" }, "local");
  const device = await pos.authenticateDevice(db, `Bearer ${enrolled.token}`, "local");

  const images = new Map<number, Buffer>();
  for (const d of dishes) images.set(d[0], await image(d[7], d[8]));
  await pos.syncMenu(db, device, {
    hash: "demo", currency: { code: "JOD", symbol: "د.أ", decimals: 3 }, defaultPrepMinutes: 15, requireAcceptance: true,
    categories: [
      { id: 1, name: "البرجر", sort: 0, icon: "🍔", color: null, image: null, active: true },
      { id: 2, name: "المقبلات", sort: 1, icon: "🍟", color: null, image: null, active: true },
      { id: 3, name: "المشروبات", sort: 2, icon: "🥤", color: null, image: null, active: true },
      { id: 4, name: "الحلويات", sort: 3, icon: "🍰", color: null, image: null, active: true },
    ],
    products: dishes.map((d, i) => ({
      id: d[0], unitId: d[0] * 10, categoryId: d[1], nameAr: d[2], nameEn: d[3], description: d[4] ?? null, price: d[5], image: sha256(images.get(d[0])!),
      prepMinutes: d[6], available: d[0] !== 31, sort: i,
      variants: d[0] === 30 ? [{ id: 301, name: "برتقال", price: null, image: null, sort: 0 }, { id: 302, name: "ليمون ونعنع", price: 2.25, image: null, sort: 1 }, { id: 303, name: "مانجا", price: 2.5, image: null, sort: 2 }] : [],
      groups: d[1] === 1 ? [1, 2] : d[0] === 20 ? [3] : [],
    })),
    modifierGroups: [
      { id: 1, name: "حجم الوجبة", min: 1, max: 1, sort: 0, options: [{ id: 11, name: "ساندويش فقط", price: 0, isDefault: true, sort: 0 }, { id: 12, name: "وجبة مع بطاطا ومشروب", price: 1.75, isDefault: false, sort: 1 }] },
      { id: 2, name: "إضافات", min: 0, max: 4, sort: 1, options: [{ id: 21, name: "جبنة إضافية", price: 0.35, isDefault: false, sort: 0 }, { id: 22, name: "لحم إضافي", price: 1.5, isDefault: false, sort: 1 }, { id: 23, name: "هالبينو", price: 0.25, isDefault: false, sort: 2 }, { id: 24, name: "بدون بصل", price: 0, isDefault: false, sort: 3 }] },
      { id: 3, name: "الصوص", min: 0, max: 2, sort: 2, options: [{ id: 31, name: "كاتشب", price: 0, isDefault: false, sort: 0 }, { id: 32, name: "جبنة سائلة", price: 0.5, isDefault: false, sort: 1 }] },
    ],
  });
  for (const [, bytes] of images) await storeImage(db, r.id, bytes, "pos");
  const tables = await pos.syncTables(db, device, [1, 2, 3, 4, 5].map((n) => ({ uid: `00000000-0000-4000-8000-00000000000${n}`, number: n, name: null, seats: 4, status: "active" })));

  const banner = await storeImage(db, r.id, await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="700"><defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#7c2d12"/><stop offset="1" stop-color="#ea580c"/></linearGradient></defs><rect width="1600" height="700" fill="url(#g)"/><text x="1250" y="470" font-size="360" text-anchor="middle" font-family="Segoe UI Emoji">🍔</text></svg>`)).jpeg().toBuffer(), "admin");
  const promos = await admin.listPromotions(db, r.id);
  if (!promos.length)
    await admin.savePromotion(db, r.id, null, { titleAr: "وجبة الغداء بـ 5 دنانير", titleEn: "Lunch combo for 5 JOD", subtitleAr: "برجر + بطاطا + مشروب حتى الساعة 4", subtitleEn: "Burger + fries + drink until 4 pm", ctaAr: "اطلب الآن", ctaEn: "Order now", ctaTarget: "category:1", sort: 0, isActive: true, startsAt: "", endsAt: "" }, { image: banner.id }, actor);

  const base = process.env.PUBLIC_BASE_URL ?? "http://localhost:3100";
  console.log(`Admin: ${base}/admin  (admin@sitekoom.local)`);
  console.log(`Browse: ${base}/demo-burger`);
  for (const t of tables.tables) console.log(`Table ${t.number}: ${t.url}`);
  console.log(`POS device token (demo): ${enrolled.token}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

export {};
