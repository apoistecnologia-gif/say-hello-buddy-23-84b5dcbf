export type LegalSection = {
  title: string;
  paragraphs?: string[];
  bullets?: string[];
};

export const TERMS_VERSION = "2026-08-06";
export const PRIVACY_VERSION = "2026-08-06";
export const LEGAL_UPDATED_AT = "6 de agosto de 2026";

export const COMPANY = {
  legalName: "APOIS TECNOLOGIA E MOBILIDADE LTDA",
  tradeName: "APOIS",
  cnpj: "68.290.710/0001-37",
  address: "Rua Quinze, nº 3, COHAB VI, Petrolina/PE, CEP 56.309-412",
  email: "franciellopes22@gmail.com",
} as const;

export const termsSections: LegalSection[] = [
  {
    title: "1. Quem somos e o que estes Termos regulam",
    paragraphs: [
      `${COMPANY.tradeName} é a plataforma tecnológica operada por ${COMPANY.legalName}, inscrita no CNPJ sob o nº ${COMPANY.cnpj}, com sede em ${COMPANY.address}.`,
      "Estes Termos regulam o cadastro e o uso do aplicativo APOIS Passageiro, inclusive a solicitação de corridas e de outros serviços de mobilidade disponibilizados pela plataforma.",
      "Ao criar uma conta, o usuário declara que leu e aceitou estes Termos e a Política de Privacidade. Quando a lei exigir consentimento específico para determinada finalidade, ele será solicitado separadamente.",
    ],
  },
  {
    title: "2. Natureza da plataforma",
    paragraphs: [
      "A APOIS fornece tecnologia para aproximar passageiros e motoristas parceiros independentes. O transporte é executado pelo motorista parceiro que aceita a solicitação, observadas as regras da plataforma e a legislação aplicável.",
      "A disponibilidade de motoristas, categorias, horários e áreas de atendimento varia conforme localização, demanda, condições operacionais e aprovação dos parceiros. A plataforma não garante que toda solicitação será aceita.",
    ],
  },
  {
    title: "3. Requisitos para usar o aplicativo",
    bullets: [
      "Ter 18 anos ou mais e capacidade para contratar.",
      "Fornecer dados verdadeiros, atuais e completos.",
      "Manter a senha e o dispositivo sob sua responsabilidade.",
      "Usar o serviço somente para finalidades lícitas e pessoais ou empresariais legítimas.",
      "Comunicar imediatamente suspeita de acesso não autorizado à conta.",
    ],
  },
  {
    title: "4. Cadastro, confirmação e segurança da conta",
    paragraphs: [
      "O cadastro pode exigir confirmação de e-mail, telefone, localização e outras verificações razoáveis de segurança. A APOIS poderá recusar, suspender ou solicitar nova verificação quando houver inconsistência, indício de fraude, risco à segurança ou descumprimento destes Termos.",
      "O usuário não deve criar contas falsas, emprestar a conta, manipular promoções, cadastrar meios de pagamento de terceiros sem autorização ou tentar contornar bloqueios da plataforma.",
    ],
  },
  {
    title: "5. Solicitação e execução dos serviços",
    paragraphs: [
      "Para solicitar um serviço, o usuário informa ou confirma o ponto de partida, destino, eventuais paradas, categoria, detalhes específicos e forma de pagamento disponível.",
      "Antes da confirmação, o aplicativo apresenta as informações essenciais disponíveis, incluindo estimativa de distância, duração e valor. O valor poderá ser recalculado quando houver alteração solicitada pelo usuário, paradas adicionais, mudança relevante de trajeto, espera, pedágios, serviços extras ou outra condição previamente informada.",
      "Após a aceitação, o aplicativo poderá exibir dados necessários do motorista e do veículo, acompanhamento de localização, canal de contato e PIN de segurança. O PIN deve ser informado apenas ao motorista correto e somente no momento do embarque.",
    ],
  },
  {
    title: "6. Categorias e informações especiais",
    paragraphs: [
      "A plataforma pode disponibilizar Carro, Moto, Fretes e Mudanças, Guincho, Envios e outras categorias. Cada categoria possui requisitos, limites e adicionais próprios apresentados no aplicativo.",
      "O usuário é responsável por descrever corretamente carga, peso, dimensões, necessidade de ajudantes, acesso ao local, condição do veículo a ser removido e demais informações relevantes. Omissões que alterem a execução poderão resultar em recusa, cancelamento ou cobrança de adicionais previamente previstos.",
    ],
  },
  {
    title: "7. Preços e formas de pagamento",
    paragraphs: [
      "Os preços são calculados pelo servidor da APOIS com base nas tarifas vigentes, distância, duração, categoria, paradas e serviços adicionais. A estimativa exibida no aparelho não substitui a validação do servidor.",
      "As formas de pagamento podem incluir Pix, cartão, dinheiro e carteira, conforme disponibilidade. Processadores de pagamento podem aplicar seus próprios termos e verificações.",
      "O usuário deve manter saldo suficiente quando escolher a carteira e é responsável por pagar valores devidos, inclusive ajustes legítimos e multas de cancelamento informadas no aplicativo.",
    ],
  },
  {
    title: "8. Cancelamentos, ausência e multas",
    paragraphs: [
      "O usuário pode cancelar uma solicitação enquanto o aplicativo permitir. A regra vigente, eventual período gratuito e valor da multa serão informados antes da confirmação do cancelamento.",
      "O cancelamento pode ser bloqueado depois que o motorista registrar chegada ao ponto de embarque ou em outras situações de segurança e execução já iniciada. Caso seja necessário encerrar o serviço, o usuário deverá usar os canais de atendimento e segurança disponíveis.",
      "Quando houver multa pendente, a carteira e novas solicitações poderão ficar bloqueadas até a confirmação do pagamento. O desbloqueio ocorre após a validação do provedor de pagamento e pode depender do processamento do webhook.",
    ],
  },
  {
    title: "9. Conduta e segurança",
    bullets: [
      "Tratar motoristas, passageiros adicionais e equipe de suporte com respeito.",
      "Não portar itens ilícitos, perigosos ou incompatíveis com a categoria contratada.",
      "Não solicitar direção perigosa, excesso de velocidade ou descumprimento das leis de trânsito.",
      "Não assediar, ameaçar, discriminar, agredir ou causar dano ao veículo ou a terceiros.",
      "Usar os recursos de emergência de forma responsável; em risco imediato, acionar diretamente os serviços públicos competentes.",
    ],
    paragraphs: [
      "A APOIS pode preservar registros relacionados a incidentes, cooperar com autoridades mediante base legal e adotar medidas de proteção de usuários e parceiros.",
    ],
  },
  {
    title: "10. Objetos, cargas e passageiros adicionais",
    paragraphs: [
      "O usuário é responsável pelos objetos e pessoas que leva consigo. Itens de alto valor, frágeis, perecíveis, perigosos ou proibidos devem respeitar a legislação e as condições específicas da categoria.",
      "Objetos esquecidos devem ser comunicados pelo suporte. A APOIS poderá facilitar o contato, mas não garante recuperação e não assume posse do item.",
    ],
  },
  {
    title: "11. Disponibilidade e limitações técnicas",
    paragraphs: [
      "O aplicativo depende de internet, GPS, serviços de mapas, notificações, provedores de pagamento, sistema operacional e infraestrutura de terceiros. Podem ocorrer indisponibilidades, atrasos, imprecisão de localização ou interrupções.",
      "A APOIS adota medidas razoáveis para continuidade e segurança, mas não garante operação ininterrupta. Sempre que possível, o aplicativo informará falhas e permitirá nova tentativa sem criar solicitações duplicadas.",
    ],
  },
  {
    title: "12. Suspensão e encerramento",
    paragraphs: [
      "A conta poderá ser limitada, suspensa ou encerrada em caso de fraude, risco à segurança, dívida, uso abusivo, ordem legal, violação destes Termos ou necessidade de proteção da plataforma.",
      "O usuário pode solicitar a exclusão da conta no próprio aplicativo. Registros necessários ao cumprimento de obrigações legais, exercício de direitos, prevenção a fraude e liquidação financeira poderão ser preservados pelo prazo aplicável, com anonimização quando possível.",
    ],
  },
  {
    title: "13. Propriedade intelectual",
    paragraphs: [
      "A marca APOIS, o aplicativo, identidade visual, software, textos, interfaces e demais conteúdos são protegidos. O uso da conta não transfere ao usuário qualquer direito de propriedade intelectual.",
      "É proibido copiar, desmontar, explorar vulnerabilidades, automatizar acesso não autorizado, remover avisos ou utilizar a plataforma para desenvolver serviço concorrente mediante extração indevida de dados.",
    ],
  },
  {
    title: "14. Responsabilidades",
    paragraphs: [
      "Cada parte responde pelos danos que causar por ação ou omissão, na forma da legislação aplicável. Nenhuma cláusula exclui direitos obrigatórios do consumidor nem responsabilidade que legalmente não possa ser afastada.",
      "Reclamações sobre cobrança, segurança, atendimento ou execução devem ser enviadas com informações suficientes para análise. A APOIS poderá solicitar comprovantes e registros relacionados ao caso.",
    ],
  },
  {
    title: "15. Comunicações e atualizações",
    paragraphs: [
      "A APOIS poderá enviar comunicações operacionais por aplicativo, push, e-mail ou telefone. Comunicações promocionais opcionais podem ser desativadas nas preferências, sem afetar avisos necessários ao serviço e à segurança.",
      "Estes Termos podem ser atualizados para refletir alterações legais, operacionais ou tecnológicas. Mudanças relevantes serão comunicadas com destaque e, quando necessário, dependerão de novo aceite.",
    ],
  },
  {
    title: "16. Legislação, solução de conflitos e contato",
    paragraphs: [
      "Aplica-se a legislação brasileira. O usuário consumidor preserva o direito de recorrer aos órgãos de proteção e ao foro competente previsto em lei, sem imposição de foro que reduza seus direitos.",
      `Dúvidas e solicitações podem ser encaminhadas para ${COMPANY.email}. Identifique o assunto e, quando aplicável, informe o protocolo, e-mail da conta e corrida relacionada.`,
    ],
  },
];

export const privacySections: LegalSection[] = [
  {
    title: "1. Controlador e alcance desta Política",
    paragraphs: [
      `${COMPANY.legalName}, CNPJ ${COMPANY.cnpj}, com sede em ${COMPANY.address}, é a controladora dos dados pessoais tratados no aplicativo APOIS Passageiro, ressalvadas situações em que um parceiro atue como controlador independente conforme a lei e seus próprios termos.`,
      "Esta Política explica quais dados são tratados, para quais finalidades, com quem podem ser compartilhados e como o titular exerce seus direitos.",
    ],
  },
  {
    title: "2. Dados que podemos tratar",
    bullets: [
      "Cadastro e contato: nome, e-mail, telefone, identificadores da conta e senha armazenada de forma protegida pelo serviço de autenticação.",
      "Perfil: foto, cidade, data de nascimento, gênero e outros dados fornecidos voluntariamente.",
      "Localização: coordenadas precisas, pontos de embarque e destino, paradas, trajetos e registros de atualização necessários ao serviço.",
      "Corridas: categoria, horários, distância, duração, preço, cancelamentos, PIN, avaliações, mensagens operacionais e incidentes.",
      "Dispositivo e segurança: modelo, sistema operacional, endereço IP, identificadores técnicos, token de push, logs, falhas e sinais de fraude.",
      "Pagamentos: método escolhido, valores, status, identificadores de transação, QR Code e registros de conciliação. Dados completos de cartão, quando habilitados, são processados pelo provedor de pagamento conforme sua própria política.",
      "Atendimento: protocolos, conteúdo das solicitações, anexos e histórico de solução.",
      "Contatos de emergência: nome, telefone, vínculo e indicação de contato principal, fornecidos pelo usuário sob sua responsabilidade.",
    ],
  },
  {
    title: "3. Como os dados são obtidos",
    paragraphs: [
      "Os dados podem ser fornecidos diretamente pelo usuário, gerados durante o uso do aplicativo, obtidos do dispositivo mediante permissão ou recebidos de motoristas parceiros, provedores de mapas, autenticação, pagamento, notificações e prevenção a fraude.",
      "Permissões de localização e notificações podem ser gerenciadas no aparelho. Algumas funcionalidades essenciais deixarão de funcionar quando a permissão necessária for negada.",
    ],
  },
  {
    title: "4. Finalidades e bases legais",
    bullets: [
      "Criar e proteger a conta, confirmar identidade e manter a sessão.",
      "Calcular rota, preço, disponibilidade e aproximar passageiro e motorista parceiro.",
      "Executar o contrato solicitado pelo usuário, acompanhar a corrida, processar pagamento e emitir registros.",
      "Prevenir fraude, abuso, duplicidade, incidentes e riscos à segurança.",
      "Cumprir obrigações legais, regulatórias, fiscais e ordens válidas de autoridades.",
      "Exercer direitos em processos e responder a reclamações.",
      "Aprimorar desempenho, acessibilidade, estabilidade e experiência da plataforma.",
      "Enviar comunicações operacionais e de segurança; promoções opcionais somente conforme preferência ou outra base legal aplicável.",
      "Proteger a vida e a integridade física do usuário ou de terceiros em situações de emergência.",
    ],
    paragraphs: [
      "Conforme a finalidade, o tratamento pode se apoiar na execução de contrato ou procedimentos preliminares, cumprimento de obrigação legal, exercício regular de direitos, legítimo interesse avaliado, proteção da vida, prevenção a fraude e consentimento quando exigido.",
    ],
  },
  {
    title: "5. Compartilhamento de dados",
    paragraphs: [
      "A APOIS compartilha somente os dados necessários para cada finalidade e aplica controles contratuais, técnicos e de acesso quando cabíveis.",
    ],
    bullets: [
      "Motoristas parceiros: informações necessárias para avaliar, aceitar e executar a solicitação, como ponto de embarque, destino, categoria, instruções e identificação operacional do passageiro.",
      "Supabase: autenticação, banco de dados, armazenamento, funções e atualizações em tempo real.",
      "Google Maps Platform: mapas, geocodificação, lugares, rotas, distância e duração.",
      "Google Firebase: entrega de notificações push e serviços técnicos do aplicativo Android.",
      "Mercado Pago: criação, processamento e confirmação de pagamentos habilitados, inclusive Pix de multas.",
      "Prestadores de suporte, segurança, auditoria e infraestrutura, estritamente conforme necessidade e autorização.",
      "Autoridades públicas, Poder Judiciário ou terceiros quando houver obrigação legal, ordem válida, emergência ou necessidade de exercício de direitos.",
      "Operações societárias legítimas, com preservação dos direitos dos titulares e comunicação quando exigida.",
    ],
  },
  {
    title: "6. Transferência e processamento internacional",
    paragraphs: [
      "Alguns fornecedores de tecnologia podem processar ou armazenar dados fora do Brasil. Nessas situações, a APOIS busca utilizar mecanismos e salvaguardas compatíveis com a legislação de proteção de dados e limita o compartilhamento ao necessário para o serviço.",
    ],
  },
  {
    title: "7. Retenção e eliminação",
    paragraphs: [
      "Os dados são mantidos enquanto necessários para prestar o serviço, manter a segurança, cumprir obrigações legais, resolver disputas e exercer direitos. Os prazos variam conforme a categoria do dado e a finalidade.",
      "Após o término do tratamento, os dados são eliminados ou anonimizados quando possível, salvo conservação autorizada ou exigida por lei. A exclusão da conta não apaga imediatamente registros financeiros, de corrida, antifraude ou de auditoria cuja preservação seja necessária.",
    ],
  },
  {
    title: "8. Segurança",
    paragraphs: [
      "A APOIS adota medidas técnicas e administrativas proporcionais aos riscos, incluindo controle de acesso, políticas de banco de dados, autenticação, criptografia em trânsito, segregação de segredos, registros de eventos e redução de dados expostos no aplicativo.",
      "Nenhum sistema é absolutamente invulnerável. Incidentes confirmados que possam causar risco ou dano relevante serão avaliados e comunicados aos titulares e à autoridade competente conforme a legislação aplicável.",
    ],
  },
  {
    title: "9. Direitos do titular",
    bullets: [
      "Confirmar a existência de tratamento e acessar os dados.",
      "Corrigir dados incompletos, inexatos ou desatualizados.",
      "Solicitar anonimização, bloqueio ou eliminação quando cabível.",
      "Solicitar portabilidade conforme regulamentação e viabilidade aplicável.",
      "Obter informações sobre compartilhamento e consequências de não fornecer dados.",
      "Revogar consentimento e solicitar eliminação dos dados tratados com essa base, observadas as exceções legais.",
      "Opor-se a tratamento irregular e solicitar revisão de decisões automatizadas quando aplicável.",
      "Peticionar perante a autoridade de proteção de dados e órgãos de defesa do consumidor.",
    ],
    paragraphs: [
      `As solicitações podem ser feitas pelo suporte do aplicativo ou pelo e-mail ${COMPANY.email}. A APOIS poderá confirmar a identidade do solicitante antes de responder, para proteger a conta e os dados.`,
    ],
  },
  {
    title: "10. Decisões e processos automatizados",
    paragraphs: [
      "A plataforma utiliza regras automatizadas para calcular preço, identificar corrida ativa, selecionar motoristas por proximidade e disponibilidade, detectar duplicidade e aplicar controles de segurança. O usuário pode contestar resultado que produza efeito relevante por meio do suporte, fornecendo informações para análise.",
    ],
  },
  {
    title: "11. Dados de terceiros e contatos de emergência",
    paragraphs: [
      "Ao cadastrar contato de emergência ou fornecer dados de outra pessoa, o usuário declara possuir autorização ou outra base legítima para fazê-lo e deve informar essa pessoa sobre o uso previsto. Esses dados não devem ser utilizados para marketing sem fundamento próprio.",
    ],
  },
  {
    title: "12. Crianças e adolescentes",
    paragraphs: [
      "O cadastro de passageiro é destinado a pessoas com 18 anos ou mais. Menores podem utilizar o transporte somente sob responsabilidade e acompanhamento permitido pela legislação e pelas regras aplicáveis, sem criar conta própria quando não possuírem capacidade para contratar.",
    ],
  },
  {
    title: "13. Armazenamento local e tecnologias do aplicativo",
    paragraphs: [
      "O aplicativo pode armazenar localmente sessão, preferências, endereços favoritos e recentes, estado de corrida e dados estritamente necessários para continuidade e desempenho. A limpeza dos dados do aplicativo ou desinstalação pode remover esse conteúdo local, mas não elimina automaticamente os registros mantidos no servidor.",
    ],
  },
  {
    title: "14. Alterações desta Política",
    paragraphs: [
      "Esta Política poderá ser atualizada para refletir mudanças legais, técnicas ou operacionais. Alterações relevantes serão comunicadas com destaque e, quando necessário, será solicitado novo aceite ou consentimento específico.",
    ],
  },
  {
    title: "15. Canal de privacidade",
    paragraphs: [
      `Contato do controlador: ${COMPANY.email}. Endereço: ${COMPANY.address}.`,
      "A mensagem deve indicar que se trata de assunto de privacidade e descrever a solicitação. Não envie senha, PIN de corrida, número completo de cartão ou chave privada por e-mail.",
    ],
  },
];
