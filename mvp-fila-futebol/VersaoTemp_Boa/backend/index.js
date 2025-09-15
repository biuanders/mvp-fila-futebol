const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");

const app = express();
app.use(cors());
app.use(bodyParser.json());

let jogadores = [];
let partidas = [];
let contadorJogador = 1;
let contadorPartida = 1;

// Adicionar jogador
app.post("/jogadores", (req, res) => {
  const { nome } = req.body;
  if (!nome) return res.status(400).json({ error: "Nome é obrigatório" });
  const jogador = {
    id: contadorJogador++,
    nome,
    ativo: true,
    jogos: 0,
    vitorias: 0,
    ordemChegada: contadorJogador, // usado para desempate
  };
  jogadores.push(jogador);
  res.json(jogador);
});

// Listar jogadores
app.get("/jogadores", (req, res) => {
  res.json(jogadores);
});

// Ativar/desativar jogador
app.post("/jogadores/:id/ativo", (req, res) => {
  const id = parseInt(req.params.id);
  const { ativo } = req.body;
  const jogador = jogadores.find(j => j.id === id);
  if (!jogador) return res.status(404).json({ error: "Jogador não encontrado" });
  jogador.ativo = ativo;
  res.json(jogador);
});

// Iniciar nova partida
app.post("/partida", (req, res) => {
  const ativos = jogadores.filter(j => j.ativo);
  if (ativos.length < 12) {
    return res.json({ message: "É necessário pelo menos 12 jogadores ativos" });
  }

  // Separar quem jogou e quem não jogou a última
  let ultimo = partidas[partidas.length - 1];
  let fora = [];
  let dentro = [];
  if (ultimo) {
    const idsUltima = [...ultimo.timeA, ...ultimo.timeB].map(j => j.id);
    fora = ativos.filter(j => !idsUltima.includes(j.id));
    dentro = ativos.filter(j => idsUltima.includes(j.id));
  } else {
    fora = ativos;
  }

  // Ordenar: menos jogos → ordem de chegada
  const ordenar = arr =>
    arr.sort((a, b) => a.jogos - b.jogos || a.ordemChegada - b.ordemChegada);

  fora = ordenar(fora);
  dentro = ordenar(dentro);

  const candidatos = [...fora, ...dentro];

  const timeA = candidatos.slice(0, 6);
  const timeB = candidatos.slice(6, 12);

  if (timeA.length < 6 || timeB.length < 6) {
    return res.json({ message: "Jogadores insuficientes para formar times" });
  }

  const partida = {
    id: contadorPartida++,
    timeA,
    timeB,
    vencedor: null,
  };

  partidas.push(partida);
  res.json(partida);
});

// Registrar resultado
app.post("/resultado", (req, res) => {
  const { id, vencedor } = req.body; // A | B | E
  const partida = partidas.find(p => p.id === parseInt(id));
  if (!partida) return res.status(404).json({ error: "Partida não encontrada" });

  partida.vencedor = vencedor;

  // Atualiza estatísticas
  partida.timeA.forEach(j => j.jogos++);
  partida.timeB.forEach(j => j.jogos++);

  if (vencedor === "A") {
    partida.timeA.forEach(j => j.vitorias++);
  } else if (vencedor === "B") {
    partida.timeB.forEach(j => j.vitorias++);
  }

  res.json(partida);
});

// Histórico de partidas
app.get("/partidas", (req, res) => {
  res.json(partidas);
});

// Resetar campeonato
app.post("/reset", (req, res) => {
  partidas = [];
  jogadores.forEach(j => {
    j.jogos = 0;
    j.vitorias = 0;
  });
  res.json({ message: "Campeonato resetado" });
});

// Iniciar servidor
app.listen(4000, () => console.log("Servidor rodando em http://localhost:4000"));
