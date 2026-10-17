# Personalizar a página de sugestões

## Ativação uma única vez

Em uma conta que já tem as migrations 001, 002 e 003, aplique **somente** `supabase/migrations/202610170004_store_pages.sql`. Abra Procura dos clientes → Link da loja → Personalizar página e use **Copiar atualização do banco**. Cole em Supabase → SQL Editor → New query → Run, aguarde Success e atualize o Reposita. O arquivo também fica disponível em `/updates/store-pages.sql` após cada build. Uma instalação nova deve aplicar 001–004, nesta ordem.

Não é preciso trocar chaves na Vercel ou reconfigurar Turnstile. A SQL é aditiva, transacional e repetível: acrescenta a configuração de página e respostas extras, um bucket de imagens públicas e funções próprias. Produtos, fotos privadas de produtos, movimentos, procura, links e estado de ativação são preservados. A migração não é executada automaticamente no banco real.

## O que o lojista pode editar

- **Visual:** nome público, apresentação lado a lado ou centralizada, paleta clara/escura, cores do fundo/formulário/texto/botão e três famílias de fonte.
- **Imagens:** upload de logo e destaque (JPG, PNG ou WebP até 5 MB, otimizados até 1200 px e 600 KB). Remover desvincula da página. Não há URLs de imagens externas ou HTML arbitrário.
- **Textos:** chamada acima do título, título principal (com `{loja}` opcional), descrição, título/descrição do formulário, botão, título/mensagem de confirmação, rodapé e informação adicional de privacidade.
- **Formulário:** rótulos, exemplos, ordem, exibição e obrigatoriedade dos campos compatíveis. Produto é sempre visível/obrigatório. Contato é sempre opcional e, quando preenchido, depende de consentimento específico; não é permitido desativar esse consentimento.
- **Perguntas:** até três perguntas adicionais de texto, com exemplo e opção de resposta obrigatória. Respostas têm até 240 caracteres. Use somente informações necessárias à sugestão; não solicite documentos ou dados sensíveis.
- **Prévia:** celular/computador e confirmação, sem enviar solicitação nem carregar CAPTCHA. Restaurar modelo padrão muda apenas o rascunho; precisa salvar para publicar.

Salvar atualiza o mesmo link imediatamente, sem redefinir o token, ativar uma loja desativada ou mexer em sugestões anteriores. Mudanças não salvas ficam somente no editor e há aviso ao tentar sair. A página só recebe solicitações se já estiver ativa e com a configuração de segurança funcionando.

## Segurança e privacidade

O aviso de que não se trata de compra/reserva, a informação de contato opcional, o consentimento e o aviso básico de uso dos dados permanecem visíveis. O lojista pode acrescentar informações de privacidade, mas não substituir essas proteções. Textos são exibidos como texto, sem executar HTML/scripts. Cores aceitam apenas HEX; o cliente valida contraste de pelo menos 4,5:1 entre texto e fundos e escolhe automaticamente a cor do texto do botão.

`reposita_customize_public_store` exige sessão e grava somente a loja do usuário, preservando ativação/token. A configuração usa lista permitida de campos, limites de tamanho, enumerações e validação no Postgres. O nome público nunca deve conter dados privados. A consulta pública continua retornando somente nome/token/ativação e configuração pública, sem custos ou contatos.

Imagens são intencionalmente públicas no bucket **reposita-store-pages**, separadas das fotos privadas do catálogo. Cada usuário envia apenas à própria pasta; só imagens existentes daquela conta podem ser vinculadas. Não publique arquivos confidenciais. Imagens substituídas, removidas e uploads cancelados não são apagados automaticamente do bucket: a limpeza é manual no Storage, depois de conferir referências. As URLs são públicas e caches externos podem reter imagens já divulgadas.

A ingestão mantém CAPTCHA, validação de origem, limites por conexão/loja, deduplicação e consentimento. O banco aplica a configuração da loja: campos ocultos são descartados, obrigatórios são conferidos e perguntas extras são reconhecidas por ID. Rótulos enviados pelo cliente são ignorados; o banco salva o rótulo configurado na ocasião, preservando o significado mesmo se a pergunta mudar depois. Recarregue o formulário se a loja alterá-lo durante o preenchimento.

As respostas extras aparecem no registro de procura e na cópia JSON. Elas não são incluídas no CSV resumido atual. Ao atender uma exclusão de contato, confira também respostas e notas livres, que podem conter informações digitadas espontaneamente. Não há processamento por IA ou disparos automáticos nesta função.

## Verificação

`npm test` cobre configurações antigas, sanitização, campos obrigatórios/ocultos, contraste, editor → salvar → página pública → resposta, descarte de alterações, isolamento por conta, imagens alheias, preservação de token e migração repetida no Postgres/PGlite. `npm run build` inclui TypeScript, importação nativa Node da API e cópia da SQL pública. Nenhum teste automatizado altera o Supabase de produção.

Após aplicar a SQL real, publique uma alteração simples, abra o mesmo link em outro navegador e confira textos, cores, imagens e envio com CAPTCHA. O fluxo de upload/conta real depende das permissões e da configuração do seu projeto.
