const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");
const db = require("./db");

async function scrapeQuestoes(url) {
  try {
    console.log(`🌐 Acessando: ${url}`);
    const { data } = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    const $ = cheerio.load(data);

    const materia = "Informatica"; // mudar sempre a matéria IMPORTANTE
    
    // Extrair assunto do título
    let assunto = $("title").text()
      .replace("Questões de Concursos", "")
      .replace("| Aprova Concursos", "")
      .trim();

    const questoes = $(".questao");
    console.log(`✅ Encontradas ${questoes.length} questões em ${assunto}`);

    for (let i = 0; i < questoes.length; i++) {
      const questao = $(questoes[i]);
      
      // Extrair o enunciado
      let enunciado = questao.find(".enunciado").text().trim();
      
      // Extrair as alternativas de forma limpa
      let alternativasTexto = "";
      questao.find(".alternativas li .lbl span").each((_, el) => {
        let texto = $(el).text().trim();
        
        // Remover espaços/tabs excessivos depois da letra da alternativa
        texto = texto.replace(/^([a-e]\))\s+/, '$1 ');
        
        if (texto.length > 0) {
          alternativasTexto += texto + "\n"; // Uma linha por alternativa
        }
      });
      
      // JUNTAR enunciado + alternativas com formatação limpa
      let enunciadoCompleto = enunciado + "\n\n" + alternativasTexto.trim();
      
      // Limpar múltiplas quebras de linha consecutivas
      enunciadoCompleto = enunciadoCompleto.replace(/\n\s*\n\s*\n+/g, '\n\n');
      
      // Extrair alternativas formatadas para a coluna separada
      const alternativas = questao.find(".alternativas li .lbl span")
        .map((_, el) => {
          let texto = $(el).text().trim();
          texto = texto.replace(/^([a-e]\))\s+/, '$1 '); // Limpa aqui também
          texto = texto.replace(/[ \t]+/g, ' ').trim();
          return texto;
        })
        .get()
        .filter(text => text.length > 0);

      // Insert no banco de dados
      await db.query(
        `INSERT INTO questoes (enunciado, alternativas, resposta, materia, assunto)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (enunciado, assunto) DO NOTHING`,
        [enunciadoCompleto, JSON.stringify(alternativas), '', materia, assunto]
      );

      console.log(`✓ Questão ${i + 1} salva: ${enunciadoCompleto.slice(0, 50)}...`);
    }

    console.log(`✅ Página processada: ${assunto}\\n`);
  } catch (err) {
    console.error("❌ Erro no scrape:", err.message);
  }
}

// Função para gerar URLs das páginas com limite
function gerarUrlsPaginas(paginaInicial = 1, paginaFinal = 10) {
  const urls = [];
  const urlBase = "https://www.aprovaconcursos.com.br/questoes-de-concurso/questoes/assunto/ataques-e-tecnicas-contra-sistemas-de-informacao,conceitos-basicos-em-informatica,organizacao-e-gerenciamento-de-informacoes-arquivos-e-pastas,principios-e-procedimentos-da-seguranca-da-informacao,seguranca-da-informacao,sistema-operacional-linux-em-nocoes-de-informatica,sistemas-de-informacao,tecnologia-da-informacao-e-comunicacao-tic/modalidade/certo-errado,multipla-escolha/quantidade-por-pagina/200";
  
  // Página 1 é a URL base sem /pagina/1
  if (paginaInicial <= 1) {
    urls.push(urlBase);
  }
  
  // Gera URLs das páginas 2 até a final
  for (let i = Math.max(2, paginaInicial); i <= paginaFinal; i++) {
    urls.push(`${urlBase}/pagina/${i}`);
  }
  
  return urls;
}

async function main() {
  // CONFIGURAÇÃO: Defina aqui o intervalo de páginas que quer raspar IMPORTANTE
  const PAGINA_INICIAL = 1;
  const PAGINA_FINAL = 5;
  
  try {
    // Gerar URLs das páginas
    const urlsParaScrape = gerarUrlsPaginas(PAGINA_INICIAL, PAGINA_FINAL);
    
    console.log(`📖 Total de páginas para scrape: ${urlsParaScrape.length}`);
    console.log(`📄 Páginas: ${PAGINA_INICIAL} à ${PAGINA_FINAL}`);
    
    for (let i = 0; i < urlsParaScrape.length; i++) {
      const url = urlsParaScrape[i];
      const numeroPagina = i === 0 ? 1 : i + 1;
      
      console.log(`\n📄 Processando página ${numeroPagina} de ${PAGINA_FINAL}: ${url}`);
      await scrapeQuestoes(url);
      
      // Delay entre requisições (3 segundos)
      if (i < urlsParaScrape.length - 1) {
        console.log(`⏳ Aguardando 3 segundos antes da próxima página...`);
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }

    console.log("🎉 Scraping finalizado! Todas as páginas foram processadas.");
  } catch (err) {
    console.error("❌ Erro no processo principal:", err.message);
  } finally {
    await db.end();
  }
}

main();