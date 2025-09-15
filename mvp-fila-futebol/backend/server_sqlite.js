const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// banco em memória
let db = {
  jogadores: [], // { id, nome, jogos, vitorias, ativo }
  partidas: [],
  fila: [],
  ultimoIdJogador: 0,
  ultimoIdPartida: 0,
  vitoriasConsecutivas: 0,
  ultimoVencedor: null,
};

// helpers
function jogadoresAtivos() {
  return db.jogadores.filter(j => j.ativo);
}

// Rotas
app.get("/jogadores", (req, res) => {
  res.json(db.jogadores);
});

app.post("/jogadores", (req, res) => {
  const { nome } = req.body;
  if (!nome || nome.length > 15) {
    return res.status(400).json({ error: "Nome inválido (máx 15 caracteres)" });
  }
  if (db.jogadores.some(j => j.nome.toLowerCase() === nome.toLowerCase())) {
    return res.status(400).json({ error: "Jogador já cadastrado" });
  }
  const novo = { 
    id: ++db.ultimoIdJogador, 
    nome, 
    jogos: 0, 
    vitorias: 0, 
    ativo: false 
  };
  db.jogadores.push(novo);
  res.json(novo);
});

// habilitar/desabilitar jogador no campeonato
app.post("/jogadores/:id/ativo", (req, res) => {
  const { id } = req.params;
  const { ativo } = req.body;
  const jogador = db.jogadores.find(j => j.id == id);
  if (!jogador) return res.status(404).json({ error: "Jogador não encontrado" });
  jogador.ativo = !!ativo;
  res.json(jogador);
});

// iniciar partida
app.post("/partida", (req, res) => {
  const ativos = jogadoresAtivos();
  if (ativos.length < 12) {
    return res.status(400).json({ error: "Não há jogadores ativos suficientes (mínimo 12)" });
  }

  const timeA = ativos.slice(0, 6);
  const timeB = ativos.slice(6, 12);

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
  const partida = db.partidas.find(p => p.id == id);
  if (!partida) return res.status(404).json({ error: "Partida não encontrada" });

  partida.vencedor = vencedor;

  // atualizar estatísticas
  partida.timeA.forEach(j => j.jogos++);
  partida.timeB.forEach(j => j.jogos++);
  if (vencedor === "A") partida.timeA.forEach(j => j.vitorias++);
  if (vencedor === "B") partida.timeB.forEach(j => j.vitorias++);

  res.json(partida);
});

// listar partidas
app.get("/partidas", (req, res) => {
  res.json(db.partidas);
});

// resetar campeonato
app.post("/reset", (req, res) => {
  db.partidas = [];
  db.ultimoIdPartida = 0;
  db.jogadores.forEach(j => {
    j.jogos = 0;
    j.vitorias = 0;
    j.ativo = false; // removemos do campeonato
  });
  res.json({ ok: true });
});

app.listen(4000, () => console.log("Servidor rodando em http://localhost:4000"));
