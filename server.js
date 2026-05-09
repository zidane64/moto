const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();
app.use(cors());
app.use(express.json());

// ==================== KONFIGURASI DATABASE ====================
const dbConfig = {
    host: process.env.MYSQLHOST,
    port: process.env.MYSQLPORT,
    user: process.env.MYSQLUSER,
    password: process.env.MYSQLPASSWORD,
    database: process.env.MYSQLDATABASE,
    ssl: false,
    waitForConnections: true,
    connectionLimit: 10,
    connectTimeout: 30000
};

let pool = null;
let isDatabaseConnected = false;
const SECRET_KEY = 'motocare_super_secret_key_2025';

// ==================== DATA MOTOR (70+ MODELS) ====================
const FALLBACK_MOTOR_MASTER = [
    // HONDA (20 models)
    { brand: 'Honda', type: 'Beat', category: 'Matic' },
    { brand: 'Honda', type: 'Beat Street', category: 'Matic' },
    { brand: 'Honda', type: 'Vario 125', category: 'Matic' },
    { brand: 'Honda', type: 'Vario 160', category: 'Matic' },
    { brand: 'Honda', type: 'PCX 160', category: 'Matic' },
    { brand: 'Honda', type: 'ADV 160', category: 'Adventure' },
    { brand: 'Honda', type: 'ADV 350', category: 'Adventure' },
    { brand: 'Honda', type: 'Scoopy', category: 'Matic' },
    { brand: 'Honda', type: 'Genio', category: 'Matic' },
    { brand: 'Honda', type: 'Supra X 125', category: 'Moped' },
    { brand: 'Honda', type: 'Revo', category: 'Moped' },
    { brand: 'Honda', type: 'CB150R', category: 'Sport' },
    { brand: 'Honda', type: 'CB250R', category: 'Sport' },
    { brand: 'Honda', type: 'CBR150R', category: 'Sport' },
    { brand: 'Honda', type: 'CBR250RR', category: 'Sport' },
    { brand: 'Honda', type: 'CBR650R', category: 'Sport' },
    { brand: 'Honda', type: 'CRF150L', category: 'Adventure' },
    { brand: 'Honda', type: 'CRF250L', category: 'Adventure' },
    { brand: 'Honda', type: 'CB190X', category: 'Adventure' },
    { brand: 'Honda', type: 'CT125', category: 'Adventure' },
    // YAMAHA (20 models)
    { brand: 'Yamaha', type: 'Mio M3', category: 'Matic' },
    { brand: 'Yamaha', type: 'Mio GT', category: 'Matic' },
    { brand: 'Yamaha', type: 'Mio S', category: 'Matic' },
    { brand: 'Yamaha', type: 'Fazzio', category: 'Matic' },
    { brand: 'Yamaha', type: 'FreeGo', category: 'Matic' },
    { brand: 'Yamaha', type: 'Lexi', category: 'Matic' },
    { brand: 'Yamaha', type: 'NMAX', category: 'Matic' },
    { brand: 'Yamaha', type: 'Aerox 155', category: 'Matic' },
    { brand: 'Yamaha', type: 'XMAX 250', category: 'Matic' },
    { brand: 'Yamaha', type: 'XMAX 300', category: 'Matic' },
    { brand: 'Yamaha', type: 'XSR 155', category: 'Naked' },
    { brand: 'Yamaha', type: 'XSR 700', category: 'Naked' },
    { brand: 'Yamaha', type: 'MT-15', category: 'Naked' },
    { brand: 'Yamaha', type: 'MT-25', category: 'Naked' },
    { brand: 'Yamaha', type: 'MT-07', category: 'Naked' },
    { brand: 'Yamaha', type: 'YZF R15', category: 'Sport' },
    { brand: 'Yamaha', type: 'YZF R25', category: 'Sport' },
    { brand: 'Yamaha', type: 'YZF R7', category: 'Sport' },
    { brand: 'Yamaha', type: 'PG-1', category: 'Adventure' },
    { brand: 'Yamaha', type: 'WR155R', category: 'Adventure' },
    // SUZUKI (12 models)
    { brand: 'Suzuki', type: 'Address 115', category: 'Matic' },
    { brand: 'Suzuki', type: 'Nex 2.0', category: 'Matic' },
    { brand: 'Suzuki', type: 'S-Presso', category: 'Matic' },
    { brand: 'Suzuki', type: 'Avenis 125', category: 'Matic' },
    { brand: 'Suzuki', type: 'Burgman Street', category: 'Matic' },
    { brand: 'Suzuki', type: 'Satria F150', category: 'Sport' },
    { brand: 'Suzuki', type: 'Satria FU150', category: 'Sport' },
    { brand: 'Suzuki', type: 'GSX R150', category: 'Sport' },
    { brand: 'Suzuki', type: 'GSX R250', category: 'Sport' },
    { brand: 'Suzuki', type: 'GSX S150', category: 'Naked' },
    { brand: 'Suzuki', type: 'GSX S250', category: 'Naked' },
    { brand: 'Suzuki', type: 'V-Strom 250', category: 'Adventure' },
    // KAWASAKI (10 models)
    { brand: 'Kawasaki', type: 'Ninja 250', category: 'Sport' },
    { brand: 'Kawasaki', type: 'Ninja 400', category: 'Sport' },
    { brand: 'Kawasaki', type: 'Ninja 650', category: 'Sport' },
    { brand: 'Kawasaki', type: 'Ninja ZX-25R', category: 'Sport' },
    { brand: 'Kawasaki', type: 'Ninja ZX-4RR', category: 'Sport' },
    { brand: 'Kawasaki', type: 'Z250', category: 'Naked' },
    { brand: 'Kawasaki', type: 'Z400', category: 'Naked' },
    { brand: 'Kawasaki', type: 'Z650', category: 'Naked' },
    { brand: 'Kawasaki', type: 'W175', category: 'Classic' },
    { brand: 'Kawasaki', type: 'Versys 250', category: 'Adventure' },
    // KTM (6 models)
    { brand: 'KTM', type: 'Duke 200', category: 'Naked' },
    { brand: 'KTM', type: 'Duke 250', category: 'Naked' },
    { brand: 'KTM', type: 'Duke 390', category: 'Naked' },
    { brand: 'KTM', type: 'RC 200', category: 'Sport' },
    { brand: 'KTM', type: 'RC 390', category: 'Sport' },
    { brand: 'KTM', type: 'Adventure 250', category: 'Adventure' },
    // VESPA (6 models)
    { brand: 'Vespa', type: 'LX 125', category: 'Matic' },
    { brand: 'Vespa', type: 'Sprint 150', category: 'Matic' },
    { brand: 'Vespa', type: 'Primavera 150', category: 'Matic' },
    { brand: 'Vespa', type: 'GTS 300', category: 'Matic' },
    { brand: 'Vespa', type: '946', category: 'Matic' },
    { brand: 'Vespa', type: 'Elettrica', category: 'Electric' },
    // TVS (4 models)
    { brand: 'TVS', type: 'Rocker 125', category: 'Matic' },
    { brand: 'TVS', type: 'Ntorq 125', category: 'Matic' },
    { brand: 'TVS', type: 'Zeppelin', category: 'Matic' },
    { brand: 'TVS', type: 'Apache RTR 160', category: 'Sport' },
    // BENELLI (5 models)
    { brand: 'Benelli', type: 'Leoncino 250', category: 'Classic' },
    { brand: 'Benelli', type: 'Leoncino 500', category: 'Classic' },
    { brand: 'Benelli', type: 'Motobi 200', category: 'Classic' },
    { brand: 'Benelli', type: 'TNT 250', category: 'Naked' },
    { brand: 'Benelli', type: 'TNT 600i', category: 'Naked' },
    // ROYAL ENFIELD (3 models)
    { brand: 'Royal Enfield', type: 'Classic 350', category: 'Classic' },
    { brand: 'Royal Enfield', type: 'Meteor 350', category: 'Classic' },
    { brand: 'Royal Enfield', type: 'Himalayan 450', category: 'Adventure' }
];

// ==================== DATA BENGKEL (30+ BENGKEL) ====================
const FALLBACK_WORKSHOPS = [
    // AHASS Honda (6)
    { id: 1, name: 'AHASS Tangerang Utama', brand: 'Honda', address: 'Jl. Daan Mogot No. 88, Tangerang', phone: '+62-21-55701234', wa: '6281234567890', distance: '1.2 km', rating: 4.9, reviews: 456, status: 'open', hours: '08:00 - 17:00', verified: true, services: [{ name: 'Servis Berkala', price: 75000 }, { name: 'Servis Besar', price: 150000 }, { name: 'Ganti Oli', price: 45000 }], parts: [{ name: 'Oli Mesin', price: 52000 }, { name: 'Busi', price: 25000 }] },
    { id: 2, name: 'AHASS BSD City', brand: 'Honda', address: 'Jl. BSD Raya No. 15, BSD', phone: '+62-21-55712345', wa: '6281234567891', distance: '3.2 km', rating: 4.8, reviews: 312, status: 'open', hours: '08:00 - 18:00', verified: true, services: [{ name: 'Servis Berkala', price: 75000 }, { name: 'Servis Besar', price: 150000 }], parts: [{ name: 'Oli Mesin', price: 52000 }] },
    { id: 3, name: 'AHASS Cipondoh', brand: 'Honda', address: 'Jl. Cipondoh Raya No. 48, Tangerang', phone: '+62-21-55723456', wa: '6281234567892', distance: '1.8 km', rating: 4.7, reviews: 278, status: 'open', hours: '08:00 - 17:00', verified: true, services: [{ name: 'Servis Berkala', price: 75000 }], parts: [{ name: 'Oli Mesin', price: 52000 }] },
    { id: 4, name: 'AHASS Karawaci', brand: 'Honda', address: 'Jl. Karawaci Raya No. 88, Karawaci', phone: '+62-21-55734567', wa: '6281234567893', distance: '4.0 km', rating: 4.6, reviews: 198, status: 'open', hours: '08:00 - 17:00', verified: true, services: [{ name: 'Servis Berkala', price: 75000 }], parts: [{ name: 'Oli Mesin', price: 52000 }] },
    { id: 5, name: 'AHASS Serpong', brand: 'Honda', address: 'Jl. Raya Serpong No. 25, Serpong', phone: '+62-21-55745678', wa: '6281234567894', distance: '5.0 km', rating: 4.8, reviews: 234, status: 'open', hours: '08:00 - 17:00', verified: true, services: [{ name: 'Servis Berkala', price: 75000 }], parts: [{ name: 'Oli Mesin', price: 52000 }] },
    { id: 6, name: 'AHASS Alam Sutera', brand: 'Honda', address: 'Jl. Alam Sutera Raya No. 100, Alam Sutera', phone: '+62-21-55756789', wa: '6281234567895', distance: '6.5 km', rating: 4.7, reviews: 156, status: 'open', hours: '09:00 - 18:00', verified: true, services: [{ name: 'Servis Berkala', price: 75000 }], parts: [{ name: 'Oli Mesin', price: 52000 }] },
    // YSP Yamaha (6)
    { id: 7, name: 'YSP Cipondoh Makmur', brand: 'Yamaha', address: 'Jl. Cipondoh Makmur No. 45, Tangerang', phone: '+62-21-55767890', wa: '6282345678901', distance: '2.1 km', rating: 4.7, reviews: 312, status: 'open', hours: '08:00 - 17:00', verified: true, services: [{ name: 'Servis Berkala', price: 80000 }, { name: 'Servis Besar', price: 165000 }], parts: [{ name: 'Oli Yamalube', price: 55000 }] },
    { id: 8, name: 'YSP Bintaro', brand: 'Yamaha', address: 'Jl. Bintaro Utama No. 12, Bintaro', phone: '+62-21-55778901', wa: '6282345678902', distance: '6.5 km', rating: 4.8, reviews: 245, status: 'open', hours: '09:00 - 18:00', verified: true, services: [{ name: 'Servis Berkala', price: 80000 }], parts: [{ name: 'Oli Yamalube', price: 55000 }] },
    { id: 9, name: 'YSP Alam Sutera', brand: 'Yamaha', address: 'Jl. Alam Sutera Raya No. 56, Alam Sutera', phone: '+62-21-55789012', wa: '6282345678903', distance: '4.5 km', rating: 4.6, reviews: 189, status: 'open', hours: '08:00 - 18:00', verified: true, services: [{ name: 'Servis Berkala', price: 80000 }], parts: [{ name: 'Oli Yamalube', price: 55000 }] },
    { id: 10, name: 'YSP Gading Serpong', brand: 'Yamaha', address: 'Jl. Gading Serpong No. 23, Gading Serpong', phone: '+62-21-55790123', wa: '6282345678904', distance: '5.8 km', rating: 4.8, reviews: 267, status: 'open', hours: '08:00 - 17:00', verified: true, services: [{ name: 'Servis Berkala', price: 80000 }], parts: [{ name: 'Oli Yamalube', price: 55000 }] },
    { id: 11, name: 'YSP Tangerang City', brand: 'Yamaha', address: 'Jl. MH Thamrin No. 78, Tangerang', phone: '+62-21-55801234', wa: '6282345678905', distance: '1.8 km', rating: 4.5, reviews: 156, status: 'open', hours: '09:00 - 19:00', verified: true, services: [{ name: 'Servis Berkala', price: 80000 }], parts: [{ name: 'Oli Yamalube', price: 55000 }] },
    { id: 12, name: 'YSP Karawaci', brand: 'Yamaha', address: 'Jl. Karawaci No. 45, Karawaci', phone: '+62-21-55812345', wa: '6282345678906', distance: '3.8 km', rating: 4.6, reviews: 178, status: 'open', hours: '08:00 - 17:00', verified: true, services: [{ name: 'Servis Berkala', price: 80000 }], parts: [{ name: 'Oli Yamalube', price: 55000 }] },
    // Suzuki (5)
    { id: 13, name: 'Suzuki Karawaci', brand: 'Suzuki', address: 'Jl. Karawaci No. 12, Tangerang', phone: '+62-21-55823456', wa: '6283456789012', distance: '3.5 km', rating: 4.5, reviews: 187, status: 'open', hours: '08:00 - 16:00', verified: true, services: [{ name: 'Servis Berkala', price: 70000 }], parts: [{ name: 'Oli Suzuki', price: 58000 }] },
    { id: 14, name: 'Suzuki Ciledug', brand: 'Suzuki', address: 'Jl. Ciledug Raya No. 67, Tangerang', phone: '+62-21-55834567', wa: '6283456789013', distance: '7.2 km', rating: 4.4, reviews: 123, status: 'open', hours: '08:00 - 17:00', verified: true, services: [{ name: 'Servis Berkala', price: 70000 }], parts: [{ name: 'Oli Suzuki', price: 58000 }] },
    { id: 15, name: 'Suzuki Serpong', brand: 'Suzuki', address: 'Jl. Serpong Raya No. 45, Serpong', phone: '+62-21-55845678', wa: '6283456789014', distance: '5.0 km', rating: 4.6, reviews: 98, status: 'open', hours: '08:00 - 16:00', verified: true, services: [{ name: 'Servis Berkala', price: 70000 }], parts: [{ name: 'Oli Suzuki', price: 58000 }] },
    { id: 16, name: 'Suzuki BSD', brand: 'Suzuki', address: 'Jl. BSD Raya No. 78, BSD', phone: '+62-21-55856789', wa: '6283456789015', distance: '6.0 km', rating: 4.5, reviews: 112, status: 'open', hours: '08:00 - 17:00', verified: true, services: [{ name: 'Servis Berkala', price: 70000 }], parts: [{ name: 'Oli Suzuki', price: 58000 }] },
    { id: 17, name: 'Suzuki Tangerang', brand: 'Suzuki', address: 'Jl. Daan Mogot No. 150, Tangerang', phone: '+62-21-55867890', wa: '6283456789016', distance: '2.5 km', rating: 4.3, reviews: 156, status: 'open', hours: '08:00 - 17:00', verified: true, services: [{ name: 'Servis Berkala', price: 70000 }], parts: [{ name: 'Oli Suzuki', price: 58000 }] },
    // Kawasaki (4)
    { id: 18, name: 'Kawasaki Bintaro', brand: 'Kawasaki', address: 'Jl. Bintaro Utama No. 7, Bintaro', phone: '+62-21-55878901', wa: '6284567890123', distance: '5.5 km', rating: 4.7, reviews: 156, status: 'open', hours: '09:00 - 18:00', verified: true, services: [{ name: 'Servis Berkala', price: 95000 }, { name: 'Servis Besar', price: 200000 }], parts: [{ name: 'Oli Kawasaki', price: 75000 }] },
    { id: 19, name: 'Kawasaki BSD', brand: 'Kawasaki', address: 'Jl. BSD Raya No. 34, BSD', phone: '+62-21-55889012', wa: '6284567890124', distance: '6.2 km', rating: 4.8, reviews: 89, status: 'open', hours: '09:00 - 18:00', verified: true, services: [{ name: 'Servis Berkala', price: 95000 }], parts: [{ name: 'Oli Kawasaki', price: 75000 }] },
    { id: 20, name: 'Kawasaki Gading Serpong', brand: 'Kawasaki', address: 'Jl. Gading Serpong No. 45, Gading Serpong', phone: '+62-21-55890123', wa: '6284567890125', distance: '7.0 km', rating: 4.6, reviews: 67, status: 'open', hours: '09:00 - 18:00', verified: true, services: [{ name: 'Servis Berkala', price: 95000 }], parts: [{ name: 'Oli Kawasaki', price: 75000 }] },
    { id: 21, name: 'Kawasaki Alam Sutera', brand: 'Kawasaki', address: 'Jl. Alam Sutera Raya No. 120, Alam Sutera', phone: '+62-21-55901234', wa: '6284567890126', distance: '5.8 km', rating: 4.7, reviews: 78, status: 'open', hours: '09:00 - 18:00', verified: true, services: [{ name: 'Servis Berkala', price: 95000 }], parts: [{ name: 'Oli Kawasaki', price: 75000 }] },
    // KTM (2)
    { id: 22, name: 'KTM Official Jakarta', brand: 'KTM', address: 'Jl. TB Simatupang No. 23, Jakarta Selatan', phone: '+62-21-55912345', wa: '6285678901234', distance: '12.0 km', rating: 4.9, reviews: 89, status: 'open', hours: '10:00 - 19:00', verified: true, services: [{ name: 'Servis Berkala', price: 120000 }, { name: 'Servis Besar', price: 250000 }], parts: [{ name: 'Oli Motorex', price: 95000 }] },
    { id: 23, name: 'KTM Bintaro', brand: 'KTM', address: 'Jl. Bintaro Raya No. 56, Bintaro', phone: '+62-21-55923456', wa: '6285678901235', distance: '8.5 km', rating: 4.7, reviews: 56, status: 'open', hours: '10:00 - 19:00', verified: true, services: [{ name: 'Servis Berkala', price: 120000 }], parts: [{ name: 'Oli Motorex', price: 95000 }] },
    // Vespa (3)
    { id: 24, name: 'Vespa Tangerang City', brand: 'Vespa', address: 'Jl. Boulevard Raya No. 45, Tangerang', phone: '+62-21-55934567', wa: '6286789012345', distance: '2.5 km', rating: 4.6, reviews: 67, status: 'open', hours: '10:00 - 20:00', verified: true, services: [{ name: 'Servis Berkala', price: 85000 }], parts: [{ name: 'Oli Vespa', price: 65000 }] },
    { id: 25, name: 'Vespa Alam Sutera', brand: 'Vespa', address: 'Jl. Alam Sutera Raya No. 88, Alam Sutera', phone: '+62-21-55945678', wa: '6286789012346', distance: '5.0 km', rating: 4.7, reviews: 45, status: 'open', hours: '10:00 - 20:00', verified: true, services: [{ name: 'Servis Berkala', price: 85000 }], parts: [{ name: 'Oli Vespa', price: 65000 }] },
    { id: 26, name: 'Vespa BSD', brand: 'Vespa', address: 'Jl. BSD Raya No. 55, BSD', phone: '+62-21-55956789', wa: '6286789012347', distance: '6.5 km', rating: 4.5, reviews: 34, status: 'open', hours: '10:00 - 20:00', verified: true, services: [{ name: 'Servis Berkala', price: 85000 }], parts: [{ name: 'Oli Vespa', price: 65000 }] },
    // Bengkel Umum (6)
    { id: 27, name: 'Maju Jaya Motor', brand: 'Umum', address: 'Jl. Raya Serpong No. 33, Tangerang Selatan', phone: '+62-21-55967890', wa: '6287890123456', distance: '4.2 km', rating: 4.3, reviews: 523, status: 'open', hours: '07:00 - 20:00', verified: false, services: [{ name: 'Servis Ringan', price: 55000 }, { name: 'Servis Berat', price: 120000 }], parts: [{ name: 'Oli Shell', price: 48000 }] },
    { id: 28, name: 'Barokah Motor', brand: 'Umum', address: 'Jl. Daan Mogot No. 112, Tangerang', phone: '+62-21-55978901', wa: '6287890123457', distance: '1.2 km', rating: 4.2, reviews: 389, status: 'open', hours: '08:00 - 19:00', verified: false, services: [{ name: 'Servis Ringan', price: 55000 }], parts: [{ name: 'Oli Shell', price: 48000 }] },
    { id: 29, name: 'Asia Motor', brand: 'Umum', address: 'Jl. Gatot Subroto No. 56, Tangerang', phone: '+62-21-55989012', wa: '6287890123458', distance: '2.8 km', rating: 4.1, reviews: 234, status: 'open', hours: '08:00 - 18:00', verified: false, services: [{ name: 'Servis Ringan', price: 55000 }], parts: [{ name: 'Oli Shell', price: 48000 }] },
    { id: 30, name: 'Anugrah Motor', brand: 'Umum', address: 'Jl. Imam Bonjol No. 78, Tangerang', phone: '+62-21-55990123', wa: '6287890123459', distance: '3.0 km', rating: 4.0, reviews: 178, status: 'open', hours: '08:00 - 19:00', verified: false, services: [{ name: 'Servis Ringan', price: 55000 }], parts: [{ name: 'Oli Shell', price: 48000 }] },
    { id: 31, name: 'Star Motor', brand: 'Umum', address: 'Jl. Merdeka No. 34, Tangerang', phone: '+62-21-56001234', wa: '6287890123460', distance: '1.8 km', rating: 4.4, reviews: 312, status: 'open', hours: '07:00 - 21:00', verified: false, services: [{ name: 'Servis Ringan', price: 55000 }], parts: [{ name: 'Oli Shell', price: 48000 }] },
    { id: 32, name: 'Berkah Motor', brand: 'Umum', address: 'Jl. MH Thamrin No. 23, Tangerang', phone: '+62-21-56012345', wa: '6287890123461', distance: '2.2 km', rating: 4.2, reviews: 198, status: 'open', hours: '08:00 - 20:00', verified: false, services: [{ name: 'Servis Ringan', price: 55000 }], parts: [{ name: 'Oli Shell', price: 48000 }] },
    // Premium Service (4)
    { id: 33, name: 'Premium Motor Service', brand: 'Premium', address: 'Jl. Sudirman No. 1, Tangerang', phone: '+62-21-56023456', wa: '6289012345671', distance: '2.0 km', rating: 4.9, reviews: 456, status: 'open', hours: '09:00 - 21:00', verified: true, services: [{ name: 'Servis Premium', price: 150000 }, { name: 'Detail Service', price: 250000 }], parts: [{ name: 'Oli Premium', price: 85000 }, { name: 'Busi Iridium', price: 150000 }] },
    { id: 34, name: 'Fast Matic Specialist', brand: 'Premium', address: 'Jl. Boulevard Gading Serpong, Tangerang', phone: '+62-21-56034567', wa: '6289012345672', distance: '6.0 km', rating: 4.8, reviews: 234, status: 'open', hours: '09:00 - 20:00', verified: true, services: [{ name: 'Servis Matic', price: 100000 }], parts: [{ name: 'Oli Premium', price: 85000 }] },
    { id: 35, name: 'Matic Specialist Center', brand: 'Premium', address: 'Jl. Cipondoh Raya No. 88, Tangerang', phone: '+62-21-56045678', wa: '6289012345673', distance: '1.5 km', rating: 4.8, reviews: 189, status: 'open', hours: '09:00 - 20:00', verified: true, services: [{ name: 'Servis Matic', price: 100000 }], parts: [{ name: 'Oli Premium', price: 85000 }] },
    { id: 36, name: 'Sport Bike Specialist', brand: 'Premium', address: 'Jl. Bintaro Raya No. 99, Bintaro', phone: '+62-21-56056789', wa: '6289012345674', distance: '7.5 km', rating: 4.9, reviews: 123, status: 'open', hours: '10:00 - 19:00', verified: true, services: [{ name: 'Servis Sport Bike', price: 200000 }], parts: [{ name: 'Oli Racing', price: 120000 }] }
];

// ==================== FALLBACK STORAGE ====================
const fallbackUsers = [];
const fallbackMotorcycles = [];
const fallbackServiceHistory = [];
const fallbackNotifications = [];

// ==================== INISIALISASI DATABASE ====================
async function initDatabase() {
    try {
        console.log('⏳ Menghubungkan ke database...');
        console.log(`Host: ${dbConfig.host}:${dbConfig.port}`);
        
        pool = await mysql.createPool(dbConfig);
        
        const conn = await pool.getConnection();
        console.log('✅ Koneksi ke database berhasil!');
        conn.release();
        isDatabaseConnected = true;
        
        await createTables();
        
        console.log('✅ Database siap digunakan!');
    } catch (error) {
        console.error('⚠️ Database error:', error.message);
        console.log('📁 Menggunakan mode FALLBACK (data lokal)');
        isDatabaseConnected = false;
        pool = null;
    }
}

async function createTables() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                email VARCHAR(100) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✓ Tabel users siap');
        
        await pool.query(`
            CREATE TABLE IF NOT EXISTS motorcycles (
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
            )
        `);
        console.log('✓ Tabel motorcycles siap');
        
        await pool.query(`
            CREATE TABLE IF NOT EXISTS workshops (
                id INT AUTO_INCREMENT PRIMARY KEY,
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
                verified BOOLEAN DEFAULT FALSE
            )
        `);
        console.log('✓ Tabel workshops siap');
        
        await pool.query(`
            CREATE TABLE IF NOT EXISTS workshop_services (
                id INT AUTO_INCREMENT PRIMARY KEY,
                workshop_id INT NOT NULL,
                name VARCHAR(100) NOT NULL,
                price INT NOT NULL,
                FOREIGN KEY (workshop_id) REFERENCES workshops(id) ON DELETE CASCADE
            )
        `);
        console.log('✓ Tabel workshop_services siap');
        
        await pool.query(`
            CREATE TABLE IF NOT EXISTS workshop_parts (
                id INT AUTO_INCREMENT PRIMARY KEY,
                workshop_id INT NOT NULL,
                name VARCHAR(100) NOT NULL,
                price INT NOT NULL,
                FOREIGN KEY (workshop_id) REFERENCES workshops(id) ON DELETE CASCADE
            )
        `);
        console.log('✓ Tabel workshop_parts siap');
        
        await pool.query(`
            CREATE TABLE IF NOT EXISTS service_history (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                motorcycle_id INT,
                workshop_id INT,
                service_name VARCHAR(100),
                price DECIMAL(10,2),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);
        console.log('✓ Tabel service_history siap');
        
        await pool.query(`
            CREATE TABLE IF NOT EXISTS notifications (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                title VARCHAR(200),
                message TEXT,
                type VARCHAR(50),
                is_read BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);
        console.log('✓ Tabel notifications siap');
        
        const [rows] = await pool.query('SELECT COUNT(*) as total FROM workshops');
        if (rows[0].total === 0) {
            for (const w of FALLBACK_WORKSHOPS) {
                await pool.query(
                    `INSERT INTO workshops (id, name, brand, address, phone, wa, distance, rating, reviews, status, hours, verified) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [w.id, w.name, w.brand, w.address, w.phone, w.wa, w.distance, w.rating, w.reviews, w.status, w.hours, w.verified]
                );
                
                if (w.services) {
                    for (const s of w.services) {
                        await pool.query(`INSERT INTO workshop_services (workshop_id, name, price) VALUES (?, ?, ?)`, [w.id, s.name, s.price]);
                    }
                }
                if (w.parts) {
                    for (const p of w.parts) {
                        await pool.query(`INSERT INTO workshop_parts (workshop_id, name, price) VALUES (?, ?, ?)`, [w.id, p.name, p.price]);
                    }
                }
            }
            console.log(`✓ ${FALLBACK_WORKSHOPS.length} bengkel disimpan`);
        }
    } catch (error) {
        console.error('Error creating tables:', error.message);
    }
}

// ==================== MIDDLEWARE ====================
const auth = async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ message: 'Token tidak ditemukan, silakan login' });
    }
    try {
        const decoded = jwt.verify(token, SECRET_KEY);
        req.userId = decoded.id;
        next();
    } catch (error) {
        return res.status(401).json({ message: 'Token tidak valid, silakan login ulang' });
    }
};

// ==================== API ENDPOINTS ====================

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', database: isDatabaseConnected ? 'connected' : 'fallback_mode' });
});

app.get('/api/motorcycles-master', (req, res) => {
    res.json({ data: FALLBACK_MOTOR_MASTER });
});

app.post('/api/auth/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        
        if (!name || !email || !password) {
            return res.status(400).json({ message: 'Nama, email, dan password harus diisi' });
        }
        if (password.length < 6) {
            return res.status(400).json({ message: 'Password minimal 6 karakter' });
        }
        
        const hashedPassword = await bcrypt.hash(password, 10);
        
        if (isDatabaseConnected && pool) {
            try {
                const [result] = await pool.query(
                    'INSERT INTO users (name, email, password) VALUES (?, ?, ?)',
                    [name, email, hashedPassword]
                );
                return res.json({ message: 'Registrasi berhasil! Silakan login.', userId: result.insertId });
            } catch (dbError) {
                if (dbError.code === 'ER_DUP_ENTRY') {
                    return res.status(400).json({ message: 'Email sudah terdaftar, gunakan email lain' });
                }
            }
        }
        
        const existingUser = fallbackUsers.find(u => u.email === email);
        if (existingUser) {
            return res.status(400).json({ message: 'Email sudah terdaftar' });
        }
        
        const newUser = {
            id: fallbackUsers.length + 1,
            name,
            email,
            password: hashedPassword,
            created_at: new Date().toISOString()
        };
        fallbackUsers.push(newUser);
        
        res.json({ message: 'Registrasi berhasil! Silakan login.', userId: newUser.id });
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ message: 'Terjadi kesalahan pada server' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ message: 'Email dan password harus diisi' });
        }
        
        let user = null;
        
        if (isDatabaseConnected && pool) {
            try {
                const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
                if (rows.length > 0) user = rows[0];
            } catch (dbError) {}
        }
        
        if (!user) {
            user = fallbackUsers.find(u => u.email === email);
        }
        
        if (!user) {
            return res.status(401).json({ message: 'Email atau password salah' });
        }
        
        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) {
            return res.status(401).json({ message: 'Email atau password salah' });
        }
        
        const token = jwt.sign({ id: user.id, email: user.email }, SECRET_KEY, { expiresIn: '7d' });
        
        res.json({
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Terjadi kesalahan pada server' });
    }
});

app.get('/api/motorcycles', auth, async (req, res) => {
    try {
        if (isDatabaseConnected && pool) {
            const [rows] = await pool.query(
                'SELECT * FROM motorcycles WHERE user_id = ? ORDER BY created_at DESC',
                [req.userId]
            );
            return res.json({ data: rows });
        }
        
        const userMotos = fallbackMotorcycles.filter(m => m.user_id === req.userId);
        res.json({ data: userMotos });
    } catch (error) {
        res.json({ data: [] });
    }
});

app.post('/api/motorcycles', auth, async (req, res) => {
    try {
        const { brand, type, year, category, last_service, current_km } = req.body;
        
        if (!brand || !type || !year) {
            return res.status(400).json({ message: 'Brand, type, dan tahun harus diisi' });
        }
        
        let next_service = null;
        if (last_service) {
            next_service = new Date(last_service);
            next_service.setMonth(next_service.getMonth() + 3);
        }
        
        if (isDatabaseConnected && pool) {
            try {
                const [result] = await pool.query(
                    `INSERT INTO motorcycles (user_id, brand, type, year, category, last_service, next_service, current_km) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [req.userId, brand, type, year, category || 'Matic', last_service || null, next_service, current_km || 0]
                );
                return res.json({ data: { id: result.insertId, brand, type, year } });
            } catch (dbError) {}
        }
        
        const newMotor = {
            id: fallbackMotorcycles.length + 1,
            user_id: req.userId,
            brand,
            type,
            year,
            category: category || 'Matic',
            last_service: last_service || null,
            next_service: next_service ? next_service.toISOString().split('T')[0] : null,
            current_km: current_km || 0
        };
        fallbackMotorcycles.push(newMotor);
        
        res.json({ data: { id: newMotor.id, brand, type, year } });
    } catch (error) {
        console.error('Add motor error:', error);
        res.status(500).json({ message: 'Gagal menambah motor' });
    }
});

app.get('/api/workshops', async (req, res) => {
    try {
        if (isDatabaseConnected && pool) {
            const [workshops] = await pool.query('SELECT * FROM workshops ORDER BY rating DESC');
            
            for (const workshop of workshops) {
                const [services] = await pool.query('SELECT name, price FROM workshop_services WHERE workshop_id = ?', [workshop.id]);
                const [parts] = await pool.query('SELECT name, price FROM workshop_parts WHERE workshop_id = ?', [workshop.id]);
                workshop.services = services;
                workshop.parts = parts;
            }
            
            return res.json({ data: workshops });
        }
        
        res.json({ data: FALLBACK_WORKSHOPS });
    } catch (error) {
        res.json({ data: FALLBACK_WORKSHOPS });
    }
});

app.get('/api/workshops/:id', async (req, res) => {
    try {
        const workshop = FALLBACK_WORKSHOPS.find(w => w.id == req.params.id);
        if (workshop) {
            return res.json({ data: workshop });
        }
        res.status(404).json({ message: 'Bengkel tidak ditemukan' });
    } catch (error) {
        res.status(500).json({ message: 'Error' });
    }
});

app.post('/api/estimates', auth, async (req, res) => {
    const { serviceType, parts } = req.body;
    
    const servicePrices = {
        ringan: 50000,
        berkala: 80000,
        besar: 150000,
        ganti_oli: 45000,
        tune_up: 85000
    };
    
    const partPrices = {
        oli: 52000,
        busi: 25000,
        filter: 35000,
        vbelt: 185000
    };
    
    const serviceCost = servicePrices[serviceType] || 80000;
    let partsCost = 0;
    
    if (parts && parts.length > 0) {
        for (const part of parts) {
            partsCost += partPrices[part] || 0;
        }
    }
    
    res.json({
        data: {
            serviceCost,
            partsCost,
            totalCost: serviceCost + partsCost
        }
    });
});

app.get('/api/service-history', auth, async (req, res) => {
    try {
        if (isDatabaseConnected && pool) {
            const [rows] = await pool.query(
                'SELECT * FROM service_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 20',
                [req.userId]
            );
            return res.json({ data: rows });
        }
        
        const userHistory = fallbackServiceHistory.filter(h => h.user_id === req.userId);
        res.json({ data: userHistory });
    } catch (error) {
        res.json({ data: [] });
    }
});

app.get('/api/notifications', auth, async (req, res) => {
    try {
        if (isDatabaseConnected && pool) {
            const [rows] = await pool.query(
                'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 30',
                [req.userId]
            );
            const unreadCount = rows.filter(n => !n.is_read).length;
            return res.json({ data: rows, unreadCount });
        }
        
        const userNotifs = fallbackNotifications.filter(n => n.user_id === req.userId);
        const unreadCount = userNotifs.filter(n => !n.is_read).length;
        res.json({ data: userNotifs, unreadCount });
    } catch (error) {
        res.json({ data: [], unreadCount: 0 });
    }
});

app.put('/api/notifications/:id/read', auth, async (req, res) => {
    try {
        if (isDatabaseConnected && pool) {
            await pool.query(
                'UPDATE notifications SET is_read = TRUE WHERE id = ? AND user_id = ?',
                [req.params.id, req.userId]
            );
        } else {
            const notif = fallbackNotifications.find(n => n.id == req.params.id && n.user_id === req.userId);
            if (notif) notif.is_read = true;
        }
        res.json({ message: 'Updated' });
    } catch (error) {
        res.json({ message: 'OK' });
    }
});

app.put('/api/notifications/read-all', auth, async (req, res) => {
    try {
        if (isDatabaseConnected && pool) {
            await pool.query('UPDATE notifications SET is_read = TRUE WHERE user_id = ?', [req.userId]);
        } else {
            fallbackNotifications.filter(n => n.user_id === req.userId).forEach(n => n.is_read = true);
        }
        res.json({ message: 'All notifications marked as read' });
    } catch (error) {
        res.json({ message: 'OK' });
    }
});

app.get('/api/check-reminders', auth, async (req, res) => {
    res.json({ reminders: [] });
});

app.get('/api/analytics', auth, async (req, res) => {
    res.json({
        totalMotor: 0,
        totalService: 0,
        totalSpent: 0,
        upcomingServices: [],
        savedMoney: 0
    });
});

// ==================== START SERVER ====================
async function startServer() {
    await initDatabase();
    
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`
╔═══════════════════════════════════════════════════════════════════╗
║                                                                   ║
║   🏍️  MOTOCARE BACKEND - RUNNING                                  ║
║                                                                   ║
║   📡 Port: ${PORT}                                                       ║
║   🗄️  Database: ${isDatabaseConnected ? 'MySQL ✅' : 'FALLBACK MODE 📁'}        ║
║   🏍️  Motor Models: ${FALLBACK_MOTOR_MASTER.length}+ models (9 brands)    ║
║   🔧 Bengkel: ${FALLBACK_WORKSHOPS.length} bengkel                         ║
║                                                                   ║
╚═══════════════════════════════════════════════════════════════════╝
        `);
    });
}

startServer();