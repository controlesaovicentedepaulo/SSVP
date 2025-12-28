
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

// Sistema de callbacks para notificar mudanças no DB
type DbChangeCallback = (data: DbSchema) => void;
let dbChangeCallbacks: DbChangeCallback[] = [];

export const subscribeToDbChanges = (callback: DbChangeCallback): (() => void) => {
  dbChangeCallbacks.push(callback);
  // Retorna função para unsubscribe
  return () => {
    dbChangeCallbacks = dbChangeCallbacks.filter(cb => cb !== callback);
  };
};

const notifyDbChange = (data: DbSchema) => {
  // Notifica todos os callbacks sobre a mudança
  dbChangeCallbacks.forEach(cb => {
    try {
      cb(JSON.parse(JSON.stringify(data)) as DbSchema);
    } catch (err) {
      console.warn('[SSVP] Erro ao notificar mudança no DB:', err);
    }
  });
};

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
      // Loga o erro real antes de tentar novamente
      const errorType = err.message?.includes('Timeout') ? 'timeout' : 'outro erro';
      const errorInfo = err.error || err;
      
      console.warn(`[SSVP][sync] ⚠️ Tentativa ${attempt + 1}/${maxRetries + 1} falhou (${errorType}):`, {
        message: errorInfo?.message || err.message || err,
        code: errorInfo?.code || err.code,
        details: errorInfo?.details || err.details,
        hint: errorInfo?.hint || err.hint
      });
      
      if (attempt === maxRetries) throw err;
      
      // Para erros não-timeout, tenta uma vez mais antes de desistir (pode ser erro de rede transitório)
      // Mas para erros de validação/FK claros, para imediatamente
      if (!err.message?.includes('Timeout')) {
        const isValidationError = err.code === '23505' || err.code === '23503' || err.code === '42P01' || err.code === 'PGRST116';
        if (isValidationError && attempt < maxRetries) {
          // Para erros de validação conhecidos, tenta mais uma vez com delay menor
          console.warn(`[SSVP][sync] ⚠️ Erro de validação/FK detectado, tentando mais uma vez...`);
          const delay = 500; // Delay menor para erros de validação
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        // Se já tentou tudo ou é erro definitivo, para
        if (attempt === maxRetries) {
          console.error(`[SSVP][sync] ❌ Erro não-timeout após todas as tentativas:`, err?.message || err);
        }
        throw err;
      }
      
      const delay = Math.min(1000 * Math.pow(2, attempt), 5000); // Backoff: 1s, 2s, max 5s
      console.warn(`[SSVP][sync] ⚠️ Tentando novamente em ${delay}ms...`);
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
  // Notifica todos os listeners sobre a mudança IMEDIATAMENTE
  notifyDbChange(data);
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
    // Notifica mudanças quando carrega dados do Supabase
    notifyDbChange(remote);
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

  // Array para rastrear quais tabelas falharam (para não parar tudo)
  const failedTables: string[] = [];

  const syncTable = async (table: 'families' | 'members' | 'visits' | 'deliveries', rows: any[]) => {
    try {
      console.log(`[SSVP][sync] 📤 Sincronizando ${table}... (${rows.length} registro(s))`);
      
      const BATCH_SIZE = 20; // Processar em batches de 20 registros
      
      // IDs locais que devem existir no Supabase
      const localIds = rows.map(r => r.id).filter(Boolean) as string[];
      
      // Passo 1: Upsert dos dados locais (se houver)
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
        const upsertQuery = () => {
          const query = supabase.from(table).upsert(payload, { onConflict: 'id' });
          return query as unknown as Promise<{ error: any; data: any }>;
        };
        
        try {
          const upsertResult = await withRetry(upsertQuery, timeout);
          const { error, data } = upsertResult;
          
          if (error) {
            console.error(`[SSVP][sync] ❌ Erro do Supabase ao sincronizar ${table}:`, {
              message: error.message,
              code: error.code,
              details: error.details,
              hint: error.hint
            });
            
            if (error.code === 'PGRST116' || error.code === '42P01' || (error.message as any)?.includes?.('does not exist')) {
              console.warn(`[SSVP][sync] ⚠️ Tabela ${table} não encontrada. Execute o SQL em Configurações.`);
              return; // Não throw, apenas retorna (não é erro crítico)
            } else if (error.code === '23503') {
              // Foreign key violation - pode acontecer se a família ainda não foi criada
              console.error(`[SSVP][sync] ❌ Erro de FK ao sincronizar ${table}:`, error.message);
              console.warn(`[SSVP][sync] ⚠️ Isso pode acontecer se a ordem de sincronização estiver incorreta. Tentando novamente...`);
              throw error; // Re-throw para tentar novamente com retry
            } else {
              throw error; // Re-throw para ser capturado pelo try/catch externo
            }
          } else {
            console.log(`[SSVP][sync] ✅ ${table} sincronizado com sucesso (${payload.length} registro(s))`);
          }
        } catch (err: any) {
          // Erro já foi logado pelo withRetry
          throw err;
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
            const upsertQuery = () => {
              const query = supabase.from(table).upsert(batch, { onConflict: 'id' });
              return query as unknown as Promise<{ error: any; data: any }>;
            };
            
            const upsertResult = await withRetry(upsertQuery, timeout);
            const { error, data } = upsertResult;
            
            if (error) {
              console.error(`[SSVP][sync] ❌ Erro do Supabase no batch ${batchNum}/${totalBatches} de ${table}:`, {
                message: error.message,
                code: error.code,
                details: error.details,
                hint: error.hint
              });
              
              if (error.code === 'PGRST116' || error.code === '42P01' || (error.message as any)?.includes?.('does not exist')) {
                console.warn(`[SSVP][sync] ⚠️ Tabela ${table} não encontrada no batch ${batchNum}/${totalBatches}.`);
                continue; // Pula este batch e continua com os próximos
              } else {
                throw error;
              }
            } else {
              successCount += batch.length;
              console.log(`[SSVP][sync] ✅ Batch ${batchNum}/${totalBatches} de ${table} sincronizado (${batch.length} registro(s))`);
            }
          } catch (err: any) {
            // Erro já foi logado pelo withRetry
            console.error(`[SSVP][sync] ❌ Falha no batch ${batchNum}/${totalBatches} de ${table} após todas as tentativas:`, err?.message || err);
            throw err;
          }
        }
        
        console.log(`[SSVP][sync] ✅ ${table} sincronizado com sucesso (${successCount}/${payload.length} registro(s))`);
      }
      }
      
      // Passo 2: Remover do Supabase os registros que foram deletados localmente
      try {
        // Buscar todos os IDs que existem no Supabase para este usuário
        const { data: existingRecords, error: fetchError } = await supabase
          .from(table)
          .select('id')
          .eq('user_id', userId);
        
        if (fetchError && fetchError.code !== 'PGRST116' && fetchError.code !== '42P01') {
          console.warn(`[SSVP][sync] ⚠️ Não foi possível buscar registros existentes de ${table} para limpeza:`, fetchError.message);
        } else if (existingRecords && existingRecords.length > 0) {
          // IDs que estão no Supabase mas não estão mais localmente
          const existingIds = existingRecords.map((r: any) => r.id).filter(Boolean) as string[];
          const idsToDelete = existingIds.filter(id => !localIds.includes(id));
          
          if (idsToDelete.length > 0) {
            console.log(`[SSVP][sync] 🗑️ Removendo ${idsToDelete.length} registro(s) deletado(s) de ${table}...`);
            
            // Deletar em batches para não sobrecarregar
            for (let i = 0; i < idsToDelete.length; i += BATCH_SIZE) {
              const batchToDelete = idsToDelete.slice(i, i + BATCH_SIZE);
              const timeout = calculateTimeout(batchToDelete.length);
              const deleteQuery = () => {
                const query = supabase.from(table).delete().eq('user_id', userId).in('id', batchToDelete);
                return query as unknown as Promise<{ error: any; data: any }>;
              };
              
              const deleteResult = await withRetry(deleteQuery, timeout);
              if (deleteResult.error) {
                console.warn(`[SSVP][sync] ⚠️ Erro ao deletar registros de ${table}:`, deleteResult.error.message);
              } else {
                console.log(`[SSVP][sync] ✅ ${batchToDelete.length} registro(s) removido(s) de ${table}`);
              }
            }
          }
        }
      } catch (deleteErr: any) {
        // Não quebra a sync se falhar ao deletar, apenas loga
        console.warn(`[SSVP][sync] ⚠️ Erro ao limpar registros deletados de ${table}:`, deleteErr?.message || deleteErr);
      }
      
      // Se não há registros localmente, deleta todos do Supabase para este usuário
      if (rows.length === 0) {
        try {
          console.log(`[SSVP][sync] 🗑️ ${table} vazio localmente, removendo todos os registros do Supabase...`);
          const timeout = calculateTimeout(1);
          const deleteAllQuery = () => {
            const query = supabase.from(table).delete().eq('user_id', userId);
            return query as unknown as Promise<{ error: any; data: any }>;
          };
          
          const deleteAllResult = await withRetry(deleteAllQuery, timeout);
          if (deleteAllResult.error && deleteAllResult.error.code !== 'PGRST116' && deleteAllResult.error.code !== '42P01') {
            console.warn(`[SSVP][sync] ⚠️ Erro ao limpar ${table}:`, deleteAllResult.error.message);
          } else {
            console.log(`[SSVP][sync] ✅ Todos os registros de ${table} removidos do Supabase`);
          }
        } catch (deleteAllErr: any) {
          console.warn(`[SSVP][sync] ⚠️ Erro ao limpar ${table}:`, deleteAllErr?.message || deleteAllErr);
        }
      }
      
    } catch (err: any) {
      if (err.message?.includes('Timeout')) {
        console.error(`[SSVP][sync] ❌ Timeout ao sincronizar ${table} após todas as tentativas`);
      } else {
        console.error(`[SSVP][sync] ❌ Erro ao sincronizar ${table}:`, err?.message || err);
      }
      // Registra a tabela que falhou, mas não re-throw para não parar outras tabelas
      failedTables.push(table);
      console.warn(`[SSVP][sync] ⚠️ Continuando sincronização de outras tabelas mesmo com falha em ${table}`);
      // Não faz throw - permite que outras tabelas sejam sincronizadas
    }
  };

  // IMPORTANTE: não rodar em paralelo por causa de FK (members/visits/deliveries referenciam families).
  // Se rodar paralelo, pode falhar "foreign key violation" intermitentemente quando cria/edita família + membros.
  await syncTable('families', db.families);
  await syncTable('members', db.members);
  await syncTable('visits', db.visits);
  await syncTable('deliveries', db.deliveries);
  
  if (failedTables.length > 0) {
    console.warn(`[SSVP][sync] ⚠️ Sincronização concluída com falhas em: ${failedTables.join(', ')}`);
    console.warn(`[SSVP][sync] ⚠️ As outras tabelas foram sincronizadas com sucesso.`);
  } else {
    console.log('[SSVP][sync] ✨ Sincronização completa!');
  }
};
