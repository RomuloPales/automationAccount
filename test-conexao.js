const db = require('./db');

async function testarConexao() {
  try {
    console.log('🧪 Testando conexão com NOVO projeto Supabase...');
    const result = await db.query('SELECT NOW() as hora');
    console.log('✅ CONECTADO! Hora do servidor:', result.rows[0].hora);
    await db.end();
  } catch (error) {
    console.error('❌ Erro:', error.message);
    console.log('💡 Verifique se o DNS está funcionando...');
  }
}

testarConexao();