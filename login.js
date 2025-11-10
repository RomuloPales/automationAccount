const puppeteer = require("puppeteer");
const db = require("./db");

const port = process.argv[2] || 9222;

// --------------------------------------------------
// CONFIGURAÇÃO PRINCIPAL
// --------------------------------------------------
const materiaEscolhida = "Física"; // <-- MUDE A MATÉRIA AQUI
const INTERACOES_POR_CONTA = 20;
const MINIMO_DIAS_BUSCA = 2; // <-- DEFINA O MÍNIMO DE DIAS AQUI
// --------------------------------------------------

const materiaMap = {
  "Todas as matérias": "0",
  "ENEM": "48",
  "Matemática": "1",
  "História": "8",
  "Geografia": "7",
  "Biologia": "25",
  "Português": "15",
  "Física": "2",
  "Química": "26",
  "Filosofia": "33",
  "Sociologia": "18"
};


async function getRandomAccount() {
  try {
    const result = await db.query(`
      SELECT email, senha FROM brainly_contas
      ORDER BY RANDOM()
      LIMIT 1
    `);

    if (result.rows.length === 0) {
      console.log("❌ Nenhuma conta encontrada no banco.");
      return null;
    }
    return result.rows[0];

  } catch (error) {
    console.log("❌ Erro ao buscar conta:", error.message);
    return null;
  }
}

async function getBrainlyPage(browser) {
    const pages = await browser.pages();
    let brainlyPage = pages.find(page => page.url().includes('brainly.com.br'));

    if (!brainlyPage) {
        brainlyPage = pages[0] || await browser.newPage();
        console.log("🌐 Navegando para Brainly");
        await brainlyPage.goto('https://brainly.com.br', { waitUntil: 'networkidle0' });
    }
    await brainlyPage.bringToFront();
    return brainlyPage;
}

async function fazerLogin(browser, account) {
  let page;
  try {
    page = await getBrainlyPage(browser);
    const loginButtonHeader = await page.$('a[data-testid="log_in_button_header"]');
    
    if (!loginButtonHeader) {
      const profileButton = await page.$('button[data-testid="navigation_profile_panel_button"]');
      if (profileButton) {
        await fazerLogout(page);
        return fazerLogin(browser, account);
      }
      throw new Error("Botão 'Entrar' (header) não encontrado.");
    }

    await loginButtonHeader.evaluate(btn => btn.click());
    
    await page.waitForSelector('input[data-testid="email_field"]', { timeout: 10000 });
    await page.type('input[data-testid="email_field"]', account.email, { delay: 30 });
    await page.type('input[data-testid="password_input"]', account.senha, { delay: 30 });
    await page.click('button[data-testid="form_login_submit"]');
    await page.waitForSelector('button[data-testid="navigation_profile_panel_button"]', { timeout: 5000 });
    
    console.log(`🎉 Login realizado com sucesso como ${account.email}!`);
    return page;

  } catch (error) {
    console.log(`❌ Erro during o login: ${error.message}`);
    if (page) await page.screenshot({ path: 'erro_login.png' });
    return null;
  }
}

async function fazerLogout(page) {
  try {
    console.log("Deslogando");
    const profileButton = await page.$('button[data-testid="navigation_profile_panel_button"]');
    if (!profileButton) {
      console.log("Botão de perfil não encontrado, talvez já deslogado.");
      return true;
    }
    await profileButton.click();
    
    await page.waitForSelector('a[data-testid="navigation_user_menu_log_out"]', { timeout: 5000 });
    const logoutLink = await page.$('a[data-testid="navigation_user_menu_log_out"]');
    await logoutLink.click();
    
    await page.waitForSelector('a[data-testid="log_in_button_header"]', { timeout: 10000 });
    console.log("✅ Logout concluído.");
    return true;
  } catch (error) {
    console.log(`❌ Erro ao fazer logout: ${error.message}`);
    return false;
  }
}


async function selecionarFiltros(page, nomeMateria) {
  console.log(`🖱️  Configurando filtros para: ${nomeMateria} | Respondidas`);
  try {
    const subjectElements = await page.$$('.brn-subject-list__subject');
    let foundInList = false;

    if (subjectElements.length > 0) {
      for (const el of subjectElements) {
        const text = await el.evaluate(node => node.textContent);
        if (text.includes(nomeMateria)) {
          
          await el.click();
          foundInList = true;
          break;
        }
      }
    }

    if (!foundInList) {
      
      const materiaValue = materiaMap[nomeMateria];
      if (!materiaValue) {
        console.log(`❌ Valor para "${nomeMateria}" não encontrado no map.`);
        return false;
      }
      await page.select('select#subjects', materiaValue);
    }
    
    await page.select('select#status', 'ANSWERED');
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    
    return true;

  } catch (error) {
    console.log(`❌ Erro ao aplicar filtros: ${error.message}`);
    return false;
  }
}


async function checarCondicaoDosDias(page, minDias) {
  try {
    const selector = '.sg-breadcrumb-list--short .sg-breadcrumb-list__element:nth-child(2) .sg-text--no-wrap';
    const timestamps = await page.$$eval(selector, spans => 
      spans.map(span => span.textContent)
    );

    for (const text of timestamps) {
      if (text.includes('dias')) {
        const match = text.match(/\d+/);
        if (match) {
          const numDias = parseInt(match[0], 10);
          if (numDias >= minDias) {
            return true;
          }
        }
      }
    }
    return false;

  } catch (error) {
    console.log("Erro ao checar timestamps:", error.message);
    return false;
  }
}


async function carregarAtePerguntasAntigas(page, minDias, clicksExtras = 5, maxTotalClicks = 50) {
  
  let conditionMet = false;
  let finalClicks = 0;
  let totalClicks = 0;

  console.log(`🔄 Iniciando busca por perguntas (mínimo ${minDias} dias)`);

  while (totalClicks < maxTotalClicks) {
    try {
      const buttons = await page.$$('button .sg-button__text');
      let clicked = false;

      for (const button of buttons) {
        const text = await button.evaluate(node => node.textContent);
        
        if (text === 'Mostrar mais') {
          await button.evaluate(btn => btn.scrollIntoView({ block: 'center' }));
          await new Promise(resolve => setTimeout(resolve, 200));
          await button.click();
          
          clicked = true;
          totalClicks++;
          break; 
        }
      }

      if (!clicked) {
        console.log("✅ Botão 'Mostrar mais' desapareceu. Fim do carregamento.");
        break; 
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000)); 

      if (conditionMet) {
        finalClicks++;
        console.log(`🖱️  Clique extra ${finalClicks} de ${clicksExtras}`);
        if (finalClicks >= clicksExtras) {
          console.log("✅ Cliques extras concluídos.");
          break;
        }
      } else {
        
        conditionMet = await checarCondicaoDosDias(page, minDias);
        
        if (conditionMet) {
          console.log(`🎉 Condição 'há ${minDias} dias ou mais' encontrada!`);
        }
      }

    } catch (error) {
      console.log("⚠️  Erro no loop de clique:", error.message);
      break;
    }
  }

  if (totalClicks >= maxTotalClicks) {
    console.log(`⚠️  Atingiu o limite de ${maxTotalClicks} cliques.`);
  }


}


async function clicarPerguntaAleatoria(page, visitedLinks, targetQuestionHandles) {
  
  try {
    let handlesToSearch = targetQuestionHandles;

    
    if (!handlesToSearch || handlesToSearch.length === 0) {
      console.log("... Nenhuma pergunta nova identificada, usando todas as perguntas da página.");
      handlesToSearch = await page.$$('a[data-test="feed-item-link"]');
      
      if (handlesToSearch.length === 0) {
        console.log("❌ Nenhuma pergunta encontrada no feed.");
        return false;
      }
    }

    const linksWithHrefs = [];
    for (const handle of handlesToSearch) { // Itera sobre o grupo-alvo
      const href = await handle.evaluate(node => node.getAttribute('href'));
      if(href) {
        linksWithHrefs.push({ handle, href });
      }
    }

    
    const freshLinks = linksWithHrefs.filter(link => !visitedLinks.has(link.href));

    let chosenLink;
    if (freshLinks.length > 0) {
   
      const randomIndex = Math.floor(Math.random() * freshLinks.length);
      chosenLink = freshLinks[randomIndex];
    } else {
     
      const randomIndex = Math.floor(Math.random() * linksWithHrefs.length);
      chosenLink = linksWithHrefs[randomIndex];
    }
    
    visitedLinks.add(chosenLink.href);
    await chosenLink.handle.evaluate(link => link.scrollIntoView({ block: 'center' }));
    await new Promise(resolve => setTimeout(resolve, 200));
    await chosenLink.handle.click();

    await page.waitForSelector('div[data-testid="question_page_rating"]', { timeout: 5000 });
    console.log("✅ Página da pergunta carregada.");
    return true;

  } catch (error) {
    console.log(`❌ Erro ao clicar em pergunta aleatória: ${error.message}`);
    return false;
  }
}

async function avaliarEReagir(page) {
  try {
    const rating = Math.random() < 0.5 ? 4 : 5;
    const starSelector = `div[data-test="answer-box-rating-button-${rating}"]`;
    const starButton = await page.$(starSelector);

    if (starButton) {
      await starButton.click();
      console.log(`⭐ ${rating} estrelas clicado.`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    } else {
      console.log("⚠️  Não foi possível encontrar as 5 estrelas (talvez já avaliado?).");
    }

    const thanksButton = await page.$('button[data-testid="answer_box_thanks_button"]');
    if (thanksButton) {
      await thanksButton.click();
      console.log("❤️ Coração (Obrigado) clicado.");
      
      await page.waitForSelector('button[data-testid="personalised_thanks_item_test_id"]', { timeout: 5000 });
      
      const gifButton = await page.$('button[data-testid="personalised_thanks_item_test_id"]');
      if (gifButton) {
        await gifButton.click();
        
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } else {
      console.log("⚠️  Não foi possível encontrar o botão de 'Obrigado'.");
    }
    
    console.log("✅ Avaliação e reação concluídas.");
    return true;

  } catch (error) {
    console.log(`❌ Erro ao avaliar/reagir: ${error.message}`);
    return false;
  }
}

function getRandomClicks(min = 1, max = 5) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}


(async () => {
  let browser;
  try {
    browser = await puppeteer.connect({
        browserURL: `http://localhost:${port}`,
        defaultViewport: null
    });

    // Loop externo
    while (true) {
    
      const visitedLinks = new Set();
      let loggedInPage;
      
      // 1. LOGIN
      try {
        const account = await getRandomAccount();
        if (!account) throw new Error("Conta não encontrada no banco.");
        console.log(`Usando conta: ${account.email}`);

        loggedInPage = await fazerLogin(browser, account);

        if (!loggedInPage) {
          console.log("❌ Falha no login, pulando para próxima conta.");
          await new Promise(resolve => setTimeout(resolve, 3000)); 
          continue; 
        }
      } catch (loginError) {
        console.log(`❌ Erro fatal no login: ${loginError.message}`);
        await new Promise(resolve => setTimeout(resolve, 3000)); 
        continue;
      }

      // 2. LOOP INTERNO
      for (let i = 0; i < INTERACOES_POR_CONTA; i++) {
        console.log(`\n--- 🔄 CICLO ${i + 1} / ${INTERACOES_POR_CONTA} (Conta: ${loggedInPage.url().includes('login') ? 'N/A' : 'Logada'}) 🔄 ---`);
        
        try {
          if (loggedInPage.url() !== 'https://brainly.com.br/') {
            console.log("🌐 Navegando para a página inicial");
            await loggedInPage.goto('https://brainly.com.br/', { waitUntil: 'networkidle0' });
          }
          
          const filtrosAplicados = await selecionarFiltros(loggedInPage, materiaEscolhida);

          if (filtrosAplicados) {
            
          
            const initialQuestions = await loggedInPage.$$('a[data-test="feed-item-link"]');
            const countBeforeLoading = initialQuestions.length;

            const cliquesExtrasAleatorios = getRandomClicks(1, 5);
            console.log(`Irá fazer ${cliquesExtrasAleatorios} cliques extras.`);
            await carregarAtePerguntasAntigas(loggedInPage, MINIMO_DIAS_BUSCA, cliquesExtrasAleatorios, 50);
          

            
            const allQuestions = await loggedInPage.$$('a[data-test="feed-item-link"]');

            
            const newQuestionHandles = allQuestions.slice(countBeforeLoading);

            
            const perguntaAberta = await clicarPerguntaAleatoria(loggedInPage, visitedLinks, newQuestionHandles);
            

            if (perguntaAberta) {
              await avaliarEReagir(loggedInPage);
            }

          } else {
            console.log("❌ Não foi possível continuar, filtros não aplicados.");
          }

          console.log("✅ Ciclo concluído. Voltando para a home");
          await loggedInPage.goto('https://brainly.com.br/', { waitUntil: 'networkidle0' });
          await new Promise(resolve => setTimeout(resolve, 1000));

        } catch (cycleError) {
          console.log(`❌ Erro no ciclo: ${cycleError.message}`);
          if (loggedInPage) {
             await loggedInPage.screenshot({ path: 'erro_ciclo.png' });
             await loggedInPage.goto('https://brainly.com.br/', { waitUntil: 'networkidle0' });
          }
          console.log("Aguardando 3s antes de tentar o próximo ciclo.");
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      } // Fim do loop interno

      // 3. LOGOUT
      console.log(`💯 ${INTERACOES_POR_CONTA} ciclos completos. Deslogando`);
      await fazerLogout(loggedInPage);

    } // Fim do loop externo

  } catch (mainError) {
    console.log(`❌ Erro fatal no processo: ${mainError.message}`);
  } finally {
    await db.end();
  }
})();