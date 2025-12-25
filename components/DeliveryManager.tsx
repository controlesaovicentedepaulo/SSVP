
import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Package, Calendar, CheckCircle, User, Users, Search, X, Ban, History, Plus, ArrowLeft, Info, UserCheck, Clock, ChevronRight, Download } from 'lucide-react';
import { Delivery, Family } from '../types';
import { addDelivery, getDb, saveDb } from '../db';
import jsPDF from 'jspdf';

interface DeliveryManagerProps {
  deliveries: Delivery[];
  families: Family[];
  onRefresh: () => void;
}

const DeliveryManager: React.FC<DeliveryManagerProps> = ({ deliveries, families, onRefresh }) => {
  const [view, setView] = useState<'history' | 'new-delivery'>('history');
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<Delivery | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState('Cesta Básica (Padrão)');

  const activeFamiliesSorted = useMemo(() => {
    return families
      .filter(f => f.status === 'Ativo' && (f.nomeAssistido.toLowerCase().includes(searchTerm.toLowerCase()) || f.ficha.includes(searchTerm)))
      .sort((a, b) => a.nomeAssistido.localeCompare(b.nomeAssistido));
  }, [families, searchTerm]);

  const dayDeliveriesMap = useMemo(() => {
    const map = new Map<string, Delivery>();
    deliveries.filter(d => d.data === selectedDate).forEach(d => map.set(d.familyId, d));
    return map;
  }, [deliveries, selectedDate]);

  const handleMarkAsDelivered = (family: Family, status: 'Entregue' | 'Não Entregue', retiradoPor?: 'Próprio' | 'Outros', detalhe?: string) => {
    const newDelivery: Delivery = {
      id: crypto.randomUUID(),
      familyId: family.id,
      data: selectedDate,
      tipo: selectedType,
      responsavel: 'Vicentino',
      status: status,
      retiradoPor: status === 'Entregue' ? retiradoPor : undefined,
      retiradoPorDetalhe: detalhe,
      observacoes: status === 'Entregue' ? `Entregue para ${retiradoPor === 'Próprio' ? 'Próprio' : detalhe}` : `Falta: ${detalhe || 'Não compareceu'}`
    };
    addDelivery(newDelivery);
    onRefresh();
  };

  const handleUndoDelivery = (familyId: string) => {
    const db = getDb();
    db.deliveries = db.deliveries.filter(d => !(d.familyId === familyId && d.data === selectedDate));
    saveDb(db);
    onRefresh();
  };

  const generateHistoryPDF = () => {
    const doc = new jsPDF();
    let yPos = 15;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 15;
    const contentWidth = pageWidth - (margin * 2);

    const checkNewPage = (requiredSpace: number = 20) => {
      if (yPos + requiredSpace > pageHeight - 25) {
        doc.addPage();
        yPos = 15;
        return true;
      }
      return false;
    };

    // Header elegante
    doc.setFillColor(37, 99, 235); // Azul SSVP
    doc.rect(0, 0, pageWidth, 30);
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('SSVP BRASIL', margin, 12);
    
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text('Sociedade de São Vicente de Paulo', margin, 20);
    
    doc.setFontSize(9);
    doc.text('Histórico Completo de Entregas', margin, 26);
    
    doc.setTextColor(0, 0, 0);
    yPos = 40;

    // Resumo em cards horizontais
    checkNewPage(30);
    const totalEntregues = deliveries.filter(d => d.status === 'Entregue').length;
    const totalFaltas = deliveries.filter(d => d.status === 'Não Entregue').length;
    
    const cardWidth = (contentWidth - 8) / 3;
    const cardHeight = 20;
    
    // Card Total
    doc.setFillColor(37, 99, 235);
    doc.roundedRect(margin, yPos, cardWidth, cardHeight, 2, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('TOTAL', margin + 8, yPos + 7);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text(String(deliveries.length), margin + 8, yPos + 16);
    
    // Card Entregues
    doc.setFillColor(16, 185, 129);
    doc.roundedRect(margin + cardWidth + 4, yPos, cardWidth, cardHeight, 2, 2, 'F');
    doc.text('ENTREGUES', margin + cardWidth + 12, yPos + 7);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text(String(totalEntregues), margin + cardWidth + 12, yPos + 16);
    
    // Card Faltas
    doc.setFillColor(239, 68, 68);
    doc.roundedRect(margin + (cardWidth + 4) * 2, yPos, cardWidth, cardHeight, 2, 2, 'F');
    doc.text('FALTAS', margin + (cardWidth + 4) * 2 + 8, yPos + 7);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text(String(totalFaltas), margin + (cardWidth + 4) * 2 + 8, yPos + 16);
    
    doc.setTextColor(0, 0, 0);
    yPos += cardHeight + 15;

    // Título da seção
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(37, 99, 235);
    doc.text('HISTÓRICO DETALHADO', margin, yPos);
    doc.setTextColor(0, 0, 0);
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, yPos + 3, pageWidth - margin, yPos + 3);
    yPos += 12;

    const sortedDeliveries = [...deliveries].sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());

    sortedDeliveries.forEach((delivery, index) => {
      checkNewPage(50);
      
      const family = families.find(f => f.id === delivery.familyId);
      const isEntregue = delivery.status === 'Entregue';
      
      // Header do card com fundo colorido
      const headerColor = isEntregue ? [220, 252, 231] : [254, 226, 226];
      const borderColor = isEntregue ? [16, 185, 129] : [239, 68, 68];
      
      doc.setFillColor(headerColor[0], headerColor[1], headerColor[2]);
      doc.roundedRect(margin, yPos, contentWidth, 18, 2, 2, 'F');
      
      // Borda superior
      doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
      doc.setLineWidth(1);
      doc.line(margin, yPos, pageWidth - margin, yPos);
      
      // Número e nome
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.text(`${index + 1}. ${family?.nomeAssistido || 'Família Desconhecida'}`, margin + 5, yPos + 7);
      
      // Data
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(80, 80, 80);
      doc.text(new Date(delivery.data).toLocaleDateString('pt-BR'), pageWidth - margin - 30, yPos + 7);
      doc.setTextColor(0, 0, 0);
      
      // Tipo
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text(delivery.tipo || 'Não informado', margin + 5, yPos + 13);
      doc.setTextColor(0, 0, 0);
      
      yPos += 20;
      
      // Calcular altura necessária para o corpo
      let bodyHeight = 8; // Status
      bodyHeight += 7; // Tipo
      bodyHeight += 7; // Responsável
      if (delivery.retiradoPor) bodyHeight += 7;
      if (family) bodyHeight += 7; // Ficha
      if (family) bodyHeight += 7; // Bairro
      bodyHeight += 5; // Padding
      
      checkNewPage(bodyHeight);
      
      // Desenhar fundo branco do corpo primeiro
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(margin, yPos, contentWidth, bodyHeight, 2, 2, 'F');
      doc.setDrawColor(230, 230, 230);
      doc.setLineWidth(0.3);
      doc.roundedRect(margin, yPos, contentWidth, bodyHeight, 2, 2, 'S');
      
      // Detalhes em duas colunas
      const leftCol = margin + 5;
      const rightCol = margin + contentWidth / 2 + 3;
      let currentY = yPos + 5;
      
      // Status destacado
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(leftCol, currentY - 3, 45, 7, 1, 1, 'F');
      doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
      doc.setLineWidth(0.5);
      doc.roundedRect(leftCol, currentY - 3, 45, 7, 1, 1, 'S');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.text('Status:', leftCol + 2, currentY + 1);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(borderColor[0], borderColor[1], borderColor[2]);
      doc.text(delivery.status || 'Não informado', leftCol + 20, currentY + 1);
      doc.setTextColor(0, 0, 0);
      currentY += 9;
      
      // Tipo
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.text('Tipo:', rightCol, currentY);
      doc.setFont('helvetica', 'normal');
      doc.text(delivery.tipo || 'Não informado', rightCol + 18, currentY);
      currentY += 7;
      
      // Responsável
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.text('Responsável:', leftCol, currentY);
      doc.setFont('helvetica', 'normal');
      doc.text(delivery.responsavel || 'Não informado', leftCol + 35, currentY);
      currentY += 7;
      
      // Retirado por
      if (delivery.retiradoPor) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.text('Retirado por:', rightCol, currentY);
        doc.setFont('helvetica', 'normal');
        const retiradoPor = delivery.retiradoPor === 'Próprio' ? 'Próprio' : `Terceiros${delivery.retiradoPorDetalhe ? ` (${delivery.retiradoPorDetalhe})` : ''}`;
        doc.text(retiradoPor, rightCol + 30, currentY);
        currentY += 7;
      }
      
      // Ficha
      if (family) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.text('Ficha:', leftCol, currentY);
        doc.setFont('helvetica', 'normal');
        doc.text(family.ficha || 'N/A', leftCol + 18, currentY);
        currentY += 7;
      }
      
      // Bairro
      if (family) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.text('Bairro:', rightCol, currentY);
        doc.setFont('helvetica', 'normal');
        doc.text(family.bairro || 'Não informado', rightCol + 20, currentY);
        currentY += 7;
      }
      
      yPos = currentY + 3;
      
      // Observações
      if (delivery.observacoes) {
        checkNewPage(12);
        yPos += 3;
        doc.setFillColor(254, 243, 199);
        doc.roundedRect(margin, yPos, contentWidth, 10, 2, 2, 'F');
        doc.setDrawColor(251, 191, 36);
        doc.setLineWidth(0.5);
        doc.roundedRect(margin, yPos, contentWidth, 10, 2, 2, 'S');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.text('Observações:', margin + 5, yPos + 6);
        yPos += 10;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        const obsLines = doc.splitTextToSize(delivery.observacoes, contentWidth - 10);
        obsLines.forEach((line: string) => {
          checkNewPage(5);
          doc.text(line, margin + 5, yPos);
          yPos += 5;
        });
      }
      
      yPos += 10;
      
      // Divisória
      if (index < sortedDeliveries.length - 1) {
        checkNewPage(3);
        doc.setDrawColor(220, 220, 220);
        doc.setLineWidth(0.2);
        doc.line(margin, yPos, pageWidth - margin, yPos);
        yPos += 8;
      }
    });

    // Rodapé
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
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

    doc.save(`Historico_Entregas_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  return (
    <div className="space-y-6 animate-in">
      {selectedHistoryItem && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
              onClick={() => setSelectedHistoryItem(null)}
            >
              <div
                className="bg-white w-full max-w-lg rounded-2xl md:rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="p-4 md:p-6 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
                  <div className="space-y-1 min-w-0 flex-1">
                    <h4 className="font-bold text-base md:text-lg text-slate-800">Detalhes da Entrega</h4>
                    <p className="text-xs text-slate-500 font-bold uppercase tracking-widest truncate">
                      {families.find(f => f.id === selectedHistoryItem.familyId)?.nomeAssistido || 'Família'}
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedHistoryItem(null)}
                    className="p-2 hover:bg-slate-100 active:bg-slate-200 rounded-full text-slate-500 shrink-0 ml-2"
                    aria-label="Fechar"
                  >
                    <X size={20} className="md:w-[22px] md:h-[22px]" />
                  </button>
                </div>

                <div className="p-4 md:p-6 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-2">
                        <Calendar size={14} /> Data
                      </div>
                      <div className="text-sm font-bold text-slate-800">
                        {new Date(selectedHistoryItem.data + 'T00:00:00').toLocaleDateString('pt-BR')}
                      </div>
                    </div>

                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-2">
                        <Info size={14} /> Status
                      </div>
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold uppercase ${
                        selectedHistoryItem.status === 'Entregue' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                      }`}>
                        {selectedHistoryItem.status || 'Pendente'}
                      </span>
                    </div>

                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 sm:col-span-2">
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-2">
                        <Package size={14} /> Tipo
                      </div>
                      <div className="text-sm font-bold text-slate-800">{selectedHistoryItem.tipo || '-'}</div>
                    </div>

                    {selectedHistoryItem.status === 'Entregue' && (
                      <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 sm:col-span-2">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-2">
                          <UserCheck size={14} /> Retirado por
                        </div>
                        <div className="text-sm text-slate-800 font-semibold">
                          {selectedHistoryItem.retiradoPor === 'Próprio'
                            ? 'Próprio'
                            : selectedHistoryItem.retiradoPor === 'Outros'
                              ? `Terceiros${selectedHistoryItem.retiradoPorDetalhe ? `: ${selectedHistoryItem.retiradoPorDetalhe}` : ''}`
                              : '-'}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="p-4 bg-white rounded-2xl border border-slate-200">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Observações</div>
                    <div className="text-sm text-slate-700 whitespace-pre-wrap">
                      {selectedHistoryItem.observacoes || '-'}
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
                  <button
                    onClick={() => setSelectedHistoryItem(null)}
                    className="px-6 py-3 bg-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-100"
                  >
                    Fechar
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}

      {view === 'history' ? (
        <div className="space-y-6">
          <div className="bg-white p-4 md:p-6 rounded-xl md:rounded-2xl border border-slate-200 flex flex-col md:flex-row justify-between gap-4">
            <div className="flex items-center gap-3">
              <History className="text-blue-600 shrink-0" size={20} />
              <h3 className="text-lg md:text-xl font-bold">Histórico de Atendimento</h3>
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <button 
                onClick={generateHistoryPDF} 
                className="bg-blue-600 text-white px-4 md:px-5 py-2 md:py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-blue-700 active:bg-blue-800 transition-all text-sm md:text-base"
              >
                <Download size={16} className="md:w-[18px] md:h-[18px]" /> <span className="hidden sm:inline">Baixar PDF</span><span className="sm:hidden">PDF</span>
              </button>
              <button 
                onClick={() => setView('new-delivery')} 
                className="bg-orange-600 text-white px-4 md:px-5 py-2 md:py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-orange-700 active:bg-orange-800 transition-all text-sm md:text-base"
              >
                <Plus size={16} className="md:w-[18px] md:h-[18px]" /> Nova Entrega
              </button>
            </div>
          </div>
          
          {/* Desktop Table */}
          <div className="bg-white rounded-xl md:rounded-2xl border border-slate-200 overflow-hidden hidden md:block">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="px-4 md:px-6 py-3 md:py-4 text-[10px] font-bold text-slate-400 uppercase">Data</th>
                  <th className="px-4 md:px-6 py-3 md:py-4 text-[10px] font-bold text-slate-400 uppercase">Família</th>
                  <th className="px-4 md:px-6 py-3 md:py-4 text-[10px] font-bold text-slate-400 uppercase">Status</th>
                  <th className="px-4 md:px-6 py-3 md:py-4 text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {deliveries.sort((a,b) => b.data.localeCompare(a.data)).map(d => (
                  <tr key={d.id} className="hover:bg-slate-50 cursor-pointer transition-colors" onClick={() => setSelectedHistoryItem(d)}>
                    <td className="px-4 md:px-6 py-3 md:py-4 text-sm font-medium">{new Date(d.data + 'T00:00:00').toLocaleDateString('pt-BR')}</td>
                    <td className="px-4 md:px-6 py-3 md:py-4 text-sm font-bold">{families.find(f => f.id === d.familyId)?.nomeAssistido}</td>
                    <td className="px-4 md:px-6 py-3 md:py-4">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${d.status === 'Entregue' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                        {d.status}
                      </span>
                    </td>
                    <td className="px-4 md:px-6 py-3 md:py-4 text-right"><Info size={16} className="text-slate-300" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden space-y-3">
            {deliveries.sort((a,b) => b.data.localeCompare(a.data)).map(d => {
              const family = families.find(f => f.id === d.familyId);
              return (
                <div 
                  key={d.id} 
                  className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 active:bg-slate-50 transition-colors"
                  onClick={() => setSelectedHistoryItem(d)}
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-800 truncate">{family?.nomeAssistido || 'Família Desconhecida'}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{new Date(d.data + 'T00:00:00').toLocaleDateString('pt-BR')}</p>
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-[9px] font-bold uppercase shrink-0 ${d.status === 'Entregue' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                      {d.status}
                    </span>
                  </div>
                  <div className="flex items-center justify-end gap-1 text-slate-400">
                    <Info size={14} />
                    <span className="text-xs">Toque para detalhes</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-3">
              <button onClick={() => setView('history')} className="p-2 hover:bg-slate-100 rounded-full"><ArrowLeft size={20}/></button>
              <h3 className="text-xl font-bold">Registrar Entregas</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
               <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold" />
               <select value={selectedType} onChange={e => setSelectedType(e.target.value)} className="p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold">
                 <option>Cesta Básica (Padrão)</option>
                 <option>Cesta Especial</option>
                 <option>Leite</option>
                 <option>Fraldas</option>
               </select>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input type="text" placeholder="Buscar família..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none" />
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase">Família</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase">Status Hoje</th>
                  <th className="px-6 py-4 text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {activeFamiliesSorted.map(family => (
                  <FamilyListRow 
                    key={family.id} 
                    family={family} 
                    recordedDelivery={dayDeliveriesMap.get(family.id)} 
                    onDeliver={handleMarkAsDelivered} 
                    onUndo={() => handleUndoDelivery(family.id)} 
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

const FamilyListRow: React.FC<{
  family: Family;
  recordedDelivery?: Delivery;
  onDeliver: (family: Family, status: 'Entregue' | 'Não Entregue', retiradoPor?: 'Próprio' | 'Outros', detalhe?: string) => void;
  onUndo: () => void;
}> = ({ family, recordedDelivery, onDeliver, onUndo }) => {
  const [isExpanding, setIsExpanding] = useState(false);
  const [step, setStep] = useState<'status' | 'detail' | 'fail'>('status');
  const [retiradoPor, setRetiradoPor] = useState<'Próprio' | 'Outros' | null>(null);
  const [retiradoPorDetalhe, setRetiradoPorDetalhe] = useState('');
  const [motivoFalta, setMotivoFalta] = useState('');

  const reset = () => { setIsExpanding(false); setStep('status'); setRetiradoPor(null); setRetiradoPorDetalhe(''); setMotivoFalta(''); };

  return (
    <>
      <tr onClick={() => !recordedDelivery && setIsExpanding(true)} className={`cursor-pointer transition-colors ${recordedDelivery ? (recordedDelivery.status === 'Entregue' ? 'bg-emerald-50/30' : 'bg-rose-50/30') : 'hover:bg-slate-50'}`}>
        <td className="px-6 py-4 font-bold text-slate-800">{family.nomeAssistido}</td>
        <td className="px-6 py-4">
          {!recordedDelivery ? <span className="text-[10px] font-bold text-slate-400 uppercase">Pendente</span> : 
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${recordedDelivery.status === 'Entregue' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>{recordedDelivery.status}</span>}
        </td>
        <td className="px-6 py-4 text-right">
          {recordedDelivery ? <button onClick={e => { e.stopPropagation(); onUndo(); }} className="text-[10px] font-bold text-rose-600 uppercase border border-rose-200 px-3 py-1 rounded-lg">Estornar</button> : <ChevronRight size={18} className="text-slate-300" />}
        </td>
      </tr>
      {isExpanding && (
        typeof document !== 'undefined'
          ? createPortal(
              <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
                <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden p-8 space-y-6">
                  <div className="flex justify-between items-center">
                    <h4 className="font-bold text-lg">Registrar Entrega: {family.nomeAssistido}</h4>
                    <button onClick={reset}><X size={24}/></button>
                  </div>
                  {step === 'status' ? (
                    <div className="grid grid-cols-2 gap-4">
                      <button onClick={() => setStep('detail')} className="p-6 bg-emerald-50 text-emerald-700 rounded-2xl font-bold flex flex-col items-center gap-2"><CheckCircle size={32}/> Entregue</button>
                      <button onClick={() => { setStep('fail'); setMotivoFalta(''); }} className="p-6 bg-rose-50 text-rose-700 rounded-2xl font-bold flex flex-col items-center gap-2"><Ban size={32}/> Falta</button>
                    </div>
                  ) : step === 'fail' ? (
                    <div className="space-y-4">
                      <p className="font-bold text-sm uppercase text-slate-500">Motivo da falta</p>
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Por que não foi entregue?</label>
                        <input
                          value={motivoFalta}
                          onChange={(e) => setMotivoFalta(e.target.value)}
                          placeholder="Ex: Não compareceu / Sem estoque / Documento pendente..."
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-rose-500 text-sm font-medium"
                          autoFocus
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3 pt-2">
                        <button
                          type="button"
                          onClick={() => setStep('status')}
                          className="w-full py-4 bg-slate-100 text-slate-700 rounded-xl font-bold"
                        >
                          Voltar
                        </button>
                        <button
                          disabled={!motivoFalta.trim()}
                          onClick={() => { onDeliver(family, 'Não Entregue', undefined, motivoFalta.trim()); reset(); }}
                          className="w-full py-4 bg-rose-600 text-white rounded-xl font-bold shadow-lg disabled:opacity-50"
                        >
                          Confirmar Falta
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <p className="font-bold text-sm uppercase text-slate-500">Quem retirou?</p>
                      <div className="grid grid-cols-2 gap-4">
                        <button
                          onClick={() => { setRetiradoPor('Próprio'); setRetiradoPorDetalhe(''); }}
                          className={`p-4 border-2 rounded-xl font-bold ${retiradoPor === 'Próprio' ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-slate-100 text-slate-600'}`}
                        >
                          Próprio
                        </button>
                        <button
                          onClick={() => setRetiradoPor('Outros')}
                          className={`p-4 border-2 rounded-xl font-bold ${retiradoPor === 'Outros' ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-slate-100 text-slate-600'}`}
                        >
                          Terceiros
                        </button>
                      </div>

                      {retiradoPor === 'Outros' && (
                        <div className="space-y-2 animate-in slide-in-from-top-2">
                          <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Quem foi buscar?</label>
                          <input
                            value={retiradoPorDetalhe}
                            onChange={(e) => setRetiradoPorDetalhe(e.target.value)}
                            placeholder="Ex: Maria (irmã), José (vizinho)..."
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium"
                            autoFocus
                          />
                        </div>
                      )}

                      <button
                        disabled={!retiradoPor || (retiradoPor === 'Outros' && !retiradoPorDetalhe.trim())}
                        onClick={() => {
                          const detalhe = retiradoPor === 'Outros' ? retiradoPorDetalhe.trim() : undefined;
                          onDeliver(family, 'Entregue', retiradoPor!, detalhe);
                          reset();
                        }}
                        className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold shadow-lg disabled:opacity-50"
                      >
                        Confirmar
                      </button>
                    </div>
                  )}
                </div>
              </div>,
              document.body
            )
          : null
      )}
    </>
  );
};

export default DeliveryManager;
