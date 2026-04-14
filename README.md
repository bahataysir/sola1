# ☀️ Solar Sites API

API لتحليل مواقع الطاقة الشمسية في مدينة الخليل — مبني بـ **Node.js + Express + MongoDB**.

---

## 📁 هيكل المشروع

```
solar-api/
├── src/
│   ├── server.js               # نقطة الدخول — يشغّل الـ HTTP server
│   ├── app.js                  # Express app (middleware + routes)
│   ├── config/
│   │   └── database.js         # اتصال MongoDB عبر Mongoose
│   ├── models/
│   │   └── SolarPoint.js       # Schema + pre-save hook + static methods
│   ├── controllers/
│   │   └── pointsController.js # منطق الأعمال لكل Endpoint
│   ├── routes/
│   │   └── points.js           # ربط HTTP verbs بالـ Controllers
│   ├── middleware/
│   │   ├── validation.js       # قواعد التحقق (express-validator)
│   │   └── errorHandler.js     # معالجة الأخطاء المركزية
│   └── seed/
│       └── seedDatabase.js     # توليد 60 نقطة وهمية لمدينة الخليل
└── tests/
    └── points.test.js          # اختبارات تكاملية (Jest + Supertest)
```

---

## 🚀 طريقة التشغيل

### 1. المتطلبات الأساسية

```bash
Node.js >= 18
MongoDB  >= 6  (محلي أو Atlas)
```

### 2. التثبيت

```bash
git clone <repo-url>
cd solar-api
npm install
```

### 3. إعداد متغيرات البيئة

```bash
cp .env.example .env
# ثم عدّل MONGODB_URI إذا لزم الأمر
```

### 4. تشغيل MongoDB محلياً (اختياري)

```bash
# macOS
brew services start mongodb-community

# Linux
sudo systemctl start mongod
```

### 5. إدخال البيانات الوهمية (60 نقطة)

```bash
npm run seed
```

### 6. تشغيل الـ Server

```bash
# تطوير (مع hot-reload)
npm run dev

# إنتاج
npm start
```

الـ API سيعمل على: `http://localhost:5000`

### 7. تشغيل الاختبارات

```bash
npm test
```

---

## 📡 Endpoints الكاملة

### `GET /api/points` — جلب جميع النقاط

```
GET /api/points?type=empty_land&minSolar=5&maxGrid=3&page=1&limit=20&sortBy=score&order=desc
```

| Query Param | القيم المتاحة | الوصف |
|------------|--------------|-------|
| `type` | `residential` \| `road` \| `empty_land` | فلترة حسب نوع الموقع |
| `minSolar` | رقم | الحد الأدنى للإشعاع الشمسي |
| `maxGrid` | رقم | الحد الأقصى للبعد عن الشبكة (km) |
| `page` | رقم (افتراضي: 1) | رقم الصفحة |
| `limit` | 1–100 (افتراضي: 60) | عدد النتائج |
| `sortBy` | `score`, `solar_radiation`, `distance_to_grid`, `available_area`, `createdAt` | حقل الترتيب |
| `order` | `asc` \| `desc` | اتجاه الترتيب |

**Response:**
```json
{
  "success": true,
  "pagination": { "total": 60, "page": 1, "limit": 60, "pages": 1 },
  "data": [ { "_id": "...", "solar_radiation": 6.5, "score": 118.4, ... } ]
}
```

---

### `POST /api/points` — إضافة نقطة جديدة

```
POST /api/points
Content-Type: application/json
```

**Body:**
```json
{
  "latitude":         31.530,
  "longitude":        35.095,
  "solar_radiation":  6.5,
  "distance_to_grid": 1.2,
  "location_type":    "empty_land",
  "available_area":   300,
  "metadata": {
    "label": "حي البلدة القديمة",
    "source": "مسح ميداني 2024"
  }
}
```

**Response `201`:**
```json
{
  "success": true,
  "message": "Point created successfully",
  "data": { "_id": "...", "score": 118.4, ... }
}
```

---

### `GET /api/points/best` — أفضل المواقع 🏆

```
GET /api/points/best?limit=5&type=empty_land&minScore=80
```

| Query Param | الوصف |
|------------|-------|
| `limit` | عدد النتائج (افتراضي: 10، أقصى: 50) |
| `type` | فلترة حسب نوع الموقع |
| `minScore` | الحد الأدنى للنقاط |

**Response:**
```json
{
  "success": true,
  "summary": {
    "count": 5,
    "avgScore": 112.3,
    "maxScore": 131.5,
    "avgSolar": 6.85,
    "typeBreakdown": { "empty_land": 3, "residential": 2 }
  },
  "data": [
    { "rank": 1, "score": 131.5, "solar_radiation": 7.1, "location_type": "empty_land", ... },
    ...
  ]
}
```

---

### `GET /api/points/stats` — إحصائيات إجمالية

```
GET /api/points/stats
```

**Response:**
```json
{
  "success": true,
  "data": {
    "total_points": 60,
    "solar_radiation": { "avg": 5.4, "max": 7.5, "min": 3.5 },
    "distance_to_grid": { "avg": 3.1 },
    "score": { "avg": 89.2, "max": 131.5 },
    "by_type": [
      { "type": "empty_land", "count": 22, "avgScore": 101.3 },
      { "type": "residential", "count": 20, "avgScore": 87.5 },
      { "type": "road", "count": 18, "avgScore": 75.1 }
    ]
  }
}
```

---

### `GET /api/points/:id` — نقطة واحدة

```
GET /api/points/665f1a2b3c4d5e6f7a8b9c0d
```

### `PUT /api/points/:id` — تحديث نقطة

```
PUT /api/points/665f1a2b3c4d5e6f7a8b9c0d
Content-Type: application/json

{ "solar_radiation": 7.2, "available_area": 450 }
```

Score يُعاد حسابه تلقائياً.

### `DELETE /api/points/:id` — حذف نقطة

```
DELETE /api/points/665f1a2b3c4d5e6f7a8b9c0d
```

### `POST /api/points/bulk` — إدراج جماعي (حتى 500 نقطة)

```json
{
  "points": [
    { "latitude": 31.53, "longitude": 35.09, "solar_radiation": 6.0, ... },
    ...
  ]
}
```

---

## 🧮 معادلة التقييم (Score)

```
score = (solar_radiation × 20)
      - (distance_to_grid × 5)
      + (available_area / 100 × 2)
      + TYPE_BONUS
```

| نوع الموقع | BONUS |
|-----------|-------|
| `empty_land` | +15 |
| `residential` | +5 |
| `road` | +0 |

> يمكن تعديل الأوزان عبر متغيرات البيئة:
> `WEIGHT_SOLAR`, `WEIGHT_GRID`, `WEIGHT_AREA`

---

## 🔌 الربط مع الواجهة الأمامية (React)

```javascript
// استدعاء جميع النقاط
const res = await fetch("http://localhost:5000/api/points");
const { data, pagination } = await res.json();

// أفضل 5 مواقع
const best = await fetch("http://localhost:5000/api/points/best?limit=5");

// إضافة نقطة جديدة
await fetch("http://localhost:5000/api/points", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ latitude: 31.53, longitude: 35.09, ... })
});
```

---

## 🛡️ Security

- **Helmet** → HTTP security headers
- **CORS** → قائمة بيضاء للـ Origins
- **express-validator** → التحقق من جميع المدخلات
- **Mongoose validation** → طبقة ثانية للتحقق
- **asyncHandler** → حماية من unhandled rejections

---

## 🌿 متغيرات البيئة

| المتغير | القيمة الافتراضية | الوصف |
|---------|------------------|-------|
| `PORT` | `5000` | منفذ الـ Server |
| `NODE_ENV` | `development` | بيئة التشغيل |
| `MONGODB_URI` | `mongodb://localhost:27017/solar_hebron` | رابط MongoDB |
| `CORS_ORIGINS` | `http://localhost:3000` | Origins المسموح بها |
| `WEIGHT_SOLAR` | `20` | وزن الإشعاع في المعادلة |
| `WEIGHT_GRID` | `5` | وزن المسافة في المعادلة |
| `WEIGHT_AREA` | `2` | وزن المساحة في المعادلة |
