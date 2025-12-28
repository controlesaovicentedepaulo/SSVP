
import React, { useState, useEffect, useRef } from 'react';
import { Plus, ChevronRight, Phone, MapPin, Calendar, User, FileText, Activity, Home, Heart, Trash2, Edit, Info, Users, Footprints, Package, Search, X, CreditCard, ShieldCheck, UserPlus, Briefcase, DollarSign, Activity as HealthIcon, Save, UserCheck, AlertTriangle, Download } from 'lucide-react';
import { Family, Member, Visit, Delivery } from '../types';
import { addFamily, updateFamily, deleteFamily, saveDb, getDb } from '../db';
import jsPDF from 'jspdf';

interface FamilyManagerProps {
  viewMode?: 'list' | 'details' | 'form';
  families?: Family[];
  family?: Family;
  members?: Member[];
  visits?: Visit[];
  deliveries?: Delivery[];
  onViewDetails?: (id: string) => void;
  onRefresh: () => void;
  initialEdit?: boolean;
  onCancelEdit?: () => void;
  onDelete?: () => void;
}

const FamilyManager: React.FC<FamilyManagerProps> = ({ 
  viewMode = 'list', 
  families = [], 
  family, 
  members = [], 
  visits = [], 
  deliveries = [],
  onViewDetails,
  onRefresh,
  initialEdit = false,
  onCancelEdit,
  onDelete
}) => {
  const [isAdding, setIsAdding] = useState(false);
  const [isEditing, setIsEditing] = useState(initialEdit);
  const [isAddMemberModalOpen, setIsAddMemberModalOpen] = useState(false);
  const [memberToDelete, setMemberToDelete] = useState<Member | null>(null);
  const [isDeleteFamilyModalOpen, setIsDeleteFamilyModalOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [nextFicha, setNextFicha] = useState('1');
  const [totalMoradores, setTotalMoradores] = useState(1);
  const [temRendaAssistido, setTemRendaAssistido] = useState(false);
  const [temComorbidadeAssistido, setTemComorbidadeAssistido] = useState(false);
  
  // Estados para o Modal de Adicionar Membro Avulso
  const [newMemberRendaVisible, setNewMemberRendaVisible] = useState(false);
  const [newMemberComorbidadeVisible, setNewMemberComorbidadeVisible] = useState(false);

  // Estados para controlar a visibilidade de campos condicionais de membros no form principal
  const [membrosRendaVisivel, setMembrosRendaVisivel] = useState<{ [key: number]: boolean }>({});
  const [membrosComorbidadeVisivel, setMembrosComorbidadeVisivel] = useState<{ [key: number]: boolean }>({});
  const [ocupacaoAssistidoValue, setOcupacaoAssistidoValue] = useState<string>('');
  const [ocupacoesMembros, setOcupacoesMembros] = useState<{ [key: number]: string }>({});
  const [cpfValue, setCpfValue] = useState<string>('');
  const [rgValue, setRgValue] = useState<string>('');
  const [telefoneValue, setTelefoneValue] = useState<string>('');
  const formRef = useRef<HTMLFormElement>(null);

  // Usar useMemo para criar uma string de dependência estável
  const familyKey = family ? `${family.id}-${family.ocupacao}-${family.renda}-${family.comorbidade}-${family.moradoresCount}` : '';
  const membersKey = members.map(m => `${m.id}:${m.ocupacao}:${m.renda}:${m.comorbidade}`).join('|');

  useEffect(() => {
    if ((isEditing || initialEdit) && family) {
      setTotalMoradores(family.moradoresCount || 1);
      setTemRendaAssistido(family.renda !== 'R$ 0,00' && family.renda !== '');
      setTemComorbidadeAssistido(family.comorbidade !== 'Não possui' && family.comorbidade !== '');
      
      const ocupacaoValue = family.ocupacao || members[0]?.ocupacao || '';
      setOcupacaoAssistidoValue(ocupacaoValue);
      
      // Inicializar CPF, RG e Telefone formatados
      setCpfValue(family.cpf || '');
      setRgValue(family.rg || '');
      setTelefoneValue(family.telefone || '');
      
      const rendaVis: { [key: number]: boolean } = {};
      const comoVis: { [key: number]: boolean } = {};
      const ocupacoes: { [key: number]: string } = {};
      members.forEach((m, idx) => {
        if (idx > 0) {
          rendaVis[idx] = m.renda !== 'R$ 0,00' && m.renda !== '';
          comoVis[idx] = m.comorbidade !== 'Não possui' && m.comorbidade !== '';
          ocupacoes[idx] = m.ocupacao || '';
        }
      });
      setMembrosRendaVisivel(rendaVis);
      setMembrosComorbidadeVisivel(comoVis);
      setOcupacoesMembros(ocupacoes);
    } else {
      setOcupacaoAssistidoValue('');
      setOcupacoesMembros({});
      setCpfValue('');
      setRgValue('');
      setTelefoneValue('');
    }
  }, [isEditing, initialEdit, familyKey, membersKey]);

  useEffect(() => {
    if (isAdding && families.length > 0) {
      const numbers = families.map(f => parseInt(f.ficha) || 0);
      const max = Math.max(...numbers);
      setNextFicha((max + 1).toString());
    } else if (isAdding) {
      setNextFicha('1');
    }
  }, [isAdding, families]);

  const formatCPF = (value: string): string => {
    // Remove tudo que não é número
    const numbers = value.replace(/\D/g, '');
    
    // Limita a 11 dígitos
    const limited = numbers.slice(0, 11);
    
    // Aplica a máscara
    if (limited.length <= 3) {
      return limited;
    } else if (limited.length <= 6) {
      return `${limited.slice(0, 3)}.${limited.slice(3)}`;
    } else if (limited.length <= 9) {
      return `${limited.slice(0, 3)}.${limited.slice(3, 6)}.${limited.slice(6)}`;
    } else {
      return `${limited.slice(0, 3)}.${limited.slice(3, 6)}.${limited.slice(6, 9)}-${limited.slice(9, 11)}`;
    }
  };

  const formatRG = (value: string): string => {
    // Remove tudo que não é número ou X
    const cleaned = value.replace(/[^\dXx]/g, '').toUpperCase();
    
    // Limita a 9 caracteres (8 dígitos + X no final, opcional)
    const limited = cleaned.slice(0, 9);
    
    // Aplica a máscara: XX.XXX.XXX-X
    if (limited.length <= 2) {
      return limited;
    } else if (limited.length <= 5) {
      return `${limited.slice(0, 2)}.${limited.slice(2)}`;
    } else if (limited.length <= 8) {
      return `${limited.slice(0, 2)}.${limited.slice(2, 5)}.${limited.slice(5)}`;
    } else {
      return `${limited.slice(0, 2)}.${limited.slice(2, 5)}.${limited.slice(5, 8)}-${limited.slice(8)}`;
    }
  };

  const handleCpfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatCPF(e.target.value);
    setCpfValue(formatted);
  };

  const handleRgChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatRG(e.target.value);
    setRgValue(formatted);
  };

  const formatPhone = (value: string): string => {
    // Remove tudo que não é número
    const numbers = value.replace(/\D/g, '');
    
    // Limita a 11 dígitos (celular) ou 10 dígitos (fixo)
    const limited = numbers.slice(0, 11);
    
    // Aplica a máscara
    if (limited.length <= 2) {
      return limited.length > 0 ? `(${limited}` : limited;
    } else if (limited.length <= 6) {
      return `(${limited.slice(0, 2)}) ${limited.slice(2)}`;
    } else if (limited.length <= 10) {
      // Telefone fixo: (XX) XXXX-XXXX
      return `(${limited.slice(0, 2)}) ${limited.slice(2, 6)}-${limited.slice(6)}`;
    } else {
      // Celular: (XX) XXXXX-XXXX
      return `(${limited.slice(0, 2)}) ${limited.slice(2, 7)}-${limited.slice(7, 11)}`;
    }
  };

  const handleTelefoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhone(e.target.value);
    setTelefoneValue(formatted);
  };

  // Função para resetar completamente o formulário
  const resetForm = () => {
    // Resetar estados
    setCpfValue('');
    setRgValue('');
    setTelefoneValue('');
    setOcupacaoAssistidoValue('');
    setOcupacoesMembros({});
    setTemRendaAssistido(false);
    setTemComorbidadeAssistido(false);
    setMembrosRendaVisivel({});
    setMembrosComorbidadeVisivel({});
    setTotalMoradores(1);
    
    // Resetar o formulário HTML
    if (formRef.current) {
      formRef.current.reset();
    }
  };

  const filteredFamilies = families.filter(f => 
    f.nomeAssistido.toLowerCase().includes(search.toLowerCase()) || 
    f.bairro.toLowerCase().includes(search.toLowerCase())
  );

  const OcupacaoOptions = () => (
    <>
      <option value="">Selecione...</option>
      <option value="Estudante">Estudante</option>
      <option value="Empregado">Empregado</option>
      <option value="Beneficiario">Beneficiário</option>
      <option value="Desempregado">Desempregado</option>
      <option value="Autônomo">Autônomo / Bico</option>
      <option value="Aposentado">Aposentado / Pensionista</option>
      <option value="Do Lar">Do Lar</option>
    </>
  );

  const handleMemberRendaChange = (idx: number, value: string) => {
    setMembrosRendaVisivel(prev => ({ ...prev, [idx]: value === 'Sim' }));
  };

  const handleMemberComorbidadeChange = (idx: number, value: string) => {
    setMembrosComorbidadeVisivel(prev => ({ ...prev, [idx]: value === 'Sim' }));
  };

  const handleConfirmRemoveMember = () => {
    if (!family || !memberToDelete) return;

    const db = getDb();
    
    // Remover membro
    db.members = db.members.filter(m => m.id !== memberToDelete.id);

    // Atualizar dados da família
    const famIndex = db.families.findIndex(f => f.id === family.id);
    if (famIndex !== -1) {
      db.families[famIndex].moradoresCount = Math.max(1, db.families[famIndex].moradoresCount - 1);
      
      // Se for filho, atualizar contagem de filhos
      if (memberToDelete.parentesco === 'Filho(a)') {
        db.families[famIndex].filhosCount = Math.max(0, db.families[famIndex].filhosCount - 1);
        db.families[famIndex].filhos = db.families[famIndex].filhosCount > 0;
      }
    }

    saveDb(db);
    setMemberToDelete(null);
    onRefresh();
  };

  const generatePDF = () => {
    if (!family) return;

    const doc = new jsPDF();
    let yPos = 20;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20;
    const contentWidth = pageWidth - (margin * 2);

    // Função auxiliar para adicionar nova página se necessário
    const checkNewPage = (requiredSpace: number = 15) => {
      if (yPos + requiredSpace > pageHeight - 30) {
        doc.addPage();
        yPos = 20;
        return true;
      }
      return false;
    };

    // Função para adicionar seção com fundo colorido
    const addSectionHeader = (title: string, color: [number, number, number] = [37, 99, 235]) => {
      checkNewPage(20);
      yPos += 5;
      
      // Retângulo de fundo
      doc.setFillColor(color[0], color[1], color[2]);
      doc.roundedRect(margin, yPos - 5, contentWidth, 10, 2, 2, 'F');
      
      // Texto do título
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text(title, margin + 5, yPos + 2);
      
      // Resetar cor do texto
      doc.setTextColor(0, 0, 0);
      yPos += 12;
    };

    // Header com logo e título
    doc.setFillColor(37, 99, 235); // Azul SSVP
    doc.roundedRect(margin, yPos, contentWidth, 25, 3, 3, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('SSVP BRASIL', margin + 5, yPos + 10);
    
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text('Sociedade de São Vicente de Paulo', margin + 5, yPos + 18);
    
    doc.setFontSize(10);
    doc.text('Perfil da Família Assistida', margin + 5, yPos + 24);
    
    doc.setTextColor(0, 0, 0);
    yPos += 35;

    // Informações principais em destaque
    checkNewPage(25);
    doc.setFillColor(241, 245, 249); // Cinza claro
    doc.roundedRect(margin, yPos, contentWidth, 20, 2, 2, 'F');
    
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(family.nomeAssistido, margin + 5, yPos + 8);
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text(`Ficha N° ${family.ficha} • Status: ${family.status || 'Ativo'}`, margin + 5, yPos + 15);
    doc.setTextColor(0, 0, 0);
    yPos += 25;

    // Dados do Assistido
    addSectionHeader('DADOS DO ASSISTIDO', [37, 99, 235]);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    
    const leftCol = margin + 5;
    const rightCol = margin + contentWidth / 2 + 5;
    let currentCol = leftCol;
    let colYPos = yPos;

    const assistidoData = [
      { label: 'Data de Cadastro', value: family.dataCadastro ? new Date(family.dataCadastro).toLocaleDateString('pt-BR') : 'Não informado' },
      { label: 'CPF', value: family.cpf || 'Não informado' },
      { label: 'RG', value: family.rg || 'Não informado' },
      { label: 'Data de Nascimento', value: family.nascimento ? new Date(family.nascimento).toLocaleDateString('pt-BR') : 'Não informado' },
      { label: 'Idade', value: `${family.idade} anos` },
      { label: 'Estado Civil', value: family.estadoCivil || 'Não informado' },
      { label: 'Telefone', value: family.telefone || 'Não informado' },
      { label: 'WhatsApp', value: family.whatsapp ? 'Sim' : 'Não' },
      { label: 'Endereço', value: family.endereco || 'Não informado', fullWidth: true },
      { label: 'Bairro', value: family.bairro || 'Não informado' },
      { label: 'Situação do Imóvel', value: family.situacaoImovel || 'Não informado' },
      { label: 'Renda', value: family.renda || 'R$ 0,00' },
      { label: 'Comorbidade', value: family.comorbidade || 'Não possui', fullWidth: true },
      { label: 'Total de Moradores', value: String(family.moradoresCount || 1) },
      { label: 'Filhos', value: `${family.filhos ? 'Sim' : 'Não'} ${family.filhosCount > 0 ? `(${family.filhosCount})` : ''}` },
    ];

    assistidoData.forEach((item, index) => {
      checkNewPage(8);
      
      if (item.fullWidth) {
        currentCol = leftCol;
        colYPos = yPos;
      }
      
      doc.setFont('helvetica', 'bold');
      doc.text(`${item.label}:`, currentCol, colYPos);
      doc.setFont('helvetica', 'normal');
      const valueLines = doc.splitTextToSize(item.value, contentWidth / 2 - 10);
      doc.text(valueLines[0], currentCol + 35, colYPos);
      
      if (item.fullWidth || index % 2 === 1) {
        yPos += 7;
        colYPos = yPos;
        currentCol = leftCol;
      } else {
        currentCol = rightCol;
      }
    });
    
    if (currentCol !== leftCol) yPos += 7;
    yPos += 5;

    if (family.observacao) {
      checkNewPage(20);
      yPos += 5;
      doc.setFillColor(254, 243, 199); // Amarelo claro
      doc.roundedRect(margin, yPos, contentWidth, 15, 2, 2, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('Observações Gerais:', margin + 5, yPos + 8);
      yPos += 12;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      const obsLines = doc.splitTextToSize(family.observacao, contentWidth - 10);
      obsLines.forEach((line: string) => {
        checkNewPage(6);
        doc.text(line, margin + 5, yPos);
        yPos += 6;
      });
      yPos += 5;
    }

    // Membros da Família
    if (members.length > 0) {
      addSectionHeader('MEMBROS DA FAMÍLIA', [16, 185, 129]);

      doc.setFontSize(9);
      members.forEach((member, index) => {
        checkNewPage(25);
        
        // Card do membro
        doc.setFillColor(240, 253, 250); // Verde muito claro
        doc.roundedRect(margin, yPos, contentWidth, 20, 2, 2, 'F');
        
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.text(`${index + 1}. ${member.nome}`, margin + 5, yPos + 8);
        
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.text(`${member.parentesco} • ${member.idade} anos`, margin + 5, yPos + 14);
        
        yPos += 22;
        
        // Detalhes do membro
        const memberDetails = [
          { label: 'Ocupação', value: member.ocupacao || 'Não informado' },
          { label: 'Renda', value: member.renda || 'R$ 0,00' },
          { label: 'Comorbidade', value: member.comorbidade || 'Não possui' },
        ];
        
        memberDetails.forEach(detail => {
          checkNewPage(6);
          doc.setFont('helvetica', 'bold');
          doc.text(`${detail.label}:`, margin + 10, yPos);
          doc.setFont('helvetica', 'normal');
          doc.text(detail.value, margin + 35, yPos);
          yPos += 6;
        });
        
        yPos += 3;
      });
    }

    // Histórico de Visitas
    if (visits.length > 0) {
      addSectionHeader('HISTÓRICO DE VISITAS', [16, 185, 129]);

      doc.setFontSize(9);
      visits.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime()).forEach((visit, index) => {
        checkNewPage(30);
        
        // Card da visita
        doc.setFillColor(240, 253, 250);
        doc.roundedRect(margin, yPos, contentWidth, 18, 2, 2, 'F');
        
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.text(`Visita ${index + 1}`, margin + 5, yPos + 7);
        
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.text(new Date(visit.data).toLocaleDateString('pt-BR'), margin + contentWidth - 50, yPos + 7);
        
        if (visit.motivo) {
          doc.setFontSize(8);
          doc.setTextColor(100, 100, 100);
          doc.text(visit.motivo, margin + 5, yPos + 14);
          doc.setTextColor(0, 0, 0);
        }
        
        yPos += 20;
        
        if (visit.vicentinos && visit.vicentinos.length > 0) {
          checkNewPage(6);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8);
          doc.text('Vicentinos presentes:', margin + 5, yPos);
          doc.setFont('helvetica', 'normal');
          doc.text(visit.vicentinos.join(', '), margin + 50, yPos);
          yPos += 6;
        }
        
        if (visit.relato) {
          checkNewPage(15);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8);
          doc.text('Relato:', margin + 5, yPos);
          yPos += 5;
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
          const relatoLines = doc.splitTextToSize(visit.relato, contentWidth - 10);
          relatoLines.forEach((line: string) => {
            checkNewPage(5);
            doc.text(line, margin + 5, yPos);
            yPos += 5;
          });
        }
        
        yPos += 5;
      });
    }

    // Histórico de Entregas
    if (deliveries.length > 0) {
      addSectionHeader('HISTÓRICO DE ENTREGAS', [249, 115, 22]);

      doc.setFontSize(9);
      deliveries.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime()).forEach((delivery, index) => {
        checkNewPage(30);
        
        // Card da entrega
        const statusColor = delivery.status === 'Entregue' ? [220, 252, 231] : [254, 226, 226];
        doc.setFillColor(statusColor[0], statusColor[1], statusColor[2]);
        doc.roundedRect(margin, yPos, contentWidth, 18, 2, 2, 'F');
        
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.text(`Entrega ${index + 1}`, margin + 5, yPos + 7);
        
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.text(new Date(delivery.data).toLocaleDateString('pt-BR'), margin + contentWidth - 50, yPos + 7);
        
        doc.setFontSize(8);
        doc.text(delivery.tipo || 'Não informado', margin + 5, yPos + 14);
        
        yPos += 20;
        
        const deliveryDetails = [
          { label: 'Status', value: delivery.status || 'Não informado' },
          { label: 'Responsável', value: delivery.responsavel || 'Não informado' },
        ];
        
        if (delivery.retiradoPor) {
          deliveryDetails.push({
            label: 'Retirado por',
            value: delivery.retiradoPor === 'Próprio' ? 'Próprio' : `Terceiros${delivery.retiradoPorDetalhe ? ` (${delivery.retiradoPorDetalhe})` : ''}`
          });
        }
        
        deliveryDetails.forEach(detail => {
          checkNewPage(6);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8);
          doc.text(`${detail.label}:`, margin + 5, yPos);
          doc.setFont('helvetica', 'normal');
          doc.text(detail.value, margin + 35, yPos);
          yPos += 6;
        });
        
        if (delivery.observacoes) {
          checkNewPage(10);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8);
          doc.text('Observações:', margin + 5, yPos);
          yPos += 5;
          doc.setFont('helvetica', 'normal');
          const obsLines = doc.splitTextToSize(delivery.observacoes, contentWidth - 10);
          obsLines.forEach((line: string) => {
            checkNewPage(5);
            doc.text(line, margin + 5, yPos);
            yPos += 5;
          });
        }
        
        yPos += 5;
      });
    }

    // Rodapé em todas as páginas
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      
      // Linha divisória
      doc.setDrawColor(200, 200, 200);
      doc.line(margin, pageHeight - 15, pageWidth - margin, pageHeight - 15);
      
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 100, 100);
      doc.text(
        `SSVP Brasil - Gerado em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`,
        margin,
        pageHeight - 8
      );
      doc.text(
        `Página ${i} de ${totalPages}`,
        pageWidth - margin - 30,
        pageHeight - 8,
        { align: 'right' }
      );
      doc.setTextColor(0, 0, 0);
    }

    // Salvar PDF
    doc.save(`Perfil_${family.nomeAssistido.replace(/\s+/g, '_')}_${family.ficha}.pdf`);
  };

  const handleQuickAddMember = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!family) return;

    const formData = new FormData(e.currentTarget);
    const possuiRenda = formData.get('possui_renda') === 'Sim';
    const possuiComorbidade = formData.get('possui_comorbidade') === 'Sim';

    const newMember: Member = {
      id: crypto.randomUUID(),
      familyId: family.id,
      nome: formData.get('nome') as string,
      idade: Number(formData.get('idade')),
      parentesco: formData.get('parentesco') as string,
      nascimento: '',
      ocupacao: formData.get('ocupacao') as string,
      observacaoOcupacao: formData.get('obs_ocupacao') as string,
      renda: possuiRenda ? (formData.get('renda_valor') as string) : 'R$ 0,00',
      comorbidade: possuiComorbidade ? (formData.get('comorbidade_detalhe') as string) : 'Não possui'
    };

    const db = getDb();
    db.members.push(newMember);
    
    // Atualizar contagem de moradores na família
    const famIndex = db.families.findIndex(f => f.id === family.id);
    if (famIndex !== -1) {
      db.families[famIndex].moradoresCount += 1;
      if (newMember.parentesco === 'Filho(a)') {
        db.families[famIndex].filhosCount += 1;
        db.families[famIndex].filhos = true;
      }
    }
    
    saveDb(db);
    setIsAddMemberModalOpen(false);
    setNewMemberRendaVisible(false);
    setNewMemberComorbidadeVisible(false);
    onRefresh();
  };

  if (isAdding || isEditing) {
    const targetFamily = isEditing ? family : null;
    const targetMembers = isEditing ? members : [];

    return (
      <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 animate-in fade-in zoom-in-95 duration-200 max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8 pb-4 border-b border-slate-100">
          <div>
            <h3 className="text-2xl font-bold text-slate-800">{isEditing ? 'Editar Cadastro' : 'Novo Cadastro SSVP'}</h3>
            <p className="text-slate-500 text-sm">Atualize os dados socioeconômicos da família e de seus membros.</p>
          </div>
          <button onClick={() => { setIsAdding(false); setIsEditing(false); resetForm(); onCancelEdit?.(); }} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-colors">
            <X size={24} />
          </button>
        </div>
        
        <form ref={formRef} className="space-y-10" onSubmit={(e) => {
          e.preventDefault();
          const formData = new FormData(e.currentTarget);
          const familyId = isEditing ? (family?.id || crypto.randomUUID()) : crypto.randomUUID();
          const nomeAssistido = formData.get('nome') as string;
          const idadeAssistido = Number(formData.get('idade_assistido'));
          
          // Usar o valor do estado controlado em vez do FormData
          const ocupacaoAssistido = ocupacaoAssistidoValue || (formData.get('ocupacao_assistido') as string);
          const formMembers: Member[] = [{
            id: isEditing ? (targetMembers[0]?.id || `${familyId}_head`) : `${familyId}_head`,
            familyId: familyId,
            nome: nomeAssistido,
            idade: idadeAssistido,
            parentesco: 'Próprio(a)',
            nascimento: formData.get('nascimento') as string,
            ocupacao: ocupacaoAssistido || undefined,
            observacaoOcupacao: (formData.get('obs_ocupacao_assistido') as string) || undefined,
            renda: temRendaAssistido ? (formData.get('renda_valor_assistido') as string) : 'R$ 0,00',
            comorbidade: temComorbidadeAssistido ? (formData.get('comorbidade_detalhe_assistido') as string) : 'Não possui'
          }];

          if (totalMoradores > 1) {
            for (let i = 1; i < totalMoradores; i++) {
              const nome = formData.get(`member_nome_${i}`) as string;
              if (nome) {
                const possuiRenda = formData.get(`member_possui_renda_${i}`) === 'Sim';
                const possuiComorbidade = formData.get(`member_possui_comorbidade_${i}`) === 'Sim';
                // Usar o valor do estado controlado em vez do FormData
                const ocupacaoMembro = ocupacoesMembros[i] || (formData.get(`member_ocupacao_${i}`) as string);
                const nascimentoValue = formData.get(`member_nascimento_${i}`) as string;
                // Calcular idade a partir da data de nascimento
                let idadeCalculada = 0;
                if (nascimentoValue) {
                  const nascimentoDate = new Date(nascimentoValue);
                  const hoje = new Date();
                  idadeCalculada = hoje.getFullYear() - nascimentoDate.getFullYear();
                  const mesDiff = hoje.getMonth() - nascimentoDate.getMonth();
                  if (mesDiff < 0 || (mesDiff === 0 && hoje.getDate() < nascimentoDate.getDate())) {
                    idadeCalculada--;
                  }
                }
                formMembers.push({
                  id: isEditing && targetMembers[i] ? targetMembers[i].id : `${familyId}_m_${i}`,
                  familyId: familyId,
                  nome: nome,
                  idade: idadeCalculada,
                  parentesco: formData.get(`member_parentesco_${i}`) as string,
                  nascimento: nascimentoValue || '',
                  ocupacao: ocupacaoMembro || undefined,
                  observacaoOcupacao: (formData.get(`member_obs_ocupacao_${i}`) as string) || undefined,
                  renda: possuiRenda ? (formData.get(`member_renda_valor_${i}`) as string) : 'R$ 0,00',
                  comorbidade: possuiComorbidade ? (formData.get(`member_comorbidade_detalhe_${i}`) as string) : 'Não possui'
                });
              }
            }
          }

          const savedFamily: Family = {
            id: familyId,
            ficha: formData.get('ficha') as string,
            dataCadastro: formData.get('dataCadastro') as string,
            nomeAssistido: nomeAssistido,
            estadoCivil: formData.get('estadoCivil') as string,
            nascimento: formData.get('nascimento') as string,
            idade: idadeAssistido,
            endereco: formData.get('endereco') as string,
            bairro: formData.get('bairro') as string,
            telefone: formData.get('telefone') as string,
            whatsapp: formData.get('whatsapp') === 'on',
            cpf: formData.get('cpf') as string,
            rg: formData.get('rg') as string,
            filhos: formMembers.length > 1,
            filhosCount: formMembers.filter(m => m.parentesco === 'Filho(a)').length,
            moradoresCount: totalMoradores,
            renda: temRendaAssistido ? (formData.get('renda_valor_assistido') as string) : 'R$ 0,00',
            comorbidade: temComorbidadeAssistido ? (formData.get('comorbidade_detalhe_assistido') as string) : 'Não possui',
            situacaoImovel: formData.get('imovel') as string,
            observacao: formData.get('obs') as string,
            status: formData.get('status') as 'Ativo' | 'Inativo' | 'Pendente',
            ocupacao: ocupacaoAssistido && ocupacaoAssistido.trim() ? ocupacaoAssistido.trim() : undefined,
            observacaoOcupacao: (formData.get('obs_ocupacao_assistido') as string)?.trim() || undefined
          };

          const db = getDb();
          if (isEditing) {
            const fIndex = db.families.findIndex(f => f.id === familyId);
            if (fIndex !== -1) db.families[fIndex] = savedFamily;
            db.members = db.members.filter(m => m.familyId !== familyId);
            db.members.push(...formMembers);
          } else {
            db.families.push(savedFamily);
            db.members.push(...formMembers);
          }
          
          saveDb(db);
          setIsAdding(false);
          setIsEditing(false);
          resetForm(); // Resetar formulário após salvar
          onRefresh();
          onCancelEdit?.();
        }}>
          
          <section className="space-y-4">
            <h4 className="flex items-center gap-2 text-blue-600 font-bold text-sm uppercase tracking-wider">
              <User size={16} /> 1. Dados do Assistido (Chefe de Família)
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700">Ficha N°</label>
                <input name="ficha" defaultValue={isEditing ? targetFamily?.ficha : nextFicha} required className="w-full px-4 py-2 bg-blue-50/50 border border-blue-100 rounded-lg font-bold text-blue-700 outline-none" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700">Data de Cadastro</label>
                <input 
                  name="dataCadastro" 
                  type="date" 
                  defaultValue={isEditing ? (targetFamily?.dataCadastro || new Date().toISOString().split('T')[0]) : new Date().toISOString().split('T')[0]} 
                  required 
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" 
                />
              </div>
              <div className="md:col-span-2 space-y-2">
                <label className="text-xs font-bold text-slate-700">Nome Completo</label>
                <input name="nome" defaultValue={isEditing ? targetFamily?.nomeAssistido : ''} required className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700">Data de Nascimento (Opcional)</label>
                <input name="nascimento" type="date" defaultValue={isEditing ? targetFamily?.nascimento : ''} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700">Idade Aproximada</label>
                <input name="idade_assistido" type="number" defaultValue={isEditing ? targetFamily?.idade : ''} required className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700">CPF (Opcional)</label>
                <input 
                  name="cpf" 
                  value={cpfValue} 
                  onChange={handleCpfChange}
                  placeholder="000.000.000-00" 
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" 
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700">RG (Opcional)</label>
                <input 
                  name="rg" 
                  value={rgValue} 
                  onChange={handleRgChange}
                  placeholder="00.000.000-0" 
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" 
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700">Ocupação Atual</label>
                <select 
                  name="ocupacao_assistido" 
                  value={ocupacaoAssistidoValue}
                  onChange={(e) => setOcupacaoAssistidoValue(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <OcupacaoOptions />
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700">Observação Ocupação</label>
                <input name="obs_ocupacao_assistido" defaultValue={isEditing ? (targetFamily?.observacaoOcupacao || targetMembers[0]?.observacaoOcupacao || '') : ''} placeholder="Ex: Vendedor de balas, BPC, etc" className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700">Possui Renda?</label>
                <select 
                  onChange={(e) => setTemRendaAssistido(e.target.value === 'Sim')}
                  value={temRendaAssistido ? 'Sim' : 'Não'}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="Não">Não</option>
                  <option value="Sim">Sim</option>
                </select>
              </div>
              {temRendaAssistido && (
                <div className="space-y-2 animate-in slide-in-from-top-2">
                  <label className="text-xs font-bold text-slate-700">Valor da Renda</label>
                  <input name="renda_valor_assistido" defaultValue={isEditing ? targetFamily?.renda : ''} placeholder="R$ 0,00" className="w-full px-4 py-2 bg-emerald-50 border border-emerald-100 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none" />
                </div>
              )}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700">Possui Comorbidade?</label>
                <select 
                  onChange={(e) => setTemComorbidadeAssistido(e.target.value === 'Sim')}
                  value={temComorbidadeAssistido ? 'Sim' : 'Não'}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="Não">Não</option>
                  <option value="Sim">Sim</option>
                </select>
              </div>
              {temComorbidadeAssistido && (
                <div className="space-y-2 animate-in slide-in-from-top-2">
                  <label className="text-xs font-bold text-slate-700">Quais?</label>
                  <input name="comorbidade_detalhe_assistido" defaultValue={isEditing ? targetFamily?.comorbidade : ''} placeholder="Descreva as comorbidades" className="w-full px-4 py-2 bg-rose-50 border border-rose-100 rounded-lg focus:ring-2 focus:ring-rose-500 outline-none" />
                </div>
              )}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700">Estado Civil</label>
                <select name="estadoCivil" defaultValue={isEditing ? targetFamily?.estadoCivil : ''} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
                  <option>Solteiro(a)</option>
                  <option>Casado(a)</option>
                  <option>União Estável</option>
                  <option>Divorciado(a)</option>
                  <option>Viúvo(a)</option>
                </select>
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <h4 className="flex items-center gap-2 text-blue-600 font-bold text-sm uppercase tracking-wider">
              <Home size={16} /> 2. Situação Habitacional e Social
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700">Bairro</label>
                <input name="bairro" defaultValue={isEditing ? targetFamily?.bairro : ''} required className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700">Endereço Completo</label>
                <input name="endereco" defaultValue={isEditing ? targetFamily?.endereco : ''} required className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700">Situação do Imóvel</label>
                <select name="imovel" defaultValue={isEditing ? targetFamily?.situacaoImovel : ''} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
                  <option>Própria</option>
                  <option>Alugada</option>
                  <option>Cedida / Favor</option>
                  <option>Financiada</option>
                  <option>Ocupação</option>
                  <option>Situação de Rua</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700">Telefone / Celular</label>
                <input 
                  name="telefone" 
                  value={telefoneValue} 
                  onChange={handleTelefoneChange}
                  placeholder="(00) 00000-0000" 
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" 
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700">WhatsApp</label>
                <label className="flex items-center gap-2 px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg">
                  <input
                    name="whatsapp"
                    type="checkbox"
                    defaultChecked={isEditing ? !!targetFamily?.whatsapp : false}
                    className="w-4 h-4 accent-blue-600"
                  />
                  <span className="text-sm text-slate-600 font-medium">Tem WhatsApp</span>
                </label>
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h4 className="flex items-center gap-2 text-blue-600 font-bold text-sm uppercase tracking-wider">
                <Users size={16} /> 3. Outros Residentes no Imóvel
              </h4>
              <div className="flex items-center gap-4">
                <label className="text-xs font-bold text-slate-500 uppercase">Total de Pessoas (Inc. Assistido):</label>
                <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden">
                   <button type="button" onClick={() => setTotalMoradores(Math.max(1, totalMoradores - 1))} className="px-3 py-1 bg-slate-50 hover:bg-slate-100 text-slate-600 font-bold">-</button>
                   <span className="px-4 py-1 bg-white font-bold text-blue-600 min-w-[40px] text-center">{totalMoradores}</span>
                   <button type="button" onClick={() => setTotalMoradores(totalMoradores + 1)} className="px-3 py-1 bg-slate-50 hover:bg-slate-100 text-slate-600 font-bold">+</button>
                </div>
              </div>
            </div>
            
            {totalMoradores > 1 ? (
              <div className="space-y-4">
                {Array.from({ length: totalMoradores - 1 }).map((_, i) => {
                  const idx = i + 1;
                  const memberData = isEditing ? targetMembers[idx] : null;
                  return (
                    <div key={idx} className="p-5 bg-slate-50 rounded-2xl border border-slate-100 animate-in slide-in-from-top-2 space-y-4">
                      <div className="flex items-center justify-between border-b border-slate-200 pb-2 mb-2">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-[10px] font-bold text-blue-600">
                            {idx + 1}°
                          </span>
                          <span className="text-xs font-bold text-slate-500 uppercase">Residente Adicional</span>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
                        <div className="md:col-span-2 space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase">Nome Completo</label>
                          <input name={`member_nome_${idx}`} defaultValue={memberData?.nome || ''} required className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm" placeholder="Nome do familiar" />
                        </div>
                        <div className="md:col-span-1 space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase">Parentesco</label>
                          <select name={`member_parentesco_${idx}`} defaultValue={memberData?.parentesco || 'Filho(a)'} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm">
                            <option>Filho(a)</option>
                            <option>Cônjuge</option>
                            <option>Neto(a)</option>
                            <option>Enteado(a)</option>
                            <option>Pai / Mãe</option>
                            <option>Irmão(ã)</option>
                            <option>Outro</option>
                          </select>
                        </div>
                        <div className="md:col-span-1 space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase">Data de Nascimento</label>
                          <input name={`member_nascimento_${idx}`} defaultValue={memberData?.nascimento || ''} type="date" required className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm" />
                        </div>
                        <div className="md:col-span-1 space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase">Ocupação</label>
                          <select 
                            name={`member_ocupacao_${idx}`} 
                            value={ocupacoesMembros[idx] || ''}
                            onChange={(e) => setOcupacoesMembros(prev => ({ ...prev, [idx]: e.target.value }))}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm"
                          >
                            <OcupacaoOptions />
                          </select>
                        </div>
                        <div className="md:col-span-1 space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase">Possui Renda?</label>
                          <select 
                            name={`member_possui_renda_${idx}`}
                            value={membrosRendaVisivel[idx] ? 'Sim' : 'Não'}
                            onChange={(e) => handleMemberRendaChange(idx, e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm"
                          >
                            <option value="Não">Não</option>
                            <option value="Sim">Sim</option>
                          </select>
                        </div>
                        <div className="md:col-span-2 space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase">Possui Comorbidade?</label>
                          <select 
                            name={`member_possui_comorbidade_${idx}`}
                            value={membrosComorbidadeVisivel[idx] ? 'Sim' : 'Não'}
                            onChange={(e) => handleMemberComorbidadeChange(idx, e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm"
                          >
                            <option value="Não">Não</option>
                            <option value="Sim">Sim</option>
                          </select>
                        </div>
                        <div className="md:col-span-4 space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase">Observação Ocupação</label>
                          <input name={`member_obs_ocupacao_${idx}`} defaultValue={memberData?.observacaoOcupacao || ''} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm" placeholder="Ex: Escola X, Bico" />
                        </div>
                        
                        {membrosRendaVisivel[idx] && (
                          <div className="md:col-span-3 space-y-1 animate-in slide-in-from-left-2">
                            <label className="text-[10px] font-bold text-slate-400 uppercase">Valor da Renda</label>
                            <input name={`member_renda_valor_${idx}`} defaultValue={memberData?.renda || ''} className="w-full px-3 py-2 bg-emerald-50 border border-emerald-100 rounded-lg text-sm font-bold text-emerald-700" placeholder="R$ 0,00" />
                          </div>
                        )}

                        {membrosComorbidadeVisivel[idx] && (
                          <div className="md:col-span-3 space-y-1 animate-in slide-in-from-left-2">
                            <label className="text-[10px] font-bold text-slate-400 uppercase">Qual Comorbidade?</label>
                            <input name={`member_comorbidade_detalhe_${idx}`} defaultValue={memberData?.comorbidade || ''} className="w-full px-3 py-2 bg-rose-50 border border-rose-100 rounded-lg text-sm font-bold text-rose-700" placeholder="Descreva a comorbidade" />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
                <p className="text-sm text-slate-400">Nenhum outro morador registrado além do assistido.</p>
                <button type="button" onClick={() => setTotalMoradores(2)} className="mt-2 text-xs font-bold text-blue-600 hover:underline">+ Adicionar Morador</button>
              </div>
            )}
          </section>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 pt-4 border-t border-slate-100">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700">Status do Cadastro</label>
              <select name="status" defaultValue={isEditing ? targetFamily?.status : 'Ativo'} className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-bold">
                <option value="Ativo">Ativo</option>
                <option value="Inativo">Inativo</option>
                <option value="Pendente">Pendente</option>
              </select>
            </div>
            <div className="md:col-span-4 space-y-2">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-2">
                <FileText size={14} /> Histórico / Relato Social da Conferência
              </label>
              <textarea name="obs" defaultValue={isEditing ? targetFamily?.observacao : ''} rows={4} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Relato breve sobre a situação de vulnerabilidade..."></textarea>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-6 border-t border-slate-100">
            <button type="button" onClick={() => { setIsAdding(false); setIsEditing(false); resetForm(); onCancelEdit?.(); }} className="px-6 py-2.5 rounded-xl text-slate-600 font-semibold hover:bg-slate-100 transition-colors">Cancelar</button>
            <button type="submit" className={`px-8 py-2.5 rounded-xl text-white font-bold shadow-lg transition-all flex items-center gap-2 ${isEditing ? 'bg-emerald-600 shadow-emerald-200 hover:bg-emerald-700' : 'bg-blue-600 shadow-blue-200 hover:bg-blue-700'}`}>
              {isEditing ? <Save size={18} /> : <UserPlus size={18} />} 
              {isEditing ? 'Salvar Alterações' : 'Finalizar Cadastro'}
            </button>
          </div>
        </form>
      </div>
    );
  }

  if (viewMode === 'details' && family) {
    return (
      <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
        {/* Modal de Confirmação de Remoção de Membro */}
        {memberToDelete && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
            <div className="bg-white w-full max-w-md rounded-2xl md:rounded-[2rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 max-h-[90vh] overflow-y-auto">
              <div className="p-6 md:p-8 text-center">
                <div className="w-16 h-16 md:w-20 md:h-20 bg-rose-100 text-rose-600 rounded-2xl md:rounded-3xl flex items-center justify-center mx-auto mb-4 md:mb-6">
                  <AlertTriangle size={32} className="md:w-10 md:h-10" />
                </div>
                <h4 className="text-xl md:text-2xl font-black text-slate-800 mb-2">Confirmar Exclusão</h4>
                <p className="text-slate-500 text-xs md:text-sm leading-relaxed px-2">
                  Você tem certeza que deseja remover <span className="font-bold text-slate-700">{memberToDelete.nome}</span>? Esta ação não pode ser desfeita.
                </p>
              </div>
              <div className="p-4 md:p-6 bg-slate-50 border-t border-slate-100 flex flex-col sm:flex-row gap-3">
                <button 
                  onClick={() => setMemberToDelete(null)} 
                  className="flex-1 px-6 py-3 md:py-4 bg-white border border-slate-200 text-slate-600 rounded-xl md:rounded-2xl text-sm font-bold hover:bg-slate-100 active:bg-slate-200 transition-all"
                >
                  Não, cancelar
                </button>
                <button 
                  onClick={handleConfirmRemoveMember}
                  className="flex-1 px-6 py-3 md:py-4 bg-rose-600 text-white rounded-xl md:rounded-2xl text-sm font-bold hover:bg-rose-700 active:bg-rose-800 transition-all shadow-lg shadow-rose-100 flex items-center justify-center gap-2"
                >
                  <Trash2 size={16} className="md:w-[18px] md:h-[18px]" /> Sim, remover
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal de Confirmação de Exclusão de Família */}
        {isDeleteFamilyModalOpen && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
            <div className="bg-white w-full max-w-md rounded-2xl md:rounded-[2rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 max-h-[90vh] overflow-y-auto">
              <div className="p-6 md:p-8 text-center">
                <div className="w-16 h-16 md:w-20 md:h-20 bg-rose-100 text-rose-600 rounded-2xl md:rounded-3xl flex items-center justify-center mx-auto mb-4 md:mb-6">
                  <AlertTriangle size={32} className="md:w-10 md:h-10" />
                </div>
                <h4 className="text-xl md:text-2xl font-black text-slate-800 mb-2">Confirmar Exclusão</h4>
                <p className="text-slate-500 text-xs md:text-sm leading-relaxed px-2">
                  Você tem certeza que deseja excluir a família <span className="font-bold text-slate-700">{family.nomeAssistido}</span>? Esta ação irá remover permanentemente:
                </p>
                <ul className="text-left text-xs md:text-sm text-slate-600 mt-4 space-y-1 bg-slate-50 p-3 md:p-4 rounded-xl">
                  <li>• A família e todos os seus membros</li>
                  <li>• Todas as visitas registradas</li>
                  <li>• Todas as entregas realizadas</li>
                </ul>
                <p className="text-rose-600 text-[10px] md:text-xs font-bold mt-4">Esta ação não pode ser desfeita!</p>
              </div>
              <div className="p-4 md:p-6 bg-slate-50 border-t border-slate-100 flex flex-col sm:flex-row gap-3">
                <button 
                  onClick={() => setIsDeleteFamilyModalOpen(false)} 
                  className="flex-1 px-6 py-3 md:py-4 bg-white border border-slate-200 text-slate-600 rounded-xl md:rounded-2xl text-sm font-bold hover:bg-slate-100 active:bg-slate-200 transition-all"
                >
                  Não, cancelar
                </button>
                <button 
                  onClick={() => {
                    deleteFamily(family.id);
                    setIsDeleteFamilyModalOpen(false);
                    onRefresh();
                    if (onDelete) {
                      onDelete();
                    }
                  }}
                  className="flex-1 px-6 py-3 md:py-4 bg-rose-600 text-white rounded-xl md:rounded-2xl text-sm font-bold hover:bg-rose-700 active:bg-rose-800 transition-all shadow-lg shadow-rose-100 flex items-center justify-center gap-2"
                >
                  <Trash2 size={16} className="md:w-[18px] md:h-[18px]" /> Sim, excluir família
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal de Adicionar Novo Membro Avulso */}
        {isAddMemberModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
              <div className="p-6 bg-blue-600 text-white flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white/20 rounded-xl">
                    <UserPlus size={24} />
                  </div>
                  <div>
                    <h4 className="font-bold text-lg">Adicionar Novo Membro</h4>
                    <p className="text-white/80 text-xs uppercase font-bold tracking-widest">Família: {family.nomeAssistido}</p>
                  </div>
                </div>
                <button onClick={() => setIsAddMemberModalOpen(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                  <X size={24} />
                </button>
              </div>
              <form onSubmit={handleQuickAddMember} className="p-8 space-y-6 max-h-[80vh] overflow-y-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Nome Completo</label>
                    <input name="nome" required className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-medium" placeholder="Nome do membro" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Parentesco</label>
                    <select name="parentesco" required className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-medium">
                      <option>Filho(a)</option>
                      <option>Cônjuge</option>
                      <option>Neto(a)</option>
                      <option>Enteado(a)</option>
                      <option>Pai / Mãe</option>
                      <option>Irmão(ã)</option>
                      <option>Outro</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Idade</label>
                    <input name="idade" type="number" required className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-medium" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Ocupação</label>
                    <select name="ocupacao" required className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-medium">
                      <OcupacaoOptions />
                    </select>
                  </div>
                  <div className="md:col-span-2 space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Observação Ocupação</label>
                    <input name="obs_ocupacao" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-medium" placeholder="Ex: Escola X, Desempregado há 2 meses..." />
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Possui Renda?</label>
                    <select 
                      name="possui_renda"
                      onChange={(e) => setNewMemberRendaVisible(e.target.value === 'Sim')}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-medium"
                    >
                      <option value="Não">Não</option>
                      <option value="Sim">Sim</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Possui Comorbidade?</label>
                    <select 
                      name="possui_comorbidade"
                      onChange={(e) => setNewMemberComorbidadeVisible(e.target.value === 'Sim')}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-medium"
                    >
                      <option value="Não">Não</option>
                      <option value="Sim">Sim</option>
                    </select>
                  </div>

                  {newMemberRendaVisible && (
                    <div className="space-y-2 animate-in slide-in-from-left-2">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Valor da Renda</label>
                      <input name="renda_valor" required className="w-full px-4 py-2.5 bg-emerald-50 border border-emerald-100 rounded-xl text-sm font-bold text-emerald-700 outline-none focus:ring-2 focus:ring-emerald-500" placeholder="R$ 0,00" />
                    </div>
                  )}

                  {newMemberComorbidadeVisible && (
                    <div className="space-y-2 animate-in slide-in-from-left-2">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Qual Comorbidade?</label>
                      <input name="comorbidade_detalhe" required className="w-full px-4 py-2.5 bg-rose-50 border border-rose-100 rounded-xl text-sm font-bold text-rose-700 outline-none focus:ring-2 focus:ring-rose-500" placeholder="Descreva a comorbidade..." />
                    </div>
                  )}
                </div>

                <div className="pt-6 border-t border-slate-100 flex gap-3">
                  <button type="button" onClick={() => setIsAddMemberModalOpen(false)} className="flex-1 px-6 py-3 border border-slate-200 text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-50 transition-all">Cancelar</button>
                  <button type="submit" className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-100">
                    <UserCheck size={18} /> Salvar Membro
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        <div className="bg-white p-4 md:p-8 rounded-xl md:rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between gap-4 md:gap-6">
          <div className="flex gap-4 md:gap-6">
            <div className="w-16 h-16 md:w-24 md:h-24 bg-blue-100 rounded-xl md:rounded-2xl flex items-center justify-center text-blue-600 shrink-0">
              <User size={32} className="md:w-12 md:h-12" />
            </div>
            <div className="flex-1 min-w-0">
              {/* Status no topo no mobile */}
              <div className="md:hidden mb-2">
                <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                  family.status === 'Ativo' ? 'bg-emerald-100 text-emerald-700' : 
                  family.status === 'Inativo' ? 'bg-slate-100 text-slate-500' : 'bg-amber-100 text-amber-700'
                }`}>
                  {family.status}
                </span>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="text-xl md:text-3xl font-bold text-slate-800 truncate">{family.nomeAssistido}</h2>
                {/* Status ao lado no desktop */}
                <span className={`hidden md:inline-flex px-2 py-1 rounded-full text-xs font-bold ${
                  family.status === 'Ativo' ? 'bg-emerald-100 text-emerald-700' : 
                  family.status === 'Inativo' ? 'bg-slate-100 text-slate-500' : 'bg-amber-100 text-amber-700'
                }`}>
                  {family.status}
                </span>
              </div>
              <p className="text-slate-500 mt-1 flex items-center gap-2 text-xs md:text-sm flex-wrap">
                <FileText size={14} className="md:w-4 md:h-4 shrink-0" /> 
                <span className="truncate">Ficha N° {family.ficha}</span>
              </p>
              {family.dataCadastro && (
                <p className="text-slate-400 mt-1 flex items-center gap-2 text-xs">
                  <Calendar size={12} className="shrink-0" /> 
                  <span>Cadastrado em: {new Date(family.dataCadastro).toLocaleDateString('pt-BR')}</span>
                </p>
              )}
              <div className="flex flex-wrap gap-2 md:gap-4 mt-3 md:mt-4">
                {family.cpf && (
                  <span className="flex items-center gap-1.5 text-xs md:text-sm text-slate-600 px-2 md:px-3 py-1 md:py-1.5 bg-slate-50 rounded-lg border border-slate-100">
                    <CreditCard size={12} className="md:w-[14px] md:h-[14px] text-purple-500 shrink-0" /> 
                    <span className="truncate">CPF: {family.cpf}</span>
                  </span>
                )}
                {family.rg && (
                  <span className="flex items-center gap-1.5 text-xs md:text-sm text-slate-600 px-2 md:px-3 py-1 md:py-1.5 bg-slate-50 rounded-lg border border-slate-100">
                    <ShieldCheck size={12} className="md:w-[14px] md:h-[14px] text-indigo-500 shrink-0" /> 
                    <span className="truncate">RG: {family.rg}</span>
                  </span>
                )}
                <span className="flex items-center gap-1.5 text-xs md:text-sm text-slate-600 px-2 md:px-3 py-1 md:py-1.5 bg-slate-50 rounded-lg border border-slate-100">
                  <Phone size={12} className="md:w-[14px] md:h-[14px] text-blue-500 shrink-0" /> 
                  <span className="truncate">{family.telefone || 'Sem Telefone'}</span>
                </span>
                {(family.bairro || family.endereco) && (
                  <span className="flex items-start gap-1.5 text-xs md:text-sm text-slate-600 px-2 md:px-3 py-1 md:py-1.5 bg-slate-50 rounded-lg border border-slate-100">
                    <MapPin size={12} className="md:w-[14px] md:h-[14px] text-red-500 shrink-0 mt-0.5" />
                    <span className="break-words leading-relaxed">
                      {[family.bairro, family.endereco].filter(Boolean).join(' - ')}
                    </span>
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-start gap-2 flex-wrap justify-end md:justify-start">
            <button 
              onClick={generatePDF}
              className="bg-blue-600 text-white p-2.5 rounded-xl font-bold flex items-center justify-center hover:bg-blue-700 active:bg-blue-800 transition-all shadow-lg shadow-blue-100 shrink-0"
              title="Baixar PDF"
              aria-label="Baixar PDF"
            >
              <Download size={20} />
            </button>
            <button 
              onClick={() => setIsEditing(true)}
              className="bg-emerald-600 text-white p-2.5 rounded-xl font-bold flex items-center justify-center hover:bg-emerald-700 active:bg-emerald-800 transition-all shadow-lg shadow-emerald-100 shrink-0"
              title="Editar Cadastro"
              aria-label="Editar Cadastro"
            >
              <Edit size={20} />
            </button>
            <button 
              onClick={() => setIsDeleteFamilyModalOpen(true)}
              className="bg-rose-600 text-white p-2.5 rounded-xl font-bold flex items-center justify-center hover:bg-rose-700 active:bg-rose-800 transition-all shadow-lg shadow-rose-100 shrink-0"
              title="Excluir Família"
              aria-label="Excluir Família"
            >
              <Trash2 size={20} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="space-y-6">
            <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
              <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2 text-sm uppercase tracking-wider">
                <Info size={18} className="text-blue-500" /> Informações Socioeconômicas
              </h3>
              <dl className="space-y-4">
                <div className="grid grid-cols-2">
                  <dt className="text-xs font-bold text-slate-400 uppercase">Situação Moradia</dt>
                  <dd className="text-sm text-slate-700 font-semibold text-right">{family.situacaoImovel}</dd>
                </div>
                <div className="grid grid-cols-2">
                  <dt className="text-xs font-bold text-slate-400 uppercase">Renda Assistido</dt>
                  <dd className="text-sm text-emerald-700 font-bold text-right">{family.renda}</dd>
                </div>
                <div className="grid grid-cols-2">
                  <dt className="text-xs font-bold text-slate-400 uppercase">Comorbidade</dt>
                  <dd className="text-sm text-rose-700 font-bold text-right">{family.comorbidade}</dd>
                </div>
                <div className="grid grid-cols-2 border-t border-slate-50 pt-2">
                   <dt className="text-xs font-bold text-slate-400 uppercase">Total Moradores</dt>
                   <dd className="text-sm text-slate-700 font-semibold text-right">{family.moradoresCount} pessoas</dd>
                </div>
                <div className="border-t border-slate-50 pt-4">
                  <dt className="text-xs font-bold text-slate-400 uppercase mb-2">Relato / Obs.</dt>
                  <dd className="text-sm text-slate-600 leading-relaxed italic">{family.observacao || 'Nenhum relato cadastrado.'}</dd>
                </div>
              </dl>
            </section>

            <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-slate-800 flex items-center gap-2 text-sm uppercase tracking-wider">
                  <Users size={18} className="text-blue-500" /> Membros da Casa ({members.length})
                </h3>
                <button 
                  onClick={() => setIsAddMemberModalOpen(true)}
                  className="p-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
                  title="Adicionar Membro"
                >
                  <Plus size={16} />
                </button>
              </div>
              <div className="space-y-3">
                {members.map((m, i) => (
                  <div key={i} className="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-2 relative group/item">
                    {/* Botão de Remover Membro */}
                    {m.parentesco !== 'Próprio(a)' && i !== 0 && (
                      <button 
                        onClick={() => setMemberToDelete(m)}
                        className="absolute top-2 right-2 p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg opacity-0 group-hover/item:opacity-100 transition-all"
                        title="Remover Membro"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                    
                    <div className="flex justify-between items-center pr-6">
                      <div>
                        <p className="text-sm font-bold text-slate-800">{m.nome}</p>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">{m.parentesco} • {m.idade} anos</p>
                      </div>
                      <div className="text-right">
                         <p className="text-emerald-700 font-bold text-xs">{m.renda || 'R$ 0,00'}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                       <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide ${
                          m.ocupacao === 'Empregado' ? 'bg-emerald-100 text-emerald-700' :
                          m.ocupacao === 'Estudante' ? 'bg-blue-100 text-blue-700' :
                          m.ocupacao === 'Do Lar' ? 'bg-purple-100 text-purple-700' :
                          m.ocupacao === 'Desempregado' ? 'bg-rose-100 text-rose-700' : 'bg-slate-200 text-slate-700'
                        }`}>
                          <Briefcase size={8} /> {m.ocupacao || 'N/A'}
                        </span>
                        {m.comorbidade && m.comorbidade !== 'Não possui' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide bg-rose-100 text-rose-700">
                            <HealthIcon size={8} /> {m.comorbidade}
                          </span>
                        )}
                    </div>
                    {m.observacaoOcupacao && (
                      <p className="text-[10px] text-slate-500 bg-white/60 p-1.5 rounded-lg border border-slate-50 italic">
                        {m.observacaoOcupacao}
                      </p>
                    )}
                  </div>
                ))}
              </div>
              <button 
                onClick={() => setIsAddMemberModalOpen(true)}
                className="w-full mt-4 py-2 bg-slate-100 border border-dashed border-slate-300 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-200 hover:text-slate-700 transition-all flex items-center justify-center gap-2"
              >
                <Plus size={14} /> Adicionar Membro
              </button>
            </section>
          </div>

          <div className="lg:col-span-2 space-y-6">
            <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
              <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2 text-sm uppercase tracking-wider">
                <Activity size={18} className="text-blue-500" /> Linha do Tempo de Atendimento
              </h3>
              <div className="space-y-6 relative before:absolute before:inset-y-0 before:left-3 before:w-0.5 before:bg-slate-100">
                {[...visits, ...deliveries].sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime()).map((item, i) => {
                  const isVisit = 'vicentinos' in item;
                  return (
                    <div key={i} className="relative pl-10 animate-in fade-in slide-in-from-left-4" style={{ animationDelay: `${i * 100}ms` }}>
                      <div className={`absolute left-0 top-1 w-6 h-6 rounded-full flex items-center justify-center border-2 border-white shadow-sm ${isVisit ? 'bg-emerald-500' : 'bg-orange-500'}`}>
                        {isVisit ? <Footprints size={12} className="text-white" /> : <Package size={12} className="text-white" />}
                      </div>
                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 hover:border-blue-200 hover:bg-white transition-all">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                             <p className="text-sm font-bold text-slate-800">{isVisit ? 'Visita Domiciliar' : 'Entrega efetuada'}</p>
                             <p className="text-[10px] text-slate-400 font-bold uppercase">{item.data}</p>
                          </div>
                        </div>
                        <p className="text-xs text-slate-600 leading-relaxed italic bg-white/50 p-2 rounded-lg border border-slate-50">
                          {isVisit ? (item as Visit).relato : (item as Delivery).tipo}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" 
            placeholder="Buscar por nome ou bairro..."
          />
        </div>
        <button 
          onClick={() => setIsAdding(true)}
          className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-xl font-semibold hover:bg-blue-700 transition-all shadow-md shadow-blue-100"
        >
          <Plus size={20} /> Nova Família
        </button>
      </div>

      {/* Desktop Table */}
      <div className="bg-white rounded-xl md:rounded-2xl shadow-sm border border-slate-200 overflow-hidden hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="px-4 md:px-6 py-3 md:py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Ficha / Assistido</th>
                <th className="px-4 md:px-6 py-3 md:py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Bairro</th>
                <th className="px-4 md:px-6 py-3 md:py-4 text-xs font-bold text-slate-500 uppercase tracking-wider hidden lg:table-cell">Membros</th>
                <th className="px-4 md:px-6 py-3 md:py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                <th className="px-4 md:px-6 py-3 md:py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredFamilies.map((f) => (
                <tr key={f.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-4 md:px-6 py-3 md:py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center font-bold shrink-0">
                        {f.nomeAssistido.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-800 truncate">{f.nomeAssistido}</p>
                        <p className="text-[10px] text-slate-500 font-bold uppercase">N° {f.ficha}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 md:px-6 py-3 md:py-4">
                    <span className="text-sm text-slate-600 flex items-center gap-1">
                      <MapPin size={14} className="text-slate-400 shrink-0" /> <span className="truncate">{f.bairro}</span>
                    </span>
                  </td>
                  <td className="px-4 md:px-6 py-3 md:py-4 hidden lg:table-cell">
                     <div className="flex items-center gap-1 text-slate-600">
                        <Users size={14} className="text-slate-400" />
                        <span className="text-sm font-medium">{f.moradoresCount}</span>
                     </div>
                  </td>
                  <td className="px-4 md:px-6 py-3 md:py-4">
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide ${
                      f.status === 'Ativo' ? 'bg-emerald-100 text-emerald-700' : 
                      f.status === 'Inativo' ? 'bg-slate-100 text-slate-500' : 'bg-amber-100 text-amber-700'
                    }`}>
                      {f.status}
                    </span>
                  </td>
                  <td className="px-4 md:px-6 py-3 md:py-4 text-right">
                    <button 
                      onClick={() => onViewDetails?.(f.id)}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors inline-flex items-center gap-1 font-bold text-sm active:bg-blue-100"
                    >
                      Ver Perfil <ChevronRight size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden space-y-3">
        {filteredFamilies.map((f) => (
          <div 
            key={f.id} 
            className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 active:bg-slate-50 transition-colors"
            onClick={() => onViewDetails?.(f.id)}
          >
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center font-bold text-lg shrink-0">
                {f.nomeAssistido.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-slate-800 truncate">{f.nomeAssistido}</p>
                    <p className="text-[10px] text-slate-500 font-bold uppercase mt-0.5">N° {f.ficha}</p>
                  </div>
                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-[9px] font-bold uppercase tracking-wide shrink-0 ${
                    f.status === 'Ativo' ? 'bg-emerald-100 text-emerald-700' : 
                    f.status === 'Inativo' ? 'bg-slate-100 text-slate-500' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {f.status}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
                  <span className="flex items-center gap-1">
                    <MapPin size={12} className="text-slate-400" /> {f.bairro}
                  </span>
                  <span className="flex items-center gap-1">
                    <Users size={12} className="text-slate-400" /> {f.moradoresCount} membros
                  </span>
                </div>
                <button className="mt-3 w-full py-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors flex items-center justify-center gap-1 font-bold text-xs active:bg-blue-100">
                  Ver Perfil <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default FamilyManager;
