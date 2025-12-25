
import React, { useMemo, useState } from 'react';
import { Users, Footprints, Package, TrendingUp, BarChart3, HeartHandshake } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from 'recharts';
import { Family, Visit, Delivery } from '../types';

interface DashboardProps {
  data: {
    families: Family[];
    visits: Visit[];
    deliveries: Delivery[];
  };
  onViewFamilies: () => void;
  onViewVisits: () => void;
  onViewDeliveries: () => void;
}

const Dashboard: React.FC<DashboardProps> = ({ 
  data, 
  onViewFamilies, 
  onViewVisits, 
  onViewDeliveries
}) => {
  const activeFamiliesCount = data.families.filter(f => f.status === 'Ativo').length;
  const recentVisits = data.visits.length;
  const deliveriesCount = data.deliveries.length;

  // Lógica para contar famílias que buscaram cestas no mês atual
  const now = new Date();
  const currentMonthPrefix = now.toISOString().slice(0, 7); // "YYYY-MM"
  
  const deliveriesThisMonth = data.deliveries.filter(d => 
    d.data.startsWith(currentMonthPrefix) && 
    d.tipo.toLowerCase().includes('cesta')
  );
  
  const uniqueFamiliesThisMonth = new Set(deliveriesThisMonth.map(d => d.familyId)).size;

  const stats = [
    { 
      label: 'Famílias Ativas', 
      value: activeFamiliesCount, 
      icon: Users, 
      color: 'bg-blue-500', 
      trend: 'No cadastro' 
    },
    { 
      label: 'Atendidas (Mês)', 
      value: uniqueFamiliesThisMonth, 
      icon: HeartHandshake, 
      color: 'bg-rose-500', 
      trend: 'Cestas básicas' 
    },
    { 
      label: 'Visitas (Total)', 
      value: recentVisits, 
      icon: Footprints, 
      color: 'bg-emerald-500', 
      trend: 'Acompanhamento' 
    },
    { 
      label: 'Cestas Entregues', 
      value: deliveriesCount, 
      icon: Package, 
      color: 'bg-orange-500', 
      trend: 'Histórico total' 
    },
  ];

  // Estado para período do gráfico
  const [chartPeriod, setChartPeriod] = useState<'6months' | 'year'>('6months');

  // Função para obter nome do mês em português
  const getMonthName = (date: Date) => {
    const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    return months[date.getMonth()];
  };

  // Calcular dados mensais reais do banco
  const monthlyData = useMemo(() => {
    const now = new Date();
    const months: { [key: string]: { cestas: number; ativas: number; name: string } } = {};
    
    // Determinar quantos meses buscar
    const monthsToShow = chartPeriod === '6months' ? 6 : 12;
    
    // Inicializar meses
    for (let i = monthsToShow - 1; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const monthName = getMonthName(date);
      months[monthKey] = { cestas: 0, ativas: 0, name: monthName };
    }

    // Contar cestas entregues por mês
    data.deliveries.forEach(delivery => {
      if (delivery.data) {
        const deliveryDate = new Date(delivery.data + 'T00:00:00');
        const monthKey = `${deliveryDate.getFullYear()}-${String(deliveryDate.getMonth() + 1).padStart(2, '0')}`;
        
        if (months[monthKey] && delivery.tipo?.toLowerCase().includes('cesta')) {
          months[monthKey].cestas += 1;
        }
      }
    });

    // Contar famílias ativas por mês (baseado na data de cadastro)
    data.families.forEach(family => {
      if (family.dataCadastro && family.status === 'Ativo') {
        const cadastroDate = new Date(family.dataCadastro + 'T00:00:00');
        const monthKey = `${cadastroDate.getFullYear()}-${String(cadastroDate.getMonth() + 1).padStart(2, '0')}`;
        
        // Contar a família em todos os meses a partir do cadastro
        Object.keys(months).forEach(key => {
          if (key >= monthKey) {
            months[key].ativas += 1;
          }
        });
      }
    });

    // Converter para array e ordenar
    const monthKeys = Object.keys(months).sort();
    return monthKeys.map(key => ({
      name: months[key].name,
      cestas: months[key].cestas,
      ativas: months[key].ativas
    }));
  }, [data.deliveries, data.families, chartPeriod]);

  const statusData = [
    { name: 'Ativo', value: activeFamiliesCount },
    { name: 'Inativo', value: data.families.filter(f => f.status === 'Inativo').length },
    { name: 'Pendente', value: data.families.filter(f => f.status === 'Pendente').length },
  ];

  const COLORS = ['#3b82f6', '#94a3b8', '#fbbf24'];

  return (
    <div className="space-y-4 md:space-y-8 animate-in fade-in duration-500">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6">
        {stats.map((stat, i) => (
          <div key={i} className="bg-white p-4 md:p-6 rounded-xl md:rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-3 md:mb-4">
              <div className={`${stat.color} p-2 md:p-3 rounded-lg md:rounded-xl text-white`}>
                <stat.icon size={18} className="md:w-6 md:h-6" />
              </div>
              <span className="text-[9px] md:text-[10px] font-bold text-slate-400 bg-slate-50 px-1.5 md:px-2 py-0.5 md:py-1 rounded-full uppercase tracking-wider hidden sm:inline">{stat.trend}</span>
            </div>
            <h3 className="text-slate-500 text-xs md:text-sm font-medium">{stat.label}</h3>
            <p className="text-xl md:text-2xl font-bold text-slate-800 mt-1">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-8">
        <div className="lg:col-span-2 bg-white p-4 md:p-6 rounded-xl md:rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4 md:mb-8">
            <div>
              <h3 className="font-bold text-slate-800 text-sm md:text-base">Atividades Recentes</h3>
              <p className="text-[10px] md:text-xs text-slate-400 font-medium">Cestas Entregues vs. Crescimento de Famílias</p>
            </div>
            <select 
              value={chartPeriod}
              onChange={(e) => setChartPeriod(e.target.value as '6months' | 'year')}
              className="text-xs md:text-sm border-slate-200 rounded-lg bg-slate-50 px-2 py-1.5 md:py-1 focus:outline-none w-full sm:w-auto"
            >
              <option value="6months">Últimos 6 meses</option>
              <option value="year">Este ano</option>
            </select>
          </div>
          <div className="h-64 md:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                <Tooltip 
                  cursor={{fill: '#f8fafc'}} 
                  contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} 
                />
                <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ paddingBottom: '20px', fontSize: '12px', fontWeight: 'bold' }} />
                <Bar dataKey="cestas" name="Cestas Entregues" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={20} />
                <Bar dataKey="ativas" name="Famílias Ativas" fill="#10b981" radius={[4, 4, 0, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-4 md:p-6 rounded-xl md:rounded-2xl border border-slate-200 shadow-sm">
          <h3 className="font-bold text-slate-800 text-sm md:text-base mb-4 md:mb-8">Status das Famílias</h3>
          <div className="h-56 md:h-64 flex flex-col items-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={60}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-3 md:mt-4 space-y-1.5 md:space-y-2 w-full">
              {statusData.map((item, i) => (
                <div key={i} className="flex items-center justify-between text-xs md:text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 md:w-3 md:h-3 rounded-full" style={{backgroundColor: COLORS[i]}} />
                    <span className="text-slate-600">{item.name}</span>
                  </div>
                  <span className="font-semibold text-slate-800">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white p-4 md:p-6 rounded-xl md:rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between mb-4 md:mb-6">
          <h3 className="font-bold text-slate-800 text-sm md:text-base">Ações Rápidas</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
          <button 
            onClick={onViewFamilies} 
            className="p-3 md:p-4 border border-blue-100 bg-blue-50/50 rounded-xl hover:bg-blue-50 active:bg-blue-100 transition-colors flex flex-col items-center gap-2 text-blue-700"
          >
            <Users size={20} className="md:w-6 md:h-6" />
            <span className="text-[10px] md:text-xs font-semibold text-center">Nova Família</span>
          </button>
          <button 
            onClick={onViewVisits} 
            className="p-3 md:p-4 border border-emerald-100 bg-emerald-50/50 rounded-xl hover:bg-emerald-50 active:bg-emerald-100 transition-colors flex flex-col items-center gap-2 text-emerald-700"
          >
            <Footprints size={20} className="md:w-6 md:h-6" />
            <span className="text-[10px] md:text-xs font-semibold text-center">Registrar Visita</span>
          </button>
          <button 
            onClick={onViewDeliveries} 
            className="p-3 md:p-4 border border-orange-100 bg-orange-50/50 rounded-xl hover:bg-orange-50 active:bg-orange-100 transition-colors flex flex-col items-center gap-2 text-orange-700"
          >
            <Package size={20} className="md:w-6 md:h-6" />
            <span className="text-[10px] md:text-xs font-semibold text-center">Nova Entrega</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
