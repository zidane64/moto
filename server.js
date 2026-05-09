'use strict';

const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();
app.use(cors());
app.use(express.json());

// ==================== KONFIGURASI ====================
const dbConfig = {
    host: process.env.MYSQLHOST,
    port: parseInt(process.env.MYSQLPORT) || 3306,
    user: process.env.MYSQLUSER,
    password: process.env.MYSQLPASSWORD,
    database: process.env.MYSQLDATABASE,
    ssl: process.env.MYSQLSSL === 'true' ? { rejectUnauthorized: false } : false,
    waitForConnections: true,
    connectionLimit: 10,
    connectTimeout: 30000,
};

const SECRET_KEY = process.env.SECRET_KEY || 'motocare_super_secret_key_2025';
const TOTAL_WORKSHOPS = 150; // Jumlah bengkel FIXED agar konsisten setiap deploy

let pool = null;
let isDatabaseConnected = false;

// ==================== DATA MASTER MOTOR ====================
const MASTER_MOTORCYCLES = [
    { brand: 'Honda', type: 'BeAT', category: 'Matic' },
    { brand: 'Honda', type: 'BeAT Street', category: 'Matic' },
    { brand: 'Honda', type: 'Vario 125', category: 'Matic' },
    { brand: 'Honda', type: 'Vario 150', category: 'Matic' },
    { brand: 'Honda', type: 'Vario 160', category: 'Matic' },
    { brand: 'Honda', type: 'PCX 160', category: 'Matic' },
    { brand: 'Honda', type: 'PCX 186', category: 'Matic' },
    { brand: 'Honda', type: 'ADV 160', category: 'Adventure' },
    { brand: 'Honda', type: 'ADV 350', category: 'Adventure' },
    { brand: 'Honda', type: 'Scoopy', category: 'Matic' },
    { brand: 'Honda', type: 'Genio', category: 'Matic' },
    { brand: 'Honda', type: 'Spacy', category: 'Matic' },
    { brand: 'Honda', type: 'Giorno', category: 'Matic' },
    { brand: 'Honda', type: 'Stylo 160', category: 'Matic' },
    { brand: 'Honda', type: 'Forza 350', category: 'Matic' },
    { brand: 'Honda', type: 'CBR150R', category: 'Sport' },
    { brand: 'Honda', type: 'CBR250RR', category: 'Sport' },
    { brand: 'Honda', type: 'CBR600RR', category: 'Sport' },
    { brand: 'Honda', type: 'CBR1000RR', category: 'Sport' },
    { brand: 'Honda', type: 'Supra X 125', category: 'Bebek' },
    { brand: 'Honda', type: 'Revo 110', category: 'Bebek' },
    { brand: 'Honda', type: 'Sonic 150', category: 'Bebek' },
    { brand: 'Honda', type: 'CB150R StreetFire', category: 'Naked' },
    { brand: 'Honda', type: 'CB250R', category: 'Naked' },
    { brand: 'Honda', type: 'CB300R', category: 'Naked' },
    { brand: 'Yamaha', type: 'NMAX 155', category: 'Matic' },
    { brand: 'Yamaha', type: 'NMAX 155 Connected', category: 'Matic' },
    { brand: 'Yamaha', type: 'Aerox 155', category: 'Matic' },
    { brand: 'Yamaha', type: 'FreeGo 125', category: 'Matic' },
    { brand: 'Yamaha', type: 'Fazzio 125', category: 'Matic' },
    { brand: 'Yamaha', type: 'Lexi 125', category: 'Matic' },
    { brand: 'Yamaha', type: 'Mio M3', category: 'Matic' },
    { brand: 'Yamaha', type: 'Gear 125', category: 'Matic' },
    { brand: 'Yamaha', type: 'Grand Filano', category: 'Matic' },
    { brand: 'Yamaha', type: 'R15', category: 'Sport' },
    { brand: 'Yamaha', type: 'R25', category: 'Sport' },
    { brand: 'Yamaha', type: 'R6', category: 'Sport' },
    { brand: 'Yamaha', type: 'R1', category: 'Sport' },
    { brand: 'Yamaha', type: 'MT-15', category: 'Naked' },
    { brand: 'Yamaha', type: 'MT-25', category: 'Naked' },
    { brand: 'Yamaha', type: 'MT-03', category: 'Naked' },
    { brand: 'Yamaha', type: 'XSR 155', category: 'Naked' },
    { brand: 'Yamaha', type: 'Vega ZR', category: 'Bebek' },
    { brand: 'Yamaha', type: 'Jupiter Z1', category: 'Bebek' },
    { brand: 'Suzuki', type: 'Address 115', category: 'Matic' },
    { brand: 'Suzuki', type: 'Avenis 125', category: 'Matic' },
    { brand: 'Suzuki', type: 'Nex 115', category: 'Matic' },
    { brand: 'Suzuki', type: 'Burgman Street 125 EX', category: 'Matic' },
    { brand: 'Suzuki', type: 'GSX-R150', category: 'Sport' },
    { brand: 'Suzuki', type: 'GSX-R250', category: 'Sport' },
    { brand: 'Suzuki', type: 'GSX-R1000R', category: 'Sport' },
    { brand: 'Suzuki', type: 'GSX-S150', category: 'Naked' },
    { brand: 'Suzuki', type: 'GSX-S250', category: 'Naked' },
    { brand: 'Suzuki', type: 'Satria F150', category: 'Sport' },
    { brand: 'Suzuki', type: 'SFV 650 Gladius', category: 'Naked' },
    { brand: 'Kawasaki', type: 'Ninja 250', category: 'Sport' },
    { brand: 'Kawasaki', type: 'Ninja 400', category: 'Sport' },
    { brand: 'Kawasaki', type: 'Ninja 650', category: 'Sport' },
    { brand: 'Kawasaki', type: 'Ninja ZX-6R', category: 'Sport' },
    { brand: 'Kawasaki', type: 'Ninja ZX-10R', category: 'Sport' },
    { brand: 'Kawasaki', type: 'Z250', category: 'Naked' },
    { brand: 'Kawasaki', type: 'Z400', category: 'Naked' },
    { brand: 'Kawasaki', type: 'Z650', category: 'Naked' },
    { brand: 'Kawasaki', type: 'Z900', category: 'Naked' },
    { brand: 'Kawasaki', type: 'Versys 250', category: 'Touring' },
    { brand: 'Kawasaki', type: 'Versys 650', category: 'Touring' },
    { brand: 'Kawasaki', type: 'W175', category: 'Classic' },
    { brand: 'KTM', type: 'Duke 125', category: 'Naked' },
    { brand: 'KTM', type: 'Duke 200', category: 'Naked' },
    { brand: 'KTM', type: 'Duke 250', category: 'Naked' },
    { brand: 'KTM', type: 'Duke 390', category: 'Naked' },
    { brand: 'KTM', type: 'Duke 690', category: 'Naked' },
    { brand: 'KTM', type: 'RC 125', category: 'Sport' },
    { brand: 'KTM', type: 'RC 200', category: 'Sport' },
    { brand: 'KTM', type: 'RC 390', category: 'Sport' },
    { brand: 'KTM', type: 'Adventure 250', category: 'Adventure' },
    { brand: 'KTM', type: 'Adventure 390', category: 'Adventure' },
    { brand: 'Vespa', type: 'Sprint 125', category: 'Matic' },
    { brand: 'Vespa', type: 'Sprint 150', category: 'Matic' },
    { brand: 'Vespa', type: 'Sprint S Race', category: 'Matic' },
    { brand: 'Vespa', type: 'Primavera 125', category: 'Matic' },
    { brand: 'Vespa', type: 'Primavera 150', category: 'Matic' },
    { brand: 'Vespa', type: 'Primavera S 150', category: 'Matic' },
    { brand: 'Vespa', type: 'GTS 300', category: 'Matic' },
    { brand: 'Vespa', type: 'GTS Super', category: 'Matic' },
    { brand: 'Vespa', type: 'GTS Super Sport', category: 'Matic' },
    { brand: 'Vespa', type: 'Elettrica', category: 'Matic' },
    { brand: 'Benelli', type: 'Leoncino 250', category: 'Naked' },
    { brand: 'Benelli', type: 'Leoncino 500', category: 'Naked' },
    { brand: 'Benelli', type: 'TNT 25', category: 'Naked' },
    { brand: 'Benelli', type: 'TNT 135', category: 'Naked' },
    { brand: 'Benelli', type: 'Imperiale 400', category: 'Classic' },
    { brand: 'Royal Enfield', type: 'Classic 350', category: 'Classic' },
    { brand: 'Royal Enfield', type: 'Meteor 350', category: 'Classic' },
    { brand: 'Royal Enfield', type: 'Hunter 350', category: 'Classic' },
    { brand: 'Royal Enfield', type: 'Continental GT 650', category: 'Classic' },
    { brand: 'BMW', type: 'G310R', category: 'Naked' },
    { brand: 'BMW', type: 'G310GS', category: 'Adventure' },
    { brand: 'BMW', type: 'F750GS', category: 'Adventure' },
    { brand: 'BMW', type: 'F850GS', category: 'Adventure' },
    { brand: 'BMW', type: 'R1250GS', category: 'Adventure' },
    { brand: 'BMW', type: 'R nineT', category: 'Classic' },
    { brand: 'Harley-Davidson', type: 'Iron 883', category: 'Cruiser' },
    { brand: 'Harley-Davidson', type: 'Forty-Eight', category: 'Cruiser' },
    { brand: 'Harley-Davidson', type: 'Street 750', category: 'Cruiser' },
    { brand: 'Harley-Davidson', type: 'Road King', category: 'Touring' },
    { brand: 'Harley-Davidson', type: 'Sportster S', category: 'Cruiser' },
];

// ==================== GENERATOR BENGKEL ====================

// Gunakan PRNG deterministik (seeded) agar hasil SAMA setiap deploy
// Implementasi sederhana xorshift32
function createSeededRandom(seed) {
    let s = seed >>> 0;
    return function () {
        s ^= s << 13;
        s ^= s >> 17;
        s ^= s << 5;
        return ((s >>> 0) / 4294967296);
    };
}

// Seed tetap agar data konsisten setiap deploy
const rng = createSeededRandom(20250101);

function rngFloat(min, max) { return rng() * (max - min) + min; }
function rngInt(min, max) { return Math.floor(rngFloat(min, max + 1)); }
function rngPick(arr) { return arr[Math.floor(rng() * arr.length)]; }

function generateWorkshops() {
    const CITIES = [
        { name: 'Jakarta Pusat',     latMin: -6.18, latMax: -6.15, lngMin: 106.82, lngMax: 106.87 },
        { name: 'Jakarta Selatan',   latMin: -6.30, latMax: -6.20, lngMin: 106.77, lngMax: 106.85 },
        { name: 'Jakarta Barat',     latMin: -6.20, latMax: -6.13, lngMin: 106.73, lngMax: 106.80 },
        { name: 'Jakarta Timur',     latMin: -6.25, latMax: -6.17, lngMin: 106.87, lngMax: 106.97 },
        { name: 'Jakarta Utara',     latMin: -6.15, latMax: -6.09, lngMin: 106.80, lngMax: 106.93 },
        { name: 'Tangerang',         latMin: -6.23, latMax: -6.15, lngMin: 106.58, lngMax: 106.70 },
        { name: 'Tangerang Selatan', latMin: -6.32, latMax: -6.23, lngMin: 106.64, lngMax: 106.75 },
        { name: 'Bekasi',            latMin: -6.28, latMax: -6.20, lngMin: 106.97, lngMax: 107.05 },
        { name: 'Depok',             latMin: -6.44, latMax: -6.35, lngMin: 106.78, lngMax: 106.87 },
        { name: 'Bogor',             latMin: -6.65, latMax: -6.56, lngMin: 106.78, lngMax: 106.86 },
        { name: 'Bandung',           latMin: -6.95, latMax: -6.87, lngMin: 107.56, lngMax: 107.67 },
        { name: 'Surabaya',          latMin: -7.35, latMax: -7.22, lngMin: 112.68, lngMax: 112.80 },
        { name: 'Medan',             latMin: 3.52,  latMax: 3.65,  lngMin: 98.63,  lngMax: 98.73  },
        { name: 'Makassar',          latMin: -5.20, latMax: -5.10, lngMin: 119.38, lngMax: 119.48 },
        { name: 'Semarang',          latMin: -7.05, latMax: -6.96, lngMin: 110.38, lngMax: 110.48 },
        { name: 'Yogyakarta',        latMin: -7.84, latMax: -7.77, lngMin: 110.35, lngMax: 110.43 },
        { name: 'Malang',            latMin: -8.00, latMax: -7.93, lngMin: 112.60, lngMax: 112.68 },
        { name: 'Denpasar',          latMin: -8.72, latMax: -8.62, lngMin: 115.17, lngMax: 115.27 },
        { name: 'Palembang',         latMin: -3.02, latMax: -2.94, lngMin: 104.72, lngMax: 104.82 },
        { name: 'Batam',             latMin: 1.08,  latMax: 1.18,  lngMin: 104.02, lngMax: 104.12 },
    ];

    // share harus total 100
    const BRAND_CONFIG = [
        {
            brand: 'Honda', prefix: 'AHASS', share: 35,
            streets: ['Daan Mogot', 'Gajah Mada', 'Sudirman', 'Pemuda', 'Wahidin', 'Soekarno-Hatta', 'Ahmad Yani'],
        },
        {
            brand: 'Yamaha', prefix: 'YSP', share: 30,
            streets: ['Raya Serpong', 'Boulevard', 'Pahlawan', 'Diponegoro', 'Gatot Subroto', 'MH Thamrin', 'Veteran'],
        },
        {
            brand: 'Suzuki', prefix: 'Suzuki', share: 10,
            streets: ['Raya Barat', 'Imam Bonjol', 'Merdeka', 'Iskandar Muda', 'Jenderal Sudirman', 'Hasanuddin'],
        },
        {
            brand: 'Kawasaki', prefix: 'Kawasaki', share: 8,
            streets: ['Siliwangi', 'Ciledug Raya', 'Kapten Subijanto', 'R.E. Martadinata', 'Arteri Selatan'],
        },
        {
            brand: 'KTM', prefix: 'KTM', share: 4,
            streets: ['TB Simatupang', 'Bintaro Raya', 'Casablanca', 'HR Rasuna Said', 'Kuningan Barat'],
        },
        {
            brand: 'Vespa', prefix: 'Vespa', share: 4,
            streets: ['Kemang Raya', 'Gunawarman', 'Senopati', 'Suryo', 'Pondok Indah'],
        },
        {
            brand: 'Umum', prefix: null, share: 9,
            streets: ['Raya Jaya', 'Kenanga', 'Mawar', 'Melati', 'Cempaka', 'Anggrek', 'Dahlia'],
            generalNames: [
                'Maju Jaya Motor', 'Barokah Motor', 'Anugrah Motor', 'Berkah Motor', 'Star Motor',
                'Rizki Motor', 'Setia Motor', 'Sumber Jaya Motor', 'Karya Motor', 'Prima Motor',
                'Abadi Motor', 'Makmur Motor', 'Sentosa Motor', 'Jaya Mandiri Motor', 'Cahaya Motor',
                'Duta Motor', 'Guna Motor', 'Harapan Motor', 'Indah Motor', 'Jasa Motor',
                'Kencana Motor', 'Lestari Motor', 'Mulia Motor', 'Nusantara Motor', 'Omega Motor',
                'Perdana Motor', 'Qolbu Motor', 'Rahmat Motor', 'Sejahtera Motor', 'Tiga Bersaudara Motor',
            ],
        },
    ];

    const HOURS_OPTIONS = ['08:00-17:00', '09:00-18:00', '08:00-20:00', '10:00-22:00', '07:00-21:00', '24 Jam'];
    const STATUSES    = ['open', 'open', 'open', 'open', 'open', 'open', 'open', 'open', 'open', 'closed', 'busy'];

    const SERVICES_POOL = [
        { name: 'Servis Berkala',       minPrice: 55000,  maxPrice: 120000 },
        { name: 'Servis Besar',         minPrice: 120000, maxPrice: 300000 },
        { name: 'Ganti Oli Mesin',      minPrice: 45000,  maxPrice: 85000  },
        { name: 'Tune Up',              minPrice: 75000,  maxPrice: 150000 },
        { name: 'Spooring & Balancing', minPrice: 60000,  maxPrice: 100000 },
        { name: 'Ganti Kampas Rem',     minPrice: 50000,  maxPrice: 90000  },
        { name: 'Cuci Motor',           minPrice: 15000,  maxPrice: 35000  },
        { name: 'Ganti Ban',            minPrice: 80000,  maxPrice: 200000 },
        { name: 'Servis Karburator / FI', minPrice: 65000, maxPrice: 130000 },
        { name: 'Overhaul Mesin',       minPrice: 350000, maxPrice: 800000 },
    ];

    const PARTS_POOL = [
        { name: 'Oli Mesin',         minPrice: 45000,  maxPrice: 120000 },
        { name: 'Busi NGK',          minPrice: 20000,  maxPrice: 55000  },
        { name: 'Filter Udara',      minPrice: 30000,  maxPrice: 75000  },
        { name: 'V-Belt',            minPrice: 150000, maxPrice: 280000 },
        { name: 'Kampas Rem Depan',  minPrice: 35000,  maxPrice: 90000  },
        { name: 'Kampas Rem Belakang', minPrice: 30000, maxPrice: 80000 },
        { name: 'Rantai & Gear Set', minPrice: 120000, maxPrice: 350000 },
        { name: 'Aki Motor',         minPrice: 80000,  maxPrice: 250000 },
        { name: 'Filter Oli',        minPrice: 20000,  maxPrice: 50000  },
        { name: 'Seal Oli',          minPrice: 15000,  maxPrice: 45000  },
    ];

    const WA_PREFIXES = [
        '628111','628112','628113','628114','628115','628116','628117','628118','628119',
        '62812','62813','62814','62815','62816','62817','62818','62819',
        '62821','62822','62823','62852','62853','62856','62857','62858','62859',
        '62877','62878','62879','62881','62882','62883','62895','62896','62897','62898','62899',
    ];

    const JAKARTA_AREA = new Set(['Jakarta Pusat','Jakarta Selatan','Jakarta Barat','Jakarta Timur','Jakarta Utara','Tangerang','Bekasi','Depok','Bogor']);

    // Hitung jumlah per brand secara deterministik agar total = TOTAL_WORKSHOPS
    const counts = BRAND_CONFIG.map(cfg => Math.round((cfg.share / 100) * TOTAL_WORKSHOPS));
    // Koreksi total agar pas TOTAL_WORKSHOPS
    let diff = TOTAL_WORKSHOPS - counts.reduce((a, b) => a + b, 0);
    counts[0] += diff; // tambahkan sisa ke Honda (brand terbesar)

    const workshops = [];
    let id = 1;
    const generalNamesUsed = new Set();

    for (let ci = 0; ci < BRAND_CONFIG.length; ci++) {
        const cfg = BRAND_CONFIG[ci];
        const count = counts[ci];

        for (let i = 0; i < count; i++) {
            const city      = rngPick(CITIES);
            const street    = rngPick(cfg.streets);
            const streetNo  = rngInt(1, 200);
            const lat       = parseFloat(rngFloat(city.latMin, city.latMax).toFixed(6));
            const lng       = parseFloat(rngFloat(city.lngMin, city.lngMax).toFixed(6));
            const verified  = rng() < 0.80;
            const status    = rngPick(STATUSES);
            const rating    = parseFloat(rngFloat(3.5, 5.0).toFixed(1));
            const distance  = parseFloat(rngFloat(0.5, 15.0).toFixed(1));

            let name;
            if (cfg.brand === 'Umum') {
                const available = (cfg.generalNames || []).filter(n => !generalNamesUsed.has(n));
                if (available.length > 0) {
                    // Pilih deterministik dari available
                    const chosen = available[Math.floor(rng() * available.length)];
                    name = chosen;
                    generalNamesUsed.add(chosen);
                } else {
                    name = `Bengkel Motor ${city.name} ${id}`;
                }
            } else {
                name = `${cfg.prefix} ${city.name} ${i + 1}`;
            }

            const areaCode = JAKARTA_AREA.has(city.name) ? '21'
                : rngPick(['22', '24', '31', '61', '411', '274', '341', '361', '711', '778']);
            const phoneNum  = rngInt(10000000, 99999999);
            const phone     = `+62-${areaCode}-${phoneNum}`;
            const waPrefix  = rngPick(WA_PREFIXES);
            const wa        = `${waPrefix}${rngInt(10000000, 99999999)}`;

            // Fisher-Yates shuffle deterministic
            const svcPool = [...SERVICES_POOL];
            for (let k = svcPool.length - 1; k > 0; k--) {
                const j = Math.floor(rng() * (k + 1));
                [svcPool[k], svcPool[j]] = [svcPool[j], svcPool[k]];
            }
            const services = svcPool.slice(0, rngInt(5, 8)).map(s => ({
                name: s.name,
                price: rngInt(s.minPrice, s.maxPrice),
            }));

            const partsPool = [...PARTS_POOL];
            for (let k = partsPool.length - 1; k > 0; k--) {
                const j = Math.floor(rng() * (k + 1));
                [partsPool[k], partsPool[j]] = [partsPool[j], partsPool[k]];
            }
            const parts = partsPool.slice(0, rngInt(4, 6)).map(p => ({
                name: p.name,
                price: rngInt(p.minPrice, p.maxPrice),
            }));

            workshops.push({
                id,
                name,
                brand: cfg.brand,
                address: `Jl. ${street} No. ${streetNo}, ${city.name}`,
                phone,
                wa,
                distance: `${distance} km`,
                rating,
                reviews: rngInt(50, 2000),
                status,
                hours: rngPick(HOURS_OPTIONS),
                verified,
                lat,
                lng,
                services,
                parts,
            });

            id++;
        }
    }

    return workshops;
}

// Generate sekali saat startup (hasilnya deterministik - sama setiap deploy)
const GENERATED_WORKSHOPS = generateWorkshops();
console.log(`[OK] Generated ${GENERATED_WORKSHOPS.length} bengkel (deterministik)`);

// ==================== DATABASE ====================
async function initDatabase() {
    try {
        console.log('[INFO] Menghubungkan ke database MySQL...');
        pool = mysql.createPool(dbConfig);

        const conn = await pool.getConnection();
        console.log('[OK] Koneksi ke database berhasil!');
        conn.release();
        isDatabaseConnected = true;

        await createTables();
        await syncWorkshopsToDatabase();
        await insertMasterMotorcycles();

        console.log('[OK] Database siap digunakan!');
    } catch (error) {
        console.error('[ERROR] Database error:', error.message);
        console.log('[WARN] Server tetap berjalan, endpoint DB akan fallback ke data in-memory');
        isDatabaseConnected = false;
        pool = null;
    }
}

async function createTables() {
    const queries = [
        `CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            email VARCHAR(100) UNIQUE NOT NULL,
            password VARCHAR(255) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS master_motorcycles (
            id INT AUTO_INCREMENT PRIMARY KEY,
            brand VARCHAR(50) NOT NULL,
            type VARCHAR(100) NOT NULL,
            category VARCHAR(50)
        )`,
        `CREATE TABLE IF NOT EXISTS motorcycles (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            brand VARCHAR(50) NOT NULL,
            type VARCHAR(50) NOT NULL,
            year INT NOT NULL,
            category VARCHAR(50) DEFAULT 'Matic',
            last_service DATE,
            next_service DATE,
            current_km INT DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )`,
        `CREATE TABLE IF NOT EXISTS workshops (
            id INT PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            brand VARCHAR(50),
            address TEXT,
            phone VARCHAR(30),
            wa VARCHAR(30),
            distance VARCHAR(20),
            rating DECIMAL(2,1),
            reviews INT DEFAULT 0,
            status VARCHAR(20) DEFAULT 'open',
            hours VARCHAR(100),
            verified BOOLEAN DEFAULT FALSE,
            lat DECIMAL(10,6),
            lng DECIMAL(11,6)
        )`,
        `CREATE TABLE IF NOT EXISTS workshop_services (
            id INT AUTO_INCREMENT PRIMARY KEY,
            workshop_id INT NOT NULL,
            name VARCHAR(100) NOT NULL,
            price INT NOT NULL,
            FOREIGN KEY (workshop_id) REFERENCES workshops(id) ON DELETE CASCADE
        )`,
        `CREATE TABLE IF NOT EXISTS workshop_parts (
            id INT AUTO_INCREMENT PRIMARY KEY,
            workshop_id INT NOT NULL,
            name VARCHAR(100) NOT NULL,
            price INT NOT NULL,
            FOREIGN KEY (workshop_id) REFERENCES workshops(id) ON DELETE CASCADE
        )`,
        `CREATE TABLE IF NOT EXISTS service_history (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            motorcycle_id INT,
            workshop_id INT,
            service_name VARCHAR(100),
            price DECIMAL(10,2),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )`,
        `CREATE TABLE IF NOT EXISTS notifications (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            title VARCHAR(200),
            message TEXT,
            type VARCHAR(50),
            is_read BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )`,
    ];

    for (const q of queries) {
        await pool.query(q);
    }
    console.log('[OK] Semua tabel siap');
}

async function syncWorkshopsToDatabase() {
    console.log('[INFO] Sinkronisasi data bengkel ke database...');

    // Hapus semua data bengkel lama (CASCADE akan hapus services & parts juga)
    await pool.query('DELETE FROM workshop_services');
    await pool.query('DELETE FROM workshop_parts');
    await pool.query('DELETE FROM workshops');
    console.log('[INFO] Data bengkel lama dihapus');

    // Insert ulang semua bengkel dari generator
    for (const w of GENERATED_WORKSHOPS) {
        await pool.query(
            `INSERT INTO workshops (id, name, brand, address, phone, wa, distance, rating, reviews, status, hours, verified, lat, lng)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [w.id, w.name, w.brand, w.address, w.phone, w.wa, w.distance,
             w.rating, w.reviews, w.status, w.hours, w.verified, w.lat, w.lng]
        );

        if (w.services.length > 0) {
            const svcValues = w.services.map(s => [w.id, s.name, s.price]);
            await pool.query(
                'INSERT INTO workshop_services (workshop_id, name, price) VALUES ?',
                [svcValues]
            );
        }

        if (w.parts.length > 0) {
            const partsValues = w.parts.map(p => [w.id, p.name, p.price]);
            await pool.query(
                'INSERT INTO workshop_parts (workshop_id, name, price) VALUES ?',
                [partsValues]
            );
        }
    }

    console.log(`[OK] ${GENERATED_WORKSHOPS.length} bengkel berhasil disimpan ke database`);
}

async function insertMasterMotorcycles() {
    const [row] = await pool.query('SELECT COUNT(*) as total FROM master_motorcycles');
    if (row[0].total > 0) {
        console.log(`[OK] Data motor master sudah ada (${row[0].total} records)`);
        return;
    }
    const values = MASTER_MOTORCYCLES.map(m => [m.brand, m.type, m.category]);
    await pool.query('INSERT INTO master_motorcycles (brand, type, category) VALUES ?', [values]);
    console.log(`[OK] ${MASTER_MOTORCYCLES.length} data motor master disimpan`);
}

// ==================== MIDDLEWARE ====================
const auth = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Token tidak ditemukan' });
    try {
        req.userId = jwt.verify(token, SECRET_KEY).id;
        next();
    } catch {
        return res.status(401).json({ message: 'Token tidak valid' });
    }
};

// ==================== ENDPOINTS ====================

app.get('/', (req, res) => {
    res.json({
        message: 'MotoCare Backend API',
        version: '2.1.0',
        database: isDatabaseConnected ? 'connected' : 'disconnected',
        workshops: GENERATED_WORKSHOPS.length,
        motorcycles: MASTER_MOTORCYCLES.length,
    });
});

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', database: isDatabaseConnected ? 'connected' : 'disconnected' });
});

// Master motorcycles
app.get('/api/motorcycles-master', async (req, res) => {
    if (!isDatabaseConnected || !pool) return res.json({ data: MASTER_MOTORCYCLES });
    try {
        const [rows] = await pool.query('SELECT * FROM master_motorcycles ORDER BY brand, type');
        res.json({ data: rows });
    } catch {
        res.json({ data: MASTER_MOTORCYCLES });
    }
});

// Register
app.post('/api/auth/register', async (req, res) => {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ message: 'Semua field harus diisi' });
    if (password.length < 6) return res.status(400).json({ message: 'Password minimal 6 karakter' });
    if (!pool) return res.status(503).json({ message: 'Database tidak tersedia' });
    try {
        const hashed = await bcrypt.hash(password, 10);
        const [result] = await pool.query('INSERT INTO users (name, email, password) VALUES (?, ?, ?)', [name, email, hashed]);
        res.json({ message: 'Registrasi berhasil!', userId: result.insertId });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'Email sudah terdaftar' });
        console.error('[ERROR] Register:', err.message);
        res.status(500).json({ message: 'Terjadi kesalahan' });
    }
});

// Login
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Email dan password harus diisi' });
    if (!pool) return res.status(503).json({ message: 'Database tidak tersedia' });
    try {
        const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
        if (rows.length === 0) return res.status(401).json({ message: 'Email atau password salah' });
        const isValid = await bcrypt.compare(password, rows[0].password);
        if (!isValid) return res.status(401).json({ message: 'Email atau password salah' });
        const token = jwt.sign({ id: rows[0].id, email: rows[0].email }, SECRET_KEY, { expiresIn: '7d' });
        res.json({ token, user: { id: rows[0].id, name: rows[0].name, email: rows[0].email } });
    } catch (err) {
        console.error('[ERROR] Login:', err.message);
        res.status(500).json({ message: 'Terjadi kesalahan' });
    }
});

// User motorcycles - GET
app.get('/api/motorcycles', auth, async (req, res) => {
    if (!pool) return res.status(503).json({ message: 'Database tidak tersedia' });
    try {
        const [rows] = await pool.query('SELECT * FROM motorcycles WHERE user_id = ? ORDER BY created_at DESC', [req.userId]);
        res.json({ data: rows });
    } catch (err) {
        console.error('[ERROR] Get motorcycles:', err.message);
        res.status(500).json({ message: 'Gagal mengambil data' });
    }
});

// User motorcycles - POST
app.post('/api/motorcycles', auth, async (req, res) => {
    const { brand, type, year, category, last_service, current_km } = req.body;
    if (!brand || !type || !year) return res.status(400).json({ message: 'Brand, type, dan tahun harus diisi' });
    if (!pool) return res.status(503).json({ message: 'Database tidak tersedia' });
    try {
        let next_service = null;
        if (last_service) {
            const d = new Date(last_service);
            d.setMonth(d.getMonth() + 3);
            next_service = d.toISOString().split('T')[0];
        }
        const [result] = await pool.query(
            `INSERT INTO motorcycles (user_id, brand, type, year, category, last_service, next_service, current_km)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [req.userId, brand, type, year, category || 'Matic', last_service || null, next_service, current_km || 0]
        );
        res.json({ data: { id: result.insertId, brand, type, year } });
    } catch (err) {
        console.error('[ERROR] Add motorcycle:', err.message);
        res.status(500).json({ message: 'Gagal menambah motor' });
    }
});

// Workshops - GET ALL
// Selalu mengembalikan data dari generator (via DB jika tersedia, fallback ke in-memory)
app.get('/api/workshops', async (req, res) => {
    if (!pool) {
        // Fallback in-memory: strip nested objects yg tidak perlu
        return res.json({ data: GENERATED_WORKSHOPS, total: GENERATED_WORKSHOPS.length, source: 'memory' });
    }
    try {
        const [workshops] = await pool.query('SELECT * FROM workshops ORDER BY rating DESC');

        if (workshops.length === 0) {
            // DB kosong (misalnya cold start race condition) - kembalikan data memory
            return res.json({ data: GENERATED_WORKSHOPS, total: GENERATED_WORKSHOPS.length, source: 'memory-fallback' });
        }

        const [allServices] = await pool.query('SELECT * FROM workshop_services');
        const [allParts]    = await pool.query('SELECT * FROM workshop_parts');

        const servicesMap = {};
        for (const s of allServices) {
            if (!servicesMap[s.workshop_id]) servicesMap[s.workshop_id] = [];
            servicesMap[s.workshop_id].push({ name: s.name, price: s.price });
        }
        const partsMap = {};
        for (const p of allParts) {
            if (!partsMap[p.workshop_id]) partsMap[p.workshop_id] = [];
            partsMap[p.workshop_id].push({ name: p.name, price: p.price });
        }

        for (const w of workshops) {
            w.services = servicesMap[w.id] || [];
            w.parts    = partsMap[w.id]    || [];
        }

        res.json({ data: workshops, total: workshops.length, source: 'database' });
    } catch (err) {
        console.error('[ERROR] Get workshops:', err.message);
        res.json({ data: GENERATED_WORKSHOPS, total: GENERATED_WORKSHOPS.length, source: 'memory-fallback' });
    }
});

// Workshop by ID
app.get('/api/workshops/:id', async (req, res) => {
    const wid = parseInt(req.params.id);
    if (!pool) {
        const w = GENERATED_WORKSHOPS.find(x => x.id === wid);
        if (!w) return res.status(404).json({ message: 'Bengkel tidak ditemukan' });
        return res.json({ data: w });
    }
    try {
        const [rows] = await pool.query('SELECT * FROM workshops WHERE id = ?', [wid]);
        if (rows.length === 0) return res.status(404).json({ message: 'Bengkel tidak ditemukan' });
        const workshop = rows[0];
        const [services] = await pool.query('SELECT name, price FROM workshop_services WHERE workshop_id = ?', [wid]);
        const [parts]    = await pool.query('SELECT name, price FROM workshop_parts WHERE workshop_id = ?', [wid]);
        workshop.services = services;
        workshop.parts    = parts;
        res.json({ data: workshop });
    } catch (err) {
        console.error('[ERROR] Get workshop by id:', err.message);
        res.status(500).json({ message: 'Terjadi kesalahan' });
    }
});

// Estimate
app.post('/api/estimates', auth, (req, res) => {
    const { serviceType, parts } = req.body;
    const servicePrices = { ringan: 50000, berkala: 80000, besar: 150000, ganti_oli: 45000, tune_up: 85000 };
    const partPrices    = { oli: 52000, busi: 25000, filter: 35000, vbelt: 185000 };
    const serviceCost   = servicePrices[serviceType] || 80000;
    let partsCost = 0;
    if (Array.isArray(parts)) parts.forEach(p => { partsCost += partPrices[p] || 0; });
    res.json({ data: { serviceCost, partsCost, totalCost: serviceCost + partsCost } });
});

// Service history
app.get('/api/service-history', auth, async (req, res) => {
    if (!pool) return res.json({ data: [] });
    try {
        const [rows] = await pool.query('SELECT * FROM service_history WHERE user_id = ? ORDER BY created_at DESC', [req.userId]);
        res.json({ data: rows });
    } catch {
        res.json({ data: [] });
    }
});

// Notifications
app.get('/api/notifications', auth, async (req, res) => {
    if (!pool) return res.json({ data: [], unreadCount: 0 });
    try {
        const [rows] = await pool.query('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC', [req.userId]);
        res.json({ data: rows, unreadCount: rows.filter(n => !n.is_read).length });
    } catch {
        res.json({ data: [], unreadCount: 0 });
    }
});

// Analytics
app.get('/api/analytics', auth, async (req, res) => {
    const empty = { totalMotor: 0, totalService: 0, totalSpent: 0, upcomingServices: [], savedMoney: 0 };
    if (!pool) return res.json(empty);
    try {
        const [motorCount]   = await pool.query('SELECT COUNT(*) as total FROM motorcycles WHERE user_id = ?', [req.userId]);
        const [serviceCount] = await pool.query('SELECT COUNT(*) as total, COALESCE(SUM(price), 0) as totalSpent FROM service_history WHERE user_id = ?', [req.userId]);
        const today          = new Date().toISOString().split('T')[0];
        const [upcoming]     = await pool.query(
            'SELECT * FROM motorcycles WHERE user_id = ? AND next_service IS NOT NULL AND next_service >= ? ORDER BY next_service ASC',
            [req.userId, today]
        );
        const totalSpent = Number(serviceCount[0]?.totalSpent || 0);
        res.json({
            totalMotor:       motorCount[0]?.total   || 0,
            totalService:     serviceCount[0]?.total  || 0,
            totalSpent,
            upcomingServices: upcoming,
            savedMoney:       Math.floor(totalSpent * 0.1),
        });
    } catch (err) {
        console.error('[ERROR] Analytics:', err.message);
        res.json(empty);
    }
});

// ==================== START SERVER ====================
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', async () => {
    console.log(`[START] MotoCare API berjalan di port ${PORT}`);
    await initDatabase();
});
