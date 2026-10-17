# Procura e testes de compra · operação v0.4

## Ativar na conta existente

1. No projeto Supabase já usado pelo Reposita, abra SQL Editor → New query.
2. Execute `supabase/migrations/202610170003_demand.sql`. Não execute novamente a migration inicial 001.
3. No Reposita, clique em Atualizar dados. Procura dos clientes, Oportunidades e Testes de compra estarão disponíveis para sua conta.

A SQL acrescenta três tabelas e RPCs com prefixo `reposita_`, índices, RLS e custo médio na compra. Nenhum produto, foto, saldo ou venda anterior é removido. O arquivo é transacional e pode ser reexecutado. Em uma instalação vazia, aplique 001, 002 e 003, nesta ordem. Os testes executam as três e repetem a 003 num Postgres isolado.

## Receber solicitações pela internet

O registro manual interno funciona com a chave pública e a migration. O formulário público usa um endpoint Vercel com CAPTCHA e limites no banco; ele fica indisponível enquanto a configuração estiver incompleta.

No Cloudflare Turnstile, crie um widget e permita o domínio publicado exato, por exemplo `reposita-1s1q.vercel.app`. Em Vercel → projeto **reposita-1s1q** → Settings → Environment Variables, configure:

| Variável | Tipo | Uso |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Config | URL pública, já usada pelo app |
| `VITE_SUPABASE_ANON_KEY` | Config | Chave pública, já usada pelo app |
| `VITE_TURNSTILE_SITE_KEY` | Config | Site key pública do widget |
| `PUBLIC_SITE_URL` | Config | Origem HTTPS exata, como `https://reposita-1s1q.vercel.app` |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret | Chave de serviço do mesmo projeto, só no servidor |
| `TURNSTILE_SECRET_KEY` | Secret | Chave secreta Turnstile, só no servidor |

Preencha os segredos diretamente na Vercel; não os envie em mensagens, não versione `.env.local` e não use prefixo `VITE_` em segredos. O endpoint também aceita a chave de servidor moderna do Supabase no campo server-only indicado. Configure Production; previews precisam de origem, domínio autorizado no Turnstile e preferencialmente um banco separado. Faça um novo deploy depois de alterar variáveis, pois chaves públicas são incorporadas no build.

Em Procura dos clientes → Link da loja, defina o nome público, ative e salve. Copie o link ou baixe o QR Code. Desativar interrompe o recebimento. Gerar outro link invalida o anterior, preservando os registros. No demo, a URL `?procura=demo` usa apenas o mesmo navegador e perfil; não é uma página compartilhada pela internet.

`GET /api/demand` retorna apenas `enabled`. Essa indicação verifica presença/formato da configuração, não testa se as credenciais estão válidas. `POST` exige JSON de até 8 KB, origem exata, ID UUID, honeypot vazio e Turnstile validado no servidor (hostname e ação `demand`). A função privilegiada de ingestão não é executável com a chave pública. Custos, contatos e dados internos não são retornados. O IP é transformado em HMAC por loja/conexão; o IP em texto não é armazenado pela aplicação. Os serviços de hospedagem/CAPTCHA têm suas próprias políticas de logs.

O banco serializa o recebimento por loja, impede repetição do mesmo produto/variante pela mesma conexão em 15 minutos e limita a 10 solicitações por conexão/loja/hora e 200 por loja/24h. Conexões compartilhadas podem atingir o limite juntas. Reenvio com o mesmo UUID não duplica o registro. CAPTCHA expira e é de uso único. Falhas externas geram erro recuperável, sem escrita parcial; não há retry cego do POST. A pessoa pode reenviar; o ID é mantido até o sucesso.

## Fluxo de trabalho

1. **Ouça:** registre uma procura pelo atendimento ou receba pelo link. Nome do produto é obrigatório; contato é opcional. Se for registrar contato, confirme autorização específica para aquele pedido. Nunca inclua dados sensíveis em notas.
2. **Organize:** revise as especificações, vincule ao catálogo, use variantes consistentes e atualize a situação. Fechado e descartado saem dos grupos de oportunidade. Nomes livres equivalentes são normalizados por acentos, pontuação e caixa; não há fusão automática entre nomes diferentes. O vínculo com um mesmo produto reúne nomes distintos, mantendo variantes separadas.
3. **Investigue:** registros e unidades desejadas são sinais, não pessoas únicas, reservas ou demanda garantida. Preço esperado médio considera apenas valores explicitamente informados, sem inferir disposição real de compra. Confirme condições com o cliente.
4. **Compare:** salve um plano por oferta/fornecedor. Produto fora do catálogo deve ser cadastrado com saldo inicial zero se ainda não existe estoque. Salvar plano não cria entrada nem envia pedido a fornecedor. Para mudar uma premissa, crie outro plano e cancele o anterior; os valores de testes iniciados são preservados.
5. **Compre:** somente após a compra real, confirme Registrar compra do lote. Lote e teste são atualizados na mesma transação, uma única vez. Frete é rateado no custo da entrada, em centavos. O custo médio é atualizado; embalagens por venda e taxas permanecem premissas da simulação. O preço de venda planejado não muda o preço do catálogo; edite-o se necessário.
6. **Observe:** registre vendas normalmente. A janela começa ao confirmar a compra e termina no menor entre período planejado, encerramento manual e momento atual. Todas as vendas daquele produto na janela entram na análise, inclusive saldo anterior. Testes sobrepostos podem observar as mesmas vendas. Não há rastreio de lote nem atribuição causal.
7. **Aprenda:** encerre com uma anotação sobre o resultado. A apuração real mostra receita e lucro bruto calculados com os custos históricos informados, antes de taxas e despesas; não é lucro líquido ou contabilidade fiscal. Cancelamento só existe para planos ainda não comprados. Uma compra confirmada só pode ser corrigida por movimentação de ajuste justificada, preservando histórico.
8. **Retorne manualmente:** Abrir WhatsApp prepara uma mensagem sobre o pedido com opção de interromper o contato. Confira o destinatário e a mensagem antes de enviar. O app não envia mensagens sozinho. Se o cliente pedir exclusão, use Excluir contato; a informação de interesse permanece sem telefone/e-mail no campo de contato. Revise também notas livres e cópias exportadas que possam conter esse dado.

## Cenários e custos

Os cenários simulam 50%, 100% e 150% das unidades esperadas informadas por você, com arredondamento para baixo e limite do lote. Não usam IA ou previsão estatística. Margens e comparações dependem dos dados informados.

- Investimento: quantidade × custo unitário + frete total.
- Contribuição unitária: preço × (1 − taxas − impostos) − custo − frete rateado − embalagem.
- Caixa após compra: recebimentos das unidades vendidas, menos taxas/embalagens, menos o investimento completo. Supõe pagamento e recebimento à vista e não inclui despesas fixas, parcelamento, inadimplência ou valor de revenda do saldo.
- Sobra de estoque não equivale a prejuízo realizado. Valores negativos de caixa mostram capital ainda não recuperado nessas premissas.
- O custo médio é arredondado a centavos em cada compra. O rateio do frete também pode gerar diferença de centavos no valor contábil de um lote. O plano preserva o frete total original.

## Dados e testes

Tabelas: `reposita_demands`, `reposita_public_stores`, `reposita_purchase_tests`. Leituras autenticadas são filtradas por proprietário. Escritas diretas são revogadas; RPCs internas exigem sessão e pertencimento. Página pública recebe apenas nome e token da loja ativa. Tokens e contatos não são enviados a analytics. Não há analytics novo nem serviço de IA cobrado nesta entrega.

Configurações exporta JSON com catálogo/eventos e procura/testes carregados com sucesso. Se o módulo novo estiver indisponível, a cópia de estoque não inclui seus dados; verifique o arquivo. CSV de procura omite contatos. Fotos e restauração automática não estão incluídas no JSON. Avalie os prazos de retenção e exclua contatos quando não forem mais necessários; a aplicação não programa campanhas ou retenção automática.

Validação automatizada: `npm test` (regras, DOM, endpoint com APIs simuladas e Postgres/PGlite) e `npm run build` (TypeScript do cliente/servidor, importação nativa Node ESM da Function e bundle). `npm run check:function` também pode ser executado sozinho: compila o endpoint, importa o JavaScript no Node e confirma o bloqueio sem credenciais. Nenhum teste altera o Supabase real.

Após configurar produção, faça um pedido sem contato e outro com contato autorizado, confira que ambos chegam apenas à loja correta, desative/rotacione o link, teste uma compra em produto de teste e confirme saldo/custo. O CAPTCHA real, a autenticação e as credenciais dependem do ambiente e precisam desta verificação no domínio publicado. `npm run dev` oferece o frontend; para testar a Function localmente, use `vercel dev` com variáveis próprias de desenvolvimento. Nunca use chaves secretas em comandos versionados ou na interface pública.
