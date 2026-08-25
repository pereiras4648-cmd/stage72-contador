const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

const CLIENT_ID = process.env.NUVEMSHOP_CLIENT_ID;
const CLIENT_SECRET = process.env.NUVEMSHOP_CLIENT_SECRET;

/*
|--------------------------------------------------------------------------
| STAGE 72
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
| OAuth Nuvemshop
|--------------------------------------------------------------------------
*/

app.get("/auth/callback", async (req, res) => {
  const code = req.query.code;

  if (!code) {
    return res.status(400).send(
      "Código de autorização não recebido."
    );
  }

  if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error(
      "Credenciais da Nuvemshop não configuradas."
    );

    return res.status(500).send(
      "Credenciais da integração não configuradas."
    );
  }

  try {
    console.log("Código OAuth recebido.");

    const response = await fetch(
      "https://www.nuvemshop.com.br/apps/authorize/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          grant_type: "authorization_code",
          code: code
        })
      }
    );

    const data = await response.json();

   if (!response.ok) {
  console.error("Erro OAuth:", data.error);
  console.error("Descrição OAuth:", data.error_description);

  return res.status(500).send(`
    <html>
      <body style="
        background:#070707;
        color:#ff6666;
        font-family:Arial,sans-serif;
        text-align:center;
        padding-top:100px;
      ">
        <h1>STAGE 72</h1>
        <p>Não foi possível concluir a autorização.</p>
      </body>
    </html>
  `);
}

/*
|--------------------------------------------------------------------------
| Diagnóstico seguro
|--------------------------------------------------------------------------
*/

console.log(
  "Campos retornados pela Nuvemshop:",
  Object.keys(data)
);
    /*
    |--------------------------------------------------------------------------
    | Diagnóstico seguro
    |--------------------------------------------------------------------------
    | Mostra apenas os NOMES dos campos retornados.
    | Não mostra o access_token.
    |--------------------------------------------------------------------------
    */

    console.log(
      "Campos retornados pela Nuvemshop:",
      Object.keys(data)
    );

    /*
    |--------------------------------------------------------------------------
    | Identificação da loja
    |--------------------------------------------------------------------------
    | Tentamos os formatos possíveis sem assumir apenas user_id.
    |--------------------------------------------------------------------------
    */

    const storeId =
      data.user_id ??
      data.store_id ??
      data.storeId ??
      data.id ??
      null;

    console.log("Nuvemshop conectada com sucesso.");
    console.log("Store ID identificado:", storeId);

    /*
    |--------------------------------------------------------------------------
    | Temporário
    |--------------------------------------------------------------------------
    | Por enquanto mantemos a conexão em memória.
    | Depois isso será persistido no PostgreSQL.
    |--------------------------------------------------------------------------
    */

    app.locals.nuvemshop = {
      storeId: storeId,
      accessToken: data.access_token
    };

    return res.status(200).send(`
      <html>
        <head>
          <title>STAGE 72 - Conectado</title>
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

            <h2>LOJA CONECTADA</h2>

            <p>
              A integração com a Nuvemshop foi autorizada.
            </p>

            <p>
              Já podemos automatizar o lote.
            </p>
          </div>
        </body>
      </html>
    `);

  } catch (error) {
    console.error(
      "Erro no OAuth:",
      error.message
    );

    return res.status(500).send(
      "Erro interno ao conectar com a Nuvemshop."
    );
  }
});

/*
|--------------------------------------------------------------------------
| Webhook de pedidos
|--------------------------------------------------------------------------
*/

app.post("/webhooks/orders", (req, res) => {
  console.log("Webhook de pedido recebido.");

  console.log(
    JSON.stringify(req.body, null, 2)
  );

  res.sendStatus(200);
});

/*
|--------------------------------------------------------------------------
| LGPD
|--------------------------------------------------------------------------
*/

app.post(
  "/webhooks/lgpd/store-redact",
  (req, res) => {
    console.log("LGPD store redact recebido.");

    res.sendStatus(200);
  }
);

app.post(
  "/webhooks/lgpd/customers-redact",
  (req, res) => {
    console.log(
      "LGPD customers redact recebido."
    );

    res.sendStatus(200);
  }
);

app.post(
  "/webhooks/lgpd/customers-data-request",
  (req, res) => {
    console.log(
      "LGPD customers data request recebido."
    );

    res.sendStatus(200);
  }
);

/*
|--------------------------------------------------------------------------
| Lote STAGE 72
|--------------------------------------------------------------------------
| Temporário para testes.
|--------------------------------------------------------------------------
*/

let lote = {
  current: 7,
  target: 10
};

app.get("/api/lote", (req, res) => {
  const remaining = Math.max(
    lote.target - lote.current,
    0
  );

  const percentage = Math.min(
    Math.round(
      (lote.current / lote.target) * 100
    ),
    100
  );

  res.json({
    current: lote.current,
    target: lote.target,
    remaining: remaining,
    percentage: percentage,
    closed: lote.current >= lote.target
  });
});

/*
|--------------------------------------------------------------------------
| Diagnóstico da conexão
|--------------------------------------------------------------------------
*/

app.get("/api/status", (req, res) => {
  const connection = app.locals.nuvemshop;

  res.json({
    ok: true,
    nuvemshopConnected: Boolean(
      connection?.accessToken
    ),
    storeId: connection?.storeId ?? null
  });
});

/*
|--------------------------------------------------------------------------
| Servidor
|--------------------------------------------------------------------------
*/

app.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `STAGE 72 rodando na porta ${PORT}`
    );
  }
);
