
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Footprints, Plus, Search, Calendar, User, MessageCircle, Edit, X, ChevronDown, Check, Info, ShieldCheck, UserCog, ArrowUpDown } from 'lucide-react';
import { Visit, Family, Member } from '../types';
import { addVisit, updateVisit, updateFamily, getDb } from '../db';
import FamilyManager from './FamilyManager';

interface VisitManagerProps {
  visits: Visit[];
  families: Family[];
  onRefresh: () => void;
}

const VisitManager: React.FC<VisitManagerProps> = ({ visits, families, onRefresh }) => {
  const [isAdding, setIsAdding] = useState(false);
  const [editingVisit, setEditingVisit] = useState<Visit | null>(null);
  const [selectedVisit, setSelectedVisit] = useState<Visit | null>(null);
  
  // Estados para o Searchable Select
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFamily, setSelectedFamily] = useState<Family | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Estados para busca e filtro
  const [familySearch, setFamilySearch] = useState('');
  const [sortOrder, setSortOrder] = useState<'recent' | 'oldest'>('recent');

  // Novos estados para Motivo e Status
  const [motivo, setMotivo] = useState('');
  const [outroMotivo, setOutroMotivo] = useState('');
  const [newFamilyStatus, setNewFamilyStatus] = useState<Family['status']>('Ativo');

  // Necessidades identificadas
  const [necessidades, setNecessidades] = useState<string[]>([]);
  const [novaNecessidade, setNovaNecessidade] = useState('');

  // Estado para o Modal de Atualização de Cadastro
  const [isUpdatingFamily, setIsUpdatingFamily] = useState(false);

  const getFamilyName = (id: string) => families.find(f => f.id === id)?.nomeAssistido || 'Desconhecido';

  // Sincronizar estado inicial ao editar ou selecionar família
  useEffect(() => {
    if (editingVisit) {
      const fam = families.find(f => f.id === editingVisit.familyId);
      if (fam) {
        setSelectedFamily(fam);
        setNewFamilyStatus(fam.status);
      }
      
      const predefinedMotivos = ["Visita de Cadastro", "Visita de Rotina", "Visita de Emergência"];
      if (editingVisit.motivo && predefinedMotivos.includes(editingVisit.motivo)) {
        setMotivo(editingVisit.motivo);
        setOutroMotivo('');
      } else if (editingVisit.motivo) {
        setMotivo('Outros');
        setOutroMotivo(editingVisit.motivo);
      }

      setNecessidades(Array.isArray(editingVisit.necessidadesIdentificadas) ? editingVisit.necessidadesIdentificadas : []);
      setNovaNecessidade('');
    } else if (selectedFamily) {
      // Quando selecionamos uma família, atualizamos o status baseado no que está no DB
      // Mas se o vicentino alterar no form, o estado newFamilyStatus prevalece
      const currentFam = families.find(f => f.id === selectedFamily.id);
      if (currentFam) {
        setNewFamilyStatus(currentFam.status);
      }
      // Novo registro: limpa necessidades
      setNecessidades([]);
      setNovaNecessidade('');
    }
  }, [editingVisit, families, selectedFamily?.id]);

  // Fechar dropdown ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleEdit = (visit: Visit) => {
    setEditingVisit(visit);
    setIsAdding(true);
  };

  const handleCloseForm = () => {
    setIsAdding(false);
    setEditingVisit(null);
    setSearchTerm('');
    setSelectedFamily(null);
    setMotivo('');
    setOutroMotivo('');
    setNecessidades([]);
    setNovaNecessidade('');
  };

  const filteredFamilies = families.filter(f => 
    f.nomeAssistido.toLowerCase().includes(searchTerm.toLowerCase()) ||
    f.ficha.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Filtrar e ordenar visitas
  const filteredAndSortedVisits = useMemo(() => {
    let filtered = visits;

    // Filtrar por busca de família
    if (familySearch.trim()) {
      const searchLower = familySearch.toLowerCase();
      filtered = visits.filter(v => {
        const family = families.find(f => f.id === v.familyId);
        return family && (
          family.nomeAssistido.toLowerCase().includes(searchLower) ||
          family.ficha.toLowerCase().includes(searchLower) ||
          family.bairro.toLowerCase().includes(searchLower)
        );
      });
    }

    // Ordenar por data
    const sorted = [...filtered].sort((a, b) => {
      const dateA = new Date(a.data).getTime();
      const dateB = new Date(b.data).getTime();
      return sortOrder === 'recent' ? dateB - dateA : dateA - dateB;
    });

    return sorted;
  }, [visits, families, familySearch, sortOrder]);

  return (
    <div className="space-y-6">
      {/* Modal de Atualização de Cadastro da Família */}
      {isUpdatingFamily && selectedFamily && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
          <div className="w-full max-w-6xl max-h-[90vh] overflow-y-auto">
             <FamilyManager 
                initialEdit={true}
                family={selectedFamily}
                members={getDb().members.filter(m => m.familyId === selectedFamily.id)}
                onRefresh={() => {
                  onRefresh();
                }}
                onCancelEdit={() => setIsUpdatingFamily(false)}
             />
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h3 className="text-lg font-bold text-slate-800">Histórico Geral de Visitas</h3>
        <button 
          onClick={() => {
            setEditingVisit(null);
            setIsAdding(true);
          }}
          className="bg-emerald-600 text-white px-4 py-2 rounded-xl flex items-center justify-center gap-2 text-sm font-semibold hover:bg-emerald-700 active:bg-emerald-800 transition-all shadow-md shadow-emerald-100 w-full sm:w-auto"
        >
          <Plus size={18} /> Registrar Visita
        </button>
      </div>

      {/* Busca e Filtro */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text"
            value={familySearch}
            onChange={(e) => setFamilySearch(e.target.value)}
            placeholder="Buscar por família, ficha ou bairro..."
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-sm"
          />
        </div>
        <div className="relative">
          <ArrowUpDown className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as 'recent' | 'oldest')}
            className="pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-sm font-medium appearance-none cursor-pointer min-w-[180px]"
          >
            <option value="recent">Mais Recentes</option>
            <option value="oldest">Mais Antigas</option>
          </select>
        </div>
      </div>

      {isAdding && (
        <div className="bg-white p-6 rounded-2xl border-2 border-emerald-100 shadow-sm animate-in slide-in-from-top-4 duration-300">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-bold text-slate-800">{editingVisit ? 'Editar Visita' : 'Novo Registro de Visita'}</h4>
            <button onClick={handleCloseForm} className="text-slate-400 hover:text-slate-600">
              <X size={20} />
            </button>
          </div>
          <form className="space-y-4" onSubmit={(e) => {
            e.preventDefault();
            if (!selectedFamily) {
              alert('Por favor, selecione uma família.');
              return;
            }
            const formData = new FormData(e.currentTarget);
            
            const finalMotivo = motivo === 'Outros' ? outroMotivo : motivo;
            
            const visitData: Visit = {
              id: editingVisit ? editingVisit.id : crypto.randomUUID(),
              familyId: selectedFamily.id,
              data: formData.get('data') as string,
              vicentinos: (formData.get('vicentinos') as string).split(',').map(v => v.trim()),
              relato: formData.get('relato') as string,
              motivo: finalMotivo,
              necessidadesIdentificadas: necessidades
            };
            
            // Atualizar status da família se houver mudança
            if (selectedFamily.status !== newFamilyStatus) {
              updateFamily({
                ...selectedFamily,
                status: newFamilyStatus
              });
            }

            if (editingVisit) {
              updateVisit(visitData);
            } else {
              addVisit(visitData);
            }
            
            handleCloseForm();
            onRefresh();
          }}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {/* Searchable Family Select */}
              <div className="space-y-1 relative md:col-span-2" ref={dropdownRef}>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Família Assistida</label>
                <div className="flex flex-col sm:flex-row gap-3">
                  <div 
                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                    className={`flex-1 p-2.5 bg-slate-50 border ${isDropdownOpen ? 'border-emerald-500 ring-2 ring-emerald-100' : 'border-slate-200'} rounded-xl flex items-center justify-between cursor-pointer transition-all`}
                  >
                    <div className="flex items-center gap-2">
                      <User size={16} className="text-slate-400" />
                      <span className={`text-sm ${selectedFamily ? 'text-slate-800 font-bold' : 'text-slate-400'}`}>
                        {selectedFamily ? selectedFamily.nomeAssistido : 'Selecione a família visitada...'}
                      </span>
                    </div>
                    <ChevronDown size={16} className={`text-slate-400 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
                  </div>
                  
                  {selectedFamily && (
                    <button 
                      type="button"
                      onClick={() => setIsUpdatingFamily(true)}
                      className="px-4 py-2.5 bg-blue-50 border border-blue-100 text-blue-700 rounded-xl text-xs font-bold flex items-center justify-center gap-2 hover:bg-blue-100 transition-all shrink-0"
                    >
                      <UserCog size={16} /> Atualizar Cadastro
                    </button>
                  )}
                </div>

                {isDropdownOpen && (
                  <div className="absolute z-50 top-full left-0 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl p-2 animate-in fade-in zoom-in-95">
                    <div className="relative mb-2">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input 
                        autoFocus
                        type="text"
                        className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        placeholder="Digite o nome ou ficha..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                    <div className="max-h-60 overflow-y-auto space-y-1">
                      {filteredFamilies.length > 0 ? (
                        filteredFamilies.map(f => (
                          <div 
                            key={f.id}
                            onClick={() => {
                              setSelectedFamily(f);
                              setIsDropdownOpen(false);
                              setSearchTerm('');
                            }}
                            className={`p-2 rounded-lg text-sm cursor-pointer flex items-center justify-between ${selectedFamily?.id === f.id ? 'bg-emerald-50 text-emerald-700 font-bold' : 'hover:bg-slate-50 text-slate-700'}`}
                          >
                            <div className="flex flex-col">
                              <span>{f.nomeAssistido}</span>
                              <span className="text-[10px] text-slate-400 uppercase font-bold">Ficha N° {f.ficha} • {f.bairro}</span>
                            </div>
                            {selectedFamily?.id === f.id && <Check size={14} />}
                          </div>
                        ))
                      ) : (
                        <div className="p-4 text-center text-xs text-slate-400 italic">Nenhuma família encontrada</div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Data da Visita</label>
                <input 
                  name="data" 
                  type="date" 
                  required 
                  defaultValue={editingVisit?.data || new Date().toISOString().split('T')[0]}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-sm font-medium" 
                />
              </div>

              {/* Motivo da Visita */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Motivo da Visita</label>
                <select 
                  value={motivo} 
                  onChange={(e) => setMotivo(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-sm font-medium"
                  required
                >
                  <option value="">Selecione o motivo...</option>
                  <option value="Visita de Cadastro">Visita de Cadastro</option>
                  <option value="Visita de Rotina">Visita de Rotina</option>
                  <option value="Visita de Emergência">Visita de Emergência</option>
                  <option value="Outros">Outros</option>
                </select>
              </div>

              {/* Status da Família */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1">
                  Status da Família <ShieldCheck size={12} className="text-blue-500" />
                </label>
                <select 
                  value={newFamilyStatus} 
                  onChange={(e) => setNewFamilyStatus(e.target.value as Family['status'])}
                  className={`w-full p-2.5 border rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-sm font-bold ${
                    newFamilyStatus === 'Ativo' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                    newFamilyStatus === 'Inativo' ? 'bg-slate-50 text-slate-500 border-slate-200' :
                    'bg-amber-50 text-amber-700 border-amber-200'
                  }`}
                  disabled={!selectedFamily}
                >
                  <option value="Ativo">Ativo</option>
                  <option value="Inativo">Inativo</option>
                  <option value="Pendente">Pendente</option>
                </select>
              </div>

              {motivo === 'Outros' && (
                <div className="md:col-span-1 space-y-1 animate-in slide-in-from-top-2">
                  <label className="text-xs font-bold text-slate-500 uppercase">Especifique o Motivo</label>
                  <input 
                    type="text"
                    value={outroMotivo}
                    onChange={(e) => setOutroMotivo(e.target.value)}
                    required
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-sm font-medium" 
                    placeholder="Digite o motivo aqui..."
                  />
                </div>
              )}

              <div className="md:col-span-2 space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Vicentinos Presentes (separados por vírgula)</label>
                <input 
                  name="vicentinos" 
                  placeholder="Ex: João, Maria..." 
                  defaultValue={editingVisit?.vicentinos.join(', ') || ''}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-sm font-medium" 
                />
              </div>
              <div className="md:col-span-2 space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Relato da Visita</label>
                <textarea 
                  name="relato" 
                  rows={4} 
                  defaultValue={editingVisit?.relato || ''}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-sm leading-relaxed" 
                  placeholder="O que foi observado na visita sobre a situação da família, moradia, necessidades identificadas..."
                ></textarea>
              </div>

              <div className="md:col-span-2 space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Necessidades Identificadas</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={novaNecessidade}
                    onChange={(e) => setNovaNecessidade(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const v = novaNecessidade.trim();
                        if (!v) return;
                        setNecessidades(prev => [...prev, v]);
                        setNovaNecessidade('');
                      }
                    }}
                    placeholder="Digite e pressione Enter..."
                    className="flex-1 p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const v = novaNecessidade.trim();
                      if (!v) return;
                      setNecessidades(prev => [...prev, v]);
                      setNovaNecessidade('');
                    }}
                    className="px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 active:bg-emerald-800"
                  >
                    Adicionar
                  </button>
                </div>

                {necessidades.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {necessidades.map((n, idx) => (
                      <span key={idx} className="inline-flex items-center gap-2 px-3 py-1 bg-amber-100 text-amber-800 rounded-full text-xs font-bold">
                        {n}
                        <button
                          type="button"
                          onClick={() => setNecessidades(prev => prev.filter((_, i) => i !== idx))}
                          className="text-amber-900/70 hover:text-amber-900"
                          aria-label="Remover necessidade"
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t border-slate-50">
              <button type="button" onClick={handleCloseForm} className="px-6 py-2.5 text-sm text-slate-500 font-bold hover:bg-slate-100 rounded-xl transition-all">Cancelar</button>
              <button type="submit" className="px-8 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-emerald-100 hover:bg-emerald-700 transition-all flex items-center gap-2">
                <Check size={18} /> {editingVisit ? 'Salvar Alterações' : 'Finalizar Registro'}
              </button>
            </div>
          </form>
        </div>
      )}

      {selectedVisit && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
              onClick={() => setSelectedVisit(null)}
            >
              <div
                className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                  <div className="space-y-1">
                    <h4 className="font-bold text-lg text-slate-800">Detalhes da Visita</h4>
                    <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">
                      {getFamilyName(selectedVisit.familyId)}
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedVisit(null)}
                    className="p-2 hover:bg-slate-100 rounded-full text-slate-500"
                    aria-label="Fechar"
                  >
                    <X size={22} />
                  </button>
                </div>

                <div className="p-6 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-2">
                        <Calendar size={14} /> Data
                      </div>
                      <div className="text-sm font-bold text-slate-800">
                        {new Date(selectedVisit.data + 'T00:00:00').toLocaleDateString('pt-BR')}
                      </div>
                    </div>

                    {selectedVisit.motivo && (
                      <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-2">
                          <Info size={14} /> Motivo
                        </div>
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold uppercase bg-blue-100 text-blue-700">
                          {selectedVisit.motivo}
                        </span>
                      </div>
                    )}

                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 sm:col-span-2">
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-2">
                        <User size={14} /> Vicentinos Presentes
                      </div>
                      <div className="text-sm text-slate-800 font-semibold">
                        {selectedVisit.vicentinos.join(', ') || '-'}
                      </div>
                    </div>
                  </div>

                  <div className="p-4 bg-white rounded-2xl border border-slate-200">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                      <MessageCircle size={14} /> Relato da Visita
                    </div>
                    <div className="text-sm text-slate-700 whitespace-pre-wrap break-words overflow-wrap-anywhere leading-relaxed">
                      {selectedVisit.relato || '-'}
                    </div>
                  </div>

                  {selectedVisit.necessidadesIdentificadas && selectedVisit.necessidadesIdentificadas.length > 0 && (
                    <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100">
                      <div className="text-[10px] font-bold text-amber-600 uppercase tracking-widest mb-2">
                        Necessidades Identificadas
                      </div>
                      <ul className="space-y-1">
                        {selectedVisit.necessidadesIdentificadas.map((n, idx) => (
                          <li key={idx} className="text-sm text-amber-800">• {n}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
                  <button
                    onClick={() => setSelectedVisit(null)}
                    className="px-6 py-3 bg-emerald-600 text-white rounded-xl font-bold shadow-lg shadow-emerald-100"
                  >
                    Fechar
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}

      {filteredAndSortedVisits.length === 0 && familySearch.trim() && (
        <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center">
          <p className="text-slate-500 font-medium">Nenhuma visita encontrada para "{familySearch}"</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredAndSortedVisits.map(v => (
          <div 
            key={v.id} 
            className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-3 group cursor-pointer hover:border-emerald-300 transition-colors"
            onClick={() => setSelectedVisit(v)}
          >
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <h4 className="font-bold text-slate-800">{getFamilyName(v.familyId)}</h4>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400 mt-1 font-medium">
                  <span className="flex items-center gap-1"><Calendar size={12} /> {v.data}</span>
                  {v.motivo && (
                    <span className="flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full text-[10px] font-bold uppercase">
                      <Info size={10} /> {v.motivo}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    handleEdit(v);
                  }}
                  className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                  title="Editar visita"
                >
                  <Edit size={16} />
                </button>
                <div className="bg-emerald-50 text-emerald-600 p-2 rounded-lg">
                  <Footprints size={20} />
                </div>
              </div>
            </div>
            
            <div className="bg-slate-50 p-3 rounded-xl">
              <div className="flex items-start gap-2 mb-2">
                <MessageCircle size={14} className="text-slate-400 mt-0.5 shrink-0" />
                <p className="text-xs text-slate-600 leading-relaxed italic line-clamp-3">{v.relato}</p>
              </div>
              <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-100">
                <User size={12} className="text-slate-400" />
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wide">
                  Por: {v.vicentinos.join(', ')}
                </span>
              </div>
            </div>
          </div>
        ))}
        {visits.length === 0 && (
          <div className="md:col-span-2 py-12 text-center text-slate-400 italic bg-white rounded-2xl border border-dashed border-slate-200">
            Nenhuma visita registrada ainda.
          </div>
        )}
      </div>
    </div>
  );
};

export default VisitManager;
