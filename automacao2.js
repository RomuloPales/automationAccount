const puppeteer = require("puppeteer");
const db = require("./db");
let consecutiveErrors = 0;
const MAX_ERRORS_BEFORE_RECOVERY = 3;

// Função para gerar email aleatório
function generateRandomEmail() {
    const randomString = Math.random().toString(36).substring(2, 10);
    const randomNumber = Math.floor(Math.random() * 1000);
    return `user${randomString}${randomNumber}@gmail.com`;
}

// Função para gerar idade aleatória entre 18 e 25
function generateRandomAge() {
    return Math.floor(Math.random() * 8) + 18;
}

// Função para sortear número de perguntas (2-6)
function getRandomQuestionCount() {
    return Math.floor(Math.random() * 5) + 2; // 2 a 6
}

function cleanQuestionText(text) {
    // Remover a frase "Ver resposta" e qualquer texto após ela
    return text.replace(/Ver resposta.*/i, '').trim();
}

// Função para obter perguntas do banco
async function getPhysicsQuestions(limit) {
    try {
        const result = await db.query(`
            SELECT id, enunciado 
            FROM questoes 
            WHERE materia = 'Fisica'
            ORDER BY RANDOM() 
            LIMIT $1
        `, [limit]);

        if (result.rows.length === 0) {
            console.log("❌ Nenhuma questão disponível no banco");
            return null;
        }

        // Limpar o texto de cada pergunta
        const cleanedQuestions = result.rows.map(question => ({
            ...question,
            enunciado: cleanQuestionText(question.enunciado)
        }));

        return cleanedQuestions;
    } catch (error) {
        console.log("❌ Erro ao buscar questões do banco:", error.message);
        return null;
    }
}

async function recuperacaoSimples(page) {
    try {
        console.log('🔄 Executando recuperação simples...');
        
        // 1. Ir para página inicial
        await page.goto('https://brainly.com.br/', { 
            waitUntil: 'networkidle0',
            timeout: 15000 
        });
        console.log('✅ Página inicial carregada');
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // 2. Tentar logout
        try {
            const profileButton = await page.$('button[data-testid="navigation_profile_panel_button"]');
            if (profileButton) {
                await profileButton.click();
                console.log('✅ Clicou no perfil');
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                const logoutLink = await page.$('a[data-testid="navigation_user_menu_log_out"]');
                if (logoutLink) {
                    await logoutLink.click();
                    console.log('✅ Logout realizado');
                    await new Promise(resolve => setTimeout(resolve, 3000));
                }
            }
        } catch (logoutError) {
            console.log('⚠️  Logout não necessário ou não funcionou:', logoutError.message);
        }
        
        console.log('🎉 Recuperação concluída!');
        return true;
        
    } catch (error) {
        console.log('❌ Erro na recuperação:', error.message);
        return false;
    }
}

async function postQuestion(page, question) {
    try {
        console.log("📝 Iniciando processo de criação de pergunta...");
        
        // CLICAR NO BOTÃO "FAÇA SUA PERGUNTA"
        let askQuestionButton = await page.$('a[data-testid="all_questions_ask_question_button"]');
        if (!askQuestionButton) {
            const askQuestionButtons = await page.$$x('//a[contains(., "Faça sua pergunta")]');
            if (askQuestionButtons.length > 0) askQuestionButton = askQuestionButtons[0];
        }
        
        if (askQuestionButton) {
            await askQuestionButton.evaluate(btn => btn.click());
            console.log("✅ Botão 'Faça sua pergunta' clicado com sucesso!");
            
            // Aguardar o popup abrir
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // PREENCHER A PERGUNTA
            let questionTextarea = await page.$('textarea[data-testid="text_editor_textarea"]');
            if (!questionTextarea) {
                questionTextarea = await page.$('textarea[placeholder*="Escreva sua pergunta aqui"]');
            }
            
            if (questionTextarea) {
                
                // Verificar se o campo está realmente vazio
                const currentValue = await questionTextarea.evaluate(el => el.value);
                if (currentValue && currentValue.trim() !== '') {
                   console.log("🧹 Limpando o campo de texto...");
                    await questionTextarea.evaluate(el => {
                        el.value = '';
                        el.dispatchEvent(new Event('input', { bubbles: true }));
                    });
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
                
                console.log("✅ Campo limpo com sucesso!");
                
                // AGORA ESCREVER A NOVA PERGUNTA
                await questionTextarea.type(question.enunciado, { delay: 30 });
                console.log("✅ Pergunta preenchida com sucesso!");
                
                // Aguardar um pouco após preencher a pergunta
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                // VERIFICAR SE APARECEU ERRO DE PALAVRA PROIBIDA
                const hasWordError = await page.$('div[data-testid="editor_error_message"]');
                if (hasWordError) {
                    console.log("❌ Palavra proibida detectada! Tentando contornar...");
                    
                    // 1. Clicar no botão de fechar (X)
                    const closeButton = await page.$('div.sg-toplayer__close');
                    if (closeButton) {
                        await closeButton.click();
                        console.log("✅ Botão de fechar clicado");
                        await new Promise(resolve => setTimeout(resolve, 2000));
                        
                        // 2. Verificar se apareceu o modal de confirmação de saída
                        const exitConfirmButton = await page.$('button[data-testid="exit_confirmation_quit"]');
                        if (exitConfirmButton) {
                            await exitConfirmButton.click();
                            console.log("✅ Clicou em 'Sim, quero sair'");
                            await new Promise(resolve => setTimeout(resolve, 3000));
                            
                            // 3. Atualizar a página
                            await page.reload();
                            console.log("🔄 Página atualizada");
                            await new Promise(resolve => setTimeout(resolve, 3000));
                            
                            return false; // Retorna false para pular esta pergunta
                        }
                    }
                    
                    console.log("❌ Não foi possível contornar o erro de palavra proibida");
                    return false;
                }
                
                // SELECIONAR A MATÉRIA 
                let subjectSelect = await page.$('select[data-testid="add_question_subject"]');
                if (!subjectSelect) {
                    subjectSelect = await page.$('select');
                }
                
                if (subjectSelect) {
                    // Selecionar a matéria (com o valor)
                    await subjectSelect.select('2');
                    console.log("✅ Matéria selecionada");
                    
                    // Aguardar 2 segundos após selecionar a matéria
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    
                    // CLICAR NO BOTÃO "FAÇA SUA PERGUNTA" PARA ENVIAR
                    let submitQuestionButton = await page.$('button[data-testid="add_question_submit"]');
                    if (!submitQuestionButton) {
                        const submitButtons = await page.$$x('//button[contains(., "Faça sua pergunta")]');
                        if (submitButtons.length > 0) submitQuestionButton = submitButtons[0];
                    }
                    
                    if (submitQuestionButton) {
                        await submitQuestionButton.evaluate(btn => btn.click());
                        console.log("✅ Botão 'Faça sua pergunta' (enviar) clicado com sucesso!");
                        
                        // Aguardar o processamento
                        await new Promise(resolve => setTimeout(resolve, 3000));
                        
                        // VERIFICAR SE APARECEU A MENSAGEM DE PERGUNTA DUPLICADA
                        const duplicateDetected = await page.evaluate(() => {
                            // Verificar pela mensagem específica
                            const messageDiv = document.querySelector('.sg-content-box.sg-content-box--spaced-top-small.sg-content-box--spaced-bottom-small');
                            const hasMessage = messageDiv && messageDiv.textContent.includes('Já temos respostas para esta pergunta');
                            
                            // Verificar também se o botão outline existe
                            const outlineButton = document.querySelector('div.sg-content-box.sg-content-box--spaced-bottom-small button.sg-button.sg-button--s.sg-button--outline');
                            
                            return hasMessage || !!outlineButton;
                        });

                        if (duplicateDetected) {
                            console.log("⚠️  Pergunta duplicada detectada! Tentando contornar...");
                            
                            // Aguardar 5 segundos
                            await new Promise(resolve => setTimeout(resolve, 5000));
                            
                            // TENTAR MÚLTIPLOS MÉTODOS PARA CLICAR NO BOTÃO
                            let buttonClicked = false;
                            
                            // Método 1: Seletor específico do botão outline
                            const outlineButton = await page.$('div.sg-content-box.sg-content-box--spaced-bottom-small button.sg-button.sg-button--s.sg-button--outline');
                            if (outlineButton) {
                                await outlineButton.click();
                                console.log("✅ Botão clicado pelo seletor específico!");
                                buttonClicked = true;
                            }
                            
                            // Método 2: Buscar por qualquer botão com o texto "Faça sua pergunta"
                            if (!buttonClicked) {
                                const buttons = await page.$$('button');
                                for (const button of buttons) {
                                    const text = await button.evaluate(btn => btn.textContent);
                                    if (text && text.includes('Faça sua pergunta')) {
                                        await button.click();
                                        console.log("✅ Botão clicado por texto!");
                                        buttonClicked = true;
                                        break;
                                    }
                                }
                            }
                            
                            // Método 3: Buscar por span com o texto
                            if (!buttonClicked) {
                                const spans = await page.$$('span.sg-button__text');
                                for (const span of spans) {
                                    const text = await span.evaluate(el => el.textContent);
                                    if (text && text.includes('Faça sua pergunta')) {
                                        await span.click();
                                        console.log("✅ Botão clicado pelo span!");
                                        buttonClicked = true;
                                        break;
                                    }
                                }
                            }
                            
                            if (buttonClicked) {
                                // Aguardar o processamento
                                await new Promise(resolve => setTimeout(resolve, 3000));
                                console.log("🎉 Fluxo de duplicata concluído com sucesso!");
                                return true;
                            } else {
                                console.log("❌ Não foi possível encontrar o botão de contorno");
                                return false;
                            }
                        }
                        
                        // Se não apareceu mensagem de duplicata, verificar se foi publicada normalmente
                        const success = await page.evaluate(() => {
                            return !document.querySelector('textarea[data-testid="text_editor_textarea"]') ||
                                   document.body.textContent.includes('publicada') ||
                                   document.body.textContent.includes('sucesso');
                        });
                        
                        if (success) {
                            console.log("🎉 Pergunta criada com sucesso!");
                            return true;
                        } else {
                            console.log("❌ A pergunta pode não have sido publicada");
                            return false;
                        }
                        
                    } else {
                        console.log("❌ Botão de enviar pergunta não encontrado");
                        return false;
                    }
                    
                } else {
                    console.log("❌ Dropdown de matéria não encontrado");
                    return false;
                }
                
            } else {
                console.log("❌ Campo de texto da pergunta não encontrado");
                return false;
            }
            
        } else {
            console.log("❌ Botão 'Faça sua pergunta' não encontrado na página inicial");
            return false;
        }
    } catch (error) {
        console.log("❌ Erro ao postar pergunta:", error.message);
        return false;
    }
}

// Função para fazer logout
async function fazerLogout(page) {
    try {
        console.log("🚪 Iniciando logout...");
        
        // 1. Clicar no botão do perfil
        const profileButton = await page.$('button[data-testid="navigation_profile_panel_button"]');
        if (profileButton) {
            await profileButton.click();
            console.log("✅ Clicou no botão do perfil");
            
            // Esperar o menu abrir
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // 2. Clicar no link "Sair"
            const logoutLink = await page.$('a[data-testid="navigation_user_menu_log_out"]');
            if (logoutLink) {
                await logoutLink.click();
                console.log("✅ Clicou em 'Sair'");
                
                // Esperar o logout processar
                await new Promise(resolve => setTimeout(resolve, 3000));
                console.log("🎉 Logout realizado com sucesso!");
                return true;
            } else {
                console.log("❌ Link 'Sair' não encontrado");
                return false;
            }
        } else {
            console.log("❌ Botão do perfil não encontrado");
            return false;
        }
    } catch (error) {
        console.log("❌ Erro durante logout:", error.message);
        return false;
    }
}

// Função principal que será executada em loop
async function executarCicloCompleto(browser, cycleCount) {
    try {
        console.log(`\n🔄 INICIANDO CICLO ${cycleCount} 🔄`);
        
        const questionCount = getRandomQuestionCount();
        console.log(`🎯 Vou postar ${questionCount} perguntas`);

        const questions = await getPhysicsQuestions(questionCount);
        if (!questions || questions.length === 0) {
            console.log("❌ Não foi possível obter perguntas do banco");
            return false;
        }

        console.log(`📚 ${questions.length} questões selecionadas do banco:`);

        const pages = await browser.pages();
        const brainlyHomePage = pages.find(page => 
            page.url().includes('brainly') || 
            page.url().includes('brainly.com') ||
            page.url().includes('brainly.com.br')
        );
        
        if (!brainlyHomePage) {
            console.log("❌ Página do Brainly não encontrada");
            return false;
        }

        await brainlyHomePage.bringToFront();
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Tentar clicar no link de cadastro
        const registerLink = await brainlyHomePage.$('a[data-testid="register_button_header"]');
        if (!registerLink) {
            console.log("❌ Link de cadastro não encontrado");
            return false;
        }

        await registerLink.evaluate(link => link.click());
        console.log("✅ Link 'Cadastre-se já' clicado com sucesso!");
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        const allPages = await browser.pages();
        let signupPage = allPages.find(page => 
            page.url().includes('signup') || 
            page.url().includes('register') ||
            page.url().includes('cadastro')
        );
        
        if (!signupPage) {
            console.log("❌ Página de cadastro não encontrada");
            return false;
        }

        await signupPage.bringToFront();
        console.log("📋 Nova página de cadastro aberta");
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // PREENCHER EMAIL
        let emailInput = await signupPage.$('input[data-testid="email_input"]');
        if (!emailInput) emailInput = await signupPage.$('input[type="email"]');
        if (!emailInput) emailInput = await signupPage.$('input[name="username"]');
        if (!emailInput) emailInput = await signupPage.$('input[name="email"]');
        if (!emailInput) emailInput = await signupPage.$('input[placeholder*="email" i], input[placeholder*="e-mail" i], input[placeholder*="Digite seu e-mail" i]');
        
        if (emailInput) {
            const randomEmail = generateRandomEmail();
            await emailInput.click({ clickCount: 3 });
            await emailInput.type(randomEmail, { delay: 30 });
            console.log(`✅ Email preenchido: ${randomEmail}`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // CLICAR NO BOTÃO "FAZER CADASTRO"
        let submitButton = await signupPage.$('button[data-testid="registration_from_email_submit"]');
        if (!submitButton) submitButton = await signupPage.$('button[type="submit"]');
        if (!submitButton) {
            const buttons = await signupPage.$x('//button[contains(., "Fazer cadastro")] | //button[contains(., "Cadastrar")] | //button[contains(., "Continuar")]');
            if (buttons.length > 0) submitButton = buttons[0];
        }
        
        if (submitButton) {
            await submitButton.evaluate(btn => btn.click());
            console.log("✅ Botão 'Fazer cadastro' clicado com sucesso!");
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // PREENCHER SENHA
            let passwordInput = await signupPage.$('input[data-testid="password_input"]');
            if (!passwordInput) passwordInput = await signupPage.$('input[type="password"]');
            if (!passwordInput) passwordInput = await signupPage.$('input[name="password"]');
            if (!passwordInput) passwordInput = await signupPage.$('input[placeholder*="senha" i], input[placeholder*="password" i], input[placeholder*="Crie sua senha" i]');
            
            if (passwordInput) {
                await new Promise(resolve => setTimeout(resolve, 1000));
                await passwordInput.click({ clickCount: 3 });
                await passwordInput.type('senha1234', { delay: 30 });
                console.log("✅ Senha preenchida: senha1234");
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                // SELECIONAR IDADE ALEATÓRIA
                let ageSelect = await signupPage.$('select[data-testid="age_input"]');
                if (!ageSelect) ageSelect = await signupPage.$('select[name="birthday"]');
                if (!ageSelect) ageSelect = await signupPage.$('select#birthday');
                if (!ageSelect) ageSelect = await signupPage.$('select');
                
                if (ageSelect) {
                    const randomAge = generateRandomAge();
                    await ageSelect.select(randomAge.toString());
                    console.log(`✅ Idade selecionada: ${randomAge} anos`);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    
                    // SELECIONAR "FERRAMENTA DE PESQUISA"
                    let originSelect = await signupPage.$('select[data-testid="origin_input"]');
                    if (!originSelect) originSelect = await signupPage.$('select[name="origin"]');
                    if (!originSelect) originSelect = await signupPage.$('select#origin');
                    
                    if (originSelect) {
                        await originSelect.select('SEARCH');
                        console.log("✅ Selecionado: Ferramenta de pesquisa");
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        
                        // MARCAR CHECKBOX DOS TERMOS
                        let tosCheckbox = await signupPage.$('input[data-testid="tos_input"]');
                        if (!tosCheckbox) tosCheckbox = await signupPage.$('input#tos');
                        if (!tosCheckbox) tosCheckbox = await signupPage.$('input[name="tos"]');
                        if (!tosCheckbox) tosCheckbox = await signupPage.$('input[type="checkbox"][required]');
                        
                        if (tosCheckbox) {
                            const isChecked = await tosCheckbox.evaluate(checkbox => checkbox.checked);
                            if (!isChecked) {
                                await tosCheckbox.evaluate(checkbox => checkbox.click());
                                console.log("✅ Checkbox dos termos marcado");
                                
                                // CLICAR NO RADIO BUTTON "SOU ALUNO(A)"
                                let studentRadio = await signupPage.$('input[data-testid="accountType_STUDENT"]');
                                if (!studentRadio) studentRadio = await signupPage.$('input#accountType-STUDENT');
                                if (!studentRadio) studentRadio = await signupPage.$('input[name="accountType"][value="STUDENT"]');
                                if (!studentRadio) {
                                    const studentLabel = await signupPage.$x('//label[.//h1[contains(., "Sou aluno")]] | //label[.//*[contains(text(), "Sou aluno")]]');
                                    if (studentLabel.length > 0) {
                                        await studentLabel[0].evaluate(label => label.click());
                                        console.log("✅ Radio button 'Sou aluno(a)' clicado via label");
                                    }
                                }
                                
                                if (studentRadio) {
                                    await studentRadio.evaluate(radio => radio.click());
                                    console.log("✅ Radio button 'Sou aluno(a)' clicado");
                                }
                                
                                await new Promise(resolve => setTimeout(resolve, 2000));
                                
                                // CLICAR NO BOTÃO "CRIAR CONTA"
                                let createAccountButton = await signupPage.$('button[data-testid="registration_other_fields_submit_button"]');
                                if (!createAccountButton) {
                                    createAccountButton = await signupPage.$x('//button[contains(., "Criar conta")] | //button[contains(., "Finalizar cadastro")]');
                                    if (createAccountButton.length > 0) createAccountButton = createAccountButton[0];
                                }
                                
                                if (createAccountButton) {
                                    const isDisabled = await createAccountButton.evaluate(btn => btn.disabled);
                                    if (!isDisabled) {
                                        await createAccountButton.evaluate(btn => btn.click());
                                        console.log("✅ Botão 'Criar conta' clicado com sucesso!");
                                        await new Promise(resolve => setTimeout(resolve, 3000));
                                        
                                        await signupPage.goto('https://brainly.com.br/', { waitUntil: 'networkidle0' });
                                        console.log("🌐 Redirecionado para: https://brainly.com.br/");
                                        await new Promise(resolve => setTimeout(resolve, 3000));
                                        
                                        // POSTAR PERGUNTAS
                                        for (let i = 0; i < questions.length; i++) {
                                            console.log(`\n📋 Postando pergunta ${i + 1} de ${questions.length}`);
                                            console.log(`📝 ${questions[i].enunciado.substring(0, 100)}...`);
                                            
                                            const success = await postQuestion(signupPage, questions[i]);
                                            
                                            if (success) {
                                                console.log("⏳ Aguardando 10 segundos antes da próxima pergunta...");
                                                await new Promise(resolve => setTimeout(resolve, 10000));
                                                await signupPage.goto('https://brainly.com.br/', { waitUntil: 'networkidle0' });
                                                console.log("🌐 Voltando para a página inicial");
                                                await new Promise(resolve => setTimeout(resolve, 3000));
                                            }
                                        }
                                        
                                        console.log("🎉 Todas as perguntas foram postadas com sucesso!");
                                        
                                        // FAZER LOGOUT
                                        await fazerLogout(signupPage);
                                        return true;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        
        return false;
        
    } catch (error) {
        console.log("❌ Erro no ciclo:", error.message);
        return false;
    }
}

// LOOP PRINCIPAL
(async () => {
    try {
        const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222' });
        console.log("✅ Browser conectado. Iniciando loop infinito...");
        console.log("⏸️  Pressione Ctrl+C para parar");

        let cycleCount = 1;
        let consecutiveErrors = 0;
        const MAX_ERRORS_BEFORE_RECOVERY = 3;
        
        while (true) {
            const success = await executarCicloCompleto(browser, cycleCount);
            
            if (success) {
                console.log(`\n✅ Ciclo ${cycleCount} concluído com sucesso!`);
                consecutiveErrors = 0; // Resetar contador de erros
            } else {
                console.log(`\n❌ Ciclo ${cycleCount} falhou.`);
                consecutiveErrors++;
                
                // VERIFICAR SE PRECISA DE RECUPERAÇÃO
                if (consecutiveErrors >= MAX_ERRORS_BEFORE_RECOVERY) {
                    console.log('🚨 3 erros consecutivos! Executando recuperação...');
                    
                    // Encontrar página ativa do Brainly
                    const pages = await browser.pages();
                    const activePage = pages.find(page => page.url().includes('brainly')) || pages[0];
                    
                    // Executar recuperação simples
                    await recuperacaoSimples(activePage);
                    
                    // Resetar contador após recuperação
                    consecutiveErrors = 0;
                    console.log('🔄 Recuperação concluída. Reiniciando ciclos...');
                    
                    // Aguardar mais tempo após recuperação
                    await new Promise(resolve => setTimeout(resolve, 10000));
                    continue; // Pular o wait normal abaixo
                }
            }
            
            cycleCount++;
            
            // Aguardar um pouco antes do próximo ciclo
            console.log("⏳ Aguardando 5 segundos antes do próximo ciclo...");
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
        
    } catch (error) {
        console.log("❌ Erro no loop principal:", error.message);
    }
})();