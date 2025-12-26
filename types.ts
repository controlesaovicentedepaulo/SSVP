
export interface Family {
  id: string;
  ficha: string;
  dataCadastro: string;
  nomeAssistido: string;
  estadoCivil: string;
  nascimento: string;
  idade: number;
  endereco: string;
  bairro: string;
  telefone: string;
  whatsapp: boolean;
  cpf: string;
  rg: string;
  filhos: boolean;
  filhosCount: number;
  moradoresCount: number;
  renda: string;
  comorbidade: string;
  situacaoImovel: string;
  observacao: string;
  status: 'Ativo' | 'Inativo' | 'Pendente';
  ocupacao?: string;
  observacaoOcupacao?: string;
}

export interface Member {
  id: string;
  familyId: string;
  nome: string;
  parentesco: string;
  nascimento: string;
  idade: number;
  ocupacao?: string;
  observacaoOcupacao?: string;
  renda?: string;
  comorbidade?: string;
  escolaridade?: string;
  trabalho?: string;
}

export interface Visit {
  id: string;
  familyId: string;
  data: string;
  vicentinos: string[];
  relato: string;
  motivo?: string;
  necessidadesIdentificadas: string[];
}

export interface Delivery {
  id: string;
  familyId: string;
  data: string;
  tipo: string;
  responsavel: string;
  observacoes?: string;
  status?: 'Entregue' | 'Não Entregue';
  retiradoPor?: 'Próprio' | 'Outros';
  retiradoPorDetalhe?: string;
}

export interface UserProfile {
  name: string;
  initials: string;
  conference: string;
}

// Definição da interface AppSettings para configurações do banco de dados
export interface AppSettings {
  supabaseUrl: string;
  supabaseKey: string;
}

export type AppView = 'dashboard' | 'families' | 'family-details' | 'visits' | 'deliveries' | 'settings';
