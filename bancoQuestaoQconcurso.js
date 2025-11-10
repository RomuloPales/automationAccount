const cheerio = require("cheerio");
const fs = require("fs");
const db = require("./db");
const puppeteer = require("puppeteer");

/**
 * Função que usa o Puppeteer para buscar o HTML de uma página
 */
async function fetchPageHtml(browser, url) {
  const page = await browser.newPage();
  try {
    console.log(`🌐 Navegando para: ${url}`);
    
    // Configurar o user-agent para parecer mais real
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Navega para a página
    await page.goto(url, { 
      waitUntil: 'domcontentloaded', 
      timeout: 60000 
    });
    
    // Aguardar o conteúdo das questões carregar
    console.log('⏳ Aguardando o conteúdo das questões carregar...');
    await page.waitForSelector('.q-question-body', { timeout: 30000 });
    console.log('✅ Conteúdo carregado.');

    // Aguardar um pouco mais para garantir que tudo carregou (método compatível)
    await new Promise(resolve => setTimeout(resolve, 2000));

    const htmlContent = await page.content();
    return htmlContent;

  } catch (err) {
      console.error(`❌ Erro ao carregar a página ${url}: ${err.message}`);
      return null;
  } finally {
    await page.close();
  }
}

/**
 * Função principal que raspa as questões de um conteúdo HTML fornecido.
 */
async function scrapeQuestoes(htmlContent) {
  try {
    const $ = cheerio.load(htmlContent);

    const materia = "Matematica"; // IMPORTANTE - SEMPRE MUDAR
    
    // Extrai o assunto da página
    let assunto = $(".q-breadcrumb a").last().text().trim() || materia;
    if (!assunto) {
      assunto = $("title").text()
        .replace("QConcursos.com", "")
        .replace("|", "")
        .trim();
    }

    // Encontrar todas as questões na página
    const questoes = $(".q-question-body");
    console.log(`✅ Encontradas ${questoes.length} questões em ${assunto}`);

    let questõesSalvas = 0;

    for (let i = 0; i < questoes.length; i++) {
      const questao = $(questoes[i]);
      
      // Extrair o enunciado
      let enunciado = questao.find(".q-question-enunciation").text().trim();
      
      if (!enunciado) {
        console.log(`⚠️  Questão ${i + 1} sem enunciado, pulando...`);
        continue;
      }
      
      // Extrair as alternativas
      let alternativasTexto = "";
      const alternativasArray = [];

      questao.find(".q-radio-button").each((_, el) => {
        const elemento = $(el);
        const letra = elemento.find('.q-option-item').text().trim().toLowerCase();
        const texto = elemento.find('.q-item-enum').text().trim();
        
        if (letra && texto) {
          const alternativaCompleta = `${letra}) ${texto}`;
          alternativasTexto += alternativaCompleta + "\n";
          alternativasArray.push(alternativaCompleta);
        }
      });
      
      // Formatar o enunciado completo
      let enunciadoCompleto = enunciado + "\n\n" + alternativasTexto.trim();
      
      // Limpar espaços excessivos
      enunciadoCompleto = enunciadoCompleto
        .replace(/\n\s*\n\s*\n+/g, '\n\n')
        .replace(/[ \t]+/g, ' ')
        .trim();

      // Inserir no banco de dados
      if (enunciado && alternativasArray.length > 0) {
        try {
          await db.query(
            `INSERT INTO questoes (enunciado, alternativas, resposta, materia, assunto)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (enunciado, assunto) DO NOTHING`,
            [enunciadoCompleto, JSON.stringify(alternativasArray), '', materia, assunto]
          );
          console.log(`✅ Questão ${i + 1} salva: ${enunciado.substring(0, 50)}...`);
          questõesSalvas++;
        } catch (dbError) {
          console.log(`❌ Erro ao salvar questão ${i + 1}:`, dbError.message);
        }
      } else {
        console.log(`⚠️  Questão ${i + 1} ignorada - enunciado ou alternativas vazias`);
      }
    }
    
    console.log(`✅ Página "${assunto}" processada! (${questõesSalvas}/${questoes.length} questões salvas)\n`);
    
  } catch (err) {
    console.error(`❌ Erro ao analisar o HTML:`, err.message);
  }
}

/**
 * Gera as URLs das páginas a serem raspadas.
 */
function gerarUrlsPaginas(paginaInicial = 1, paginaFinal = 10) {
  const urls = [];
  const urlBase = "https://www.qconcursos.com/questoes-de-concursos/questoes?discipline_ids%5B%5D=13&page=";
  
  for (let i = paginaInicial; i <= paginaFinal; i++) {
    urls.push(`${urlBase}${i}&from_omniauth=true&provider=google_oauth2`);
  }
  return urls;
}

/**
 * Função principal que orquestra todo o processo de scraping.
 */
async function main() {
  // --- CONFIGURAÇÃO --- IMPORTANTE
  const PAGINA_INICIAL = 1;
  const PAGINA_FINAL = 200;
  
  console.log(`🚀 INICIANDO SCRAPING QCONCURSOS`);
  console.log(`📖 Páginas: ${PAGINA_INICIAL} à ${PAGINA_FINAL}`);

  // Inicia o navegador com configurações
  const browser = await puppeteer.launch({ 
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process'
    ]
  });

  try {
    const urlsParaScrape = gerarUrlsPaginas(PAGINA_INICIAL, PAGINA_FINAL);
    console.log(`📄 Total de páginas: ${urlsParaScrape.length}`);

    let totalQuestoesSalvas = 0;
    let paginasProcessadas = 0;

    for (let i = 0; i < urlsParaScrape.length; i++) {
      const url = urlsParaScrape[i];
      const numeroPagina = PAGINA_INICIAL + i;
      
      console.log(`\n📄 Processando página ${numeroPagina} de ${PAGINA_FINAL}...`);
      console.log(`🔗 ${url}`);
      
      // Usa o Puppeteer para buscar o HTML
      const htmlContent = await fetchPageHtml(browser, url);
      
      // Se o HTML foi obtido, processa as questões
      if (htmlContent) {
        await scrapeQuestoes(htmlContent);
        paginasProcessadas++;
      } else {
        console.log(`❌ Não foi possível obter conteúdo da página ${numeroPagina}`);
      }
      
      // Delay entre requisições
      if (i < urlsParaScrape.length - 1) {
        const delay = 5000 + Math.random() * 3000; // 5-8 segundos
        console.log(`⏳ Aguardando ${Math.round(delay/1000)} segundos...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    console.log("\n🎉 SCRAPING FINALIZADO!");
    console.log(`📊 Páginas processadas: ${paginasProcessadas}/${urlsParaScrape.length}`);
    
  } catch (err) {
    console.error("❌ Erro no processo principal:", err.message);
  } finally {
    // Fecha o navegador e a conexão com o banco de dados
    await browser.close();
    await db.end();
    console.log("🔌 Navegador e conexão com o banco de dados fechados.");
  }
}

// Inicia o processo
main().catch(console.error);