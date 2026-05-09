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
const MASTER_MOTORCYCLES = [
    // HONDA (18 models)
    { brand: 'Honda', type: 'Beat', category: 'Matic' }, { brand: 'Honda', type: 'Beat Street', category: 'Matic' },
    { brand: 'Honda', type: 'Vario 125', category: 'Matic' }, { brand: 'Honda', type: 'Vario 160', category: 'Matic' },
    { brand: 'Honda', type: 'PCX 160', category: 'Matic' }, { brand: 'Honda', type: 'ADV 160', category: 'Adventure' },
    { brand: 'Honda', type: 'ADV 350', category: 'Adventure' }, { brand: 'Honda', type: 'Scoopy', category: 'Matic' },
    { brand: 'Yamaha', type: 'NMAX', category: 'Matic' }, { brand: 'Yamaha', type: 'Aerox 155', category: 'Matic' },
    { brand: 'Yamaha', type: 'Fazzio', category: 'Matic' }, { brand: 'Yamaha', type: 'XSR 155', category: 'Naked' },
    { brand: 'Suzuki', type: 'Address 115', category: 'Matic' }, { brand: 'Suzuki', type: 'Avenis 125', category: 'Matic' },
    { brand: 'Kawasaki', type: 'Ninja 250', category: 'Sport' }, { brand: 'Kawasaki', type: 'Z250', category: 'Naked' },
    { brand: 'KTM', type: 'Duke 200', category: 'Naked' }, { brand: 'KTM', type: 'RC 200', category: 'Sport' },
    { brand: 'Vespa', type: 'Sprint 150', category: 'Matic' }, { brand: 'Vespa', type: 'Primavera 150', category: 'Matic' },
    { brand: 'Benelli', type: 'Leoncino 250', category: 'Classic' }, { brand: 'Royal Enfield', type: 'Classic 350', category: 'Classic' }
];

// DATA 36 BENGKEL (LENGKAP)
const MASTER_WORKSHOPS = [
    // AHASS Honda (6)
    { id: 1, name: 'AHASS Tangerang Utama', brand: 'Honda', address: 'Jl. Daan Mogot No. 88, Tangerang', phone: '+62-21-55701234', wa: '6281234567890', distance: '1.2 km', rating: 4.9, reviews: 456, status: 'open', hours: '08:00 - 17:00', verified: true, lat: -6.178, lng: 106.63 },
    { id: 2, name: 'AHASS BSD City', brand: 'Honda', address: 'Jl. BSD Raya No. 15, BSD', phone: '+62-21-55712345', wa: '6281234567891', distance: '3.2 km', rating: 4.8, reviews: 312, status: 'open', hours: '08:00 - 18:00', verified: true, lat: -6.23, lng: 106.65 },
    { id: 3, name: 'AHASS Cipondoh', brand: 'Honda', address: 'Jl. Cipondoh Raya No. 48, Tangerang', phone: '+62-21-55723456', wa: '6281234567892', distance: '1.8 km', rating: 4.7, reviews: 278, status: 'open', hours: '08:00 - 17:00', verified: true, lat: -6.185, lng: 106.62 },
    { id: 4, name: 'AHASS Karawaci', brand: 'Honda', address: 'Jl. Karawaci Raya No. 88, Karawaci', phone: '+62-21-55734567', wa: '6281234567893', distance: '4.0 km', rating: 4.6, reviews: 198, status: 'open', hours: '08:00 - 17:00', verified: true, lat: -6.17, lng: 106.64 },
    { id: 5, name: 'AHASS Serpong', brand: 'Honda', address: 'Jl. Raya Serpong No. 25, Serpong', phone: '+62-21-55745678', wa: '6281234567894', distance: '5.0 km', rating: 4.8, reviews: 234, status: 'open', hours: '08:00 - 17:00', verified: true, lat: -6.20, lng: 106.66 },
    { id: 6, name: 'AHASS Alam Sutera', brand: 'Honda', address: 'Jl. Alam Sutera Raya No. 100, Alam Sutera', phone: '+62-21-55756789', wa: '6281234567895', distance: '6.5 km', rating: 4.7, reviews: 156, status: 'open', hours: '09:00 - 18:00', verified: true, lat: -6.215, lng: 106.64 },
    // YSP Yamaha (6)
    { id: 7, name: 'YSP Cipondoh Makmur', brand: 'Yamaha', address: 'Jl. Cipondoh Makmur No. 45, Tangerang', phone: '+62-21-55767890', wa: '6282345678901', distance: '2.1 km', rating: 4.7, reviews: 312, status: 'open', hours: '08:00 - 17:00', verified: true, lat: -6.185, lng: 106.625 },
    { id: 8, name: 'YSP Bintaro', brand: 'Yamaha', address: 'Jl. Bintaro Utama No. 12, Bintaro', phone: '+62-21-55778901', wa: '6282345678902', distance: '6.5 km', rating: 4.8, reviews: 245, status: 'open', hours: '09:00 - 18:00', verified: true, lat: -6.21, lng: 106.68 },
    { id: 9, name: 'YSP Alam Sutera', brand: 'Yamaha', address: 'Jl. Alam Sutera Raya No. 56, Alam Sutera', phone: '+62-21-55789012', wa: '6282345678903', distance: '4.5 km', rating: 4.6, reviews: 189, status: 'open', hours: '08:00 - 18:00', verified: true, lat: -6.215, lng: 106.64 },
    { id: 10, name: 'YSP Gading Serpong', brand: 'Yamaha', address: 'Jl. Gading Serpong No. 23, Gading Serpong', phone: '+62-21-55790123', wa: '6282345678904', distance: '5.8 km', rating: 4.8, reviews: 267, status: 'open', hours: '08:00 - 17:00', verified: true, lat: -6.225, lng: 106.645 },
    { id: 11, name: 'YSP Tangerang City', brand: 'Yamaha', address: 'Jl. MH Thamrin No. 78, Tangerang', phone: '+62-21-55801234', wa: '6282345678905', distance: '1.8 km', rating: 4.5, reviews: 156, status: 'open', hours: '09:00 - 19:00', verified: true, lat: -6.175, lng: 106.63 },
    { id: 12, name: 'YSP Karawaci', brand: 'Yamaha', address: 'Jl. Karawaci No. 45, Karawaci', phone: '+62-21-55812345', wa: '6282345678906', distance: '3.8 km', rating: 4.6, reviews: 178, status: 'open', hours: '08:00 - 17:00', verified: true, lat: -6.17, lng: 106.64 },
    // Suzuki (5)
    { id: 13, name: 'Suzuki Karawaci', brand: 'Suzuki', address: 'Jl. Karawaci No. 12, Tangerang', phone: '+62-21-55823456', wa: '6283456789012', distance: '3.5 km', rating: 4.5, reviews: 187, status: 'open', hours: '08:00 - 16:00', verified: true, lat: -6.17, lng: 106.64 },
    { id: 14, name: 'Suzuki Ciledug', brand: 'Suzuki', address: 'Jl. Ciledug Raya No. 67, Tangerang', phone: '+62-21-55834567', wa: '6283456789013', distance: '7.2 km', rating: 4.4, reviews: 123, status: 'open', hours: '08:00 - 17:00', verified: true, lat: -6.24, lng: 106.71 },
    { id: 15, name: 'Suzuki Serpong', brand: 'Suzuki', address: 'Jl. Serpong Raya No. 45, Serpong', phone: '+62-21-55845678', wa: '6283456789014', distance: '5.0 km', rating: 4.6, reviews: 98, status: 'open', hours: '08:00 - 16:00', verified: true, lat: -6.20, lng: 106.66 },
    { id: 16, name: 'Suzuki BSD', brand: 'Suzuki', address: 'Jl. BSD Raya No. 78, BSD', phone: '+62-21-55856789', wa: '6283456789015', distance: '6.0 km', rating: 4.5, reviews: 112, status: 'open', hours: '08:00 - 17:00', verified: true, lat: -6.23, lng: 106.65 },
    { id: 17, name: 'Suzuki Tangerang', brand: 'Suzuki', address: 'Jl. Daan Mogot No. 150, Tangerang', phone: '+62-21-55867890', wa: '6283456789016', distance: '2.5 km', rating: 4.3, reviews: 156, status: 'open', hours: '08:00 - 17:00', verified: true, lat: -6.178, lng: 106.63 },
    // Kawasaki (4)
    { id: 18, name: 'Kawasaki Bintaro', brand: 'Kawasaki', address: 'Jl. Bintaro Utama No. 7, Bintaro', phone: '+62-21-55878901', wa: '6284567890123', distance: '5.5 km', rating: 4.7, reviews: 156, status: 'open', hours: '09:00 - 18:00', verified: true, lat: -6.21, lng: 106.68 },
    { id: 19, name: 'Kawasaki BSD', brand: 'Kawasaki', address: 'Jl. BSD Raya No. 34, BSD', phone: '+62-21-55889012', wa: '6284567890124', distance: '6.2 km', rating: 4.8, reviews: 89, status: 'open', hours: '09:00 - 18:00', verified: true, lat: -6.23, lng: 106.65 },
    { id: 20, name: 'Kawasaki Gading Serpong', brand: 'Kawasaki', address: 'Jl. Gading Serpong No. 45, Gading Serpong', phone: '+62-21-55890123', wa: '6284567890125', distance: '7.0 km', rating: 4.6, reviews: 67, status: 'open', hours: '09:00 - 18:00', verified: true, lat: -6.225, lng: 106.645 },
    { id: 21, name: 'Kawasaki Alam Sutera', brand: 'Kawasaki', address: 'Jl. Alam Sutera Raya No. 120, Alam Sutera', phone: '+62-21-55901234', wa: '6284567890126', distance: '5.8 km', rating: 4.7, reviews: 78, status: 'open', hours: '09:00 - 18:00', verified: true, lat: -6.215, lng: 106.64 },
    // KTM (2)
    { id: 22, name: 'KTM Official Jakarta', brand: 'KTM', address: 'Jl. TB Simatupang No. 23, Jakarta Selatan', phone: '+62-21-55912345', wa: '6285678901234', distance: '12.0 km', rating: 4.9, reviews: 89, status: 'open', hours: '10:00 - 19:00', verified: true, lat: -6.24, lng: 106.78 },
    { id: 23, name: 'KTM Bintaro', brand: 'KTM', address: 'Jl. Bintaro Raya No. 56, Bintaro', phone: '+62-21-55923456', wa: '6285678901235', distance: '8.5 km', rating: 4.7, reviews: 56, status: 'open', hours: '10:00 - 19:00', verified: true, lat: -6.21, lng: 106.68 },
    // Vespa (3)
    { id: 24, name: 'Vespa Tangerang City', brand: 'Vespa', address: 'Jl. Boulevard Raya No. 45, Tangerang', phone: '+62-21-55934567', wa: '6286789012345', distance: '2.5 km', rating: 4.6, reviews: 67, status: 'open', hours: '10:00 - 20:00', verified: true, lat: -6.175, lng: 106.63 },
    { id: 25, name: 'Vespa Alam Sutera', brand: 'Vespa', address: 'Jl. Alam Sutera Raya No. 88, Alam Sutera', phone: '+62-21-55945678', wa: '6286789012346', distance: '5.0 km', rating: 4.7, reviews: 45, status: 'open', hours: '10:00 - 20:00', verified: true, lat: -6.215, lng: 106.64 },
    { id: 26, name: 'Vespa BSD', brand: 'Vespa', address: 'Jl. BSD Raya No. 55, BSD', phone: '+62-21-55956789', wa: '6286789012347', distance: '6.5 km', rating: 4.5, reviews: 34, status: 'open', hours: '10:00 - 20:00', verified: true, lat: -6.23, lng: 106.65 },
    // Bengkel Umum (6)
    { id: 27, name: 'Maju Jaya Motor', brand: 'Umum', address: 'Jl. Raya Serpong No. 33, Tangerang Selatan', phone: '+62-21-55967890', wa: '6287890123456', distance: '4.2 km', rating: 4.3, reviews: 523, status: 'open', hours: '07:00 - 20:00', verified: false, lat: -6.195, lng: 106.66 },
    { id: 28, name: 'Barokah Motor', brand: 'Umum', address: 'Jl. Daan Mogot No. 112, Tangerang', phone: '+62-21-55978901', wa: '6287890123457', distance: '1.2 km', rating: 4.2, reviews: 389, status: 'open', hours: '08:00 - 19:00', verified: false, lat: -6.178, lng: 106.63 },
    { id: 29, name: 'Asia Motor', brand: 'Umum', address: 'Jl. Gatot Subroto No. 56, Tangerang', phone: '+62-21-55989012', wa: '6287890123458', distance: '2.8 km', rating: 4.1, reviews: 234, status: 'open', hours: '08:00 - 18:00', verified: false, lat: -6.18, lng: 106.635 },
    { id: 30, name: 'Anugrah Motor', brand: 'Umum', address: 'Jl. Imam Bonjol No. 78, Tangerang', phone: '+62-21-55990123', wa: '6287890123459', distance: '3.0 km', rating: 4.0, reviews: 178, status: 'open', hours: '08:00 - 19:00', verified: false, lat: -6.182, lng: 106.632 },
    { id: 31, name: 'Star Motor', brand: 'Umum', address: 'Jl. Merdeka No. 34, Tangerang', phone: '+62-21-56001234', wa: '6287890123460', distance: '1.8 km', rating: 4.4, reviews: 312, status: 'open', hours: '07:00 - 21:00', verified: false, lat: -6.176, lng: 106.628 },
    { id: 32, name: 'Berkah Motor', brand: 'Umum', address: 'Jl. MH Thamrin No. 23, Tangerang', phone: '+62-21-56012345', wa: '6287890123461', distance: '2.2 km', rating: 4.2, reviews: 198, status: 'open', hours: '08:00 - 20:00', verified: false, lat: -6.174, lng: 106.629 }
];

// Data Services & Parts
const SERVICES = ['Servis Berkala', 'Servis Besar', 'Ganti Oli', 'Tune Up', 'Spooring & Balancing'];
const PARTS = ['Oli Mesin', 'Busi', 'Filter Udara', 'V-Belt', 'Kampas Rem'];

// ==================== INISIALISASI DATABASE ====================
async function initDatabase() {
    try {
        console.log('⏳ Menghubungkan ke database MySQL...');
        pool = await mysql.createPool(dbConfig);
        
        const conn = await pool.getConnection();
        console.log('✅ Koneksi ke database berhasil!');
        conn.release();
        isDatabaseConnected = true;
        
        await createTables();
        await insertMasterData();
        
        console.log('✅ Database siap digunakan!');
    } catch (error) {
        console.error('❌ Database error:', error.message);
        console.log('⚠️ Server tetap berjalan, tapi endpoint database akan error');
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
    console.log('✓ Tabel users siap');
    
    // Master motorcycles
    await pool.query(`CREATE TABLE IF NOT EXISTS master_motorcycles (
        id INT AUTO_INCREMENT PRIMARY KEY,
        brand VARCHAR(50) NOT NULL,
        type VARCHAR(100) NOT NULL,
        category VARCHAR(50)
    )`);
    console.log('✓ Tabel master_motorcycles siap');
    
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
    console.log('✓ Tabel motorcycles siap');
    
    // Workshops
    await pool.query(`CREATE TABLE IF NOT EXISTS workshops (
        id INT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        brand VARCHAR(50),
        address TEXT,
        phone VARCHAR(20),
        wa VARCHAR(20),
        distance VARCHAR(20),
        rating DECIMAL(2,1),
        reviews INT DEFAULT 0,
        status VARCHAR(20) DEFAULT 'open',
        hours VARCHAR(100),
        verified BOOLEAN DEFAULT FALSE,
        lat DECIMAL(10,8),
        lng DECIMAL(11,8)
    )`);
    console.log('✓ Tabel workshops siap');
    
    // Workshop services
    await pool.query(`CREATE TABLE IF NOT EXISTS workshop_services (
        id INT AUTO_INCREMENT PRIMARY KEY,
        workshop_id INT NOT NULL,
        name VARCHAR(100) NOT NULL,
        price INT NOT NULL,
        FOREIGN KEY (workshop_id) REFERENCES workshops(id) ON DELETE CASCADE
    )`);
    console.log('✓ Tabel workshop_services siap');
    
    // Workshop parts
    await pool.query(`CREATE TABLE IF NOT EXISTS workshop_parts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        workshop_id INT NOT NULL,
        name VARCHAR(100) NOT NULL,
        price INT NOT NULL,
        FOREIGN KEY (workshop_id) REFERENCES workshops(id) ON DELETE CASCADE
    )`);
    console.log('✓ Tabel workshop_parts siap');
    
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
    console.log('✓ Tabel service_history siap');
    
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
    console.log('✓ Tabel notifications siap');
}

async function insertMasterData() {
    try {
        // Insert master motorcycles
        const [motorCount] = await pool.query('SELECT COUNT(*) as total FROM master_motorcycles');
        if (motorCount[0].total === 0) {
            console.log(`📝 Insert ${MASTER_MOTORCYCLES.length} data motor master...`);
            for (const motor of MASTER_MOTORCYCLES) {
                await pool.query(
                    'INSERT INTO master_motorcycles (brand, type, category) VALUES (?, ?, ?)',
                    [motor.brand, motor.type, motor.category]
                );
            }
            console.log(`✅ ${MASTER_MOTORCYCLES.length} data motor master disimpan`);
        }
        
        // Insert workshops (Gunakan INSERT IGNORE untuk hindari error duplikasi ID)
        const [workshopCount] = await pool.query('SELECT COUNT(*) as total FROM workshops');
        if (workshopCount[0].total === 0) {
            console.log(`📝 Insert ${MASTER_WORKSHOPS.length} data bengkel...`);
            
            for (const w of MASTER_WORKSHOPS) {
                // Insert workshop dengan ON DUPLICATE KEY UPDATE
                await pool.query(
                    `INSERT INTO workshops (id, name, brand, address, phone, wa, distance, rating, reviews, status, hours, verified, lat, lng) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                     ON DUPLICATE KEY UPDATE
                     name = VALUES(name), brand = VALUES(brand), address = VALUES(address),
                     phone = VALUES(phone), wa = VALUES(wa), distance = VALUES(distance),
                     rating = VALUES(rating), reviews = VALUES(reviews), status = VALUES(status),
                     hours = VALUES(hours), verified = VALUES(verified), lat = VALUES(lat), lng = VALUES(lng)`,
                    [w.id, w.name, w.brand, w.address, w.phone, w.wa, w.distance, w.rating, w.reviews, w.status, w.hours, w.verified, w.lat, w.lng]
                );
                
                // Hapus services & parts lama untuk ID ini (biar ga dobel)
                await pool.query('DELETE FROM workshop_services WHERE workshop_id = ?', [w.id]);
                await pool.query('DELETE FROM workshop_parts WHERE workshop_id = ?', [w.id]);
                
                // Insert services dengan harga variasi
                for (const service of SERVICES) {
                    const priceVariation = Math.floor(Math.random() * 50000) + 60000;
                    await pool.query(
                        'INSERT INTO workshop_services (workshop_id, name, price) VALUES (?, ?, ?)',
                        [w.id, service, priceVariation]
                    );
                }
                
                // Insert parts
                for (const part of PARTS) {
                    const priceVariation = Math.floor(Math.random() * 100000) + 30000;
                    await pool.query(
                        'INSERT INTO workshop_parts (workshop_id, name, price) VALUES (?, ?, ?)',
                        [w.id, part, priceVariation]
                    );
                }
            }
            console.log(`✅ ${MASTER_WORKSHOPS.length} bengkel dengan layanan dan part berhasil ditambahkan!`);
        } else {
            console.log(`✓ Data bengkel sudah ada (${workshopCount[0].total} records)`);
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
    res.json({ message: 'MotoCare Backend API', version: '1.0.0', database: isDatabaseConnected ? 'connected' : 'disconnected' });
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

// GET all workshops (Endpoint yang Anda panggil)
app.get('/api/workshops', async (req, res) => {
    if (!pool) return res.json({ data: MASTER_WORKSHOPS });
    try {
        const [workshops] = await pool.query('SELECT * FROM workshops ORDER BY rating DESC');
        for (const workshop of workshops) {
            const [services] = await pool.query('SELECT name, price FROM workshop_services WHERE workshop_id = ?', [workshop.id]);
            const [parts] = await pool.query('SELECT name, price FROM workshop_parts WHERE workshop_id = ?', [workshop.id]);
            workshop.services = services;
            workshop.parts = parts;
        }
        res.json({ data: workshops });
    } catch (error) {
        console.error('Error:', error);
        res.json({ data: MASTER_WORKSHOPS });
    }
});

// GET workshop by ID
app.get('/api/workshops/:id', async (req, res) => {
    if (!pool) return res.json({ data: MASTER_WORKSHOPS.find(w => w.id == req.params.id) });
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
        const [upcoming] = await pool.query('SELECT * FROM motorcycles WHERE user_id = ? AND next_service IS NOT NULL AND next_service >= ? ORDER BY next_service ASC', [req.userId, today]);
        res.json({
            totalMotor: motorCount[0]?.total || 0,
            totalService: serviceCount[0]?.total || 0,
            totalSpent: serviceCount[0]?.totalSpent || 0,
            upcomingServices: upcoming,
            savedMoney: Math.floor((serviceCount[0]?.totalSpent || 0) * 0.1)
        });
    } catch (error) {
        res.json({ totalMotor: 0, totalService: 0, totalSpent: 0, upcomingServices: [], savedMoney: 0 });
    }
});

// ==================== START SERVER ====================
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', async () => {
    await initDatabase();
    console.log(`🚀 Server running on port ${PORT}`);
});
