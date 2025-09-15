const express = require("express");
const cors = require("cors");
const app = express();
app.use(cors());
app.use(express.json());

// banco em memória
let db = {
  jogadores: [],
  partidas: [],
  fila: [],
  ultimoIdJogador: 0,
  ultimoIdPartida: 0,
  vitoriasConsecutivas: 0,
  ultimoVencedor: null,
};

// rota listar jogadores
app.get("/jogadores", (req, res) => {
  res.json(db.jogadores);
});

// rota adicionar jogador
app.post("/jogadores", (req, res) => {
  const { nome } = req.body;
  if (!nome) return res.status(400).json({ error: "Nome é obrigatório" });
  const novo = { id: ++db.ultimoIdJogador, nome, jogos: 0, vitorias: 0, ativo: true };
  db.jogadores.push(novo);
  db.fila.push(novo.id);
  res.json(novo);
});

// rota atualizar ativo/inativo
app.post("/jogadores/:id/ativo", (req, res) => {
  const { id } = req.params;
  const { ativo } = req.body;
  const jogador = db.jogadores.find(j => j.id === Number(id));
  if (!jogador) return res.status(404).json({ error: "Jogador não encontrado" });
  jogador.ativo = !!ativo;
  res.json({ success: true, jogador });
});

// rota iniciar partida
app.post("/partida", (req, res) => {
  let timeA, timeB;

  const ativos = db.jogadores.filter(j => j.ativo);

  if (db.partidas.length === 0) {
    // primeira partida
const filaAtivos = db.fila.filter(id => ativos.some(j => j.id === id));

// primeiros 6 para time A
const idsA = filaAtivos.slice(0, 6);

// próximos 6 para time B
const idsB = filaAtivos.slice(6, 12);

timeA = idsA.map(id => db.jogadores.find(j => j.id === id)).filter(Boolean);
timeB = idsB.map(id => db.jogadores.find(j => j.id === id)).filter(Boolean);


  } else {
    const ultima = db.partidas[db.partidas.length - 1];
    if (!ultima.vencedor) {
      return res.json({ message: "Finalize a última partida antes de iniciar uma nova." });
    }

    // se houver 2 vitórias consecutivas do mesmo time -> renovar quadra
    if (db.vitoriasConsecutivas >= 2) {
      db.vitoriasConsecutivas = 0;

      // timeA: primeiros 6 da fila ativos
      let idsFila = db.fila.filter(id => ativos.some(j => j.id === id)).splice(0, 6);
      timeA = idsFila.map(id => ativos.find(j => j.id === id)).filter(Boolean);

      // timeB: jogadores ativos que jogaram menos
      let usados = new Set(timeA.map(j => j.id));
      timeB = ativos
        .filter(j => !usados.has(j.id))
        .sort((a, b) => a.jogos - b.jogos)
        .slice(0, 6);

    } else {
      // regra normal
      const vencedores = ultima.vencedor === "A" ? ultima.timeA : ultima.timeB;
      const perdedores = ultima.vencedor === "A" ? ultima.timeB : ultima.timeA;

      timeA = vencedores.filter(j => j.ativo);

      // timeB: pegar até 6 da fila ativos
      let proximosIds = db.fila.filter(id => ativos.some(j => j.id === id)).splice(0, 6);
      timeB = proximosIds.map(id => ativos.find(j => j.id === id));

      // completar com perdedores ativos se faltar
      if (timeB.length < 6) {
        const usados = new Set([...timeA.map(j => j.id), ...timeB.map(j => j.id)]);
        const faltam = 6 - timeB.length;
        const extras = perdedores.filter(j => j.ativo && !usados.has(j.id)).slice(0, faltam);
        timeB = timeB.concat(extras);
      }
    }
  }

  // garantir que não repete jogador no mesmo time
  timeA = [...new Map(timeA.map(j => [j.id, j])).values()];
  timeB = [...new Map(timeB.map(j => [j.id, j])).values()];

  // garantir que A e B não compartilham jogadores
  const usadosA = new Set(timeA.map(j => j.id));
  timeB = timeB.filter(j => !usadosA.has(j.id));

  // criar partida
  const partida = {
    id: ++db.ultimoIdPartida,
    timeA,
    timeB,
    vencedor: null,
  };
  db.partidas.push(partida);

  res.json(partida);
});

// rota registrar resultado
app.post("/resultado", (req, res) => {
  const { id, vencedor } = req.body;
  const partida = db.partidas.find(p => p.id === Number(id));
  if (!partida) return res.status(404).json({ error: "Partida não encontrada" });
  if (partida.vencedor) return res.status(400).json({ error: "Resultado já registrado" });

  partida.vencedor = vencedor;

  const timeVencedor = vencedor === "A" ? partida.timeA : partida.timeB;
  const timePerdedor = vencedor === "A" ? partida.timeB : partida.timeA;

  // atualizar estatísticas
  timeVencedor.forEach(j => {
    const jog = db.jogadores.find(x => x.id === j.id);
    jog.jogos++;
    jog.vitorias++;
  });
  timePerdedor.forEach(j => {
    const jog = db.jogadores.find(x => x.id === j.id);
    jog.jogos++;
    db.fila.push(j.id); // perdedor volta pra fila
  });

  // atualizar vitórias consecutivas
  if (db.ultimoVencedor === vencedor) {
    db.vitoriasConsecutivas++;
  } else {
    db.vitoriasConsecutivas = 1;
    db.ultimoVencedor = vencedor;
  }

  res.json({ success: true });
});

// rota histórico
app.get("/partidas", (req, res) => {
  res.json(db.partidas);
});

// rota resetar campeonato
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
  res.json({ success: true });
});

app.listen(4000, () => console.log("Backend rodando na porta 4000"));
