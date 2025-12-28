
import { Delivery, Family, Member, UserProfile, Visit } from './types';
import { getSupabaseClient } from './supabase';

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
  // Supabase-only: mantemos um cache em memória para o app funcionar reativo.
  // Fonte de verdade é o Supabase (carregado via loadDbForUser / sincronizado via saveDb).
  return JSON.parse(JSON.stringify(inMemoryDb)) as DbSchema;
};

let inMemoryDb: DbSchema = INITIAL_DATA;

let currentUserId: string | null = null;
export const setCurrentUserId = (userId: string | null) => {
  currentUserId = userId;
};

let suppressSync = false;
let syncTimer: number | null = null;
let pendingDb: DbSchema | null = null;
let syncInFlight: Promise<void> | null = null;
let queuedDb: DbSchema | null = null;

const escapeForInFilter = (value: string) => value.replaceAll("'", "''");
const toInFilter = (values: string[]) => `(${values.map(v => `'${escapeForInFilter(v)}'`).join(',')})`;

const stripMeta = <T extends Record<string, any>>(row: T): Omit<T, 'user_id' | 'created_at' | 'updated_at'> => {
  const { user_id, created_at, updated_at, ...rest } = row as any;
  return rest;
};

// Função auxiliar para adicionar timeout às promises com retry
const withRetry = async <T>(
  promiseFn: () => Promise<T>, 
  timeoutMs: number, 
  maxRetries = 2
): Promise<T> => {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await Promise.race([
        promiseFn(),
        new Promise<T>((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout após ${timeoutMs}ms`)), timeoutMs)
        )
      ]);
    } catch (err: any) {
      if (attempt === maxRetries) throw err;
      const delay = Math.min(1000 * Math.pow(2, attempt), 5000); // Backoff: 1s, 2s, max 5s
      console.warn(`[SSVP][sync] ⚠️ Tentativa ${attempt + 1}/${maxRetries + 1} falhou, tentando novamente em ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error('Todas as tentativas falharam');
};

// Calcular timeout baseado no número de registros
const calculateTimeout = (recordCount: number): number => {
  // Base: 15s, +2s para cada 10 registros, máximo 120s (2 minutos)
  return Math.min(15000 + (Math.ceil(recordCount / 10) * 2000), 120000);
};

const cloneDb = (data: DbSchema): DbSchema => {
  // Evita mutação do snapshot enquanto o sync está rodando
  try {
    const sc = (globalThis as any).structuredClone as undefined | ((v: any) => any);
    if (typeof sc === 'function') return sc(data) as DbSchema;
  } catch {
    // fallback abaixo
  }
  return JSON.parse(JSON.stringify(data)) as DbSchema;
};

const requestSync = async (snapshot: DbSchema, userId: string) => {
  // Garante que só existe 1 sync por vez. Se chegar outro snapshot, guardamos o último e rodamos ao final.
  if (syncInFlight) {
    queuedDb = snapshot;
    return;
  }

  syncInFlight = (async () => {
    await syncDbToSupabase(snapshot, userId);
  })();

  try {
    await syncInFlight;
  } finally {
    syncInFlight = null;
    if (queuedDb) {
      const next = queuedDb;
      queuedDb = null;
      // roda o último snapshot pendente
      await requestSync(next, userId);
    }
  }
};

const scheduleSync = (data: DbSchema) => {
  if (suppressSync) {
    return;
  }
  const supabase = getSupabaseClient();
  if (!supabase) {
    console.error('[SSVP][sync] Supabase não configurado. Este app exige Supabase.');
    return;
  }
  if (!currentUserId) {
    console.warn('[SSVP][sync] ⚠️ currentUserId não definido - aguardando autenticação para sincronizar.');
    return;
  }

  pendingDb = cloneDb(data);
  if (syncTimer) window.clearTimeout(syncTimer);

  syncTimer = window.setTimeout(() => {
    const snapshot = pendingDb;
    pendingDb = null;
    syncTimer = null;
    if (!snapshot || !currentUserId) return;
    console.log('[SSVP][sync] Iniciando sincronização com Supabase...');
    void requestSync(snapshot, currentUserId);
  }, 700);
};

export const saveDb = (data: DbSchema) => {
  inMemoryDb = data;
  scheduleSync(data);
};

export const getUserProfile = (): UserProfile => {
  // Supabase-only: perfil vem do metadata do usuário (session.user.user_metadata).
  // Mantemos um default para telas que ainda dependem desse shape.
  return INITIAL_USER;
};

export const saveUserProfile = (profile: UserProfile) => {
  // Supabase-only: não salva em localStorage. O App deve persistir via supabase.auth.updateUser.
  void profile;
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

export const signIn = async (email: string, password: string) => {
  const supabase = getSupabaseClient();
  if (!supabase) return { data: { session: null }, error: { message: 'Supabase não configurado. Defina as variáveis VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY.' } };
  return await supabase.auth.signInWithPassword({ email, password });
};

export const signUp = async (email: string, password: string, name: string, conference: string) => {
  const supabase = getSupabaseClient();
  if (!supabase) return { data: null, error: { message: 'Supabase não configurado. Defina as variáveis VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY.' } };
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
  if (!supabase) return null;

  const { data, error } = await supabase.auth.getSession();
  if (error) return null;
  return data.session;
};

export const signOut = async () => {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  await supabase.auth.signOut();
};

// =========================
// Supabase: Dados (pull + sync por usuário)
// =========================
export const fetchDbFromSupabase = async (userId: string): Promise<DbSchema> => {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase não configurado.');

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
  if (!supabase || !userId) throw new Error('Supabase não configurado ou usuário não autenticado.');

  const remote = await fetchDbFromSupabase(userId);

  suppressSync = true;
  try {
    inMemoryDb = remote;
  } finally {
    suppressSync = false;
  }

  return JSON.parse(JSON.stringify(remote)) as DbSchema;
};

export const syncDbToSupabase = async (db: DbSchema, userId: string) => {
  const supabase = getSupabaseClient();
  if (!supabase) {
    console.warn('[SSVP][sync] ❌ Supabase não configurado.');
    return;
  }

  const syncTable = async (table: 'families' | 'members' | 'visits' | 'deliveries', rows: any[]) => {
    try {
      console.log(`[SSVP][sync] 📤 Sincronizando ${table}... (${rows.length} registro(s))`);
      
      const BATCH_SIZE = 20; // Processar em batches de 20 registros
      
      if (rows.length === 0) {
        // Se não há registros localmente, não faz nada (mantém o que está no Supabase)
        console.log(`[SSVP][sync] ⏭️ ${table} vazio localmente, pulando sincronização`);
        return;
      }

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
      if (table === 'families' && payload.length > 0) {
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

      if (payload.length <= BATCH_SIZE) {
        // Batch único para poucos registros
        const timeout = calculateTimeout(payload.length);
        const upsertQuery = () => supabase.from(table).upsert(payload, { onConflict: 'id' }) as unknown as Promise<{ error: any; data: any }>;
        const upsertResult = await withRetry(upsertQuery, timeout);
        const { error, data } = upsertResult as { error: any; data: any };
        
        if (error) {
          if (error.code === 'PGRST116' || error.code === '42P01' || (error.message as any)?.includes?.('does not exist')) {
            console.warn(`[SSVP][sync] ⚠️ Tabela ${table} não encontrada. Execute o SQL em Configurações.`);
          } else {
            console.error(`[SSVP][sync] ❌ Erro ao sincronizar ${table}:`, {
              message: error.message,
              code: error.code,
              details: error.details,
              hint: error.hint
            });
            throw error;
          }
        } else {
          console.log(`[SSVP][sync] ✅ ${table} sincronizado com sucesso (${payload.length} registro(s))`);
        }
      } else {
        // Processar em batches para muitos registros
        console.log(`[SSVP][sync] 📦 Processando ${payload.length} registros em batches de ${BATCH_SIZE}...`);
        let successCount = 0;
        
        for (let i = 0; i < payload.length; i += BATCH_SIZE) {
          const batch = payload.slice(i, i + BATCH_SIZE);
          const batchNum = Math.floor(i / BATCH_SIZE) + 1;
          const totalBatches = Math.ceil(payload.length / BATCH_SIZE);
          
          try {
            const timeout = calculateTimeout(batch.length);
            const upsertQuery = () => supabase.from(table).upsert(batch, { onConflict: 'id' }) as unknown as Promise<{ error: any; data: any }>;
            const upsertResult = await withRetry(upsertQuery, timeout);
            const { error, data } = upsertResult as { error: any; data: any };
            
            if (error) {
              if (error.code === 'PGRST116' || error.code === '42P01' || (error.message as any)?.includes?.('does not exist')) {
                console.warn(`[SSVP][sync] ⚠️ Tabela ${table} não encontrada no batch ${batchNum}/${totalBatches}.`);
              } else {
                console.error(`[SSVP][sync] ❌ Erro no batch ${batchNum}/${totalBatches} de ${table}:`, error.message);
                throw error;
              }
            } else {
              successCount += batch.length;
              console.log(`[SSVP][sync] ✅ Batch ${batchNum}/${totalBatches} de ${table} sincronizado (${batch.length} registro(s))`);
            }
          } catch (err: any) {
            console.error(`[SSVP][sync] ❌ Falha no batch ${batchNum}/${totalBatches} de ${table} após retries:`, err?.message || err);
            throw err;
          }
        }
        
        console.log(`[SSVP][sync] ✅ ${table} sincronizado com sucesso (${successCount}/${payload.length} registro(s))`);
      }
    } catch (err: any) {
      if (err.message?.includes('Timeout')) {
        console.error(`[SSVP][sync] ❌ Timeout ao sincronizar ${table} após todas as tentativas`);
      } else {
        console.error(`[SSVP][sync] ❌ Erro ao sincronizar ${table}:`, err?.message || err);
      }
      throw err; // Re-throw para que a sincronização geral saiba que falhou
    }
  };

  // IMPORTANTE: não rodar em paralelo por causa de FK (members/visits/deliveries referenciam families).
  // Se rodar paralelo, pode falhar "foreign key violation" intermitentemente quando cria/edita família + membros.
  await syncTable('families', db.families);
  await syncTable('members', db.members);
  await syncTable('visits', db.visits);
  await syncTable('deliveries', db.deliveries);
  console.log('[SSVP][sync] ✨ Sincronização completa!');
};
