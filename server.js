'use strict';

const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const mysql      = require('mysql2/promise');
const cors       = require('cors');
const jwt        = require('jsonwebtoken');
const bcrypt     = require('bcryptjs');
const nodemailer = require('nodemailer');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*', methods: ['GET','POST'] } });

app.use(cors());
app.use(express.json());

// ==================== KONFIGURASI ====================
const dbConfig = {
    host:             process.env.MYSQLHOST,
    port:             parseInt(process.env.MYSQLPORT) || 3306,
    user:             process.env.MYSQLUSER,
    password:         process.env.MYSQLPASSWORD,
    database:         process.env.MYSQLDATABASE,
    ssl:              process.env.MYSQLSSL === 'true' ? { rejectUnauthorized: false } : false,
    waitForConnections: true,
    connectionLimit:  10,
    connectTimeout:   30000,
};

const SECRET_KEY      = process.env.SECRET_KEY || 'motocare_super_secret_key_2025';
const FRONTEND_URL    = process.env.FRONTEND_URL || 'https://motocare.wuaze.com';
const TOTAL_WORKSHOPS = 150;

let pool               = null;
let isDatabaseConnected = false;

// ==================== KONFIGURASI NODEMAILER ====================
/**
 * Transporter Nodemailer untuk kirim email.
 * Set environment variables:
 *   SMTP_HOST     = smtp.gmail.com
 *   SMTP_PORT     = 587
 *   SMTP_USER     = your_email@gmail.com
 *   SMTP_PASSWORD = your_app_password (bukan password Gmail biasa, gunakan App Password)
 */
const transporter = nodemailer.createTransport({
    host:   process.env.SMTP_HOST || 'smtp.gmail.com',
    port:   parseInt(process.env.SMTP_PORT) || 587,
    secure: false, // true untuk port 465, false untuk 587
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
    },
    tls: {
        rejectUnauthorized: false,
    },
});

// Verifikasi koneksi SMTP saat startup (opsional, tidak blokir server)
transporter.verify((error) => {
    if (error) {
        console.warn('[WARN] SMTP tidak terhubung:', error.message);
        console.warn('[WARN] Fitur email tidak akan berfungsi. Set SMTP_HOST, SMTP_USER, SMTP_PASSWORD di environment.');
    } else {
        console.log('[OK] SMTP siap mengirim email');
    }
});

// ==================== UTILITY EMAIL ====================

/**
 * Validasi format email
 */
const isValidEmail = (email) => {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
};

/**
 * Generate token 6 digit untuk verifikasi / reset password
 */
const generateVerificationToken = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Generate JWT token untuk verifikasi email (alternatif 6 digit)
 * Digunakan untuk link verifikasi di email
 */
const generateVerificationJWT = (email, type = 'verify') => {
    return jwt.sign({ email, type }, SECRET_KEY, { expiresIn: '24h' });
};

/**
 * Kirim email verifikasi ke user baru
 * @param {string} email - Alamat email tujuan
 * @param {string} token - Token 6 digit
 * @param {string} name  - Nama user
 */
const sendVerificationEmail = async (email, token, name) => {
    const verificationLink = `${FRONTEND_URL}/verify-email?token=${token}&email=${encodeURIComponent(email)}`;

    const mailOptions = {
        from:    `"MotoCare" <${process.env.SMTP_USER}>`,
        to:      email,
        subject: 'Verifikasi Email MotoCare',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="text-align: center; margin-bottom: 30px;">
                    <h1 style="color: #e63946; margin: 0;">MotoCare</h1>
                    <p style="color: #666; margin: 5px 0;">Aplikasi Servis Motor Terpercaya</p>
                </div>
                <h2 style="color: #333;">Halo, ${name}!</h2>
                <p style="color: #555; line-height: 1.6;">
                    Terima kasih telah mendaftar di MotoCare. Untuk mulai menggunakan akun Anda,
                    silakan verifikasi alamat email Anda terlebih dahulu.
                </p>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="${verificationLink}"
                       style="display: inline-block; background-color: #e63946; color: white;
                              padding: 14px 32px; text-decoration: none; border-radius: 8px;
                              font-size: 16px; font-weight: bold;">
                        ✅ Verifikasi Email
                    </a>
                </div>
                <p style="color: #555;">Atau masukkan kode verifikasi berikut di aplikasi:</p>
                <div style="background: #f4f4f4; border-radius: 8px; padding: 20px; text-align: center; margin: 16px 0;">
                    <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #e63946;">${token}</span>
                </div>
                <p style="color: #888; font-size: 13px;">⏰ Kode ini akan kadaluarsa dalam <strong>24 jam</strong>.</p>
                <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
                <p style="color: #aaa; font-size: 12px; text-align: center;">
                    Jika Anda tidak mendaftar di MotoCare, abaikan email ini.<br>
                    &copy; 2025 MotoCare. All rights reserved.
                </p>
            </div>
        `,
    };

    await transporter.sendMail(mailOptions);
};

/**
 * Kirim email reset password
 * @param {string} email - Alamat email tujuan
 * @param {string} token - Token 6 digit
 * @param {string} name  - Nama user
 */
const sendResetPasswordEmail = async (email, token, name) => {
    const resetLink = `${FRONTEND_URL}/reset-password?token=${token}&email=${encodeURIComponent(email)}`;

    const mailOptions = {
        from:    `"MotoCare" <${process.env.SMTP_USER}>`,
        to:      email,
        subject: 'Reset Password MotoCare',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="text-align: center; margin-bottom: 30px;">
                    <h1 style="color: #e63946; margin: 0;">MotoCare</h1>
                    <p style="color: #666; margin: 5px 0;">Aplikasi Servis Motor Terpercaya</p>
                </div>
                <h2 style="color: #333;">Halo, ${name}!</h2>
                <p style="color: #555; line-height: 1.6;">
                    Kami menerima permintaan untuk mereset password akun MotoCare Anda.
                    Klik tombol di bawah untuk membuat password baru.
                </p>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="${resetLink}"
                       style="display: inline-block; background-color: #e63946; color: white;
                              padding: 14px 32px; text-decoration: none; border-radius: 8px;
                              font-size: 16px; font-weight: bold;">
                        🔑 Reset Password
                    </a>
                </div>
                <p style="color: #555;">Atau masukkan kode berikut di aplikasi:</p>
                <div style="background: #f4f4f4; border-radius: 8px; padding: 20px; text-align: center; margin: 16px 0;">
                    <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #e63946;">${token}</span>
                </div>
                <p style="color: #888; font-size: 13px;">⏰ Kode ini akan kadaluarsa dalam <strong>1 jam</strong>.</p>
                <div style="background: #fff3cd; border-radius: 8px; padding: 15px; margin: 16px 0;">
                    <p style="color: #856404; margin: 0; font-size: 13px;">
                        ⚠️ Jika Anda tidak meminta reset password, abaikan email ini.
                        Password Anda tidak akan berubah.
                    </p>
                </div>
                <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
                <p style="color: #aaa; font-size: 12px; text-align: center;">
                    &copy; 2025 MotoCare. All rights reserved.
                </p>
            </div>
        `,
    };

    await transporter.sendMail(mailOptions);
};

/**
 * Kirim email notifikasi verifikasi bengkel (opsional — ke admin)
 * @param {string} adminEmail - Email admin platform
 * @param {object} data       - Data bengkel yang mendaftar
 */
const sendWorkshopRegistrationNotif = async (adminEmail, data) => {
    if (!adminEmail) return;
    const mailOptions = {
        from:    `"MotoCare System" <${process.env.SMTP_USER}>`,
        to:      adminEmail,
        subject: `[MotoCare] Pendaftaran Bengkel Baru: ${data.workshop_name}`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <h2 style="color: #e63946;">Pendaftaran Bengkel Baru</h2>
                <table style="width:100%; border-collapse: collapse;">
                    <tr><td style="padding:8px; border:1px solid #ddd;"><b>Nama Bengkel</b></td><td style="padding:8px; border:1px solid #ddd;">${data.workshop_name}</td></tr>
                    <tr><td style="padding:8px; border:1px solid #ddd;"><b>Pemilik</b></td><td style="padding:8px; border:1px solid #ddd;">${data.full_name}</td></tr>
                    <tr><td style="padding:8px; border:1px solid #ddd;"><b>Email</b></td><td style="padding:8px; border:1px solid #ddd;">${data.email}</td></tr>
                    <tr><td style="padding:8px; border:1px solid #ddd;"><b>Telepon</b></td><td style="padding:8px; border:1px solid #ddd;">${data.phone}</td></tr>
                    <tr><td style="padding:8px; border:1px solid #ddd;"><b>Alamat</b></td><td style="padding:8px; border:1px solid #ddd;">${data.workshop_address || '-'}</td></tr>
                </table>
                <p style="margin-top:20px;">Silakan login ke panel admin untuk meninjau pendaftaran ini.</p>
            </div>
        `,
    };
    await transporter.sendMail(mailOptions);
};

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

// ==================== GENERATOR BENGKEL (deterministik) ====================
function createSeededRandom(seed) {
    let s = seed >>> 0;
    return function () {
        s ^= s << 13; s ^= s >> 17; s ^= s << 5;
        return ((s >>> 0) / 4294967296);
    };
}
const rng = createSeededRandom(20250101);
function rngFloat(min, max) { return rng() * (max - min) + min; }
function rngInt(min, max)   { return Math.floor(rngFloat(min, max + 1)); }
function rngPick(arr)       { return arr[Math.floor(rng() * arr.length)]; }

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
    const BRAND_CONFIG = [
        { brand: 'Honda',    prefix: 'AHASS',   share: 35, streets: ['Daan Mogot','Gajah Mada','Sudirman','Pemuda','Wahidin','Soekarno-Hatta','Ahmad Yani'] },
        { brand: 'Yamaha',   prefix: 'YSP',     share: 30, streets: ['Raya Serpong','Boulevard','Pahlawan','Diponegoro','Gatot Subroto','MH Thamrin','Veteran'] },
        { brand: 'Suzuki',   prefix: 'Suzuki',  share: 10, streets: ['Raya Barat','Imam Bonjol','Merdeka','Iskandar Muda','Jenderal Sudirman','Hasanuddin'] },
        { brand: 'Kawasaki', prefix: 'Kawasaki',share: 8,  streets: ['Siliwangi','Ciledug Raya','Kapten Subijanto','R.E. Martadinata','Arteri Selatan'] },
        { brand: 'KTM',      prefix: 'KTM',     share: 4,  streets: ['TB Simatupang','Bintaro Raya','Casablanca','HR Rasuna Said','Kuningan Barat'] },
        { brand: 'Vespa',    prefix: 'Vespa',   share: 4,  streets: ['Kemang Raya','Gunawarman','Senopati','Suryo','Pondok Indah'] },
        { brand: 'Umum',     prefix: null,      share: 9,  streets: ['Raya Jaya','Kenanga','Mawar','Melati','Cempaka','Anggrek','Dahlia'],
          generalNames: ['Maju Jaya Motor','Barokah Motor','Anugrah Motor','Berkah Motor','Star Motor','Rizki Motor','Setia Motor','Sumber Jaya Motor','Karya Motor','Prima Motor','Abadi Motor','Makmur Motor','Sentosa Motor','Jaya Mandiri Motor','Cahaya Motor','Duta Motor','Guna Motor','Harapan Motor','Indah Motor','Jasa Motor','Kencana Motor','Lestari Motor','Mulia Motor','Nusantara Motor','Omega Motor','Perdana Motor','Qolbu Motor','Rahmat Motor','Sejahtera Motor','Tiga Bersaudara Motor'] },
    ];
    const HOURS_OPTIONS = ['08:00-17:00','09:00-18:00','08:00-20:00','10:00-22:00','07:00-21:00','24 Jam'];
    const STATUSES      = ['open','open','open','open','open','open','open','open','open','closed','busy'];
    const SERVICES_POOL = [
        { name: 'Servis Berkala',         minPrice: 55000,  maxPrice: 120000 },
        { name: 'Servis Besar',           minPrice: 120000, maxPrice: 300000 },
        { name: 'Ganti Oli Mesin',        minPrice: 45000,  maxPrice: 85000  },
        { name: 'Tune Up',                minPrice: 75000,  maxPrice: 150000 },
        { name: 'Spooring & Balancing',   minPrice: 60000,  maxPrice: 100000 },
        { name: 'Ganti Kampas Rem',       minPrice: 50000,  maxPrice: 90000  },
        { name: 'Cuci Motor',             minPrice: 15000,  maxPrice: 35000  },
        { name: 'Ganti Ban',              minPrice: 80000,  maxPrice: 200000 },
        { name: 'Servis Karburator / FI', minPrice: 65000,  maxPrice: 130000 },
        { name: 'Overhaul Mesin',         minPrice: 350000, maxPrice: 800000 },
    ];
    const PARTS_POOL = [
        { name: 'Oli Mesin',            minPrice: 45000,  maxPrice: 120000 },
        { name: 'Busi NGK',             minPrice: 20000,  maxPrice: 55000  },
        { name: 'Filter Udara',         minPrice: 30000,  maxPrice: 75000  },
        { name: 'V-Belt',               minPrice: 150000, maxPrice: 280000 },
        { name: 'Kampas Rem Depan',     minPrice: 35000,  maxPrice: 90000  },
        { name: 'Kampas Rem Belakang',  minPrice: 30000,  maxPrice: 80000  },
        { name: 'Rantai & Gear Set',    minPrice: 120000, maxPrice: 350000 },
        { name: 'Aki Motor',            minPrice: 80000,  maxPrice: 250000 },
        { name: 'Filter Oli',           minPrice: 20000,  maxPrice: 50000  },
        { name: 'Seal Oli',             minPrice: 15000,  maxPrice: 45000  },
    ];
    const WA_PREFIXES = ['628111','628112','628113','628114','628115','628116','628117','628118','628119','62812','62813','62814','62815','62816','62817','62818','62819','62821','62822','62823','62852','62853','62856','62857','62858','62859','62877','62878','62879','62881','62882','62883','62895','62896','62897','62898','62899'];
    const JAKARTA_AREA = new Set(['Jakarta Pusat','Jakarta Selatan','Jakarta Barat','Jakarta Timur','Jakarta Utara','Tangerang','Bekasi','Depok','Bogor']);

    const counts = BRAND_CONFIG.map(cfg => Math.round((cfg.share / 100) * TOTAL_WORKSHOPS));
    counts[0] += TOTAL_WORKSHOPS - counts.reduce((a, b) => a + b, 0);

    const workshops = [];
    let id = 1;
    const generalNamesUsed = new Set();

    for (let ci = 0; ci < BRAND_CONFIG.length; ci++) {
        const cfg   = BRAND_CONFIG[ci];
        const count = counts[ci];
        for (let i = 0; i < count; i++) {
            const city     = rngPick(CITIES);
            const street   = rngPick(cfg.streets);
            const streetNo = rngInt(1, 200);
            const lat      = parseFloat(rngFloat(city.latMin, city.latMax).toFixed(6));
            const lng      = parseFloat(rngFloat(city.lngMin, city.lngMax).toFixed(6));
            const verified = rng() < 0.80;
            const status   = rngPick(STATUSES);
            const rating   = parseFloat(rngFloat(3.5, 5.0).toFixed(1));
            const distance = parseFloat(rngFloat(0.5, 15.0).toFixed(1));

            let name;
            if (cfg.brand === 'Umum') {
                const available = (cfg.generalNames || []).filter(n => !generalNamesUsed.has(n));
                if (available.length > 0) {
                    const chosen = available[Math.floor(rng() * available.length)];
                    name = chosen; generalNamesUsed.add(chosen);
                } else { name = `Bengkel Motor ${city.name} ${id}`; }
            } else { name = `${cfg.prefix} ${city.name} ${i + 1}`; }

            const areaCode = JAKARTA_AREA.has(city.name) ? '21' : rngPick(['22','24','31','61','411','274','341','361','711','778']);
            const phone    = `+62-${areaCode}-${rngInt(10000000, 99999999)}`;
            const wa       = `${rngPick(WA_PREFIXES)}${rngInt(10000000, 99999999)}`;

            const svcPool = [...SERVICES_POOL];
            for (let k = svcPool.length - 1; k > 0; k--) { const j = Math.floor(rng() * (k + 1)); [svcPool[k], svcPool[j]] = [svcPool[j], svcPool[k]]; }
            const services = svcPool.slice(0, rngInt(5, 8)).map(s => ({ name: s.name, price: rngInt(s.minPrice, s.maxPrice) }));

            const partsPool = [...PARTS_POOL];
            for (let k = partsPool.length - 1; k > 0; k--) { const j = Math.floor(rng() * (k + 1)); [partsPool[k], partsPool[j]] = [partsPool[j], partsPool[k]]; }
            const parts = partsPool.slice(0, rngInt(4, 6)).map(p => ({ name: p.name, price: rngInt(p.minPrice, p.maxPrice) }));

            workshops.push({ id, name, brand: cfg.brand, address: `Jl. ${street} No. ${streetNo}, ${city.name}`, phone, wa, distance: `${distance} km`, rating, reviews: rngInt(50, 2000), status, hours: rngPick(HOURS_OPTIONS), verified, lat, lng, services, parts });
            id++;
        }
    }
    return workshops;
}

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
        // --- Tabel users (dengan kolom verifikasi email) ---
        `CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            email VARCHAR(100) UNIQUE NOT NULL,
            password VARCHAR(255) NOT NULL,
            role ENUM('user','admin') DEFAULT 'user',
            is_verified BOOLEAN DEFAULT FALSE,
            verification_token VARCHAR(255) NULL,
            verification_token_expires TIMESTAMP NULL,
            email_verified_at TIMESTAMP NULL,
            reset_password_token VARCHAR(255) NULL,
            reset_password_expires TIMESTAMP NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,

        // Migrasi: tambah kolom verifikasi ke tabel users yang sudah ada
        // (MySQL akan error jika kolom sudah ada, ditangani di bawah)

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
            lng DECIMAL(11,6),
            owner_id INT NULL,
            is_active BOOLEAN DEFAULT TRUE,
            last_active TIMESTAMP NULL
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
        // --- Tabel onboarding bengkel ---
        `CREATE TABLE IF NOT EXISTS workshop_admins (
            id          INT AUTO_INCREMENT PRIMARY KEY,
            user_id     INT NOT NULL,
            workshop_id INT NULL,
            full_name   VARCHAR(100) NOT NULL,
            phone       VARCHAR(20)  NOT NULL,
            role        ENUM('owner','staff') DEFAULT 'owner',
            is_verified BOOLEAN DEFAULT FALSE,
            verified_at TIMESTAMP NULL,
            created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id)     REFERENCES users(id)     ON DELETE CASCADE,
            FOREIGN KEY (workshop_id) REFERENCES workshops(id) ON DELETE SET NULL
        )`,
        `CREATE TABLE IF NOT EXISTS workshop_pending (
            id                  INT AUTO_INCREMENT PRIMARY KEY,
            workshop_admin_id   INT NOT NULL,
            workshop_name       VARCHAR(150) NOT NULL,
            workshop_address    TEXT,
            workshop_phone      VARCHAR(30),
            workshop_wa         VARCHAR(30),
            workshop_lat        DECIMAL(10,6),
            workshop_lng        DECIMAL(11,6),
            workshop_brand      VARCHAR(50),
            status              ENUM('pending','approved','rejected') DEFAULT 'pending',
            reject_reason       TEXT NULL,
            submitted_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            reviewed_at         TIMESTAMP NULL,
            FOREIGN KEY (workshop_admin_id) REFERENCES workshop_admins(id) ON DELETE CASCADE
        )`,
        // --- Tabel chat ---
        `CREATE TABLE IF NOT EXISTS chat_rooms (
            id          INT AUTO_INCREMENT PRIMARY KEY,
            user_id     INT NOT NULL,
            workshop_id INT NOT NULL,
            created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY  unique_chat (user_id, workshop_id),
            FOREIGN KEY (user_id)     REFERENCES users(id)     ON DELETE CASCADE,
            FOREIGN KEY (workshop_id) REFERENCES workshops(id) ON DELETE CASCADE
        )`,
        `CREATE TABLE IF NOT EXISTS messages (
            id          INT AUTO_INCREMENT PRIMARY KEY,
            room_id     INT NOT NULL,
            sender_id   INT NOT NULL,
            sender_type ENUM('user','workshop') NOT NULL,
            message     TEXT NOT NULL,
            is_read     BOOLEAN DEFAULT FALSE,
            read_at     TIMESTAMP NULL,
            created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (room_id) REFERENCES chat_rooms(id) ON DELETE CASCADE
        )`,
        // --- Tabel log email (opsional, untuk tracking pengiriman email) ---
        `CREATE TABLE IF NOT EXISTS email_logs (
            id              INT AUTO_INCREMENT PRIMARY KEY,
            recipient_email VARCHAR(100),
            type            ENUM('verification','reset_password','welcome','workshop_registration') DEFAULT 'verification',
            status          ENUM('sent','failed') DEFAULT 'sent',
            sent_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
    ];

    for (const q of queries) {
        try {
            await pool.query(q);
        } catch (err) {
            console.warn('[WARN] Query error (mungkin sudah ada):', err.message);
        }
    }

    // Migrasi kolom verifikasi ke tabel users yang sudah ada (idempotent)
    const migrationColumns = [
        'ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE',
        'ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token VARCHAR(255) NULL',
        'ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token_expires TIMESTAMP NULL',
        'ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMP NULL',
        'ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_password_token VARCHAR(255) NULL',
        'ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_password_expires TIMESTAMP NULL',
    ];
    for (const mq of migrationColumns) {
        try { await pool.query(mq); } catch { /* diabaikan jika kolom sudah ada */ }
    }

    console.log('[OK] Semua tabel siap');
}

async function syncWorkshopsToDatabase() {
    // Cek apakah bengkel generated sudah ada — skip sync jika sudah ada
    // Ini mencegah DELETE+INSERT ulang setiap restart (penyebab SIGTERM timeout)
    const [existing] = await pool.query(
        'SELECT COUNT(*) as total FROM workshops WHERE owner_id IS NULL'
    );
    if (existing[0].total >= GENERATED_WORKSHOPS.length) {
        console.log(`[OK] Data bengkel sudah ada (${existing[0].total} records), skip sinkronisasi`);
        return;
    }

    console.log('[INFO] Sinkronisasi data bengkel ke database (pertama kali)...');

    // Hapus hanya bengkel generated (bukan bengkel yang didaftarkan owner)
    await pool.query('DELETE ws FROM workshop_services ws JOIN workshops w ON ws.workshop_id = w.id WHERE w.owner_id IS NULL');
    await pool.query('DELETE wp FROM workshop_parts wp JOIN workshops w ON wp.workshop_id = w.id WHERE w.owner_id IS NULL');
    await pool.query('DELETE FROM workshops WHERE owner_id IS NULL');

    // Bulk insert semua workshop sekaligus (1 query, jauh lebih cepat)
    const workshopRows = GENERATED_WORKSHOPS.map(w => [
        w.id, w.name, w.brand, w.address, w.phone, w.wa,
        w.distance, w.rating, w.reviews, w.status, w.hours,
        w.verified, w.lat, w.lng
    ]);
    await pool.query(
        `INSERT INTO workshops (id,name,brand,address,phone,wa,distance,rating,reviews,status,hours,verified,lat,lng,is_active) VALUES ?`,
        [workshopRows]
    );

    // Bulk insert semua services sekaligus
    const allServices = [];
    const allParts    = [];
    for (const w of GENERATED_WORKSHOPS) {
        for (const s of w.services) allServices.push([w.id, s.name, s.price]);
        for (const p of w.parts)    allParts.push([w.id, p.name, p.price]);
    }
    if (allServices.length > 0)
        await pool.query('INSERT INTO workshop_services (workshop_id,name,price) VALUES ?', [allServices]);
    if (allParts.length > 0)
        await pool.query('INSERT INTO workshop_parts (workshop_id,name,price) VALUES ?', [allParts]);

    console.log(`[OK] ${GENERATED_WORKSHOPS.length} bengkel berhasil disimpan ke database`);
}

async function insertMasterMotorcycles() {
    const [row] = await pool.query('SELECT COUNT(*) as total FROM master_motorcycles');
    if (row[0].total > 0) { console.log(`[OK] Data motor master sudah ada (${row[0].total} records)`); return; }
    await pool.query('INSERT INTO master_motorcycles (brand,type,category) VALUES ?', [MASTER_MOTORCYCLES.map(m => [m.brand, m.type, m.category])]);
    console.log(`[OK] ${MASTER_MOTORCYCLES.length} data motor master disimpan`);
}

// ==================== HELPER ====================

/**
 * Buat notifikasi in-app untuk user
 */
async function createInAppNotification(userId, title, message, type = 'chat') {
    if (!pool) return;
    try {
        await pool.query(
            'INSERT INTO notifications (user_id,title,message,type) VALUES (?,?,?,?)',
            [userId, title, message, type]
        );
    } catch (e) { console.error('[WARN] Notifikasi gagal:', e.message); }
}

/**
 * Log pengiriman email ke tabel email_logs
 */
async function logEmail(recipientEmail, type, status = 'sent') {
    if (!pool) return;
    try {
        await pool.query(
            'INSERT INTO email_logs (recipient_email,type,status) VALUES (?,?,?)',
            [recipientEmail, type, status]
        );
    } catch { /* abaikan error logging */ }
}

// ==================== MIDDLEWARE ====================
const auth = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Token tidak ditemukan' });
    try {
        const decoded = jwt.verify(token, SECRET_KEY);
        req.userId   = decoded.id;
        req.userRole = decoded.role || 'user';
        next();
    } catch {
        return res.status(401).json({ message: 'Token tidak valid' });
    }
};

const adminOnly = (req, res, next) => {
    if (req.userRole !== 'admin') return res.status(403).json({ message: 'Akses ditolak. Admin only.' });
    next();
};

// Middleware bengkel: bisa user biasa ATAU workshop_admin
const workshopAuth = async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Token tidak ditemukan' });
    try {
        const decoded = jwt.verify(token, SECRET_KEY);
        req.userId   = decoded.id;
        req.userRole = decoded.role || 'user';

        if (pool) {
            const [wa] = await pool.query(
                'SELECT * FROM workshop_admins WHERE user_id = ? AND is_verified = TRUE',
                [decoded.id]
            );
            if (wa.length > 0) {
                req.workshopAdmin   = wa[0];
                req.workshopId      = wa[0].workshop_id;
                req.isWorkshopAdmin = true;
            }
        }
        next();
    } catch {
        return res.status(401).json({ message: 'Token tidak valid' });
    }
};

// ==================== SOCKET.IO ====================
const onlineUsers = new Map();

io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Token tidak ditemukan'));
    try {
        const decoded = jwt.verify(token, SECRET_KEY);
        socket.userId   = decoded.id;
        socket.userRole = decoded.role || 'user';
        next();
    } catch {
        next(new Error('Token tidak valid'));
    }
});

io.on('connection', async (socket) => {
    console.log(`[SOCKET] User ${socket.userId} terhubung (${socket.id})`);

    let workshopId = null;
    if (pool) {
        try {
            const [wa] = await pool.query(
                'SELECT workshop_id FROM workshop_admins WHERE user_id = ? AND is_verified = TRUE',
                [socket.userId]
            );
            if (wa.length > 0) workshopId = wa[0].workshop_id;
        } catch(e) { /* ignore */ }
    }

    onlineUsers.set(socket.userId, {
        socketId:   socket.id,
        type:       workshopId ? 'workshop' : 'user',
        workshopId: workshopId,
    });

    socket.on('join-room', ({ roomId }) => {
        if (!roomId) return;
        socket.join(`room:${roomId}`);
        console.log(`[SOCKET] User ${socket.userId} join room ${roomId}`);
    });

    socket.on('send-message', async ({ roomId, message }) => {
        if (!roomId || !message?.trim()) return;
        if (!pool) return socket.emit('error', { message: 'Database tidak tersedia' });

        try {
            const [rooms] = await pool.query('SELECT * FROM chat_rooms WHERE id = ?', [roomId]);
            if (rooms.length === 0) return socket.emit('error', { message: 'Room tidak ditemukan' });

            const room = rooms[0];
            let senderType;
            if (socket.userId === room.user_id)              senderType = 'user';
            else if (workshopId && workshopId === room.workshop_id) senderType = 'workshop';
            else return socket.emit('error', { message: 'Anda tidak memiliki akses ke room ini' });

            const [result] = await pool.query(
                'INSERT INTO messages (room_id,sender_id,sender_type,message) VALUES (?,?,?,?)',
                [roomId, socket.userId, senderType, message.trim()]
            );

            await pool.query('UPDATE chat_rooms SET updated_at = NOW() WHERE id = ?', [roomId]);

            const newMsg = {
                id:          result.insertId,
                room_id:     roomId,
                sender_id:   socket.userId,
                sender_type: senderType,
                message:     message.trim(),
                is_read:     false,
                created_at:  new Date().toISOString(),
            };

            io.to(`room:${roomId}`).emit('new-message', newMsg);

            if (senderType === 'user') {
                const [wa] = await pool.query(
                    'SELECT user_id FROM workshop_admins WHERE workshop_id = ? AND is_verified = TRUE LIMIT 1',
                    [room.workshop_id]
                );
                if (wa.length > 0 && !onlineUsers.has(wa[0].user_id)) {
                    await createInAppNotification(wa[0].user_id, 'Pesan Baru', `Customer mengirim pesan: "${message.trim().slice(0,60)}"`, 'chat');
                }
            } else {
                const receiverId = room.user_id;
                if (receiverId && !onlineUsers.has(receiverId)) {
                    const [ws] = await pool.query('SELECT name FROM workshops WHERE id = ?', [room.workshop_id]);
                    const wsName = ws[0]?.name || 'Bengkel';
                    await createInAppNotification(receiverId, 'Pesan Baru', `${wsName}: "${message.trim().slice(0,60)}"`, 'chat');
                }
            }

        } catch (err) {
            console.error('[SOCKET] send-message error:', err.message);
            socket.emit('error', { message: 'Gagal mengirim pesan' });
        }
    });

    socket.on('typing', ({ roomId, isTyping }) => {
        socket.to(`room:${roomId}`).emit('typing', { userId: socket.userId, isTyping: !!isTyping });
    });

    socket.on('mark-read', async ({ roomId, messageIds }) => {
        if (!pool || !Array.isArray(messageIds) || messageIds.length === 0) return;
        try {
            await pool.query(
                'UPDATE messages SET is_read = TRUE, read_at = NOW() WHERE id IN (?) AND room_id = ?',
                [messageIds, roomId]
            );
            io.to(`room:${roomId}`).emit('messages-read', { roomId, messageIds });
        } catch (err) {
            console.error('[SOCKET] mark-read error:', err.message);
        }
    });

    socket.on('disconnect', () => {
        onlineUsers.delete(socket.userId);
        console.log(`[SOCKET] User ${socket.userId} terputus`);
    });
});

// ==================== ENDPOINTS ====================

app.get('/', (req, res) => {
    res.json({
        message:     'MotoCare Backend API',
        version:     '4.0.0',
        database:    isDatabaseConnected ? 'connected' : 'disconnected',
        workshops:   GENERATED_WORKSHOPS.length,
        motorcycles: MASTER_MOTORCYCLES.length,
        features:    ['auth','email-verification','password-reset','motorcycles','workshops','estimator','history','notifications','chat','onboarding'],
    });
});

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', database: isDatabaseConnected ? 'connected' : 'disconnected', onlineUsers: onlineUsers.size });
});

// ── Master motorcycles ────────────────────────────────────────────
app.get('/api/motorcycles-master', async (req, res) => {
    if (!isDatabaseConnected || !pool) return res.json({ data: MASTER_MOTORCYCLES });
    try {
        const [rows] = await pool.query('SELECT * FROM master_motorcycles ORDER BY brand, type');
        res.json({ data: rows });
    } catch { res.json({ data: MASTER_MOTORCYCLES }); }
});

// ============================================================
//  AUTH — REGISTRASI & VERIFIKASI EMAIL
// ============================================================

/**
 * POST /api/auth/register
 * Registrasi user baru.
 * Setelah registrasi, email verifikasi dikirim ke email user.
 * User TIDAK bisa login sebelum email diverifikasi.
 */
app.post('/api/auth/register', async (req, res) => {
    const { name, email, password } = req.body;
    if (!name || !email || !password)
        return res.status(400).json({ message: 'Semua field harus diisi' });
    if (!isValidEmail(email))
        return res.status(400).json({ message: 'Format email tidak valid' });
    if (password.length < 6)
        return res.status(400).json({ message: 'Password minimal 6 karakter' });
    if (!pool) return res.status(503).json({ message: 'Database tidak tersedia' });

    try {
        const verificationToken   = generateVerificationToken();
        const tokenExpires        = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 jam
        const hashed              = await bcrypt.hash(password, 10);

        const [result] = await pool.query(
            `INSERT INTO users (name, email, password, role, is_verified, verification_token, verification_token_expires)
             VALUES (?, ?, ?, 'user', FALSE, ?, ?)`,
            [name, email, hashed, verificationToken, tokenExpires]
        );

        // Kirim email verifikasi (tidak blokir response jika gagal)
        let emailSent = false;
        try {
            await sendVerificationEmail(email, verificationToken, name);
            await logEmail(email, 'verification', 'sent');
            emailSent = true;
            console.log(`[INFO] Email verifikasi dikirim ke: ${email}`);
        } catch (emailErr) {
            console.error('[ERROR] Gagal kirim email verifikasi:', emailErr.message);
            await logEmail(email, 'verification', 'failed');
        }

        res.json({
            message: emailSent
                ? 'Registrasi berhasil! Silakan cek email Anda untuk verifikasi.'
                : 'Registrasi berhasil! Email verifikasi gagal dikirim, gunakan fitur "Kirim Ulang Verifikasi".',
            userId:    result.insertId,
            emailSent: emailSent,
        });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'Email sudah terdaftar' });
        console.error('[ERROR] Register:', err.message);
        res.status(500).json({ message: 'Terjadi kesalahan saat registrasi' });
    }
});

/**
 * POST /api/auth/verify-email
 * Verifikasi email menggunakan kode 6 digit.
 * Body: { email, token }
 */
app.post('/api/auth/verify-email', async (req, res) => {
    const { email, token } = req.body;
    if (!email || !token)
        return res.status(400).json({ message: 'Email dan token harus diisi' });
    if (!pool) return res.status(503).json({ message: 'Database tidak tersedia' });

    try {
        const [rows] = await pool.query(
            'SELECT * FROM users WHERE email = ? AND verification_token = ?',
            [email, token]
        );

        if (rows.length === 0)
            return res.status(400).json({ message: 'Token verifikasi tidak valid atau email salah' });

        const user = rows[0];

        if (user.is_verified)
            return res.status(400).json({ message: 'Email sudah terverifikasi sebelumnya' });

        // Cek apakah token sudah kadaluarsa
        if (user.verification_token_expires && new Date() > new Date(user.verification_token_expires))
            return res.status(400).json({
                message: 'Token verifikasi sudah kadaluarsa. Silakan kirim ulang kode verifikasi.',
                expired: true,
            });

        // Update status verifikasi
        await pool.query(
            `UPDATE users
             SET is_verified = TRUE, email_verified_at = NOW(),
                 verification_token = NULL, verification_token_expires = NULL
             WHERE id = ?`,
            [user.id]
        );

        // Kirim notifikasi in-app selamat datang
        await createInAppNotification(user.id, 'Selamat Datang di MotoCare! 🎉', 'Email Anda telah berhasil diverifikasi. Mulai gunakan fitur lengkap MotoCare sekarang!', 'system');

        res.json({ message: 'Email berhasil diverifikasi! Silakan login.' });
    } catch (err) {
        console.error('[ERROR] Verify email:', err.message);
        res.status(500).json({ message: 'Terjadi kesalahan saat verifikasi email' });
    }
});

/**
 * GET /api/auth/verify-email?token=xxx&email=xxx
 * Verifikasi via link di email (untuk klik dari browser).
 * Redirect ke halaman sukses di frontend.
 */
app.get('/api/auth/verify-email', async (req, res) => {
    const { token, email } = req.query;
    if (!token || !email)
        return res.redirect(`${FRONTEND_URL}/verify-email?status=error&message=Token+tidak+valid`);
    if (!pool)
        return res.redirect(`${FRONTEND_URL}/verify-email?status=error&message=Database+tidak+tersedia`);

    try {
        const [rows] = await pool.query(
            'SELECT * FROM users WHERE email = ? AND verification_token = ?',
            [decodeURIComponent(email), token]
        );

        if (rows.length === 0)
            return res.redirect(`${FRONTEND_URL}/verify-email?status=error&message=Token+tidak+valid`);

        const user = rows[0];

        if (user.is_verified)
            return res.redirect(`${FRONTEND_URL}/verify-email?status=already-verified`);

        if (user.verification_token_expires && new Date() > new Date(user.verification_token_expires))
            return res.redirect(`${FRONTEND_URL}/verify-email?status=expired&email=${encodeURIComponent(email)}`);

        await pool.query(
            `UPDATE users
             SET is_verified = TRUE, email_verified_at = NOW(),
                 verification_token = NULL, verification_token_expires = NULL
             WHERE id = ?`,
            [user.id]
        );

        await createInAppNotification(user.id, 'Selamat Datang di MotoCare! 🎉', 'Email Anda telah berhasil diverifikasi.', 'system');

        return res.redirect(`${FRONTEND_URL}/verify-email?status=success`);
    } catch (err) {
        console.error('[ERROR] Verify email GET:', err.message);
        return res.redirect(`${FRONTEND_URL}/verify-email?status=error&message=Terjadi+kesalahan`);
    }
});

/**
 * POST /api/auth/resend-verification
 * Kirim ulang kode verifikasi email.
 * Body: { email }
 */
app.post('/api/auth/resend-verification', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email harus diisi' });
    if (!isValidEmail(email)) return res.status(400).json({ message: 'Format email tidak valid' });
    if (!pool) return res.status(503).json({ message: 'Database tidak tersedia' });

    try {
        const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);

        if (rows.length === 0)
            return res.status(404).json({ message: 'Email tidak terdaftar' });

        const user = rows[0];

        if (user.is_verified)
            return res.status(400).json({ message: 'Email sudah terverifikasi. Silakan login.' });

        // Generate token baru
        const verificationToken = generateVerificationToken();
        const tokenExpires      = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 jam

        await pool.query(
            'UPDATE users SET verification_token = ?, verification_token_expires = ? WHERE id = ?',
            [verificationToken, tokenExpires, user.id]
        );

        try {
            await sendVerificationEmail(email, verificationToken, user.name);
            await logEmail(email, 'verification', 'sent');
            res.json({ message: 'Kode verifikasi baru telah dikirim ke email Anda.' });
        } catch (emailErr) {
            console.error('[ERROR] Kirim ulang email:', emailErr.message);
            await logEmail(email, 'verification', 'failed');
            res.status(500).json({ message: 'Gagal mengirim email. Pastikan alamat email Anda benar.' });
        }
    } catch (err) {
        console.error('[ERROR] Resend verification:', err.message);
        res.status(500).json({ message: 'Terjadi kesalahan' });
    }
});

/**
 * POST /api/auth/forgot-password
 * Kirim email reset password.
 * Body: { email }
 */
app.post('/api/auth/forgot-password', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email harus diisi' });
    if (!isValidEmail(email)) return res.status(400).json({ message: 'Format email tidak valid' });
    if (!pool) return res.status(503).json({ message: 'Database tidak tersedia' });

    try {
        const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);

        // Selalu response sukses untuk keamanan (tidak bocorkan apakah email terdaftar)
        if (rows.length === 0) {
            return res.json({ message: 'Jika email Anda terdaftar, link reset password akan dikirim.' });
        }

        const user         = rows[0];
        const resetToken   = generateVerificationToken();
        const resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 jam

        await pool.query(
            'UPDATE users SET reset_password_token = ?, reset_password_expires = ? WHERE id = ?',
            [resetToken, resetExpires, user.id]
        );

        try {
            await sendResetPasswordEmail(email, resetToken, user.name);
            await logEmail(email, 'reset_password', 'sent');
            console.log(`[INFO] Email reset password dikirim ke: ${email}`);
        } catch (emailErr) {
            console.error('[ERROR] Kirim email reset password:', emailErr.message);
            await logEmail(email, 'reset_password', 'failed');
            return res.status(500).json({ message: 'Gagal mengirim email reset password. Coba lagi nanti.' });
        }

        res.json({ message: 'Jika email Anda terdaftar, link reset password akan dikirim.' });
    } catch (err) {
        console.error('[ERROR] Forgot password:', err.message);
        res.status(500).json({ message: 'Terjadi kesalahan' });
    }
});

/**
 * POST /api/auth/reset-password
 * Reset password menggunakan token dari email.
 * Body: { email, token, newPassword, confirmPassword }
 */
app.post('/api/auth/reset-password', async (req, res) => {
    const { email, token, newPassword, confirmPassword } = req.body;

    if (!email || !token || !newPassword || !confirmPassword)
        return res.status(400).json({ message: 'Semua field harus diisi' });
    if (newPassword !== confirmPassword)
        return res.status(400).json({ message: 'Konfirmasi password tidak cocok' });
    if (newPassword.length < 6)
        return res.status(400).json({ message: 'Password minimal 6 karakter' });
    if (!pool) return res.status(503).json({ message: 'Database tidak tersedia' });

    try {
        const [rows] = await pool.query(
            'SELECT * FROM users WHERE email = ? AND reset_password_token = ?',
            [email, token]
        );

        if (rows.length === 0)
            return res.status(400).json({ message: 'Token reset password tidak valid' });

        const user = rows[0];

        // Cek kadaluarsa token
        if (user.reset_password_expires && new Date() > new Date(user.reset_password_expires))
            return res.status(400).json({
                message: 'Token reset password sudah kadaluarsa. Silakan request ulang.',
                expired: true,
            });

        const hashed = await bcrypt.hash(newPassword, 10);

        await pool.query(
            'UPDATE users SET password = ?, reset_password_token = NULL, reset_password_expires = NULL WHERE id = ?',
            [hashed, user.id]
        );

        await createInAppNotification(user.id, 'Password Berhasil Direset', 'Password akun MotoCare Anda telah berhasil diubah. Jika ini bukan Anda, segera hubungi support.', 'security');

        res.json({ message: 'Password berhasil direset! Silakan login dengan password baru Anda.' });
    } catch (err) {
        console.error('[ERROR] Reset password:', err.message);
        res.status(500).json({ message: 'Terjadi kesalahan' });
    }
});

/**
 * GET /api/auth/verification-status
 * Cek status verifikasi email user yang sedang login.
 * Header: Authorization Bearer <token>
 */
app.get('/api/auth/verification-status', auth, async (req, res) => {
    if (!pool) return res.status(503).json({ message: 'Database tidak tersedia' });
    try {
        const [rows] = await pool.query(
            'SELECT email, is_verified, email_verified_at FROM users WHERE id = ?',
            [req.userId]
        );
        if (rows.length === 0) return res.status(404).json({ message: 'User tidak ditemukan' });
        res.json({
            isVerified:      rows[0].is_verified,
            email:           rows[0].email,
            emailVerifiedAt: rows[0].email_verified_at,
        });
    } catch (err) {
        console.error('[ERROR] Verification status:', err.message);
        res.status(500).json({ message: 'Terjadi kesalahan' });
    }
});

/**
 * POST /api/auth/login
 * Login user. Wajib email sudah diverifikasi.
 * Body: { email, password }
 */
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password)
        return res.status(400).json({ message: 'Email dan password harus diisi' });
    if (!pool) return res.status(503).json({ message: 'Database tidak tersedia' });

    try {
        const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
        if (rows.length === 0)
            return res.status(401).json({ message: 'Email atau password salah' });

        const isValid = await bcrypt.compare(password, rows[0].password);
        if (!isValid)
            return res.status(401).json({ message: 'Email atau password salah' });

        // ✅ Cek verifikasi email — user tidak bisa login sebelum verifikasi
        if (!rows[0].is_verified) {
            return res.status(401).json({
                message:         'Email belum diverifikasi. Silakan cek email Anda.',
                needVerification: true,
                email:           rows[0].email,
            });
        }

        // Cek apakah user adalah workshop admin
        let workshopInfo = null;
        const [wa] = await pool.query(
            'SELECT wa.*, w.name as workshop_name FROM workshop_admins wa LEFT JOIN workshops w ON wa.workshop_id = w.id WHERE wa.user_id = ?',
            [rows[0].id]
        );
        if (wa.length > 0) workshopInfo = wa[0];

        const token = jwt.sign(
            { id: rows[0].id, email: rows[0].email, role: rows[0].role },
            SECRET_KEY,
            { expiresIn: '7d' }
        );

        res.json({
            token,
            user: {
                id:         rows[0].id,
                name:       rows[0].name,
                email:      rows[0].email,
                role:       rows[0].role,
                isVerified: rows[0].is_verified,
            },
            workshopAdmin: workshopInfo,
        });
    } catch (err) {
        console.error('[ERROR] Login:', err.message);
        res.status(500).json({ message: 'Terjadi kesalahan' });
    }
});

// ── Motorcycles ───────────────────────────────────────────────────
app.get('/api/motorcycles', auth, async (req, res) => {
    if (!pool) return res.status(503).json({ message: 'Database tidak tersedia' });
    try {
        const [rows] = await pool.query('SELECT * FROM motorcycles WHERE user_id = ? ORDER BY created_at DESC', [req.userId]);
        res.json({ data: rows });
    } catch (err) { console.error('[ERROR] Get motorcycles:', err.message); res.status(500).json({ message: 'Gagal mengambil data' }); }
});

app.post('/api/motorcycles', auth, async (req, res) => {
    const { brand, type, year, category, last_service, current_km } = req.body;
    if (!brand || !type || !year) return res.status(400).json({ message: 'Brand, type, dan tahun harus diisi' });
    if (!pool) return res.status(503).json({ message: 'Database tidak tersedia' });
    try {
        let next_service = null;
        if (last_service) { const d = new Date(last_service); d.setMonth(d.getMonth() + 3); next_service = d.toISOString().split('T')[0]; }
        const [result] = await pool.query(
            'INSERT INTO motorcycles (user_id,brand,type,year,category,last_service,next_service,current_km) VALUES (?,?,?,?,?,?,?,?)',
            [req.userId, brand, type, year, category || 'Matic', last_service || null, next_service, current_km || 0]
        );
        res.json({ data: { id: result.insertId, brand, type, year } });
    } catch (err) { console.error('[ERROR] Add motorcycle:', err.message); res.status(500).json({ message: 'Gagal menambah motor' }); }
});

// ── Workshops ─────────────────────────────────────────────────────
app.get('/api/workshops', async (req, res) => {
    if (!pool) return res.json({ data: GENERATED_WORKSHOPS, total: GENERATED_WORKSHOPS.length, source: 'memory' });
    try {
        const [workshops] = await pool.query('SELECT * FROM workshops ORDER BY rating DESC');
        if (workshops.length === 0) return res.json({ data: GENERATED_WORKSHOPS, total: GENERATED_WORKSHOPS.length, source: 'memory-fallback' });

        const [allServices] = await pool.query('SELECT * FROM workshop_services');
        const [allParts]    = await pool.query('SELECT * FROM workshop_parts');
        const servicesMap   = {}, partsMap = {};
        for (const s of allServices) { if (!servicesMap[s.workshop_id]) servicesMap[s.workshop_id] = []; servicesMap[s.workshop_id].push({ name: s.name, price: s.price }); }
        for (const p of allParts)    { if (!partsMap[p.workshop_id])    partsMap[p.workshop_id]    = []; partsMap[p.workshop_id].push({ name: p.name, price: p.price }); }
        for (const w of workshops)   { w.services = servicesMap[w.id] || []; w.parts = partsMap[w.id] || []; }

        res.json({ data: workshops, total: workshops.length, source: 'database' });
    } catch (err) {
        console.error('[ERROR] Get workshops:', err.message);
        res.json({ data: GENERATED_WORKSHOPS, total: GENERATED_WORKSHOPS.length, source: 'memory-fallback' });
    }
});

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
        const workshop   = rows[0];
        const [services] = await pool.query('SELECT name,price FROM workshop_services WHERE workshop_id = ?', [wid]);
        const [parts]    = await pool.query('SELECT name,price FROM workshop_parts WHERE workshop_id = ?', [wid]);
        workshop.services = services; workshop.parts = parts;
        res.json({ data: workshop });
    } catch (err) { console.error('[ERROR] Get workshop by id:', err.message); res.status(500).json({ message: 'Terjadi kesalahan' }); }
});

// ── Estimate ──────────────────────────────────────────────────────
app.post('/api/estimates', auth, (req, res) => {
    const { serviceType, parts } = req.body;
    const servicePrices = { ringan: 50000, berkala: 80000, besar: 150000, ganti_oli: 45000, tune_up: 85000 };
    const partPrices    = { oli: 52000, busi: 25000, filter: 35000, vbelt: 185000 };
    const serviceCost   = servicePrices[serviceType] || 80000;
    let partsCost = 0;
    if (Array.isArray(parts)) parts.forEach(p => { partsCost += partPrices[p] || 0; });
    res.json({ data: { serviceCost, partsCost, totalCost: serviceCost + partsCost } });
});

// ── Service History ───────────────────────────────────────────────
app.get('/api/service-history', auth, async (req, res) => {
    if (!pool) return res.json({ data: [] });
    try {
        const [rows] = await pool.query('SELECT * FROM service_history WHERE user_id = ? ORDER BY created_at DESC', [req.userId]);
        res.json({ data: rows });
    } catch { res.json({ data: [] }); }
});

// ── Notifications ─────────────────────────────────────────────────
app.get('/api/notifications', auth, async (req, res) => {
    if (!pool) return res.json({ data: [], unreadCount: 0 });
    try {
        const [rows] = await pool.query('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC', [req.userId]);
        res.json({ data: rows, unreadCount: rows.filter(n => !n.is_read).length });
    } catch { res.json({ data: [], unreadCount: 0 }); }
});

app.put('/api/notifications/:id/read', auth, async (req, res) => {
    if (!pool) return res.status(503).json({ message: 'Database tidak tersedia' });
    try {
        await pool.query('UPDATE notifications SET is_read = TRUE WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
        res.json({ message: 'Notifikasi ditandai sudah dibaca' });
    } catch { res.status(500).json({ message: 'Terjadi kesalahan' }); }
});

// ── Analytics (user) ──────────────────────────────────────────────
app.get('/api/analytics', auth, async (req, res) => {
    const empty = { totalMotor: 0, totalService: 0, totalSpent: 0, upcomingServices: [], savedMoney: 0 };
    if (!pool) return res.json(empty);
    try {
        const [motorCount]   = await pool.query('SELECT COUNT(*) as total FROM motorcycles WHERE user_id = ?', [req.userId]);
        const [serviceCount] = await pool.query('SELECT COUNT(*) as total, COALESCE(SUM(price),0) as totalSpent FROM service_history WHERE user_id = ?', [req.userId]);
        const today          = new Date().toISOString().split('T')[0];
        const [upcoming]     = await pool.query(
            'SELECT * FROM motorcycles WHERE user_id = ? AND next_service IS NOT NULL AND next_service >= ? ORDER BY next_service ASC',
            [req.userId, today]
        );
        const totalSpent = Number(serviceCount[0]?.totalSpent || 0);
        res.json({ totalMotor: motorCount[0]?.total || 0, totalService: serviceCount[0]?.total || 0, totalSpent, upcomingServices: upcoming, savedMoney: Math.floor(totalSpent * 0.1) });
    } catch (err) { console.error('[ERROR] Analytics:', err.message); res.json(empty); }
});

// ============================================================
//  WORKSHOP ONBOARDING ENDPOINTS
// ============================================================

/**
 * POST /api/workshop/register
 * Pemilik bengkel mendaftar.
 * Setelah registrasi, email verifikasi dikirim ke pemilik bengkel.
 * Admin platform juga mendapat notifikasi (jika ADMIN_EMAIL di-set).
 */
app.post('/api/workshop/register', async (req, res) => {
    if (!pool) return res.status(503).json({ message: 'Database tidak tersedia' });
    const {
        email, password, full_name, phone,
        workshop_name, workshop_address, workshop_phone,
        workshop_wa, workshop_lat, workshop_lng, workshop_brand
    } = req.body;

    if (!email || !password || !full_name || !phone || !workshop_name)
        return res.status(400).json({ message: 'Semua field wajib harus diisi' });
    if (!isValidEmail(email))
        return res.status(400).json({ message: 'Format email tidak valid' });
    if (password.length < 6)
        return res.status(400).json({ message: 'Password minimal 6 karakter' });

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        // Generate token verifikasi email
        const verificationToken = generateVerificationToken();
        const tokenExpires      = new Date(Date.now() + 24 * 60 * 60 * 1000);

        // 1. Buat akun user baru (role: user), belum verified
        const hashed = await bcrypt.hash(password, 10);
        const [userResult] = await conn.query(
            `INSERT INTO users (name,email,password,role,is_verified,verification_token,verification_token_expires)
             VALUES (?,?,?,'user',FALSE,?,?)`,
            [full_name, email, hashed, verificationToken, tokenExpires]
        );
        const userId = userResult.insertId;

        // 2. Buat workshop_admins record (belum verified)
        const [waResult] = await conn.query(
            'INSERT INTO workshop_admins (user_id,full_name,phone,role,is_verified) VALUES (?,?,?,?,FALSE)',
            [userId, full_name, phone, 'owner']
        );
        const adminId = waResult.insertId;

        // 3. Simpan data bengkel ke workshop_pending
        await conn.query(
            `INSERT INTO workshop_pending
             (workshop_admin_id,workshop_name,workshop_address,workshop_phone,workshop_wa,workshop_lat,workshop_lng,workshop_brand)
             VALUES (?,?,?,?,?,?,?,?)`,
            [adminId, workshop_name, workshop_address || null, workshop_phone || null, workshop_wa || null,
             workshop_lat || null, workshop_lng || null, workshop_brand || 'Umum']
        );

        await conn.commit();

        // Kirim email verifikasi ke pemilik bengkel
        let emailSent = false;
        try {
            await sendVerificationEmail(email, verificationToken, full_name);
            await logEmail(email, 'verification', 'sent');
            emailSent = true;
            console.log(`[INFO] Email verifikasi bengkel dikirim ke: ${email}`);
        } catch (emailErr) {
            console.error('[ERROR] Kirim email verifikasi bengkel:', emailErr.message);
            await logEmail(email, 'verification', 'failed');
        }

        // Notifikasi ke admin platform (opsional)
        try {
            const adminEmail = process.env.ADMIN_EMAIL;
            if (adminEmail) {
                await sendWorkshopRegistrationNotif(adminEmail, { workshop_name, full_name, email, phone, workshop_address });
            }
        } catch { /* abaikan jika notif admin gagal */ }

        res.json({
            message: emailSent
                ? 'Pendaftaran berhasil! Cek email Anda untuk verifikasi. Bengkel Anda akan diproses dalam 1-3 hari kerja.'
                : 'Pendaftaran berhasil! Email verifikasi gagal dikirim, gunakan fitur "Kirim Ulang Verifikasi".',
            emailSent,
        });
    } catch (err) {
        await conn.rollback();
        if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'Email sudah terdaftar' });
        console.error('[ERROR] Workshop register:', err.message);
        res.status(500).json({ message: 'Terjadi kesalahan' });
    } finally { conn.release(); }
});

// GET /api/workshop/my-workshop
app.get('/api/workshop/my-workshop', workshopAuth, async (req, res) => {
    if (!pool) return res.status(503).json({ message: 'Database tidak tersedia' });
    if (!req.isWorkshopAdmin) return res.status(403).json({ message: 'Akun Anda belum terdaftar sebagai pemilik bengkel' });
    try {
        const [rows] = await pool.query('SELECT * FROM workshops WHERE id = ?', [req.workshopId]);
        if (rows.length === 0) return res.status(404).json({ message: 'Bengkel tidak ditemukan' });
        const workshop   = rows[0];
        const [services] = await pool.query('SELECT name,price FROM workshop_services WHERE workshop_id = ?', [req.workshopId]);
        const [parts]    = await pool.query('SELECT name,price FROM workshop_parts WHERE workshop_id = ?', [req.workshopId]);
        workshop.services = services; workshop.parts = parts;
        res.json({ data: workshop });
    } catch (err) { console.error('[ERROR] my-workshop:', err.message); res.status(500).json({ message: 'Terjadi kesalahan' }); }
});

// PUT /api/workshop/my-workshop
app.put('/api/workshop/my-workshop', workshopAuth, async (req, res) => {
    if (!pool) return res.status(503).json({ message: 'Database tidak tersedia' });
    if (!req.isWorkshopAdmin) return res.status(403).json({ message: 'Akses ditolak' });
    const { name, address, phone, wa, hours, status } = req.body;
    try {
        await pool.query(
            'UPDATE workshops SET name=COALESCE(?,name), address=COALESCE(?,address), phone=COALESCE(?,phone), wa=COALESCE(?,wa), hours=COALESCE(?,hours), status=COALESCE(?,status), last_active=NOW() WHERE id=?',
            [name||null, address||null, phone||null, wa||null, hours||null, status||null, req.workshopId]
        );
        res.json({ message: 'Data bengkel berhasil diperbarui' });
    } catch (err) { console.error('[ERROR] update my-workshop:', err.message); res.status(500).json({ message: 'Terjadi kesalahan' }); }
});

// GET /api/workshop/dashboard
app.get('/api/workshop/dashboard', workshopAuth, async (req, res) => {
    if (!pool) return res.status(503).json({ message: 'Database tidak tersedia' });
    if (!req.isWorkshopAdmin) return res.status(403).json({ message: 'Akses ditolak' });
    try {
        const [totalChats]      = await pool.query('SELECT COUNT(*) as total FROM chat_rooms WHERE workshop_id = ?', [req.workshopId]);
        const [unreadMsgs]      = await pool.query(
            `SELECT COUNT(*) as total FROM messages m
             JOIN chat_rooms cr ON m.room_id = cr.id
             WHERE cr.workshop_id = ? AND m.sender_type = 'user' AND m.is_read = FALSE`,
            [req.workshopId]
        );
        const [activeChats]     = await pool.query(
            'SELECT COUNT(*) as total FROM chat_rooms WHERE workshop_id = ? AND updated_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)',
            [req.workshopId]
        );
        const [recentCustomers] = await pool.query(
            `SELECT u.id, u.name, u.email, cr.updated_at as last_chat
             FROM chat_rooms cr JOIN users u ON cr.user_id = u.id
             WHERE cr.workshop_id = ?
             ORDER BY cr.updated_at DESC LIMIT 10`,
            [req.workshopId]
        );
        const [ws] = await pool.query('SELECT rating FROM workshops WHERE id = ?', [req.workshopId]);
        res.json({
            totalChats:      totalChats[0].total,
            unreadMessages:  unreadMsgs[0].total,
            activeChats:     activeChats[0].total,
            recentCustomers: recentCustomers,
            rating:          ws[0]?.rating || 0,
        });
    } catch (err) { console.error('[ERROR] dashboard:', err.message); res.status(500).json({ message: 'Terjadi kesalahan' }); }
});

// GET /api/workshop/analytics
app.get('/api/workshop/analytics', workshopAuth, async (req, res) => {
    if (!pool) return res.status(503).json({ message: 'Database tidak tersedia' });
    if (!req.isWorkshopAdmin) return res.status(403).json({ message: 'Akses ditolak' });
    try {
        const [totalChats]      = await pool.query('SELECT COUNT(*) as total FROM chat_rooms WHERE workshop_id = ?', [req.workshopId]);
        const [unreadMessages]  = await pool.query(
            `SELECT COUNT(*) as total FROM messages m JOIN chat_rooms cr ON m.room_id = cr.id
             WHERE cr.workshop_id = ? AND m.sender_type = 'user' AND m.is_read = FALSE`,
            [req.workshopId]
        );
        const [activeChats]     = await pool.query(
            'SELECT COUNT(*) as total FROM chat_rooms WHERE workshop_id = ? AND updated_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)',
            [req.workshopId]
        );
        const [recentCustomers] = await pool.query(
            `SELECT u.id, u.name, cr.updated_at as last_chat FROM chat_rooms cr JOIN users u ON cr.user_id = u.id
             WHERE cr.workshop_id = ? ORDER BY cr.updated_at DESC LIMIT 5`,
            [req.workshopId]
        );
        const [ws] = await pool.query('SELECT rating FROM workshops WHERE id = ?', [req.workshopId]);
        res.json({ totalChats: totalChats[0].total, unreadMessages: unreadMessages[0].total, activeChats: activeChats[0].total, recentCustomers, rating: ws[0]?.rating || 0 });
    } catch (err) { console.error('[ERROR] analytics:', err.message); res.status(500).json({ message: 'Terjadi kesalahan' }); }
});

// ============================================================
//  ADMIN ENDPOINTS
// ============================================================

app.get('/api/admin/workshop/pending', auth, adminOnly, async (req, res) => {
    if (!pool) return res.status(503).json({ message: 'Database tidak tersedia' });
    try {
        const [rows] = await pool.query(
            `SELECT wp.*, wa.full_name, wa.phone as admin_phone, u.email
             FROM workshop_pending wp
             JOIN workshop_admins wa ON wp.workshop_admin_id = wa.id
             JOIN users u ON wa.user_id = u.id
             WHERE wp.status = 'pending'
             ORDER BY wp.submitted_at DESC`
        );
        res.json({ data: rows, total: rows.length });
    } catch (err) { console.error('[ERROR] pending workshops:', err.message); res.status(500).json({ message: 'Terjadi kesalahan' }); }
});

app.get('/api/admin/workshop/all', auth, adminOnly, async (req, res) => {
    if (!pool) return res.status(503).json({ message: 'Database tidak tersedia' });
    try {
        const [rows] = await pool.query(
            `SELECT wp.*, wa.full_name, wa.phone as admin_phone, u.email
             FROM workshop_pending wp
             JOIN workshop_admins wa ON wp.workshop_admin_id = wa.id
             JOIN users u ON wa.user_id = u.id
             ORDER BY wp.submitted_at DESC`
        );
        res.json({ data: rows, total: rows.length });
    } catch (err) { console.error('[ERROR] all workshop apps:', err.message); res.status(500).json({ message: 'Terjadi kesalahan' }); }
});

app.put('/api/admin/workshop/verify/:id', auth, adminOnly, async (req, res) => {
    if (!pool) return res.status(503).json({ message: 'Database tidak tersedia' });
    const pendingId = parseInt(req.params.id);
    const { action, reject_reason } = req.body;

    if (!['approve','reject'].includes(action))
        return res.status(400).json({ message: 'Action harus "approve" atau "reject"' });

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const [pending] = await conn.query(
            'SELECT wp.*, wa.user_id, wa.id as admin_id FROM workshop_pending wp JOIN workshop_admins wa ON wp.workshop_admin_id = wa.id WHERE wp.id = ?',
            [pendingId]
        );
        if (pending.length === 0) { await conn.rollback(); return res.status(404).json({ message: 'Pendaftaran tidak ditemukan' }); }

        const p = pending[0];

        if (action === 'approve') {
            const [maxId] = await conn.query('SELECT MAX(id) as maxId FROM workshops');
            const newWorkshopId = (maxId[0].maxId || TOTAL_WORKSHOPS) + 1;

            await conn.query(
                `INSERT INTO workshops (id,name,brand,address,phone,wa,distance,rating,reviews,status,hours,verified,lat,lng,owner_id,is_active)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?,TRUE,?,?,?,TRUE)`,
                [newWorkshopId, p.workshop_name, p.workshop_brand || 'Umum', p.workshop_address, p.workshop_phone, p.workshop_wa, '0 km', 0.0, 0, 'open', '08:00-17:00', p.workshop_lat || 0, p.workshop_lng || 0, p.user_id]
            );

            await conn.query(
                'UPDATE workshop_admins SET workshop_id = ?, is_verified = TRUE, verified_at = NOW() WHERE id = ?',
                [newWorkshopId, p.admin_id]
            );

            await conn.query(
                'UPDATE workshop_pending SET status = "approved", reviewed_at = NOW() WHERE id = ?',
                [pendingId]
            );

            await conn.query(
                'INSERT INTO notifications (user_id,title,message,type) VALUES (?,?,?,?)',
                [p.user_id, 'Bengkel Diverifikasi!', `Selamat! Bengkel "${p.workshop_name}" Anda telah diverifikasi dan kini aktif di MotoCare.`, 'system']
            );

            await conn.commit();
            res.json({ message: `Bengkel "${p.workshop_name}" berhasil diverifikasi`, workshopId: newWorkshopId });
        } else {
            await conn.query(
                'UPDATE workshop_pending SET status = "rejected", reject_reason = ?, reviewed_at = NOW() WHERE id = ?',
                [reject_reason || 'Tidak memenuhi persyaratan', pendingId]
            );
            await conn.query(
                'INSERT INTO notifications (user_id,title,message,type) VALUES (?,?,?,?)',
                [p.user_id, 'Pendaftaran Bengkel Ditolak', `Maaf, pendaftaran bengkel "${p.workshop_name}" ditolak. Alasan: ${reject_reason || 'Tidak memenuhi persyaratan'}. Silakan hubungi support.`, 'system']
            );
            await conn.commit();
            res.json({ message: `Pendaftaran bengkel "${p.workshop_name}" ditolak` });
        }
    } catch (err) {
        await conn.rollback();
        console.error('[ERROR] verify workshop:', err.message);
        res.status(500).json({ message: 'Terjadi kesalahan' });
    } finally { conn.release(); }
});

// ============================================================
//  CHAT REST ENDPOINTS
// ============================================================

app.post('/api/chat/rooms', auth, async (req, res) => {
    if (!pool) return res.status(503).json({ message: 'Database tidak tersedia' });
    const { workshop_id } = req.body;
    if (!workshop_id) return res.status(400).json({ message: 'workshop_id harus diisi' });

    try {
        const [ws] = await pool.query('SELECT id,name,verified,is_active FROM workshops WHERE id = ?', [workshop_id]);
        if (ws.length === 0) return res.status(404).json({ message: 'Bengkel tidak ditemukan' });
        if (!ws[0].verified || ws[0].is_active === false)
            return res.status(400).json({ message: 'Bengkel ini belum terverifikasi atau tidak aktif' });

        const [existing] = await pool.query(
            'SELECT * FROM chat_rooms WHERE user_id = ? AND workshop_id = ?',
            [req.userId, workshop_id]
        );
        if (existing.length > 0) return res.json({ data: existing[0], created: false });

        const [result] = await pool.query(
            'INSERT INTO chat_rooms (user_id,workshop_id) VALUES (?,?)',
            [req.userId, workshop_id]
        );
        const [newRoom] = await pool.query('SELECT * FROM chat_rooms WHERE id = ?', [result.insertId]);
        res.status(201).json({ data: newRoom[0], created: true });
    } catch (err) { console.error('[ERROR] create room:', err.message); res.status(500).json({ message: 'Terjadi kesalahan' }); }
});

app.get('/api/chat/rooms', workshopAuth, async (req, res) => {
    if (!pool) return res.status(503).json({ message: 'Database tidak tersedia' });
    try {
        let rows;
        if (req.isWorkshopAdmin) {
            [rows] = await pool.query(
                `SELECT cr.*, u.name as user_name, u.email as user_email,
                        w.name as workshop_name,
                        (SELECT COUNT(*) FROM messages m WHERE m.room_id = cr.id AND m.sender_type = 'user' AND m.is_read = FALSE) as unread_count,
                        (SELECT m2.message FROM messages m2 WHERE m2.room_id = cr.id ORDER BY m2.created_at DESC LIMIT 1) as last_message,
                        (SELECT m2.created_at FROM messages m2 WHERE m2.room_id = cr.id ORDER BY m2.created_at DESC LIMIT 1) as last_message_at
                 FROM chat_rooms cr
                 JOIN users u ON cr.user_id = u.id
                 JOIN workshops w ON cr.workshop_id = w.id
                 WHERE cr.workshop_id = ?
                 ORDER BY cr.updated_at DESC`,
                [req.workshopId]
            );
        } else {
            [rows] = await pool.query(
                `SELECT cr.*, w.name as workshop_name, w.brand as workshop_brand, w.rating as workshop_rating,
                        (SELECT COUNT(*) FROM messages m WHERE m.room_id = cr.id AND m.sender_type = 'workshop' AND m.is_read = FALSE) as unread_count,
                        (SELECT m2.message FROM messages m2 WHERE m2.room_id = cr.id ORDER BY m2.created_at DESC LIMIT 1) as last_message,
                        (SELECT m2.created_at FROM messages m2 WHERE m2.room_id = cr.id ORDER BY m2.created_at DESC LIMIT 1) as last_message_at
                 FROM chat_rooms cr
                 JOIN workshops w ON cr.workshop_id = w.id
                 WHERE cr.user_id = ?
                 ORDER BY cr.updated_at DESC`,
                [req.userId]
            );
        }
        res.json({ data: rows });
    } catch (err) { console.error('[ERROR] get rooms:', err.message); res.status(500).json({ message: 'Terjadi kesalahan' }); }
});

app.get('/api/chat/rooms/:roomId/messages', workshopAuth, async (req, res) => {
    if (!pool) return res.status(503).json({ message: 'Database tidak tersedia' });
    const roomId = parseInt(req.params.roomId);
    const limit  = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    try {
        const [room] = await pool.query('SELECT * FROM chat_rooms WHERE id = ?', [roomId]);
        if (room.length === 0) return res.status(404).json({ message: 'Room tidak ditemukan' });
        const r = room[0];
        const hasAccess = r.user_id === req.userId || (req.isWorkshopAdmin && req.workshopId === r.workshop_id) || req.userRole === 'admin';
        if (!hasAccess) return res.status(403).json({ message: 'Akses ditolak' });

        const [messages] = await pool.query(
            'SELECT * FROM messages WHERE room_id = ? ORDER BY created_at ASC LIMIT ? OFFSET ?',
            [roomId, limit, offset]
        );
        const [total] = await pool.query('SELECT COUNT(*) as total FROM messages WHERE room_id = ?', [roomId]);

        const myType    = req.isWorkshopAdmin ? 'workshop' : 'user';
        const otherType = myType === 'user' ? 'workshop' : 'user';
        await pool.query(
            'UPDATE messages SET is_read = TRUE, read_at = NOW() WHERE room_id = ? AND sender_type = ? AND is_read = FALSE',
            [roomId, otherType]
        );

        res.json({ data: messages, total: total[0].total, hasMore: offset + limit < total[0].total });
    } catch (err) { console.error('[ERROR] get messages:', err.message); res.status(500).json({ message: 'Terjadi kesalahan' }); }
});

app.delete('/api/chat/rooms/:roomId', auth, async (req, res) => {
    if (!pool) return res.status(503).json({ message: 'Database tidak tersedia' });
    const roomId = parseInt(req.params.roomId);
    try {
        const [room] = await pool.query('SELECT * FROM chat_rooms WHERE id = ?', [roomId]);
        if (room.length === 0) return res.status(404).json({ message: 'Room tidak ditemukan' });
        if (room[0].user_id !== req.userId && req.userRole !== 'admin')
            return res.status(403).json({ message: 'Akses ditolak' });
        await pool.query('DELETE FROM chat_rooms WHERE id = ?', [roomId]);
        res.json({ message: 'Room dihapus' });
    } catch (err) { console.error('[ERROR] delete room:', err.message); res.status(500).json({ message: 'Terjadi kesalahan' }); }
});

app.get('/api/chat/unread-count', workshopAuth, async (req, res) => {
    if (!pool) return res.status(503).json({ message: 'Database tidak tersedia' });
    try {
        let count;
        if (req.isWorkshopAdmin) {
            const [r] = await pool.query(
                `SELECT COUNT(*) as total FROM messages m JOIN chat_rooms cr ON m.room_id = cr.id
                 WHERE cr.workshop_id = ? AND m.sender_type = 'user' AND m.is_read = FALSE`,
                [req.workshopId]
            );
            count = r[0].total;
        } else {
            const [r] = await pool.query(
                `SELECT COUNT(*) as total FROM messages m JOIN chat_rooms cr ON m.room_id = cr.id
                 WHERE cr.user_id = ? AND m.sender_type = 'workshop' AND m.is_read = FALSE`,
                [req.userId]
            );
            count = r[0].total;
        }
        res.json({ unreadCount: count });
    } catch (err) { console.error('[ERROR] unread-count:', err.message); res.status(500).json({ message: 'Terjadi kesalahan' }); }
});

// ==================== START SERVER ====================
const PORT = process.env.PORT || 3000;

// Server listen DULU agar platform tidak timeout, lalu init DB di background
server.listen(PORT, '0.0.0.0', () => {
    console.log(`[START] MotoCare API v4.0 berjalan di port ${PORT}`);
    console.log('[INFO] Socket.io aktif untuk chat realtime');
    console.log('[INFO] Fitur email verifikasi: AKTIF');
    // Jalankan initDatabase di background, tidak blokir server
    initDatabase().catch(err => console.error('[ERROR] initDatabase gagal:', err.message));
});
