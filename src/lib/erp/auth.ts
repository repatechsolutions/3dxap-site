import { getSupabase, hasCloudBackend } from "../store";
import { isListedOperator, operatorName } from "./operators";
import { StockError, type ErpUser } from "./types";

const MOCK_SESSION = "3dxap-erp-mock-email";
const listeners = new Set<(user: ErpUser | null) => void>();

export function usesMemoryAuth(): boolean {
  return !hasCloudBackend;
}

function readMock(): ErpUser | null {
  const email = sessionStorage.getItem(MOCK_SESSION);
  if (!email) return null;
  return { email, name: operatorName(email) };
}

function emit(user: ErpUser | null) {
  for (const listener of listeners) listener(user);
}

async function assertOperator(): Promise<ErpUser> {
  const client = getSupabase();
  if (!client) throw new StockError("not_ready");
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData.user?.email) {
    await client.auth.signOut();
    throw new StockError("not_operator");
  }
  const { data, error } = await client.rpc("erp_is_operator");
  if (error) {
    await client.auth.signOut();
    if (/erp_is_operator|schema cache|PGRST202/i.test(error.message)) {
      throw new StockError("not_ready");
    }
    throw new StockError("not_operator");
  }
  if (data !== true) {
    await client.auth.signOut();
    throw new StockError("not_operator");
  }
  return { email: userData.user.email, name: operatorName(userData.user.email) };
}

export async function signInWithPassword(email: string, password: string): Promise<ErpUser> {
  const normalized = email.trim().toLowerCase();
  if (!normalized || !password) throw new StockError("not_operator");
  if (usesMemoryAuth()) {
    if (!isListedOperator(normalized)) throw new StockError("not_operator");
    const user = { email: normalized, name: operatorName(normalized) };
    sessionStorage.setItem(MOCK_SESSION, normalized);
    emit(user);
    return user;
  }
  const client = getSupabase();
  if (!client) throw new StockError("not_ready");
  const { error } = await client.auth.signInWithPassword({ email: normalized, password });
  if (error) throw new StockError("not_operator");
  const user = await assertOperator();
  emit(user);
  return user;
}

export async function sendMagicLink(email: string): Promise<"sent" | "mock"> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) throw new StockError("not_operator");
  if (usesMemoryAuth()) {
    if (!isListedOperator(normalized)) throw new StockError("not_operator");
    const user = { email: normalized, name: operatorName(normalized) };
    sessionStorage.setItem(MOCK_SESSION, normalized);
    emit(user);
    return "mock";
  }
  const client = getSupabase();
  if (!client) throw new StockError("not_ready");
  const { error } = await client.auth.signInWithOtp({
    email: normalized,
    options: { emailRedirectTo: `${window.location.origin}/erp` },
  });
  if (error) throw new StockError("not_operator");
  return "sent";
}

export async function signOut(): Promise<void> {
  if (usesMemoryAuth()) {
    sessionStorage.removeItem(MOCK_SESSION);
    emit(null);
    return;
  }
  const client = getSupabase();
  if (client) await client.auth.signOut();
  emit(null);
}

export function watchSession(cb: (user: ErpUser | null) => void): () => void {
  if (usesMemoryAuth()) {
    cb(readMock());
    listeners.add(cb);
    return () => listeners.delete(cb);
  }
  const client = getSupabase();
  if (!client) {
    cb(null);
    return () => undefined;
  }
  let stop = false;
  void client.auth.getSession().then(async ({ data }) => {
    if (stop) return;
    if (!data.session) {
      cb(null);
      return;
    }
    try {
      cb(await assertOperator());
    } catch {
      cb(null);
    }
  });
  const { data: sub } = client.auth.onAuthStateChange(async (_event, session) => {
    if (!session) {
      cb(null);
      return;
    }
    try {
      cb(await assertOperator());
    } catch {
      cb(null);
    }
  });
  return () => {
    stop = true;
    sub.subscription.unsubscribe();
  };
}

export function authMessage(error: unknown): string {
  if (error instanceof StockError && error.code === "not_ready") {
    return "O Supabase ainda não tem a função de acesso. Aplique supabase/erp_stock.sql.";
  }
  if (error instanceof StockError && error.code === "not_operator") {
    return "Este e-mail não está autorizado, ou a senha não confere.";
  }
  return "Não foi possível entrar.";
}
