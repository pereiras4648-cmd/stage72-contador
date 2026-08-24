const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get("/", (req, res) => {
  res.status(200).send(`
    <html>
      <head><title>STAGE 72</title></head>
      <body style="margin:0;background:#070707;color:#63ddff;font-family:Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;">
        <div style="text-align:center;">
          <h1>STAGE 72</h1>
          <p>Backend online.</p>
        </div>
      </body>
    </html>
  `);
});

app.get("/health", (req, res) => {
  res.json({ ok: true, service: "stage72-contador" });
});

// Callback de autorização da Nuvemshop
app.get("/auth/callback", (req, res) => {
  const code = req.query.code;

  if (!code) {
    return res.status(400).send("Código de autorização não recebido.");
  }

  res.status(200).send(`
    <html>
      <head><title>STAGE 72 - Autorizado</title></head>
      <body style="margin:0;background:#070707;color:#63ddff;font-family:Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;">
        <div style="text-align:center;">
          <h1>STAGE 72</h1>
          <p>Autorização recebida.</p>
          <p>Já podemos continuar a integração.</p>
        </div>
      </body>
    </html>
  `);
});

// Webhook de pedidos
app.post("/webhooks/orders", (req, res) => {
  console.log("Webhook de pedido recebido:");
  console.log(JSON.stringify(req.body, null, 2));
  res.sendStatus(200);
});

// Webhooks LGPD
app.post("/webhooks/lgpd/store-redact", (req, res) => {
  console.log("LGPD store redact:");
  console.log(JSON.stringify(req.body, null, 2));
  res.sendStatus(200);
});

app.post("/webhooks/lgpd/customers-redact", (req, res) => {
  console.log("LGPD customers redact:");
  console.log(JSON.stringify(req.body, null, 2));
  res.sendStatus(200);
});

app.post("/webhooks/lgpd/customers-data-request", (req, res) => {
  console.log("LGPD customers data request:");
  console.log(JSON.stringify(req.body, null, 2));
  res.sendStatus(200);
});

// Estado temporário do lote para teste
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

app.listen(PORT, "0.0.0.0", () => {
  console.log(`STAGE 72 rodando na porta ${PORT}`);
});
