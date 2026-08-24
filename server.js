const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

/*
|--------------------------------------------------------------------------
| STAGE 72
|--------------------------------------------------------------------------
| Backend inicial para integração com a Nuvemshop
|--------------------------------------------------------------------------
*/

app.get("/", (req, res) => {
  res.status(200).send(`
    <html>
      <head>
        <title>STAGE 72</title>
      </head>
      <body style="
        margin:0;
        background:#070707;
        color:#63ddff;
        font-family:Arial,sans-serif;
        display:flex;
        align-items:center;
        justify-content:center;
        min-height:100vh;
      ">
        <div style="text-align:center;">
          <h1>STAGE 72</h1>
          <p>Backend online.</p>
        </div>
      </body>
    </html>
  `);
});

/*
|--------------------------------------------------------------------------
| Health check
|--------------------------------------------------------------------------
*/

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "stage72-contador"
  });
});

/*
|--------------------------------------------------------------------------
| OAuth callback da Nuvemshop
|--------------------------------------------------------------------------
| Por enquanto só confirmamos que a rota existe.
| Depois vamos trocar o "code" recebido por um access_token.
|--------------------------------------------------------------------------
*/

app.get("/auth/callback", (req, res) => {
  const code = req.query.code;

  if (!code) {
    return res.status(400).send("Código de autorização não recebido.");
  }

  res.status(200).send(`
    <html>
      <head>
        <title>STAGE 72 - Autorizado</title>
      </head>
      <body style="
        margin:0;
        background:#070707;
        color:#63ddff;
        font-family:Arial,sans-serif;
        display:flex;
        align-items:center;
        justify-content:center;
        min-height:100vh;
      ">
        <div style="text-align:center;">
          <h1>STAGE 72</h1>
          <p>Autorização recebida.</p>
          <p>Já podemos continuar a integração.</p>
        </div>
      </body>
    </html>
  `);
});

/*
|--------------------------------------------------------------------------
| Webhook de pedidos
|--------------------------------------------------------------------------
| Essa rota vai receber eventos da Nuvemshop.
| Depois vamos validar o pedido e atualizar o lote.
|--------------------------------------------------------------------------
*/

app.post("/webhooks/orders", (req, res) => {
  console.log("Webhook recebido:");
  console.log(JSON.stringify(req.body, null, 2));

  res.sendStatus(200);
});

/*
|--------------------------------------------------------------------------
| Estado temporário do lote
|--------------------------------------------------------------------------
| É só para testar o frontend.
| Depois isso vai para banco de dados.
|--------------------------------------------------------------------------
*/

let lote = {
  current: 7,
  target: 10
};

app.get("/api/lote", (req, res) => {
  const remaining = Math.max(lote.target - lote.current, 0);

  res.json({
    current: lote.current,
    target: lote.target,
    remaining,
    percentage: Math.min(
      Math.round((lote.current / lote.target) * 100),
      100
    ),
    closed: lote.current >= lote.target
  });
});

/*
|--------------------------------------------------------------------------
| Iniciar servidor
|--------------------------------------------------------------------------
*/

app.listen(PORT, "0.0.0.0", () => {
  console.log(`STAGE 72 rodando na porta ${PORT}`);
});