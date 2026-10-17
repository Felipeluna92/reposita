# Reposita Professional · v0.5

Gestão universal de produtos, movimentação de estoque e simulação de preço/lucro. React + TypeScript + Vite, publicado na Vercel; Supabase Auth e Postgres para dados reais. Sem chamadas ao Lovable.

## Editor da página de sugestões

Em **Procura dos clientes → Link da loja → Personalizar página**, cada lojista pode alterar textos, cores, fonte, layout, logo e imagem de destaque, reorganizar/ocultar campos e adicionar até três perguntas de texto. A prévia usa o mesmo componente da página publicada, com formatos de celular/computador e estado de confirmação. As alterações são publicadas somente ao salvar, no mesmo link da loja. O editor alerta antes de descartar mudanças e valida contraste de leitura.

Para ativar esta versão em um banco existente com 001–003, execute somente [`202610170004_store_pages.sql`](supabase/migrations/202610170004_store_pages.sql) no SQL Editor. O próprio editor também oferece **Copiar atualização do banco**. Não são necessárias novas chaves de API nem alterações nas configurações do Turnstile. Consulte [o guia do editor](docs/store-pages.md).

## Procura dos clientes → compras com propósito

- **Procura:** registre produtos pedidos, variantes, motivo da venda não realizada, quantidade desejada, preço esperado e observações. Contato opcional com autorização explícita; situação, edição, exclusão de contato e exportação CSV.
- **Link da loja + QR Code:** página pública sem login para registrar interesse; nome público configurável, ativação/desativação e rotação do link. Nenhum catálogo privado ou custo fica público. Recebimento pela internet depende da configuração de segurança abaixo.
- **Oportunidades:** agrupa nomes equivalentes e variantes; o vínculo com o catálogo reúne grafias diferentes. Ordena por registros abertos e recência. Não confunde registros com pessoas únicas ou com vendas garantidas.
- **Comparação de fornecedores:** salve uma oferta por plano; simule lote, frete total, embalagem por venda, taxas, impostos, preço e unidades esperadas no período. Três cenários explícitos, limitados ao lote, com caixa após a compra e contribuição. São hipóteses do usuário.
- **Testes de compra:** salvar plano não movimenta estoque. Confirmar uma compra real cria entrada atômica/idempotente, com frete rateado. Depois acompanhe as vendas do produto na janela escolhida e registre o aprendizado ao encerrar.
- **Custo médio ponderado:** compras passam a atualizar `(saldo anterior × custo anterior + compra × custo comprado) / novo saldo`, em centavos. Vendas antigas conservam o custo registrado. Ajustes e vendas não recalculam a média. Preço de catálogo não é alterado pela compra.
- **Dashboard corrigido:** produtos sem preço definido não geram prejuízo potencial fictício; totais potencialmente incompletos são identificados.

Para uma instalação que já tem as migrations 001 e 002, execute **somente** [`202610170003_demand.sql`](supabase/migrations/202610170003_demand.sql) no SQL Editor do Supabase e clique em Atualizar dados. Essa atualização é aditiva e repetível. Sem ela, estoque e catálogo continuam funcionando; as novas telas explicam a ativação. Nenhuma migration é executada automaticamente no seu banco.

Veja [operação, segurança e configuração da página pública](docs/demand.md). Demonstração e conta real continuam separadas. Os novos dados demo ficam em `reposita.demand.v1`, preservando o catálogo `reposita.demo.v2`.

## Estado desta entrega

- Visão geral com estoque a custo, venda potencial e **lucro bruto potencial**, antes de taxas e despesas.
- Produtos: cadastro, edição de metadados, categoria, SKU único por usuário, busca, filtro de reposição e exportação CSV (Excel, separador `;`).
- Movimentações: compras, vendas e ajustes; impedimento de saldo negativo, registro do custo/preço de cada evento e transação atômica no banco. Quantidades inteiras (unidades).
- Arquivamento apenas de produtos com saldo zero, preservando o histórico.
- Calculadora: frete rateado, embalagem, outros custos, taxas, impostos, margem de contribuição, preço sugerido/mínimo, despesas fixas e ponto de equilíbrio.
- Cadastro/login por e-mail e senha, confirmação de e-mail e recuperação de senha via Supabase.
- Demonstração explicitamente identificada, persistida só no navegador. Não é backup nem banco compartilhado. Exemplos opcionais, nunca inseridos em produção. Não há migração automática dos dados demo.

### Novidades profissionais

- Fotos por produto: JPG, PNG e WebP até 5 MB, redução para até 1200 px no navegador, bucket privado por usuário e links assinados temporários. No modo demo, foto otimizada até 600 KB, respeitando o limite total do localStorage.
- Catálogo em cartões ou tabela, paginação, ordenação, busca por nome/SKU/código de barras/fornecedor/localização, detalhes e venda rápida.
- Descrição, código de barras, fornecedor e localização por produto; restauração de arquivados.
- Importação CSV com modelo, revisão linha a linha, validação de SKUs e lote transacional/idempotente de até 200 produtos (arquivo até 2 MB). Não sobrescreve produtos existentes.
- Relatórios por período: receita, custo vendido, lucro/margem bruta, compras, receita diária e ranking de produtos; exportação. Datas conforme fuso do dispositivo.
- Produtos com saldo e sem venda recente (30 dias), alertas e lista de compras sugerida em CSV.
- Tema claro/escuro, botões com profundidade 3D, feedback de sucesso, navegação por teclado e respeito a `prefers-reduced-motion`.
- Exportação JSON de produtos/eventos para cópia manual. Não inclui arquivos de foto nem restauração automática.

Não inclui cobrança/assinaturas, equipe multiusuário, emissão fiscal, envio de pedidos a fornecedores, IA/previsão de demanda ou apuração fiscal. A reposição sugerida é uma regra simples de estoque mínimo. O dashboard resume todo o histórico; Relatórios tem recorte configurável. Uma venda é uma movimentação, não um pedido com múltiplos itens.

## Atualizar uma instalação existente — importante

Se você já executou `202610160001_reposita.sql`, **não execute esse arquivo novamente**.

1. Abra o SQL Editor do mesmo projeto Supabase que já utiliza no Reposita.
2. Execute [`supabase/migrations/202610160002_professional.sql`](supabase/migrations/202610160002_professional.sql).
3. Aguarde sucesso e volte ao Reposita. Clique em **Atualizar dados**.
4. Em Configurações, confira `Fotos e campos avançados: Atualização aplicada`.

A atualização acrescenta colunas e funções, cria bucket privado `reposita-products` e políticas por pasta do usuário. Não apaga produtos, preços, saldos ou eventos. É transacional e pode ser reexecutada: a segunda aplicação foi testada num Postgres isolado. Faça backup adequado antes de qualquer alteração de produção. O catálogo básico continua utilizável antes da atualização; fotos, restauração, campos extras e importação dependem da nova SQL.

### Fotos e privacidade

Arquivos são gravados em `<user_id>/<uuid>.webp` (ou PNG, conforme suporte do navegador). Somente o proprietário pode ler/enviar/excluir objetos na sua pasta; vínculos a arquivos de outra conta são recusados. URLs assinadas são válidas por uma hora e renovadas enquanto a foto está aberta. Uma URL assinada compartilhada funciona até expirar; não a publique. Não há galeria anônima.

Remover/substituir a foto desvincula a referência no produto, mas não apaga automaticamente o arquivo antigo do Storage; evita-se excluir uma foto durante falha entre upload e salvamento. Uploads cancelados também podem deixar arquivos não vinculados. A limpeza é manual no Storage, após conferir referências e cópias. Armazenamento e tráfego seguem a cota do seu plano Supabase; nenhum plano pago foi contratado.

Nome do negócio e tema são preferências locais deste navegador, não configurações fiscais ou compartilhadas entre equipes.

## Estrutura

```text
src/
  App.tsx                    # sessão, navegação, dashboard e catálogo
  components/                # formulários, diálogo, calculadora e login
  hooks/useInventory.ts      # carregamento, erros e mutações
  lib/
    finance.ts               # cálculo puro, testado
    inventory.ts             # regras de saldo e proteção de CSV
    repository.ts            # adaptadores localStorage / Supabase
    supabase.ts              # cliente com chave pública
  types.ts
  demand/                    # procura, oportunidades, cenários, página pública
api/demand.ts                # endpoint Vercel, nunca incluído no bundle Vite
server/demand-handler.ts     # CAPTCHA, validação, limites e ingestão privilegiada
supabase/migrations/          # schema, índices, políticas e RPCs
```

## Rodar localmente

Node 22 ou superior. Com `package-lock.json`, use:

```bash
npm ci
npm test
npm run build
npm run dev
```

Sem variáveis de ambiente, é possível explorar a demonstração. Para dados reais, conclua a configuração abaixo primeiro. Não execute migrations automaticamente contra um banco de produção.

## Conectar seu Supabase (uma vez)

1. No seu projeto Supabase, abra **SQL Editor → New query**.
2. Copie o conteúdo de [`supabase/migrations/202610160001_reposita.sql`](supabase/migrations/202610160001_reposita.sql) e execute com **Run**. A migration cria somente objetos com prefixo `reposita_`, sem apagar dados de outras aplicações. Execute uma única vez. Se houver erro, a transação é revertida; não remova tabelas para tentar novamente.
3. Execute também `202610160002_professional.sql` para fotos e recursos avançados e `202610170003_demand.sql` para procura, compras e custo médio. Em **Authentication → Providers**, habilite Email. Recomenda-se manter a confirmação de e-mail ativa. Ajuste SMTP e limites de envio antes de um lançamento público.
4. Em **Authentication → URL Configuration**, defina **Site URL** como o domínio real da Vercel e adicione esse mesmo domínio em **Redirect URLs**. Para desenvolvimento, adicione `http://localhost:5173`. Use URLs específicas para previews; não abra redirecionamentos indiscriminadamente.
5. Copie `.env.example` para `.env.local` e preencha as configurações públicas. Não versione `.env.local`.

```dotenv
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=SUA_CHAVE_PUBLICA_ANON_OU_PUBLISHABLE
```

**Nunca use `service_role`, senha do Postgres ou `sb_secret_` em `VITE_*`.** A chave pública só é segura com as políticas do banco aplicadas.

## Configurar Vercel

Repositório: `Felipeluna92/reposita`. Framework: **Vite**. Instalação: `npm ci`. Build: `npm run build`. Saída: `dist`. Node: **22.x**.

Em **Settings → Environment Variables**, adicione `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` para Production (e Preview, se desejado, preferencialmente com projeto Supabase separado). Depois faça um novo deploy. **As antigas variáveis `NEXT_PUBLIC_SUPABASE_*` não são usadas por este aplicativo Vite.** Não basta adicioná-las sem redeploy, porque a configuração pública é incorporada no build.

Um push na branch de produção vinculada dispara deploy na Vercel. Este repositório novo não está automaticamente sincronizado ao projeto antigo do Lovable. Use a URL da Vercel como preview; não é necessário gastar créditos no Lovable.

## Segurança e modelo de dados

- `reposita_products`: produto por `user_id`, preços, limites, saldo e estado ativo. Índice de SKU por proprietário.
- `reposita_movements`: eventos imutáveis, custo/preço na ocasião e chave de requisição UUID para repetição segura.
- RLS: cada usuário autenticado pode ler apenas suas próprias linhas. Sem acesso anônimo.
- Escrita direta nas tabelas é revogada para clientes. RPCs `SECURITY DEFINER` têm `search_path` vazio, exigem `auth.uid()` e validam o proprietário; não aceitam `user_id` do cliente.
- Saldo é atualizado com bloqueio de linha e histórico na mesma transação. Eventos não podem ser editados/excluídos pelo cliente; correções são novas movimentações.
- Após a migration 003, compras calculam custo médio ponderado; a edição manual do cadastro continua disponível para correções de custo atual. Custo de venda é o valor informado na movimentação. Não há recálculo retroativo.
- Arquivar não significa vender/baixar estoque; primeiro registre uma saída com justificativa, quando apropriado.
- Demo no navegador não tem isolamento de contas: não use em computador compartilhado para dados sensíveis. Logout da conta remove o painel da sessão, mas exportações feitas pelo usuário permanecem no dispositivo.
- CSV exportado neutraliza fórmulas iniciadas por `=`, `+`, `-` e `@`. Preços são simulação gerencial, não apuração contábil ou fiscal.

## Verificação manual após configuração

`npm test` inclui testes unitários, fluxos da interface em DOM simulado e a migration executada num Postgres isolado (PGlite). Nenhum teste altera seu banco Supabase. Não substitui os testes manuais da autenticação e do domínio de produção. Os preços mínimo e sugerido são arredondados para cima no centavo, evitando ficar abaixo da margem-alvo por arredondamento.

1. Crie duas contas A e B e confirme os e-mails.
2. Na conta A, cadastre produto com saldo 10, venda 2 e confira saldo 8 após recarregar.
3. Tente vender 9: deve falhar e não criar evento.
4. Entre como B: não deve enxergar nenhum produto/evento de A, nem alterá-los via RPC.
5. Edite preço na conta A: o custo/preço dos eventos anteriores não deve mudar.
6. Teste recuperação de senha e exportação CSV.

## Próximas evoluções

Pedidos de compra com múltiplos itens, gestão de fornecedores em módulo próprio, múltiplas lojas/equipes e faturamento SaaS. Essas evoluções não estão anunciadas como implementadas nesta versão.
