// scrape.js (ou seu arquivo principal)
const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");
const db = require("./db"); // Agora aponta para o Neon

async function scrapeQuestoes(url) {
  try {
    console.log(`🌐 Acessando: ${url}`);
    const { data } = await axios.get(url);
    const $ = cheerio.load(data);

    const materia = "Fisica"; // mudar sempre a matéria
    let assunto = $("title").text()
      .replace("Exercícios sobre", "")
      .replace("Exercícios - Brasil Escola", "")
      .trim();

    const questoes = $(".questoes");
    console.log(`✅ Encontradas ${questoes.length} questões em ${assunto}`);

    for (let i = 0; i < questoes.length; i++) {
      const questao = $(questoes[i]);
      const enunciado = questao.find(".question-text").text().trim();

      const alternativas = questao.find(".question-text p")
        .map((_, el) => $(el).text().trim())
        .get()
        .filter(txt => /^[A-D]\)/.test(txt));

      const resposta = questao.find(".question-answer .answer-text").text().trim();

      // Insert no Neon
      await db.query(
        `INSERT INTO questoes (enunciado, alternativas, resposta, materia, assunto)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (enunciado, assunto) DO NOTHING`,
        [enunciado, JSON.stringify(alternativas), resposta, materia, assunto]
      );

      console.log(`✓ Questão ${i + 1} salva: ${enunciado.slice(0, 50)}...`);
    }

    console.log(`✅ Todas questões de ${assunto} salvas no Neon!\\n`);
  } catch (err) {
    console.error("❌ Erro no scrape:", err.message);
  }
}

async function main() {
  const links = JSON.parse(fs.readFileSync("links.json", "utf-8"));

  for (const url of links) {
    await scrapeQuestoes(url);
    await new Promise(resolve => setTimeout(resolve, 2000)); // Delay entre requests
  }

  await db.end();
  console.log("🎉 Scraping finalizado!");
}

main();