// server.js
const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// banco em memória
let db = {
  jogadores: [],     // lista de objetos { id, nome, jogos, vitorias, ativo, ordemChegada }
  partidas: [],      // lista de partidas { id, timeA: [...players], timeB: [...players], vencedor }
  fila: [],          // array de ids representando a ordem atual da fila
  ultimoIdJogador: 0,
  ultimoIdPartida: 0,
  vitoriasConsecutivas: 0,
  ultimoVencedor: null, // "A", "B" ou "E" / null
};

// ---------- HELPERS ----------

// retorna jogadores ativos respeitando a ordem atual da fila (db.fila)
function filaAtivos() {
  return db.fila
    .map((id) => db.jogadores.find((j) => j.id === id))
    .filter((j) => j && j.ativo);
}

// ordena uma lista de jogadores segundo as prioridades:
// 1) quem está de fora do último jogo (set jogandoIds) -> fora primeiro
// 2) menos jogos (asc)
// 3) ordemChegada (asc)
function ordenarPorPrioridade(jogadores, jogandoIds = []) {
  const jogandoSet = new Set(jogandoIds || []);
  return [...jogadores].sort((a, b) => {
    const aFora = !jogandoSet.has(a.id);
    const bFora = !jogandoSet.has(b.id);
    if (aFora !== bFora) return aFora ? -1 : 1; // fora vem antes
    if (a.jogos !== b.jogos) return a.jogos - b.jogos;
    return a.ordemChegada - b.ordemChegada;
  });
}

// clona um jogador (objeto) para usar em partidas (não estraga o objeto db)
function clonePlayer(j) {
  return {
    id: j.id,
    nome: j.nome,
    jogos: j.jogos,
    vitorias: j.vitorias,
    ativo: j.ativo,
    ordemChegada: j.ordemChegada,
  };
}

// busca jogador por id (referência ao objeto no db.jogadores)
function getJogadorById(id) {
  return db.jogadores.find((j) => j.id === id) || null;
}

// preserva ordem relativa: remove todos idsToMove da fila e re-appenda na mesma ordem original encontrada
function removeAndReappendPreservingOrder(idsToMove) {
  const setIds = new Set(idsToMove);
  const ordemOriginal = db.fila.filter((id) => setIds.has(id));
  db.fila = db.fila.filter((id) => !setIds.has(id));
  ordemOriginal.forEach((id) => db.fila.push(id));
}

// ---------- ROTAS ----------

// listar jogadores
app.get("/jogadores", (req, res) => {
  res.json(db.jogadores);
});

// adicionar jogador
app.post("/jogadores", (req, res) => {
  const { nome } = req.body;
  if (!nome) return res.status(400).json({ error: "Nome é obrigatório" });

  if (db.jogadores.some((j) => j.nome === nome)) {
    return res.status(400).json({ error: "Nome já cadastrado" });
  }

  const novo = {
    id: ++db.ultimoIdJogador,
    nome,
    jogos: 0,
    vitorias: 0,
    ativo: true,
    ordemChegada: db.ultimoIdJogador, // fixa a ordem de chegada
  };

  db.jogadores.push(novo);
  db.fila.push(novo.id);
  res.json(novo);
});

// atualizar ativo/inativo
app.post("/jogadores/:id/ativo", (req, res) => {
  const { id } = req.params;
  const { ativo } = req.body;
  const jogador = getJogadorById(Number(id));
  if (!jogador) return res.status(404).json({ error: "Jogador não encontrado" });
  jogador.ativo = !!ativo;
  // se desativou, removemos da fila; se ativou, colocamos no fim da fila
  if (!jogador.ativo) {
    db.fila = db.fila.filter((fid) => fid !== jogador.id);
  } else if (!db.fila.includes(jogador.id)) {
    db.fila.push(jogador.id);
  }
  res.json({ success: true, jogador });
});

// iniciar partida (monta os times conforme regras)
app.post("/partida", (req, res) => {
  const ativos = filaAtivos();
  if (ativos.length < 12) {
    return res.status(400).json({ message: "Não há jogadores ativos suficientes" });
  }

  let timeA = [];
  let timeB = [];

  if (db.partidas.length === 0) {
    // primeira partida: pega os 12 por prioridade (sem referência de jogando)
    const selecionados = ordenarPorPrioridade(ativos, []).slice(0, 12);
    timeA = selecionados.slice(0, 6).map(clonePlayer);
    timeB = selecionados.slice(6, 12).map(clonePlayer);
  } else {
    const ultima = db.partidas[db.partidas.length - 1];

    if (!ultima.vencedor) {
      return res.status(400).json({ message: "Finalize a última partida antes de iniciar uma nova." });
    }

    // ids dos que jogaram a última partida
    const jogandoIds = [
      ...ultima.timeA.map((p) => p.id),
      ...ultima.timeB.map((p) => p.id),
    ];

    // EMPATE: todos os 12 saem e voltam pro fim; na seleção priorizamos os de fora.
    if (ultima.vencedor === "E") {
      // zera controle de vitórias seguidas
      db.vitoriasConsecutivas = 0;
      db.ultimoVencedor = null;

      // remove e reapenda preservando ordem relativa
      removeAndReappendPreservingOrder(jogandoIds);

      // candidatos = só de fora (ativos e não nos jogandoIds), ordenados por prioridade (fora=true)
      let candidatosFora = filaAtivos().filter((j) => !jogandoIds.includes(j.id));
      candidatosFora = ordenarPorPrioridade(candidatosFora, jogandoIds);

      // se não houver 12 candidatosFora, completar com reaproveitados (ordenados por jogos->ordemChegada)
      let candidatos = candidatosFora.slice(0, 12);
      if (candidatos.length < 12) {
        const faltam = 12 - candidatos.length;
        let reaproveitados = filaAtivos().filter((j) => jogandoIds.includes(j.id));
        reaproveitados = ordenarPorPrioridade(reaproveitados, jogandoIds).slice(0, faltam);
        candidatos = candidatos.concat(reaproveitados);
      }

      timeA = candidatos.slice(0, 6).map(clonePlayer);
      timeB = candidatos.slice(6, 12).map(clonePlayer);
    }
    // 2 ou mais vitorias consecutivas -> troca todos (remove jogando e puxa próximos 12 por prioridade)
    else if (db.vitoriasConsecutivas >= 2) {
      // reset
      db.vitoriasConsecutivas = 0;
      db.ultimoVencedor = null;

      // remove e reapenda quem jogou (preservando ordem relativa)
      removeAndReappendPreservingOrder(jogandoIds);

      // agora pega os 12 primeiros por prioridade (sem referência de jogando)
      const selecionados = ordenarPorPrioridade(filaAtivos(), []).slice(0, 12);
      // se faltar (caso raro), completa com os próprios jogando ordenados por prioridade
      let candidatos = selecionados.slice(0, 12);
      if (candidatos.length < 12) {
        const faltam = 12 - candidatos.length;
        let reaproveitados = filaAtivos().filter((j) => jogandoIds.includes(j.id));
        reaproveitados = ordenarPorPrioridade(reaproveitados, []).slice(0, faltam);
        candidatos = candidatos.concat(reaproveitados);
      }

      timeA = candidatos.slice(0, 6).map(clonePlayer);
      timeB = candidatos.slice(6, 12).map(clonePlayer);
    }
    // regra normal: vencedor permanece como timeA (vencedores do último jogo), perdedores vão pro fim
    else {
      const vencedores = ultima.vencedor === "A" ? ultima.timeA : ultima.timeB;
      const perdedores = ultima.vencedor === "A" ? ultima.timeB : ultima.timeA;

      // enviar perdedores para o fim da fila preservando ordem
      const perdIds = perdedores.map((p) => p.id);
      removeAndReappendPreservingOrder(perdIds);

      // timeA = vencedores (clonados)
      timeA = vencedores.map((p) => clonePlayer(getJogadorById(p.id)));

      // timeB = próximos 6 da fila (ativos), ignorando vencedores, e aplicando prioridade global
      const usados = new Set(timeA.map((p) => p.id));
      let candidatos = filaAtivos().filter((j) => !usados.has(j.id));
      candidatos = ordenarPorPrioridade(candidatos, []); // nenhum jogando, tratamos todos como "fora"
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

// registrar resultado da última partida (ou do id passado)
app.post("/resultado", (req, res) => {
  const { id, vencedor } = req.body; // id da partida e vencedor: "A", "B" ou "E"
  if (typeof id === "undefined" || !["A", "B", "E"].includes(vencedor)) {
    return res.status(400).json({ error: "id e vencedor ('A'|'B'|'E') são obrigatórios" });
  }

  const partida = db.partidas.find((p) => p.id === Number(id));
  if (!partida) return res.status(404).json({ error: "Partida não encontrada" });
  if (partida.vencedor) return res.status(400).json({ error: "Resultado já registrado" });

  partida.vencedor = vencedor;

  // atualiza estatísticas
  const timeA_players = partida.timeA.map((p) => getJogadorById(p.id));
  const timeB_players = partida.timeB.map((p) => getJogadorById(p.id));

  // incrementar jogos para todos
  [...timeA_players, ...timeB_players].forEach((j) => {
    if (j) j.jogos++;
  });

  // incrementar vitorias para vencedores
  if (vencedor === "A") {
    timeA_players.forEach((j) => { if (j) j.vitorias++; });
  } else if (vencedor === "B") {
    timeB_players.forEach((j) => { if (j) j.vitorias++; });
  }

  // atualiza fila conforme regras:
  // - empate: os 12 já foram reapendados ao montar a próxima partida (mas aqui repetimos a lógica consistente)
  // - vitória: vencedores devem voltar antes dos perdedores na fila (preservando ordem relativa)
  if (vencedor === "E") {
    // quando for empate, já na montagem seguinte a lógica de /partida removeu/reappended.
    // Mas para garantir consistência (por caso usuário registrar resultado sem montar próxima), fazemos:
    const jogandoIds = [...partida.timeA.map(p=>p.id), ...partida.timeB.map(p=>p.id)];
    // garantir que estejam no fim preservando ordem
    removeAndReappendPreservingOrder(jogandoIds);
    db.vitoriasConsecutivas = 0;
    db.ultimoVencedor = null;
  } else {
    const vencedoresIds = vencedor === "A" ? timeA_players.map(j => j.id) : timeB_players.map(j => j.id);
    const perdedoresIds = vencedor === "A" ? timeB_players.map(j => j.id) : timeA_players.map(j => j.id);

    // remove vencedores/perdedores da fila (se estiverem) e reappend vencedores primeiro, depois perdedores, preservando ordem relativa
    const ordemVencedores = db.fila.filter(id => vencedoresIds.includes(id));
    const ordemPerdedores = db.fila.filter(id => perdedoresIds.includes(id));
    db.fila = db.fila.filter(id => !vencedoresIds.includes(id) && !perdedoresIds.includes(id));
    ordemVencedores.forEach(id => db.fila.push(id));
    ordemPerdedores.forEach(id => db.fila.push(id));

    // atualizar controle de vitórias consecutivas
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
app.get("/partidas", (req, res) => {
  res.json(db.partidas);
});

// listar fila
app.get("/fila", (req, res) => {
  res.json(db.fila);
});

// reset campeonato
app.post("/reset", (req, res) => {
  db.jogadores.forEach((j) => {
    j.jogos = 0;
    j.vitorias = 0;
    j.ativo = true;
  });

  db.partidas = [];
  db.fila = db.jogadores.filter((j) => j.ativo).map((j) => j.id);
  db.vitoriasConsecutivas = 0;
  db.ultimoVencedor = null;
  db.ultimoIdPartida = 0;

  res.json({ success: true });
});

// inicializa com 23 jogadores fixos (caso o DB esteja vazio)
if (db.jogadores.length === 0) {
  for (let i = 1; i <= 23; i++) {
    const novo = {
      id: ++db.ultimoIdJogador,
      nome: `${i}`,
      jogos: 0,
      vitorias: 0,
      ativo: true,
      ordemChegada: db.ultimoIdJogador,
    };
    db.jogadores.push(novo);
    db.fila.push(novo.id);
  }
}

const PORT = 4000;
app.listen(PORT, () => console.log(`Backend rodando na porta ${PORT}`));
