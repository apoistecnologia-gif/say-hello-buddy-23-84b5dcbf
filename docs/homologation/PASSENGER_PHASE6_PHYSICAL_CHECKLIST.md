# APOIS Passageiro — FASE 6 / Checklist físico

Este checklist é parte do gate de homologação do **APOIS Corridas**. Build, typecheck e CI verdes não substituem os testes abaixo em aparelho Android real.

## Regras

- Supabase oficial: `vqtucstyduxrqjgyigfk`.
- PR #7 permanece DRAFT.
- Não mesclar até concluir todos os itens críticos.
- Não considerar integrações financeiras prontas sem confirmação server-side.
- PIX/cartão de corrida permanecem fail-closed enquanto `finance.ride_electronic_payments_enabled` estiver falso.

## Conta e autenticação

- [ ] cold start sem sessão abre Login sem flash de tela autenticada;
- [ ] login válido abre a Home;
- [ ] logout remove acesso às rotas privadas;
- [ ] cadastro exige aceite dos Termos de Uso e Política de Privacidade;
- [ ] cadastro grava versões e timestamps legais no backend;
- [ ] "Esqueci minha senha" envia e-mail real;
- [ ] link recebido abre o app pelo deep link `apoispassageiro://auth/reset-password`;
- [ ] redefinição de senha conclui e permite novo login;
- [ ] sessão expirada volta ao fluxo correto sem loop.

## Perfil e privacidade

- [ ] alterar nome/telefone/cidade/data de nascimento persiste após reabrir;
- [ ] enviar foto JPEG/PNG/WebP válida funciona;
- [ ] foto reaparece após matar e reabrir o app;
- [ ] substituir foto remove o uso da anterior sem quebrar o perfil;
- [ ] Termos de Uso abrem a partir do menu autenticado;
- [ ] Política de Privacidade abre a partir do menu autenticado;
- [ ] voltar do documento legal retorna ao fluxo autenticado;
- [ ] preferências de comunicação persistem;
- [ ] contatos de emergência criam/editam/removem corretamente;
- [ ] exclusão de conta exige `EXCLUIR` e bloqueia exclusão com corrida ativa;
- [ ] exclusão concluída encerra a sessão.

## Pagamentos e carteira do passageiro

- [ ] métodos exibidos correspondem aos gates do backend;
- [ ] PIX/cartão NÃO aparecem como disponíveis sem provedor de corrida homologado;
- [ ] Dinheiro continua selecionável quando ativo no backend;
- [ ] multa pendente bloqueia conforme política;
- [ ] geração de PIX de multa usa backend real;
- [ ] confirmação do provedor baixa a multa e atualiza a carteira sem reabrir o app;
- [ ] nenhuma tela marca pagamento eletrônico da corrida como pago sem webhook/settlement.

## Corrida ativa

- [ ] solicitar corrida cria exatamente uma corrida no backend;
- [ ] matar/reabrir durante busca recupera a corrida correta;
- [ ] aceite do motorista atualiza a tela por realtime/polling fallback;
- [ ] nome, veículo, placa e PIN correspondem ao backend;
- [ ] mapa permanece legível e enquadra a corrida;
- [ ] chegada do motorista atualiza sem tela piscando;
- [ ] após chegada, cancelamento respeita a política configurada;
- [ ] início por PIN atualiza para `em_viagem`;
- [ ] background/foreground mantém a corrida;
- [ ] tela bloqueada/desbloqueada recupera o estado;
- [ ] perda e retorno de rede recuperam estado sem duplicar ações;
- [ ] modo de economia de bateria não perde a corrida de forma definitiva.

## Segurança e compartilhamento

- [ ] botão SOS registra alerta real no backend;
- [ ] SOS inclui localização quando disponível;
- [ ] SOS continua registrável com localização indisponível;
- [ ] 190 abre discador com 190;
- [ ] 192 abre discador com 192;
- [ ] compartilhar corrida cria token somente após ação do passageiro;
- [ ] URL compartilhada usa token imprevisível, nunca `ride_id` público;
- [ ] link abre acompanhamento sem autenticação e sem PII desnecessária;
- [ ] link expira;
- [ ] "Encerrar compartilhamento" invalida imediatamente o link anterior.

## Finalização, avaliação e recibo

- [ ] finalização pelo motorista muda a corrida para `finalizada`;
- [ ] Passageiro não define `final_price`;
- [ ] tela concluída apresenta avaliação do motorista;
- [ ] avaliação 1–5 persiste uma única vez;
- [ ] recibo é carregado pelo RPC server-side;
- [ ] recibo mostra o `ride_settlement` canônico quando existente;
- [ ] PIX pendente aparece como pendente, não como pago;
- [ ] valores financeiros não consolidados não são inventados;
- [ ] compartilhar comprovante funciona;
- [ ] imprimir/PDF funciona no ambiente suportado;
- [ ] histórico reabre o mesmo comprovante após matar o app.

## Critério de saída da FASE 6

FASE 6 só pode ser marcada como homologada quando:

1. CI/build estão verdes;
2. todos os itens críticos acima passam em aparelho físico;
3. não existe erro fatal ou loop de sessão/realtime;
4. nenhuma integração financeira é simulada como real;
5. PR #7 continua sem merge até o aceite final.
