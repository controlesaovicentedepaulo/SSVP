
import { Delivery, Family, Member, UserProfile, Visit } from './types';
import { getSupabaseClient } from './supabase';

const STORAGE_KEY = 'ssvp_data_v1';
const USER_KEY = 'ssvp_user_v1';
const ACCOUNTS_KEY = 'ssvp_accounts_v1';
const LOCAL_SESSION_KEY = 'ssvp_session';

export interface DbSchema {
  families: Family[];
  members: Member[];
  visits: Visit[];
  deliveries: Delivery[];
}

const INITIAL_DATA: DbSchema = {
  families: [],
  members: [],
  visits: [],
  deliveries: []
};

const INITIAL_USER: UserProfile = {
  name: 'Vicentino',
  initials: 'V',
  conference: 'Conferência SSVP'
};

export const getDb = (): DbSchema => {
  const data = localStorage.getItem(STORAGE_KEY);
  return data ? JSON.parse(data) : INITIAL_DATA;
};

let currentUserId: string | null = null;
export const setCurrentUserId = (userId: string | null) => {
  currentUserId = userId;
};

let suppressSync = false;
let syncTimer: number | null = null;
let pendingDb: DbSchema | null = null;

const escapeForInFilter = (value: string) => value.replaceAll("'", "''");
const toInFilter = (values: string[]) => `(${values.map(v => `'${escapeForInFilter(v)}'`).join(',')})`;

const stripMeta = <T extends Record<string, any>>(row: T): Omit<T, 'user_id' | 'created_at' | 'updated_at'> => {
  const { user_id, created_at, updated_at, ...rest } = row as any;
  return rest;
};

const scheduleSync = (data: DbSchema) => {
  if (suppressSync) {
    return;
  }
  const supabase = getSupabaseClient();
  if (!supabase) {
    return;
  }
  if (!currentUserId) {
    console.warn('[SSVP][sync] ⚠️ currentUserId não definido - salvando apenas no localStorage. Faça login novamente para sincronizar com o Supabase.');
    return;
  }

  pendingDb = data;
  if (syncTimer) window.clearTimeout(syncTimer);

  syncTimer = window.setTimeout(() => {
    const snapshot = pendingDb;
    pendingDb = null;
    syncTimer = null;
    if (!snapshot || !currentUserId) return;
    console.log('[SSVP][sync] Iniciando sincronização com Supabase...');
    void syncDbToSupabase(snapshot, currentUserId);
  }, 700);
};

export const saveDb = (data: DbSchema) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  scheduleSync(data);
};

export const getUserProfile = (): UserProfile => {
  const data = localStorage.getItem(USER_KEY);
  return data ? JSON.parse(data) : INITIAL_USER;
};

export const saveUserProfile = (profile: UserProfile) => {
  localStorage.setItem(USER_KEY, JSON.stringify(profile));
};

// CRUD Helpers (local + sync)
export const addFamily = (family: Family) => {
  const db = getDb();
  db.families.push(family);
  saveDb(db);
};

export const updateFamily = (family: Family) => {
  const db = getDb();
  const index = db.families.findIndex(f => f.id === family.id);
  if (index !== -1) {
    db.families[index] = family;
    saveDb(db);
  }
};

export const deleteFamily = (familyId: string) => {
  const db = getDb();
  // Remove a família
  db.families = db.families.filter(f => f.id !== familyId);
  // Remove membros relacionados
  db.members = db.members.filter(m => m.familyId !== familyId);
  // Remove visitas relacionadas
  db.visits = db.visits.filter(v => v.familyId !== familyId);
  // Remove entregas relacionadas
  db.deliveries = db.deliveries.filter(d => d.familyId !== familyId);
  saveDb(db);
};

export const addVisit = (visit: Visit) => {
  const db = getDb();
  db.visits.push(visit);
  saveDb(db);
};

export const updateVisit = (visit: Visit) => {
  const db = getDb();
  const index = db.visits.findIndex(v => v.id === visit.id);
  if (index !== -1) {
    db.visits[index] = visit;
    saveDb(db);
  }
};

export const addDelivery = (delivery: Delivery) => {
  const db = getDb();
  db.deliveries.push(delivery);
  saveDb(db);
};

// =========================
// Supabase: Auth (fallback local)
// =========================
const signInLocal = async (email: string, password: string) => {
  const accountsStr = localStorage.getItem(ACCOUNTS_KEY);
  const accounts = accountsStr ? JSON.parse(accountsStr) : [];

  const user = accounts.find((a: any) => a.email === email && a.password === password);

  if (user) {
    const session = { user: { email: user.email, user_metadata: user.metadata } };
    localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(session));
    return { data: { session }, error: null };
  }

  return { data: { session: null }, error: { message: 'E-mail ou senha incorretos.' } };
};

const signUpLocal = async (email: string, password: string, name: string, conference: string) => {
  const accountsStr = localStorage.getItem(ACCOUNTS_KEY);
  const accounts = accountsStr ? JSON.parse(accountsStr) : [];

  if (accounts.some((a: any) => a.email === email)) {
    return { data: null, error: { message: 'Este e-mail já está cadastrado localmente.' } };
  }

  const newUser = {
    email,
    password,
    metadata: {
      full_name: name,
      conference: conference
    }
  };

  accounts.push(newUser);
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
  return { data: { user: newUser }, error: null };
};

export const signIn = async (email: string, password: string) => {
  const supabase = getSupabaseClient();
  if (!supabase) return signInLocal(email, password);
  return await supabase.auth.signInWithPassword({ email, password });
};

export const signUp = async (email: string, password: string, name: string, conference: string) => {
  const supabase = getSupabaseClient();
  if (!supabase) return signUpLocal(email, password, name, conference);
  return await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: name,
        conference
      }
    }
  });
};

export const getSession = async () => {
  const supabase = getSupabaseClient();
  if (!supabase) {
    const session = localStorage.getItem(LOCAL_SESSION_KEY);
    return session ? JSON.parse(session) : null;
  }

  const { data, error } = await supabase.auth.getSession();
  if (error) return null;
  return data.session;
};

export const signOut = async () => {
  const supabase = getSupabaseClient();
  if (!supabase) {
    localStorage.removeItem(LOCAL_SESSION_KEY);
    return;
  }
  await supabase.auth.signOut();
};

// =========================
// Supabase: Dados (pull + sync por usuário)
// =========================
export const fetchDbFromSupabase = async (userId: string): Promise<DbSchema> => {
  const supabase = getSupabaseClient();
  if (!supabase) return getDb();

  const [familiesRes, membersRes, visitsRes, deliveriesRes] = await Promise.all([
    supabase.from('families').select('*').eq('user_id', userId),
    supabase.from('members').select('*').eq('user_id', userId),
    supabase.from('visits').select('*').eq('user_id', userId),
    supabase.from('deliveries').select('*').eq('user_id', userId)
  ]);

  // Se as tabelas não existirem (404) ou houver erro de RLS, retorna dados locais
  const hasTableError = [familiesRes, membersRes, visitsRes, deliveriesRes].some(
    res => res.error && (res.error.code === 'PGRST116' || res.error.code === '42P01' || res.status === 404)
  );

  if (hasTableError) {
    console.warn('[SSVP] Tabelas não encontradas no Supabase. Usando dados locais. Execute o SQL em Configurações.');
    return getDb();
  }

  // Outros erros também retornam dados locais (sem quebrar o app)
  if (familiesRes.error || membersRes.error || visitsRes.error || deliveriesRes.error) {
    console.warn('[SSVP] Erro ao buscar dados do Supabase. Usando dados locais.', {
      families: familiesRes.error?.message,
      members: membersRes.error?.message,
      visits: visitsRes.error?.message,
      deliveries: deliveriesRes.error?.message
    });
    return getDb();
  }

  const visits = (visitsRes.data ?? []).map((v: any) => {
    const clean = stripMeta(v) as Visit;
    return {
      ...clean,
      vicentinos: Array.isArray((clean as any).vicentinos) ? (clean as any).vicentinos : [],
      necessidadesIdentificadas: Array.isArray((clean as any).necessidadesIdentificadas)
        ? (clean as any).necessidadesIdentificadas
        : []
    };
  });

  return {
    families: (familiesRes.data ?? []).map((f: any) => stripMeta(f) as Family),
    members: (membersRes.data ?? []).map((m: any) => stripMeta(m) as Member),
    visits,
    deliveries: (deliveriesRes.data ?? []).map((d: any) => stripMeta(d) as Delivery)
  };
};

export const loadDbForUser = async (userId: string | null): Promise<DbSchema> => {
  const supabase = getSupabaseClient();
  if (!supabase || !userId) return getDb();

  const remote = await fetchDbFromSupabase(userId);

  suppressSync = true;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(remote));
  } finally {
    suppressSync = false;
  }

  return remote;
};

export const syncDbToSupabase = async (db: DbSchema, userId: string) => {
  const supabase = getSupabaseClient();
  if (!supabase) return;

  const syncTable = async (table: 'families' | 'members' | 'visits' | 'deliveries', rows: any[]) => {
    try {
      const ids = rows.map(r => r.id).filter(Boolean) as string[];

      if (ids.length === 0) {
        const { error } = await supabase.from(table).delete().eq('user_id', userId);
        if (error && error.code !== 'PGRST116' && error.code !== '42P01') {
          console.warn(`[SSVP] Erro ao deletar de ${table}:`, error.message);
        }
      } else {
        const { error } = await supabase.from(table).delete().eq('user_id', userId).not('id', 'in', toInFilter(ids));
        if (error && error.code !== 'PGRST116' && error.code !== '42P01') {
          console.warn(`[SSVP] Erro ao limpar ${table}:`, error.message);
        }
      }

        if (rows.length > 0) {
          // Remove campos undefined e strings vazias antes de salvar (Supabase não aceita undefined)
          const payload = rows.map(r => {
            const clean: any = { ...r, user_id: userId };
            Object.keys(clean).forEach(key => {
              // Remove undefined e strings vazias (exceto campos obrigatórios)
              if (clean[key] === undefined || (typeof clean[key] === 'string' && clean[key].trim() === '' && key !== 'id' && key !== 'user_id')) {
                delete clean[key];
              }
            });
            return clean;
          });

          // Debug leve (sem PII): confirma campos enviados
          if (table === 'families') {
            const sample = payload[0];
            if (sample) {
              console.info('[SSVP][sync] families payload keys:', Object.keys(sample).sort());
              console.info('[SSVP][sync] families sample flags:', {
                has_ocupacao: Object.prototype.hasOwnProperty.call(sample, 'ocupacao'),
                has_observacaoOcupacao: Object.prototype.hasOwnProperty.call(sample, 'observacaoOcupacao'),
                id: sample.id
              });
            }
          }

          const { error, data } = await supabase.from(table).upsert(payload, { onConflict: 'id' });
          if (error) {
            // Se a tabela não existe (404/PGRST116), apenas loga e continua
            if (error.code === 'PGRST116' || error.code === '42P01' || (error.message as any)?.includes?.('does not exist')) {
              console.warn(`[SSVP] Tabela ${table} não encontrada. Execute o SQL em Configurações.`, error);
            } else {
              console.error(`[SSVP] ❌ Erro ao sincronizar ${table}:`, {
                message: error.message,
                code: error.code,
                details: error.details,
                hint: error.hint
              });
            }
          } else {
            console.log(`[SSVP][sync] ✅ ${table} sincronizado com sucesso (${payload.length} registro(s))`);
          }
        }
    } catch (err: any) {
      // Erros não críticos: apenas loga e continua
      console.warn(`[SSVP] Erro ao sincronizar ${table}:`, err?.message || err);
    }
  };

  await syncTable('families', db.families);
  await syncTable('members', db.members);
  await syncTable('visits', db.visits);
  await syncTable('deliveries', db.deliveries);
};
