const { Pool } = require('pg');
require('dotenv').config();

// Khởi tạo Connection Pool chuẩn cho PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('supabase.com') || process.env.DATABASE_URL?.includes('rds.amazonaws.com')
    ? { rejectUnauthorized: false }
    : false,
});

pool.on('connect', () => {
  console.log('🐘 PostgreSQL Database connected successfully!');
});

pool.on('error', (err) => {
  console.error('❌ Database connection error:', err);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
