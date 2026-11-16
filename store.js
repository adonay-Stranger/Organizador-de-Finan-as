// Camada de dados: guarda configuração da obra e gastos.
// Dois modos com a mesma interface:
//   - LocalStore: dados só neste aparelho (localStorage)
//   - CloudStore: dados no Firebase Firestore, compartilhados entre contas autorizadas

import { firebaseConfig, OBRA_ID } from "./firebase-config.js";

const FB = "https://www.gstatic.com/firebasejs/10.12.2/";

export const DEFAULT_CONFIG = {
  nome: "Minha Casa",
  meta: 0,
  categorias: [
    "Projeto e documentação", "Terreno", "Fundação", "Estrutura", "Alvenaria",
    "Telhado", "Elétrica", "Hidráulica", "Esquadrias", "Revestimentos e pisos",
    "Pintura", "Mão de obra", "Acabamento", "Móveis planejados", "Outros",
  ].map((nome, i) => ({ id: "c" + (i + 1), nome })),
  fontes: [
    { id: "f1", nome: "Poupança", valor: 0 },
    { id: "f2", nome: "Financiamento", valor: 0 },
    { id: "f3", nome: "Salário", valor: 0 },
    { id: "f4", nome: "FGTS", valor: 0 },
  ],
};

export function novoId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function limparGasto(g) {
  return {
    valor: Math.round(Number(g.valor) || 0),
    data: String(g.data || ""),
    descricao: String(g.descricao || ""),
    categoria: String(g.categoria || ""),
    fonte: String(g.fonte || ""),
    obs: String(g.obs || ""),
  };
}

class LocalStore {
  constructor() {
    this.modo = "local";
    this.key = "minha-obra:v1";
    this.listeners = new Set();
    this.state = { config: { ...DEFAULT_CONFIG }, gastos: [], user: null, pronto: true, logado: true, erro: "" };
    try {
      const raw = localStorage.getItem(this.key);
      if (raw) {
        const d = JSON.parse(raw);
        this.state.config = { ...DEFAULT_CONFIG, ...(d.config || {}) };
        this.state.gastos = Array.isArray(d.gastos) ? d.gastos : [];
      }
    } catch (e) {
      console.warn("Não foi possível ler os dados locais", e);
    }
  }
  emit() { for (const fn of this.listeners) fn(this.state); }
  persist() {
    try {
      localStorage.setItem(this.key, JSON.stringify({ config: this.state.config, gastos: this.state.gastos }));
    } catch (e) {
      this.state.erro = "Não foi possível salvar neste aparelho (memória cheia ou navegação privada).";
    }
    this.state = { ...this.state };
    this.emit();
  }
  subscribe(fn) { this.listeners.add(fn); fn(this.state); return () => this.listeners.delete(fn); }
  async addGasto(g, autor) {
    this.state.gastos = [...this.state.gastos, { ...limparGasto(g), id: novoId(), criadoEm: new Date().toISOString(), criadoPor: autor || "" }];
    this.persist();
  }
  async updateGasto(id, g) {
    this.state.gastos = this.state.gastos.map((x) => (x.id === id ? { ...x, ...limparGasto(g), editadoEm: new Date().toISOString() } : x));
    this.persist();
  }
  async deleteGasto(id) {
    this.state.gastos = this.state.gastos.filter((x) => x.id !== id);
    this.persist();
  }
  async saveConfig(patch) {
    this.state.config = { ...this.state.config, ...patch };
    this.persist();
  }
  async importar({ config, gastos }) {
    if (config) this.state.config = { ...DEFAULT_CONFIG, ...this.state.config, ...config };
    const porId = new Map(this.state.gastos.map((g) => [g.id, g]));
    for (const g of gastos || []) porId.set(g.id || novoId(), { ...g, id: g.id || novoId() });
    this.state.gastos = [...porId.values()];
    this.persist();
  }
}

class CloudStore {
  constructor() {
    this.modo = "nuvem";
    this.listeners = new Set();
    this.unsubs = [];
    this.state = { config: { ...DEFAULT_CONFIG }, gastos: [], user: null, pronto: false, logado: false, authPronto: false, erro: "" };
  }

  async init() {
    const [appMod, authMod, fs] = await Promise.all([
      import(FB + "firebase-app.js"),
      import(FB + "firebase-auth.js"),
      import(FB + "firebase-firestore.js"),
    ]);
    this.fs = fs;
    this.authMod = authMod;
    const app = appMod.initializeApp(firebaseConfig);
    this.auth = authMod.getAuth(app);
    try {
      this.db = fs.initializeFirestore(app, {
        localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }),
      });
    } catch (e) {
      this.db = fs.getFirestore(app);
    }
    this.obraRef = fs.doc(this.db, "obras", OBRA_ID);
    this.gastosRef = fs.collection(this.obraRef, "gastos");

    authMod.onAuthStateChanged(this.auth, (user) => {
      this.unsubs.forEach((u) => u());
      this.unsubs = [];
      this.state = { ...this.state, user, logado: !!user, authPronto: true, pronto: false, gastos: [], erro: "" };
      if (user) this.ouvir();
      this.emit();
    });
  }

  ouvir() {
    const fs = this.fs;
    let cfgOk = false, gastosOk = false;
    const marcar = () => { if (cfgOk && gastosOk) this.state.pronto = true; };
    this.unsubs.push(
      fs.onSnapshot(this.obraRef, (snap) => {
        cfgOk = true;
        this.state = { ...this.state, config: { ...DEFAULT_CONFIG, ...(snap.data() || {}) } };
        marcar();
        this.emit();
      }, (e) => this.falha(e)),
      fs.onSnapshot(this.gastosRef, { includeMetadataChanges: true }, (snap) => {
        gastosOk = true;
        this.state = {
          ...this.state,
          gastos: snap.docs.map((d) => ({ id: d.id, ...d.data() })),
          pendente: snap.metadata.hasPendingWrites,
          doCache: snap.metadata.fromCache,
        };
        marcar();
        this.emit();
      }, (e) => this.falha(e)),
    );
  }

  falha(e) {
    console.error(e);
    this.state = {
      ...this.state,
      pronto: true,
      erro: e && e.code === "permission-denied"
        ? "Sua conta não tem permissão para ver esta obra. Confira se o seu e-mail está nas regras do Firestore (veja o README)."
        : "Erro ao falar com o servidor: " + (e && e.message ? e.message : e),
    };
    this.emit();
  }

  emit() { for (const fn of this.listeners) fn(this.state); }
  subscribe(fn) { this.listeners.add(fn); fn(this.state); return () => this.listeners.delete(fn); }

  entrar(email, senha) { return this.authMod.signInWithEmailAndPassword(this.auth, email, senha); }
  sair() { return this.authMod.signOut(this.auth); }
  recuperarSenha(email) { return this.authMod.sendPasswordResetEmail(this.auth, email); }

  // As escritas do Firestore ficam na fila local quando não há internet e
  // são enviadas sozinhas depois; por isso a interface não espera a resposta.
  addGasto(g, autor) {
    return this.fs.addDoc(this.gastosRef, { ...limparGasto(g), criadoEm: new Date().toISOString(), criadoPor: autor || "" });
  }
  updateGasto(id, g) {
    return this.fs.updateDoc(this.fs.doc(this.gastosRef, id), { ...limparGasto(g), editadoEm: new Date().toISOString() });
  }
  deleteGasto(id) { return this.fs.deleteDoc(this.fs.doc(this.gastosRef, id)); }
  saveConfig(patch) { return this.fs.setDoc(this.obraRef, patch, { merge: true }); }

  async importar({ config, gastos }) {
    const fs = this.fs;
    if (config) await fs.setDoc(this.obraRef, config, { merge: true });
    const lista = gastos || [];
    for (let i = 0; i < lista.length; i += 400) {
      const batch = fs.writeBatch(this.db);
      for (const g of lista.slice(i, i + 400)) {
        const { id, ...resto } = g;
        batch.set(fs.doc(this.gastosRef, id || novoId()), resto);
      }
      await batch.commit();
    }
  }
}

export async function criarStore() {
  if (firebaseConfig && firebaseConfig.apiKey) {
    const s = new CloudStore();
    await s.init();
    return s;
  }
  return new LocalStore();
}
