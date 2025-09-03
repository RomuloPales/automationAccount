// debug-banco.js
const db = require('./db');

async function debugBanco() {
  try {
    console.log('🔍 Debugando banco de dados...');
    
    // 1. Verificar se a tabela existe
    const tableExists = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'questoes'
      )
    `);
    console.log('📋 Tabela "questoes" existe?', tableExists.rows[0].exists);
    
    // 2. Contar quantas questões tem
    const count = await db.query('SELECT COUNT(*) as total FROM questoes');
    console.log('🔢 Total de questões no banco:', count.rows[0].total);
    
    // 3. Verificar questões de Física
    const fisicaCount = await db.query(`
      SELECT COUNT(*) as total 
      FROM questoes 
      WHERE materia = 'Física'
    `);
    console.log('⚛️  Questões de Física:', fisicaCount.rows[0].total);
    
    // 4. Mostrar algumas questões
    const algumasQuestoes = await db.query(`
      SELECT id, enunciado, materia 
      FROM questoes 
      WHERE materia = 'Física'
      LIMIT 3
    `);
    
    console.log('📝 Exemplo de questões:');
    algumasQuestoes.rows.forEach((questao, index) => {
      console.log(`${index + 1}. [${questao.materia}] ${questao.enunciado.substring(0, 50)}...`);
    });
    
    await db.end();
    
  } catch (error) {
    console.error('❌ Erro no debug:', error.message);
  }
}

debugBanco();