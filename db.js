const { Pool } = require('pg');

// CONNECTION STRING DO POOLER - MUDEI O FORMATO!
const connectionString = 'postgresql://postgres.isuzpmicmlraluopdlst:@Romulo54132@aws-1-sa-east-1.pooler.supabase.com:6543/postgres';

const pool = new Pool({
  connectionString: connectionString,
  ssl: {
    rejectUnauthorized: false
  },
  // Configurações otimizadas para pooler
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
  max: 5
});


module.exports = {
  query: (text, params) => pool.query(text, params),
  end: () => pool.end()
};