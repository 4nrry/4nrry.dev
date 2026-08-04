/**
 * Single source for the FAQ: Faq.astro renders it and StructuredData.astro
 * marks it up as FAQPage. Keeping one list is the point — Google penalises
 * FAQ markup that does not match the visible text.
 */
export interface Faq {
  q: string;
  a: string;
}

export const faqs: Faq[] = [
  {
    q: 'Quanto custa?',
    a: 'Depende do tamanho. Uma página de apresentação é um projeto pequeno; um sistema sob medida é maior. O que eu garanto: proposta com preço fechado antes de começar, e você decide com calma. Orçamento não custa nada.',
  },
  {
    q: 'Em quanto tempo fica pronto?',
    a: 'Página de apresentação: dias, não meses. Sistema: depende do escopo, e o prazo vem por escrito na proposta, com entregas parciais pra você acompanhar.',
  },
  {
    q: 'E depois da entrega?',
    a: 'O projeto é seu: código, domínio e acessos no seu nome. Ofereço manutenção mensal pra quem quer alguém de confiança cuidando, mas você nunca fica refém.',
  },
  {
    q: 'Preciso entender de tecnologia?',
    a: 'Não. Você me explica o seu negócio, eu explico as opções em português claro, e você decide.',
  },
];
