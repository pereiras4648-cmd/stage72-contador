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
| HEALTH CHECK
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
| OAUTH NUVEMSHOP
|--------------------------------------------------------------------------
*/

app.get("/auth/callback", async (req, res) => {
  const code = req.query.code;

  console.log("Callback OAuth recebido.");

  /*
  |--------------------------------------------------------------------------
  | VERIFICA ERRO RECEBIDO NO CALLBACK
  |--------------------------------------------------------------------------
  */

  if (req.query.error) {
    console.error(
      "Erro recebido no callback:",
      req.query.error
    );

    console.error(
      "Descrição do callback:",
      req.query.error_description || "sem descrição"
    );

    return res.status(400).send(`
      <html>
        <body style="
          margin:0;
          background:#070707;
          color:#ff6666;
          font-family:Arial,sans-serif;
          display:flex;
          align-items:center;
          justify-content:center;
          min-height:100vh;
        ">
          <div style="text-align:center;">
            <h1>STAGE 72</h1>
            <h2>ERRO DE AUTORIZAÇÃO</h2>
            <p>A Nuvemshop não autorizou a conexão.</p>
          </div>
        </body>
      </html>
    `);
  }

  /*
  |--------------------------------------------------------------------------
  | VERIFICA CODE
  |--------------------------------------------------------------------------
  */

  if (!code) {
    console.error(
      "Código de autorização não recebido."
    );

    return res.status(400).send(`
      <html>
        <body style="
          margin:0;
          background:#070707;
          color:#ff6666;
          font-family:Arial,sans-serif;
          display:flex;
          align-items:center;
          justify-content:center;
          min-height:100vh;
        ">
          <div style="text-align:center;">
            <h1>STAGE 72</h1>
            <p>Código de autorização não recebido.</p>
          </div>
        </body>
      </html>
    `);
  }

  /*
  |--------------------------------------------------------------------------
  | VERIFICA CREDENCIAIS
  |--------------------------------------------------------------------------
  */

  if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error(
      "Credenciais da Nuvemshop não configuradas."
    );

    console.error(
      "Client ID configurado:",
      Boolean(CLIENT_ID)
    );

    console.error(
      "Client Secret configurado:",
      Boolean(CLIENT_SECRET)
    );

    return res.status(500).send(`
      <html>
        <body style="
          margin:0;
          background:#070707;
          color:#ff6666;
          font-family:Arial,sans-serif;
          display:flex;
          align-items:center;
          justify-content:center;
          min-height:100vh;
        ">
          <div style="text-align:center;">
            <h1>STAGE 72</h1>
            <p>Credenciais da integração não configuradas.</p>
          </div>
        </body>
      </html>
    `);
  }

  try {
    console.log("Código OAuth recebido.");
    console.log("Solicitando access token...");

    /*
    |--------------------------------------------------------------------------
    | TROCA CODE POR ACCESS TOKEN
    |--------------------------------------------------------------------------
    */

    const response = await fetch(
      "https://www.tiendanube.com/apps/authorize/token",
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

    /*
    |--------------------------------------------------------------------------
    | LÊ RESPOSTA
    |--------------------------------------------------------------------------
    */

    let data;

    try {
      data = await response.json();
    } catch (jsonError) {
      console.error(
        "Resposta OAuth não pôde ser interpretada como JSON."
      );

      console.error(
        "Status HTTP:",
        response.status
      );

      return res.status(500).send(`
        <html>
          <body style="
            margin:0;
            background:#070707;
            color:#ff6666;
            font-family:Arial,sans-serif;
            display:flex;
            align-items:center;
            justify-content:center;
            min-height:100vh;
          ">
            <div style="text-align:center;">
              <h1>STAGE 72</h1>
              <p>Resposta inválida da Nuvemshop.</p>
            </div>
          </body>
        </html>
      `);
    }

    /*
    |--------------------------------------------------------------------------
    | DIAGNÓSTICO SEGURO
    |--------------------------------------------------------------------------
    |
    | Mostra somente os NOMES dos campos.
    | Não mostra o access_token.
    |
    */

    console.log(
      "Status HTTP OAuth:",
      response.status
    );

    console.log(
      "Campos retornados pela Nuvemshop:",
      Object.keys(data)
    );

    /*
    |--------------------------------------------------------------------------
    | TRATA ERRO OAUTH
    |--------------------------------------------------------------------------
    |
    | IMPORTANTE:
    | Também verificamos data.error.
    |
    */

    if (!response.ok || data.error) {
      console.error(
        "Erro OAuth:",
        data.error || "erro_sem_nome"
      );

      console.error(
        "Descrição OAuth:",
        data.error_description || "sem descrição"
      );

      return res.status(500).send(`
        <html>
          <head>
            <title>STAGE 72 - Erro OAuth</title>
          </head>

          <body style="
            margin:0;
            background:#070707;
            color:#ff6666;
            font-family:Arial,sans-serif;
            display:flex;
            align-items:center;
            justify-content:center;
            min-height:100vh;
          ">
            <div style="text-align:center;">
              <h1>STAGE 72</h1>

              <h2>FALHA NA AUTORIZAÇÃO</h2>

              <p>
                A Nuvemshop retornou um erro durante
                a conexão.
              </p>

              <p>
                Consulte os logs do servidor.
              </p>
            </div>
          </body>
        </html>
      `);
    }

    /*
    |--------------------------------------------------------------------------
    | VALIDA ACCESS TOKEN
    |--------------------------------------------------------------------------
    */

    if (!data.access_token) {
      console.error(
        "A resposta não contém access_token."
      );

      return res.status(500).send(`
        <html>
          <body style="
            margin:0;
            background:#070707;
            color:#ff6666;
            font-family:Arial,sans-serif;
            display:flex;
            align-items:center;
            justify-content:center;
            min-height:100vh;
          ">
            <div style="text-align:center;">
              <h1>STAGE 72</h1>
              <p>Access token não recebido.</p>
            </div>
          </body>
        </html>
      `);
    }

    /*
    |--------------------------------------------------------------------------
    | IDENTIFICA A LOJA
    |--------------------------------------------------------------------------
    */

    const storeId =
      data.user_id ??
      data.store_id ??
      data.storeId ??
      null;

    if (!storeId) {
      console.warn(
        "Access token recebido, mas Store ID não foi retornado."
      );
    } else {
      console.log(
        "Store ID:",
        storeId
      );
    }

    /*
    |--------------------------------------------------------------------------
    | CONEXÃO AUTORIZADA
    |--------------------------------------------------------------------------
    */

    console.log(
      "Nuvemshop conectada com sucesso."
    );

    /*
    |--------------------------------------------------------------------------
    | ARMAZENAMENTO TEMPORÁRIO
    |--------------------------------------------------------------------------
    |
    | O token ainda fica em memória.
    | Depois vamos persistir no PostgreSQL.
    |
    */

    app.locals.nuvemshop = {
      storeId: storeId,
      accessToken: data.access_token
    };

    /*
    |--------------------------------------------------------------------------
    | TELA DE SUCESSO
    |--------------------------------------------------------------------------
    */

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
              A integração com a Nuvemshop foi
              autorizada com sucesso.
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
      "Erro interno durante OAuth:",
      error.message
    );

    return res.status(500).send(`
      <html>
        <body style="
          margin:0;
          background:#070707;
          color:#ff6666;
          font-family:Arial,sans-serif;
          display:flex;
          align-items:center;
          justify-content:center;
          min-height:100vh;
        ">
          <div style="text-align:center;">
            <h1>STAGE 72</h1>
            <p>Erro interno ao conectar com a Nuvemshop.</p>
          </div>
        </body>
      </html>
    `);
  }
});

/*
|--------------------------------------------------------------------------
| WEBHOOK DE PEDIDOS
|--------------------------------------------------------------------------
*/

app.post(
  "/webhooks/orders",
  (req, res) => {
    console.log(
      "Webhook de pedido recebido."
    );

    console.log(
      JSON.stringify(
        req.body,
        null,
        2
      )
    );

    res.sendStatus(200);
  }
);

/*
|--------------------------------------------------------------------------
| LGPD - STORE REDACT
|--------------------------------------------------------------------------
*/

app.post(
  "/webhooks/lgpd/store-redact",
  (req, res) => {
    console.log(
      "LGPD store redact recebido."
    );

    res.sendStatus(200);
  }
);

/*
|--------------------------------------------------------------------------
| LGPD - CUSTOMERS REDACT
|--------------------------------------------------------------------------
*/

app.post(
  "/webhooks/lgpd/customers-redact",
  (req, res) => {
    console.log(
      "LGPD customers redact recebido."
    );

    res.sendStatus(200);
  }
);

/*
|--------------------------------------------------------------------------
| LGPD - CUSTOMERS DATA REQUEST
|--------------------------------------------------------------------------
*/

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
| LOTE STAGE 72
|--------------------------------------------------------------------------
|
| Temporário para testes.
|
*/

let lote = {
  current: 7,
  target: 10
};

app.get(
  "/api/lote",
  (req, res) => {
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
  }
);

/*
|--------------------------------------------------------------------------
| STATUS
|--------------------------------------------------------------------------
*/

app.get(
  "/api/status",
  (req, res) => {
    const connection =
      app.locals.nuvemshop;

    res.json({
      ok: true,

      nuvemshopConnected: Boolean(
        connection?.accessToken
      ),

      storeId:
        connection?.storeId ??
        null
    });
  }
);

/*
|--------------------------------------------------------------------------
| SERVIDOR
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
