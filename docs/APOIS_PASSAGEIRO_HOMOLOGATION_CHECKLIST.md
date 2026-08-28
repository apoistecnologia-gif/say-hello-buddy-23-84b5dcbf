# APOIS Passageiro — Roteiro de Homologação

**Aplicativo:** APOIS Passageiro  
**Pacote Android:** `com.apois.passageiro`  
**Backend:** Supabase APOIS Produção (`vqtucstyduxrqjgyigfk`)  
**Firebase:** `movi-4d041`  
**Documento:** versão 2026-08-06

> Este roteiro deve ser executado em aparelho físico. Cada item deve receber `APROVADO`, `REPROVADO` ou `NÃO TESTADO`, acompanhado de print, vídeo curto ou protocolo quando aplicável.

## 1. Pré-condições

- [ ] Instalar o APK mais recente gerado pela branch `feat/apois-passageiro-completo`.
- [ ] Confirmar que o aplicativo exibido no aparelho se chama **APOIS Passageiro**.
- [ ] Confirmar que o ícone instalado pertence à marca APOIS e não mostra MOVVI nem o ícone padrão do Capacitor.
- [ ] Confirmar que o aparelho possui internet móvel ou Wi-Fi estável.
- [ ] Ativar GPS e precisão de localização.
- [ ] Remover contas de teste antigas quando elas impedirem o cadastro com o mesmo e-mail.
- [ ] Manter acesso ao e-mail usado no cadastro.
- [ ] Confirmar no Supabase que as Edge Functions essenciais estão `ACTIVE`.
- [ ] Confirmar a presença dos segredos, sem expor valores:
  - `ALLOWED_ORIGINS`
  - `GOOGLE_MAPS_PLATFORM_API_KEY`
  - `FIREBASE_SERVICE_ACCOUNT_B64`
  - `MERCADOPAGO_ACCESS_TOKEN`
  - `MERCADOPAGO_WEBHOOK_SECRET`

## 2. Instalação e primeira abertura

- [ ] O APK instala sem conflito de assinatura ou pacote.
- [ ] A tela inicial não mostra tela branca, erro do Capacitor ou conteúdo do MOVVI.
- [ ] A marca APOIS aparece corretamente.
- [ ] O conteúdo respeita área da câmera, barra de status e botões de navegação do Android.
- [ ] O teclado não cobre campos e botões importantes.
- [ ] Fechar e abrir o aplicativo não causa loop de carregamento.

## 3. Documentos legais

- [ ] Em `/cadastro`, **Termos de Uso** abre a página pública correta.
- [ ] **Política de Privacidade** abre a página pública correta.
- [ ] As páginas podem ser lidas sem conta e também com sessão ativa.
- [ ] O botão de voltar retorna ao cadastro.
- [ ] Os documentos exibem a empresa, CNPJ, data e versão.
- [ ] Não é possível criar conta sem marcar o aceite.
- [ ] Após o cadastro, conferir no banco:
  - `terms_accepted_at`
  - `terms_version = 2026-08-06`
  - `privacy_accepted_at`
  - `privacy_version = 2026-08-06`
  - `legal_acceptance_source = passenger_signup`

## 4. Cadastro e confirmação de e-mail

- [ ] Nome incompleto é recusado com mensagem clara.
- [ ] E-mail inválido é recusado.
- [ ] Telefone inválido é recusado.
- [ ] Senha com menos de 8 caracteres é recusada.
- [ ] Senha sem letras ou sem números é recusada.
- [ ] Senhas diferentes são recusadas.
- [ ] Cadastro válido cria apenas uma conta no Auth.
- [ ] O perfil operacional é criado em `public.users`.
- [ ] O papel `passenger` é criado em `public.user_roles`.
- [ ] A carteira é criada em `public.passenger_wallets`.
- [ ] As preferências são criadas em `public.user_notification_preferences`.
- [ ] O usuário do app não é criado como `reader` na tabela institucional do site.
- [ ] O e-mail de confirmação chega.
- [ ] Reenviar confirmação funciona sem criar outra conta.
- [ ] Após confirmar o e-mail, o login é aceito.

## 5. Login, sessão e recuperação de senha

- [ ] Login com senha correta abre `/inicio`.
- [ ] Senha incorreta mostra mensagem segura, sem revelar detalhes internos.
- [ ] A sessão permanece após fechar e abrir o app.
- [ ] Sair encerra a sessão e retorna ao login.
- [ ] Entrar novamente reinicia o registro de notificações.
- [ ] Recuperação de senha envia e-mail para o endereço correto.
- [ ] O link não aponta para `localhost` sem tratamento.
- [ ] A redefinição de senha conclui e permite novo login.
- [ ] Muitas tentativas seguidas exibem tratamento de limite, sem travar a tela.

## 6. Permissões do aparelho

### Localização

- [ ] Primeira solicitação de localização aparece no momento adequado.
- [ ] Ao permitir, a posição real é carregada.
- [ ] Ao negar, o app mostra estado explicativo e botão de recuperação.
- [ ] Ao bloquear permanentemente, o app orienta abrir as configurações.
- [ ] Retornar das configurações permite verificar novamente.
- [ ] GPS desligado não causa tela branca nem localização inventada.

### Notificações

- [ ] Em Android 13 ou superior, a permissão de notificações é solicitada.
- [ ] Ao permitir, um token ativo é salvo em `user_notification_tokens`.
- [ ] Ao negar, o app informa o estado sem insistência abusiva.
- [ ] Reativar nas configurações e voltar ao app registra o token.
- [ ] O canal Android usado é `apois_rides`.

## 7. Tela inicial e mapa

- [ ] O mapa carrega com a posição real do passageiro.
- [ ] Não aparece marca, texto ou pacote MOVVI.
- [ ] O mapa não expõe a chave do backend.
- [ ] Endereço atual é exibido quando resolvido.
- [ ] Falha do mapa possui mensagem e possibilidade de nova tentativa.
- [ ] Internet lenta mostra carregamento, não tela congelada.
- [ ] O botão de localização centraliza o mapa.
- [ ] A navegação inferior não cobre controles ou conteúdo.

## 8. Busca de destino

- [ ] Buscar por texto retorna lugares relevantes.
- [ ] Selecionar no mapa funciona.
- [ ] Casa, Trabalho e favoritos são isolados por usuário.
- [ ] Recentes são isolados por usuário e limitados a 20.
- [ ] Local inválido não fecha a tela como se tivesse sido aceito.
- [ ] Origem e destino iguais são recusados.
- [ ] Retornar à tela anterior preserva o destino confirmado.

## 9. Paradas intermediárias

- [ ] É possível incluir até 3 paradas.
- [ ] A quarta parada é bloqueada com aviso.
- [ ] Parada igual ao destino é recusada.
- [ ] Parada repetida é recusada.
- [ ] Reordenar paradas atualiza a rota.
- [ ] **Salvar paradas** mantém as alterações.
- [ ] **Descartar** restaura o estado anterior.
- [ ] Fechar sem salvar não aplica alterações silenciosamente.

## 10. Cálculo de rota

- [ ] A chamada chega a `passenger-routes-compute` com JWT válido.
- [ ] A Routes API retorna distância real.
- [ ] A duração real é retornada.
- [ ] A polyline é desenhada no mapa.
- [ ] Até três paradas são consideradas na ordem correta.
- [ ] Coordenadas inválidas são recusadas.
- [ ] Falha do Google retorna mensagem controlada.
- [ ] Nenhuma rota ou duração é inventada localmente.
- [ ] O servidor não expõe detalhes da chave Google ao aplicativo.

## 11. Categorias e preços

Testar individualmente:

- [ ] Carro
- [ ] Moto
- [ ] Fretes e Mudanças
- [ ] Guincho
- [ ] Envios

Para cada categoria:

- [ ] A categoria ativa aparece uma única vez.
- [ ] Distância e duração usadas são as retornadas pelo servidor.
- [ ] Tarifa mínima é respeitada.
- [ ] Valor por km e por minuto é aplicado corretamente.
- [ ] Paradas adicionais entram no cálculo quando houver tarifa.
- [ ] Detalhes especiais da categoria são validados.
- [ ] O valor mostrado na revisão coincide com o calculado pelo backend.
- [ ] O frontend não consegue substituir o preço do servidor.
- [ ] Não aparece “Taxa da plataforma R$ 0,00” sem necessidade.
- [ ] Nenhum cupom demonstrativo aparece.

## 12. Formas de pagamento

- [ ] Apenas métodos ativos no banco aparecem.
- [ ] Pix aparece somente quando disponível para a corrida.
- [ ] Crédito e débito não aparecem como funcionais sem integração real correspondente.
- [ ] Dinheiro funciona conforme regra configurada.
- [ ] Carteira mostra saldo real disponível.
- [ ] Saldo insuficiente impede a confirmação.
- [ ] Método desativado deixa de permanecer selecionado.
- [ ] Erro ao carregar métodos possui botão de nova tentativa.

## 13. Revisão e solicitação da corrida

- [ ] Origem, destino, paradas, categoria, preço e pagamento estão corretos.
- [ ] Botão não habilita com dados incompletos.
- [ ] Duplo toque não cria duas corridas.
- [ ] A mesma `request_key` recupera a corrida criada.
- [ ] Perda de resposta de rede dispara recuperação automática.
- [ ] O banco impede duas corridas ativas do mesmo passageiro.
- [ ] A função `passenger-ride-request` calcula novamente rota e preço.
- [ ] O app abre a corrida criada.
- [ ] Sem motorista disponível, a busca expira de forma clara.

## 14. Busca e aceite do motorista

> Esta etapa completa depende do app do motorista ou de uma ferramenta administrativa de homologação que produza as mesmas transições autorizadas.

- [ ] A corrida entra em `procurar_motorista`.
- [ ] Somente motoristas online, aprovados, com assinatura ativa e localização recente são elegíveis.
- [ ] Motorista ocupado não recebe oferta.
- [ ] Categoria incompatível não recebe oferta.
- [ ] Motorista rejeitado não recebe novamente a mesma oferta indevidamente.
- [ ] O raio de busca aumenta progressivamente.
- [ ] O aceite grava o motorista interno correto na corrida.
- [ ] O passageiro recebe atualização em tempo real sem atualizar a tela.
- [ ] A notificação push de aceite chega.

## 15. Corrida ativa

### Motorista a caminho

- [ ] Nome, foto, veículo e placa vêm do banco.
- [ ] Placa vazia não aparece.
- [ ] A localização do motorista atualiza em tempo real.
- [ ] Não existe previsão genérica sem rota real.
- [ ] Ligar e enviar mensagem executam ações reais.
- [ ] Compartilhar corrida gera acompanhamento protegido.

### Motorista chegou

- [ ] Estado muda para `motorista_chegou`.
- [ ] Notificação chega ao passageiro.
- [ ] PIN permanece visível até o início da viagem.
- [ ] PIN possui formato válido e não é exposto na página pública.
- [ ] Cancelamento pelo app fica bloqueado conforme a regra vigente.

### Em viagem

- [ ] Estado muda para `em_viagem` somente após validação adequada.
- [ ] PIN deixa de ser exibido após o embarque.
- [ ] Trajeto continua atualizando.
- [ ] Central de segurança permanece acessível.
- [ ] Polícia 190 e SAMU 192 abrem o discador correto.
- [ ] Contato de emergência e compartilhamento funcionam.

### Finalizada

- [ ] Estado muda para `finalizada`.
- [ ] Tela final não exibe PIN nem controles de emergência da corrida ativa.
- [ ] Valor, distância, duração, endereços e pagamento são reais.
- [ ] A avaliação aceita nota de 1 a 5.
- [ ] Comentário opcional é salvo.
- [ ] Enviar duas vezes não duplica a avaliação.
- [ ] A média do motorista é atualizada.

## 16. Cancelamento e multa

### Dentro do prazo gratuito

- [ ] Cronômetro usa `ride.created_at` real.
- [ ] Antes do fim do prazo, o app informa cancelamento gratuito.
- [ ] Cancelar altera a corrida apenas uma vez.
- [ ] Nenhuma multa é criada.

### Depois do prazo gratuito

- [ ] O valor da multa é exibido antes da confirmação.
- [ ] Confirmar cria uma única multa.
- [ ] A carteira fica bloqueada.
- [ ] Nova corrida é impedida enquanto houver dívida.
- [ ] Cancelar o modal não cancela a corrida.

### Após chegada ou início

- [ ] Cancelamento comum é bloqueado depois da chegada do motorista.
- [ ] Cancelamento em viagem não é executado pelo botão comum.
- [ ] A mensagem orienta suporte/segurança quando necessário.

## 17. Pix da multa — ambiente de teste

- [ ] `create-cancellation-fee-charge` cria uma order na Orders API.
- [ ] A resposta contém `orderId` no formato esperado.
- [ ] QR Code copia corretamente.
- [ ] QR Code visual é exibido quando disponível.
- [ ] Link de pagamento abre quando fornecido.
- [ ] Solicitar novamente reutiliza Pix ainda válido.
- [ ] O webhook recebe `type=order`.
- [ ] A assinatura `x-signature` é validada.
- [ ] Evento repetido é tratado como duplicado.
- [ ] Valor diferente da multa é recusado.
- [ ] Order paga liquida a multa apenas uma vez.
- [ ] A carteira desbloqueia somente quando não houver outras multas.
- [ ] Estorno ou chargeback volta a bloquear a carteira.
- [ ] O passageiro recebe notificação do pagamento.

## 18. Notificações e central de avisos

- [ ] Token do Firebase pertence ao projeto `movi-4d041`.
- [ ] Push chega com o aplicativo aberto.
- [ ] Push chega com o aplicativo em segundo plano.
- [ ] Tocar na notificação abre a tela correta.
- [ ] Corrida aceita, motorista chegou, viagem iniciada e finalizada geram eventos.
- [ ] Multa criada, paga e estornada geram eventos.
- [ ] Preferência desativada é respeitada.
- [ ] Token rejeitado pelo FCM é desativado.
- [ ] Caixa de notificações lista dados reais.
- [ ] Marcar uma ou todas como lidas funciona.
- [ ] Notificação abre corrida, histórico, carteira ou perfil conforme o tipo.

## 19. Carteira

- [ ] Saldo e saldo disponível vêm do banco.
- [ ] Multas pendentes aparecem uma única vez.
- [ ] Realtime atualiza pagamento sem recarregar a página.
- [ ] Polling de 8 segundos funciona enquanto bloqueada.
- [ ] Voltar ao app e recuperar internet força atualização.
- [ ] Polling para quando a carteira desbloqueia.
- [ ] Estado vazio não inventa saldo ou movimentação.

## 20. Histórico e comprovante

- [ ] Lista somente corridas do passageiro autenticado.
- [ ] Datas e valores são dinâmicos.
- [ ] Abrir detalhes funciona.
- [ ] Compartilhar ou copiar comprovante funciona.
- [ ] Avaliar depois da corrida funciona quando ainda não avaliada.
- [ ] Repetir corrida restaura destino, até 3 paradas, categoria e pagamento.
- [ ] Repetir não cria a corrida automaticamente antes da revisão.
- [ ] Botão de repetir possui proteção contra toques repetidos.

## 21. Perfil e preferências

- [ ] Nome, telefone, cidade, nascimento e gênero carregam do banco.
- [ ] E-mail e CPF permanecem somente leitura.
- [ ] Nota só aparece quando houver avaliações reais.
- [ ] Não aparece nota fictícia 5,0.
- [ ] Total de corridas concluídas está correto.
- [ ] Preferências de corrida, pagamento, segurança e promoções são salvas.
- [ ] Texto maior altera a interface e permanece após reabrir.
- [ ] Até 3 contatos de emergência podem ser criados.
- [ ] Editar, excluir e definir contato principal funciona.
- [ ] Redefinir senha envia e-mail válido.
- [ ] Sair funciona.

## 22. Atendimento

- [ ] Abrir chamado de corrida funciona.
- [ ] Abrir chamado de pagamento/carteira funciona.
- [ ] Abrir chamado de conta funciona.
- [ ] Abrir chamado de segurança recebe prioridade alta.
- [ ] Assunto e mensagem inválidos são recusados.
- [ ] Corrida opcional aceita apenas UUID válido.
- [ ] Protocolo real é retornado.
- [ ] Confirmação aparece na caixa de notificações.

## 23. Exclusão da conta

- [ ] A confirmação exige o texto exato `EXCLUIR`.
- [ ] Corrida ativa impede exclusão.
- [ ] Solicitação é registrada em `account_deletion_requests`.
- [ ] Dados pessoais auxiliares são removidos.
- [ ] Perfil é anonimizado quando a preservação é necessária.
- [ ] Registros financeiros e de corrida exigidos permanecem anonimizados.
- [ ] Usuário é removido do Auth.
- [ ] A sessão é encerrada.
- [ ] Novo login com a conta excluída não funciona.

## 24. Rede, erros e recuperação

- [ ] Abrir sem internet exibe estado controlado.
- [ ] Recuperar internet permite reconectar.
- [ ] Timeout do backend não cria corrida duplicada.
- [ ] Erro 401 encerra ou recupera sessão corretamente.
- [ ] Erro 403 mostra bloqueio ou suspensão real.
- [ ] Erro 500 não expõe SQL, chave, token ou stack trace.
- [ ] Realtime desconectado volta a assinar ao reconectar.
- [ ] Fechar durante corrida e reabrir recupera a corrida ativa.
- [ ] Tela não permanece em carregamento infinito.

## 25. Acessibilidade e usabilidade

- [ ] Botões possuem área de toque adequada.
- [ ] Elementos importantes possuem nome acessível.
- [ ] Foco do teclado é visível.
- [ ] Contraste é legível no tema preto e dourado.
- [ ] Texto maior não corta conteúdo crítico.
- [ ] Leitor de tela anuncia carregamento, erros e ações essenciais.
- [ ] Animações não impedem o uso em aparelho mais lento.
- [ ] Bottom navigation não cobre conteúdo em diferentes tamanhos de tela.

## 26. Segurança mínima de lançamento

- [ ] APK não contém service role do Supabase.
- [ ] APK não contém JSON da conta de serviço Firebase.
- [ ] Chave da Routes API permanece somente no segredo do backend.
- [ ] Chave do mapa Android possui restrição apropriada antes da produção.
- [ ] Token do Mercado Pago permanece somente no backend.
- [ ] Webhook permanece público apenas porque valida assinatura HMAC.
- [ ] Tabelas privadas mantêm RLS ativa.
- [ ] Página pública de acompanhamento não mostra telefone, pagamento ou PIN.
- [ ] Logs não registram senha, token, chave privada ou QR Code completo desnecessariamente.
- [ ] Backup Android permanece desativado.
- [ ] Tráfego HTTP não criptografado permanece bloqueado.

## 27. Critério de aprovação

O APK só pode ser considerado pronto para publicação quando:

1. Não houver falha P0 ou P1 aberta.
2. Cadastro, login, rota, preço e solicitação funcionarem em aparelho físico.
3. Uma corrida completa for executada com motorista de homologação.
4. Cancelamento gratuito e cancelamento com multa forem comprovados.
5. Pix de teste for criado e confirmado por webhook real.
6. Push for recebido em primeiro e segundo plano.
7. Reabertura recuperar a corrida ativa.
8. TypeScript, lint crítico, build web, Capacitor e Gradle passarem no mesmo commit.
9. O APK testado for exatamente o artefato do commit aprovado.
10. Termos, Política de Privacidade e dados da empresa forem revisados antes do lançamento público.

## 28. Registro de evidências

| Data/hora | Versão/commit | Aparelho | Etapa | Resultado | Evidência/protocolo | Observação |
|---|---|---|---|---|---|---|
|  |  | Infinix Note 50/50X |  |  |  |  |

## 29. Defeitos encontrados

| ID | Severidade | Tela/fluxo | Passos para reproduzir | Resultado atual | Resultado esperado | Status |
|---|---|---|---|---|---|---|
|  |  |  |  |  |  |  |
