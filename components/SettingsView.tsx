
import React, { useState } from 'react';
import { Database, HelpCircle, Copy, Check } from 'lucide-react';

const SettingsView: React.FC = () => {
  const [copied, setCopied] = useState(false);

  const sqlCode = `-- ==========================
-- SSVP • Supabase (Auth + RLS)
-- ==========================

-- (Opcional) Coluna updated_at automática
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- TABELA DE FAMÍLIAS
CREATE TABLE IF NOT EXISTS public.families (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  ficha TEXT,
  "dataCadastro" TEXT,
  "nomeAssistido" TEXT,
  "estadoCivil" TEXT,
  nascimento TEXT,
  idade INTEGER,
  endereco TEXT,
  bairro TEXT,
  telefone TEXT,
  whatsapp BOOLEAN,
  cpf TEXT,
  rg TEXT,
  filhos BOOLEAN,
  "filhosCount" INTEGER,
  "moradoresCount" INTEGER,
  renda TEXT,
  comorbidade TEXT,
  "situacaoImovel" TEXT,
  observacao TEXT,
  status TEXT,
  ocupacao TEXT,
  "observacaoOcupacao" TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS set_updated_at_families ON public.families;
CREATE TRIGGER set_updated_at_families
BEFORE UPDATE ON public.families
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS families_user_id_idx ON public.families(user_id);

ALTER TABLE public.families ENABLE ROW LEVEL SECURITY;
CREATE POLICY "families_owner_all"
ON public.families
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- TABELA DE MEMBROS
CREATE TABLE IF NOT EXISTS public.members (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  "familyId" TEXT NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,

  nome TEXT,
  parentesco TEXT,
  nascimento TEXT,
  idade INTEGER,
  ocupacao TEXT,
  "observacaoOcupacao" TEXT,
  renda TEXT,
  comorbidade TEXT,
  escolaridade TEXT,
  trabalho TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS set_updated_at_members ON public.members;
CREATE TRIGGER set_updated_at_members
BEFORE UPDATE ON public.members
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS members_user_id_idx ON public.members(user_id);
CREATE INDEX IF NOT EXISTS members_family_id_idx ON public.members("familyId");

ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members_owner_all"
ON public.members
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- TABELA DE VISITAS
CREATE TABLE IF NOT EXISTS public.visits (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  "familyId" TEXT NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,

  data TEXT,
  vicentinos TEXT[],
  relato TEXT,
  motivo TEXT,
  "necessidadesIdentificadas" TEXT[],

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS set_updated_at_visits ON public.visits;
CREATE TRIGGER set_updated_at_visits
BEFORE UPDATE ON public.visits
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS visits_user_id_idx ON public.visits(user_id);
CREATE INDEX IF NOT EXISTS visits_family_id_idx ON public.visits("familyId");

ALTER TABLE public.visits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "visits_owner_all"
ON public.visits
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- TABELA DE ENTREGAS
CREATE TABLE IF NOT EXISTS public.deliveries (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  "familyId" TEXT NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,

  data TEXT,
  tipo TEXT,
  responsavel TEXT,
  observacoes TEXT,
  status TEXT,
  "retiradoPor" TEXT,
  "retiradoPorDetalhe" TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS set_updated_at_deliveries ON public.deliveries;
CREATE TRIGGER set_updated_at_deliveries
BEFORE UPDATE ON public.deliveries
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS deliveries_user_id_idx ON public.deliveries(user_id);
CREATE INDEX IF NOT EXISTS deliveries_family_id_idx ON public.deliveries("familyId");

ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deliveries_owner_all"
ON public.deliveries
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(sqlCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500">
      <section className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200">
        <div className="flex items-center gap-4 mb-8">
          <div className="p-4 bg-emerald-50 text-emerald-600 rounded-2xl">
            <Database size={32} />
          </div>
          <div>
            <h3 className="text-2xl font-bold text-slate-800">Conexão Supabase</h3>
            <p className="text-sm text-slate-500">Este app funciona <strong>somente com Supabase</strong> (sem salvar dados no navegador).</p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
            <p className="text-sm text-slate-700 font-semibold">
              Configure as variáveis de ambiente no deploy (ou em <span className="font-mono">.env.local</span> no dev):
            </p>
            <div className="mt-3 space-y-2 text-xs font-mono text-slate-700">
              <div className="bg-white border border-slate-200 rounded-xl px-4 py-3">VITE_SUPABASE_URL=</div>
              <div className="bg-white border border-slate-200 rounded-xl px-4 py-3">VITE_SUPABASE_ANON_KEY=</div>
            </div>
            <p className="mt-3 text-xs text-slate-500">
              Depois de mudar as variáveis, reinicie o app.
            </p>
          </div>
        </div>
      </section>

      <section className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200">
        <h3 className="text-xl font-bold text-slate-800 mb-8 flex items-center gap-3">
          <HelpCircle size={24} className="text-blue-500" /> Como configurar seu Supabase?
        </h3>
        
        <div className="space-y-8">
          <div className="flex gap-6">
            <div className="w-10 h-10 bg-slate-100 rounded-2xl flex items-center justify-center font-bold text-slate-500 shrink-0">1</div>
            <div>
              <p className="font-bold text-slate-800 text-lg">Crie um projeto gratuito</p>
              <p className="text-sm text-slate-500 mt-1">Acesse <a href="https://supabase.com" target="_blank" className="text-blue-600 font-bold hover:underline">supabase.com</a>, crie uma conta e um novo projeto. Escolha o nome "SSVP" e uma senha forte.</p>
            </div>
          </div>

          <div className="flex gap-6">
            <div className="w-10 h-10 bg-slate-100 rounded-2xl flex items-center justify-center font-bold text-slate-500 shrink-0">2</div>
            <div className="flex-1">
              <p className="font-bold text-slate-800 text-lg">Execute o código SQL</p>
              <p className="text-sm text-slate-500 mt-1 mb-4">No menu lateral do Supabase, vá em <strong>SQL Editor</strong>, clique em <strong>New Query</strong>, cole o código abaixo e clique em <strong>Run</strong>:</p>
              
              <div className="relative group">
                <pre className="bg-slate-900 text-emerald-400 p-6 rounded-2xl text-xs overflow-x-auto max-h-80 font-mono leading-relaxed shadow-inner">
                  {sqlCode}
                </pre>
                <button 
                  onClick={copyToClipboard}
                  className="absolute top-4 right-4 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-white transition-all flex items-center gap-2 text-xs font-bold"
                >
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                  {copied ? 'Copiado!' : 'Copiar SQL'}
                </button>
              </div>
            </div>
          </div>

          <div className="flex gap-6">
            <div className="w-10 h-10 bg-slate-100 rounded-2xl flex items-center justify-center font-bold text-slate-500 shrink-0">3</div>
            <div>
              <p className="font-bold text-slate-800 text-lg">Pegue as credenciais</p>
              <p className="text-sm text-slate-500 mt-1">Vá em <strong>Project Settings &gt; API</strong>. Copie o <strong>Project URL</strong> e a chave <strong>anon public</strong> e cole nos campos acima.</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default SettingsView;
