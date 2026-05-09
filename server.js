const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();
app.use(cors());
app.use(express.json());

// ==================== KONFIGURASI DATABASE (Hanya dari ENV) ====================
const dbConfig = {
    host: process.env.MYSQLHOST,
    port: parseInt(process.env.MYSQLPORT) || 3306,
    user: process.env.MYSQLUSER,
    password: process.env.MYSQLPASSWORD,
    database: process.env.MYSQLDATABASE,
    ssl: process.env.MYSQLSSL === 'true' ? { rejectUnauthorized: false } : false,
    waitForConnections: true,
    connectionLimit: 10,
    connectTimeout: 30000
};

let pool = null;
let isDatabaseConnected = false;
const SECRET_KEY = process.env.SECRET_KEY || 'motocare_super_secret_key_2025';

// ==================== DATA STATIS (Tidak akan pernah berubah) ====================

// 100+ Model Motor Indonesia
const MASTER_MOTORCYCLES = [
    // HONDA MATIC (15 model)
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
    // HONDA SPORT (4 model)
    { brand: 'Honda', type: 'CBR150R', category: 'Sport' },
    { brand: 'Honda', type: 'CBR250RR', category: 'Sport' },
    { brand: 'Honda', type: 'CBR600RR', category: 'Sport' },
    { brand: 'Honda', type: 'CBR1000RR', category: 'Sport' },
    // HONDA BEBEK (3 model)
    { brand: 'Honda', type: 'Supra X 125', category: 'Bebek' },
    { brand: 'Honda', type: 'Revo 110', category: 'Bebek' },
    { brand: 'Honda', type: 'Sonic 150', category: 'Bebek' },
    // HONDA NAKED (3 model)
    { brand: 'Honda', type: 'CB150R StreetFire', category: 'Naked' },
    { brand: 'Honda', type: 'CB250R', category: 'Naked' },
    { brand: 'Honda', type: 'CB300R', category: 'Naked' },

    // YAMAHA MATIC (9 model)
    { brand: 'Yamaha', type: 'NMAX 155', category: 'Matic' },
    { brand: 'Yamaha', type: 'NMAX 155 Connected', category: 'Matic' },
    { brand: 'Yamaha', type: 'Aerox 155', category: 'Matic' },
    { brand: 'Yamaha', type: 'FreeGo 125', category: 'Matic' },
    { brand: 'Yamaha', type: 'Fazzio 125', category: 'Matic' },
    { brand: 'Yamaha', type: 'Lexi 125', category: 'Matic' },
    { brand: 'Yamaha', type: 'Mio M3', category: 'Matic' },
    { brand: 'Yamaha', type: 'Gear 125', category: 'Matic' },
    { brand: 'Yamaha', type: 'Grand Filano', category: 'Matic' },
    // YAMAHA SPORT (4 model)
    { brand: 'Yamaha', type: 'R15', category: 'Sport' },
    { brand: 'Yamaha', type: 'R25', category: 'Sport' },
    { brand: 'Yamaha', type: 'R6', category: 'Sport' },
    { brand: 'Yamaha', type: 'R1', category: 'Sport' },
    // YAMAHA NAKED (4 model)
    { brand: 'Yamaha', type: 'MT-15', category: 'Naked' },
    { brand: 'Yamaha', type: 'MT-25', category: 'Naked' },
    { brand: 'Yamaha', type: 'MT-03', category: 'Naked' },
    { brand: 'Yamaha', type: 'XSR 155', category: 'Naked' },
    // YAMAHA BEBEK (2 model)
    { brand: 'Yamaha', type: 'Vega ZR', category: 'Bebek' },
    { brand: 'Yamaha', type: 'Jupiter Z1', category: 'Bebek' },

    // SUZUKI MATIC (4 model)
    { brand: 'Suzuki', type: 'Address 115', category: 'Matic' },
    { brand: 'Suzuki', type: 'Avenis 125', category: 'Matic' },
    { brand: 'Suzuki', type: 'Nex 115', category: 'Matic' },
    { brand: 'Suzuki', type: 'Burgman Street 125 EX', category: 'Matic' },
    // SUZUKI SPORT (3 model)
    { brand: 'Suzuki', type: 'GSX-R150', category: 'Sport' },
    { brand: 'Suzuki', type: 'GSX-R250', category: 'Sport' },
    { brand: 'Suzuki', type: 'GSX-R1000R', category: 'Sport' },
    // SUZUKI NAKED (2 model)
    { brand: 'Suzuki', type: 'GSX-S150', category: 'Naked' },
    { brand: 'Suzuki', type: 'GSX-S250', category: 'Naked' },
    // SUZUKI LAINNYA (2 model)
    { brand: 'Suzuki', type: 'Satria F150', category: 'Sport' },
    { brand: 'Suzuki', type: 'SFV 650 Gladius', category: 'Naked' },

    // KAWASAKI SPORT (5 model)
    { brand: 'Kawasaki', type: 'Ninja 250', category: 'Sport' },
    { brand: 'Kawasaki', type: 'Ninja 400', category: 'Sport' },
    { brand: 'Kawasaki', type: 'Ninja 650', category: 'Sport' },
    { brand: 'Kawasaki', type: 'Ninja ZX-6R', category: 'Sport' },
    { brand: 'Kawasaki', type: 'Ninja ZX-10R', category: 'Sport' },
    // KAWASAKI NAKED (4 model)
    { brand: 'Kawasaki', type: 'Z250', category: 'Naked' },
    { brand: 'Kawasaki', type: 'Z400', category: 'Naked' },
    { brand: 'Kawasaki', type: 'Z650', category: 'Naked' },
    { brand: 'Kawasaki', type: 'Z900', category: 'Naked' },
    // KAWASAKI TOURING (3 model)
    { brand: 'Kawasaki', type: 'Versys 250', category: 'Touring' },
    { brand: 'Kawasaki', type: 'Versys 650', category: 'Touring' },
    { brand: 'Kawasaki', type: 'W175', category: 'Classic' },

    // KTM (10 model)
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

    // VESPA (10 model)
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

    // BENELLI (5 model)
    { brand: 'Benelli', type: 'Leoncino 250', category: 'Naked' },
    { brand: 'Benelli', type: 'Leoncino 500', category: 'Naked' },
    { brand: 'Benelli', type: 'TNT 25', category: 'Naked' },
    { brand: 'Benelli', type: 'TNT 135', category: 'Naked' },
    { brand: 'Benelli', type: 'Imperiale 400', category: 'Classic' },

    // ROYAL ENFIELD (4 model)
    { brand: 'Royal Enfield', type: 'Classic 350', category: 'Classic' },
    { brand: 'Royal Enfield', type: 'Meteor 350', category: 'Classic' },
    { brand: 'Royal Enfield', type: 'Hunter 350', category: 'Classic' },
    { brand: 'Royal Enfield', type: 'Continental GT 650', category: 'Classic' },

    // BMW (6 model)
    { brand: 'BMW', type: 'G310R', category: 'Naked' },
    { brand: 'BMW', type: 'G310GS', category: 'Adventure' },
    { brand: 'BMW', type: 'F750GS', category: 'Adventure' },
    { brand: 'BMW', type: 'F850GS', category: 'Adventure' },
    { brand: 'BMW', type: 'R1250GS', category: 'Adventure' },
    { brand: 'BMW', type: 'R nineT', category: 'Classic' },

    // HARLEY-DAVIDSON (5 model)
    { brand: 'Harley-Davidson', type: 'Iron 883', category: 'Cruiser' },
    { brand: 'Harley-Davidson', type: 'Forty-Eight', category: 'Cruiser' },
    { brand: 'Harley-Davidson', type: 'Street 750', category: 'Cruiser' },
    { brand: 'Harley-Davidson', type: 'Road King', category: 'Touring' },
    { brand: 'Harley-Davidson', type: 'Sportster S', category: 'Cruiser' },
];

// ==================== GENERATOR DATA BENGKEL ====================

function rand(min, max) {
    return Math.random() * (max - min) + min;
}

function randInt(min, max) {
    return Math.floor(rand(min, max + 1));
}

function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function generateWorkshops() {
    const CITIES = [
        { name: 'Jakarta Pusat',  latMin: -6.18, latMax: -6.15, lngMin: 106.82, lngMax: 106.87 },
        { name: 'Jakarta Selatan', latMin: -6.30, latMax: -6.20, lngMin: 106.77, lngMax: 106.85 },
        { name: 'Jakarta Barat',  latMin: -6.20, latMax: -6.13, lngMin: 106.73, lngMax: 106.80 },
        { name: 'Jakarta Timur',  latMin: -6.25, latMax: -6.17, lngMin: 106.87, lngMax: 106.97 },
        { name: 'Jakarta Utara',  latMin: -6.15, latMax: -6.09, lngMin: 106.80, lngMax: 106.93 },
        { name: 'Tangerang',      latMin: -6.23, latMax: -6.15, lngMin: 106.58, lngMax: 106.70 },
        { name: 'Tangerang Selatan', latMin: -6.32, latMax: -6.23, lngMin: 106.64, lngMax: 106.75 },
        { name: 'Bekasi',         latMin: -6.28, latMax: -6.20, lngMin: 106.97, lngMax: 107.05 },
        { name: 'Depok',          latMin: -6.44, latMax: -6.35, lngMin: 106.78, lngMax: 106.87 },
        { name: 'Bogor',          latMin: -6.65, latMax: -6.56, lngMin: 106.78, lngMax: 106.86 },
        { name: 'Bandung',        latMin: -6.95, latMax: -6.87, lngMin: 107.56, lngMax: 107.67 },
        { name: 'Surabaya',       latMin: -7.35, latMax: -7.22, lngMin: 112.68, lngMax: 112.80 },
        { name: 'Medan',          latMin: 3.52,  latMax: 3.65,  lngMin: 98.63,  lngMax: 98.73  },
        { name: 'Makassar',       latMin: -5.20, latMax: -5.10, lngMin: 119.38, lngMax: 119.48 },
        { name: 'Semarang',       latMin: -7.05, latMax: -6.96, lngMin: 110.38, lngMax: 110.48 },
        { name: 'Yogyakarta',     latMin: -7.84, latMax: -7.77, lngMin: 110.35, lngMax: 110.43 },
        { name: 'Malang',         latMin: -8.00, latMax: -7.93, lngMin: 112.60, lngMax: 112.68 },
        { name: 'Denpasar',       latMin: -8.72, latMax: -8.62, lngMin: 115.17, lngMax: 115.27 },
        { name: 'Palembang',      latMin: -3.02, latMax: -2.94, lngMin: 104.72, lngMax: 104.82 },
        { name: 'Batam',          latMin: 1.08,  latMax: 1.18,  lngMin: 104.02, lngMax: 104.12 },
    ];

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
            brand: 'KTM', prefix: 'KTM', share: 5,
            streets: ['TB Simatupang', 'Bintaro Raya', 'Casablanca', 'HR Rasuna Said', 'Kuningan Barat'],
        },
        {
            brand: 'Vespa', prefix: 'Vespa', share: 5,
            streets: ['Kemang Raya', 'Gunawarman', 'Senopati', 'Suryo', 'Pondok Indah'],
        },
        {
            brand: 'Umum', prefix: null, share: 7,
            streets: ['Raya Jaya', 'Kenanga', 'Mawar', 'Melati', 'Cempaka', 'Anggrek', 'Dahlia'],
            generalNames: [
                'Maju Jaya Motor', 'Barokah Motor', 'Anugrah Motor', 'Berkah Motor', 'Star Motor',
                'Rizki Motor', 'Setia Motor', 'Sumber Jaya Motor', 'Karya Motor', 'Prima Motor',
                'Abadi Motor', 'Makmur Motor', 'Sentosa Motor', 'Jaya Mandiri Motor', 'Cahaya Motor',
                'Duta Motor', 'Guna Motor', 'Harapan Motor', 'Indah Motor', 'Jasa Motor',
                'Kencana Motor', 'Lestari Motor', 'Mulia Motor', 'Nusantara Motor', 'Omega Motor',
            ],
        },
    ];

    const HOURS_OPTIONS = ['08:00-17:00', '09:00-18:00', '08:00-20:00', '10:00-22:00', '07:00-21:00', '24 Jam'];
    const STATUSES = ['open', 'open', 'open', 'open', 'open', 'open', 'open', 'open', 'open', 'closed', 'busy'];

    const SERVICES_POOL = [
        { name: 'Servis Berkala', minPrice: 55000, maxPrice: 120000 },
        { name: 'Servis Besar', minPrice: 120000, maxPrice: 300000 },
        { name: 'Ganti Oli Mesin', minPrice: 45000, maxPrice: 85000 },
        { name: 'Tune Up', minPrice: 75000, maxPrice: 150000 },
        { name: 'Spooring & Balancing', minPrice: 60000, maxPrice: 100000 },
        { name: 'Ganti Kampas Rem', minPrice: 50000, maxPrice: 90000 },
        { name: 'Cuci Motor', minPrice: 15000, maxPrice: 35000 },
        { name: 'Ganti Ban', minPrice: 80000, maxPrice: 200000 },
        { name: 'Servis Karburator / FI', minPrice: 65000, maxPrice: 130000 },
        { name: 'Overhaul Mesin', minPrice: 350000, maxPrice: 800000 },
    ];

    const PARTS_POOL = [
        { name: 'Oli Mesin', minPrice: 45000, maxPrice: 120000 },
        { name: 'Busi NGK', minPrice: 20000, maxPrice: 55000 },
        { name: 'Filter Udara', minPrice: 30000, maxPrice: 75000 },
        { name: 'V-Belt', minPrice: 150000, maxPrice: 280000 },
        { name: 'Kampas Rem Depan', minPrice: 35000, maxPrice: 90000 },
        { name: 'Kampas Rem Belakang', minPrice: 30000, maxPrice: 80000 },
        { name: 'Rantai & Gear Set', minPrice: 120000, maxPrice: 350000 },
        { name: 'Aki Motor', minPrice: 80000, maxPrice: 250000 },
        { name: 'Filter Oli', minPrice: 20000, maxPrice: 50000 },
        { name: 'Seal Oli', minPrice: 15000, maxPrice: 45000 },
    ];

    // Hitung jumlah bengkel per brand berdasarkan share
    const TOTAL = randInt(150, 200);
    const workshops = [];
    let id = 1;
    const generalNamesUsed = new Set();

    for (const cfg of BRAND_CONFIG) {
        const count = Math.round((cfg.share / 100) * TOTAL);

        for (let i = 0; i < count; i++) {
            const city = pick(CITIES);
            const street = pick(cfg.streets);
            const streetNo = randInt(1, 200);
            const lat = parseFloat(rand(city.latMin, city.latMax).toFixed(6));
            const lng = parseFloat(rand(city.lngMin, city.lngMax).toFixed(6));
            const verified = Math.random() < 0.80;
            const status = pick(STATUSES);
            const rating = parseFloat(rand(3.5, 5.0).toFixed(1));
            const distance = parseFloat(rand(0.5, 15.0).toFixed(1));

            let name;
            if (cfg.brand === 'Umum') {
                // Ambil nama unik dari pool
                const available = cfg.generalNames.filter(n => !generalNamesUsed.has(n));
                if (available.length > 0) {
                    name = pick(available);
                    generalNamesUsed.add(name);
                } else {
                    // Jika pool habis, buat nama baru dengan kota
                    name = `Motor ${city.name} ${id}`;
                }
            } else {
                name = `${cfg.prefix} ${city.name} ${i + 1}`;
            }

            // Nomor telepon & WA
            const areaCode = city.name.startsWith('Jakarta') || city.name === 'Tangerang' || city.name === 'Bekasi' || city.name === 'Depok' || city.name === 'Bogor'
                ? '21' : pick(['22', '24', '31', '61', '411', '274', '341', '361', '711', '778']);
            const phoneNum = randInt(10000000, 99999999);
            const phone = `+62-${areaCode}-${phoneNum}`;
            const waPrefix = pick(['628111', '628112', '628113', '628114', '628115', '628116', '628117', '628118', '628119',
                '62812', '62813', '62814', '62815', '62816', '62817', '62818', '62819',
                '62821', '62822', '62823', '62852', '62853', '62856', '62857', '62858', '62859',
                '62877', '62878', '62879', '62881', '62882', '62883', '62895', '62896', '62897', '62898', '62899']);
            const wa = `${waPrefix}${randInt(10000000, 99999999)}`;

            // Pilih layanan (5-8 acak)
            const shuffledServices = [...SERVICES_POOL].sort(() => Math.random() - 0.5);
            const services = shuffledServices.slice(0, randInt(5, 8)).map(s => ({
                name: s.name,
                price: randInt(s.minPrice, s.maxPrice),
            }));

            // Pilih suku cadang (4-6 acak)
            const shuffledParts = [...PARTS_POOL].sort(() => Math.random() - 0.5);
            const parts = shuffledParts.slice(0, randInt(4, 6)).map(p => ({
                name: p.name,
                price: randInt(p.minPrice, p.maxPrice),
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
                reviews: randInt(50, 2000),
                status,
                hours: pick(HOURS_OPTIONS),
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

// Generate sekali saat startup, simpan ke memori
const GENERATED_WORKSHOPS = generateWorkshops();
console.log(`âœ… Generated ${GENERATED_WORKSHOPS.length} bengkel`);

// ==================== INISIALISASI DATABASE ====================
async function initDatabase() {
    try {
        console.log('â³ Menghubungkan ke database MySQL...');
        pool = await mysql.createPool(dbConfig);

        const conn = await pool.getConnection();
        console.log('âœ… Koneksi ke database berhasil!');
        conn.release();
        isDatabaseConnected = true;

        await createTables();
        await insertMasterData();

        console.log('âœ… Database siap digunakan!');
    } catch (error) {
        console.error('âŒ Database error:', error.message);
        console.log('âš ï¸ Server tetap berjalan, tapi endpoint database akan error');
        isDatabaseConnected = false;
        pool = null;
    }
}

async function createTables() {
    // Users table
    await pool.query(`CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    console.log('âœ“ Tabel users siap');

    // Master motorcycles
    await pool.query(`CREATE TABLE IF NOT EXISTS master_motorcycles (
        id INT AUTO_INCREMENT PRIMARY KEY,
        brand VARCHAR(50) NOT NULL,
        type VARCHAR(100) NOT NULL,
        category VARCHAR(50)
    )`);
    console.log('âœ“ Tabel master_motorcycles siap');

    // User motorcycles
    await pool.query(`CREATE TABLE IF NOT EXISTS motorcycles (
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
    )`);
    console.log('âœ“ Tabel motorcycles siap');

    // Workshops
    await pool.query(`CREATE TABLE IF NOT EXISTS workshops (
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
    )`);
    console.log('âœ“ Tabel workshops siap');

    // Workshop services
    await pool.query(`CREATE TABLE IF NOT EXISTS workshop_services (
        id INT AUTO_INCREMENT PRIMARY KEY,
        workshop_id INT NOT NULL,
        name VARCHAR(100) NOT NULL,
        price INT NOT NULL,
        FOREIGN KEY (workshop_id) REFERENCES workshops(id) ON DELETE CASCADE
    )`);
    console.log('âœ“ Tabel workshop_services siap');

    // Workshop parts
    await pool.query(`CREATE TABLE IF NOT EXISTS workshop_parts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        workshop_id INT NOT NULL,
        name VARCHAR(100) NOT NULL,
        price INT NOT NULL,
        FOREIGN KEY (workshop_id) REFERENCES workshops(id) ON DELETE CASCADE
    )`);
    console.log('âœ“ Tabel workshop_parts siap');

    // Service history
    await pool.query(`CREATE TABLE IF NOT EXISTS service_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        motorcycle_id INT,
        workshop_id INT,
        service_name VARCHAR(100),
        price DECIMAL(10,2),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`);
    console.log('âœ“ Tabel service_history siap');

    // Notifications
    await pool.query(`CREATE TABLE IF NOT EXISTS notifications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        title VARCHAR(200),
        message TEXT,
        type VARCHAR(50),
        is_read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`);
    console.log('âœ“ Tabel notifications siap');
}

async function insertMasterData() {
    try {
        // Insert master motorcycles
        const [motorCount] = await pool.query('SELECT COUNT(*) as total FROM master_motorcycles');
        if (motorCount[0].total === 0) {
            console.log(`ðŸ“ Insert ${MASTER_MOTORCYCLES.length} data motor master...`);
            for (const motor of MASTER_MOTORCYCLES) {
                await pool.query(
                    'INSERT INTO master_motorcycles (brand, type, category) VALUES (?, ?, ?)',
                    [motor.brand, motor.type, motor.category]
                );
            }
            console.log(`âœ… ${MASTER_MOTORCYCLES.length} data motor master disimpan`);
        } else {
            console.log(`âœ“ Data motor sudah ada (${motorCount[0].total} records)`);
        }

        // Insert workshops dari GENERATED_WORKSHOPS
        const [workshopCount] = await pool.query('SELECT COUNT(*) as total FROM workshops');
        if (workshopCount[0].total === 0) {
            console.log(`ðŸ“ Insert ${GENERATED_WORKSHOPS.length} bengkel ke database...`);

            for (const w of GENERATED_WORKSHOPS) {
                await pool.query(
                    `INSERT INTO workshops (id, name, brand, address, phone, wa, distance, rating, reviews, status, hours, verified, lat, lng)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                     ON DUPLICATE KEY UPDATE
                     name = VALUES(name), brand = VALUES(brand), address = VALUES(address),
                     phone = VALUES(phone), wa = VALUES(wa), distance = VALUES(distance),
                     rating = VALUES(rating), reviews = VALUES(reviews), status = VALUES(status),
                     hours = VALUES(hours), verified = VALUES(verified), lat = VALUES(lat), lng = VALUES(lng)`,
                    [w.id, w.name, w.brand, w.address, w.phone, w.wa, w.distance,
                     w.rating, w.reviews, w.status, w.hours, w.verified, w.lat, w.lng]
                );

                await pool.query('DELETE FROM workshop_services WHERE workshop_id = ?', [w.id]);
                await pool.query('DELETE FROM workshop_parts WHERE workshop_id = ?', [w.id]);

                for (const service of w.services) {
                    await pool.query(
                        'INSERT INTO workshop_services (workshop_id, name, price) VALUES (?, ?, ?)',
                        [w.id, service.name, service.price]
                    );
                }

                for (const part of w.parts) {
                    await pool.query(
                        'INSERT INTO workshop_parts (workshop_id, name, price) VALUES (?, ?, ?)',
                        [w.id, part.name, part.price]
                    );
                }
            }
            console.log(`âœ… ${GENERATED_WORKSHOPS.length} bengkel berhasil disimpan ke database!`);
        } else {
            console.log(`âœ“ Data bengkel sudah ada (${workshopCount[0].total} records)`);
        }
    } catch (error) {
        console.error('Error inserting master data:', error.message);
    }
}

// ==================== MIDDLEWARE AUTH ====================
const auth = async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Token tidak ditemukan' });
    try {
        const decoded = jwt.verify(token, SECRET_KEY);
        req.userId = decoded.id;
        next();
    } catch (error) {
        return res.status(401).json({ message: 'Token tidak valid' });
    }
};

// ==================== API ENDPOINTS ====================
app.get('/', (req, res) => {
    res.json({
        message: 'MotoCare Backend API',
        version: '2.0.0',
        database: isDatabaseConnected ? 'connected' : 'disconnected',
        workshops: GENERATED_WORKSHOPS.length,
        motorcycles: MASTER_MOTORCYCLES.length,
    });
});

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', database: isDatabaseConnected ? 'connected' : 'disconnected' });
});

// Get master motorcycles
app.get('/api/motorcycles-master', async (req, res) => {
    if (!isDatabaseConnected || !pool) return res.json({ data: MASTER_MOTORCYCLES });
    try {
        const [rows] = await pool.query('SELECT * FROM master_motorcycles ORDER BY brand, type');
        res.json({ data: rows });
    } catch (error) {
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
        const hashedPassword = await bcrypt.hash(password, 10);
        const [result] = await pool.query('INSERT INTO users (name, email, password) VALUES (?, ?, ?)', [name, email, hashedPassword]);
        res.json({ message: 'Registrasi berhasil!', userId: result.insertId });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'Email sudah terdaftar' });
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

        const user = rows[0];
        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) return res.status(401).json({ message: 'Email atau password salah' });

        const token = jwt.sign({ id: user.id, email: user.email }, SECRET_KEY, { expiresIn: '7d' });
        res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
    } catch (error) {
        res.status(500).json({ message: 'Terjadi kesalahan' });
    }
});

// Get user motorcycles
app.get('/api/motorcycles', auth, async (req, res) => {
    if (!pool) return res.status(503).json({ message: 'Database tidak tersedia' });
    try {
        const [rows] = await pool.query('SELECT * FROM motorcycles WHERE user_id = ? ORDER BY created_at DESC', [req.userId]);
        res.json({ data: rows });
    } catch (error) {
        res.status(500).json({ message: 'Gagal mengambil data' });
    }
});

// Add motorcycle
app.post('/api/motorcycles', auth, async (req, res) => {
    const { brand, type, year, category, last_service, current_km } = req.body;
    if (!brand || !type || !year) return res.status(400).json({ message: 'Brand, type, tahun harus diisi' });
    if (!pool) return res.status(503).json({ message: 'Database tidak tersedia' });

    try {
        let next_service = null;
        if (last_service) {
            next_service = new Date(last_service);
            next_service.setMonth(next_service.getMonth() + 3);
        }
        const [result] = await pool.query(
            `INSERT INTO motorcycles (user_id, brand, type, year, category, last_service, next_service, current_km)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [req.userId, brand, type, year, category || 'Matic', last_service || null, next_service, current_km || 0]
        );
        res.json({ data: { id: result.insertId, brand, type, year } });
    } catch (error) {
        res.status(500).json({ message: 'Gagal menambah motor' });
    }
});

// GET all workshops - mengembalikan SEMUA bengkel tanpa limit
app.get('/api/workshops', async (req, res) => {
    // Fallback ke data in-memory jika DB tidak tersedia
    if (!pool) return res.json({ data: GENERATED_WORKSHOPS });

    try {
        // Ambil SEMUA bengkel tanpa LIMIT
        const [workshops] = await pool.query('SELECT * FROM workshops ORDER BY rating DESC');

        // Ambil semua services & parts sekaligus (lebih efisien daripada query per bengkel)
        const [allServices] = await pool.query('SELECT * FROM workshop_services');
        const [allParts] = await pool.query('SELECT * FROM workshop_parts');

        // Buat map untuk lookup cepat
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

        // Gabungkan data
        for (const w of workshops) {
            w.services = servicesMap[w.id] || [];
            w.parts = partsMap[w.id] || [];
        }

        res.json({ data: workshops });
    } catch (error) {
        console.error('Error fetching workshops:', error);
        // Fallback ke data in-memory
        res.json({ data: GENERATED_WORKSHOPS });
    }
});

// GET workshop by ID
app.get('/api/workshops/:id', async (req, res) => {
    if (!pool) {
        const w = GENERATED_WORKSHOPS.find(w => w.id == req.params.id);
        if (!w) return res.status(404).json({ message: 'Bengkel tidak ditemukan' });
        return res.json({ data: w });
    }
    try {
        const [workshops] = await pool.query('SELECT * FROM workshops WHERE id = ?', [req.params.id]);
        if (workshops.length === 0) return res.status(404).json({ message: 'Bengkel tidak ditemukan' });
        const workshop = workshops[0];
        const [services] = await pool.query('SELECT name, price FROM workshop_services WHERE workshop_id = ?', [workshop.id]);
        const [parts] = await pool.query('SELECT name, price FROM workshop_parts WHERE workshop_id = ?', [workshop.id]);
        workshop.services = services;
        workshop.parts = parts;
        res.json({ data: workshop });
    } catch (error) {
        res.status(500).json({ message: 'Error' });
    }
});

// Estimate
app.post('/api/estimates', auth, (req, res) => {
    const { serviceType, parts } = req.body;
    const servicePrices = { ringan: 50000, berkala: 80000, besar: 150000, ganti_oli: 45000, tune_up: 85000 };
    const partPrices = { oli: 52000, busi: 25000, filter: 35000, vbelt: 185000 };
    const serviceCost = servicePrices[serviceType] || 80000;
    let partsCost = 0;
    if (parts) parts.forEach(part => partsCost += partPrices[part] || 0);
    res.json({ data: { serviceCost, partsCost, totalCost: serviceCost + partsCost } });
});

// Service history
app.get('/api/service-history', auth, async (req, res) => {
    if (!pool) return res.json({ data: [] });
    try {
        const [rows] = await pool.query('SELECT * FROM service_history WHERE user_id = ? ORDER BY created_at DESC', [req.userId]);
        res.json({ data: rows });
    } catch (error) {
        res.json({ data: [] });
    }
});

// Notifications
app.get('/api/notifications', auth, async (req, res) => {
    if (!pool) return res.json({ data: [], unreadCount: 0 });
    try {
        const [rows] = await pool.query('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC', [req.userId]);
        const unreadCount = rows.filter(n => !n.is_read).length;
        res.json({ data: rows, unreadCount });
    } catch (error) {
        res.json({ data: [], unreadCount: 0 });
    }
});

// Analytics
app.get('/api/analytics', auth, async (req, res) => {
    if (!pool) return res.json({ totalMotor: 0, totalService: 0, totalSpent: 0, upcomingServices: [], savedMoney: 0 });
    try {
        const [motorCount] = await pool.query('SELECT COUNT(*) as total FROM motorcycles WHERE user_id = ?', [req.userId]);
        const [serviceCount] = await pool.query('SELECT COUNT(*) as total, COALESCE(SUM(price), 0) as totalSpent FROM service_history WHERE user_id = ?', [req.userId]);
        const today = new Date().toISOString().split('T')[0];
        const [upcoming] = await pool.query(
            'SELECT * FROM motorcycles WHERE user_id = ? AND next_service IS NOT NULL AND next_service >= ? ORDER BY next_service ASC',
            [req.userId, today]
        );
        res.json({
            totalMotor: motorCount[0]?.total || 0,
            totalService: serviceCount[0]?.total || 0,
            totalSpent: serviceCount[0]?.totalSpent || 0,
            upcomingServices: upcoming,
            savedMoney: Math.floor((serviceCount[0]?.totalSpent || 0) * 0.1),
        });
    } catch (error) {
        res.json({ totalMotor: 0, totalService: 0, totalSpent: 0, upcomingServices: [], savedMoney: 0 });
    }
});

// ==================== START SERVER ====================
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', async () => {
    await initDatabase();
    console.log(`ðŸš€ Server running on port ${PORT}`);
});
