// server_sqlite.js
const express = require("express");
const cors = require("cors");
const sqlite3 = require("sqlite3").verbose();

const app = express();
app.use(cors());
app.use(express.json());

// ---------- BANCO SQLITE ----------
const dbSqlite = new sqlite3.Database("./jogadores.db");

// cria tabela se não existir
dbSqlite.run(`
  CREATE TABLE IF NOT EXISTS jogadores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT UNIQUE NOT NULL
  )
`);

// ---------- BANCO EM MEMÓRIA ----------
let db = {
  jogadores: [], // jogadores do campeonato atual
  partidas: [],
  fila: [],
  ultimoIdJogador: 0,
  ultimoIdPartida: 0,
  vitoriasConsecutivas: 0,
  ultimoVencedor: null,
};

// ---------- HELPERS ----------
function filaAtivos() {
  return db.fila
    .map((id) => db.jogadores.find((j) => j.id === id))
    .filter((j) => j && j.ativo);
}

function ordenarPorPrioridade(jogadores, jogandoIds = []) {
  const jogandoSet = new Set(jogandoIds || []);
  return [...jogadores].sort((a, b) => {
    const aFora = !jogandoSet.has(a.id);
    const bFora = !jogandoSet.has(b.id);
    if (aFora !== bFora) return aFora ? -1 : 1;
    if (a.jogos !== b.jogos) return a.jogos - b.jogos;
    return a.ordemChegada - b.ordemChegada;
  });
}

function clonePlayer(j) {
  return { ...j };
}

function getJogadorById(id) {
  return db.jogadores.find((j) => j.id === id) || null;
}

function removeAndReappendPreservingOrder(idsToMove) {
  const setIds = new Set(idsToMove);
  const ordemOriginal = db.fila.filter((id) => setIds.has(id));
  db.fila = db.fila.filter((id) => !setIds.has(id));
  ordemOriginal.forEach((id) => db.fila.push(id));
}

// ---------- ROTAS BANCO ----------
// listar jogadores cadastrados
app.get("/cadastro", (req, res) => {
  dbSqlite.all("SELECT * FROM jogadores ORDER BY nome ASC", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// cadastrar novo jogador
app.post("/cadastro", (req, res) => {
  const { nome } = req.body;
  if (!nome) return res.status(400).json({ error: "Nome é obrigatório" });

  dbSqlite.run("INSERT INTO jogadores (nome) VALUES (?)", [nome], function (err) {
    if (err) return res.status(400).json({ error: "Nome já cadastrado" });
    res.json({ id: this.lastID, nome });
  });
});

// ---------- ROTAS CAMPEONATO ----------
// listar jogadores do campeonato
app.get("/jogadores", (req, res) => {
  res.json(db.jogadores);
});

// adicionar jogador ao campeonato (da lista do banco)
app.post("/jogadores", (req, res) => {
  const { id, nome } = req.body;
  if (!nome) return res.status(400).json({ error: "Nome é obrigatório" });
  if (db.jogadores.some((j) => j.nome === nome)) {
    return res.status(400).json({ error: "Jogador já está no campeonato" });
  }

  const novo = {
    id: ++db.ultimoIdJogador,
    nome,
    jogos: 0,
    vitorias: 0,
    ativo: true,
    ordemChegada: db.ultimoIdJogador,
  };

  db.jogadores.push(novo);
  db.fila.push(novo.id);
  res.json(novo);
});

// habilitar/desabilitar jogador
app.post("/jogadores/:id/ativo", (req, res) => {
  const { id } = req.params;
  const { ativo } = req.body;
  const jogador = getJogadorById(Number(id));
  if (!jogador) return res.status(404).json({ error: "Jogador não encontrado" });

  jogador.ativo = !!ativo;
  if (!jogador.ativo) {
    db.fila = db.fila.filter((fid) => fid !== jogador.id);
  } else if (!db.fila.includes(jogador.id)) {
    db.fila.push(jogador.id);
  }
  res.json({ success: true, jogador });
});

// iniciar partida
app.post("/partida", (req, res) => {
  const ativos = filaAtivos();
  if (ativos.length < 12) {
    return res.status(400).json({ message: "Não há jogadores ativos suficientes" });
  }

  let timeA = [];
  let timeB = [];

  if (db.partidas.length === 0) {
    const selecionados = ordenarPorPrioridade(ativos, []).slice(0, 12);
    timeA = selecionados.slice(0, 6).map(clonePlayer);
    timeB = selecionados.slice(6, 12).map(clonePlayer);
  } else {
    const ultima = db.partidas[db.partidas.length - 1];
    if (!ultima.vencedor) {
      return res.status(400).json({ message: "Finalize a última partida antes de iniciar outra." });
    }
    const jogandoIds = [...ultima.timeA.map(p=>p.id), ...ultima.timeB.map(p=>p.id)];

    if (ultima.vencedor === "E") {
      db.vitoriasConsecutivas = 0;
      db.ultimoVencedor = null;
      removeAndReappendPreservingOrder(jogandoIds);
      let candidatosFora = filaAtivos().filter(j => !jogandoIds.includes(j.id));
      candidatosFora = ordenarPorPrioridade(candidatosFora, jogandoIds);
      let candidatos = candidatosFora.slice(0, 12);
      if (candidatos.length < 12) {
        const faltam = 12 - candidatos.length;
        let reaproveitados = filaAtivos().filter(j => jogandoIds.includes(j.id));
        reaproveitados = ordenarPorPrioridade(reaproveitados, jogandoIds).slice(0, faltam);
        candidatos = candidatos.concat(reaproveitados);
      }
      timeA = candidatos.slice(0, 6).map(clonePlayer);
      timeB = candidatos.slice(6, 12).map(clonePlayer);
    }
    else if (db.vitoriasConsecutivas >= 2) {
      db.vitoriasConsecutivas = 0;
      db.ultimoVencedor = null;
      removeAndReappendPreservingOrder(jogandoIds);
      const selecionados = ordenarPorPrioridade(filaAtivos(), []).slice(0, 12);
      let candidatos = selecionados.slice(0, 12);
      if (candidatos.length < 12) {
        const faltam = 12 - candidatos.length;
        let reaproveitados = filaAtivos().filter(j => jogandoIds.includes(j.id));
        reaproveitados = ordenarPorPrioridade(reaproveitados, []).slice(0, faltam);
        candidatos = candidatos.concat(reaproveitados);
      }
      timeA = candidatos.slice(0, 6).map(clonePlayer);
      timeB = candidatos.slice(6, 12).map(clonePlayer);
    }
    else {
      const vencedores = ultima.vencedor === "A" ? ultima.timeA : ultima.timeB;
      const perdedores = ultima.vencedor === "A" ? ultima.timeB : ultima.timeA;
      const perdIds = perdedores.map(p => p.id);
      removeAndReappendPreservingOrder(perdIds);
      timeA = vencedores.map(p => clonePlayer(getJogadorById(p.id)));
      const usados = new Set(timeA.map(p => p.id));
      let candidatos = filaAtivos().filter(j => !usados.has(j.id));
      candidatos = ordenarPorPrioridade(candidatos, []);
      candidatos = candidatos.slice(0, 6);
      timeB = candidatos.map(clonePlayer);
    }
  }

  const partida = {
    id: ++db.ultimoIdPartida,
    timeA,
    timeB,
    vencedor: null,
  };
  db.partidas.push(partida);
  res.json(partida);
});

// registrar resultado
app.post("/resultado", (req, res) => {
  const { id, vencedor } = req.body;
  if (!id || !["A", "B", "E"].includes(vencedor)) {
    return res.status(400).json({ error: "id e vencedor ('A','B','E') obrigatórios" });
  }

  const partida = db.partidas.find((p) => p.id === Number(id));
  if (!partida) return res.status(404).json({ error: "Partida não encontrada" });
  if (partida.vencedor) return res.status(400).json({ error: "Resultado já registrado" });

  partida.vencedor = vencedor;

  const timeA_players = partida.timeA.map((p) => getJogadorById(p.id));
  const timeB_players = partida.timeB.map((p) => getJogadorById(p.id));

  [...timeA_players, ...timeB_players].forEach((j) => { if (j) j.jogos++; });
  if (vencedor === "A") timeA_players.forEach((j) => { if (j) j.vitorias++; });
  if (vencedor === "B") timeB_players.forEach((j) => { if (j) j.vitorias++; });

  if (vencedor === "E") {
    const jogandoIds = [...partida.timeA.map(p=>p.id), ...partida.timeB.map(p=>p.id)];
    removeAndReappendPreservingOrder(jogandoIds);
    db.vitoriasConsecutivas = 0;
    db.ultimoVencedor = null;
  } else {
    const vencedoresIds = vencedor === "A" ? timeA_players.map(j=>j.id) : timeB_players.map(j=>j.id);
    const perdedoresIds = vencedor === "A" ? timeB_players.map(j=>j.id) : timeA_players.map(j=>j.id);
    const ordemVencedores = db.fila.filter(id => vencedoresIds.includes(id));
    const ordemPerdedores = db.fila.filter(id => perdedoresIds.includes(id));
    db.fila = db.fila.filter(id => !vencedoresIds.includes(id) && !perdedoresIds.includes(id));
    ordemVencedores.forEach(id => db.fila.push(id));
    ordemPerdedores.forEach(id => db.fila.push(id));
    if (db.ultimoVencedor === vencedor) {
      db.vitoriasConsecutivas++;
    } else {
      db.vitoriasConsecutivas = 1;
      db.ultimoVencedor = vencedor;
    }
  }

  res.json({ success: true, partida });
});

// listar partidas
app.get("/partidas", (req, res) => res.json(db.partidas));

// reset campeonato
app.post("/reset", (req, res) => {
  db = {
    jogadores: [],
    partidas: [],
    fila: [],
    ultimoIdJogador: 0,
    ultimoIdPartida: 0,
    vitoriasConsecutivas: 0,
    ultimoVencedor: null,
  };
  res.json({ success: true, message: "Campeonato resetado. Jogadores cadastrados foram mantidos." });
});

// ---------- START ----------
const PORT = 4000;
app.listen(PORT, () => console.log(`Backend rodando na porta ${PORT}`));
