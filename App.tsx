
import React, { useState, useEffect, useRef } from 'react';
import { LayoutDashboard, Users, Footprints, Package, Menu, X, User, LogOut, Save, ArrowLeft, Database } from 'lucide-react';
import { AppView, Family, Visit, Delivery, Member, UserProfile } from './types';
import { getDb, loadDbForUser, setCurrentUserId, signOut } from './db';
import { getSupabaseClient, isSupabaseConfigured } from './supabase';
import Dashboard from './components/Dashboard';
import FamilyManager from './components/FamilyManager';
import VisitManager from './components/VisitManager';
import DeliveryManager from './components/DeliveryManager';
import Auth from './components/Auth';
import logoImage from './assets/Logo.jpg';

const App: React.FC = () => {
  const [session, setSession] = useState<any>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [currentView, setCurrentView] = useState<AppView>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [data, setData] = useState(getDb());
  const [userProfile, setUserProfile] = useState<UserProfile>({ name: 'Vicentino', initials: 'V', conference: 'Conferência SSVP' });
  const [selectedFamilyId, setSelectedFamilyId] = useState<string | null>(null);
  
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isEditProfileModalOpen, setIsEditProfileModalOpen] = useState(false);
  const [isLogoutConfirmModalOpen, setIsLogoutConfirmModalOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const [editName, setEditName] = useState(userProfile.name);
  const authUnsubscribeRef = useRef<null | (() => void)>(null);

  useEffect(() => {
    const init = async () => {
      // Cleanup any previous subscription before re-initializing
      authUnsubscribeRef.current?.();
      authUnsubscribeRef.current = null;
      setIsAuthLoading(true);

      const supabase = getSupabaseClient();

      if (!isSupabaseConfigured()) {
        // App supabase-only: sem config, não inicia auth nem carrega dados
        setSession(null);
        setCurrentUserId(null);
        setData(getDb());
        setIsAuthLoading(false);
        return;
      }

      if (supabase) {
        const { data: sessionData } = await supabase.auth.getSession();
        const initialSession = sessionData.session;
        setSession(initialSession);
        setCurrentUserId(initialSession?.user?.id ?? null);
        if (initialSession) updateProfileFromSession(initialSession);
        if (initialSession?.user?.id) {
          try {
            const loaded = await loadDbForUser(initialSession.user.id);
            setData(loaded);
          } catch (err) {
            // Se falhar ao carregar do Supabase, usa dados locais
            console.warn('[SSVP] Erro ao carregar dados do Supabase, usando dados locais:', err);
            setData(getDb());
          }
        }

        const { data } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
          setSession(newSession);
          setCurrentUserId(newSession?.user?.id ?? null);

          if (newSession) {
            updateProfileFromSession(newSession);
            try {
              const loaded = await loadDbForUser(newSession.user.id);
              setData(loaded);
            } catch (err) {
              // Se falhar ao carregar do Supabase, usa dados locais
              console.warn('[SSVP] Erro ao carregar dados do Supabase, usando dados locais:', err);
              setData(getDb());
            }
          } else {
            setData(getDb());
          }
        });

        authUnsubscribeRef.current = () => data.subscription.unsubscribe();
      }

      setIsAuthLoading(false);
    };

    void init();

    return () => {
      authUnsubscribeRef.current?.();
      authUnsubscribeRef.current = null;
    };
  }, []);

  const updateProfileFromSession = (session: any) => {
    const meta = session.user.user_metadata;
    if (meta) {
      const name = meta.full_name || 'Vicentino';
      const conference = meta.conference || 'Conferência SSVP';
      const initials = name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
      const newProfile = { name, conference, initials };
      setUserProfile(newProfile);
      setEditName(name);
    }
  };

  const handleLogout = () => {
    setIsUserMenuOpen(false);
    setIsLogoutConfirmModalOpen(true);
  };

  const confirmLogout = async () => {
    setIsLogoutConfirmModalOpen(false);
    await signOut();
    setSession(null);
    setCurrentUserId(null);
  };

  useEffect(() => {
    if (session) {
      setData(getDb());
    }
  }, [currentView, session]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const initials = editName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
    const newProfile = {
      name: editName,
      conference: userProfile.conference, // Mantém a conferência existente
      initials: initials || 'V'
    };
    try {
      const supabase = getSupabaseClient();
      if (supabase) {
        const { error } = await supabase.auth.updateUser({
          data: {
            full_name: newProfile.name,
            conference: newProfile.conference
          }
        });
        if (error) {
          console.warn('[SSVP] Erro ao atualizar perfil no Supabase:', error.message);
        }
      }
    } catch (err) {
      console.warn('[SSVP] Erro inesperado ao atualizar perfil no Supabase:', err);
    }
    setUserProfile(newProfile);
    setIsEditProfileModalOpen(false);
    setIsUserMenuOpen(false);
  };

  const navigation = [
    { name: 'Painel', view: 'dashboard', icon: LayoutDashboard },
    { name: 'Famílias', view: 'families', icon: Users },
    { name: 'Visitas', view: 'visits', icon: Footprints },
    { name: 'Entregas', view: 'deliveries', icon: Package },
  ];

  if (isAuthLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!session) {
    if (!isSupabaseConfigured()) {
      return (
        <div className="min-h-screen w-full flex items-center justify-center bg-slate-50 p-4">
          <div className="w-full max-w-xl bg-white rounded-[2.5rem] shadow-2xl shadow-slate-200 overflow-hidden border border-slate-100 animate-fade-in">
            <div className="p-8 md:p-10 space-y-5">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-amber-50 text-amber-700 rounded-2xl border border-amber-100">
                  <Database size={22} />
                </div>
                <div>
                  <h1 className="text-xl md:text-2xl font-black text-slate-800 tracking-tight">Configuração obrigatória</h1>
                  <p className="text-sm text-slate-500 font-medium">Este app roda somente com Supabase.</p>
                </div>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
                <p className="text-sm text-slate-700 font-semibold">Defina as variáveis e reinicie:</p>
                <div className="mt-3 space-y-2 text-xs font-mono text-slate-700">
                  <div className="bg-white border border-slate-200 rounded-xl px-4 py-3">VITE_SUPABASE_URL=</div>
                  <div className="bg-white border border-slate-200 rounded-xl px-4 py-3">VITE_SUPABASE_ANON_KEY=</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return <Auth onSuccess={(newSession) => {
      setSession(newSession);
      setCurrentUserId(newSession?.user?.id ?? null);
    }} />;
  }

  const renderView = () => {
    switch (currentView) {
      case 'dashboard':
        return (
          <Dashboard 
            data={data} 
            onViewFamilies={() => setCurrentView('families')} 
            onViewVisits={() => setCurrentView('visits')}
            onViewDeliveries={() => setCurrentView('deliveries')}
          />
        );
      case 'families':
        return (
          <FamilyManager 
            families={data.families} 
            onViewDetails={(id) => {
              setSelectedFamilyId(id);
              setCurrentView('family-details');
            }}
            onRefresh={() => setData(getDb())}
          />
        );
      case 'family-details':
        const family = data.families.find(f => f.id === selectedFamilyId);
        if (!family) return <div className="p-8 text-center text-slate-500">Família não encontrada</div>;
        return (
          <div className="space-y-6">
            <button 
              onClick={() => setCurrentView('families')}
              className="text-blue-600 hover:text-blue-800 flex items-center gap-1 font-medium bg-white px-4 py-2 rounded-xl shadow-sm border border-slate-100"
            >
              <ArrowLeft size={16} /> Voltar para lista
            </button>
            <FamilyManager 
              viewMode="details" 
              family={family} 
              members={data.members.filter(m => m.familyId === family.id)}
              visits={data.visits.filter(v => v.familyId === family.id)}
              deliveries={data.deliveries.filter(d => d.familyId === family.id)}
              onRefresh={() => setData(getDb())}
              onDelete={() => setCurrentView('families')}
            />
          </div>
        );
      case 'visits':
        return <VisitManager visits={data.visits} families={data.families} onRefresh={() => setData(getDb())} />;
      case 'deliveries':
        return <DeliveryManager deliveries={data.deliveries} families={data.families} onRefresh={() => setData(getDb())} />;
      default:
        return <Dashboard data={data} onViewFamilies={() => setCurrentView('families')} onViewVisits={() => setCurrentView('visits')} onViewDeliveries={() => setCurrentView('deliveries')} />;
    }
  };

  return (
    <div className="h-full w-full flex bg-slate-50 overflow-hidden">
      {/* Modal Confirmação Logout */}
      {isLogoutConfirmModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 glass-overlay">
          <div className="bg-white w-full max-w-md rounded-2xl md:rounded-3xl shadow-2xl overflow-hidden animate-fade-in">
            <div className="p-6 md:p-8 space-y-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-rose-50 text-rose-600 rounded-2xl">
                  <LogOut size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-800">Confirmar Saída</h3>
                  <p className="text-sm text-slate-500">Tem certeza que deseja sair da sua conta?</p>
                </div>
              </div>
              <div className="flex gap-3 pt-4">
                <button 
                  onClick={() => setIsLogoutConfirmModalOpen(false)} 
                  className="flex-1 px-6 py-3 border border-slate-200 text-slate-600 rounded-xl text-sm font-bold active:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  onClick={confirmLogout} 
                  className="flex-1 bg-rose-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-rose-100 flex items-center justify-center gap-2 py-3 active:bg-rose-700 transition-colors"
                >
                  <LogOut size={18} /> Sim, Sair
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Perfil */}
      {isEditProfileModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 glass-overlay">
          <div className="bg-white w-full max-w-md rounded-2xl md:rounded-3xl shadow-2xl overflow-hidden animate-fade-in max-h-[90vh] overflow-y-auto">
            <div className="p-4 md:p-6 bg-blue-600 text-white flex items-center justify-between sticky top-0">
              <div className="flex items-center gap-3">
                <User size={20} className="md:w-6 md:h-6" />
                <h4 className="font-bold text-base md:text-lg">Perfil do Usuário</h4>
              </div>
              <button 
                onClick={() => setIsEditProfileModalOpen(false)} 
                className="p-2 hover:bg-white/10 rounded-full transition-colors active:bg-white/20"
              >
                <X size={20} className="md:w-6 md:h-6" />
              </button>
            </div>
            <form onSubmit={handleSaveProfile} className="p-4 md:p-8 space-y-4 md:space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Nome Completo</label>
                <input 
                  type="text" 
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="ssvp-input"
                  required
                />
              </div>
              <div className="pt-4 flex flex-col sm:flex-row gap-3">
                <button 
                  type="button" 
                  onClick={() => setIsEditProfileModalOpen(false)} 
                  className="flex-1 px-6 py-3 border border-slate-200 text-slate-600 rounded-xl text-sm font-bold active:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="flex-1 bg-blue-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-blue-100 flex items-center justify-center gap-2 py-3 active:bg-blue-700 transition-colors"
                >
                  <Save size={18} /> Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Overlay para menu hamburger */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-20"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Menu Hamburger (Drawer) */}
      <aside className={`fixed inset-y-0 left-0 w-64 bg-white border-r border-slate-200 z-30 transition-transform duration-300 ease-in-out ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="h-full flex flex-col">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-bold text-slate-800 text-base">Menu</h2>
            <button 
              onClick={() => setIsSidebarOpen(false)}
              className="p-1 text-slate-400 hover:text-slate-600 active:bg-slate-100 rounded-lg transition-colors"
            >
              <X size={20} />
            </button>
          </div>
          <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
            {navigation.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.view}
                  onClick={() => { setCurrentView(item.view as AppView); setIsSidebarOpen(false); }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${currentView === item.view ? 'bg-blue-50 text-blue-700 shadow-sm' : 'text-slate-600 hover:bg-slate-50'}`}
                >
                  <Icon size={18} />
                  {item.name}
                </button>
              );
            })}
          </nav>
          <div className="p-4 bg-slate-50 border-t border-slate-100">
             <div className="flex items-center gap-2 text-slate-400">
                <Database size={12} />
                <span className="text-[10px] font-bold uppercase">
                  {getSupabaseClient() ? 'Supabase Configurado' : 'DB Local Ativo'}
                </span>
             </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        <header className="h-14 md:h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 md:px-6 sticky top-0 z-10 shrink-0">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <button 
              className="p-2 -ml-1 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors active:bg-slate-200" 
              onClick={() => setIsSidebarOpen(true)}
              aria-label="Abrir menu"
            >
              <Menu size={22} />
            </button>
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <img 
                src={logoImage} 
                alt="SSVP Logo" 
                className="w-8 h-8 md:w-10 md:h-10 object-contain rounded-lg shrink-0"
              />
              <div className="min-w-0 flex-1">
                <h1 className="font-bold text-slate-800 leading-tight text-sm md:text-base truncate">SSVP Brasil</h1>
                <p className="text-[9px] md:text-[10px] text-slate-500 uppercase font-bold tracking-tight truncate">Conferência NSDC</p>
              </div>
            </div>
            <h2 className="hidden md:block text-base md:text-lg font-bold text-slate-800 capitalize truncate ml-6 md:ml-8 mr-4 md:mr-6">
              {navigation.find(n => n.view === currentView)?.name || 'Perfil'}
            </h2>
          </div>
          <div className="relative shrink-0" ref={userMenuRef}>
            <button 
              onClick={() => setIsUserMenuOpen(!isUserMenuOpen)} 
              className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600 font-bold border border-slate-200 hover:border-blue-300 transition-all active:scale-95"
            >
              {userProfile.initials}
            </button>
            {isUserMenuOpen && (
              <div className="absolute top-full right-0 mt-2 w-48 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 p-2 animate-fade-in">
                <button 
                  onClick={() => { setIsEditProfileModalOpen(true); setIsUserMenuOpen(false); }} 
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50 rounded-lg active:bg-slate-100"
                >
                  <User size={16} /> Meu Perfil
                </button>
                <div className="border-t border-slate-100 my-1"></div>
                <button 
                  onClick={handleLogout} 
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm font-semibold text-rose-600 hover:bg-rose-50 rounded-lg active:bg-rose-100"
                >
                  <LogOut size={16} /> Sair
                </button>
              </div>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-3 md:p-4 lg:p-8 bg-slate-50">
          <div className="max-w-7xl mx-auto animate-fade-in">
            {renderView()}
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
