# APOIS Passageiro — Plano de implementação completo

## Objetivo

Entregar o aplicativo APOIS Passageiro completo, funcional e visualmente fiel às telas de referência aprovadas, mantendo o GitHub como fonte de verdade. O Lovable não será usado para executar alterações nesta fase.

## Princípios obrigatórios

1. Aparência e funcionamento caminham juntos: nenhuma tela será tratada como pronta apenas por estar bonita.
2. Dados de motorista, veículo, endereços, preços, distância, tempo, PIN e pagamentos serão dinâmicos.
3. Nenhum saldo, corrida, motorista, cupom ou benefício fictício será exibido em produção.
4. Toda ação visível precisa ter comportamento real, estado de carregamento, sucesso, vazio e erro.
5. A jornada deve sobreviver a fechamento do app, hard reload, perda breve de rede e retomada da sessão.
6. Android é a plataforma principal; safe areas, teclado, permissões e navegação devem ser tratados corretamente.
7. Segredos nunca serão gravados no repositório.
8. Alterações serão feitas em lotes controlados na branch `feat/apois-passageiro-completo`.
9. Cada lote deve preservar autenticação, banco e jornadas já funcionais.
10. A homologação final em notebook e celulares será feita com o proprietário do projeto após a conclusão do código.

## Fonte visual oficial

As telas de referência aprovadas definem:

- fundo preto e superfícies em carvão;
- dourado/amarelo como cor de ação e destaque;
- cartões arredondados e alto contraste;
- mapas em tema escuro;
- tipografia clara, hierarquia forte e pouco ruído;
- navegação inferior estável e sem sobreposição;
- mapa como elemento principal nas etapas de corrida.

As referências não serão copiadas cegamente. Informações repetidas, incompatíveis com o estágio da corrida ou sem função real serão corrigidas durante a implementação.

## Jornada funcional obrigatória

### 1. Entrada e conta

- Splash e boas-vindas.
- Login.
- Cadastro de passageiro.
- Recuperação de senha.
- Persistência de sessão.
- Perfil criado no backend.
- Logout seguro.

### 2. Home, mapa e destino

- Localização atual com permissões e erros amigáveis.
- Mapa real em web e Android.
- Busca de endereços com sugestões.
- Escolha de destino pelo mapa.
- Casa, Trabalho, favoritos e recentes.
- Até três paradas intermediárias.
- Retomada do estado após navegação ou reabertura.

### 3. Rota, categoria e preço

- Origem, paradas e destino.
- Distância, duração e polyline reais.
- Categorias: Carro, Moto, Fretes e Mudanças, Guincho e Envios.
- Regras tarifárias reais por categoria.
- Formulários específicos para serviços especiais.
- Estados de indisponibilidade e recálculo.

### 4. Pagamento e revisão

- Pix, cartão, dinheiro e carteira conforme disponibilidade real.
- Resumo integral antes da confirmação.
- Avisos de preço estimado e possíveis ajustes.
- Cupons apenas quando houver backend funcional.
- Proteção contra solicitação duplicada.

### 5. Solicitação e busca de motorista

- Criação idempotente da corrida.
- Estado procurando motorista.
- Cancelamento dentro das regras.
- Atualização em tempo real.
- Tratamento de timeout e ausência de motoristas.

### 6. Motorista encontrado e embarque

- Dados reais do motorista e veículo.
- Avaliação, placa, modelo e foto.
- Localização do motorista em tempo real.
- Mensagem e ligação.
- Compartilhar corrida.
- PIN exibido apenas no estágio apropriado.
- Estado motorista chegando e motorista chegou.

### 7. Corrida em andamento

- Rota até o destino.
- Tempo e distância restantes.
- Atualizações de status em tempo real.
- Segurança e emergência.
- Recuperação automática ao reabrir o app.
- Cancelamento bloqueado quando as regras determinarem.

### 8. Conclusão

- Tela de corrida finalizada sem elementos incompatíveis com o estágio.
- Resumo, valor e forma de pagamento reais.
- Avaliação do motorista.
- Recibo.
- Repetir corrida.
- Registro no histórico.

### 9. Conta e suporte

- Histórico e detalhes das corridas.
- Carteira, débitos e multas.
- Pagamento de multa e desbloqueio automático.
- Notificações.
- Perfil e dados pessoais.
- Configurações, privacidade e segurança.
- Ajuda e suporte.

## Regras de cancelamento

- Janela de até dois minutos para cancelamento sem multa, conforme regra vigente.
- Valor da multa informado antes da confirmação.
- Passageiro não cancela após o motorista chegar quando a regra impedir.
- Taxas configuráveis pelo painel/backend.
- Débito refletido na carteira e desbloqueio automático após pagamento confirmado.

## Qualidade de experiência

- Skeletons em carregamentos relevantes.
- Feedback imediato em botões.
- Prevenção de cliques duplicados.
- Estados vazios úteis.
- Textos legíveis e acessíveis.
- Animações discretas e rápidas.
- Sem sobreposição entre mapa, bottom sheet e navegação inferior.
- Compatibilidade com telas menores e safe areas.
- Mensagens sem jargão técnico para o usuário.

## Qualidade técnica por lote

Sempre que aplicável:

```bash
bun run typecheck
bun run build
bun run lint
npx cap sync android
```

Além disso:

- revisar erros do GitHub Actions;
- não esconder falhas com mocks silenciosos;
- não alterar migrations destrutivamente;
- manter RLS e autorização por usuário;
- documentar qualquer dependência externa que só possa ser validada no aparelho.

## Ordem de execução

1. Auditoria do estado atual e inventário de jornadas.
2. Fundação visual e shell do aplicativo.
3. Autenticação e entrada.
4. Home, mapa, destino e favoritos.
5. Rota, categorias, preço e pagamento.
6. Solicitação e acompanhamento completo.
7. Finalização, avaliação, histórico e recibo.
8. Carteira, multas, notificações, perfil e suporte.
9. Android, permissões, persistência e recuperação.
10. Revisão final do código e preparação para instalação no notebook.
