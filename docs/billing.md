# Ativar assinaturas no Reposita

## 1. Banco e administrador

O banco existente deve ter as migrations 001–004. Entre na conta real do dono do SaaS e abra **Planos e assinatura → Copiar atualização de assinaturas**. Cole no **SQL Editor do seu Supabase** e execute. O conteúdo é a migration `202610170005_billing.sql`, seguida do registro do UUID da conta atual em `reposita_billing_owners`. Volte e clique em **Atualizar dados**.

O SQL é aditivo, transacional e repetível. Não reaplique a migration 001. A migration 005 sozinha não concede administração a ninguém: o proprietário do banco precisa executar o registro. Não use `user_metadata`, e-mail ou parâmetros de URL para conceder privilégios. Outros usuários não podem escrever nas tabelas de billing nem executar as funções administrativas.

## 2. Chave Stripe no servidor

No projeto correto da Vercel, `reposita-1s1q`, confira **Settings → Environment Variables**. Use as variáveis de `.env.example`:

- `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`: públicas, para autenticação do navegador.
- `SUPABASE_SERVICE_ROLE_KEY`: Secret do servidor, já utilizada pelo endpoint de procura.
- `PUBLIC_SITE_URL`: origem HTTPS canônica do app, sem caminho. Exemplo: `https://reposita-1s1q.vercel.app`.
- `STRIPE_SECRET_KEY`: Secret do servidor. Comece com uma chave `sk_test_…` da integração nativa Stripe ou do painel Stripe. Não cole a chave em chats, código ou variáveis `VITE_`.

Se a instalação nativa não fornecer `STRIPE_SECRET_KEY` com esse nome, adicione a variável no projeto. Mudanças de ambiente exigem novo deploy. Conta, chaves, cadastro financeiro e recebimentos são administrados no painel Stripe; o aplicativo não recebe dados do cartão. Use banco e Stripe de teste separados para previews. O Vite local sozinho não executa as funções da pasta `api`; os testes automatizados exercitam esses handlers isoladamente. Um domínio HTTPS com funções Vercel é necessário para validar o webhook completo.

## 3. Preparar e testar

Na conta administradora, informe o **e-mail público de suporte** e clique em **Preparar Stripe**. Isso cria/reutiliza os três produtos/preços mensais, prepara o portal de pagamentos e registra `/api/billing-webhook` no Stripe. O segredo de assinatura do webhook fica na tabela privada do banco, acessível apenas ao servidor. A resposta da API e o bundle do navegador nunca incluem esse segredo ou a service-role.

Em **modo de testes**, contrate um plano e conclua o Checkout usando um cartão de teste disponibilizado na [documentação Stripe](https://docs.stripe.com/testing). Mesmo sendo isento, o administrador pode realizar essa contratação de teste. Confira:

1. Redirecionamento para Checkout, valor mensal correto e retorno ao Reposita.
2. Webhook entregue com sucesso e indicador **Teste de pagamento validado**. Esse indicador exige uma fatura paga no Stripe com valor positivo; abrir Checkout, uma URL de sucesso ou sincronização manual não são prova de pagamento.
3. Portal: cartão, histórico de faturas, cancelamento ao final do período.
4. Conta comum: pagamento libera o limite correspondente; depois de ativar o controle em teste, expiração limita escritas, mantendo consulta, relatórios e exportações.
5. Nova contratação após cancelamento concluído e falha de pagamento sem criação de uma segunda assinatura.

O endpoint precisa estar acessível ao Stripe; proteção de deployment pode impedir entregas em previews. Verifique o painel de webhooks do Stripe em caso de pendência. Eventos assinados são deduplicados; falhas de sincronização retornam erro para permitir nova tentativa. O botão **Sincronizar assinatura** busca o cliente associado à sessão autenticada, sem confiar em `session_id` ou plano da URL.

## 4. Passar para dinheiro real

Finalize a habilitação da conta Stripe para cobranças. Configure `STRIPE_SECRET_KEY=sk_live_…` como Secret na Vercel e faça deploy. Na área administrativa, clique em **Preparar Stripe** novamente: os preços, clientes e webhook reais são separados dos de teste. A mudança de ambiente deixa a cobrança desativada.

Confira o e-mail de suporte, valores, limites, domínio e checklist. Clique em **Ativar assinaturas** e confirme. O servidor exige preparação completa, uma fatura de teste validada e conta Stripe habilitada. A primeira ativação dá uma janela de teste aos usuários existentes; repetir o botão ou desativar/reativar não reinicia indefinidamente os testes.

A ativação permite novas contratações reais e aplica o controle de acesso. Ela não cobra automaticamente as contas existentes. Divulgue `https://SEU-DOMINIO/?planos=1` depois do teste completo. A oferta inicial é mensal, em reais, por cartão; não promete Pix recorrente. Taxas e disponibilidade seguem sua conta Stripe. Configure identidade do vendedor, atendimento, políticas comerciais e obrigações fiscais aplicáveis antes do lançamento; o Reposita não emite NFS-e ou apura tributos.

## Regras operacionais

- **Quota no banco:** criação, importação em lote e restauração de produtos ativos compartilham o mesmo limite. Quantidade em estoque não consome cadastros adicionais. A trigger bloqueia também chamadas diretas às RPCs; o botão da interface não é a única proteção.
- **Sem perda no downgrade:** produtos e movimentações acima do novo limite continuam disponíveis. Novos cadastros e restaurações esperam adequação do uso ou upgrade. Edições e vendas de produtos existentes continuam permitidas com acesso vigente.
- **Fim do acesso:** teste, assinatura e período pago são conferidos pelo horário do banco a cada escrita, inclusive se o webhook de expiração atrasar. Cancelamento agendado preserva acesso até o fim do período. Pagamento pendente/inadimplência não libera um período extra além do teste ou do período válido. Um webhook perdido de renovação pode exigir sincronização manual até ser reenviado.
- **Trocas:** a confirmação informa alteração imediata e ajuste proporcional. Stripe calcula a fatura com `always_invoice`; `pending_if_incomplete` mantém o plano anterior enquanto o pagamento da mudança não é concluído. Faturas podem ser abertas no Stripe para autenticação/pagamento. O portal permite cancelar/atualizar cartão; trocas passam pelo aplicativo para respeitar essa regra.
- **Dados acessíveis:** expiração não apaga ou oculta o estoque, eventos, procura e relatórios do proprietário. Exportação continua disponível. Novas movimentações, compras, procura, uploads e personalização exigem acesso; a remoção de contato pessoal permanece permitida. A página pública de uma loja sem acesso não recebe novos pedidos de procura.
- **Isenção:** administradores registrados no banco têm acesso sem limite e sem assinatura. Podem testar checkout somente no ambiente de teste. Não confunda o uso dessa conta com a validação de quotas de uma conta comum.
- **Preços:** catálogo é administrado pelo dono do banco em `reposita_billing_plans`. Ao mudar valores, execute **Preparar Stripe** novamente. Novos preços são usados em novas contratações/trocas; assinaturas anteriores não são reajustadas automaticamente. Os IDs antigos são preservados para reconhecer clientes existentes. Os limites do plano continuam sendo os valores atuais do catálogo.
- **Pausar novas contratações:** desativar o controle no Reposita restaura acesso às contas e bloqueia novos checkouts reais; **não cancela cobranças recorrentes já existentes no Stripe**. Para encerrá-las, use Stripe/portal. Essa consequência aparece na confirmação administrativa.
- **Demonstrativo:** não consulta pagamentos, não cria clientes nem abre checkout. Os dados demo permanecem locais e separados dos dados reais.
- **Escopo:** sem cupons, cobrança anual, equipe multiusuário, faturamento por unidade ou migração automática entre contas Stripe. Uma conta Stripe deve permanecer associada a cada ambiente. Não há job periódico de reconciliação: webhooks e sincronização autenticada atualizam a assinatura, e o banco valida o vencimento localmente.

## Validação técnica

Execute `npm ci`, `npm test` e `npm run build`. O build compila e importa as funções com Node ESM real, além de publicar a SQL em `/updates/billing.sql`. Os testes cobrem assinatura HMAC real de eventos Stripe, autenticação, origem, antiviolação de preços/cliente, repetição, mudanças pendentes, modo teste/real e quotas/RLS em Postgres isolado (PGlite).

Esses testes não efetuam cobranças e não alteram seu Supabase. PGlite não comprova concorrência entre conexões independentes de produção. As escritas usam bloqueio da linha de perfil para serializar contagem e criação; valide esse comportamento com duas sessões numa base de homologação antes de cargas maiores. Entrega real de webhook, confirmação de e-mail e Checkout exigem verificação na sua conta Stripe e no domínio publicado.
