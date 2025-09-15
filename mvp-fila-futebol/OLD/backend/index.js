const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
app.use(cors());
app.use(bodyParser.json());

const PORT = 4000;

// "banco de dados" em memória
let db = {
  jogadores: [],
  partidas: [],
  fila: []
};

let partidaId = 1;

// rota para resetar tudo
app.post('/reset', (req, res) => {
  db = { jogadores: [], partidas: [], fila: [] };
  partidaId = 1;
  return res.json({ message: "Campeonato resetado" });
});

// adicionar jogador
app.post('/jogadores', (req, res) => {
  const { nome } = req.body;
  if (!nome) return res.status(400).json({ error: "Nome é obrigatório" });

  const jogador = { id: db.jogadores.length + 1, nome, jogos: 0, vitorias: 0 };
  db.jogadores.push(jogador);
  db.fila.push(jogador.id);

  return res.json(jogador);
});

// listar jogadores
app.get('/jogadores', (req, res) => {
  return res.json(db.jogadores);
});

// iniciar partida
app.post('/partida', (req, res) => {
  if (db.fila.length < 12 && db.partidas.length === 0) {
    return res.json({ message: "Jogadores insuficientes para iniciar a primeira partida (mínimo 12)." });
  }

  let timeA = [];
  let timeB = [];

  if (db.partidas.length === 0) {
    // primeira partida -> 12 primeiros
    const ids = db.fila.splice(0, 12);
    timeA = ids.slice(0, 6).map(id => db.jogadores.find(j => j.id === id));
    timeB = ids.slice(6).map(id => db.jogadores.find(j => j.id === id));
   } else {
  // próximas partidas
  const ultima = db.partidas[db.partidas.length - 1];
  if (!ultima.vencedor) {
    return res.json({ message: "Finalize a última partida antes de iniciar uma nova." });
  }

  // se houver 2 vitórias consecutivas do mesmo time -> renovar quadra
  if (db.vitoriasConsecutivas >= 2) {
    db.vitoriasConsecutivas = 0; // reset contador

    // pegar até 6 primeiros da fila
    let idsFila = db.fila.splice(0, 6);
    timeA = idsFila.map(id => db.jogadores.find(j => j.id === id)).filter(Boolean);

    // jogadores já escolhidos
    let usados = new Set(timeA.map(j => j.id));

    // completar com jogadores que jogaram menos, ignorando duplicados
    let restantes = db.jogadores
      .filter(j => !usados.has(j.id))
      .sort((a, b) => a.jogos - b.jogos);

    timeB = restantes.slice(0, 6);

  } else {
    // regra normal
    const vencedores = ultima.vencedor === "A" ? ultima.timeA : ultima.timeB;
    const perdedores = ultima.vencedor === "A" ? ultima.timeB : ultima.timeA;

    timeA = vencedores;

    // pegar 6 da fila
    let proximosIds = db.fila.splice(0, 6);
    timeB = proximosIds.map(id => db.jogadores.find(j => j.id === id));

    // garantir que não haja duplicados entre A e B
    let usados = new Set(timeA.map(j => j.id));
    timeB = timeB.filter(j => j && !usados.has(j.id));

    // se ainda faltar, completa com perdedores que não estão em nenhum time
    if (timeB.length < 6) {
      const faltam = 6 - timeB.length;
      const extras = perdedores.filter(j => !usados.has(j.id)).slice(0, faltam);
      timeB = timeB.concat(extras);
    }
  }
}



  // marcar jogos
  [...timeA, ...timeB].forEach(j => j.jogos++);

  const partida = {
    id: partidaId++,
    timeA,
    timeB,
    vencedor: null
  };
  db.partidas.push(partida);

  return res.json(partida);
});

// registrar resultado
app.post('/resultado', (req, res) => {
  const { id, vencedor } = req.body;
  const partida = db.partidas.find(p => p.id === Number(id));
  if (!partida) return res.status(404).json({ error: "Partida não encontrada" });

  partida.vencedor = vencedor;

  // atualizar vitórias
  if (vencedor === "A") partida.timeA.forEach(j => j.vitorias++);
  if (vencedor === "B") partida.timeB.forEach(j => j.vitorias++);

  // salvar times vencedores/perdedores
  const vencedores = vencedor === "A" ? partida.timeA : partida.timeB;
  const perdedores = vencedor === "A" ? partida.timeB : partida.timeA;

  // registrar vitórias consecutivas
  if (!partida.vitoriasSeguidas) partida.vitoriasSeguidas = {};
  partida.vitoriasSeguidas[vencedor] = (partida.vitoriasSeguidas[vencedor] || 0) + 1;

  // salvar essa info globalmente no db (para checar na próxima partida)
  db.ultimoVencedor = vencedor;
  db.vitoriasConsecutivas = (db.vitoriasConsecutivas || 0);
  if (db.ultimoVencedorAnterior === vencedor) {
    db.vitoriasConsecutivas++;
  } else {
    db.vitoriasConsecutivas = 1;
  }
  db.ultimoVencedorAnterior = vencedor;

  // quem perdeu vai para o final da fila
  perdedores.forEach(j => db.fila.push(j.id));

  return res.json(partida);
});


// listar partidas
app.get('/partidas', (req, res) => {
  return res.json(db.partidas);
});

app.listen(PORT, () => console.log(`✅ Backend rodando na porta ${PORT}`));
